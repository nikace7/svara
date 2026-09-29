import type { Prisma } from '@svara/database';
import { ANALYTICS_MIN_SAMPLES, analyticsQuerySchema } from '@svara/contracts';
import type {
  AnalyticsLatency,
  AnalyticsOverview,
  LatencyDistribution,
  LatencyMetric,
} from '@svara/contracts';
import { ConversationError } from './errors.js';

type Transaction = Prisma.TransactionClient;
type Query = ReturnType<typeof analyticsQuerySchema.parse>;
interface Scope {
  organisationId: string;
  mode: Query['mode'];
  locale: string | null;
  from: Date;
  to: Date;
}

export function analyticsScope(value: unknown, organisationId: string, now: Date): Scope {
  const parsed = analyticsQuerySchema.safeParse(value ?? {});
  if (!parsed.success) throw new ConversationError('INVALID_INPUT');
  const { mode, locale, days } = parsed.data;
  return {
    organisationId,
    mode,
    locale: locale ?? null,
    from: new Date(now.getTime() - days * 86_400_000),
    to: now,
  };
}
const scopeView = (scope: Scope) => ({
  mode: scope.mode,
  locale: scope.locale as AnalyticsOverview['scope']['locale'],
  from: scope.from.toISOString(),
  to: scope.to.toISOString(),
});
const tally = <K extends string>(keys: readonly K[], rows: { key: string | null; n: number }[]) =>
  Object.fromEntries(
    keys.map((key) => [key, rows.filter((row) => row.key === key).reduce((a, r) => a + r.n, 0)]),
  ) as Record<K, number>;
const byKey = (rows: { key: string | null; n: number }[]) => {
  const out: Record<string, number> = {};
  for (const row of rows) if (row.key) out[row.key] = (out[row.key] ?? 0) + row.n;
  return out;
};

/** Counts recorded in one organisation, one provider mode and one window. Nothing is inferred:
 * a category with no rows is zero because nothing was recorded, and states come from turns. */
export async function analyticsOverview(tx: Transaction, s: Scope): Promise<AnalyticsOverview> {
  const sessions = await tx.$queryRaw<{ actor: string; reason: string | null; n: number }[]>`
    SELECT "actorKind"::text AS actor, "endReason" AS reason, count(*)::int AS n
    FROM "ConversationSession"
    WHERE "organisationId" = ${s.organisationId}::uuid AND "providerMode" = ${s.mode}
      AND "startedAt" >= ${s.from} AND "startedAt" <= ${s.to}
      AND (${s.locale}::text IS NULL OR "locale" = ${s.locale})
    GROUP BY 1, 2`;
  const turns = await tx.$queryRaw<
    { state: string; failure: string | null; voice: boolean; n: number }[]
  >`
    SELECT t."state"::text AS state, t."failureCode" AS failure,
      t."inputKind" = 'VOICE' AS voice, count(*)::int AS n
    FROM "ConversationTurn" t JOIN "ConversationSession" s ON s."id" = t."sessionId"
    WHERE t."organisationId" = ${s.organisationId}::uuid AND s."providerMode" = ${s.mode}
      AND t."createdAt" >= ${s.from} AND t."createdAt" <= ${s.to}
      AND (${s.locale}::text IS NULL OR t."locale" = ${s.locale})
    GROUP BY 1, 2, 3`;
  const tools = await tx.$queryRaw<{ status: string; n: number }[]>`
    SELECT x."status" AS status, count(*)::int AS n
    FROM "ToolExecution" x JOIN "ConversationTurn" t ON t."id" = x."turnId"
      JOIN "ConversationSession" s ON s."id" = x."sessionId"
    WHERE x."organisationId" = ${s.organisationId}::uuid AND s."providerMode" = ${s.mode}
      AND x."createdAt" >= ${s.from} AND x."createdAt" <= ${s.to}
      AND (${s.locale}::text IS NULL OR t."locale" = ${s.locale})
    GROUP BY 1`;
  const audit = await tx.$queryRaw<{ key: string; n: number }[]>`
    SELECT "action" AS key, count(*)::int AS n FROM "AuditEntry"
    WHERE "organisationId" = ${s.organisationId}::uuid
      AND "createdAt" >= ${s.from} AND "createdAt" <= ${s.to}
    GROUP BY 1`;
  const sum = (rows: { n: number }[]) => rows.reduce((total, row) => total + row.n, 0);
  return {
    scope: scopeView(s),
    sessions: {
      total: sum(sessions),
      byActor: tally(
        ['STAFF', 'DEVICE', 'VISITOR'] as const,
        sessions.map((row) => ({ key: row.actor, n: row.n })),
      ),
      byEndReason: byKey(sessions.map((row) => ({ key: row.reason, n: row.n }))),
    },
    turns: {
      total: sum(turns),
      voice: sum(turns.filter((row) => row.voice)),
      byState: tally(
        ['ANSWERING', 'COMPLETED', 'INTERRUPTED', 'FAILED'] as const,
        turns.map((row) => ({ key: row.state, n: row.n })),
      ),
      byFailure: byKey(turns.map((row) => ({ key: row.failure, n: row.n }))),
    },
    tools: {
      total: sum(tools),
      byStatus: tally(
        ['DONE', 'APPLIED', 'PENDING', 'REJECTED', 'FAILED'] as const,
        tools.map((row) => ({ key: row.status, n: row.n })),
      ),
    },
    audit: byKey(audit),
  };
}

