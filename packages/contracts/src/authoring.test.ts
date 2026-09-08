import { describe, expect, it } from 'vitest';
import { botCreateSchema, botDraftSchema, botSaveSchema } from './authoring.js';

describe('bot authoring contracts', () => {
  it('allows incomplete bilingual drafts but bounds text, voices and tool names', () => {
    const draft = botDraftSchema.parse({
      persona: '',
      greeting: { en: '', ne: '' },
      fallback: { en: '', ne: '' },
      voiceEn: 'en-US-JennyNeural',
      voiceNe: 'ne-NP-HemkalaNeural',
      tools: ['lookup_knowledge'],
    });
    expect(draft.greeting.ne).toBe('');
    expect(botDraftSchema.safeParse({ ...draft, tools: ['run_shell'] }).success).toBe(false);
    expect(botDraftSchema.safeParse({ ...draft, voiceNe: 'en-US-JennyNeural' }).success).toBe(
      false,
    );
    expect(
      botDraftSchema.safeParse({ ...draft, tools: ['lookup_knowledge', 'lookup_knowledge'] })
        .success,
    ).toBe(false);
    expect(botDraftSchema.safeParse({ ...draft, persona: 'x'.repeat(4001) }).success).toBe(false);
    expect(botSaveSchema.safeParse({ name: 'Guide', description: '', draft }).success).toBe(false);
    expect(
      botSaveSchema.safeParse({ name: 'Guide', description: '', draft, expectedRevision: 1 })
        .success,
    ).toBe(true);
  });
  it('does not accept client organisation authority or blank names', () => {
    expect(botCreateSchema.parse({ name: '  प्रवेश मार्गदर्शक  ', description: '' }).name).toBe(
      'प्रवेश मार्गदर्शक',
    );
    expect(botCreateSchema.safeParse({ name: ' ', description: '' }).success).toBe(false);
    expect(
      botCreateSchema.safeParse({ name: 'Guide', description: '', organisationId: 'anything' })
        .success,
    ).toBe(false);
  });
});
