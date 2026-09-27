import type { Prisma } from '@svara/database';
import {
  SCHEDULE_LIMITS,
  deploymentCancelSchema,
  deploymentCreateSchema,
  deploymentSaveSchema,
  eventArchiveSchema,
  eventCreateSchema,
  eventListQuerySchema,
  eventSaveSchema,
  overrideCreateSchema,
  resourceIdSchema,
  scheduleBoardQuerySchema,
} from '@svara/contracts';
import type {
  DeploymentSummary,
  DeviceTimeline,
  EventSummary,
  ScheduleBoard,
} from '@svara/contracts';
import { IdentityError } from '../identity/errors.js';
import type { IdentityService } from '../identity/service.js';
import { commandSummary, deploymentState, desiredSummary, reconcileDevice } from './core.js';
import { ScheduleError } from './errors.js';

type Transaction = Prisma.TransactionClient;
type Schema<T> = { safeParse(value: unknown): { success: true; data: T } | { success: false } };

const deploymentInclude = {
  release: { select: { id: true, botId: true, version: true, bot: { select: { name: true } } } },
  event: { select: { id: true, name: true } },
} as const;
type StoredDeployment = Prisma.DeploymentGetPayload<{ include: typeof deploymentInclude }>;
const eventInclude = { _count: { select: { deployments: true } } } as const;
type StoredEvent = Prisma.EventGetPayload<{ include: typeof eventInclude }>;

function parse<T>(schema: Schema<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new IdentityError('INVALID_INPUT');
  return result.data;
}
function mutation<T>(schema: Schema<T>, value: unknown): T {
  if (value && typeof value === 'object' && !('expectedRevision' in value))
    throw new ScheduleError('PRECONDITION_REQUIRED');
  return parse(schema, value);
}
function requireRevision(revision: number, expected: number): void {
  if (revision !== expected)
    throw new ScheduleError('REVISION_CONFLICT', { currentRevision: revision });
}

