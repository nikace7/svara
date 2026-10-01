import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { emptyBotDraft } from '@svara/contracts';
import type { ReleaseSnapshot, TurnEvent } from '@svara/contracts';
import { GeminiError } from '@svara/providers';
import type { AnswerChunk, AnswerInput } from '@svara/providers';
import type { TurnContext, TurnFinish } from './service.js';
import { runConversationTurn, withinWaitBudget } from './turn.js';
import type { TurnRunner } from './turn.js';

const entry = randomUUID();
const slideId = randomUUID();
const snapshot = {
  bot: {
    config: {
      ...emptyBotDraft(),
      persona: 'Be brief.',
      fallback: { en: 'Please ask reception.', ne: 'स्वागत कक्षमा सोध्नुहोस्।' },
    },
  },
  knowledge: [],
  presentation: {
    slides: [{ id: slideId, title: { en: 'Admissions steps', ne: 'भर्ना चरण' }, target: 'BOTH' }],
  },
} as unknown as ReleaseSnapshot;
const context = (extra: Partial<TurnContext> = {}): TurnContext => ({
  sessionId: randomUUID(),
  turnId: randomUUID(),
  organisationId: randomUUID(),
  deviceId: randomUUID(),
  generation: 3,
  locale: 'en-US',
  providerMode: 'live',
  releaseId: randomUUID(),
  snapshotHash: 'a'.repeat(64),
  snapshot,
  tools: ['lookup_knowledge', 'select_reference'],
  question: 'Where is admissions?',
  audio: null,
  history: [],
  priorTools: [],
  ...extra,
});
const passage = {
  entryId: entry,
  title: 'Admissions',
  question: 'Where is admissions?',
  text: 'Room 12.',
  score: 1,
  truncated: false,
};

function harness(
  answers: AnswerChunk[][],
  options: { passages?: (typeof passage)[]; speech?: 'ok' | 'fail'; ack?: string } = {},
) {
  const finished: TurnFinish[] = [];
  const requests: AnswerInput[] = [];
  const tools: unknown[] = [];
  const shown: unknown[] = [];
  let round = 0;
  const runner: TurnRunner = {
    service: {
      search: vi.fn(async () => ({
        releaseId: randomUUID(),
        snapshotHash: 'a'.repeat(64),
        locale: 'en' as const,
        passages: options.passages ?? [passage],
      })),
      setTranscript: vi.fn(async () => undefined),
      finishTurn: vi.fn(async (_turn, finish: TurnFinish) => {
        finished.push(finish);
      }),
      tool: vi.fn(async (_actor, _turn, call) => {
        tools.push(call);
        return {
          id: 'tool-1',
          name: call.name,
          status: 'PENDING' as const,
          reason: null,
          result: { slideId: call.args.slideId, target: 'PRIMARY' },
          duplicate: false,
          command: { id: randomUUID(), stateRevision: 2 },
        };
      }),
      slideOutcome: vi.fn(async () => (options.ack ?? 'APPLIED') as 'APPLIED'),
    },
    providers: {
      generator: {
        async *generate(input: AnswerInput) {
          requests.push(input);
          for (const chunk of answers[round++] ?? []) yield chunk;
        },
      },
      ...(options.speech
        ? {
            synthesizer: {
              async *synthesize() {
                if (options.speech === 'fail') throw new Error('tts down');
                yield new Int16Array(3000).buffer;
              },
            },
          }
        : {}),
    },
    slides: { show: (_device, command) => void shown.push(command) },
    sleep: async () => undefined,
  };
  return { runner, finished, requests, tools, shown };
}
async function run(
  turn: TurnContext,
  runner: TurnRunner,
  signal = new AbortController().signal,
): Promise<TurnEvent[]> {
  const events: TurnEvent[] = [];
  for await (const event of runConversationTurn(
    { kind: 'STAFF', token: 't' },
    turn,
    runner,
    signal,
  ))
    events.push(event);
  return events;
}

