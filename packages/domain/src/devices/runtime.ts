import type { PrismaClient, Prisma } from '@svara/database';
import {
  DEVICE_LIMITS,
  devicePairSchema,
  deviceTicketSchema,
  resourceIdSchema,
} from '@svara/contracts';
import type { DeviceRole, DeviceSummary } from '@svara/contracts';
import { createToken } from '../identity/security.js';
import { DeviceError } from './errors.js';
import type { DeviceErrorCode } from './errors.js';
import {
  bearerPattern,
  checkPepper,
  hashSecret,
  loadDevice,
  lockDevice,
  parse,
  secretMatches,
  summary,
} from './core.js';
import type { Transaction } from './core.js';

export interface RuntimeActor {
  id: string;
  credentialId: string;
  deviceId: string;
  organisationId: string;
  role: DeviceRole;
  namespace: '/devices';
  maintenanceMode: boolean;
  expiresAt: Date;
}
export interface IssuedDeviceCredential {
  token: string;
  device: DeviceSummary;
}
type Outcome<T> = { data: T } | { error: DeviceErrorCode };
function unwrap<T>(outcome: Outcome<T>): T {
  if ('error' in outcome) throw new DeviceError(outcome.error);
  return outcome.data;
}

/** Database authority used by the HTTP/ticket and socket boundaries, never a browser credential API. */
export class DeviceRuntime {
  constructor(
    private readonly db: PrismaClient,
    private readonly pepper: string,
    private readonly clock: () => Date = () => new Date(),
  ) {
    checkPepper(pepper);
  }

  private transaction<T>(run: (tx: Transaction) => Promise<T>): Promise<T> {
    return this.db.$transaction(run, {
      isolationLevel: 'ReadCommitted',
      maxWait: 5000,
      timeout: 10000,
    });
  }

  async pair(value: unknown): Promise<IssuedDeviceCredential> {
    const input = parse(devicePairSchema, value);
    // Failed valid-code attempts must commit before the public error is thrown.
    const result = await this.transaction<Outcome<IssuedDeviceCredential>>(async (tx) => {
      const candidate = await tx.pairingChallenge.findUnique({ where: { id: input.challengeId } });
      if (!candidate) return { error: 'INVALID_PAIRING' };
      await lockDevice(tx, candidate.deviceId, candidate.organisationId);
      const challenge = await tx.pairingChallenge.findUnique({
        where: { id: candidate.id },
        include: { device: true },
      });
      const now = this.clock();
      if (
        !challenge ||
        !challenge.device.enabled ||
        challenge.revokedAt ||
        challenge.redeemedAt ||
        challenge.createdAt > now ||
        challenge.expiresAt <= now ||
        challenge.attempts >= DEVICE_LIMITS.pairingAttempts
      )
        return { error: 'INVALID_PAIRING' };
      if (
        !secretMatches(
          challenge.codeHash,
          hashSecret('pairing', `${challenge.id}\0${input.code}`, this.pepper),
        )
      ) {
        await tx.pairingChallenge.update({
          where: { id: challenge.id },
          data: { attempts: { increment: 1 } },
        });
        return { error: 'INVALID_PAIRING' };
      }
      const token = createToken();
      await tx.pairingChallenge.update({ where: { id: challenge.id }, data: { redeemedAt: now } });
      await tx.deviceCredential.create({
        data: {
          deviceId: challenge.deviceId,
          organisationId: challenge.organisationId,
          challengeId: challenge.id,
          tokenHash: hashSecret('device-credential', token, this.pepper),
          createdAt: now,
        },
      });
      await tx.auditEntry.create({
        data: {
          organisationId: challenge.organisationId,
          actorKind: 'SYSTEM',
          action: 'device.paired',
          targetId: challenge.deviceId,
        },
      });
      return {
        data: {
          token,
          device: summary(await loadDevice(tx, challenge.deviceId, challenge.organisationId), now),
        },
      };
    });
    return unwrap(result);
  }

