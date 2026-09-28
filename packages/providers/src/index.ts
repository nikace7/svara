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
/** A function the model may propose; string arguments only, validated by the server. */
export interface ToolDeclaration {
  name: string;
  description: string;
  parameters: Record<string, { description: string; enum?: readonly string[] }>;
  required: readonly string[];
}
/** A complete proposal, yielded only once the provider finished emitting it. `raw` is the
 * provider's own part, echoed back verbatim in the next round. */
export interface ProposedToolCall {
  type: 'tool';
  callId: string;
  name: string;
  args: Record<string, unknown>;
  raw?: unknown;
}
export type AnswerChunk = string | ProposedToolCall;
export interface AnswerInput {
  question: string;
  /** Passage ids are short labels the answer cites in brackets, e.g. [1]. */
  passages: readonly { id: string; text: string }[];
  history: readonly { role: 'user' | 'assistant'; text: string }[];
  /** The release persona and any other staff-authored guidance. */
  instructions?: string;
  tools?: readonly ToolDeclaration[];
  /** Labelled slides the show_slide tool may name. */
  slides?: readonly { label: string; title: string }[];
  /** The second and last round: what the proposed calls actually did. No tools are offered. */
  toolRound?: {
    calls: readonly ProposedToolCall[];
    results: readonly { callId: string; name: string; result: unknown }[];
  };
}
export interface AnswerGenerator {
  generate(input: AnswerInput, context: ProviderContext): AsyncIterable<AnswerChunk>;
}
export interface SpeechSynthesizer {
  synthesize(text: string, context: ProviderContext): AsyncIterable<ArrayBuffer>;
}
