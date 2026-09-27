import { randomUUID } from 'node:crypto';
import { AUDIO_PACKET_BYTES } from '@svara/contracts';
import type { FeasibilityEvent, FeasibilityRequest } from '@svara/contracts';
import { GeminiError, SentenceSegments } from '@svara/providers';
import type {
  AnswerGenerator,
  RecognitionEvent,
  SpeechRecognizer,
  SpeechSynthesizer,
} from '@svara/providers';

export interface LiveTurnProviders {
  generator: AnswerGenerator;
  synthesizer: SpeechSynthesizer;
  /** Passages retrieved for this turn from the release the caller chose. */
  passages: readonly { id: string; text: string }[];
}

export class RecognitionError extends Error {
  constructor(readonly code: Extract<RecognitionEvent, { type: 'error' }>['code']) {
    super('Recognition failed.');
  }
}

/** One recorded question → trimmed transcript. The recording is replayed as the 100 ms
 * frames the recognizer expects; an empty string means no speech was heard. */
export async function transcribe(
  recognizer: SpeechRecognizer,
  pcm: Uint8Array,
  locale: FeasibilityRequest['locale'],
  signal: AbortSignal,
): Promise<string> {
  let result: RecognitionEvent | undefined;
  const session = await recognizer.open({ locale, mode: 'live', signal }, (event) => {
    if (event.type === 'final' || event.type === 'error') result = event;
  });
  try {
    for (let seq = 0; seq * 3200 < pcm.byteLength; seq++)
      // Copy each frame: a Node Buffer's slice is a view onto a larger shared allocation.
      session.write({
        seq,
        pcm: new Uint8Array(pcm.subarray(seq * 3200, (seq + 1) * 3200)).buffer,
      });
    await session.finish();
  } finally {
    session.close();
  }
  const outcome = result as RecognitionEvent | undefined;
  if (outcome?.type === 'error') throw new RecognitionError(outcome.code);
  return outcome?.type === 'final' ? outcome.text.trim() : '';
}

function providerCode(error: unknown, speaking: boolean): NonNullable<FeasibilityEvent['code']> {
  if (error instanceof GeminiError && error.code === 'PROVIDER_QUOTA') return 'PROVIDER_QUOTA';
  if (speaking) return 'TTS_UNAVAILABLE';
  return 'PROVIDER_UNAVAILABLE';
}
const failureText: Record<NonNullable<FeasibilityEvent['code']>, string> = {
  PROVIDER_QUOTA: 'The provider quota is exhausted. Read any partial text and retry later.',
  TTS_UNAVAILABLE: 'Speech is unavailable for this answer. The text above is complete.',
  STT_UNAVAILABLE: 'Recognition is unavailable. Type the question instead.',
  PROVIDER_UNAVAILABLE: 'The provider did not answer. Read any partial text or retry.',
};

/** Live turn: typed question → grounded answer → ordered 24 kHz speech packets.
 * ponytail: one buffered REST stage per step. The Live API session replaces this
 * when hands-free barge-in needs sub-second turnaround. */
export async function* runLiveTurn(
  request: FeasibilityRequest,
  providers: LiveTurnProviders,
  signal: AbortSignal,
): AsyncGenerator<FeasibilityEvent> {
  signal.throwIfAborted();
  const question = request.text?.trim();
  if (!question) throw new Error('Live mode answers typed questions only.');
  const started = performance.now();
  const turnId = randomUUID();
  let seq = 0;
  const event = (
    type: FeasibilityEvent['type'],
    text: string,
    extra: Partial<FeasibilityEvent> = {},
  ): FeasibilityEvent => ({
    v: 1,
    turnId,
    generation: request.generation,
    seq: seq++,
    elapsedMs: performance.now() - started,
    type,
    text,
    providerMode: 'live',
    audio: 'streaming',
    ...extra,
  });
  const context = { locale: request.locale, mode: 'live' as const, signal };

  yield event('transcript', question);
  const splitter = new SentenceSegments();
  let segment = 0;
  let spoke = false;
  let speaking = false;
  try {
    const speak = async function* (text: string) {
      speaking = true;
      const packets: ArrayBuffer[] = [];
      for await (const pcm of providers.synthesizer.synthesize(text, context)) {
        signal.throwIfAborted();
        // Playback accepts bounded packets, so split whatever the provider returned.
        for (let offset = 0; offset < pcm.byteLength; offset += AUDIO_PACKET_BYTES)
          packets.push(pcm.slice(offset, Math.min(offset + AUDIO_PACKET_BYTES, pcm.byteLength)));
      }
      speaking = false;
      for (const [index, packet] of packets.entries())
        yield event('audio', '', {
          pcm: Buffer.from(packet).toString('base64'),
          segment,
          end: index === packets.length - 1,
        });
      segment++;
    };
    const emit = async function* (sentences: string[]) {
      for (const sentence of sentences) {
        signal.throwIfAborted();
        // A whitespace-only drain is not an answer and must not be sent to speech.
        if (!sentence.trim()) continue;
        spoke = true;
        yield event('answer', sentence);
        yield* speak(sentence);
      }
    };
    for await (const delta of providers.generator.generate(
      { question, passages: providers.passages, history: [] },
      context,
    )) {
      signal.throwIfAborted();
      yield* emit(splitter.push(delta));
    }
    yield* emit(splitter.finish());
    signal.throwIfAborted();
    if (!spoke) throw new GeminiError('PROVIDER_UNAVAILABLE', undefined, 'returned no answer');
    yield event('complete', 'Live turn completed.');
  } catch (error) {
    if (signal.aborted) throw error;
    const code = providerCode(error, speaking);
    yield event('error', failureText[code], { code });
  }
}
