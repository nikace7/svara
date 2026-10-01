import { describe, expect, it, vi } from 'vitest';
import {
  GeminiAnswerGenerator,
  GeminiError,
  GeminiSpeechRecognizer,
  GeminiSpeechSynthesizer,
  pcmFromWav,
  wavFromPcm16,
} from './gemini.js';
import type { ProviderContext, RecognitionEvent } from './index.js';

async function collect<T>(iterable: AsyncIterable<T>): Promise<T[]> {
  const items: T[] = [];
  for await (const item of iterable) items.push(item);
  return items;
}
const context = (signal = new AbortController().signal): ProviderContext => ({
  locale: 'ne-NP',
  mode: 'live',
  signal,
});

type Call = { url: string; init: RequestInit };
function fakeFetch(respond: (call: Call) => Response) {
  const calls: Call[] = [];
  const fetchFn = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const call = { url: String(url), init: init ?? {} };
    calls.push(call);
    return respond(call);
  });
  return { calls, fetch: fetchFn as unknown as typeof fetch };
}
const options = (fetchFn: typeof fetch) => ({ apiKey: 'secret-key', fetch: fetchFn });
const body = (call: Call) => JSON.parse(String(call.init.body)) as Record<string, unknown>;

describe('Gemini request boundary', () => {
  it('sends the key in a header, never in the URL or logs', async () => {
    const { calls, fetch } = fakeFetch(
      () => new Response('data: {"candidates":[{"content":{"parts":[{"text":"ok"}]}}]}\n\n'),
    );
    const generator = new GeminiAnswerGenerator(options(fetch));
    await collect(generator.generate({ question: 'q', passages: [], history: [] }, context()));
    expect(calls[0]!.url).not.toContain('secret-key');
    expect(new Headers(calls[0]!.init.headers).get('x-goog-api-key')).toBe('secret-key');
    expect(calls[0]!.url).toMatch(/models\/gemini-3\.8-flash:streamGenerateContent\?alt=sse$/);
  });

  it.each([
    [429, 'PROVIDER_QUOTA'],
    [503, 'PROVIDER_UNAVAILABLE'],
    [400, 'PROVIDER_UNAVAILABLE'],
  ] as const)('maps HTTP %s to %s without leaking the body', async (status, code) => {
    const { fetch } = fakeFetch(
      () => new Response('{"error":{"message":"key secret-key rejected"}}', { status }),
    );
    const generator = new GeminiAnswerGenerator(options(fetch));
    const run = collect(
      generator.generate({ question: 'q', passages: [], history: [] }, context()),
    );
    await expect(run).rejects.toBeInstanceOf(GeminiError);
    await expect(run).rejects.toMatchObject({ code, status });
    await expect(run).rejects.not.toThrow(/secret-key/);
  });

  it('treats network failure as unavailable and honours cancellation', async () => {
    const network = fakeFetch(() => {
      throw new TypeError('fetch failed');
    });
    await expect(
      collect(
        new GeminiAnswerGenerator(options(network.fetch)).generate(
          { question: 'q', passages: [], history: [] },
          context(),
        ),
      ),
    ).rejects.toMatchObject({ code: 'PROVIDER_UNAVAILABLE' });
    const controller = new AbortController();
    controller.abort();
    const { calls, fetch } = fakeFetch(() => new Response('{}'));
    await expect(
      collect(
        new GeminiAnswerGenerator(options(fetch)).generate(
          { question: 'q', passages: [], history: [] },
          context(controller.signal),
        ),
      ),
    ).rejects.toThrow();
    expect(calls).toHaveLength(0);
  });
});

