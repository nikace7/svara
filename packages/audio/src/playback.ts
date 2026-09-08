import { decodePcm16 } from './pcm.js';

export interface PlaybackPacket {
  generation: number;
  seq: number;
  segment: number;
  end: boolean;
  pcm: ArrayBuffer;
}
export type PlaybackEvent =
  | { type: 'started'; generation: number }
  | { type: 'segment-completed'; generation: number; segment: number };
interface Block {
  samples: Float32Array;
  offset: number;
  segment: number;
  end: boolean;
}

export class PlaybackQueue {
  private blocks: Block[] = [];
  private generation = 0;
  private seq = 0;
  private segment = 0;
  private phase = 0;
  private started = false;
  queuedSamples = 0;

  reset(generation: number): void {
    if (!Number.isSafeInteger(generation) || generation < this.generation)
      throw new Error('Invalid generation.');
    this.generation = generation;
    this.blocks = [];
    this.seq = 0;
    this.segment = 0;
    this.phase = 0;
    this.started = false;
    this.queuedSamples = 0;
  }

  push(packet: PlaybackPacket): boolean {
    if (packet.generation !== this.generation) return false;
    if (packet.seq !== this.seq) throw new Error('Audio sequence gap.');
    if (packet.segment !== this.segment) throw new Error('Audio segment out of order.');
    if (!packet.pcm.byteLength || packet.pcm.byteLength > 4800 || packet.pcm.byteLength % 2)
      throw new Error('Invalid PCM attachment size.');
    const samples = packet.pcm.byteLength / 2;
    if (this.queuedSamples + samples > 48000) return false;
    this.blocks.push({
      samples: decodePcm16(packet.pcm),
      offset: 0,
      segment: packet.segment,
      end: packet.end,
    });
    this.queuedSamples += samples;
    this.seq++;
    if (packet.end) this.segment++;
    return true;
  }

  render(length: number, outputRate: number): { samples: Float32Array; events: PlaybackEvent[] } {
    if (
      !Number.isInteger(length) ||
      length <= 0 ||
      length > 192000 ||
      !Number.isFinite(outputRate) ||
      outputRate < 24000 ||
      outputRate > 192000
    )
      throw new Error('Invalid output audio format.');
    const samples = new Float32Array(length);
    const events: PlaybackEvent[] = [];
    for (let i = 0; i < length && this.blocks.length; i++) {
      const block = this.blocks[0]!;
      if (!this.started) {
        this.started = true;
        events.push({ type: 'started', generation: this.generation });
      }
      const value = block.samples[block.offset]!;
      const next = block.samples[block.offset + 1] ?? this.blocks[1]?.samples[0] ?? value;
      samples[i] = value + this.phase * (next - value);
      this.phase += 24000 / outputRate;
      if (this.phase >= 1 - 1e-9) {
        this.phase = Math.max(0, this.phase - 1);
        block.offset++;
        this.queuedSamples--;
        if (block.offset === block.samples.length) {
          this.blocks.shift();
          if (block.end)
            events.push({
              type: 'segment-completed',
              generation: this.generation,
              segment: block.segment,
            });
        }
      }
    }
    return { samples, events };
  }
}
