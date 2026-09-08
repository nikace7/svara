export * from './pcm.js';
export * from './playback.js';
export * from './generation.js';

/** The protocol uses raw signed PCM16 little-endian mono. */
export const AUDIO_FORMAT = {
  inputSampleRate: 16000,
  outputSampleRate: 24000,
  channels: 1,
  bitsPerSample: 16,
  inputBatchBytes: 3200,
} as const;
