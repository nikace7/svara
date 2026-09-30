export class SentenceSegments {
  private buffer = '';
  private readonly segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
  constructor(private readonly limit = 240) {
    if (!Number.isInteger(limit) || limit < 1 || limit > 240)
      throw new Error('Invalid segment limit.');
  }
  push(delta: string): string[] {
    this.buffer += delta;
    return this.drain(false);
  }
  finish(): string[] {
    return this.drain(true);
  }
  private drain(final: boolean): string[] {
    const result: string[] = [];
    while (this.buffer) {
      const graphemes = [...this.segmenter.segment(this.buffer)];
      // Retain the last grapheme: a following delta may add a combining mark/surrogate.
      const available = final ? graphemes.length : graphemes.length - 1;
      let count = 0;
      for (let i = 0; i < Math.min(available, this.limit); i++) {
        const item = graphemes[i]!;
        if (/[.!?।\n]/u.test(item.segment)) {
          count = i + 1;
          break;
        }
      }
      if (!count && available >= this.limit) count = this.limit;
      if (!count && final) count = available;
      if (!count) break;
      const cut = graphemes[count - 1]!.index + graphemes[count - 1]!.segment.length;
      result.push(this.buffer.slice(0, cut));
      this.buffer = this.buffer.slice(cut);
    }
    return result;
  }
}

export interface SegmentSynthesizer {
  synthesize(text: string, signal: AbortSignal): AsyncIterable<ArrayBuffer>;
}

/** Async iteration is the backpressure boundary: never pre-schedule later speech. */
export async function* synthesizeOrdered(
  segments: Iterable<string> | AsyncIterable<string>,
  synthesizer: SegmentSynthesizer,
  signal: AbortSignal,
): AsyncGenerator<{ segment: number; seq: number; pcm: ArrayBuffer }> {
  let segment = 0;
  let seq = 0;
  for await (const text of segments) {
    signal.throwIfAborted();
    for await (const pcm of synthesizer.synthesize(text, signal)) {
      signal.throwIfAborted();
      yield { segment, seq: seq++, pcm };
    }
    segment++;
  }
}

/** Removes bracketed passage labels such as [2] or [1, 3] and reports the labels cited. */
export function extractCitations(sentence: string): { text: string; labels: string[] } {
  const labels: string[] = [];
  const text = sentence
    .replace(/\s*\[(\d{1,2}(?:\s*,\s*\d{1,2})*)\]/g, (_match, list: string) => {
      labels.push(...list.split(',').map((label) => label.trim()));
      return '';
    })
    // A slide label is not a citation; one written instead of a show_slide call is dropped.
    .replace(/\s*\[S\d{1,2}\]/g, '')
    .replace(/ {2,}/g, ' ');
  return { text, labels };
}
