import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { link, lstat, mkdir, open, opendir, realpath, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { Transform, Writable } from 'node:stream';
import type { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { MEDIA_LIMITS, resourceIdSchema } from '@svara/contracts';
import { MediaError } from './errors.js';

const uuid = '[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}';
const keyPattern = new RegExp(
  `^(?:${uuid}\\.(?:part|upload)|${uuid}\\.${uuid}\\.(?:ready|thumb))$`,
  'i',
);

/** Private, flat, generated keys only; display filenames never become filesystem paths. */
export class MediaStorage {
  private constructor(readonly root: string) {}
  static async open(root: string) {
    await mkdir(root, { recursive: true, mode: 0o700 });
    return new MediaStorage(await realpath(root));
  }
  path(key: string): string {
    if (!keyPattern.test(key)) throw new Error('Invalid private media key.');
    return join(this.root, key);
  }
  async *entries() {
    const directory = await opendir(this.root);
    for await (const entry of directory) {
      if (!keyPattern.test(entry.name) || (!entry.isFile() && !entry.isSymbolicLink())) continue;
      try {
        const stat = await lstat(this.path(entry.name));
        if (stat.isFile() || stat.isSymbolicLink())
          yield { key: entry.name, assetId: entry.name.split('.')[0]!, modifiedAt: stat.mtime };
      } catch (error) {
        if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
      }
    }
  }
  async remove(key: string): Promise<void> {
    try {
      await unlink(this.path(key));
    } catch (error) {
      if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
    }
  }
  async receive(id: string, expectedBytes: number, source: Readable, signal: AbortSignal) {
    resourceIdSchema.parse(id);
    if (
      !Number.isSafeInteger(expectedBytes) ||
      expectedBytes < 1 ||
      expectedBytes > MEDIA_LIMITS.videoBytes
    )
      throw new MediaError('UPLOAD_LENGTH_MISMATCH');
    const part = `${id}.part`;
    const handle = await open(this.path(part), 'wx', 0o600);
    let bytes = 0;
    const hash = createHash('sha256');
    try {
      const counter = new Transform({
        transform(chunk: Buffer, _encoding, callback) {
          bytes += chunk.length;
          if (bytes > expectedBytes) {
            callback(new MediaError('UPLOAD_LENGTH_MISMATCH'));
            return;
          }
          hash.update(chunk);
          callback(null, chunk);
        },
      });
      const destination = new Writable({
        write(chunk: Buffer, _encoding, callback) {
          void handle.writeFile(chunk).then(() => callback(), callback);
        },
      });
      await pipeline(source, counter, destination, { signal });
      if (bytes !== expectedBytes) throw new MediaError('UPLOAD_LENGTH_MISMATCH');
      await handle.sync();
      await handle.close();
      // A hard link publishes a complete quarantine file atomically without overwrite.
      await link(this.path(part), this.path(`${id}.upload`));
      return { byteLength: bytes, sha256: hash.digest('hex') };
    } finally {
      await handle.close();
      await this.remove(part);
    }
  }
  async read(key: string) {
    const handle = await open(this.path(key), constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    try {
      const stat = await handle.stat();
      if (
        !stat.isFile() ||
        stat.nlink !== 1 ||
        stat.size < 1 ||
        stat.size > MEDIA_LIMITS.videoBytes
      )
        throw new MediaError('INTEGRITY_MISMATCH');
      return { handle, size: stat.size };
    } catch (error) {
      await handle.close();
      throw error;
    }
  }
  async checksum(key: string) {
    const { handle, size } = await this.read(key);
    const hash = createHash('sha256');
    try {
      const buffer = Buffer.alloc(64 * 1024);
      let total = 0;
      for (;;) {
        const { bytesRead } = await handle.read(buffer, 0, buffer.length, null);
        if (!bytesRead) break;
        total += bytesRead;
        if (total > size) throw new MediaError('INTEGRITY_MISMATCH');
        hash.update(buffer.subarray(0, bytesRead));
      }
      if (total !== size) throw new MediaError('INTEGRITY_MISMATCH');
      return { byteLength: size, sha256: hash.digest('hex') };
    } finally {
      await handle.close();
    }
  }
}
