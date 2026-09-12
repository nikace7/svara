import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { emptyBotDraft } from './authoring.js';
import {
  idempotencyKeySchema,
  releaseCreateSchema,
  releaseDetailSchema,
  releaseSnapshotSchema,
  releaseSearchSchema,
  normalizeKnowledgeText,
} from './releases.js';

function snapshot() {
  return {
    schemaVersion: 1,
    providerMode: 'fixture',
    bot: {
      id: randomUUID(),
      name: 'Campus guide',
      description: '',
      revision: 4,
      config: emptyBotDraft(),
    },
    knowledge: [
      {
        id: randomUUID(),
        revision: 2,
        type: 'FAQ',
        title: 'Welcome',
        status: 'APPROVED',
        content: { en: 'Welcome to campus.', ne: 'स्वागत छ।' },
        question: { en: 'Where do I start?', ne: 'कहाँ सुरु गर्ने?' },
      },
    ],
    presentation: null,
    media: [],
  };
}

describe('immutable release contracts', () => {
  it('requires explicit revisions and bounds idempotency keys without accepting actor scope', () => {
    expect(releaseCreateSchema.parse({ expectedRevision: 4 })).toEqual({ expectedRevision: 4 });
    for (const value of [
      {},
      { expectedRevision: 0 },
      { expectedRevision: 4, organisationId: randomUUID() },
      { expectedRevision: 4, providerMode: 'live' },
    ])
      expect(releaseCreateSchema.safeParse(value).success).toBe(false);
    expect(idempotencyKeySchema.parse(randomUUID())).toHaveLength(36);
    for (const key of [
      '',
      'short',
      'x'.repeat(129),
      'a'.repeat(20) + '\n',
      'space in an identifier',
    ])
      expect(idempotencyKeySchema.safeParse(key).success).toBe(false);
  });
  it('freezes public metadata and bilingual content without private storage or credential fields', () => {
    const value = snapshot();
    expect(releaseSnapshotSchema.parse(value)).toEqual(value);
    expect(releaseSnapshotSchema.safeParse({ ...value, apiKey: 'forbidden' }).success).toBe(false);
    expect(
      releaseSnapshotSchema.safeParse({
        ...value,
        bot: { ...value.bot, config: { ...value.bot.config, voiceNe: 'en-US-JennyNeural' } },
      }).success,
    ).toBe(false);
    expect(
      releaseSnapshotSchema.safeParse({
        ...value,
        knowledge: [...value.knowledge, ...value.knowledge],
      }).success,
    ).toBe(false);
  });
  it('requires a complete unique slide order and exactly the referenced media manifest', () => {
    const value = snapshot();
    const asset = {
      id: randomUUID(),
      filename: 'Welcome.png',
      mimeType: 'image/png',
      sha256: 'a'.repeat(64),
      byteLength: 128,
      width: 32,
      height: 32,
      durationSeconds: null,
    };
    const slide = {
      id: randomUUID(),
      revision: 1,
      position: 0,
      title: { en: 'Hello', ne: 'नमस्ते' },
      body: { en: '', ne: '' },
      mediaId: asset.id,
      target: 'BOTH',
      durationSeconds: 10,
    };
    const presentation = { id: randomUUID(), name: 'Welcome', revision: 3, slides: [slide] };
    expect(
      releaseSnapshotSchema.safeParse({ ...value, presentation, media: [asset] }).success,
    ).toBe(true);
    for (const patch of [
      { presentation, media: [] },
      { presentation, media: [asset, { ...asset, id: randomUUID() }] },
      { presentation, media: [{ ...asset, storageKey: 'private-object.png' }] },
      { presentation: { ...presentation, slides: [{ ...slide, position: 1 }] }, media: [asset] },
      {
        presentation: { ...presentation, slides: [slide, { ...slide, position: 1 }] },
        media: [asset],
      },
    ])
      expect(releaseSnapshotSchema.safeParse({ ...value, ...patch }).success).toBe(false);
  });
  it('keeps published numbering separate from expiring preview records', () => {
    const value = snapshot();
    const common = {
      id: randomUUID(),
      botId: value.bot.id,
      botRevision: 4,
      providerMode: 'fixture',
      snapshotHash: 'b'.repeat(64),
      createdAt: '2026-09-12T00:00:00.000Z',
      snapshot: value,
    };
    expect(
      releaseDetailSchema.safeParse({
        ...common,
        kind: 'PUBLISHED',
        version: 1,
        previewExpiresAt: null,
      }).success,
    ).toBe(true);
    expect(
      releaseDetailSchema.safeParse({
        ...common,
        kind: 'PREVIEW',
        version: null,
        previewExpiresAt: '2026-09-12T00:30:00.000Z',
      }).success,
    ).toBe(true);
    for (const patch of [
      { kind: 'PUBLISHED', version: null, previewExpiresAt: null },
      { kind: 'PREVIEW', version: 1, previewExpiresAt: '2026-09-12T00:30:00.000Z' },
      { kind: 'PREVIEW', version: null, previewExpiresAt: null },
      { kind: 'PUBLISHED', version: 1, previewExpiresAt: null, botId: randomUUID() },
    ])
      expect(releaseDetailSchema.safeParse({ ...common, ...patch }).success).toBe(false);
  });
  it('normalizes search text without removing Nepali vowel marks, numbers or punctuation', () => {
    expect(normalizeKnowledgeText('  CAFÉ\n  Desk\t12 ')).toBe('café desk 12');
    expect(normalizeKnowledgeText('Cafe\u0301')).toBe('café');
    expect(normalizeKnowledgeText('  भर्ना\u00a0कक्ष\n१२ कहाँ छ? ')).toBe('भर्ना कक्ष १२ कहाँ छ?');
    expect(releaseSearchSchema.parse({ locale: 'ne', query: '  भर्ना कक्ष  ' }).query).toBe(
      'भर्ना कक्ष',
    );
    for (const input of [
      { locale: 'en', query: ' ' },
      { locale: 'fr', query: 'Hello' },
      { locale: 'en', query: 'x'.repeat(501) },
      { locale: 'en', query: 'Hello', organisationId: randomUUID() },
    ])
      expect(releaseSearchSchema.safeParse(input).success).toBe(false);
  });
});
