import type { Prisma } from '@svara/database';
import type { ToolStatus } from '@svara/contracts';
import { searchRelease } from '../authoring/release-search.js';
import type { ToolCallInput, ToolOutcome, TurnContext } from './service.js';

type Transaction = Prisma.TransactionClient;
export interface ToolEffect {
  status: ToolStatus;
  reason: string | null;
  result: unknown;
  commandId?: string;
}
const rejected = (reason: string): ToolEffect => ({ status: 'REJECTED', reason, result: null });

export function toolOutcome(
  row: Prisma.ToolExecutionGetPayload<{ include: { command: true } }>,
  duplicate: boolean,
): ToolOutcome {
  return {
    id: row.id,
    name: row.name,
    status: row.status as ToolStatus,
    reason: row.reason,
    result: row.result,
    duplicate,
    command: row.command ? { id: row.command.id, stateRevision: row.command.stateRevision } : null,
  };
}

/**
 * Runs one already-authorised call. Every argument is checked against the pinned release; the
 * organisation, release, session and device come from the turn, never from the model.
 */
export async function runTool(
  tx: Transaction,
  turn: TurnContext,
  call: ToolCallInput,
  now: Date,
): Promise<ToolEffect> {
  if (call.name === 'select_reference') {
    const entry = turn.snapshot.knowledge.find((item) => item.id === call.args.entryId);
    return entry
      ? { status: 'DONE', reason: null, result: { entryId: entry.id, title: entry.title } }
      : rejected('UNKNOWN_REFERENCE');
  }
  if (call.name === 'lookup_knowledge') {
    const query = typeof call.args.query === 'string' ? call.args.query.trim() : '';
    if (!query) return rejected('INVALID_ARGUMENTS');
    const found = await searchRelease(
      tx,
      turn.organisationId,
      turn.releaseId,
      turn.snapshotHash,
      turn.locale === 'ne-NP' ? 'ne' : 'en',
      query.slice(0, 500),
    );
    return {
      status: 'DONE',
      reason: null,
      result: {
        passages: found.passages.map((passage) => ({
          entryId: passage.entryId,
          title: passage.title,
          text: [passage.question, passage.text].filter(Boolean).join('\n'),
        })),
      },
    };
  }
  if (!turn.deviceId) return rejected('TOOL_NOT_ALLOWED');
  if (call.name === 'get_event_schedule') {
    const state = await tx.desiredDeviceState.findUnique({
      where: { deviceId: turn.deviceId },
      include: { deployment: { include: { event: true } } },
    });
    const deployment = state?.deployment;
    const event = deployment?.event;
    return {
      status: 'DONE',
      reason: null,
      result: {
        event: event ? { name: event.name, venue: event.venue, timezone: event.timezone } : null,
        startsAt: deployment?.startsAt.toISOString() ?? null,
        endsAt: deployment?.endsAt.toISOString() ?? null,
      },
    };
  }
  return showSlide(tx, turn, call, now);
}

/** Persists a short-lived slide command for the kiosk's own applied release. */
async function showSlide(
  tx: Transaction,
  turn: TurnContext,
  call: ToolCallInput,
  now: Date,
): Promise<ToolEffect> {
  const slide = turn.snapshot.presentation?.slides.find((item) => item.id === call.args.slideId);
  if (!slide || !turn.deviceId) return rejected('UNKNOWN_SLIDE');
  const requested = call.args.target;
  const target =
    requested === 'PRIMARY' || requested === 'SECONDARY'
      ? requested
      : slide.target === 'SECONDARY'
        ? 'SECONDARY'
        : 'PRIMARY';
  if (slide.target !== 'BOTH' && slide.target !== target) return rejected('WRONG_SCREEN');
  const state = await tx.desiredDeviceState.findUnique({ where: { deviceId: turn.deviceId } });
  if (!state || state.appliedReleaseId !== turn.releaseId || state.appliedRevision < 1)
    return rejected('RELEASE_CHANGED');
  const command = await tx.deviceCommand.create({
    data: {
      organisationId: turn.organisationId,
      deviceId: turn.deviceId,
      type: 'slide.show',
      payload: { slideId: slide.id, target, sessionId: turn.sessionId, turnId: turn.turnId },
      stateRevision: state.appliedRevision,
      status: 'SENT',
      attempts: 1,
      sentAt: now,
      nextAttemptAt: now,
      expiresAt: new Date(now.getTime() + 10_000),
      createdAt: now,
    },
  });
  return {
    status: 'PENDING',
    reason: null,
    result: { slideId: slide.id, target },
    commandId: command.id,
  };
}
