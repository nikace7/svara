import type { PrismaClient, Prisma } from '@svara/database';
import { commandAckSchema } from '@svara/contracts';
import type { CommandSummary, DesiredRelease } from '@svara/contracts';
import { IdentityError } from '../identity/errors.js';
import type { DeviceRuntime, RuntimeActor } from '../devices/runtime.js';
import { commandSummary, reconcileDevice, retryDelay } from './core.js';

type Transaction = Prisma.TransactionClient;
export interface ClaimedCommand {
  id: string;
  deviceId: string;
  organisationId: string;
}

/**
 * Worker side of the durable outbox. PostgreSQL is the journal; anything the worker
 * publishes afterwards is only a wake-up, so a lost notification is repaired by the next scan.
 */
export class CommandOutbox {
  constructor(
    private readonly db: PrismaClient,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  private transaction<T>(run: (tx: Transaction) => Promise<T>): Promise<T> {
    return this.db.$transaction(run, {
      isolationLevel: 'ReadCommitted',
      maxWait: 5000,
      timeout: 10000,
    });
  }

  /**
   * Selects current truth rather than replaying elapsed boundaries, so the same call serves
   * the five-second tick and startup after downtime. Returns how many devices changed.
   */
  async reconcileDue(): Promise<number> {
    const now = this.clock();
    // Devices whose governing deployment stopped covering now, plus devices with a covering
    // deployment that does not govern them yet (a start, or an override over a schedule).
    // ponytail: rechecks a scheduled row shadowed by an override every tick; fine at kiosk scale.
    const due = await this.db.$queryRaw<{ deviceId: string; organisationId: string }[]>`
      SELECT s."deviceId", s."organisationId" FROM "DesiredDeviceState" s
        JOIN "Deployment" d ON d."id" = s."deploymentId"
        WHERE d."cancelledAt" IS NOT NULL OR d."startsAt" > ${now} OR d."endsAt" <= ${now}
      UNION
      SELECT d."deviceId", d."organisationId" FROM "Deployment" d
        LEFT JOIN "DesiredDeviceState" s ON s."deviceId" = d."deviceId"
        WHERE d."cancelledAt" IS NULL AND d."startsAt" <= ${now} AND d."endsAt" > ${now}
          AND s."deploymentId" IS DISTINCT FROM d."id"
      LIMIT 500`;
    let changed = 0;
    for (const { deviceId, organisationId } of due) {
      const moved = await this.transaction(async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "Device" WHERE "id" = ${deviceId}::uuid AND "organisationId" = ${organisationId}::uuid FOR UPDATE`;
        return reconcileDevice(tx, deviceId, organisationId, now, null);
      });
      if (moved) changed++;
    }
    return changed;
  }

  /** Claims due, unexpired commands and schedules their next retry before handing them out. */
  async claim(limit = 50): Promise<ClaimedCommand[]> {
    const now = this.clock();
    return this.transaction(async (tx) => {
      const rows = await tx.$queryRaw<
        (ClaimedCommand & { attempts: number; sentAt: Date | null })[]
      >`
        SELECT "id", "deviceId", "organisationId", "attempts", "sentAt" FROM "DeviceCommand"
          WHERE "status" IN ('QUEUED', 'SENT') AND "nextAttemptAt" <= ${now} AND "expiresAt" > ${now}
          ORDER BY "nextAttemptAt" LIMIT ${limit} FOR UPDATE SKIP LOCKED`;
      for (const row of rows)
        await tx.deviceCommand.update({
          where: { id: row.id },
          data: {
            status: 'SENT',
            attempts: row.attempts + 1,
            sentAt: row.sentAt ?? now,
            nextAttemptAt: new Date(now.getTime() + retryDelay(row.attempts + 1)),
          },
        });
      return rows.map(({ id, deviceId, organisationId }) => ({ id, deviceId, organisationId }));
    });
  }

  async expire(): Promise<number> {
    const { count } = await this.db.deviceCommand.updateMany({
      where: { status: { in: ['QUEUED', 'SENT'] }, expiresAt: { lte: this.clock() } },
      data: { status: 'EXPIRED' },
    });
    return count;
  }
}

/** Device side: reconnect snapshots and acknowledgements, always under a live grant. */
export class DeviceCommands {
  constructor(
    private readonly runtime: DeviceRuntime,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async snapshot(actor: RuntimeActor): Promise<DesiredRelease> {
    return this.runtime.asGrant(actor.id, actor.role, async (tx, current) => {
      const state = await tx.desiredDeviceState.findUnique({
        where: { deviceId: current.deviceId },
      });
      if (!state) return { commandId: null, revision: 0, releaseId: null, deploymentId: null };
      const command = await tx.deviceCommand.findFirst({
        where: { deviceId: current.deviceId, stateRevision: state.revision },
        orderBy: { createdAt: 'desc' },
        select: { id: true },
      });
      return {
        commandId: command?.id ?? null,
        revision: state.revision,
        releaseId: state.releaseId,
        deploymentId: state.deploymentId,
      };
    });
  }

  /**
   * A repeated acknowledgement returns the stored outcome and changes nothing. A late
   * acknowledgement for a superseded command is kept as telemetry but never revives it, and
   * the applied revision only moves forward.
   */
  async acknowledge(actor: RuntimeActor, value: unknown): Promise<CommandSummary> {
    const parsed = commandAckSchema.safeParse(value);
    if (!parsed.success) throw new IdentityError('INVALID_INPUT');
    const ack = parsed.data;
    return this.runtime.asGrant(actor.id, 'PRIMARY', async (tx, current) => {
      const command = await tx.deviceCommand.findFirst({
        where: {
          id: ack.commandId,
          deviceId: current.deviceId,
          organisationId: current.organisationId,
        },
      });
      if (!command) throw new IdentityError('NOT_FOUND');
      if (command.acknowledgedAt) return commandSummary(command);
      if (ack.appliedRevision !== command.stateRevision) throw new IdentityError('INVALID_INPUT');
      const now = this.clock();
      const outstanding = command.status === 'QUEUED' || command.status === 'SENT';
      const updated = await tx.deviceCommand.update({
        where: { id: command.id },
        data: {
          acknowledgedAt: now,
          result: ack.result,
          reason: ack.reason,
          ...(outstanding
            ? { status: ack.result === 'APPLIED' ? ('ACKNOWLEDGED' as const) : ('FAILED' as const) }
            : {}),
        },
      });
      if (ack.result === 'APPLIED') {
        const payload = command.payload as { releaseId?: string | null };
        await tx.desiredDeviceState.updateMany({
          where: { deviceId: current.deviceId, appliedRevision: { lt: command.stateRevision } },
          data: {
            appliedRevision: command.stateRevision,
            appliedReleaseId: payload.releaseId ?? null,
            appliedAt: now,
          },
        });
      }
      return commandSummary(updated);
    });
  }
}
