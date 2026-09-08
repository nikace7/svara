import { describe, expect, it } from 'vitest';
import {
  knowledgeCreateSchema,
  knowledgeSaveSchema,
  knowledgeApprovalErrors,
  knowledgeListQuerySchema,
} from './knowledge.js';

const content = { en: 'Open Monday to Friday.', ne: 'सोमबारदेखि शुक्रबारसम्म खुला छ।' };
const question = { en: 'When is the office open?', ne: 'कार्यालय कहिले खुल्छ?' };
describe('bilingual knowledge contracts', () => {
  it('allows incomplete drafts but identifies every missing approval translation', () => {
    expect(knowledgeCreateSchema.parse({ type: 'FAQ', title: '  Office hours  ' }).title).toBe(
      'Office hours',
    );
    expect(
      knowledgeSaveSchema.safeParse({
        type: 'FAQ',
        title: 'Office',
        content: { en: '', ne: '' },
        question: { en: '', ne: '' },
        expectedRevision: 1,
      }).success,
    ).toBe(true);
    expect(
      Object.keys(
        knowledgeApprovalErrors({
          type: 'FAQ',
          content: { en: '  ', ne: '' },
          question: { en: '', ne: '' },
        }),
      ),
    ).toEqual(['content.en', 'question.en', 'content.ne', 'question.ne']);
    expect(knowledgeApprovalErrors({ type: 'FAQ', content, question })).toEqual({});
  });
  it('accepts notes without questions and rejects invented authority or oversized content', () => {
    const note = {
      type: 'NOTE',
      title: 'Reception',
      content,
      question: { en: '', ne: '' },
      expectedRevision: 1,
    };
    expect(knowledgeApprovalErrors(note)).toEqual({});
    expect(knowledgeSaveSchema.safeParse(note).success).toBe(true);
    expect(knowledgeSaveSchema.safeParse({ ...note, question }).success).toBe(false);
    expect(knowledgeSaveSchema.safeParse({ ...note, approved: true }).success).toBe(false);
    expect(
      knowledgeSaveSchema.safeParse({ ...note, content: { en: 'x'.repeat(8001), ne: '' } }).success,
    ).toBe(false);
    expect(
      knowledgeCreateSchema.safeParse({ type: 'FAQ', title: 'Office', organisationId: 'injected' })
        .success,
    ).toBe(false);
  });
  it('bounds search pages and accepts only explicit approval and type filters', () => {
    expect(
      knowledgeListQuerySchema.parse({ page: '2', status: 'APPROVED', type: 'FAQ' }),
    ).toMatchObject({ page: 2, status: 'APPROVED', type: 'FAQ' });
    for (const query of [
      { page: '-1' },
      { pageSize: '51' },
      { status: 'anything' },
      { botId: 'other' },
      { page: ['1', '2'] },
    ])
      expect(knowledgeListQuerySchema.safeParse(query).success).toBe(false);
  });
});
