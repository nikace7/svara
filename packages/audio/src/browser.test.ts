import { describe, expect, it, vi } from 'vitest';
import { LabAudio } from './browser.js';

function harness(media?: Promise<MediaStream>) {
  const track = { stop: vi.fn(), addEventListener: vi.fn() };
  const stream = { getTracks: () => [track] } as unknown as MediaStream;
  const node = {
    connect: vi.fn(),
    disconnect: vi.fn(),
    onprocessorerror: null,
    port: { postMessage: vi.fn(), close: vi.fn(), onmessage: null },
  };
  const context = {
    sampleRate: 48000,
    state: 'running',
    resume: vi.fn(async () => {}),
    close: vi.fn(async () => {}),
    audioWorklet: { addModule: vi.fn(async () => {}) },
    createMediaStreamSource: vi.fn(() => node),
    destination: {},
  };
  const env = {
    createContext: () => context as unknown as AudioContext,
    getUserMedia: () => media ?? Promise.resolve(stream),
    createWorklet: () => node as unknown as AudioWorkletNode,
  };
  return { audio: new LabAudio(env), track, stream, context, node };
}

describe('browser microphone lifecycle', () => {
  it('stops all tracks, context and ports on end, idempotently', async () => {
    const { audio, track, context, node } = harness();
    await audio.startCapture(
      new AbortController().signal,
      () => {},
      () => {},
    );
    await audio.stop();
    await audio.stop();
    expect(track.stop).toHaveBeenCalledTimes(1);
    expect(context.close).toHaveBeenCalledTimes(1);
    expect(node.port.close).toHaveBeenCalledTimes(1);
  });
  it('releases permission granted after cancellation without starting capture', async () => {
    let grant!: (stream: MediaStream) => void;
    const pending = new Promise<MediaStream>((resolve) => {
      grant = resolve;
    });
    const { audio, track, stream, context } = harness(pending);
    const controller = new AbortController();
    const start = audio.startCapture(
      controller.signal,
      () => {},
      () => {},
    );
    await Promise.resolve();
    controller.abort();
    grant(stream);
    await expect(start).rejects.toMatchObject({ name: 'AbortError' });
    expect(track.stop).toHaveBeenCalledTimes(1);
    expect(context.close).toHaveBeenCalledTimes(1);
  });
  it('cleans up when permission or worklet setup fails', async () => {
    const { audio, context, track } = harness();
    context.audioWorklet.addModule.mockRejectedValueOnce(new Error('worklet unavailable'));
    await expect(
      audio.startCapture(
        new AbortController().signal,
        () => {},
        () => {},
      ),
    ).rejects.toThrow();
    expect(track.stop).toHaveBeenCalledTimes(1);
    expect(context.close).toHaveBeenCalledTimes(1);
    const denied = harness(Promise.reject(new DOMException('Denied', 'NotAllowedError')));
    await expect(
      denied.audio.startCapture(
        new AbortController().signal,
        () => {},
        () => {},
      ),
    ).rejects.toMatchObject({ name: 'NotAllowedError' });
    expect(denied.context.close).toHaveBeenCalledTimes(1);
  });
});
