import { z } from 'zod';
import { revisionSchema } from './authoring.js';
import { localeSchema, providerModeSchema } from './events.js';
import { AUDIO_PACKET_BYTES, MAX_QUESTION_AUDIO_BYTES } from './feasibility.js';
import { runtimeReleaseSchema } from './runtime.js';

/** Blueprint section 7 defaults. Daily limits count live sessions only. */
export const CONVERSATION_LIMITS = {
  sessionSeconds: 300,
  idleSeconds: 60,
  organisationConcurrent: 10,
  dailyLiveSessions: 100,
  dailyLiveSeconds: 3600,
  typedCharacters: 2000,
  toolCalls: 4,
  rounds: 2,
  slideAckMs: 3000,
  historyTurns: 6,
  resumeMinutes: 10,
  grantMinutes: 30,
  grantSessions: 20,
  grantTurns: 60,
} as const;

export const conversationActorSchema = z.enum(['STAFF', 'DEVICE', 'VISITOR']);
export const turnStateSchema = z.enum(['ANSWERING', 'COMPLETED', 'INTERRUPTED', 'FAILED']);
export const toolStatusSchema = z.enum(['DONE', 'APPLIED', 'PENDING', 'REJECTED', 'FAILED']);
const generation = z.number().int().min(1).max(2147483647);

export const conversationAdmitSchema = z.strictObject({
  locale: localeSchema,
  /** Staff choose a release; devices and visitors are pinned by the server. */
  releaseId: z.uuid().optional(),
  /** Reconnect: the same actor's immediately interrupted session, never another actor's. */
  resumeFrom: z.uuid().optional(),
});
export const conversationTurnSchema = z
  .strictObject({
    generation,
    clientMessageId: z.uuid(),
    locale: localeSchema,
    text: z.string().trim().min(1).max(CONVERSATION_LIMITS.typedCharacters).optional(),
    audio: z
      .base64()
      .max(Math.ceil(MAX_QUESTION_AUDIO_BYTES / 3) * 4)
      .optional(),
    /** Answers the same question again without repeating any side effect it already made. */
    retryOf: z.uuid().optional(),
  })
  .refine(
    (value) => [value.text, value.audio, value.retryOf].filter((v) => v !== undefined).length === 1,
    'Choose one input.',
  );
export const conversationInterruptSchema = z.strictObject({ generation });

export const conversationSessionSchema = z.strictObject({
  id: z.uuid(),
  releaseId: z.uuid(),
  actorKind: conversationActorSchema,
  locale: localeSchema,
  providerMode: providerModeSchema,
  status: z.enum(['ACTIVE', 'ENDED']),
  generation: z.number().int().nonnegative(),
  startedAt: z.iso.datetime(),
  idleUntil: z.iso.datetime(),
  endsBy: z.iso.datetime(),
  endedAt: z.iso.datetime().nullable(),
  endReason: z.string().nullable(),
  resumedFromId: z.uuid().nullable(),
});
const historyTurn = z.strictObject({
  locale: localeSchema,
  question: z.string(),
  answer: z.string(),
  state: turnStateSchema,
});
export const conversationAdmissionSchema = z.strictObject({
  session: conversationSessionSchema,
  /** Restored final questions and answers when resuming; the last unfinished one is marked. */
  history: z.array(historyTurn).max(CONVERSATION_LIMITS.historyTurns),
  tools: z.array(z.string()),
});

const citation = z.strictObject({ entryId: z.uuid(), title: z.string().max(160) });
export const turnErrorCodeSchema = z.enum([
  'TTS_UNAVAILABLE',
  'STT_UNAVAILABLE',
  'PROVIDER_QUOTA',
  'PROVIDER_UNAVAILABLE',
  'NO_SPEECH',
  'SESSION_ENDED',
]);
/** One line of a turn's NDJSON stream. Sequence numbers start at 0 for every turn. */
export const turnEventSchema = z
  .strictObject({
    v: z.literal(1),
    sessionId: z.uuid(),
    turnId: z.uuid(),
    generation,
    seq: z.number().int().nonnegative().max(2000),
    elapsedMs: z.number().finite().nonnegative(),
    type: z.enum(['transcript', 'answer', 'audio', 'reference', 'tool', 'complete', 'error']),
    text: z.string().max(2000),
    providerMode: providerModeSchema,
    audio: z.enum(['unavailable', 'streaming']),
    code: turnErrorCodeSchema.optional(),
    segment: z.number().int().nonnegative().max(1000).optional(),
    end: z.boolean().optional(),
    pcm: z
      .base64()
      .max(Math.ceil(AUDIO_PACKET_BYTES / 3) * 4)
      .optional(),
    citations: z.array(citation).max(10).optional(),
    tool: z
      .strictObject({
        name: z.string().max(32),
        status: toolStatusSchema,
        reason: z.string().max(64).nullable(),
        slideId: z.uuid().nullable(),
        target: z.enum(['PRIMARY', 'SECONDARY']).nullable(),
      })
      .optional(),
  })
  .refine(
    (value) =>
      (value.type === 'audio') ===
      (value.pcm !== undefined && value.segment !== undefined && value.end !== undefined),
    'Audio events carry pcm, segment and end.',
  )
  .refine(
    (value) => value.audio === 'streaming' || value.type !== 'audio',
    'Audio packets require a streaming turn.',
  )
  .refine((value) => (value.type === 'tool') === (value.tool !== undefined), 'Tool events only.');