describe('free-tier retry', () => {
  const sseOk = () =>
    new Response('data: {"candidates":[{"content":{"parts":[{"text":"ok"}]}}]}\n\n');
  const quota = () =>
    new Response('{"error":{"message":"Quota exceeded. Please retry in 1.5s"}}', { status: 429 });

  it('honours the server backoff hint, then succeeds', async () => {
    const slept: number[] = [];
    let call = 0;
    const { calls, fetch } = fakeFetch(() => (++call === 1 ? quota() : sseOk()));
    const deltas = await collect(
      new GeminiAnswerGenerator({
        ...options(fetch),
        retries: 1,
        sleep: async (ms) => void slept.push(ms),
      }).generate({ question: 'q', passages: [], history: [] }, context()),
    );
    expect(deltas).toEqual(['ok']);
    expect(calls).toHaveLength(2);
    expect(slept).toEqual([1500]);
  });

  it('retries 503 with a bounded default delay and gives up as quota after the last attempt', async () => {
    const slept: number[] = [];
    const busy = fakeFetch(() => new Response('{}', { status: 503 }));
    await expect(
      collect(
        new GeminiAnswerGenerator({
          ...options(busy.fetch),
          retries: 2,
          sleep: async (ms) => void slept.push(ms),
        }).generate({ question: 'q', passages: [], history: [] }, context()),
      ),
    ).rejects.toMatchObject({ code: 'PROVIDER_UNAVAILABLE', status: 503 });
    expect(busy.calls).toHaveLength(3);
    expect(slept).toEqual([2000, 4000]);
    const exhausted = fakeFetch(quota);
    await expect(
      collect(
        new GeminiAnswerGenerator({ ...options(exhausted.fetch), retries: 0 }).generate(
          { question: 'q', passages: [], history: [] },
          context(),
        ),
      ),
    ).rejects.toMatchObject({ code: 'PROVIDER_QUOTA' });
    expect(exhausted.calls).toHaveLength(1);
  });

  it('stops waiting to retry as soon as the turn is cancelled or times out', async () => {
    const busy = fakeFetch(
      () => new Response('{"error":{"message":"Please retry in 3s"}}', { status: 503 }),
    );
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 20);
    const started = Date.now();
    await expect(
      collect(
        new GeminiAnswerGenerator({ ...options(busy.fetch), retries: 1 }).generate(
          { question: 'q', passages: [], history: [] },
          context(controller.signal),
        ),
      ),
    ).rejects.toThrow();
    expect(Date.now() - started).toBeLessThan(1000);
    expect(busy.calls).toHaveLength(1);
  });

  it('fails at once when the rate limit asks for a longer wait than a turn can afford', async () => {
    const slept: number[] = [];
    const limited = fakeFetch(
      () =>
        new Response(
          '{"error":{"message":"Quota exceeded for requests per minute. Please retry in 31.5s"}}',
          { status: 429 },
        ),
    );
    await expect(
      collect(
        new GeminiAnswerGenerator({
          ...options(limited.fetch),
          retries: 2,
          sleep: async (ms) => void slept.push(ms),
        }).generate({ question: 'q', passages: [], history: [] }, context()),
      ),
    ).rejects.toMatchObject({ code: 'PROVIDER_QUOTA' });
    expect(limited.calls).toHaveLength(1);
    expect(slept).toEqual([]);
  });

  it('fails a spent daily quota at once, despite its retry hint', async () => {
    const slept: number[] = [];
    // Google's real daily-cap body still says "Please retry in 13s".
    const daily = fakeFetch(
      () =>
        new Response(
          '{"error":{"message":"Quota exceeded, limit: 20. Please retry in 13.0s","details":[{"violations":[{"quotaId":"GenerateRequestsPerDayPerProjectPerModel-FreeTier"}]}]}}',
          { status: 429 },
        ),
    );
    await expect(
      collect(
        new GeminiAnswerGenerator({
          ...options(daily.fetch),
          retries: 2,
          sleep: async (ms) => void slept.push(ms),
        }).generate({ question: 'q', passages: [], history: [] }, context()),
      ),
    ).rejects.toMatchObject({ code: 'PROVIDER_QUOTA', status: 429 });
    expect(daily.calls).toHaveLength(1);
    expect(slept).toEqual([]);
  });

  it('does not retry a non-transient rejection', async () => {
    const { calls, fetch } = fakeFetch(() => new Response('{}', { status: 400 }));
    await expect(
      collect(
        new GeminiAnswerGenerator({ ...options(fetch), retries: 3 }).generate(
          { question: 'q', passages: [], history: [] },
          context(),
        ),
      ),
    ).rejects.toMatchObject({ status: 400 });
    expect(calls).toHaveLength(1);
  });
});

