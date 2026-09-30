import { describe, expect, it } from 'vitest';
import { extractCitations, SentenceSegments, synthesizeOrdered } from './segments.js';

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

describe('citation labels', () => {
  it('strips bracketed labels and reports them without touching other text', () => {
    expect(extractCitations('Admissions is in room 12 [1].')).toEqual({
      text: 'Admissions is in room 12.',
      labels: ['1'],
    });
    expect(extractCitations('कोठा १२ मा छ। [2, 3]')).toEqual({
      text: 'कोठा १२ मा छ।',
      labels: ['2', '3'],
    });
    expect(extractCitations('Room [A-101] is open.')).toEqual({
      text: 'Room [A-101] is open.',
      labels: [],
    });
    // A slide label written instead of a show_slide call is not a citation and is never spoken.
    expect(extractCitations('म स्वागत स्लाइड देखाउँदैछु। [S1]')).toEqual({
      text: 'म स्वागत स्लाइड देखाउँदैछु।',
      labels: [],
    });
  });
});