interface MetricRow {
  metric: LatencyMetric;
  /** Turns (or slide commands) that should have recorded this measurement. */
  scope: number;
  samples: number;
  p: number[] | null;
  max: number | null;
}
function distribution(row: MetricRow): LatencyDistribution {
  const enough = row.samples >= ANALYTICS_MIN_SAMPLES;
  const at = (index: number) => (enough ? (row.p?.[index] ?? null) : null);
  return {
    metric: row.metric,
    samples: row.samples,
    missing: Math.max(0, row.scope - row.samples),
    p50: at(0),
    p90: at(1),
    p95: at(2),
    max: enough ? row.max : null,
  };
}

/**
 * Server-measured durations: recognition, first answer text, first synthesized audio and whole
 * turn (each measured on the API's monotonic clock), plus slide acknowledgement from the
 * command's own sent and acknowledged times. Unfinished turns are excluded; recognition only
 * counts spoken questions.
 */
export async function analyticsLatency(tx: Transaction, s: Scope): Promise<AnalyticsLatency> {
  const [turns] = await tx.$queryRaw<Record<string, number | number[] | null>[]>`
    SELECT
      count(*) FILTER (WHERE t."inputKind" = 'VOICE')::int AS "sttScope",
      count(t."sttMs")::int AS "sttSamples",
      percentile_disc(ARRAY[0.5, 0.9, 0.95]) WITHIN GROUP (ORDER BY t."sttMs") AS "sttP",
      max(t."sttMs") AS "sttMax",
      count(*)::int AS "turnScope",
      count(t."firstTextMs")::int AS "firstTextSamples",
      percentile_disc(ARRAY[0.5, 0.9, 0.95]) WITHIN GROUP (ORDER BY t."firstTextMs") AS "firstTextP",
      max(t."firstTextMs") AS "firstTextMax",
      count(t."firstAudioMs")::int AS "firstAudioSamples",
      percentile_disc(ARRAY[0.5, 0.9, 0.95]) WITHIN GROUP (ORDER BY t."firstAudioMs") AS "firstAudioP",
      max(t."firstAudioMs") AS "firstAudioMax",
      count(t."totalMs")::int AS "totalSamples",
      percentile_disc(ARRAY[0.5, 0.9, 0.95]) WITHIN GROUP (ORDER BY t."totalMs") AS "totalP",
      max(t."totalMs") AS "totalMax"
    FROM "ConversationTurn" t JOIN "ConversationSession" s ON s."id" = t."sessionId"
    WHERE t."organisationId" = ${s.organisationId}::uuid AND s."providerMode" = ${s.mode}
      AND t."state" <> 'ANSWERING'
      AND t."createdAt" >= ${s.from} AND t."createdAt" <= ${s.to}
      AND (${s.locale}::text IS NULL OR t."locale" = ${s.locale})`;
  const [slides] = await tx.$queryRaw<Record<string, number | number[] | null>[]>`
    SELECT count(*)::int AS "scope", count(q.v)::int AS "samples",
      percentile_disc(ARRAY[0.5, 0.9, 0.95]) WITHIN GROUP (ORDER BY q.v) AS "p", max(q.v) AS "max"
    FROM (
      SELECT round(extract(epoch FROM c."acknowledgedAt" - c."sentAt") * 1000)::int AS v
      FROM "ToolExecution" x JOIN "DeviceCommand" c ON c."id" = x."commandId"
        JOIN "ConversationTurn" t ON t."id" = x."turnId"
        JOIN "ConversationSession" s ON s."id" = x."sessionId"
      WHERE x."organisationId" = ${s.organisationId}::uuid AND s."providerMode" = ${s.mode}
        AND x."name" = 'show_slide'
        AND x."createdAt" >= ${s.from} AND x."createdAt" <= ${s.to}
        AND (${s.locale}::text IS NULL OR t."locale" = ${s.locale})
    ) q`;
  const row = (metric: LatencyMetric, prefix: string, scope: string): MetricRow => ({
    metric,
    scope: Number(turns?.[scope] ?? 0),
    samples: Number(turns?.[`${prefix}Samples`] ?? 0),
    p: (turns?.[`${prefix}P`] as number[] | null) ?? null,
    max: (turns?.[`${prefix}Max`] as number | null) ?? null,
  });
  return {
    scope: scopeView(s),
    minimumSamples: ANALYTICS_MIN_SAMPLES,
    metrics: [
      row('sttMs', 'stt', 'sttScope'),
      row('firstTextMs', 'firstText', 'turnScope'),
      row('firstAudioMs', 'firstAudio', 'turnScope'),
      row('totalMs', 'total', 'turnScope'),
      {
        metric: 'slideAckMs' as const,
        scope: Number(slides?.scope ?? 0),
        samples: Number(slides?.samples ?? 0),
        p: (slides?.p as number[] | null) ?? null,
        max: (slides?.max as number | null) ?? null,
      },
    ].map(distribution),
  };
}
