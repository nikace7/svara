import { z } from 'zod';
import { botDraftSchema, revisionSchema } from './authoring.js';
import { knowledgeDetailSchema, knowledgeStatusSchema } from './knowledge.js';
import { mediaMimeSchema } from './media.js';
import { slideDetailSchema } from './presentations.js';

export const RELEASE_LIMITS = {
  knowledgeEntries: 200,
  snapshotBytes: 4 * 1024 * 1024,
  previewMilliseconds: 30 * 60 * 1000,
  idempotencyMilliseconds: 24 * 60 * 60 * 1000,
  passages: 5,
  passageCharacters: 6000,
  trigramThreshold: 0.25,
} as const;
export const releaseCreateSchema = z.strictObject({ expectedRevision: revisionSchema });
export const idempotencyKeySchema = z
  .string()
  .min(16)
  .max(128)
  .regex(/^[A-Za-z0-9_-]+$/);
export const releaseKindSchema = z.enum(['PREVIEW', 'PUBLISHED']);
export const releaseProviderModeSchema = z.enum(['fixture', 'live']);
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const snapshotKnowledge = knowledgeDetailSchema
  .pick({
    id: true,
    revision: true,
    type: true,
    title: true,
    content: true,
    question: true,
  })
  .extend({ status: knowledgeStatusSchema });
const snapshotSlide = slideDetailSchema.omit({ presentationId: true, media: true, complete: true });
export const releaseMediaSchema = z.strictObject({
  id: z.uuid(),
  filename: z.string().min(1).max(160),
  mimeType: mediaMimeSchema,
  sha256: hash,
  byteLength: z
    .number()
    .int()
    .positive()
    .max(50 * 1024 * 1024),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  durationSeconds: z.number().positive().max(120).nullable(),
});
export const releaseSnapshotSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    providerMode: releaseProviderModeSchema,
    bot: z.strictObject({
      id: z.uuid(),
      name: z.string().min(1).max(120),
      description: z.string().max(1000),
      revision: revisionSchema,
      config: botDraftSchema,
    }),
    knowledge: z.array(snapshotKnowledge).max(RELEASE_LIMITS.knowledgeEntries),
    presentation: z
      .strictObject({
        id: z.uuid(),
        name: z.string().min(1).max(120),
        revision: revisionSchema,
        slides: z.array(snapshotSlide).max(50),
      })
      .nullable(),
    media: z.array(releaseMediaSchema).max(50),
  })
  .superRefine((value, context) => {
    const unique = (ids: string[], path: string) => {
      if (new Set(ids).size !== ids.length)
        context.addIssue({ code: 'custom', path: [path], message: 'Snapshot IDs must be unique.' });
    };
    unique(
      value.knowledge.map((entry) => entry.id),
      'knowledge',
    );
    unique(
      value.media.map((asset) => asset.id),
      'media',
    );
    const slides = value.presentation?.slides ?? [];
    unique(
      slides.map((slide) => slide.id),
      'presentation',
    );
    if (slides.some((slide, index) => slide.position !== index))
      context.addIssue({
        code: 'custom',
        path: ['presentation', 'slides'],
        message: 'Slides must be in complete contiguous order.',
      });
    const referenced = new Set(slides.flatMap((slide) => (slide.mediaId ? [slide.mediaId] : [])));
    if (
      referenced.size !== value.media.length ||
      value.media.some((asset) => !referenced.has(asset.id))
    )
      context.addIssue({
        code: 'custom',
        path: ['media'],
        message: 'Include exactly the referenced media manifest.',
      });
    if (new TextEncoder().encode(JSON.stringify(value)).byteLength > RELEASE_LIMITS.snapshotBytes)
      context.addIssue({
        code: 'custom',
        message: 'The release snapshot exceeds its storage limit.',
      });
  });
const metadata = {
  id: z.uuid(),
  botId: z.uuid(),
  botRevision: revisionSchema,
  providerMode: releaseProviderModeSchema,
  snapshotHash: hash,
  createdAt: z.iso.datetime(),
};
const published = z.strictObject({
  ...metadata,
  kind: z.literal('PUBLISHED'),
  version: revisionSchema,
  previewExpiresAt: z.null(),
});
const preview = z.strictObject({
  ...metadata,
  kind: z.literal('PREVIEW'),
  version: z.null(),
  previewExpiresAt: z.iso.datetime(),
});
export const releaseSummarySchema = z.discriminatedUnion('kind', [published, preview]);
export const releaseDetailSchema = z
  .discriminatedUnion('kind', [
    published.extend({ snapshot: releaseSnapshotSchema }),
    preview.extend({ snapshot: releaseSnapshotSchema }),
  ])
  .superRefine((value, context) => {
    if (
      value.botId !== value.snapshot.bot.id ||
      value.botRevision !== value.snapshot.bot.revision ||
      value.providerMode !== value.snapshot.providerMode
    )
      context.addIssue({
        code: 'custom',
        path: ['snapshot'],
        message: 'Snapshot metadata must match the release.',
      });
    if (
      value.kind === 'PUBLISHED' &&
      value.snapshot.knowledge.some((entry) => entry.status !== 'APPROVED')
    )
      context.addIssue({
        code: 'custom',
        path: ['snapshot', 'knowledge'],
        message: 'Published knowledge must be approved.',
      });
    if (
      value.kind === 'PREVIEW' &&
      Date.parse(value.previewExpiresAt) - Date.parse(value.createdAt) !==
        RELEASE_LIMITS.previewMilliseconds
    )
      context.addIssue({
        code: 'custom',
        path: ['previewExpiresAt'],
        message: 'Preview admission expires after 30 minutes.',
      });
  });
