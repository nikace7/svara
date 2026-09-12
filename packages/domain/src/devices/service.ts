import { randomUUID } from 'node:crypto';
import {
  DEVICE_LIMITS,
  deviceCreateSchema,
  deviceListSchema,
  deviceRevisionSchema,
  deviceSaveSchema,
  resourceIdSchema,
} from '@svara/contracts';
import type { DevicePage, DeviceSummary, PairingChallenge } from '@svara/contracts';
import type { IdentityService } from '../identity/service.js';
import { DeviceError } from './errors.js';
import {
  checkPepper,
  deviceInclude,
  hashSecret,
  loadDevice,
  lockDevice,
  mutation,
  pairingCode,
  parse,
  requireRevision,
  revokeAccess,
  summary,
} from './core.js';

export class DeviceService {
  constructor(
    private readonly identity: IdentityService,
    private readonly pepper: string,
    private readonly clock: () => Date = () => new Date(),
  ) {
    checkPepper(pepper);
  }

  async create(token: string, value: unknown): Promise<DeviceSummary> {
    const data = parse(deviceCreateSchema, value);
    return this.identity.asStaff(token, 'operate_devices', async (tx, { member }) => {
      const now = this.clock();
      const device = await tx.device.create({
        data: { ...data, organisationId: member.organisationId, createdAt: now, updatedAt: now },
        include: deviceInclude,
      });
      await tx.auditEntry.create({
        data: {
          organisationId: member.organisationId,
          actorMembershipId: member.id,
          action: 'device.created',
          targetId: device.id,
        },
      });
      return summary(device, now);
    });
  }

  async get(token: string, id: string): Promise<DeviceSummary> {
    parse(resourceIdSchema, id);
    return this.identity.asStaff(
      token,
      'inspect',
      async (tx, { member }) =>
        summary(await loadDevice(tx, id, member.organisationId), this.clock()),
      false,
    );
  }

  async list(token: string, value: unknown): Promise<DevicePage> {
    const query = parse(deviceListSchema, value);
    return this.identity.asStaff(
      token,
      'inspect',
      async (tx, { member }) => {
        const rows = await tx.device.findMany({
          where: {
            organisationId: member.organisationId,
            ...(query.cursor ? { id: { gt: query.cursor } } : {}),
            ...(query.search ? { name: { contains: query.search, mode: 'insensitive' } } : {}),
          },
          orderBy: { id: 'asc' },
          take: query.limit + 1,
          include: deviceInclude,
        });
        const items = rows.slice(0, query.limit).map((row) => summary(row, this.clock()));
        return { items, nextCursor: rows.length > query.limit ? items.at(-1)!.id : null };
      },
      false,
    );
  }

  async save(token: string, id: string, value: unknown): Promise<DeviceSummary> {
    parse(resourceIdSchema, id);
    const { expectedRevision, ...data } = mutation(deviceSaveSchema, value);
    return this.identity.asStaff(token, 'operate_devices', async (tx, { member }) => {
      await lockDevice(tx, id, member.organisationId);
      const device = await loadDevice(tx, id, member.organisationId);
      requireRevision(device.revision, expectedRevision);
      const now = this.clock();
      if (!data.enabled) await revokeAccess(tx, id, member.organisationId, now);
      const updated = await tx.device.update({
        where: { id },
        data: { ...data, revision: { increment: 1 }, updatedAt: now },
        include: deviceInclude,
      });
      await tx.auditEntry.create({
        data: {
          organisationId: member.organisationId,
          actorMembershipId: member.id,
          action: 'device.updated',
          targetId: id,
        },
      });
      return summary(updated, now);
    });
  }

  async createPairing(token: string, id: string, value: unknown): Promise<PairingChallenge> {
    parse(resourceIdSchema, id);
    const { expectedRevision } = mutation(deviceRevisionSchema, value);
    return this.identity.asStaff(token, 'operate_devices', async (tx, { member }) => {
      await lockDevice(tx, id, member.organisationId);
      const device = await loadDevice(tx, id, member.organisationId);
      requireRevision(device.revision, expectedRevision);
      if (!device.enabled) throw new DeviceError('DEVICE_DISABLED');
      const now = this.clock();
      await revokeAccess(tx, id, member.organisationId, now);
      const challengeId = randomUUID();
      const code = pairingCode();
      const expiresAt = new Date(now.getTime() + DEVICE_LIMITS.pairingMilliseconds);
      await tx.pairingChallenge.create({
        data: {
          id: challengeId,
          deviceId: id,
          organisationId: member.organisationId,
          issuerMembershipId: member.id,
          codeHash: hashSecret('pairing', `${challengeId}\0${code}`, this.pepper),
          createdAt: now,
          expiresAt,
        },
      });
      await tx.device.update({
        where: { id },
        data: { revision: { increment: 1 }, updatedAt: now },
      });
      await tx.auditEntry.create({
        data: {
          organisationId: member.organisationId,
          actorMembershipId: member.id,
          action: 'device.pairing.created',
          targetId: id,
        },
      });
      return {
        id: challengeId,
        deviceId: id,
        code,
        expiresAt: expiresAt.toISOString(),
        revision: device.revision + 1,
      };
    });
  }

  async revoke(token: string, id: string, value: unknown): Promise<DeviceSummary> {
    parse(resourceIdSchema, id);
    const { expectedRevision } = mutation(deviceRevisionSchema, value);
    return this.identity.asStaff(token, 'operate_devices', async (tx, { member }) => {
      await lockDevice(tx, id, member.organisationId);
      const device = await loadDevice(tx, id, member.organisationId);
      requireRevision(device.revision, expectedRevision);
      const now = this.clock();
      await revokeAccess(tx, id, member.organisationId, now);
      const updated = await tx.device.update({
        where: { id },
        data: { revision: { increment: 1 }, updatedAt: now },
        include: deviceInclude,
      });
      await tx.auditEntry.create({
        data: {
          organisationId: member.organisationId,
          actorMembershipId: member.id,
          action: 'device.revoked',
          targetId: id,
        },
      });
      return summary(updated, now);
    });
  }
}
