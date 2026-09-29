import { AUDIO_PACKET_BYTES, CONVERSATION_LIMITS } from '@svara/contracts';
import type { TurnErrorCode, TurnEvent } from '@svara/contracts';
import { extractCitations, GeminiError, SentenceSegments } from '@svara/providers';
import type {
  AnswerGenerator,
  AnswerInput,
  ProposedToolCall,
  ProviderContext,
  SpeechRecognizer,
  SpeechSynthesizer,
  ToolDeclaration,
} from '@svara/providers';
import { RecognitionError, transcribe } from '../live-feasibility.js';
import type { ConversationActor, ConversationService, TurnContext } from './service.js';

export interface ConversationProviders {
  generator: AnswerGenerator;
  /** Absent in demo mode: answers are text only. */
  synthesizer?: SpeechSynthesizer;
  /** Absent in demo mode: questions are typed only. */
  recognizer?: SpeechRecognizer;
}
/** Delivers a persisted slide command to the kiosk's connected windows. */
export interface SlideChannel {
  show(
    deviceId: string,
    command: { id: string; stateRevision: number; slideId: string; target: string },
  ): Promise<void> | void;
}
export interface TurnRunner {
  service: Pick<
    ConversationService,
    'tool' | 'search' | 'setTranscript' | 'finishTurn' | 'slideOutcome'
  >;
  providers: ConversationProviders;
  slides?: SlideChannel;
  sleep?: (ms: number) => Promise<void>;
}

const GENERATION_MS = 20_000;
const SPEECH_MS = 10_000;
const RECOGNITION_MS = 15_000;
const failureText: Record<TurnErrorCode, string> = {
  PROVIDER_QUOTA: 'The provider quota is exhausted. Read any partial text and retry later.',
  TTS_UNAVAILABLE: 'Speech is unavailable for this answer. The text is complete.',
  STT_UNAVAILABLE: 'Recognition is unavailable. Type the question instead.',
  PROVIDER_UNAVAILABLE: 'The assistant did not answer. Read any partial text or retry.',
  NO_SPEECH: 'No speech was heard. Try again, or type the question.',
  SESSION_ENDED: 'This conversation has ended. Start a new one.',
};
const declarations: Record<string, ToolDeclaration> = {
  lookup_knowledge: {
    name: 'lookup_knowledge',
    description: 'Search the approved knowledge again with a different query.',
    parameters: { query: { description: 'What to search for.' } },
    required: ['query'],
  },
  select_reference: {
    name: 'select_reference',
    description: 'Show one reference passage to the visitor.',
    parameters: { passage: { description: 'The passage label, for example 1.' } },
    required: ['passage'],
  },
  get_event_schedule: {
    name: 'get_event_schedule',
    description: 'Get the current event and its hours for this kiosk.',
    parameters: {},
    required: [],
  },
  show_slide: {
    name: 'show_slide',
    description: 'Show one of the listed slides on this kiosk.',
    parameters: {
      slide: { description: 'The slide label, for example S1.' },
      target: { description: 'Which screen.', enum: ['PRIMARY', 'SECONDARY', 'BOTH'] },
    },
    required: ['slide'],
  },
};
class InvalidCitation extends Error {}

function providerCode(error: unknown): TurnErrorCode {
  return error instanceof GeminiError && error.code === 'PROVIDER_QUOTA'
    ? 'PROVIDER_QUOTA'
    : 'PROVIDER_UNAVAILABLE';
}

/**
 * One conversation turn as an NDJSON event stream. The turn row is finished on every path,
 * including cancellation, so an interrupted answer keeps what was generated with INTERRUPTED
 * provenance. Tool calls run only after their round finished streaming.
 */
