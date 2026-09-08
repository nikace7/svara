import { describe, expect, it, vi } from 'vitest';
import { LabAudio } from './browser.js';

function harness(media?: Promise<MediaStream>) {
  const track = { stop: vi.fn(), addEventListener: vi.fn() };
  const stream = { getTracks: () => [track] } as unknown as MediaStream;
  const node = {
    connect: vi.fn(),
    disconnect: vi.fn(),
    onprocessorerror: null as null | (() => void),
    port: {
      postMessage: vi.fn(),
      close: vi.fn(),
      onmessage: null as null | ((event: MessageEvent) => void),
    },
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
  it('acknowledges consumed frames and ends capture after a processor error', async () => {
    const { audio, node, track } = harness();
    const meter = vi.fn();
    const failure = vi.fn();
    await audio.startCapture(new AbortController().signal, meter, failure);
    await expect(audio.startCapture(new AbortController().signal, meter, failure)).rejects.toThrow(
      'already active',
    );
    node.port.onmessage?.(new MessageEvent('message', { data: { type: 'ignored' } }));
    node.port.onmessage?.(
      new MessageEvent('message', {
        data: {
          type: 'pcm',
          seq: 0,
          inputRate: 48000,
          pcm: new Int16Array(1600).fill(16000).buffer,
        },
      }),
    );
    expect(meter).toHaveBeenCalledWith(
      expect.objectContaining({ seq: 0, bytes: 3200, inputRate: 48000 }),
    );
    expect(node.port.postMessage).toHaveBeenCalledWith({ type: 'ack', seq: 0 });
    node.port.onmessage?.(new MessageEvent('message', { data: { type: 'error' } }));
    expect(track.stop).toHaveBeenCalledTimes(1);
    expect(failure).toHaveBeenCalledTimes(1);
    await audio.stop();
  });
  it('does not create resources for an already aborted start', async () => {
    const { audio, context } = harness();
    const controller = new AbortController();
    controller.abort();
    await expect(
      audio.startCapture(
        controller.signal,
        () => {},
        () => {},
      ),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(context.resume).not.toHaveBeenCalled();
  });
  it('cleans up when microphone access throws synchronously in an unsupported browser', async () => {
    const context = {
      state: 'running',
      resume: async () => {},
      close: vi.fn(async () => {}),
    } as unknown as AudioContext;
    const audio = new LabAudio({
      createContext: () => context,
      getUserMedia: () => {
        throw new Error('Unsupported');
      },
      createWorklet: () => {
        throw new Error('Not reached');
      },
    });
    await expect(
      audio.startCapture(
        new AbortController().signal,
        () => {},
        () => {},
      ),
    ).rejects.toThrow('Unsupported');
    expect(context.close).toHaveBeenCalledTimes(1);
  });
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

describe('speaker check resource ownership', () => {
  it('reports actual worklet playback and disposes after the last segment', async () => {
    const { audio, node, context } = harness();
    const callback = vi.fn();
    await audio.playTone(new AbortController().signal, callback);
    await expect(audio.playTone(new AbortController().signal, callback)).rejects.toThrow(
      'already active',
    );
    node.port.onmessage?.(new MessageEvent('message', { data: { type: 'started' } }));
    expect(callback).toHaveBeenCalledWith('started');
    node.port.onmessage?.(new MessageEvent('message', { data: { type: 'segment-completed' } }));
    expect(callback).toHaveBeenCalledWith('completed');
    expect(context.close).toHaveBeenCalledTimes(1);
    await audio.stop();
  });
  it.each([{ type: 'accepted', accepted: false }, { type: 'error' }])(
    'terminates on output rejection %j',
    async (data) => {
      const { audio, node, context } = harness();
      const callback = vi.fn();
      await audio.playTone(new AbortController().signal, callback);
      node.port.onmessage?.(new MessageEvent('message', { data }));
      expect(callback).toHaveBeenCalledWith('failed');
      expect(context.close).toHaveBeenCalledTimes(1);
    },
  );
  it('closes playback after setup failure or cancellation during setup', async () => {
    const failing = harness();
    failing.context.audioWorklet.addModule.mockRejectedValueOnce(new Error('Unavailable'));
    await expect(failing.audio.playTone(new AbortController().signal, () => {})).rejects.toThrow();
    expect(failing.context.close).toHaveBeenCalledTimes(1);
    const cancelled = harness();
    const controller = new AbortController();
    cancelled.context.audioWorklet.addModule.mockImplementationOnce(async () => {
      controller.abort();
    });
    await expect(cancelled.audio.playTone(controller.signal, () => {})).rejects.toMatchObject({
      name: 'AbortError',
    });
    expect(cancelled.context.close).toHaveBeenCalledTimes(1);
  });
});
