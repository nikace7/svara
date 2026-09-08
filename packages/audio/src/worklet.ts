import { PcmBatcher, StreamingResampler } from './pcm.js';
import { PlaybackQueue } from './playback.js';
import type { PlaybackPacket } from './playback.js';

declare const sampleRate: number;
declare class AudioWorkletProcessor {
  readonly port: MessagePort;
}
declare function registerProcessor(name: string, processor: typeof AudioWorkletProcessor): void;

class CaptureProcessor extends AudioWorkletProcessor {
  private readonly resampler = new StreamingResampler(sampleRate);
  private readonly batcher = new PcmBatcher();
  private acknowledged = -1;
  private running = true;
  constructor() {
    super();
    this.port.onmessage = (event: MessageEvent<{ type: string; seq: number }>) => {
      if (event.data.type === 'stop') this.running = false;
      if (event.data.type === 'ack' && Number.isSafeInteger(event.data.seq))
        this.acknowledged = Math.max(this.acknowledged, event.data.seq);
    };
  }
  process(inputs: Float32Array[][]): boolean {
    if (!this.running) return false;
    const channels = inputs[0];
    if (!channels?.[0]) return true;
    try {
      const mono = new Float32Array(channels[0].length);
      for (const channel of channels)
        for (let i = 0; i < mono.length; i++)
          mono[i] = mono[i]! + (channel[i] ?? 0) / channels.length;
      for (const packet of this.batcher.push(this.resampler.push(mono))) {
        if (packet.seq - this.acknowledged > 5) throw new Error('Input backlog.');
        this.port.postMessage({ type: 'pcm', ...packet, inputRate: sampleRate }, [packet.pcm]);
      }
    } catch {
      this.running = false;
      this.port.postMessage({ type: 'error', code: 'AUDIO_INPUT_FAILED' });
    }
    return this.running;
  }
}

class PlaybackProcessor extends AudioWorkletProcessor {
  private readonly queue = new PlaybackQueue();
  private running = true;
  constructor() {
    super();
    this.port.onmessage = (
      event: MessageEvent<{ type: string; generation: number; packet: PlaybackPacket }>,
    ) => {
      try {
        if (event.data.type === 'stop') {
          this.running = false;
          return;
        }
        if (event.data.type === 'reset') this.queue.reset(event.data.generation);
        if (event.data.type === 'pcm') {
          const accepted = this.queue.push(event.data.packet);
          this.port.postMessage({ type: 'accepted', accepted, seq: event.data.packet.seq });
        }
      } catch {
        this.running = false;
        this.port.postMessage({ type: 'error', code: 'AUDIO_OUTPUT_FAILED' });
      }
    };
  }
  process(_inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    if (!this.running) return false;
    const output = outputs[0]?.[0];
    if (!output) return true;
    const result = this.queue.render(output.length, sampleRate);
    output.set(result.samples);
    for (const event of result.events) this.port.postMessage(event);
    return true;
  }
}
registerProcessor('svara-capture', CaptureProcessor);
registerProcessor('svara-playback', PlaybackProcessor);
