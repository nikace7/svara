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

describe('streaming answer playback', () => {
  function playbackHarness() {
    const { audio, node, context } = harness();
    const posted: { type: string; packet?: { seq: number; segment: number; end: boolean } }[] = [];
    node.port.postMessage.mockImplementation((message: unknown) => {
      posted.push(message as { type: string });
    });
    const reply = (data: Record<string, unknown>) =>
      node.port.onmessage?.(new MessageEvent('message', { data }));
    const packets = () => posted.filter((message) => message.type === 'pcm').map((m) => m.packet!);
    return { audio, node, context, posted, reply, packets };
  }
  const pcm = () => new ArrayBuffer(4800);

  it('resets the generation and sends one packet at a time in order', async () => {
    const { audio, reply, posted, packets } = playbackHarness();
    const events: string[] = [];
    const playback = await audio.startAnswer(new AbortController().signal, 7, (type) =>
      events.push(type),
    );
    expect(posted[0]).toEqual({ type: 'reset', generation: 7 });
    playback.push(pcm(), 0, false);
    playback.push(pcm(), 0, true);
    // The second packet waits for the first acknowledgement rather than racing it.
    expect(packets()).toHaveLength(1);
    reply({ type: 'started' });
    reply({ type: 'accepted', accepted: true, seq: 0 });
    expect(packets()).toEqual([
      { generation: 7, seq: 0, segment: 0, end: false, pcm: expect.anything() },
      { generation: 7, seq: 1, segment: 0, end: true, pcm: expect.anything() },
    ]);
    reply({ type: 'accepted', accepted: true, seq: 1 });
    playback.finish(0);
    expect(events).toEqual(['started']);
    reply({ type: 'segment-completed', segment: 0 });
    expect(events).toEqual(['started', 'completed']);
    await audio.stop();
  });

  it('retries a rejected packet instead of dropping or reordering it', async () => {
    vi.useFakeTimers();
    try {
      const { audio, reply, packets } = playbackHarness();
      const events: string[] = [];
      const playback = await audio.startAnswer(new AbortController().signal, 1, (type) =>
        events.push(type),
      );
      playback.push(pcm(), 0, true);
      expect(packets()).toHaveLength(1);
      reply({ type: 'accepted', accepted: false, seq: 0 });
      expect(packets()).toHaveLength(1);
      vi.advanceTimersByTime(100);
      // Same sequence number, resent: a full queue is backpressure, not a failure.
      expect(packets()).toEqual([
        { generation: 1, seq: 0, segment: 0, end: true, pcm: expect.anything() },
        { generation: 1, seq: 0, segment: 0, end: true, pcm: expect.anything() },
      ]);
      expect(events).toEqual([]);
      await audio.stop();
    } finally {
      vi.useRealTimers();
    }
  });

  it('completes only on the final segment and ignores pushes after finish', async () => {
    const { audio, reply, packets } = playbackHarness();
    const events: string[] = [];
    const playback = await audio.startAnswer(new AbortController().signal, 1, (type) =>
      events.push(type),
    );
    playback.push(pcm(), 0, true);
    reply({ type: 'accepted', accepted: true, seq: 0 });
    playback.push(pcm(), 1, true);
    reply({ type: 'accepted', accepted: true, seq: 1 });
    playback.finish(1);
    playback.push(pcm(), 2, true);
    expect(packets()).toHaveLength(2);
    reply({ type: 'segment-completed', segment: 0 });
    expect(events).toEqual([]);
    reply({ type: 'segment-completed', segment: 1 });
    expect(events).toEqual(['completed']);
    await audio.stop();
  });

  it('completes immediately when a turn produced no audio at all', async () => {
    const { audio, context } = playbackHarness();
    const events: string[] = [];
    const playback = await audio.startAnswer(new AbortController().signal, 1, (type) =>
      events.push(type),
    );
    playback.finish();
    expect(events).toEqual(['completed']);
    expect(context.close).toHaveBeenCalled();
    await audio.stop();
  });

  it('reports a processor failure and refuses a second concurrent playback', async () => {
    const { audio, node } = playbackHarness();
    const events: string[] = [];
    const playback = await audio.startAnswer(new AbortController().signal, 1, (type) =>
      events.push(type),
    );
    await expect(audio.startAnswer(new AbortController().signal, 2, () => {})).rejects.toThrow(
      'already active',
    );
    node.onprocessorerror?.();
    expect(events).toEqual(['failed']);
    // A disposed run accepts no further audio.
    playback.push(new ArrayBuffer(4800), 0, true);
    await audio.stop();
  });
});

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