  private async credential(
    tx: Transaction,
    token: string,
  ): Promise<Prisma.DeviceCredentialGetPayload<{ include: { device: true } }>> {
    if (!bearerPattern.test(token)) throw new DeviceError('DEVICE_UNAUTHENTICATED');
    const tokenHash = hashSecret('device-credential', token, this.pepper);
    const candidate = await tx.deviceCredential.findUnique({ where: { tokenHash } });
    if (!candidate) throw new DeviceError('DEVICE_UNAUTHENTICATED');
    await lockDevice(tx, candidate.deviceId, candidate.organisationId);
    const credential = await tx.deviceCredential.findUnique({
      where: { tokenHash },
      include: { device: true },
    });
    const now = this.clock();
    if (
      !credential ||
      credential.revokedAt ||
      !credential.device.enabled ||
      credential.createdAt > now ||
      (credential.lastUsedAt && credential.lastUsedAt > now)
    )
      throw new DeviceError('DEVICE_UNAUTHENTICATED');
    await tx.deviceCredential.update({ where: { id: credential.id }, data: { lastUsedAt: now } });
    return credential;
  }

  async identity(token: string): Promise<DeviceSummary> {
    return this.transaction(async (tx) => {
      const credential = await this.credential(tx, token);
      return summary(
        await loadDevice(tx, credential.deviceId, credential.organisationId),
        this.clock(),
      );
    });
  }

  async issueTicket(token: string, value: unknown): Promise<{ ticket: string; expiresAt: string }> {
    const input = parse(deviceTicketSchema, value);
    return this.transaction(async (tx) => {
      const credential = await this.credential(tx, token);
      const now = this.clock();
      const pending = await tx.deviceTicket.count({
        where: {
          credentialId: credential.id,
          role: input.role,
          consumedAt: null,
          revokedAt: null,
          expiresAt: { gt: now },
        },
      });
      if (pending >= DEVICE_LIMITS.pendingTicketsPerRole) throw new DeviceError('TICKET_LIMIT');
      const ticket = createToken();
      const expiresAt = new Date(now.getTime() + DEVICE_LIMITS.ticketMilliseconds);
      await tx.deviceTicket.create({
        data: {
          credentialId: credential.id,
          deviceId: credential.deviceId,
          organisationId: credential.organisationId,
          tokenHash: hashSecret('device-ticket', ticket, this.pepper),
          ...input,
          createdAt: now,
          expiresAt,
        },
      });
      return { ticket, expiresAt: expiresAt.toISOString() };
    });
  }

  async redeemTicket(ticket: string, value: unknown): Promise<RuntimeActor> {
    const scope = parse(deviceTicketSchema, value);
    if (!bearerPattern.test(ticket)) throw new DeviceError('INVALID_TICKET');
    const tokenHash = hashSecret('device-ticket', ticket, this.pepper);
    const result = await this.transaction<Outcome<RuntimeActor>>(async (tx) => {
      const candidate = await tx.deviceTicket.findUnique({ where: { tokenHash } });
      if (!candidate) return { error: 'INVALID_TICKET' };
      await lockDevice(tx, candidate.deviceId, candidate.organisationId);
      const saved = await tx.deviceTicket.findUnique({
        where: { tokenHash },
        include: { credential: { include: { device: true } } },
      });
      const now = this.clock();
      if (
        !saved ||
        saved.role !== scope.role ||
        saved.namespace !== scope.namespace ||
        saved.consumedAt ||
        saved.revokedAt ||
        saved.createdAt > now ||
        saved.expiresAt <= now ||
        saved.credential.revokedAt ||
        !saved.credential.device.enabled
      )
        return { error: 'INVALID_TICKET' };
      await tx.deviceTicket.update({ where: { id: saved.id }, data: { consumedAt: now } });
      // Retire expired rows before enforcing the database's single-primary constraint.
      await tx.deviceGrant.updateMany({
        where: {
          deviceId: saved.deviceId,
          organisationId: saved.organisationId,
          revokedAt: null,
          expiresAt: { lte: now },
        },
        data: { revokedAt: now },
      });
      const active = await tx.deviceGrant.count({
        where: {
          deviceId: saved.deviceId,
          organisationId: saved.organisationId,
          role: saved.role,
          revokedAt: null,
        },
      });
      if (saved.role === 'PRIMARY' && active > 0) return { error: 'PRIMARY_CONFLICT' };
      if (saved.role === 'DISPLAY' && active >= DEVICE_LIMITS.displayConnections)
        return { error: 'CONNECTION_LIMIT' };
      const grant = await tx.deviceGrant.create({
        data: {
          ticketId: saved.id,
          credentialId: saved.credentialId,
          deviceId: saved.deviceId,
          organisationId: saved.organisationId,
          role: saved.role,
          namespace: saved.namespace,
          createdAt: now,
          lastSeenAt: now,
          expiresAt: new Date(now.getTime() + DEVICE_LIMITS.leaseMilliseconds),
        },
      });
      return { data: this.actor(grant, saved.credential.device.maintenanceMode) };
    });
    return unwrap(result);
  }

