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
