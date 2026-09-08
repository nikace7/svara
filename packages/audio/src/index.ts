/** Negotiated PCM format. Capture/resampling/playback are implemented in M1. */
export const AUDIO_FORMAT = {
  inputSampleRate: 16000,
  outputSampleRate: 24000,
  channels: 1,
  bitsPerSample: 16,
  inputBatchBytes: 3200,
} as const;
