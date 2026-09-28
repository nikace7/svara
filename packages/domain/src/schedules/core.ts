import type { Prisma } from '@svara/database';
import { SCHEDULE_LIMITS } from '@svara/contracts';
import type { CommandSummary, DesiredState, DeploymentSummary } from '@svara/contracts';
import { endSessions } from '../conversations/core.js';

type Transaction = Prisma.TransactionClient;
interface Interval {
  id: string;
  kind: 'SCHEDULED' | 'OVERRIDE';
  releaseId: string;
  startsAt: Date;
  endsAt: Date;
  cancelledAt: Date | null;
}

const covers = (row: Interval, now: Date) =>
  !row.cancelledAt && row.startsAt <= now && now < row.endsAt;

/** An active override wins, then an active schedule; otherwise the device is idle. */
export function selectActive<T extends Interval>(rows: readonly T[], now: Date): T | undefined {
  return (
    rows.find((row) => row.kind === 'OVERRIDE' && covers(row, now)) ??
    rows.find((row) => row.kind === 'SCHEDULED' && covers(row, now))
  );
}

export function deploymentState(row: Interval, now: Date): DeploymentSummary['state'] {
  if (row.cancelledAt) return 'CANCELLED';
  if (now < row.startsAt) return 'UPCOMING';
  return now < row.endsAt ? 'ACTIVE' : 'ENDED';
}

/** Delay before the next delivery after `attempts` sends: 1, 2, 4, 8 s, then every 15 s. */
export function retryDelay(attempts: number): number {
  const steps = SCHEDULE_LIMITS.commandRetryMilliseconds;
  return steps[Math.min(attempts, steps.length) - 1]!;
}

export const idleState: DesiredState = {
  revision: 0,
  releaseId: null,
  deploymentId: null,
  appliedRevision: 0,
  appliedReleaseId: null,
  appliedAt: null,
};

export function desiredSummary(
  row: {
    revision: number;
    releaseId: string | null;
    deploymentId: string | null;
    appliedRevision: number;
    appliedReleaseId: string | null;
    appliedAt: Date | null;
  } | null,
): DesiredState {
  if (!row) return idleState;
  return {
    revision: row.revision,
    releaseId: row.releaseId,
    deploymentId: row.deploymentId,
    appliedRevision: row.appliedRevision,
    appliedReleaseId: row.appliedReleaseId,
    appliedAt: row.appliedAt?.toISOString() ?? null,
  };
}

export function commandSummary(row: {
  id: string;
  type: string;
  stateRevision: number;
  payload: Prisma.JsonValue;
  status: CommandSummary['status'];
  attempts: number;
  createdAt: Date;
  sentAt: Date | null;
  acknowledgedAt: Date | null;
  result: string | null;
  reason: string | null;
}): CommandSummary {
  const payload = row.payload as { releaseId?: string | null } | null;
  return {
    id: row.id,
    type: row.type,
    stateRevision: row.stateRevision,
    releaseId: payload?.releaseId ?? null,
    status: row.status,
    attempts: row.attempts,
    createdAt: row.createdAt.toISOString(),
    sentAt: row.sentAt?.toISOString() ?? null,
    acknowledgedAt: row.acknowledgedAt?.toISOString() ?? null,
    result: row.result as CommandSummary['result'],
    reason: row.reason,
  };
}

/**
 * Recomputes one device's desired release from current truth. The caller holds the device
 * row lock. A change bumps the revision, supersedes undelivered commands and writes the new
 * command in the same transaction, so the outbox can never disagree with desired state.
 * Returns true when the desired state changed.
 */
export async function reconcileDevice(
  tx: Transaction,
  deviceId: string,
  organisationId: string,
  now: Date,
  actorMembershipId: string | null,
): Promise<boolean> {
  const rows = await tx.deployment.findMany({
    where: {
      deviceId,
      organisationId,
      cancelledAt: null,
      startsAt: { lte: now },
      endsAt: { gt: now },
    },
    orderBy: { startsAt: 'asc' },
  });
  const active = selectActive(rows, now);
  const current = await tx.desiredDeviceState.findUnique({ where: { deviceId } });
  const releaseId = active?.releaseId ?? null;
  const deploymentId = active?.id ?? null;
  if (
    (current?.releaseId ?? null) === releaseId &&
    (current?.deploymentId ?? null) === deploymentId
  )
    return false;
  const revision = (current?.revision ?? 0) + 1;
  if ((current?.releaseId ?? null) !== releaseId)
    await endSessions(tx, { deviceId, organisationId }, 'RELEASE_CHANGED', now);
  await tx.desiredDeviceState.upsert({
    where: { deviceId },
    create: { deviceId, organisationId, revision, releaseId, deploymentId, updatedAt: now },
    update: { revision, releaseId, deploymentId, updatedAt: now },
  });
  await tx.deviceCommand.updateMany({
    where: { deviceId, organisationId, status: { in: ['QUEUED', 'SENT'] } },
    data: { status: 'SUPERSEDED' },
  });
  await tx.deviceCommand.create({
    data: {
      organisationId,
      deviceId,
      type: 'release.apply',
      payload: { releaseId, deploymentId },
      stateRevision: revision,
      nextAttemptAt: now,
      // An idle instruction stays deliverable for a day; reconnects get a fresh snapshot.
      expiresAt:
        active?.endsAt ?? new Date(now.getTime() + SCHEDULE_LIMITS.idleCommandHours * 3_600_000),
      createdAt: now,
    },
  });
  await tx.auditEntry.create({
    data: {
      organisationId,
      ...(actorMembershipId
        ? { actorMembershipId }
        : { actorKind: 'SYSTEM' as const, actorMembershipId: null }),
      action: 'device.desired.changed',
      targetId: deviceId,
    },
  });
  return true;
}
