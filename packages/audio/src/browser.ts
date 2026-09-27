import { decodePcm16 } from './pcm.js';

export interface AudioEnvironment {
  createContext(): AudioContext;
  getUserMedia(): Promise<MediaStream>;
  createWorklet(context: AudioContext, name: string): AudioWorkletNode;
}
const browserEnvironment: AudioEnvironment = {
  createContext: () => new AudioContext({ latencyHint: 'interactive' }),
  getUserMedia: () =>
    navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
      video: false,
    }),
  createWorklet: (context, name) =>
    new AudioWorkletNode(context, name, { outputChannelCount: [1] }),
};
interface Run {
  context: AudioContext;
  disposed: boolean;
  stream?: MediaStream;
  source?: MediaStreamAudioSourceNode;
  node?: AudioWorkletNode;
  removeAbort(): void;
}
export interface AnswerPlayback {
  /** Queues one bounded 24 kHz PCM16 packet for its segment. */
  push(pcm: ArrayBuffer, segment: number, end: boolean): void;
  /** No more packets. Pass the final segment index, or nothing if none were queued. */
  finish(lastSegment?: number): void;
}
export interface CaptureMeter {
  rms: number;
  seq: number;
  inputRate: number;
  bytes: number;
}

/** One resource owner for this lab. No microphone frame is retained or sent over HTTP. */
export class LabAudio {
  private capture: Run | undefined;
  private playback: Run | undefined;
  constructor(private readonly environment = browserEnvironment) {}

  private createRun(signal: AbortSignal): Run {
    signal.throwIfAborted();
    const context = this.environment.createContext();
    const run: Run = {
      context,
      disposed: false,
      removeAbort: () => signal.removeEventListener('abort', abort),
    };
    const abort = () => {
      void this.dispose(run);
    };
    signal.addEventListener('abort', abort, { once: true });
    return run;
  }
  private async dispose(run: Run | undefined): Promise<void> {
    if (!run || run.disposed) return;
    run.disposed = true;
    run.removeAbort();
    run.stream?.getTracks().forEach((track) => track.stop());
    run.source?.disconnect();
    if (run.node) {
      run.node.port.onmessage = null;
      run.node.port.postMessage({ type: 'stop' });
      run.node.port.close();
      run.node.disconnect();
    }
    if (run.context.state !== 'closed') await run.context.close();
  }

  async startCapture(
    signal: AbortSignal,
    meter: (value: CaptureMeter) => void,
    failed: () => void,
    /** Receives each 100 ms PCM16 batch, for a recording that leaves the browser. */
    frame?: (pcm: ArrayBuffer) => void,
  ): Promise<void> {
    if (this.capture && !this.capture.disposed) throw new Error('Microphone already active.');
    const run = this.createRun(signal);
    this.capture = run;
    // Both operations start in the user's gesture; a delayed grant is always reclaimed.
    try {
      const resume = run.context.resume();
      const permission = Promise.resolve()
        .then(() => this.environment.getUserMedia())
        .then((stream) => {
          if (run.disposed || signal.aborted) {
            stream.getTracks().forEach((track) => track.stop());
            signal.throwIfAborted();
            throw new DOMException('Capture ended.', 'AbortError');
          }
          run.stream = stream;
          return stream;
        });
      const [, stream] = await Promise.all([resume, permission]);
      signal.throwIfAborted();
      await run.context.audioWorklet.addModule('/audio/worklet.js');
      signal.throwIfAborted();
      if (run.disposed) throw new DOMException('Capture ended.', 'AbortError');
      const node = this.environment.createWorklet(run.context, 'svara-capture');
      run.node = node;
      const terminal = () => {
        if (!run.disposed) {
          void this.dispose(run);
          failed();
        }
      };
      node.onprocessorerror = terminal;
      stream
        .getTracks()
        .forEach((track) => track.addEventListener('ended', terminal, { once: true }));
      node.port.onmessage = (
        event: MessageEvent<{ type: string; seq: number; pcm: ArrayBuffer; inputRate: number }>,
      ) => {
        if (run.disposed) return;
        if (event.data.type === 'error') {
          terminal();
          return;
        }
        if (event.data.type !== 'pcm') return;
        frame?.(event.data.pcm);
        const samples = decodePcm16(event.data.pcm);
        meter({
          seq: event.data.seq,
          inputRate: event.data.inputRate,
          bytes: event.data.pcm.byteLength,
          rms: Math.sqrt(
            samples.reduce((sum, sample) => sum + sample * sample, 0) / samples.length,
          ),
        });
        node.port.postMessage({ type: 'ack', seq: event.data.seq });
      };
      run.source = run.context.createMediaStreamSource(stream);
      run.source.connect(node);
      // Capture worklet outputs silence: connect to keep the graph processing without echo.
      node.connect(run.context.destination);
    } catch (error) {
      await this.dispose(run);
      throw error;
    }
  }

