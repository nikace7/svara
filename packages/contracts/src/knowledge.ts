import { z } from 'zod';
import { revisionSchema } from './authoring.js';

export const knowledgeTypeSchema = z.enum(['FAQ', 'NOTE']);
export const knowledgeStatusSchema = z.enum(['DRAFT', 'APPROVED']);
const title = z.string().trim().min(1).max(160);
const content = z.strictObject({ en: z.string().max(8000), ne: z.string().max(8000) });
const question = z.strictObject({ en: z.string().max(500), ne: z.string().max(500) });
export const knowledgeCreateSchema = z.strictObject({ type: knowledgeTypeSchema, title });
export const knowledgeSaveSchema = z
  .strictObject({
    type: knowledgeTypeSchema,
    title,
    content,
    question,
    expectedRevision: revisionSchema,
  })
  .refine(
    (value) => value.type === 'FAQ' || (!value.question.en.trim() && !value.question.ne.trim()),
    'Reference notes do not have FAQ questions.',
  );
export const knowledgeApprovalSchema = z.strictObject({
  expectedRevision: revisionSchema,
  approved: z.boolean(),
});
export const knowledgeSelectionSchema = z.strictObject({
  expectedRevision: revisionSchema,
  selected: z.boolean(),
});
export const knowledgeDeleteSchema = z.strictObject({ expectedRevision: revisionSchema });
export const knowledgeListSchema = z.strictObject({
  search: z.string().trim().max(160).default(''),
  page: z.number().int().min(1).max(1000).default(1),
  pageSize: z.number().int().min(1).max(50).default(20),
  status: z.enum(['ALL', 'DRAFT', 'APPROVED']).default('ALL'),
  type: z.enum(['ALL', 'FAQ', 'NOTE']).default('ALL'),
});
export const knowledgeListQuerySchema = z
  .strictObject({
    search: z.string().max(160).optional(),
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
    status: z.enum(['ALL', 'DRAFT', 'APPROVED']).optional(),
    type: z.enum(['ALL', 'FAQ', 'NOTE']).optional(),
  })
  .pipe(knowledgeListSchema);

export const knowledgeSummarySchema = z.strictObject({
  id: z.uuid(),
  botId: z.uuid(),
  type: knowledgeTypeSchema,
  title,
  status: knowledgeStatusSchema,
  selected: z.boolean(),
  revision: z.number().int().positive(),
  complete: z.strictObject({ en: z.boolean(), ne: z.boolean() }),
  approvedAt: z.iso.datetime().nullable(),
  updatedAt: z.iso.datetime(),
});
export const knowledgeDetailSchema = knowledgeSummarySchema.extend({
  content,
  question,
  botRevision: z.number().int().positive(),
  botArchivedAt: z.iso.datetime().nullable(),
});
export const knowledgePageSchema = z.strictObject({
  items: z.array(knowledgeSummarySchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  pageSize: z.number().int().min(1).max(50),
});
export type KnowledgeSummary = z.infer<typeof knowledgeSummarySchema>;
export type KnowledgeDetail = z.infer<typeof knowledgeDetailSchema>;
export type KnowledgePage = z.infer<typeof knowledgePageSchema>;
export type KnowledgeText = Pick<
  z.infer<typeof knowledgeSaveSchema>,
  'type' | 'title' | 'content' | 'question'
>;

export function knowledgeApprovalErrors(value: {
  type: string;
  content: { en: string; ne: string };
  question: { en: string; ne: string };
}): Record<string, string[]> {
  const errors: Record<string, string[]> = {};
  for (const locale of ['en', 'ne'] as const) {
    const language = locale === 'en' ? 'English' : 'Nepali';
    if (!value.content[locale].trim())
      errors[`content.${locale}`] = [`Add ${language} content before approving.`];
    if (value.type === 'FAQ' && !value.question[locale].trim())
      errors[`question.${locale}`] = [`Add the ${language} question before approving.`];
  }
  return errors;
}
