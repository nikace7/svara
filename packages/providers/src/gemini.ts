import type { Locale } from '@svara/contracts';
import type {
  AnswerGenerator,
  AnswerInput,
  ProviderContext,
  RecognitionEvent,
  RecognitionSession,
  SpeechRecognizer,
  SpeechSynthesizer,
} from './index.js';

/** Plain REST over global fetch; no SDK dependency. Keys travel only in a header. */
export interface GeminiOptions {
  apiKey: string;
  model?: string;
  ttsModel?: string;
  voice?: string;
  baseUrl?: string;
  fetch?: typeof fetch;
}

export type GeminiErrorCode = 'PROVIDER_QUOTA' | 'PROVIDER_UNAVAILABLE';
export class GeminiError extends Error {
  constructor(
    readonly code: GeminiErrorCode,
    readonly status: number | undefined,
    detail: string,
  ) {
    // Provider bodies may echo request material; only the status and a fixed reason are kept.
    super(`Gemini ${detail}${status ? ` (HTTP ${status})` : ''}.`);
    this.name = 'GeminiError';
  }
}

const languageName: Record<Locale, string> = { 'en-US': 'English', 'ne-NP': 'Nepali' };
const INPUT_RATE = 16000;
const OUTPUT_RATE = 24000;
const MAX_SYNTHESIS_CHARS = 2000;
const MAX_RECORDING_FRAMES = 300; // 300 × 100 ms = 30 s of 16 kHz PCM.
const FRAME_BYTES = 3200;

interface GeminiPart {
  text?: string;
  inlineData?: { mimeType?: string; data?: string };
}
interface GeminiResponse {
  candidates?: { finishReason?: string; content?: { parts?: GeminiPart[] } }[];
}

async function callGemini(
  options: GeminiOptions,
  path: string,
  body: unknown,
  signal: AbortSignal,
): Promise<Response> {
  signal.throwIfAborted();
  const fetchFn = options.fetch ?? globalThis.fetch;
  const url = `${options.baseUrl ?? 'https://generativelanguage.googleapis.com/v1beta'}/${path}`;
  let response: Response;
  try {
    response = await fetchFn(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': options.apiKey },
      body: JSON.stringify(body),
      signal,
    });
  } catch (error) {
    if (signal.aborted) throw error;
    throw new GeminiError('PROVIDER_UNAVAILABLE', undefined, 'request failed');
  }
  if (response.status === 429) throw new GeminiError('PROVIDER_QUOTA', 429, 'quota exhausted');
  if (!response.ok) throw new GeminiError('PROVIDER_UNAVAILABLE', response.status, 'rejected');
  if (!response.body) throw new GeminiError('PROVIDER_UNAVAILABLE', response.status, 'empty');
  return response;
}

function textParts(payload: GeminiResponse): string {
  const candidate = payload.candidates?.[0];
  return (candidate?.content?.parts ?? []).map((part) => part.text ?? '').join('');
}

async function* sseData(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const decoder = new TextDecoder();
  const reader = body.getReader();
  let buffer = '';
  for (let chunk = await reader.read(); !chunk.done; chunk = await reader.read()) {
    buffer += decoder.decode(chunk.value, { stream: true });
    let end: number;
    while ((end = buffer.indexOf('\n\n')) >= 0) {
      const frame = buffer.slice(0, end);
      buffer = buffer.slice(end + 2);
      const data = frame
        .split('\n')
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trim())
        .join('\n');
      if (data && data !== '[DONE]') yield data;
    }
  }
}

export class GeminiAnswerGenerator implements AnswerGenerator {
  constructor(private readonly options: GeminiOptions) {}

  async *generate(input: AnswerInput, context: ProviderContext): AsyncIterable<string> {
    const model = this.options.model ?? 'gemini-2.5-flash';
    const passages = input.passages.map((passage) => `[${passage.id}] ${passage.text}`).join('\n');
    const system =
      `You are a campus assistant. Answer in ${languageName[context.locale]} only, in at most ` +
      'three short spoken sentences. Use only the reference passages below. If they do not ' +
      'contain the answer, say so and suggest asking the office. Never invent facts.\n\n' +
      `Reference passages:\n${passages || '(none)'}`;
    const contents = [
      ...input.history.map((turn) => ({
        role: turn.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: turn.text }],
      })),
      { role: 'user', parts: [{ text: input.question }] },
    ];
    const response = await callGemini(
      this.options,
      `models/${model}:streamGenerateContent?alt=sse`,
      {
        systemInstruction: { parts: [{ text: system }] },
        contents,
        generationConfig: { temperature: 0.2, maxOutputTokens: 400 },
      },
      context.signal,
    );
    let produced = false;
    let finishReason: string | undefined;
    for await (const data of sseData(response.body!)) {
      context.signal.throwIfAborted();
      const payload = JSON.parse(data) as GeminiResponse;
      finishReason = payload.candidates?.[0]?.finishReason ?? finishReason;
      const text = textParts(payload);
      if (!text) continue;
      produced = true;
      yield text;
    }
    if (!produced)
      throw new GeminiError(
        'PROVIDER_UNAVAILABLE',
        undefined,
        `returned no answer (${finishReason ?? 'empty'})`,
      );
  }
}

