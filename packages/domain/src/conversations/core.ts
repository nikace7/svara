import type { Prisma, PrismaClient } from '@svara/database';
import type { BotDraft, ConversationSession, ReleaseSnapshot } from '@svara/contracts';

type Transaction = Prisma.TransactionClient;
type StoredSession = Prisma.ConversationSessionGetPayload<object>;

export type EndReason =
  | 'ENDED'
  | 'REPLACED'
  | 'IDLE'
  | 'EXPIRED'
  | 'LINK_DISABLED'
  | 'RELEASE_CHANGED'
  | 'DEVICE_REVOKED'
  | 'TRANSCRIPT_DELETED';

/** A UTC calendar day, as the DATE column stores it. */
export function usageDay(at: Date): Date {
  return new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()));
}

export function sessionView(session: StoredSession): ConversationSession {
  return {
    id: session.id,
    releaseId: session.releaseId,
    actorKind: session.actorKind,
    locale: session.locale as ConversationSession['locale'],
    providerMode: session.providerMode as ConversationSession['providerMode'],
    status: session.status,
    generation: session.generation,
    startedAt: session.startedAt.toISOString(),
    idleUntil: session.idleUntil.toISOString(),
    endsBy: session.endsBy.toISOString(),
    endedAt: session.endedAt?.toISOString() ?? null,
    endReason: session.endReason,
    resumedFromId: session.resumedFromId,
  };
}

/** Tools the model may be offered: the release's allowlist narrowed by what the actor can do.
 * Only a paired kiosk can change a screen or has a deployment with an event. */
export function toolsFor(
  snapshot: ReleaseSnapshot,
  actorKind: StoredSession['actorKind'],
): BotDraft['tools'] {
  return snapshot.bot.config.tools.filter((tool) => {
    if (tool === 'show_slide')
      return actorKind === 'DEVICE' && !!snapshot.presentation?.slides.length;
    if (tool === 'get_event_schedule') return actorKind === 'DEVICE';
    return true;
  });
}

/**
 * Ends matching ACTIVE sessions and interrupts their unfinished turns. An ordinary close
 * returns the unused live allowance; an expiry keeps the whole reservation, because nothing
 * verified when the session actually stopped using providers.
 */
export async function endSessions(
  tx: Transaction,
  where: Prisma.ConversationSessionWhereInput,
  reason: EndReason,
  now: Date,
  settle: 'elapsed' | 'reserved' = 'elapsed',
): Promise<string[]> {
  const sessions = await tx.conversationSession.findMany({
    where: { ...where, status: 'ACTIVE' },
    orderBy: { id: 'asc' },
  });
  for (const session of sessions) {
    const elapsed = Math.ceil(Math.max(0, now.getTime() - session.startedAt.getTime()) / 1000);
    const settled =
      settle === 'reserved' ? session.reservedSeconds : Math.min(session.reservedSeconds, elapsed);
    await tx.conversationSession.update({
      where: { id: session.id },
      data: { status: 'ENDED', endedAt: now, endReason: reason, settledSeconds: settled },
    });
    if (settled < session.reservedSeconds)
      await tx.dailyUsage.updateMany({
        where: {
          organisationId: session.organisationId,
          usageDate: usageDay(session.startedAt),
          reservedSeconds: { gte: session.reservedSeconds - settled },
        },
        data: { reservedSeconds: { decrement: session.reservedSeconds - settled } },
      });
    await tx.conversationTurn.updateMany({
      where: { sessionId: session.id, state: 'ANSWERING' },
      data: { state: 'INTERRUPTED', completedAt: now, failureCode: 'SESSION_ENDED' },
    });
  }
  return sessions.map((session) => session.id);
}

/** Worker sweep: stale sessions end and keep their whole reservation, because nothing verified
 * when they stopped using providers. Returns how many ended. */
export async function expireStaleSessions(db: PrismaClient, now = new Date()): Promise<number> {
  const ended = await db.$transaction(
    (tx) =>
      endSessions(
        tx,
        { OR: [{ endsBy: { lte: now } }, { idleUntil: { lte: now } }] },
        'EXPIRED',
        now,
        'reserved',
      ),
    { isolationLevel: 'ReadCommitted', maxWait: 5000, timeout: 10000 },
  );
  return ended.length;
}

/**
 * Removes what was said, citations and every tool payload. Device commands keep only the slide
 * and screen, so the display timeline survives without any conversation text; turn states,
 * timings and counts remain for aggregate analytics.
 */
export async function blankTranscripts(
  tx: Transaction,
  sessionIds: string[],
  now: Date,
): Promise<void> {
  if (!sessionIds.length) return;
  await tx.conversationTurn.updateMany({
    where: { sessionId: { in: sessionIds } },
    data: { transcript: '', answer: '', citedEntryIds: [] },
  });
  await tx.$executeRaw`UPDATE "DeviceCommand" SET "payload" = jsonb_build_object('slideId', "payload"->'slideId', 'target', "payload"->'target')
    WHERE "id" IN (SELECT "commandId" FROM "ToolExecution" WHERE "sessionId" = ANY(${sessionIds}::uuid[]) AND "commandId" IS NOT NULL)`;
  await tx.$executeRaw`UPDATE "ToolExecution" SET "arguments" = NULL, "result" = NULL WHERE "sessionId" = ANY(${sessionIds}::uuid[])`;
  await tx.conversationSession.updateMany({
    where: { id: { in: sessionIds } },
    data: { transcriptDeletedAt: now },
  });
}