describe('conversation turns', () => {
  it('streams cited sentences with speech and records the validated citations', async () => {
    const { runner, finished, requests } = harness(
      [['Admissions is in room 12 [1]. ', 'Bring ID.']],
      {
        speech: 'ok',
      },
    );
    const events = await run(context(), runner);
    expect(events.map((event) => event.type)).toEqual([
      'transcript',
      'answer',
      'audio',
      'audio',
      'answer',
      'audio',
      'audio',
      'complete',
    ]);
    expect(events.filter((event) => event.type === 'answer').map((event) => event.text)).toEqual([
      'Admissions is in room 12.',
      'Bring ID.',
    ]);
    expect(events.map((event) => event.seq)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(events.at(-1)!.citations).toEqual([{ entryId: entry, title: 'Admissions' }]);
    expect(requests[0]).toMatchObject({
      passages: [{ id: '1' }],
      instructions: 'Be brief.',
      slides: [],
    });
    expect(finished[0]).toMatchObject({
      state: 'COMPLETED',
      answer: 'Admissions is in room 12. Bring ID.',
      citedEntryIds: [entry],
      failureCode: null,
    });
  });

  it('answers with the approved fallback, without generation, when nothing matches', async () => {
    const { runner, requests, finished } = harness([], { passages: [] });
    const events = await run(context({ locale: 'ne-NP' }), runner);
    expect(requests).toHaveLength(0);
    expect(events.map((event) => [event.type, event.text])).toEqual([
      ['transcript', 'Where is admissions?'],
      ['answer', 'स्वागत कक्षमा सोध्नुहोस्।'],
      ['complete', 'Answer complete.'],
    ]);
    expect(finished[0]).toMatchObject({ state: 'COMPLETED', citedEntryIds: [] });
  });

  it('drops ungrounded words on a kiosk with slides but no evidence, answering the fallback', async () => {
    const { runner, requests, finished } = harness([['Admissions is in room 99.']], {
      passages: [],
    });
    const events = await run(context({ tools: ['show_slide'] }), runner);
    // The model is still asked, in case the question is a slide request.
    expect(requests).toHaveLength(1);
    expect(events.filter((event) => event.type === 'answer').map((event) => event.text)).toEqual([
      'Please ask reception.',
    ]);
    expect(finished[0]).toMatchObject({ answer: 'Please ask reception.', citedEntryIds: [] });
  });

  it('runs a proposed slide change after its round, waits for the ack, then answers', async () => {
    const call = { type: 'tool' as const, callId: 'c1', name: 'show_slide', args: { slide: 'S1' } };
    const { runner, tools, shown, requests } = harness([[call], ['It is on screen.']], {
      passages: [],
    });
    const events = await run(context({ tools: ['show_slide'] }), runner);
    expect(tools).toEqual([{ callId: 'c1', name: 'show_slide', args: { slide: 'S1', slideId } }]);
    expect(shown).toMatchObject([{ slideId, target: 'PRIMARY', stateRevision: 2 }]);
    expect(events.find((event) => event.type === 'tool')!.tool).toEqual({
      name: 'show_slide',
      status: 'APPLIED',
      reason: null,
      slideId,
      target: 'PRIMARY',
    });
    expect(requests[0]!.slides).toEqual([
      { label: 'S1', title: 'Admissions steps', screen: 'BOTH' },
    ]);
    expect(requests[1]!.toolRound!.results).toEqual([
      {
        callId: 'c1',
        name: 'show_slide',
        result: { status: 'APPLIED', reason: null, slideId, target: 'PRIMARY' },
      },
    ]);
    expect(events.filter((event) => event.type === 'answer').map((event) => event.text)).toEqual([
      'It is on screen.',
    ]);
  });

  it('tells the second round what was already said, so the answer is not repeated', async () => {
    const call = { type: 'tool' as const, callId: 'c1', name: 'show_slide', args: { slide: 'S1' } };
    const { runner, requests } = harness([['Admissions is in room 12 [1].', call], ['Shown.']]);
    await run(context({ tools: ['show_slide'] }), runner);
    // Echoed as the model produced it, citation label included, before its calls.
    expect(requests[1]!.toolRound!.text).toBe('Admissions is in room 12 [1].');
  });

  it('echoes nothing a visitor did not hear when round one had no evidence', async () => {
    const call = { type: 'tool' as const, callId: 'c1', name: 'show_slide', args: { slide: 'S1' } };
    const { runner, requests } = harness([['Room 99.', call], ['It is on screen.']], {
      passages: [],
    });
    await run(context({ tools: ['show_slide'] }), runner);
    expect(requests[1]!.toolRound!.text).toBe('');
  });

  it('reports a slide as PENDING, never APPLIED, when no acknowledgement arrives', async () => {
    const call = { type: 'tool' as const, callId: 'c1', name: 'show_slide', args: { slide: 'S1' } };
    const { runner } = harness([[call], ['Sent.']], { passages: [], ack: 'PENDING' });
    const events = await run(context({ tools: ['show_slide'] }), runner);
    expect(events.find((event) => event.type === 'tool')!.tool!.status).toBe('PENDING');
    expect(runner.service.slideOutcome).toHaveBeenCalledTimes(20);
  });

  it('regenerates once for an unsupplied citation, then falls back', async () => {
    const once = harness([['Room 99 [7].'], ['Room 12 [1].']]);
    expect(
      (await run(context(), once.runner)).filter((e) => e.type === 'answer').map((e) => e.text),
    ).toEqual(['Room 12.']);
    const twice = harness([['Room 99 [7].'], ['Room 98 [8].']]);
    expect(
      (await run(context(), twice.runner)).filter((e) => e.type === 'answer').map((e) => e.text),
    ).toEqual(['Please ask reception.']);
  });

  it('keeps the text when speech fails and names provider quota exhaustion', async () => {
    const speech = harness([['Room 12 [1].']], { speech: 'fail' });
    const events = await run(context(), speech.runner);
    expect(events.map((event) => event.code ?? event.type)).toEqual([
      'transcript',
      'answer',
      'TTS_UNAVAILABLE',
      'complete',
    ]);
    expect(speech.finished[0]).toMatchObject({
      state: 'COMPLETED',
      failureCode: 'TTS_UNAVAILABLE',
    });
    const quota = harness([]);
    quota.runner.providers.generator = {
      // eslint-disable-next-line require-yield
      async *generate() {
        throw new GeminiError('PROVIDER_QUOTA', 429, 'quota exhausted');
      },
    };
    const failed = await run(context(), quota.runner);
    expect(failed.at(-1)).toMatchObject({ type: 'error', code: 'PROVIDER_QUOTA' });
    expect(quota.finished[0]).toMatchObject({ state: 'FAILED', failureCode: 'PROVIDER_QUOTA' });
  });

  it('records an interrupted answer with what was generated before the stop', async () => {
    const controller = new AbortController();
    const { runner, finished } = harness([['Room 12 [1]. ', 'More detail follows.']]);
    const events: TurnEvent[] = [];
    await expect(
      (async () => {
        for await (const event of runConversationTurn(
          { kind: 'STAFF', token: 't' },
          context(),
          runner,
          controller.signal,
        )) {
          events.push(event);
          if (event.type === 'answer') controller.abort();
        }
      })(),
    ).rejects.toThrow();
    expect(finished[0]).toMatchObject({ state: 'INTERRUPTED', answer: 'Room 12.' });
  });

  it('refuses spoken questions without a recognizer', async () => {
    const { runner, finished } = harness([]);
    const events = await run(context({ audio: new Uint8Array(3200) }), runner);
    expect(events.map((event) => event.code)).toEqual(['STT_UNAVAILABLE']);
    expect(finished[0]).toMatchObject({ state: 'FAILED', failureCode: 'STT_UNAVAILABLE' });
  });
});

describe('slow speech', () => {
  it('completes a long answer whose speech outlasts the generation deadline', async () => {
    vi.useFakeTimers();
    try {
      const { runner, finished } = harness([]);
      runner.providers.generator = {
        async *generate(_input, context) {
          for (const sentence of ['Room 12 [1]. ', 'Bring ID [1]. ', 'Ask at reception [1].']) {
            context.signal.throwIfAborted();
            yield sentence;
          }
        },
      };
      runner.providers.synthesizer = {
        async *synthesize() {
          // 9 s per sentence: 27 s in all, past the 20-second generation deadline.
          await new Promise((resolve) => setTimeout(resolve, 9000));
          yield new Int16Array(3000).buffer;
        },
      };
      const events = run(context(), runner);
      await vi.runAllTimersAsync();
      expect((await events).filter((event) => event.type === 'answer')).toHaveLength(3);
      expect(finished[0]).toMatchObject({ state: 'COMPLETED', failureCode: null });
    } finally {
      vi.useRealTimers();
    }
  });

  it('still fails a model that stops sending for the whole generation deadline', async () => {
    vi.useFakeTimers();
    try {
      const { runner, finished } = harness([]);
      runner.providers.generator = {
        async *generate(_input, context) {
          yield 'Room 12 [1]. ';
          await new Promise((_resolve, reject) =>
            context.signal.addEventListener('abort', () => reject(context.signal.reason as Error), {
              once: true,
            }),
          );
        },
      };
      const events = run(context(), runner);
      await vi.advanceTimersByTimeAsync(20_001);
      expect((await events).at(-1)).toMatchObject({ type: 'error', code: 'PROVIDER_UNAVAILABLE' });
      expect(finished[0]).toMatchObject({ state: 'FAILED', answer: 'Room 12.' });
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('provider wait budget', () => {
  const words = async function* (signal: AbortSignal) {
    for (const word of ['a', 'b', 'c']) {
      signal.throwIfAborted();
      yield word;
    }
  };

  it('does not count the time the turn spends speaking what already arrived', async () => {
    vi.useFakeTimers();
    try {
      const seen: string[] = [];
      const consume = (async () => {
        for await (const word of withinWaitBudget(words, new AbortController().signal, 1000)) {
          seen.push(word);
          // Speaking each sentence takes most of the budget; three take more than all of it.
          await new Promise((resolve) => setTimeout(resolve, 900));
        }
      })();
      await vi.runAllTimersAsync();
      await consume;
      expect(seen).toEqual(['a', 'b', 'c']);
    } finally {
      vi.useRealTimers();
    }
  });

  it('stops a provider that keeps the turn waiting past the budget', async () => {
    vi.useFakeTimers();
    try {
      const stalls = async function* (signal: AbortSignal) {
        yield 'a';
        await new Promise((_resolve, reject) =>
          signal.addEventListener('abort', () => reject(signal.reason as Error), { once: true }),
        );
      };
      const consume = (async () => {
        for await (const word of withinWaitBudget(stalls, new AbortController().signal, 1000))
          void word;
      })();
      const failed = expect(consume).rejects.toMatchObject({ name: 'TimeoutError' });
      await vi.advanceTimersByTimeAsync(1001);
      await failed;
    } finally {
      vi.useRealTimers();
    }
  });

  it('spends one budget across the whole stream, not a fresh one per chunk', async () => {
    vi.useFakeTimers();
    try {
      const slow = async function* (signal: AbortSignal) {
        for (const word of ['a', 'b', 'c']) {
          await new Promise((resolve) => setTimeout(resolve, 400));
          signal.throwIfAborted();
          yield word;
        }
      };
      const seen: string[] = [];
      const consume = (async () => {
        for await (const word of withinWaitBudget(slow, new AbortController().signal, 1000))
          seen.push(word);
      })();
      const failed = expect(consume).rejects.toMatchObject({ name: 'TimeoutError' });
      await vi.advanceTimersByTimeAsync(1300);
      await failed;
      expect(seen).toEqual(['a', 'b']);
    } finally {
      vi.useRealTimers();
    }
  });
});