describe('GeminiAnswerGenerator', () => {
  // The live API separates frames with CRLF, so the parser must accept both forms.
  const sse = (...chunks: unknown[]) =>
    new Response(
      chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\r\n\r\n`).join('') + 'data: [DONE]\n\n',
      { headers: { 'content-type': 'text/event-stream' } },
    );
  const chunk = (text: string) => ({ candidates: [{ content: { parts: [{ text }] } }] });

  it('grounds the prompt in passages, history and locale, then streams text deltas', async () => {
    const { calls, fetch } = fakeFetch(() =>
      sse(chunk('कोठा '), chunk('A-101।'), { candidates: [] }),
    );
    const generator = new GeminiAnswerGenerator(options(fetch));
    const deltas = await collect(
      generator.generate(
        {
          question: 'भर्ना कार्यालय कहाँ छ?',
          passages: [{ id: 'p1', text: 'Admissions is in Room A-101.' }],
          history: [
            { role: 'user', text: 'Hi' },
            { role: 'assistant', text: 'Namaste' },
          ],
        },
        context(),
      ),
    );
    expect(deltas).toEqual(['कोठा ', 'A-101।']);
    const request = body(calls[0]!);
    const system = JSON.stringify(request['systemInstruction']);
    expect(system).toContain('Nepali');
    expect(system).toContain('[p1] Admissions is in Room A-101.');
    expect(request['contents']).toEqual([
      { role: 'user', parts: [{ text: 'Hi' }] },
      { role: 'model', parts: [{ text: 'Namaste' }] },
      { role: 'user', parts: [{ text: 'भर्ना कार्यालय कहाँ छ?' }] },
    ]);
    expect(request['tools']).toBeUndefined();
    expect(request['generationConfig']).toMatchObject({ thinkingConfig: { thinkingBudget: 0 } });
  });

  it('surfaces a blocked or empty answer as an explicit error', async () => {
    const { fetch } = fakeFetch(() =>
      sse({ candidates: [{ finishReason: 'SAFETY', content: { parts: [] } }] }),
    );
    await expect(
      collect(
        new GeminiAnswerGenerator(options(fetch)).generate(
          { question: 'q', passages: [], history: [] },
          context(),
        ),
      ),
    ).rejects.toMatchObject({ code: 'PROVIDER_UNAVAILABLE' });
  });

  it('accepts an empty tool round after an answer was already given', async () => {
    // Told what it already said, the model often has nothing to add: that is not a failure.
    const { fetch } = fakeFetch(() =>
      sse({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: '' }] } }] }),
    );
    const toolRound = { calls: [], results: [] };
    const generate = (text: string) =>
      collect(
        new GeminiAnswerGenerator(options(fetch)).generate(
          { question: 'q', passages: [], history: [], toolRound: { ...toolRound, text } },
          context(),
        ),
      );
    await expect(generate('Admissions is in room 12.')).resolves.toEqual([]);
    // Nothing heard yet: an empty round is still no answer.
    await expect(generate('')).rejects.toMatchObject({ code: 'PROVIDER_UNAVAILABLE' });
  });

  it('never emits reasoning parts as answer text', async () => {
    const { fetch } = fakeFetch(() =>
      sse({
        candidates: [
          {
            content: {
              parts: [
                { text: 'internal plan', thought: true },
                { text: 'Room A-101.', thoughtSignature: 'sig' },
              ],
            },
          },
        ],
      }),
    );
    const deltas = await collect(
      new GeminiAnswerGenerator(options(fetch)).generate(
        { question: 'q', passages: [], history: [] },
        context(),
      ),
    );
    expect(deltas).toEqual(['Room A-101.']);
  });

  it('splits SSE frames across arbitrary chunk boundaries', async () => {
    const text = `data: ${JSON.stringify(chunk('Hel'))}\n\ndata: ${JSON.stringify(chunk('lo'))}\n\n`;
    const encoded = new TextEncoder().encode(text);
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (let i = 0; i < encoded.length; i += 7) controller.enqueue(encoded.slice(i, i + 7));
        controller.close();
      },
    });
    const { fetch } = fakeFetch(() => new Response(stream));
    const deltas = await collect(
      new GeminiAnswerGenerator(options(fetch)).generate(
        { question: 'q', passages: [], history: [] },
        context(),
      ),
    );
    expect(deltas.join('')).toBe('Hello');
  });

  it('offers declared tools, yields complete calls and answers from their outcomes', async () => {
    const call = {
      functionCall: { id: 'fc-1', name: 'show_slide', args: { slide: 'S1' } },
      thoughtSignature: 'sig',
    };
    const first = fakeFetch(() => sse({ candidates: [{ content: { parts: [call] } }] }));
    const input = {
      question: 'Show the admissions slide',
      passages: [{ id: '1', text: 'Admissions is in room 12.' }],
      history: [],
      instructions: 'Greet visitors warmly.',
      slides: [{ label: 'S1', title: 'Admissions steps', screen: 'SECONDARY' as const }],
      tools: [
        {
          name: 'show_slide',
          description: 'Show a slide.',
          parameters: { slide: { description: 'Slide label' } },
          required: ['slide'],
        },
      ],
    };
    const chunks = await collect(
      new GeminiAnswerGenerator(options(first.fetch)).generate(input, context()),
    );
    expect(chunks).toEqual([
      { type: 'tool', callId: 'fc-1', name: 'show_slide', args: { slide: 'S1' }, raw: call },
    ]);
    const request = body(first.calls[0]!);
    expect(request['tools']).toEqual([
      {
        functionDeclarations: [
          {
            name: 'show_slide',
            description: 'Show a slide.',
            parameters: {
              type: 'OBJECT',
              properties: { slide: { type: 'STRING', description: 'Slide label' } },
              required: ['slide'],
            },
          },
        ],
      },
    ]);
    const system = JSON.stringify(request['systemInstruction']);
    expect(system).toContain('Persona: Greet visitors warmly.');
    // The authored screen, so the model does not ask for a screen the slide is not made for.
    expect(system).toContain('S1: Admissions steps (screen: SECONDARY)');
    expect(system).toContain('Never write a slide label');
    expect(system).toContain('[1] Admissions is in room 12.');
    // The second round echoes what the model said and its call verbatim, so it continues rather
    // than answering again, reports the outcome and offers no tools.
    const second = fakeFetch(() => sse(chunk('It is on screen [1].')));
    const answer = await collect(
      new GeminiAnswerGenerator(options(second.fetch)).generate(
        {
          ...input,
          toolRound: {
            text: 'Admissions is in room 12 [1].',
            calls: [chunks[0] as never],
            results: [{ callId: 'fc-1', name: 'show_slide', result: { status: 'APPLIED' } }],
          },
        },
        context(),
      ),
    );
    expect(answer).toEqual(['It is on screen [1].']);
    const followUp = body(second.calls[0]!);
    expect(followUp['tools']).toBeUndefined();
    expect((followUp['contents'] as unknown[]).slice(-2)).toEqual([
      { role: 'model', parts: [{ text: 'Admissions is in room 12 [1].' }, call] },
      {
        role: 'user',
        parts: [
          {
            functionResponse: {
              name: 'show_slide',
              id: 'fc-1',
              response: { result: { status: 'APPLIED' } },
            },
          },
        ],
      },
    ]);
  });
});

describe('GeminiSpeechSynthesizer', () => {
  const pcm = new Int16Array([0, 1000, -1000, 32767]);
  const wav24k = (rate = 24000) => new Uint8Array(wavFromPcm16(new Uint8Array(pcm.buffer), rate));
  const audioResponse = (mimeType: string, bytes = wav24k()) =>
    new Response(
      JSON.stringify({
        candidates: [
          {
            content: {
              parts: [{ inlineData: { mimeType, data: Buffer.from(bytes).toString('base64') } }],
            },
          },
        ],
      }),
    );

  it('requests 24 kHz PCM with the configured voice and yields decoded bytes', async () => {
    const { calls, fetch } = fakeFetch(() => audioResponse('audio/wav'));
    const synthesizer = new GeminiSpeechSynthesizer({ ...options(fetch), voice: 'Puck' });
    const chunks = await collect(synthesizer.synthesize('नमस्ते।', context()));
    expect(chunks).toHaveLength(1);
    expect(new Int16Array(chunks[0]!)).toEqual(pcm);
    const request = body(calls[0]!);
    expect(calls[0]!.url).toMatch(/models\/gemini-3\.8-flash-tts:generateContent$/);
    expect(request['generationConfig']).toEqual({
      responseModalities: ['AUDIO'],
      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Puck' } } },
    });
    expect(JSON.stringify(request['contents'])).toContain('नमस्ते।');
  });

  it('accepts the documented raw L16 form as well as a WAV container', async () => {
    const raw = fakeFetch(() =>
      audioResponse('audio/L16;codec=pcm;rate=24000', new Uint8Array(pcm.buffer)),
    );
    const [chunk] = await collect(
      new GeminiSpeechSynthesizer(options(raw.fetch)).synthesize('x', context()),
    );
    expect(new Int16Array(chunk!)).toEqual(pcm);
  });

  it('rejects unexpected audio formats and odd byte lengths rather than playing noise', async () => {
    const wrongRate = fakeFetch(() => audioResponse('audio/wav', wav24k(16000)));
    await expect(
      collect(new GeminiSpeechSynthesizer(options(wrongRate.fetch)).synthesize('x', context())),
    ).rejects.toMatchObject({ code: 'PROVIDER_UNAVAILABLE' });
    const odd = fakeFetch(() =>
      audioResponse('audio/L16;codec=pcm;rate=24000', new Uint8Array([1, 2, 3])),
    );
    await expect(
      collect(new GeminiSpeechSynthesizer(options(odd.fetch)).synthesize('x', context())),
    ).rejects.toMatchObject({ code: 'PROVIDER_UNAVAILABLE' });
    const silent = fakeFetch(() => new Response('{"candidates":[{"content":{"parts":[]}}]}'));
    await expect(
      collect(new GeminiSpeechSynthesizer(options(silent.fetch)).synthesize('x', context())),
    ).rejects.toMatchObject({ code: 'PROVIDER_UNAVAILABLE' });
  });

  it('rejects empty or oversized text before calling the provider', async () => {
    const { calls, fetch } = fakeFetch(() => audioResponse('audio/L16;codec=pcm;rate=24000'));
    const synthesizer = new GeminiSpeechSynthesizer(options(fetch));
    await expect(collect(synthesizer.synthesize('   ', context()))).rejects.toThrow();
    await expect(collect(synthesizer.synthesize('अ'.repeat(2001), context()))).rejects.toThrow();
    expect(calls).toHaveLength(0);
  });
});

describe('GeminiSpeechRecognizer', () => {
  const transcript = (text: string) =>
    new Response(
      JSON.stringify({
        // gemini-3.5-transcribe answers with audioTranscription, not a text part.
        candidates: [{ content: { parts: [{ audioTranscription: { text } }] } }],
      }),
    );
  const frame = (seq: number, fill: number) => ({
    seq,
    pcm: new Int16Array(1600).fill(fill).buffer,
  });

  it('uploads ordered 16 kHz PCM as WAV once on finish and emits one final transcript', async () => {
    const { calls, fetch } = fakeFetch(() => transcript(' भर्ना कार्यालय कहाँ छ? \n'));
    const events: RecognitionEvent[] = [];
    const session = await new GeminiSpeechRecognizer(options(fetch)).open(context(), (event) =>
      events.push(event),
    );
    session.write(frame(0, 1));
    session.write(frame(1, 2));
    expect(calls).toHaveLength(0);
    await session.finish();
    expect(events).toEqual([{ type: 'final', text: 'भर्ना कार्यालय कहाँ छ?' }]);
    const request = body(calls[0]!);
    const parts = (request['contents'] as { parts: Record<string, unknown>[] }[])[0]!.parts;
    const inline = parts.find((part) => part['inlineData']) as {
      inlineData: { mimeType: string; data: string };
    };
    expect(calls[0]!.url).toMatch(/models\/gemini-3\.5-transcribe:generateContent$/);
    expect(inline.inlineData.mimeType).toBe('audio/wav');
    const wav = Buffer.from(inline.inlineData.data, 'base64');
    expect(wav.subarray(0, 4).toString('ascii')).toBe('RIFF');
    expect(wav.readUInt32LE(24)).toBe(16000);
    expect(wav.readUInt16LE(22)).toBe(1);
    expect(wav.length).toBe(44 + 3200 * 2);
    expect(wav.readInt16LE(44)).toBe(1);
    expect(wav.readInt16LE(44 + 3200)).toBe(2);
    expect(JSON.stringify(parts)).toContain('Nepali');
    session.close();
  });

  it('rejects out-of-order frames, empty audio and oversized recordings', async () => {
    const { calls, fetch } = fakeFetch(() => transcript('x'));
    const recognizer = new GeminiSpeechRecognizer(options(fetch));
    const silent = await recognizer.open(context(), () => {});
    await expect(silent.finish()).rejects.toThrow();
    const session = await recognizer.open(context(), () => {});
    session.write(frame(0, 0));
    expect(() => session.write(frame(0, 0))).toThrow();
    expect(() => session.write(frame(2, 0))).toThrow();
    const long = await recognizer.open(context(), () => {});
    for (let seq = 0; seq < 300; seq++) long.write(frame(seq, 0));
    expect(() => long.write(frame(300, 0))).toThrow();
    expect(calls).toHaveLength(0);
  });

  it('emits provider failures as recognition errors and does nothing after close', async () => {
    const { fetch } = fakeFetch(() => new Response('{}', { status: 429 }));
    const events: RecognitionEvent[] = [];
    const session = await new GeminiSpeechRecognizer(options(fetch)).open(context(), (event) =>
      events.push(event),
    );
    session.write(frame(0, 0));
    await session.finish();
    expect(events).toEqual([{ type: 'error', code: 'PROVIDER_QUOTA' }]);
    session.close();
    expect(() => session.write(frame(1, 0))).toThrow();
  });

  it('round-trips PCM through the WAV helpers', () => {
    const bytes = new Uint8Array([1, 0, 2, 0, 3, 0]);
    const parsed = pcmFromWav(new Uint8Array(wavFromPcm16(bytes, 24000)), 24000);
    expect(new Uint8Array(parsed)).toEqual(bytes);
    expect(() => pcmFromWav(new Uint8Array(wavFromPcm16(bytes, 16000)), 24000)).toThrow();
    expect(() => pcmFromWav(new Uint8Array([1, 2, 3]), 24000)).toThrow();
  });

  it('builds a canonical 44-byte WAV header', () => {
    const wav = wavFromPcm16(new Uint8Array([1, 0, 2, 0]), 16000);
    expect(wav.length).toBe(48);
    expect(wav.readUInt32LE(4)).toBe(40);
    expect(wav.readUInt32LE(40)).toBe(4);
    expect(wav.readUInt32LE(28)).toBe(32000);
  });
});
