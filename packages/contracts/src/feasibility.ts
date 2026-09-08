import { z } from 'zod';
import { localeSchema } from './events.js';

export const fixtureScenarioSchema = z.enum([
  'supported_faq',
  'unsupported_question',
  'interrupt_answer',
  'tts_failure',
  'provider_quota',
]);
export const FeasibilityRequestSchema = z
  .strictObject({
    locale: localeSchema,
    generation: z.number().int().min(1).max(2147483647),
    scenario: fixtureScenarioSchema.optional(),
    text: z.string().trim().min(1).max(1000).optional(),
  })
  .refine(
    (value) => (value.scenario === undefined) !== (value.text === undefined),
    'Choose one input.',
  );

export const FeasibilityEventSchema = z.strictObject({
  v: z.literal(1),
  turnId: z.uuid(),
  generation: z.number().int().min(1).max(2147483647),
  seq: z.number().int().nonnegative().max(1000),
  elapsedMs: z.number().finite().nonnegative(),
  type: z.enum(['transcript', 'answer', 'complete', 'error']),
  text: z.string().max(2000),
  code: z.enum(['TTS_UNAVAILABLE', 'PROVIDER_QUOTA']).optional(),
  providerMode: z.literal('fixture'),
  audio: z.literal('unavailable'),
});
export type FeasibilityRequest = z.infer<typeof FeasibilityRequestSchema>;
export type FeasibilityEvent = z.infer<typeof FeasibilityEventSchema>;
export type FixtureScenarioId = z.infer<typeof fixtureScenarioSchema>;
