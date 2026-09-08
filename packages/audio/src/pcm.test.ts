import { describe, expect, it } from 'vitest';
import { PcmBatcher, StreamingResampler, decodePcm16 } from './pcm.js';

const tone = (rate: number, frequency: number) =>
  Float32Array.from({ length: rate }, (_, index) =>
    Math.sin((2 * Math.PI * frequency * index) / rate),
  );

describe('streaming microphone PCM', () => {
  it.each([44100, 48000])('converts %i Hz to exactly one second at 16 kHz', (rate) => {
    const output = new StreamingResampler(rate).push(tone(rate, 440));
    expect(output.length).toBe(16000);
    expect(output.every(Number.isFinite)).toBe(true);
    expect(Math.max(...output)).toBeGreaterThan(0.9);
  });
  it('preserves phase/filter state across render quanta', () => {
    const input = tone(44100, 701);
    const whole = new StreamingResampler(44100).push(input);
    const stream = new StreamingResampler(44100);
    const pieces: number[] = [];
    for (let i = 0; i < input.length; i += 128)
      pieces.push(...stream.push(input.subarray(i, i + 128)));
    expect(pieces).toEqual([...whole]);
  });
  it('suppresses frequencies above the new Nyquist limit', () => {
    const output = new StreamingResampler(48000).push(tone(48000, 12000)).slice(100);
    const rms = Math.sqrt(output.reduce((sum, x) => sum + x * x, 0) / output.length);
    expect(rms).toBeLessThan(0.015);
  });
  it('passes 16 kHz through and rejects unsupported rates/non-finite input', () => {
    expect([...new StreamingResampler(16000).push(new Float32Array([0, 0.5, -0.5]))]).toEqual([
      0, 0.5, -0.5,
    ]);
    for (const rate of [0, 8000, NaN, 200000]) expect(() => new StreamingResampler(rate)).toThrow();
    expect(() => new StreamingResampler(48000).push(new Float32Array([NaN]))).toThrow();
  });
  it('batches five 20 ms frames as 3200-byte little-endian attachments', () => {
    const batcher = new PcmBatcher();
    for (let i = 0; i < 4; i++) expect(batcher.push(new Float32Array(320))).toEqual([]);
    const [first] = batcher.push(new Float32Array(320).fill(1));
    expect(first?.seq).toBe(0);
    expect(first?.pcm.byteLength).toBe(3200);
    expect(new DataView(first!.pcm).getInt16(3198, true)).toBe(32767);
    const [second] = batcher.push(new Float32Array(1600).fill(-2));
    expect(second?.seq).toBe(1);
    expect(new DataView(second!.pcm).getInt16(0, true)).toBe(-32768);
    expect(decodePcm16(second!.pcm)[0]).toBe(-1);
  });
  it('rejects malformed PCM and does not invent padding for unfinished input', () => {
    expect(() => decodePcm16(new ArrayBuffer(3))).toThrow();
    expect(() => new PcmBatcher().push(new Float32Array([Infinity]))).toThrow();
    const batcher = new PcmBatcher();
    expect(batcher.push(new Float32Array(1500))).toEqual([]);
    batcher.clear();
    expect(batcher.push(new Float32Array(100))).toEqual([]);
  });
});
