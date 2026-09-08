import { randomUUID, createHash } from 'node:crypto';
import { link, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
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
    if (
      dirname(resolve(root)) !== resolve(tmpdir()) ||
      !basename(root).startsWith('svara-media-test-')
    ) {
      throw new Error('Refusing cleanup outside the generated media test directory.');
    }
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

  it('checks a stored file across read chunks and gives the caller ownership of its handle', async () => {
    const id = randomUUID();
    const bytes = Buffer.alloc(150_001, 83);
    const receipt = await storage.receive(
      id,
      bytes.length,
      Readable.from([bytes]),
      AbortSignal.timeout(1000),
    );
    expect(await storage.checksum(`${id}.upload`)).toEqual(receipt);
    const { handle, size } = await storage.read(`${id}.upload`);
    try {
      expect(size).toBe(bytes.length);
      const sample = Buffer.alloc(4);
      await handle.read(sample, 0, sample.length, 0);
      expect(sample).toEqual(bytes.subarray(0, 4));
    } finally {
      await handle.close();
    }
  });

  it('rejects empty files and extra hard links and propagates cleanup failures', async () => {
    const empty = `${randomUUID()}.upload`;
    await writeFile(storage.path(empty), '');
    await expect(storage.read(empty)).rejects.toMatchObject({ code: 'INTEGRITY_MISMATCH' });
    const original = `${randomUUID()}.upload`;
    const alias = `${randomUUID()}.upload`;
    await writeFile(storage.path(original), 'linked bytes');
    await link(storage.path(original), storage.path(alias));
    await expect(storage.checksum(original)).rejects.toMatchObject({ code: 'INTEGRITY_MISMATCH' });
    await storage.remove(alias);
    expect((await storage.checksum(original)).byteLength).toBe(12);
    await storage.remove(alias);
    const directory = `${randomUUID()}.upload`;
    await mkdir(storage.path(directory));
    await expect(storage.remove(directory)).rejects.toBeDefined();
  });

  it('rejects impossible declared sizes before creating files', async () => {
    for (const size of [0, -1, 1.5, NaN, 50 * 1024 * 1024 + 1]) {
      await expect(
        storage.receive(
          randomUUID(),
          size,
          Readable.from([Buffer.from('a')]),
          AbortSignal.timeout(1000),
        ),
      ).rejects.toMatchObject({ code: 'UPLOAD_LENGTH_MISMATCH' });
    }
    expect(await readdir(root)).toEqual([]);
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
    expect(() => parseMediaRange(undefined, 0)).toThrow();
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
