import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { Readable } from 'node:stream';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadWorkspaceEnvironment, parseServerConfig } from '../../packages/config/src/server.js';
import { MediaStorage } from '../../packages/domain/src/media/storage.js';
import { MediaInspector } from '../../apps/worker/src/media/inspector.js';
import { imageFixture, inspectImageFixture } from '../../apps/worker/test/media-fixtures.js';

describe('real media inspection', () => {
  let root: string;
  let storage: MediaStorage;
  let inspector: MediaInspector;
  let config: ReturnType<typeof parseServerConfig>;
  beforeAll(async () => {
    loadWorkspaceEnvironment();
    config = parseServerConfig(process.env);
    root = await mkdtemp(join(tmpdir(), 'svara-inspection-test-'));
    storage = await MediaStorage.open(root);
    inspector = new MediaInspector(storage, config);
  });
  afterAll(async () => {
    if (root) {
      if (
        dirname(resolve(root)) !== resolve(tmpdir()) ||
        !basename(root).startsWith('svara-inspection-test-')
      )
        throw new Error('Unsafe inspection test cleanup target.');
      await rm(root, { recursive: true, force: true });
    }
  });
  async function upload(bytes: Buffer, declaredMime = 'image/png') {
    const id = randomUUID();
    const receipt = await storage.receive(
      id,
      bytes.length,
      Readable.from([bytes]),
      AbortSignal.timeout(3000),
    );
    return {
      id,
      leaseToken: randomUUID(),
      declaredMime,
      declaredBytes: bytes.length,
      sourceSha256: receipt.sha256,
    };
  }
  async function video(codec: 'libx264' | 'mpeg4') {
    const path = join(root, `${randomUUID()}.fixture.mp4`);
    const ffmpeg =
      process.platform === 'win32' && config.FFPROBE_PATH !== 'ffprobe'
        ? join(dirname(config.FFPROBE_PATH), 'ffmpeg.exe')
        : 'ffmpeg';
    await promisify(execFile)(
      ffmpeg,
      [
        '-v',
        'error',
        '-f',
        'lavfi',
        '-i',
        'color=c=purple:s=32x24:r=10:d=0.4',
        '-c:v',
        codec,
        '-threads',
        '1',
        '-pix_fmt',
        'yuv420p',
        '-movflags',
        '+faststart',
        '-f',
        'mp4',
        path,
      ],
      { timeout: 5000, maxBuffer: 64 * 1024, windowsHide: true },
    );
    return readFile(path);
  }

  it('re-encodes images, applies orientation and strips embedded metadata', async () => {
    const original = await imageFixture('jpeg');
    expect((await inspectImageFixture(original)).exif).toBeDefined();
    const claim = await upload(original, 'image/jpeg');
    const result = await inspector.inspect(claim);
    expect(result).toMatchObject({
      mimeType: 'image/jpeg',
      width: 20,
      height: 30,
      durationSeconds: null,
    });
    const canonical = await readFile(storage.path(result.storageKey));
    expect(await inspectImageFixture(canonical)).toMatchObject({
      width: 20,
      height: 30,
      format: 'jpeg',
    });
    expect((await inspectImageFixture(canonical)).exif).toBeUndefined();
    expect(result.sha256).not.toBe(claim.sourceSha256);
    expect(await storage.checksum(result.storageKey)).toEqual({
      byteLength: result.byteLength,
      sha256: result.sha256,
    });
    expect(result.thumbnailKey).toBeTruthy();
    const thumbnail = await inspectImageFixture(await readFile(storage.path(result.thumbnailKey!)));
    expect(thumbnail.format).toBe('png');
    expect(thumbnail.width).toBeLessThanOrEqual(480);
    expect(thumbnail.height).toBeLessThanOrEqual(480);
  });

  it('checks actual image and video processing readiness without retaining probe files', async () => {
    const before = await readdir(root);
    await inspector.check();
    expect(await readdir(root)).toEqual(before);
  });

  it('rejects content disguises, corrupt image data and oversized pixel counts', async () => {
    const png = await imageFixture();
    for (const [bytes, mime, code] of [
      [Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'), 'image/png', 'UNSUPPORTED_FORMAT'],
      [png, 'image/jpeg', 'UNSUPPORTED_FORMAT'],
      [png.subarray(0, 40), 'image/png', 'INVALID_MEDIA'],
      [await imageFixture('large'), 'image/png', 'IMAGE_TOO_LARGE'],
    ] as const) {
      const claim = await upload(bytes, mime);
      await expect(inspector.inspect(claim)).rejects.toMatchObject({ code });
      expect(
        (await readdir(root)).filter((key) => key.startsWith(`${claim.id}.${claim.leaseToken}`)),
      ).toEqual([]);
    }
  });

  it('detects changed source bytes and never overwrites or removes an existing output', async () => {
    const claim = await upload(await imageFixture());
    await writeFile(storage.path(`${claim.id}.upload`), Buffer.from('changed'));
    await expect(inspector.inspect(claim)).rejects.toMatchObject({ code: 'INTEGRITY_MISMATCH' });
    const second = await upload(await imageFixture());
    const occupied = storage.path(`${second.id}.${second.leaseToken}.ready`);
    await writeFile(occupied, 'preserve this output', { flag: 'wx' });
    await expect(inspector.inspect(second)).rejects.toMatchObject({
      code: 'INSPECTION_UNAVAILABLE',
    });
    expect(await readFile(occupied, 'utf8')).toBe('preserve this output');
  });

  it('inspects H.264 MP4 and preserves the verified original bytes', async () => {
    const claim = await upload(await video('libx264'), 'video/mp4');
    const result = await inspector.inspect(claim);
    expect(result).toMatchObject({
      mimeType: 'video/mp4',
      width: 32,
      height: 24,
      durationSeconds: 0.4,
      thumbnailKey: null,
      sha256: claim.sourceSha256,
    });
    expect(await storage.checksum(result.storageKey)).toEqual({
      byteLength: claim.declaredBytes,
      sha256: claim.sourceSha256,
    });
  });

  it('rejects unsupported video codecs and reports sandbox/tool unavailability', async () => {
    const claim = await upload(await video('mpeg4'), 'video/mp4');
    await expect(inspector.inspect(claim)).rejects.toMatchObject({ code: 'UNSUPPORTED_CODEC' });
    const unavailable = new MediaInspector(storage, {
      ...config,
      MEDIA_INSPECTION_MODE: 'sandboxed',
      MEDIA_SANDBOX_PATH: join(root, 'missing-sandbox'),
    });
    await expect(unavailable.inspect(claim)).rejects.toMatchObject({
      code: 'INSPECTION_UNAVAILABLE',
    });
  });
});
