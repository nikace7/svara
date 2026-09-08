import { randomUUID, createHash } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MediaStorage } from './storage.js';
import { parseMediaRange } from './range.js';

describe('private streaming media storage', () => {
  let root: string;
  let storage: MediaStorage;
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'svara-media-test-'));
    storage = await MediaStorage.open(root);
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('writes exact bytes into private quarantine and computes integrity from the stream', async () => {
    const id = randomUUID();
    const chunks = [Buffer.from('first'), Buffer.from('second')];
    const result = await storage.receive(id, 11, Readable.from(chunks), AbortSignal.timeout(1000));
    expect(result).toEqual({
      byteLength: 11,
      sha256: createHash('sha256').update('firstsecond').digest('hex'),
    });
    expect(await readFile(storage.path(`${id}.upload`), 'utf8')).toBe('firstsecond');
    expect(await readdir(root)).toEqual([`${id}.upload`]);
  });

  it('rejects mismatched lengths and interruption and removes only its incomplete file', async () => {
    for (const expected of [2, 8]) {
      await expect(
        storage.receive(
          randomUUID(),
          expected,
          Readable.from([Buffer.from('four')]),
          AbortSignal.timeout(1000),
        ),
      ).rejects.toMatchObject({ code: 'UPLOAD_LENGTH_MISMATCH' });
    }
    const cancelled = AbortSignal.abort();
    await expect(
      storage.receive(randomUUID(), 4, Readable.from([Buffer.from('four')]), cancelled),
    ).rejects.toBeDefined();
    expect(await readdir(root)).toEqual([]);
  });

  it('never accepts traversal keys or overwrites a previous upload', async () => {
    const id = randomUUID();
    await writeFile(storage.path(`${id}.upload`), 'original');
    await expect(
      storage.receive(id, 4, Readable.from([Buffer.from('four')]), AbortSignal.timeout(1000)),
    ).rejects.toBeDefined();
    expect(await readFile(storage.path(`${id}.upload`), 'utf8')).toBe('original');
    expect(() => storage.path('../outside')).toThrow();
    expect(() => storage.path('C:\\outside.png')).toThrow();
    expect(await readdir(root)).toEqual([`${id}.upload`]);
  });
});

describe('single byte ranges', () => {
  it('supports complete, bounded, open and suffix responses', () => {
    expect(parseMediaRange(undefined, 100)).toEqual({ start: 0, end: 99, partial: false });
    expect(parseMediaRange('bytes=10-19', 100)).toEqual({ start: 10, end: 19, partial: true });
    expect(parseMediaRange('bytes=90-', 100)).toEqual({ start: 90, end: 99, partial: true });
    expect(parseMediaRange('bytes=-20', 100)).toEqual({ start: 80, end: 99, partial: true });
    expect(parseMediaRange('bytes=90-200', 100)).toEqual({ start: 90, end: 99, partial: true });
  });
  it('rejects ambiguous, unsatisfiable and overflowing ranges', () => {
    for (const value of [
      'bytes=100-',
      'bytes=20-10',
      'bytes=-0',
      'bytes=1-2,4-5',
      'items=1-2',
      'bytes=99999999999999999999-',
      'bytes=-',
      'bytes=1.5-3',
    ]) {
      expect(() => parseMediaRange(value, 100)).toThrow();
    }
  });
});
