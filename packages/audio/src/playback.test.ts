import { describe, expect, it } from 'vitest';
import { PlaybackQueue } from './playback.js';
import { GenerationOwner } from './generation.js';

const packet = (seq = 0, generation = 1, segment = 0, end = true, length = 2400) => ({
  seq,
  generation,
  segment,
  end,
  pcm: new Int16Array(length).fill(16000).buffer,
});

describe('bounded ordered PCM playback', () => {
  it('plays 24 kHz PCM at the actual context rate and reports heard boundaries', () => {
    const queue = new PlaybackQueue();
    queue.reset(1);
    expect(queue.push(packet())).toBe(true);
    const result = queue.render(4800, 48000);
    expect(result.samples[0]).toBeCloseTo(16000 / 32768);
    expect(result.events).toEqual([
      { type: 'started', generation: 1 },
      { type: 'segment-completed', generation: 1, segment: 0 },
    ]);
    expect(queue.queuedSamples).toBe(0);
    expect(queue.render(128, 48000).samples.every((x) => x === 0)).toBe(true);
  });
  it('refuses more than two seconds without consuming the sequence number', () => {
    const queue = new PlaybackQueue();
    queue.reset(1);
    for (let seq = 0; seq < 20; seq++) expect(queue.push(packet(seq, 1, 0, false))).toBe(true);
    expect(queue.push(packet(20))).toBe(false);
    queue.render(2400, 24000);
    expect(queue.push(packet(20))).toBe(true);
  });
  it('rejects sequence gaps, invalid segments and malformed packet sizes', () => {
    const queue = new PlaybackQueue();
    queue.reset(1);
    expect(() => queue.push(packet(1))).toThrow('sequence');
    expect(() => queue.push(packet(0, 1, 2))).toThrow('segment');
    expect(() => queue.push({ ...packet(), pcm: new ArrayBuffer(1) })).toThrow();
    expect(() => queue.push(packet(0, 1, 0, true, 5000))).toThrow();
    expect(() => queue.render(0, 48000)).toThrow();
  });
  it('flushes on interrupt and drops late callbacks from older generations', () => {
    const queue = new PlaybackQueue();
    queue.reset(1);
    queue.push(packet());
    queue.reset(2);
    expect(queue.push(packet(1, 1))).toBe(false);
    expect(queue.render(128, 44100).events).toEqual([]);
    expect(queue.queuedSamples).toBe(0);
    expect(queue.push(packet(0, 2))).toBe(true);
  });
  it('keeps successive segments ordered across irregular render blocks', () => {
    const queue = new PlaybackQueue();
    queue.reset(1);
    queue.push(packet(0, 1, 0));
    queue.push(packet(1, 1, 1));
    const heard: number[] = [];
    for (let i = 0; i < 100; i++)
      for (const event of queue.render(128, 44100).events)
        if (event.type === 'segment-completed') heard.push(event.segment);
    expect(heard).toEqual([0, 1]);
  });
});

describe('one answer generation owner', () => {
  it('invalidates callbacks before abort listeners run and replaces controllers', () => {
    const owner = new GenerationOwner();
    const first = owner.begin();
    let acceptedAtAbort = true;
    first.signal.addEventListener('abort', () => {
      acceptedAtAbort = owner.accepts(first.id);
    });
    const next = owner.begin();
    expect(acceptedAtAbort).toBe(false);
    expect(first.signal.aborted).toBe(true);
    expect(owner.accepts(next.id)).toBe(true);
    owner.cancel();
    owner.cancel();
    expect(next.signal.aborted).toBe(true);
    expect(owner.accepts(next.id)).toBe(false);
  });
});
