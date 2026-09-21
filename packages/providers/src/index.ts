import type { Locale, ProviderMode } from '@svara/contracts';

export * from './segments.js';
export * from './fixture.js';
export * from './gemini.js';

/** Provider implementations own and close all handles on signal cancellation. */
export interface ProviderContext {
  locale: Locale;
  mode: ProviderMode;
  signal: AbortSignal;
}

export type RecognitionEvent =
  | { type: 'partial' | 'final'; text: string }
  | { type: 'speech-start' | 'utterance-end' }
  | { type: 'error'; code: 'STT_UNAVAILABLE' | 'PROVIDER_QUOTA' };
export interface RecognitionSession {
  write(frame: { seq: number; pcm: ArrayBuffer }): void;
  finish(): Promise<void>;
  close(): void;
}
export interface SpeechRecognizer {
  open(
    context: ProviderContext,
    emit: (event: RecognitionEvent) => void,
  ): Promise<RecognitionSession>;
}
export interface AnswerInput {
  question: string;
  passages: readonly { id: string; text: string }[];
  history: readonly { role: 'user' | 'assistant'; text: string }[];
}
export interface AnswerGenerator {
  generate(input: AnswerInput, context: ProviderContext): AsyncIterable<string>;
}
export interface SpeechSynthesizer {
  synthesize(text: string, context: ProviderContext): AsyncIterable<ArrayBuffer>;
}
