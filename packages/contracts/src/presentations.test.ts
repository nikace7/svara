import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  presentationCreateSchema,
  presentationSelectionSchema,
  slideCreateSchema,
  slideOrderSchema,
  slideSaveSchema,
  slideTranslationErrors,
} from './presentations.js';

describe('structured presentation contracts', () => {
  it('accepts incomplete bilingual drafts and bounded screen settings', () => {
    expect(presentationCreateSchema.parse({ botId: randomUUID(), name: '  Welcome  ' }).name).toBe(
      'Welcome',
    );
    const slide = slideCreateSchema.parse({ expectedRevision: 1 });
    expect(slide).toMatchObject({
      title: { en: '', ne: '' },
      body: { en: '', ne: '' },
      mediaId: null,
      target: 'BOTH',
      durationSeconds: 10,
    });
    expect(
      slideSaveSchema.safeParse({ ...slide, title: { en: 'Welcome', ne: 'स्वागत छ' } }).success,
    ).toBe(true);
    for (const patch of [
      { target: 'ANY' },
      { durationSeconds: 0 },
      { durationSeconds: 601 },
      { durationSeconds: 2.5 },
      { title: { en: 'x'.repeat(161), ne: '' } },
      { body: { en: 'x'.repeat(2001), ne: '' } },
      { mediaId: '../private' },
      { organisationId: randomUUID() },
      { position: 9 },
      { revision: 3 },
    ])
      expect(slideSaveSchema.safeParse({ ...slide, ...patch }).success).toBe(false);
  });
  it('requires titles in both languages and translates body text when present', () => {
    expect(
      slideTranslationErrors({ title: { en: ' ', ne: '' }, body: { en: 'Hello', ne: '' } }),
    ).toEqual({
      'title.en': expect.any(Array),
      'title.ne': expect.any(Array),
      'body.ne': expect.any(Array),
    });
    expect(
      slideTranslationErrors({ title: { en: 'Hello', ne: 'नमस्ते' }, body: { en: '', ne: '' } }),
    ).toEqual({});
    expect(
      slideTranslationErrors({
        title: { en: 'Hello', ne: 'नमस्ते' },
        body: { en: '', ne: 'नमस्ते' },
      }),
    ).toHaveProperty('body.en');
  });
  it('bounds complete order submissions and requires an explicit revision', () => {
    const id = randomUUID();
    expect(slideOrderSchema.parse({ slideIds: [], expectedRevision: 1 }).slideIds).toEqual([]);
    for (const value of [
      { slideIds: [id, id], expectedRevision: 1 },
      { slideIds: Array.from({ length: 51 }, randomUUID), expectedRevision: 1 },
      { slideIds: [id] },
      { slideIds: [id], expectedRevision: 0 },
    ])
      expect(slideOrderSchema.safeParse(value).success).toBe(false);
  });
  it('accepts clearing the draft selection and rejects invented authority', () => {
    expect(
      presentationSelectionSchema.parse({ presentationId: null, expectedRevision: 2 })
        .presentationId,
    ).toBeNull();
    expect(
      presentationSelectionSchema.safeParse({
        presentationId: randomUUID(),
        expectedRevision: 2,
        botId: randomUUID(),
      }).success,
    ).toBe(false);
    expect(
      presentationCreateSchema.safeParse({
        botId: randomUUID(),
        name: ' ',
        organisationId: randomUUID(),
      }).success,
    ).toBe(false);
  });
});
