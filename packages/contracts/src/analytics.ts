import { z } from 'zod';
import { conversationActorSchema, toolStatusSchema, turnStateSchema } from './conversations.js';
import { localeSchema, providerModeSchema } from './events.js';

/** Below this many measurements a distribution is reported as insufficient, not guessed. */
export const ANALYTICS_MIN_SAMPLES = 5;
export const latencyMetricSchema = z.enum([
  'sttMs',
  'firstTextMs',
  'firstAudioMs',
  'totalMs',
  'slideAckMs',
]);

/** Live and demo results are never mixed: every query names exactly one provider mode. */
export const analyticsQuerySchema = z.strictObject({
  mode: providerModeSchema.default('live'),
  locale: localeSchema.optional(),
  days: z
    .string()
    .regex(/^[0-9]{1,2}$/)
    .transform(Number)
    .pipe(z.number().int().min(1).max(90))
    .default(7),
});

const count = z.number().int().nonnegative();
const scope = z.strictObject({
  mode: providerModeSchema,
  locale: localeSchema.nullable(),
  from: z.iso.datetime(),
  to: z.iso.datetime(),
});
export const analyticsOverviewSchema = z.strictObject({
  scope,
  sessions: z.strictObject({
    total: count,
    byActor: z.record(conversationActorSchema, count),
    byEndReason: z.record(z.string(), count),
  }),
  turns: z.strictObject({
    total: count,
    voice: count,
    byState: z.record(turnStateSchema, count),
    byFailure: z.record(z.string(), count),
  }),
  tools: z.strictObject({ total: count, byStatus: z.record(toolStatusSchema, count) }),
});

/** Percentiles are measured values (percentile_disc), null while samples are insufficient.
 * `missing` counts turns in scope that recorded no value for the metric. */
export const latencyDistributionSchema = z.strictObject({
  metric: latencyMetricSchema,
  samples: count,
  missing: count,
  p50: z.number().nullable(),
  p90: z.number().nullable(),
  p95: z.number().nullable(),
  max: z.number().nullable(),
});
export const analyticsLatencySchema = z.strictObject({
  scope,
  minimumSamples: z.number().int().positive(),
  metrics: z.array(latencyDistributionSchema),
});

export type AnalyticsOverview = z.infer<typeof analyticsOverviewSchema>;
export type AnalyticsLatency = z.infer<typeof analyticsLatencySchema>;
export type LatencyDistribution = z.infer<typeof latencyDistributionSchema>;
export type LatencyMetric = z.infer<typeof latencyMetricSchema>;
