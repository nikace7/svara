import { z } from 'zod';
import { revisionSchema } from './authoring.js';
import { mediaDetailSchema } from './media.js';

export const PRESENTATION_LIMITS = { perBot: 20, slides: 50 } as const;
const name = z.string().trim().min(1).max(120);
const title = z.strictObject({ en: z.string().max(160), ne: z.string().max(160) });
const body = z.strictObject({ en: z.string().max(2000), ne: z.string().max(2000) });
export const slideTargetSchema = z.enum(['PRIMARY', 'SECONDARY', 'BOTH']);
const fields = {
  title,
  body,
  mediaId: z.uuid().nullable(),
  target: slideTargetSchema,
  durationSeconds: z.number().int().min(1).max(600),
};
export const presentationCreateSchema = z.strictObject({ botId: z.uuid(), name });
export const presentationSaveSchema = z.strictObject({ name, expectedRevision: revisionSchema });
export const presentationDeleteSchema = z.strictObject({ expectedRevision: revisionSchema });
export const presentationListQuerySchema = z.strictObject({ botId: z.uuid() });
export const presentationSelectionSchema = z.strictObject({
  presentationId: z.uuid().nullable(),
  expectedRevision: revisionSchema,
});
export const slideCreateSchema = z.strictObject({
  ...fields,
  title: title.default({ en: '', ne: '' }),
  body: body.default({ en: '', ne: '' }),
  mediaId: fields.mediaId.default(null),
  target: slideTargetSchema.default('BOTH'),
  durationSeconds: fields.durationSeconds.default(10),
  expectedRevision: revisionSchema,
});
export const slideSaveSchema = z.strictObject({ ...fields, expectedRevision: revisionSchema });
export const slideDeleteSchema = presentationDeleteSchema;
export const slideOrderSchema = z.strictObject({
  expectedRevision: revisionSchema,
  slideIds: z
    .array(z.uuid())
    .max(PRESENTATION_LIMITS.slides)
    .refine((ids) => new Set(ids).size === ids.length, 'Include every slide once.'),
});
export const slideDetailSchema = z.strictObject({
  ...fields,
  id: z.uuid(),
  presentationId: z.uuid(),
  revision: z.number().int().positive(),
  position: z
    .number()
    .int()
    .min(0)
    .max(PRESENTATION_LIMITS.slides - 1),
  media: mediaDetailSchema.nullable(),
  complete: z.strictObject({ en: z.boolean(), ne: z.boolean() }),
});
export const presentationSummarySchema = z.strictObject({
  id: z.uuid(),
  botId: z.uuid(),
  name,
  revision: z.number().int().positive(),
  updatedAt: z.iso.datetime(),
  slideCount: z.number().int().min(0).max(PRESENTATION_LIMITS.slides),
});
export const presentationDetailSchema = presentationSummarySchema.extend({
  botRevision: z.number().int().positive(),
  botArchivedAt: z.iso.datetime().nullable(),
  selected: z.boolean(),
  slides: z.array(slideDetailSchema).max(PRESENTATION_LIMITS.slides),
});
export const presentationListSchema = z.strictObject({
  botId: z.uuid(),
  botRevision: z.number().int().positive(),
  botArchivedAt: z.iso.datetime().nullable(),
  selectedPresentationId: z.uuid().nullable(),
  items: z.array(presentationSummarySchema).max(PRESENTATION_LIMITS.perBot),
});
export const presentationSelectionResultSchema = z.strictObject({
  presentationId: z.uuid().nullable(),
  botRevision: z.number().int().positive(),
});
export type SlideDetail = z.infer<typeof slideDetailSchema>;
export type PresentationDetail = z.infer<typeof presentationDetailSchema>;
export type PresentationList = z.infer<typeof presentationListSchema>;
export type PresentationSelection = z.infer<typeof presentationSelectionResultSchema>;

/** Draft text can be incomplete; publication and the editor share these missing-field checks. */
export function slideTranslationErrors(
  value: Pick<SlideDetail, 'title' | 'body'>,
): Record<string, string[]> {
  const errors: Record<string, string[]> = {};
  const hasBody = Boolean(value.body.en.trim() || value.body.ne.trim());
  for (const locale of ['en', 'ne'] as const) {
    if (!value.title[locale].trim())
      errors[`title.${locale}`] = ['Add a slide title in this language.'];
    if (hasBody && !value.body[locale].trim())
      errors[`body.${locale}`] = ['Translate the slide text into this language.'];
  }
  return errors;
}
