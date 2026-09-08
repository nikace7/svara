import { describe, expect, it } from 'vitest';
import { readVoiceStream } from './voice-stream.js';

const make = (seq: number, type = 'answer', generation = 1) => ({
  v: 1,
  turnId: '00000000-0000-4000-8000-000000000001',
  generation,
  seq,
  elapsedMs: 2,
  type,
  text: 'नमस्ते।',
  providerMode: 'fixture',
  audio: 'unavailable',
});
async function read(response: Response) {
  const values = [];
  for await (const event of readVoiceStream(response, 1)) values.push(event);
  return values;
}
describe('fixture stream validation', () => {
  it('decodes Nepali split across individual UTF-8 bytes', async () => {
    const bytes = new TextEncoder().encode(
      `${JSON.stringify(make(0))}\n${JSON.stringify(make(1, 'complete'))}\n`,
    );
    const stream = new ReadableStream({
      start(controller) {
        for (const byte of bytes) controller.enqueue(new Uint8Array([byte]));
        controller.close();
      },
    });
    expect((await read(new Response(stream)))[0]?.text).toBe('नमस्ते।');
  });
  it('rejects sequence gaps, stale generations, unbounded lines and missing completion', async () => {
    for (const content of [
      JSON.stringify(make(1)),
      JSON.stringify(make(0, 'answer', 2)),
      'x'.repeat(17000),
      JSON.stringify(make(0)),
    ])
      await expect(read(new Response(`${content}\n`))).rejects.toThrow();
    await expect(read(new Response('', { status: 503 }))).rejects.toThrow();
  });
});
