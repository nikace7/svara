import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { loadWorkspaceEnvironment, parseServerConfig } from '../packages/config/src/server.js';
import { decodePcm16, PcmBatcher, StreamingResampler } from '../packages/audio/src/index.js';
import {
  GeminiAnswerGenerator,
  GeminiSpeechRecognizer,
  GeminiSpeechSynthesizer,
  SentenceSegments,
  wavFromPcm16,
} from '../packages/providers/src/index.js';
import type { Locale } from '../packages/contracts/src/events.js';
import type { RecognitionEvent } from '../packages/providers/src/index.js';

/** Live M1 gate: fixture question → Gemini answer → Gemini speech → Gemini transcript.
 * Runs only with an explicit opt-in. Writes audio and a report to ignored artifacts/. */
loadWorkspaceEnvironment();
const config = parseServerConfig(process.env);
if (!config.ALLOW_LIVE_EVAL || !config.GEMINI_API_KEY)
  throw new Error('Set ALLOW_LIVE_EVAL=true and GEMINI_API_KEY in .env to run the live gate.');

const gemini = {
  apiKey: config.GEMINI_API_KEY,
  model: config.GEMINI_MODEL,
  ttsModel: config.GEMINI_TTS_MODEL,
  sttModel: config.GEMINI_STT_MODEL,
  voice: config.GEMINI_VOICE,
  retries: 2,
};
const passages = [
  { id: 'admissions', text: 'The demo admissions office is in Room A-101, open 10:00–16:00.' },
  { id: 'library', text: 'The demo library is on the second floor of Block B.' },
];
const questions: Record<Locale, string> = {
  'en-US': 'Where is the admissions office and when is it open?',
  'ne-NP': 'भर्ना कार्यालय कहाँ छ र कहिले खुल्छ?',
};
const outDir = fileURLToPath(new URL('../artifacts/gemini-smoke/', import.meta.url));
await mkdir(outDir, { recursive: true });

async function runLocale(locale: Locale) {
  const controller = new AbortController();
  const deadline = setTimeout(() => controller.abort(), 180000);
  const context = { locale, mode: 'live' as const, signal: controller.signal };
  const timings: Record<string, number> = {};
  const started = performance.now();
  try {
    const splitter = new SentenceSegments();
    const segments: string[] = [];
    for await (const delta of new GeminiAnswerGenerator(gemini).generate(
      { question: questions[locale], passages, history: [] },
      context,
    )) {
      // No tools are offered, so only text is expected.
      if (typeof delta !== 'string') continue;
      if (!('firstToken' in timings)) timings['firstToken'] = performance.now() - started;
      segments.push(...splitter.push(delta));
    }
    segments.push(...splitter.finish());
    timings['answer'] = performance.now() - started;
    const answer = segments.join('');

    const synthesizer = new GeminiSpeechSynthesizer(gemini);
    const chunks: Uint8Array[] = [];
    for (const segment of segments)
      for await (const pcm of synthesizer.synthesize(segment, context))
        chunks.push(new Uint8Array(pcm));
    timings['speech'] = performance.now() - started;
    const pcm24k = Buffer.concat(chunks);
    await writeFile(join(outDir, `${locale}.wav`), wavFromPcm16(pcm24k, 24000));

    // Round trip: resample 24 kHz speech to the 16 kHz microphone format and transcribe it.
    const resampler = new StreamingResampler(24000);
    const batcher = new PcmBatcher();
    const events: RecognitionEvent[] = [];
    const session = await new GeminiSpeechRecognizer(gemini).open(context, (e) => events.push(e));
    const samples = decodePcm16(
      pcm24k.buffer.slice(pcm24k.byteOffset, pcm24k.byteOffset + pcm24k.byteLength),
    );
    for (let i = 0; i < samples.length; i += 2400)
      for (const packet of batcher.push(resampler.push(samples.subarray(i, i + 2400))))
        session.write(packet);
    await session.finish();
    session.close();
    timings['transcript'] = performance.now() - started;
    const final = events.find((e) => e.type === 'final');
    return {
      locale,
      question: questions[locale],
      answer,
      segments: segments.length,
      audioSeconds: pcm24k.length / 2 / 24000,
      transcript: final && 'text' in final ? final.text : null,
      recognitionEvents: events.filter((e) => e.type !== 'final'),
      timingsMs: Object.fromEntries(Object.entries(timings).map(([k, v]) => [k, Math.round(v)])),
    };
  } catch (error) {
    return {
      locale,
      failed: error instanceof Error ? error.message : String(error),
      timingsMs: timings,
    };
  } finally {
    clearTimeout(deadline);
  }
}

const results = [await runLocale('en-US'), await runLocale('ne-NP')];
const report = {
  checkedAt: new Date().toISOString(),
  models: {
    generation: gemini.model,
    speech: gemini.ttsModel,
    recognition: gemini.sttModel,
    voice: gemini.voice,
  },
  results,
};
await writeFile(join(outDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
console.info(JSON.stringify(report, null, 2));
if (results.some((result) => 'failed' in result)) process.exitCode = 1;
