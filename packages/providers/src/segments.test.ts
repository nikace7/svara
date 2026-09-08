import { describe, expect, it } from 'vitest';
import { SentenceSegments, synthesizeOrdered } from './segments.js';

describe('English/Nepali synthesis segmentation', () => {
  it('recognizes both scripts without losing text', () => {
    const splitter = new SentenceSegments();
    const text = 'Hello. नमस्ते। Room A-101 is open!';
    const parts = [...splitter.push(text), ...splitter.finish()];
    expect(parts.join('')).toBe(text);
    expect(parts.map((x) => x.trim())).toEqual(['Hello.', 'नमस्ते।', 'Room A-101 is open!']);
  });
  it('bounds long segments and retains grapheme boundaries across deltas', () => {
    const splitter = new SentenceSegments(4);
    const parts: string[] = [];
    for (const chunk of ['abc\ud83d', '\ude00', 'e', '\u0301नमस्तेxyz'])
      parts.push(...splitter.push(chunk));
    parts.push(...splitter.finish());
    expect(parts.join('')).toBe('abc😀éनमस्तेxyz');
    for (const part of parts) {
      expect([...new Intl.Segmenter().segment(part)].length).toBeLessThanOrEqual(4);
      expect(part).not.toMatch(/^[\u0300-\u036f\udc00-\udfff]/u);
    }
  });
  it('rejects invalid limits and flushes empty input safely', () => {
    expect(() => new SentenceSegments(0)).toThrow();
    expect(new SentenceSegments().finish()).toEqual([]);
  });
});

describe('ordered synthesis with backpressure', () => {
  it('does not schedule the next segment until the consumer requests it', async () => {
    const calls: string[] = [];
    const synth = {
      async *synthesize(text: string) {
        calls.push(text);
        yield new ArrayBuffer(2);
      },
    };
    const stream = synthesizeOrdered(['First.', 'दोस्रो।'], synth, new AbortController().signal);
    expect((await stream.next()).value?.segment).toBe(0);
    expect(calls).toEqual(['First.']);
    expect((await stream.next()).value?.segment).toBe(1);
    expect(calls).toEqual(['First.', 'दोस्रो।']);
    expect((await stream.next()).done).toBe(true);
  });
  it('drops a late result after cancellation and never starts a new segment', async () => {
    const controller = new AbortController();
    const synth = {
      async *synthesize() {
        controller.abort();
        yield new ArrayBuffer(2);
      },
    };
    await expect(
      synthesizeOrdered(['First.', 'Second.'], synth, controller.signal).next(),
    ).rejects.toMatchObject({ name: 'AbortError' });
  });
});