export class GeminiSpeechSynthesizer implements SpeechSynthesizer {
  constructor(private readonly options: GeminiOptions) {}

  async *synthesize(text: string, context: ProviderContext): AsyncIterable<ArrayBuffer> {
    const trimmed = text.trim();
    if (!trimmed || trimmed.length > MAX_SYNTHESIS_CHARS)
      throw new Error('Synthesis text must be 1–2000 characters.');
    const model = this.options.ttsModel ?? 'gemini-2.5-flash-preview-tts';
    const response = await callGemini(
      this.options,
      `models/${model}:generateContent`,
      {
        contents: [{ parts: [{ text: trimmed }] }],
        generationConfig: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: this.options.voice ?? 'Kore' } },
          },
        },
      },
      context.signal,
    );
    const payload = (await response.json()) as GeminiResponse;
    const audio = payload.candidates?.[0]?.content?.parts?.find(
      (part) => part.inlineData,
    )?.inlineData;
    if (!audio?.data) throw new GeminiError('PROVIDER_UNAVAILABLE', undefined, 'returned no audio');
    const mime = (audio.mimeType ?? '').toLowerCase();
    if (!mime.startsWith('audio/l16') || !mime.includes(`rate=${OUTPUT_RATE}`))
      throw new GeminiError(
        'PROVIDER_UNAVAILABLE',
        undefined,
        'returned an unexpected audio format',
      );
    const bytes = Buffer.from(audio.data, 'base64');
    if (bytes.length === 0 || bytes.length % 2 !== 0)
      throw new GeminiError('PROVIDER_UNAVAILABLE', undefined, 'returned malformed PCM');
    context.signal.throwIfAborted();
    yield bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  }
}

export function wavFromPcm16(pcm: Uint8Array, sampleRate: number): Buffer {
  const header = Buffer.alloc(44);
  header.write('RIFF', 0, 'ascii');
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVEfmt ', 8, 'ascii');
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36, 'ascii');
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

/** ponytail: buffers the utterance and transcribes once on finish; no partials.
 * Upgrade to the Live API session when hands-free barge-in needs streaming recognition. */
export class GeminiSpeechRecognizer implements SpeechRecognizer {
  constructor(private readonly options: GeminiOptions) {}

  async open(
    context: ProviderContext,
    emit: (event: RecognitionEvent) => void,
  ): Promise<RecognitionSession> {
    const frames: Uint8Array[] = [];
    let closed = false;
    const model = this.options.model ?? 'gemini-2.5-flash';
    return {
      write: ({ seq, pcm }) => {
        if (closed) throw new Error('Recognition session is closed.');
        if (seq !== frames.length) throw new Error('Audio frame out of sequence.');
        if (frames.length >= MAX_RECORDING_FRAMES) throw new Error('Recording exceeds 30 seconds.');
        if (pcm.byteLength === 0 || pcm.byteLength > FRAME_BYTES * 4 || pcm.byteLength % 2)
          throw new Error('Malformed audio frame.');
        frames.push(new Uint8Array(pcm.slice(0)));
      },
      finish: async () => {
        if (closed) throw new Error('Recognition session is closed.');
        if (frames.length === 0) throw new Error('No audio was recorded.');
        closed = true;
        const wav = wavFromPcm16(Buffer.concat(frames), INPUT_RATE);
        try {
          const response = await callGemini(
            this.options,
            `models/${model}:generateContent`,
            {
              contents: [
                {
                  parts: [
                    { inlineData: { mimeType: 'audio/wav', data: wav.toString('base64') } },
                    {
                      text:
                        `Transcribe this ${languageName[context.locale]} speech verbatim in its ` +
                        'native script. Return only the transcript, or an empty string if there is no speech.',
                    },
                  ],
                },
              ],
              generationConfig: { temperature: 0, maxOutputTokens: 400 },
            },
            context.signal,
          );
          const text = textParts((await response.json()) as GeminiResponse).trim();
          emit({ type: 'final', text });
        } catch (error) {
          if (context.signal.aborted) throw error;
          emit({
            type: 'error',
            code:
              error instanceof GeminiError && error.code === 'PROVIDER_QUOTA'
                ? 'PROVIDER_QUOTA'
                : 'STT_UNAVAILABLE',
          });
        }
      },
      close: () => {
        closed = true;
        frames.length = 0;
      },
    };
  }
}
