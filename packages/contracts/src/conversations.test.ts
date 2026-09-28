import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  assistantLinkSaveSchema,
  conversationTurnSchema,
  sessionListQuerySchema,
  turnEventSchema,
} from './conversations.js';

const event = {
  v: 1,
  sessionId: randomUUID(),
  turnId: randomUUID(),
  generation: 1,
  seq: 0,
  elapsedMs: 5,
  type: 'answer',
  text: 'Admissions is in room 12.',
  providerMode: 'fixture',
  audio: 'unavailable',
} as const;

describe('conversation contracts', () => {
  it('accepts exactly one turn input', () => {
    const base = { generation: 1, clientMessageId: randomUUID(), locale: 'ne-NP' };
    expect(conversationTurnSchema.safeParse({ ...base, text: 'भर्ना कहाँ छ?' }).success).toBe(true);
    expect(conversationTurnSchema.safeParse({ ...base, retryOf: randomUUID() }).success).toBe(true);
    expect(conversationTurnSchema.safeParse(base).success).toBe(false);
    expect(conversationTurnSchema.safeParse({ ...base, text: 'Hi', audio: 'AAAA' }).success).toBe(
      false,
    );
    expect(conversationTurnSchema.safeParse({ ...base, text: 'x'.repeat(2001) }).success).toBe(
      false,
    );
  });

  it('binds audio and tool payloads to their own event types', () => {
    expect(turnEventSchema.safeParse(event).success).toBe(true);
    expect(
      turnEventSchema.safeParse({ ...event, pcm: 'AAAA', segment: 0, end: true }).success,
    ).toBe(false);
    expect(
      turnEventSchema.safeParse({
        ...event,
        type: 'audio',
        text: '',
        pcm: 'AAAA',
        segment: 0,
        end: true,
      }).success,
    ).toBe(false);
    const tool = {
      name: 'show_slide',
      status: 'PENDING',
      reason: null,
      slideId: null,
      target: null,
    };
    expect(turnEventSchema.safeParse({ ...event, type: 'tool', tool }).success).toBe(true);
    expect(turnEventSchema.safeParse({ ...event, tool }).success).toBe(false);
  });

  it('requires a revision for link changes and bounds session pages', () => {
    const link = { releaseId: randomUUID(), label: '', enabled: false, expiresAt: null };
    expect(assistantLinkSaveSchema.safeParse(link).success).toBe(false);
    expect(assistantLinkSaveSchema.safeParse({ ...link, expectedRevision: 1 }).success).toBe(true);
    expect(sessionListQuerySchema.parse({ limit: '100' })).toEqual({ limit: 100 });
    expect(sessionListQuerySchema.safeParse({ limit: '101' }).success).toBe(false);
  });
});
