import { z } from 'zod';
import { localeSchema, providerModeSchema } from './events.js';

/** One playback packet's worth of 24 kHz PCM16, base64 encoded: 4,800 bytes max. */
export const AUDIO_PACKET_BYTES = 4800;

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
    /** Live mode only: the release whose knowledge grounds the answer. */
    releaseId: z.uuid().optional(),
  })
  .refine(
    (value) => (value.scenario === undefined) !== (value.text === undefined),
    'Choose one input.',
  );

export const FeasibilityEventSchema = z
  .strictObject({
    v: z.literal(1),
    turnId: z.uuid(),
    generation: z.number().int().min(1).max(2147483647),
    seq: z.number().int().nonnegative().max(1000),
    elapsedMs: z.number().finite().nonnegative(),
    type: z.enum(['transcript', 'answer', 'audio', 'complete', 'error']),
    text: z.string().max(2000),
    code: z
      .enum(['TTS_UNAVAILABLE', 'STT_UNAVAILABLE', 'PROVIDER_QUOTA', 'PROVIDER_UNAVAILABLE'])
      .optional(),
    providerMode: providerModeSchema,
    audio: z.enum(['unavailable', 'streaming']),
    segment: z.number().int().nonnegative().max(1000).optional(),
    end: z.boolean().optional(),
    pcm: z
      .base64()
      .max(Math.ceil(AUDIO_PACKET_BYTES / 3) * 4)
      .optional(),
  })
  // Audio packets carry their own ordering; text events must never smuggle one.
  .refine(
    (value) =>
      (value.type === 'audio') ===
      (value.pcm !== undefined && value.segment !== undefined && value.end !== undefined),
    'Audio events carry pcm, segment and end.',
  )
  .refine(
    (value) => value.audio === 'streaming' || value.type !== 'audio',
    'Audio packets require a streaming turn.',
  );
export type FeasibilityRequest = z.infer<typeof FeasibilityRequestSchema>;
export type FeasibilityEvent = z.infer<typeof FeasibilityEventSchema>;
export type FixtureScenarioId = z.infer<typeof fixtureScenarioSchema>;