export const releaseIssueSchema = z.strictObject({
  code: z.enum([
    'MISSING_TRANSLATION',
    'UNAPPROVED_KNOWLEDGE',
    'INVALID_CONFIG',
    'MEDIA_NOT_READY',
    'EMPTY_PRESENTATION',
    'TOOL_REQUIRES_PRESENTATION',
    'RELEASE_LIMIT',
  ]),
  path: z.string().max(240),
  message: z.string().max(500),
  blocks: z.enum(['ALL', 'PUBLISH']),
});
export const releaseReadinessSchema = z.strictObject({
  botId: z.uuid(),
  botRevision: revisionSchema,
  providerMode: releaseProviderModeSchema,
  canPreview: z.boolean(),
  canPublish: z.boolean(),
  issues: z.array(releaseIssueSchema).max(1500),
});
export const releaseListSchema = z.strictObject({
  kind: z.enum(['ALL', 'PREVIEW', 'PUBLISHED']).default('ALL'),
  page: z.number().int().min(1).max(1000).default(1),
  pageSize: z.number().int().min(1).max(50).default(20),
});
export const releaseListQuerySchema = z
  .strictObject({
    kind: z.enum(['ALL', 'PREVIEW', 'PUBLISHED']).optional(),
    page: z
      .string()
      .regex(/^[0-9]+$/)
      .transform(Number)
      .optional(),
    pageSize: z
      .string()
      .regex(/^[0-9]+$/)
      .transform(Number)
      .optional(),
  })
  .pipe(releaseListSchema);
export const releasePageSchema = z.strictObject({
  items: z.array(releaseSummarySchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  pageSize: z.number().int().min(1).max(50),
});

/** Keep meaningful Unicode marks and numbers; normalise only canonical form, case and whitespace. */
export function normalizeKnowledgeText(value: string): string {
  return value.normalize('NFC').replace(/\s+/gu, ' ').trim().toLowerCase();
}
export const releaseSearchSchema = z.strictObject({
  locale: z.enum(['en', 'ne']),
  query: z
    .string()
    .max(500)
    .refine((value) => !value.includes('\u0000'), 'NUL characters are not supported.')
    .transform(normalizeKnowledgeText)
    .pipe(z.string().min(1)),
});
export const releasePassageSchema = z.strictObject({
  entryId: z.uuid(),
  title: z.string().max(160),
  question: z.string().max(500),
  text: z.string().max(RELEASE_LIMITS.passageCharacters * 2),
  score: z.number().finite().nonnegative(),
  truncated: z.boolean(),
});
export function releasePassageCharacters(passage: {
  title: string;
  question: string;
  text: string;
}): number {
  return Array.from([passage.title, passage.question, passage.text].join('\n')).length;
}
export const releaseSearchResultSchema = z
  .strictObject({
    releaseId: z.uuid(),
    snapshotHash: hash,
    locale: z.enum(['en', 'ne']),
    passages: z.array(releasePassageSchema).max(RELEASE_LIMITS.passages),
  })
  .refine(
    (value) =>
      value.passages.reduce((sum, passage) => sum + releasePassageCharacters(passage), 0) <=
      RELEASE_LIMITS.passageCharacters,
    'Passages must fit the combined 6000-character Unicode budget.',
  );
export type ReleaseSnapshot = z.infer<typeof releaseSnapshotSchema>;
export type ReleaseMedia = z.infer<typeof releaseMediaSchema>;
export type ReleaseDetail = z.infer<typeof releaseDetailSchema>;
export type ReleaseSummary = z.infer<typeof releaseSummarySchema>;
export type ReleaseReadiness = z.infer<typeof releaseReadinessSchema>;
export type ReleaseIssue = z.infer<typeof releaseIssueSchema>;
export type ReleasePage = z.infer<typeof releasePageSchema>;
export type ReleaseSearchResult = z.infer<typeof releaseSearchResultSchema>;
