import { describe, expect, it } from 'vitest';
import type { FeasibilityEvent } from '@svara/contracts';
import { AUDIO_PACKET_BYTES, FeasibilityEventSchema } from '@svara/contracts';
import { GeminiError } from '@svara/providers';
import type {
  AnswerGenerator,
  ProviderContext,
  RecognitionEvent,
  SpeechRecognizer,
  SpeechSynthesizer,
} from '@svara/providers';
import { RecognitionError, runLiveTurn, transcribe } from './live-feasibility.js';

const speech = (bytes: number) => new ArrayBuffer(bytes);
function providers(
  deltas: string[],
  synthesize: (text: string) => ArrayBuffer[] = () => [speech(480)],
) {
  const asked: { question: string; passages: number }[] = [];
  const spoken: string[] = [];
  const generator: AnswerGenerator = {
    async *generate(input, context: ProviderContext) {
      asked.push({ question: input.question, passages: input.passages.length });
      for (const delta of deltas) {
        context.signal.throwIfAborted();
        yield delta;
      }
    },
  };
  const synthesizer: SpeechSynthesizer = {
    async *synthesize(text, context: ProviderContext) {
      spoken.push(text);
      for (const pcm of synthesize(text)) {
        context.signal.throwIfAborted();
        yield pcm;
      }
    },
  };
  return { generator, synthesizer, asked, spoken };
}
const request = { locale: 'ne-NP' as const, generation: 4, text: 'भर्ना कार्यालय कहाँ छ?' };

async function collect(
  iterable: AsyncIterable<FeasibilityEvent>,
): Promise<{ events: FeasibilityEvent[]; failure?: unknown }> {
  const events: FeasibilityEvent[] = [];
  try {
    for await (const event of iterable) events.push(FeasibilityEventSchema.parse(event));
  } catch (failure) {
    return { events, failure };
  }
  return { events };
}

