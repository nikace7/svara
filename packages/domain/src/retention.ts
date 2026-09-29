import type { PrismaClient } from '@svara/database';
import { blankTranscripts } from './conversations/core.js';

const DAY = 86_400_000;
export const RETENTION = {
  /** Transcripts and tool payloads are removed this long after their session ended. */
  transcriptDays: 30,
  /** Expired or revoked credentials stay briefly for incident review, then go. */
  credentialDays: 7,
  /** Sessions blanked per transaction; the next run continues. */
  batch: 200,
} as const;

export interface RetentionOutcome {
  transcripts: number;
  records: number;
}

/**
 * The daily retention pass. Transcripts older than the window lose their text, citations and
 * tool payloads (states, timings and counts stay for aggregates). Expired single-use grants,
 * pairing codes, tickets, staff sessions and idempotency records are deleted once nothing
 * references them. Idempotent: running it twice removes nothing more.
 */
export async function applyRetention(
  db: PrismaClient,
  now = new Date(),
): Promise<RetentionOutcome> {
  const transcriptCutoff = new Date(now.getTime() - RETENTION.transcriptDays * DAY);
  const expired = new Date(now.getTime() - RETENTION.credentialDays * DAY);
  const transcripts = await db.$transaction(async (tx) => {
    const sessions = await tx.conversationSession.findMany({
      where: { status: 'ENDED', endedAt: { lt: transcriptCutoff }, transcriptDeletedAt: null },
      select: { id: true, organisationId: true },
      orderBy: { endedAt: 'asc' },
      take: RETENTION.batch,
    });
    await blankTranscripts(
      tx,
      sessions.map((session) => session.id),
      now,
    );
    await tx.auditEntry.createMany({
      data: sessions.map((session) => ({
        organisationId: session.organisationId,
        actorKind: 'SYSTEM' as const,
        action: 'conversation.transcript.expired',
        targetId: session.id,
      })),
    });
    return sessions.length;
  });
  const gone = { lt: expired };
  const records = await db.$transaction(async (tx) => {
    const counts = [
      await tx.staffSession.deleteMany({
        where: { OR: [{ expiresAt: gone }, { revokedAt: gone }] },
      }),
      await tx.staffGrant.deleteMany({ where: { expiresAt: gone } }),
      await tx.idempotencyRecord.deleteMany({ where: { expiresAt: { lt: now } } }),
      await tx.visitorGrant.deleteMany({ where: { expiresAt: gone, sessions: { none: {} } } }),
    ];
    // Grants before their tickets, tickets and codes only once nothing points at them.
    const grants = await tx.deviceGrant.deleteMany({
      where: { OR: [{ expiresAt: gone }, { revokedAt: gone }] },
    });
    const tickets = await tx.deviceTicket.deleteMany({
      where: { expiresAt: gone, grant: { is: null } },
    });
    const codes = await tx.pairingChallenge.deleteMany({
      where: { expiresAt: gone, credential: { is: null } },
    });
    return [...counts, grants, tickets, codes].reduce((sum, { count }) => sum + count, 0);
  });
  return { transcripts, records };
}
