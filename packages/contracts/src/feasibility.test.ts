import { describe, expect, it } from 'vitest';
import {
  AUDIO_PACKET_BYTES,
  FeasibilityRequestSchema,
  FeasibilityEventSchema,
} from './feasibility.js';

describe('local feasibility contracts', () => {
  it('accepts exactly one bounded input and a supported explicit locale', () => {
    expect(
      FeasibilityRequestSchema.parse({ locale: 'ne-NP', generation: 1, text: ' नमस्ते ' }).text,
    ).toBe('नमस्ते');
    for (const invalid of [
      { locale: 'auto', generation: 1, text: 'test' },
      { locale: 'en-US', generation: 0, text: 'test' },
      { locale: 'en-US', generation: 1 },
      { locale: 'en-US', generation: 1, text: 'test', scenario: 'supported_faq' },
      { locale: 'en-US', generation: 1, text: 'x'.repeat(1001) },
      { locale: 'en-US', generation: 1, scenario: 'untrusted_action' },
      { locale: 'en-US', generation: 1, text: 'test', organisationId: 'other' },
    ])
      expect(FeasibilityRequestSchema.safeParse(invalid).success).toBe(false);
  });
  it('rejects unversioned/unbounded events', () => {
    expect(FeasibilityEventSchema.safeParse({ type: 'complete' }).success).toBe(false);
  });

  it('binds audio packets to streaming turns and their own ordering', () => {
    const base = {
      v: 1 as const,
      turnId: '00000000-0000-4000-8000-000000000000',
      generation: 1,
      seq: 0,
      elapsedMs: 12,
      text: '',
      providerMode: 'live' as const,
      audio: 'streaming' as const,
    };
    const pcm = Buffer.alloc(AUDIO_PACKET_BYTES).toString('base64');
    expect(
      FeasibilityEventSchema.parse({ ...base, type: 'audio', pcm, segment: 0, end: false }).pcm,
    ).toBe(pcm);
    expect(
      FeasibilityEventSchema.safeParse({ ...base, type: 'answer', text: 'Room A-101.' }).success,
    ).toBe(true);
    for (const invalid of [
      // An audio packet missing any ordering field, or a text event carrying audio.
      { ...base, type: 'audio', pcm, segment: 0 },
      { ...base, type: 'audio', segment: 0, end: true },
      { ...base, type: 'answer', text: 'x', pcm, segment: 0, end: true },
      // Oversized payload, non-base64 payload, and audio on a non-streaming turn.
      { ...base, type: 'audio', pcm: Buffer.alloc(4801).toString('base64'), segment: 0, end: true },
      { ...base, type: 'audio', pcm: 'not base64!', segment: 0, end: true },
      { ...base, type: 'audio', pcm, segment: 0, end: true, audio: 'unavailable' },
      { ...base, type: 'audio', pcm, segment: -1, end: true },
    ])
      expect(FeasibilityEventSchema.safeParse(invalid).success).toBe(false);
  });

  it('still accepts the fixture turn shape unchanged', () => {
    expect(
      FeasibilityEventSchema.parse({
        v: 1,
        turnId: '00000000-0000-4000-8000-000000000000',
        generation: 2,
        seq: 3,
        elapsedMs: 0,
        type: 'complete',
        text: 'done',
        providerMode: 'fixture',
        audio: 'unavailable',
      }).providerMode,
    ).toBe('fixture');
  });
});