function deploymentSummary(row: StoredDeployment, now: Date): DeploymentSummary {
  return {
    id: row.id,
    deviceId: row.deviceId,
    kind: row.kind,
    release: {
      id: row.release.id,
      botId: row.release.botId,
      botName: row.release.bot.name,
      // Only published releases can be scheduled, and they always carry a version.
      version: row.release.version ?? 1,
    },
    event: row.event,
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt.toISOString(),
    cancelledAt: row.cancelledAt?.toISOString() ?? null,
    state: deploymentState(row, now),
    revision: row.revision,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
function eventSummary(row: StoredEvent): EventSummary {
  return {
    id: row.id,
    name: row.name,
    venue: row.venue,
    timezone: row.timezone,
    suggestedStartsAt: row.suggestedStartsAt?.toISOString() ?? null,
    suggestedEndsAt: row.suggestedEndsAt?.toISOString() ?? null,
    archivedAt: row.archivedAt?.toISOString() ?? null,
    revision: row.revision,
    deploymentCount: row._count.deployments,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function lockDevice(tx: Transaction, id: string, organisationId: string): Promise<void> {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "Device" WHERE "id" = ${id}::uuid AND "organisationId" = ${organisationId}::uuid FOR UPDATE`;
  if (!rows.length) throw new IdentityError('NOT_FOUND');
}
async function requireRelease(tx: Transaction, id: string, organisationId: string) {
  const release = await tx.botRelease.findFirst({
    where: { id, organisationId },
    select: { kind: true },
  });
  if (!release) throw new IdentityError('NOT_FOUND');
  // Draft previews are temporary test snapshots and never reach a device.
  if (release.kind !== 'PUBLISHED') throw new ScheduleError('RELEASE_NOT_SCHEDULABLE');
}
async function requireOpenEvent(tx: Transaction, id: string, organisationId: string) {
  const event = await tx.event.findFirst({
    where: { id, organisationId },
    select: { archivedAt: true },
  });
  if (!event) throw new IdentityError('NOT_FOUND');
  if (event.archivedAt) throw new ScheduleError('EVENT_ARCHIVED');
}
function requireWindow(startsAt: Date, endsAt: Date, now: Date): void {
  if (
    endsAt <= now ||
    endsAt.getTime() - startsAt.getTime() > SCHEDULE_LIMITS.deploymentMaxDays * 86_400_000
  )
    throw new ScheduleError('WINDOW_INVALID');
}
async function audit(
  tx: Transaction,
  organisationId: string,
  actorMembershipId: string,
  action: string,
  targetId: string,
) {
  await tx.auditEntry.create({ data: { organisationId, actorMembershipId, action, targetId } });
}

/** Staff scheduling. Every change re-derives desired state inside the same transaction. */
export class ScheduleService {
  constructor(
    private readonly identity: IdentityService,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async listEvents(token: string, value: unknown): Promise<{ items: EventSummary[] }> {
    const { archived } = parse(eventListQuerySchema, value);
    return this.identity.asStaff(
      token,
      'inspect',
      async (tx, { member }) => {
        const rows = await tx.event.findMany({
          where: {
            organisationId: member.organisationId,
            archivedAt: archived ? { not: null } : null,
          },
          orderBy: [{ name: 'asc' }, { id: 'asc' }],
          take: 200,
          include: eventInclude,
        });
        return { items: rows.map(eventSummary) };
      },
      false,
    );
  }

  async createEvent(token: string, value: unknown): Promise<EventSummary> {
    const data = parse(eventCreateSchema, value);
    return this.identity.asStaff(token, 'operate_devices', async (tx, { member }) => {
      const now = this.clock();
      const row = await tx.event.create({
        data: { ...data, organisationId: member.organisationId, createdAt: now, updatedAt: now },
        include: eventInclude,
      });
      await audit(tx, member.organisationId, member.id, 'event.created', row.id);
      return eventSummary(row);
    });
  }

  async saveEvent(token: string, id: string, value: unknown): Promise<EventSummary> {
    parse(resourceIdSchema, id);
    const { expectedRevision, ...data } = mutation(eventSaveSchema, value);
    return this.changeEvent(token, id, expectedRevision, 'event.updated', data);
  }

  async archiveEvent(token: string, id: string, value: unknown): Promise<EventSummary> {
    parse(resourceIdSchema, id);
    const { expectedRevision, archived } = mutation(eventArchiveSchema, value);
    return this.changeEvent(
      token,
      id,
      expectedRevision,
      archived ? 'event.archived' : 'event.restored',
      { archivedAt: archived ? this.clock() : null },
    );
  }

  /** Event edits never move deployments: they own their times. */
  private changeEvent(
    token: string,
    id: string,
    expectedRevision: number,
    action: string,
    data: Prisma.EventUpdateInput,
  ): Promise<EventSummary> {
    return this.identity.asStaff(token, 'operate_devices', async (tx, { member }) => {
      const event = await tx.event.findFirst({
        where: { id, organisationId: member.organisationId },
      });
      if (!event) throw new IdentityError('NOT_FOUND');
      requireRevision(event.revision, expectedRevision);
      const row = await tx.event.update({
        where: { id },
        data: { ...data, revision: { increment: 1 }, updatedAt: this.clock() },
        include: eventInclude,
      });
      await audit(tx, member.organisationId, member.id, action, id);
      return eventSummary(row);
    });
  }

  async board(token: string, value: unknown): Promise<ScheduleBoard> {
    const query = parse(scheduleBoardQuerySchema, value);
    return this.identity.asStaff(
      token,
      'inspect',
      async (tx, { member }) => {
        const now = this.clock();
        const devices = await tx.device.findMany({
          where: { organisationId: member.organisationId },
          orderBy: [{ name: 'asc' }, { id: 'asc' }],
          take: 200,
          include: { desiredState: true },
        });
        const deployments = await tx.deployment.findMany({
          where: {
            organisationId: member.organisationId,
            startsAt: { lt: new Date(query.to) },
            endsAt: { gt: new Date(query.from) },
          },
          orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
          take: 500,
          include: deploymentInclude,
        });
        return {
          devices: devices.map((device) => ({
            id: device.id,
            name: device.name,
            enabled: device.enabled,
            desired: desiredSummary(device.desiredState),
          })),
          deployments: deployments.map((row) => deploymentSummary(row, now)),
        };
      },
      false,
    );
  }

  async getDeployment(token: string, id: string): Promise<DeploymentSummary> {
    parse(resourceIdSchema, id);
    return this.identity.asStaff(
      token,
      'inspect',
      async (tx, { member }) => {
        const row = await tx.deployment.findFirst({
          where: { id, organisationId: member.organisationId },
          include: deploymentInclude,
        });
        if (!row) throw new IdentityError('NOT_FOUND');
        return deploymentSummary(row, this.clock());
      },
      false,
    );
  }

  async createDeployment(token: string, value: unknown): Promise<DeploymentSummary> {
    const data = parse(deploymentCreateSchema, value);
    return this.identity.asStaff(token, 'operate_devices', async (tx, { member }) => {
      const organisationId = member.organisationId;
      const now = this.clock();
      const startsAt = new Date(data.startsAt);
      const endsAt = new Date(data.endsAt);
      await lockDevice(tx, data.deviceId, organisationId);
      await requireRelease(tx, data.releaseId, organisationId);
      if (data.eventId) await requireOpenEvent(tx, data.eventId, organisationId);
      requireWindow(startsAt, endsAt, now);
      await this.requireFree(tx, data.deviceId, organisationId, startsAt, endsAt);
      const row = await tx.deployment.create({
        data: {
          ...data,
          organisationId,
          kind: 'SCHEDULED',
          startsAt,
          endsAt,
          createdByMembershipId: member.id,
          createdAt: now,
          updatedAt: now,
        },
        include: deploymentInclude,
      });
      await audit(tx, organisationId, member.id, 'deployment.created', row.id);
      await reconcileDevice(tx, data.deviceId, organisationId, now, member.id);
      return deploymentSummary(row, now);
    });
  }

  async saveDeployment(token: string, id: string, value: unknown): Promise<DeploymentSummary> {
    parse(resourceIdSchema, id);
    const { expectedRevision, ...data } = mutation(deploymentSaveSchema, value);
    return this.identity.asStaff(token, 'operate_devices', async (tx, { member }) => {
      const organisationId = member.organisationId;
      const now = this.clock();
      const row = await this.openDeployment(tx, id, organisationId, expectedRevision, now);
      if (row.kind === 'OVERRIDE') throw new ScheduleError('DEPLOYMENT_CLOSED');
      const startsAt = new Date(data.startsAt);
      const endsAt = new Date(data.endsAt);
      await requireRelease(tx, data.releaseId, organisationId);
      if (data.eventId && data.eventId !== row.eventId)
        await requireOpenEvent(tx, data.eventId, organisationId);
      requireWindow(startsAt, endsAt, now);
      await this.requireFree(tx, row.deviceId, organisationId, startsAt, endsAt, id);
      const updated = await tx.deployment.update({
        where: { id },
        data: { ...data, startsAt, endsAt, revision: { increment: 1 }, updatedAt: now },
        include: deploymentInclude,
      });
      await audit(tx, organisationId, member.id, 'deployment.updated', id);
      await reconcileDevice(tx, row.deviceId, organisationId, now, member.id);
      return deploymentSummary(updated, now);
    });
  }

  async cancelDeployment(token: string, id: string, value: unknown): Promise<DeploymentSummary> {
    parse(resourceIdSchema, id);
    const { expectedRevision } = mutation(deploymentCancelSchema, value);
    return this.identity.asStaff(token, 'operate_devices', async (tx, { member }) => {
      const organisationId = member.organisationId;
      const now = this.clock();
      const row = await this.openDeployment(tx, id, organisationId, expectedRevision, now);
      const updated = await tx.deployment.update({
        where: { id },
        data: { cancelledAt: now, revision: { increment: 1 }, updatedAt: now },
        include: deploymentInclude,
      });
      await audit(tx, organisationId, member.id, 'deployment.cancelled', id);
      await reconcileDevice(tx, row.deviceId, organisationId, now, member.id);
      return deploymentSummary(updated, now);
    });
  }

  /** Starts now. An unfinished override is only replaced when named explicitly. */
  async override(token: string, deviceId: string, value: unknown): Promise<DeploymentSummary> {
    parse(resourceIdSchema, deviceId);
    const data = parse(overrideCreateSchema, value);
    return this.identity.asStaff(token, 'operate_devices', async (tx, { member }) => {
      const organisationId = member.organisationId;
      const now = this.clock();
      await lockDevice(tx, deviceId, organisationId);
      await requireRelease(tx, data.releaseId, organisationId);
      const running = await tx.deployment.findMany({
        where: {
          deviceId,
          organisationId,
          kind: 'OVERRIDE',
          cancelledAt: null,
          endsAt: { gt: now },
        },
        select: { id: true },
      });
      const blocking = running.filter((row) => row.id !== data.replaceOverrideId);
      if (blocking.length)
        throw new ScheduleError('OVERRIDE_CONFLICT', {
          conflictIds: blocking.map((row) => row.id),
        });
      if (running.length) {
        await tx.deployment.update({
          where: { id: running[0]!.id },
          data: { cancelledAt: now, revision: { increment: 1 }, updatedAt: now },
        });
        await audit(tx, organisationId, member.id, 'deployment.cancelled', running[0]!.id);
      }
      const row = await tx.deployment.create({
        data: {
          organisationId,
          deviceId,
          releaseId: data.releaseId,
          kind: 'OVERRIDE',
          startsAt: now,
          endsAt: new Date(now.getTime() + data.minutes * 60_000),
          createdByMembershipId: member.id,
          createdAt: now,
          updatedAt: now,
        },
        include: deploymentInclude,
      });
      await audit(tx, organisationId, member.id, 'device.override.created', row.id);
      await reconcileDevice(tx, deviceId, organisationId, now, member.id);
      return deploymentSummary(row, now);
    });
  }

  async timeline(token: string, deviceId: string): Promise<DeviceTimeline> {
    parse(resourceIdSchema, deviceId);
    return this.identity.asStaff(
      token,
      'inspect',
      async (tx, { member }) => {
        const device = await tx.device.findFirst({
          where: { id: deviceId, organisationId: member.organisationId },
          include: {
            desiredState: true,
            commands: {
              orderBy: [{ stateRevision: 'desc' }, { createdAt: 'desc' }],
              take: SCHEDULE_LIMITS.timelineCommands,
            },
          },
        });
        if (!device) throw new IdentityError('NOT_FOUND');
        return {
          deviceId,
          desired: desiredSummary(device.desiredState),
          commands: device.commands.map(commandSummary),
        };
      },
      false,
    );
  }

  private async requireFree(
    tx: Transaction,
    deviceId: string,
    organisationId: string,
    startsAt: Date,
    endsAt: Date,
    except?: string,
  ): Promise<void> {
    const conflicts = await tx.deployment.findMany({
      where: {
        deviceId,
        organisationId,
        kind: 'SCHEDULED',
        cancelledAt: null,
        startsAt: { lt: endsAt },
        endsAt: { gt: startsAt },
        ...(except ? { id: { not: except } } : {}),
      },
      orderBy: { startsAt: 'asc' },
      select: { id: true },
    });
    if (conflicts.length)
      throw new ScheduleError('SCHEDULE_CONFLICT', { conflictIds: conflicts.map((row) => row.id) });
  }

  /** Locks the owning device, then re-reads the row so the checks see committed truth. */
  private async openDeployment(
    tx: Transaction,
    id: string,
    organisationId: string,
    expectedRevision: number,
    now: Date,
  ) {
    const found = await tx.deployment.findFirst({
      where: { id, organisationId },
      select: { deviceId: true },
    });
    if (!found) throw new IdentityError('NOT_FOUND');
    await lockDevice(tx, found.deviceId, organisationId);
    const row = await tx.deployment.findFirstOrThrow({ where: { id, organisationId } });
    requireRevision(row.revision, expectedRevision);
    if (row.cancelledAt || row.endsAt <= now) throw new ScheduleError('DEPLOYMENT_CLOSED');
    return row;
  }
}