const toolRecord = z.strictObject({
  id: z.uuid(),
  name: z.string(),
  status: toolStatusSchema,
  reason: z.string().nullable(),
  arguments: z.unknown().nullable(),
  result: z.unknown().nullable(),
  commandId: z.uuid().nullable(),
  commandStatus: z.string().nullable(),
  createdAt: z.iso.datetime(),
});
export const sessionTurnSchema = z.strictObject({
  id: z.uuid(),
  ordinal: z.number().int().positive(),
  locale: localeSchema,
  inputKind: z.enum(['TEXT', 'VOICE']),
  question: z.string(),
  answer: z.string(),
  state: turnStateSchema,
  failureCode: z.string().nullable(),
  citedEntryIds: z.array(z.uuid()),
  retryOfId: z.uuid().nullable(),
  timings: z.strictObject({
    sttMs: z.number().int().nullable(),
    firstTextMs: z.number().int().nullable(),
    firstAudioMs: z.number().int().nullable(),
    totalMs: z.number().int().nullable(),
  }),
  createdAt: z.iso.datetime(),
  tools: z.array(toolRecord),
});
export const sessionSummarySchema = conversationSessionSchema.extend({
  botName: z.string(),
  releaseVersion: z.number().int().positive().nullable(),
  deviceName: z.string().nullable(),
  linkLabel: z.string().nullable(),
  turns: z.number().int().nonnegative(),
  transcriptDeleted: z.boolean(),
});
export const sessionDetailSchema = sessionSummarySchema.extend({
  turnList: z.array(sessionTurnSchema),
});
export const sessionListQuerySchema = z.strictObject({
  cursor: z.uuid().optional(),
  limit: z
    .string()
    .regex(/^[0-9]{1,3}$/)
    .transform(Number)
    .pipe(z.number().int().min(1).max(100))
    .optional(),
  actorKind: conversationActorSchema.optional(),
  status: z.enum(['ACTIVE', 'ENDED']).optional(),
});

export const assistantLinkCreateSchema = z.strictObject({
  releaseId: z.uuid(),
  label: z.string().trim().max(120).default(''),
  expiresAt: z.iso.datetime().nullable().default(null),
});
export const assistantLinkSaveSchema = z.strictObject({
  releaseId: z.uuid(),
  label: z.string().trim().max(120),
  enabled: z.boolean(),
  expiresAt: z.iso.datetime().nullable(),
  expectedRevision: revisionSchema,
});
export const assistantLinkSchema = z.strictObject({
  id: z.uuid(),
  slug: z.string().regex(/^[a-z0-9]{12,32}$/),
  releaseId: z.uuid(),
  botName: z.string(),
  releaseVersion: z.number().int().positive(),
  label: z.string(),
  enabled: z.boolean(),
  expiresAt: z.iso.datetime().nullable(),
  revision: z.number().int().positive(),
  activeSessions: z.number().int().nonnegative(),
  createdAt: z.iso.datetime(),
});

/** What anyone holding the link sees: greeting, slides and suggestions, never the knowledge. */
export const publicAssistantSchema = z.strictObject({
  slug: z.string(),
  providerMode: providerModeSchema,
  release: runtimeReleaseSchema,
  suggestions: z.strictObject({
    en: z.array(z.string().max(500)).max(3),
    ne: z.array(z.string().max(500)).max(3),
  }),
});
export const visitorGrantSchema = z.strictObject({
  csrfToken: z.string(),
  expiresAt: z.iso.datetime(),
});

export type ConversationAdmit = z.infer<typeof conversationAdmitSchema>;
export type ConversationTurnRequest = z.infer<typeof conversationTurnSchema>;
export type ConversationSession = z.infer<typeof conversationSessionSchema>;
export type ConversationAdmission = z.infer<typeof conversationAdmissionSchema>;
export type TurnEvent = z.infer<typeof turnEventSchema>;
export type TurnErrorCode = z.infer<typeof turnErrorCodeSchema>;
export type ToolStatus = z.infer<typeof toolStatusSchema>;
export type SessionSummary = z.infer<typeof sessionSummarySchema>;
export type SessionDetail = z.infer<typeof sessionDetailSchema>;
export type AssistantLink = z.infer<typeof assistantLinkSchema>;
export type PublicAssistant = z.infer<typeof publicAssistantSchema>;