  /** Opens one playback graph. Callers own what they post and when they dispose it. */
  private async openPlayback(
    signal: AbortSignal,
    generation: number,
    handle: (
      message: { type: string; accepted?: boolean; segment?: number },
      run: Run,
      node: AudioWorkletNode,
    ) => void,
    failed: (run: Run) => void,
  ): Promise<{ run: Run; node: AudioWorkletNode }> {
    if (this.playback && !this.playback.disposed) throw new Error('Playback already active.');
    const run = this.createRun(signal);
    this.playback = run;
    try {
      await run.context.resume();
      await run.context.audioWorklet.addModule('/audio/worklet.js');
      signal.throwIfAborted();
      if (run.disposed) throw new DOMException('Playback ended.', 'AbortError');
      const node = this.environment.createWorklet(run.context, 'svara-playback');
      run.node = node;
      const terminal = () => {
        if (!run.disposed) {
          void this.dispose(run);
          failed(run);
        }
      };
      node.onprocessorerror = terminal;
      node.port.onmessage = (
        message: MessageEvent<{ type: string; accepted?: boolean; segment?: number }>,
      ) => {
        if (run.disposed) return;
        if (message.data.type === 'error') {
          terminal();
          return;
        }
        handle(message.data, run, node);
      };
      node.port.postMessage({ type: 'reset', generation });
      return { run, node };
    } catch (error) {
      await this.dispose(run);
      throw error;
    }
  }

  async playTone(
    signal: AbortSignal,
    event: (type: 'started' | 'completed' | 'failed') => void,
  ): Promise<void> {
    const { run, node } = await this.openPlayback(
      signal,
      1,
      (message) => {
        if (message.type === 'started') event('started');
        if (message.type === 'segment-completed') {
          void this.dispose(run);
          event('completed');
        }
        if (message.accepted === false) {
          void this.dispose(run);
          event('failed');
        }
      },
      () => event('failed'),
    );
    // Original 600 ms, 440 Hz test signal with fades. This is not synthesized speech.
    for (let seq = 0; seq < 6; seq++) {
      const pcm = new ArrayBuffer(4800);
      const view = new DataView(pcm);
      for (let i = 0; i < 2400; i++) {
        const t = (seq * 2400 + i) / 24000;
        const gain = 0.12 * Math.min(1, t / 0.02, (0.6 - t) / 0.02);
        view.setInt16(i * 2, Math.round(32767 * gain * Math.sin(2 * Math.PI * 440 * t)), true);
      }
      node.port.postMessage(
        { type: 'pcm', packet: { generation: 1, seq, segment: 0, end: seq === 5, pcm } },
        [pcm],
      );
    }
    node.connect(run.context.destination);
  }

  /** Streams answer speech. The worklet's bounded queue is the pacing signal: a
   * rejected packet is retried rather than dropped, so nothing plays out of order. */
  async startAnswer(
    signal: AbortSignal,
    generation: number,
    event: (type: 'started' | 'completed' | 'failed') => void,
  ): Promise<AnswerPlayback> {
    const pending: { pcm: ArrayBuffer; segment: number; end: boolean }[] = [];
    let seq = 0;
    let inFlight = false;
    let finished = false;
    let finalSegment: number | undefined;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let sender: ((packet: { type: string; packet: unknown }) => void) | undefined;
    const send = () => {
      if (inFlight || !sender) return;
      const next = pending[0];
      if (!next) return;
      inFlight = true;
      sender({
        type: 'pcm',
        packet: { generation, seq, segment: next.segment, end: next.end, pcm: next.pcm },
      });
    };
    const { run, node } = await this.openPlayback(
      signal,
      generation,
      (message, _run, worklet) => {
        sender ??= (packet) => worklet.port.postMessage(packet);
        if (message.type === 'started') event('started');
        if (message.type === 'accepted') {
          inFlight = false;
          if (message.accepted === true) {
            pending.shift();
            seq++;
            send();
          } else {
            // The queue is full; it drains at playback rate, so wait and retry the same packet.
            clearTimeout(retry);
            retry = setTimeout(send, 100);
          }
        }
        if (message.type === 'segment-completed' && message.segment === finalSegment) {
          clearTimeout(retry);
          void this.dispose(run);
          event('completed');
        }
      },
      () => {
        clearTimeout(retry);
        event('failed');
      },
    );
    sender = (packet) => node.port.postMessage(packet);
    node.connect(run.context.destination);
    return {
      push: (pcm, segment, end) => {
        if (run.disposed || finished) return;
        pending.push({ pcm, segment, end });
        send();
      },
      finish: (lastSegment) => {
        finished = true;
        finalSegment = lastSegment;
        // Nothing was ever queued, so no segment will complete.
        if (lastSegment === undefined) {
          clearTimeout(retry);
          void this.dispose(run);
          event('completed');
        }
      },
    };
  }

  async stop(): Promise<void> {
    await Promise.all([this.dispose(this.capture), this.dispose(this.playback)]);
  }
}
