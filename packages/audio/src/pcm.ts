/** Causal windowed-sinc low-pass filter followed by continuous-phase interpolation.
 * The 31-input-sample group delay is retained; chunk edges never reset the filter. */
export class StreamingResampler {
  private readonly taps: Float64Array;
  private readonly history = new Float32Array(63);
  private head = 0;
  private index = 0;
  private next = 0;
  private previous = 0;

  constructor(private readonly inputRate: number) {
    if (!Number.isFinite(inputRate) || inputRate < 16000 || inputRate > 192000)
      throw new Error('Unsupported input sample rate.');
    const cutoff = 7200 / inputRate;
    this.taps = Float64Array.from({ length: 63 }, (_, i) => {
      const n = i - 31;
      const sinc = n === 0 ? 2 * cutoff : Math.sin(2 * Math.PI * cutoff * n) / (Math.PI * n);
      return (
        sinc *
        (0.42 - 0.5 * Math.cos((2 * Math.PI * i) / 62) + 0.08 * Math.cos((4 * Math.PI * i) / 62))
      );
    });
    const sum = this.taps.reduce((a, b) => a + b, 0);
    for (let i = 0; i < this.taps.length; i++) this.taps[i] = this.taps[i]! / sum;
  }

  push(input: Float32Array): Float32Array {
    if (!input.every(Number.isFinite)) throw new Error('Non-finite audio sample.');
    if (this.inputRate === 16000) return input.slice();
    const output: number[] = [];
    for (const value of input) {
      this.history[this.head] = value;
      let filtered = 0;
      for (let tap = 0; tap < 63; tap++)
        filtered += this.history[(this.head - tap + 63) % 63]! * this.taps[tap]!;
      this.head = (this.head + 1) % 63;
      if (this.next <= this.index + 1e-8) {
        const fraction = this.next - (this.index - 1);
        output.push(this.previous + fraction * (filtered - this.previous));
        this.next += this.inputRate / 16000;
      }
      this.previous = filtered;
      this.index++;
    }
    return Float32Array.from(output);
  }
}

export interface InputPacket {
  seq: number;
  pcm: ArrayBuffer;
}

export class PcmBatcher {
  private bytes = new ArrayBuffer(3200);
  private offset = 0;
  private seq = 0;

  push(input: Float32Array): InputPacket[] {
    if (!input.every(Number.isFinite)) throw new Error('Non-finite audio sample.');
    const packets: InputPacket[] = [];
    for (const sample of input) {
      const value = Math.max(-1, Math.min(1, sample));
      new DataView(this.bytes).setInt16(
        this.offset,
        Math.round(value * (value < 0 ? 32768 : 32767)),
        true,
      );
      this.offset += 2;
      if (this.offset === 3200) {
        packets.push({ seq: this.seq++, pcm: this.bytes });
        this.bytes = new ArrayBuffer(3200);
        this.offset = 0;
      }
    }
    return packets;
  }

  clear(): void {
    this.bytes = new ArrayBuffer(3200);
    this.offset = 0;
    this.seq = 0;
  }
}

export function decodePcm16(pcm: ArrayBuffer): Float32Array {
  if (pcm.byteLength % 2 !== 0) throw new Error('PCM16 requires whole samples.');
  const view = new DataView(pcm);
  return Float32Array.from(
    { length: pcm.byteLength / 2 },
    (_, i) => view.getInt16(i * 2, true) / 32768,
  );
}