  private actor(
    grant: Prisma.DeviceGrantGetPayload<object>,
    maintenanceMode: boolean,
  ): RuntimeActor {
    return {
      id: grant.id,
      credentialId: grant.credentialId,
      deviceId: grant.deviceId,
      organisationId: grant.organisationId,
      role: grant.role,
      namespace: '/devices',
      maintenanceMode,
      expiresAt: grant.expiresAt,
    };
  }

  private async currentGrant(tx: Transaction, id: string): Promise<RuntimeActor> {
    const candidate = await tx.deviceGrant.findUnique({ where: { id } });
    if (!candidate) throw new DeviceError('GRANT_EXPIRED');
    await lockDevice(tx, candidate.deviceId, candidate.organisationId);
    const grant = await tx.deviceGrant.findUnique({
      where: { id },
      include: { device: true, ticket: { include: { credential: true } } },
    });
    const now = this.clock();
    if (
      !grant ||
      grant.revokedAt ||
      grant.expiresAt <= now ||
      grant.createdAt > now ||
      grant.lastSeenAt > now ||
      !grant.device.enabled ||
      grant.ticket.revokedAt ||
      !grant.ticket.consumedAt ||
      grant.ticket.credential.revokedAt
    )
      throw new DeviceError('GRANT_EXPIRED');
    return this.actor(grant, grant.device.maintenanceMode);
  }

  /** The server supplies its connection's grant ID. Never accept a client-supplied grant ID. */
  async asGrant<T>(
    id: string,
    role: DeviceRole,
    run: (tx: Transaction, actor: RuntimeActor) => Promise<T>,
  ): Promise<T> {
    parse(resourceIdSchema, id);
    return this.transaction(async (tx) => {
      const actor = await this.currentGrant(tx, id);
      if (actor.role !== role) throw new DeviceError('DISPLAY_READ_ONLY');
      return run(tx, actor);
    });
  }

  async heartbeat(id: string): Promise<RuntimeActor> {
    parse(resourceIdSchema, id);
    return this.transaction(async (tx) => {
      const actor = await this.currentGrant(tx, id);
      const now = this.clock();
      const expiresAt = new Date(now.getTime() + DEVICE_LIMITS.leaseMilliseconds);
      await tx.deviceGrant.update({ where: { id }, data: { lastSeenAt: now, expiresAt } });
      // Presence does not change the staff configuration revision or modification time.
      if (actor.role === 'PRIMARY')
        await tx.$executeRaw`UPDATE "Device" SET "lastSeenAt" = ${now} WHERE "id" = ${actor.deviceId}::uuid AND "organisationId" = ${actor.organisationId}::uuid`;
      return { ...actor, expiresAt };
    });
  }

  async closeGrant(id: string): Promise<void> {
    parse(resourceIdSchema, id);
    await this.transaction(async (tx) => {
      const grant = await tx.deviceGrant.findUnique({ where: { id } });
      if (!grant) return;
      await lockDevice(tx, grant.deviceId, grant.organisationId);
      await tx.deviceGrant.updateMany({
        where: { id, revokedAt: null },
        data: { revokedAt: this.clock() },
      });
    });
  }
}
