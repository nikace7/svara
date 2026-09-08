import { z } from 'zod';

const name = z.string().trim().min(1).max(120);
const description = z.string().trim().max(1000);
const translation = z.strictObject({ en: z.string().max(2000), ne: z.string().max(2000) });
export const revisionSchema = z.number().int().min(1).max(2147483646);
export const botToolSchema = z.enum([
  'lookup_knowledge',
  'get_event_schedule',
  'select_reference',
  'show_slide',
]);
export const botDraftSchema = z.strictObject({
  persona: z.string().max(4000),
  greeting: translation,
  fallback: translation,
  voiceEn: z.literal('en-US-JennyNeural'),
  voiceNe: z.enum(['ne-NP-HemkalaNeural', 'ne-NP-SagarNeural']),
  tools: z
    .array(botToolSchema)
    .max(4)
    .refine((tools) => new Set(tools).size === tools.length, 'Choose each tool only once.'),
});
export type BotDraft = z.infer<typeof botDraftSchema>;
export const botCreateSchema = z.strictObject({ name, description: description.default('') });
export const botSaveSchema = z.strictObject({
  name,
  description,
  draft: botDraftSchema,
  expectedRevision: revisionSchema,
});
export const botArchiveSchema = z.strictObject({
  archived: z.boolean(),
  expectedRevision: revisionSchema,
});
export const botListSchema = z.strictObject({
  search: z.string().trim().max(120).default(''),
  page: z.number().int().min(1).max(1000).default(1),
  pageSize: z.number().int().min(1).max(50).default(20),
  includeArchived: z.boolean().default(false),
});

export const botListQuerySchema = z
  .strictObject({
    search: z.string().max(120).optional(),
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
    includeArchived: z
      .enum(['true', 'false'])
      .transform((value) => value === 'true')
      .optional(),
  })
  .pipe(botListSchema);

export const botSummarySchema = z.strictObject({
  id: z.uuid(),
  name,
  description,
  revision: z.number().int().positive(),
  archivedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export const botDetailSchema = botSummarySchema.extend({ draft: botDraftSchema });
export const botPageSchema = z.strictObject({
  items: z.array(botSummarySchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  pageSize: z.number().int().min(1).max(50),
});
export type BotSummary = z.infer<typeof botSummarySchema>;
export type BotDetail = z.infer<typeof botDetailSchema>;
export type BotPage = z.infer<typeof botPageSchema>;

export function emptyBotDraft(): BotDraft {
  return {
    persona: '',
    greeting: { en: '', ne: '' },
    fallback: { en: '', ne: '' },
    voiceEn: 'en-US-JennyNeural',
    voiceNe: 'ne-NP-HemkalaNeural',
    tools: ['lookup_knowledge', 'select_reference'],
  };
}