describe('live feasibility turn', () => {
  it('streams the question, sentence subtitles, ordered audio and completion', async () => {
    const { generator, synthesizer, asked, spoken } = providers([
      'कोठा A-101 मा छ। ',
      'बिहान १० बजे खुल्छ।',
    ]);
    const { events, failure } = await collect(
      runLiveTurn(
        request,
        { generator, synthesizer, passages: [{ id: 'p1', text: 'A-101' }] },
        new AbortController().signal,
      ),
    );
    expect(failure).toBeUndefined();
    expect(asked).toEqual([{ question: request.text, passages: 1 }]);
    // The segmenter cuts after the sentence mark, so the following space leads the next one.
    expect(spoken).toEqual(['कोठा A-101 मा छ।', ' बिहान १० बजे खुल्छ।']);

    expect(events.map((event) => event.type)).toEqual([
      'transcript',
      'answer',
      'audio',
      'answer',
      'audio',
      'complete',
    ]);
    expect(events[0]!.text).toBe(request.text);
    expect(events.every((event) => event.providerMode === 'live')).toBe(true);
    expect(events.every((event) => event.audio === 'streaming')).toBe(true);
    expect(events.map((event) => event.seq)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(new Set(events.map((event) => event.turnId)).size).toBe(1);
    expect(events.every((event) => event.generation === 4)).toBe(true);

    const audio = events.filter((event) => event.type === 'audio');
    expect(audio.map((event) => event.segment)).toEqual([0, 1]);
    expect(audio.map((event) => event.end)).toEqual([true, true]);
    expect(Buffer.from(audio[0]!.pcm!, 'base64')).toHaveLength(480);
  });

  it('splits long speech into playback-sized packets and marks only the last one final', async () => {
    const { generator, synthesizer } = providers(['One sentence only.'], () => [
      speech(AUDIO_PACKET_BYTES + 200),
      speech(100),
    ]);
    const { events } = await collect(
      runLiveTurn(
        { ...request, locale: 'en-US' },
        { generator, synthesizer, passages: [] },
        new AbortController().signal,
      ),
    );
    const audio = events.filter((event) => event.type === 'audio');
    expect(audio.map((event) => Buffer.from(event.pcm!, 'base64').byteLength)).toEqual([
      AUDIO_PACKET_BYTES,
      200,
      100,
    ]);
    expect(audio.map((event) => event.end)).toEqual([false, false, true]);
    expect(audio.every((event) => event.segment === 0)).toBe(true);
  });

  it('reports a provider quota failure with its code and stops', async () => {
    const generator: AnswerGenerator = {
      // eslint-disable-next-line require-yield
      async *generate() {
        throw new GeminiError('PROVIDER_QUOTA', 429, 'quota exhausted');
      },
    };
    const { synthesizer, spoken } = providers([]);
    const { events, failure } = await collect(
      runLiveTurn(request, { generator, synthesizer, passages: [] }, new AbortController().signal),
    );
    expect(failure).toBeUndefined();
    expect(spoken).toEqual([]);
    const last = events.at(-1)!;
    expect(last.type).toBe('error');
    expect(last.code).toBe('PROVIDER_QUOTA');
    expect(last.text).toMatch(/quota/i);
    expect(last.text).not.toMatch(/429/);
  });

  it('keeps delivered subtitles when speech fails midway', async () => {
    const { generator, synthesizer } = providers(['First. ', 'Second.'], (text) => {
      if (text.includes('Second')) throw new GeminiError('PROVIDER_UNAVAILABLE', 503, 'rejected');
      return [speech(240)];
    });
    const { events } = await collect(
      runLiveTurn(request, { generator, synthesizer, passages: [] }, new AbortController().signal),
    );
    expect(events.filter((event) => event.type === 'answer').map((event) => event.text)).toEqual([
      'First.',
      ' Second.',
    ]);
    const last = events.at(-1)!;
    expect(last.type).toBe('error');
    expect(last.code).toBe('TTS_UNAVAILABLE');
  });

  it('refuses an empty answer rather than reporting a silent success', async () => {
    const { generator, synthesizer } = providers(['   ']);
    const { events } = await collect(
      runLiveTurn(request, { generator, synthesizer, passages: [] }, new AbortController().signal),
    );
    expect(events.at(-1)!.type).toBe('error');
    expect(events.some((event) => event.type === 'audio')).toBe(false);
  });

  it('propagates cancellation without emitting a completion', async () => {
    const controller = new AbortController();
    const { generator, synthesizer } = providers(['One. ', 'Two. ', 'Three.'], () => {
      controller.abort();
      return [speech(240)];
    });
    const { events, failure } = await collect(
      runLiveTurn(request, { generator, synthesizer, passages: [] }, controller.signal),
    );
    expect(failure).toBeInstanceOf(DOMException);
    expect(events.some((event) => event.type === 'complete')).toBe(false);
    expect(events.some((event) => event.type === 'error')).toBe(false);
  });

  it('rejects a turn without a typed question', async () => {
    const { generator, synthesizer } = providers(['x']);
    const { failure } = await collect(
      runLiveTurn(
        { locale: 'en-US', generation: 1, scenario: 'supported_faq' },
        { generator, synthesizer, passages: [] },
        new AbortController().signal,
      ),
    );
    expect(failure).toBeInstanceOf(Error);
  });
});

describe('recorded question transcription', () => {
  function recognizer(result: RecognitionEvent) {
    const frames: { seq: number; bytes: number }[] = [];
    const state = { closed: false, locale: '' };
    const value: SpeechRecognizer = {
      async open(context, emit) {
        state.locale = context.locale;
        return {
          write: ({ seq, pcm }) => {
            frames.push({ seq, bytes: pcm.byteLength });
          },
          finish: async () => emit(result),
          close: () => {
            state.closed = true;
          },
        };
      },
    };
    return { value, frames, state };
  }

  it('replays the recording as ordered 100 ms frames and returns the trimmed transcript', async () => {
    const { value, frames, state } = recognizer({ type: 'final', text: '  भर्ना कहाँ छ?  ' });
    const text = await transcribe(
      value,
      // A Buffer, as the server passes it: its slices are views, not copies.
      Buffer.alloc(8000),
      'ne-NP',
      new AbortController().signal,
    );
    expect(text).toBe('भर्ना कहाँ छ?');
    expect(frames).toEqual([
      { seq: 0, bytes: 3200 },
      { seq: 1, bytes: 3200 },
      { seq: 2, bytes: 1600 },
    ]);
    expect(state).toEqual({ closed: true, locale: 'ne-NP' });
  });

  it('reports recognition failures by code and still closes the session', async () => {
    const { value, state } = recognizer({ type: 'error', code: 'PROVIDER_QUOTA' });
    const failure = await transcribe(
      value,
      new Uint8Array(3200),
      'en-US',
      new AbortController().signal,
    ).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(RecognitionError);
    expect((failure as RecognitionError).code).toBe('PROVIDER_QUOTA');
    expect(state.closed).toBe(true);
  });
});