export async function* runConversationTurn(
  actor: ConversationActor,
  turn: TurnContext,
  runner: TurnRunner,
  signal: AbortSignal,
): AsyncGenerator<TurnEvent> {
  const { providers, service } = runner;
  const sleep = runner.sleep ?? ((ms) => new Promise<void>((done) => setTimeout(done, ms)));
  const started = performance.now();
  const since = () => performance.now() - started;
  const language = turn.locale === 'ne-NP' ? 'ne' : 'en';
  let seq = 0;
  const event = (type: TurnEvent['type'], text: string, extra: Partial<TurnEvent> = {}) =>
    ({
      v: 1,
      sessionId: turn.sessionId,
      turnId: turn.turnId,
      generation: turn.generation,
      seq: seq++,
      elapsedMs: since(),
      type,
      text,
      providerMode: turn.providerMode,
      audio: providers.synthesizer ? 'streaming' : 'unavailable',
      ...extra,
    }) as TurnEvent;
  const timings: { sttMs?: number; firstTextMs?: number; firstAudioMs?: number } = {};
  const cited = new Set<string>();
  let answer = '';
  let state: 'COMPLETED' | 'INTERRUPTED' | 'FAILED' = 'FAILED';
  let failure: string | null = null;
  let speechFailed = !providers.synthesizer;
  let segment = 0;

  const speak = async function* (text: string): AsyncGenerator<TurnEvent> {
    if (speechFailed) return;
    const packets: ArrayBuffer[] = [];
    try {
      const context = {
        locale: turn.locale,
        mode: turn.providerMode,
        signal: AbortSignal.any([signal, AbortSignal.timeout(SPEECH_MS)]),
      };
      for await (const pcm of providers.synthesizer!.synthesize(text, context))
        for (let offset = 0; offset < pcm.byteLength; offset += AUDIO_PACKET_BYTES)
          packets.push(pcm.slice(offset, Math.min(offset + AUDIO_PACKET_BYTES, pcm.byteLength)));
    } catch (error) {
      if (signal.aborted) throw error;
      // The text stays complete; only speech stops for the rest of this turn.
      speechFailed = true;
      yield event('error', failureText.TTS_UNAVAILABLE, { code: 'TTS_UNAVAILABLE' });
      return;
    }
    timings.firstAudioMs ??= since();
    for (const [index, packet] of packets.entries())
      yield event('audio', '', {
        pcm: Buffer.from(packet).toString('base64'),
        segment,
        end: index === packets.length - 1,
      });
    segment++;
  };
  const say = async function* (text: string): AsyncGenerator<TurnEvent> {
    timings.firstTextMs ??= since();
    const sentence = text.trim();
    answer += (answer ? ' ' : '') + sentence;
    yield event('answer', sentence);
    yield* speak(sentence);
  };

  try {
    let question = turn.question;
    if (turn.audio) {
      if (!providers.recognizer) {
        failure = 'STT_UNAVAILABLE';
        yield event('error', failureText.STT_UNAVAILABLE, { code: 'STT_UNAVAILABLE' });
        return;
      }
      try {
        question = await transcribe(
          providers.recognizer,
          turn.audio,
          turn.locale,
          AbortSignal.any([signal, AbortSignal.timeout(RECOGNITION_MS)]),
        );
      } catch (error) {
        if (signal.aborted) throw error;
        failure =
          error instanceof RecognitionError && error.code === 'PROVIDER_QUOTA'
            ? 'PROVIDER_QUOTA'
            : 'STT_UNAVAILABLE';
        yield event('error', failureText[failure as TurnErrorCode], {
          code: failure as TurnErrorCode,
        });
        return;
      }
      timings.sttMs = since();
      if (!question) {
        failure = 'NO_SPEECH';
        yield event('error', failureText.NO_SPEECH, { code: 'NO_SPEECH' });
        return;
      }
      await service.setTranscript(turn, question);
    }
    yield event('transcript', question);
    signal.throwIfAborted();

    const found = await service.search(turn, turn.locale, question);
    const passages = found.passages.map((passage, index) => ({
      id: String(index + 1),
      entryId: passage.entryId,
      title: passage.title,
      text: [passage.title, passage.question, passage.text].filter(Boolean).join('\n'),
    }));
    const slides = turn.tools.includes('show_slide')
      ? (turn.snapshot.presentation?.slides ?? []).map((slide, index) => ({
          label: `S${index + 1}`,
          id: slide.id,
          title: slide.title[language] || slide.title.en,
        }))
      : [];
    const fallback = turn.snapshot.bot.config.fallback[language];
    const done = turn.priorTools.map((tool) => `${tool.name}: ${tool.status}`).join(', ');
    const input: AnswerInput = {
      question,
      passages,
      history: turn.history,
      instructions:
        turn.snapshot.bot.config.persona +
        (done ? `\nAlready done for this question, do not repeat: ${done}.` : ''),
      tools: turn.tools.map((name) => declarations[name]!),
      slides: slides.map(({ label, title }) => ({ label, title })),
    };
    // Nothing approved matches and nothing can be shown: the approved fallback, not generation.
    const generate = passages.length > 0 || slides.length > 0;
    // With no evidence the model is asked only in case the question is a slide request: its
    // first-round words are not grounded, so they are dropped and the fallback answers instead.
    const evidence = passages.length > 0;

    const execute = async function* (
      calls: ProposedToolCall[],
    ): AsyncGenerator<TurnEvent, { callId: string; name: string; result: unknown }[]> {
      const results: { callId: string; name: string; result: unknown }[] = [];
      for (const call of calls) {
        const args: Record<string, unknown> = { ...call.args };
        if (call.name === 'show_slide')
          args.slideId = slides.find((slide) => slide.label === call.args.slide)?.id;
        if (call.name === 'select_reference')
          args.entryId = passages.find(
            (passage) => passage.id === String(call.args.passage),
          )?.entryId;
        const outcome = await service.tool(actor, turn, {
          callId: call.callId,
          name: call.name,
          args,
        });
        let status = outcome.status;
        const result = (outcome.result ?? {}) as Record<string, unknown>;
        if (call.name === 'show_slide' && outcome.command && status === 'PENDING') {
          if (!outcome.duplicate && turn.deviceId)
            await runner.slides?.show(turn.deviceId, {
              id: outcome.command.id,
              stateRevision: outcome.command.stateRevision,
              slideId: String(result.slideId),
              target: String(result.target),
            });
          // Wait for the kiosk's acknowledgement, but never report APPLIED without it.
          for (
            let waited = 0;
            status === 'PENDING' && waited < CONVERSATION_LIMITS.slideAckMs;
            waited += 150
          ) {
            await sleep(150);
            signal.throwIfAborted();
            status = await service.slideOutcome(outcome.id);
          }
        }
        if (call.name === 'select_reference' && status === 'DONE')
          yield event('reference', String(result.title ?? ''), {
            citations: [{ entryId: String(result.entryId), title: String(result.title ?? '') }],
          });
        if (call.name === 'lookup_knowledge' && status === 'DONE')
          for (const passage of (result.passages ?? []) as {
            entryId: string;
            title: string;
            text: string;
          }[])
            passages.push({ ...passage, id: String(passages.length + 1) });
        yield event('tool', '', {
          tool: {
            name: call.name.slice(0, 32),
            status,
            reason: outcome.reason,
            slideId:
              call.name === 'show_slide' && typeof result.slideId === 'string'
                ? result.slideId
                : null,
            target:
              result.target === 'PRIMARY' ||
              result.target === 'SECONDARY' ||
              result.target === 'BOTH'
                ? result.target
                : null,
          },
        });
        results.push({
          callId: call.callId,
          name: call.name,
          result: { status, reason: outcome.reason, ...result },
        });
      }
      return results;
    };

    // One bounded regeneration if the first sentence cites evidence it was not given, and
    // only before any tool ran: a retry must never repeat a side effect.
    let spoke = false;
    let executed = false;
    for (let attempt = 0; generate && attempt < 2; attempt++) {
      try {
        const calls: ProposedToolCall[] = [];
        for (let round = 0; round < CONVERSATION_LIMITS.rounds; round++) {
          const splitter = new SentenceSegments();
          const emit = async function* (sentences: string[]): AsyncGenerator<TurnEvent> {
            for (const sentence of sentences) {
              const { text, labels } = extractCitations(sentence);
              const entries = labels.map(
                (label) => passages.find((passage) => passage.id === label)?.entryId,
              );
              if (entries.some((entry) => !entry)) throw new InvalidCitation();
              // A label can arrive as its own fragment after the sentence it supports.
              for (const entry of entries) cited.add(entry!);
              if (!text.trim() || (round === 0 && !evidence)) continue;
              spoke = true;
              yield* say(text);
            }
          };
          const context: ProviderContext = {
            locale: turn.locale,
            mode: turn.providerMode,
            signal: AbortSignal.any([signal, AbortSignal.timeout(GENERATION_MS)]),
          };
          const request: AnswerInput =
            round === 0
              ? input
              : { ...input, passages, toolRound: { calls, results: yield* execute(calls) } };
          executed ||= round > 0;
          for await (const chunk of providers.generator.generate(request, context)) {
            signal.throwIfAborted();
            if (typeof chunk !== 'string') {
              if (
                round === 0 &&
                calls.length < CONVERSATION_LIMITS.toolCalls &&
                !calls.some((call) => call.callId === chunk.callId)
              )
                calls.push(chunk);
              continue;
            }
            yield* emit(splitter.push(chunk));
          }
          yield* emit(splitter.finish());
          if (!calls.length) break;
        }
        break;
      } catch (error) {
        if (!(error instanceof InvalidCitation) || signal.aborted) throw error;
        if (spoke || executed || attempt === 1) break;
      }
    }
    if (!spoke) yield* say(fallback);
    signal.throwIfAborted();
    state = 'COMPLETED';
    yield event('complete', 'Answer complete.', {
      citations: passages
        .filter((passage) => cited.has(passage.entryId))
        .map((passage) => ({ entryId: passage.entryId, title: passage.title.slice(0, 160) })),
    });
  } catch (error) {
    if (signal.aborted) {
      state = 'INTERRUPTED';
      failure = null;
      throw error;
    }
    failure = providerCode(error);
    yield event('error', failureText[failure as TurnErrorCode], { code: failure as TurnErrorCode });
  } finally {
    // Neither completed nor failed: cancelled, or its stream was closed by the listener.
    if (state === 'FAILED' && failure === null) state = 'INTERRUPTED';
    if (state === 'COMPLETED' && speechFailed && providers.synthesizer) failure = 'TTS_UNAVAILABLE';
    await service.finishTurn(turn, {
      state,
      answer,
      citedEntryIds: [...cited],
      failureCode: failure,
      timings: { ...timings, totalMs: since() },
    });
  }
}
