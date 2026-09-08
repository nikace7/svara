import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { Readable } from 'node:stream';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { parseServerConfig } from '../../packages/config/src/server.js';
import { MEDIA_LIMITS } from '../../packages/contracts/src/media.js';
import { IdentityService } from '../../packages/domain/src/identity/service.js';
import { MediaError } from '../../packages/domain/src/media/errors.js';
import { MediaJobs } from '../../packages/domain/src/media/jobs.js';
import { MediaService } from '../../packages/domain/src/media/service.js';
import { MediaStorage } from '../../packages/domain/src/media/storage.js';
import { MediaInspector } from '../../apps/worker/src/media/inspector.js';
import { imageFixture } from '../../apps/worker/test/media-fixtures.js';
import { staffFixture } from './staff-fixture.js';

function barrier() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

describe('durable media inspection jobs', () => {
  let staff: Awaited<ReturnType<typeof staffFixture>>;
  let root: string;
  let storage: MediaStorage;
  let media: MediaService;
  let inspector: MediaInspector;
  const coordinators: MediaJobs[] = [];
  beforeAll(async () => {
    staff = await staffFixture();
    root = await mkdtemp(join(tmpdir(), 'svara-media-jobs-test-'));
    storage = await MediaStorage.open(root);
    media = new MediaService(new IdentityService(staff.db, staff.pepper), staff.db, storage);
    inspector = new MediaInspector(storage, parseServerConfig(process.env));
  });
  afterAll(async () => {
    await Promise.all(coordinators.map((jobs) => jobs.close()));
    if (staff) {
      await staff.db.mediaAsset.deleteMany({
        where: { organisationId: staff.owner.identity.organisation.id },
      });
      await staff.close();
    }
    if (root) {
      if (
        dirname(resolve(root)) !== resolve(tmpdir()) ||
        !basename(root).startsWith('svara-media-jobs-test-')
      )
        throw new Error('Unsafe media job test cleanup target.');
      await rm(root, { recursive: true, force: true });
    }
  });
  async function upload() {
    const bytes = await imageFixture();
    const entry = await media.reserve(staff.owner.token, {
      filename: 'Campus.png',
      mimeType: 'image/png',
      byteLength: bytes.length,
    });
    return media.receive(
      staff.owner.token,
      entry.id,
      Readable.from([bytes]),
      AbortSignal.timeout(2000),
    );
  }
  function jobs(
    inspect = inspector.inspect.bind(inspector),
    now = () => new Date(),
    database = staff.db,
  ) {
    const instance = new MediaJobs(database, storage, inspect, now);
    coordinators.push(instance);
    return instance;
  }

  it('publishes verified output once and makes it available through current staff authority', async () => {
    const entry = await upload();
    const coordinator = jobs();
    expect(await coordinator.pending()).toContain(entry.id);
    expect(await coordinator.process(entry.id)).toBe('READY');
    expect(await coordinator.process(entry.id)).toBe('SKIPPED');
    const asset = await media.get(staff.owner.token, entry.id);
    expect(asset).toMatchObject({ state: 'READY', width: 30, height: 20, hasThumbnail: true });
    const file = await media.file(staff.owner.token, entry.id, false);
    try {
      expect((await file.handle.readFile()).length).toBe(file.byteLength);
    } finally {
      await file.handle.close();
    }
    expect(await readdir(root)).not.toContain(`${entry.id}.upload`);
    expect(
      await staff.db.auditEntry.count({
        where: { targetId: entry.id, action: 'media.inspection.ready', actorKind: 'SYSTEM' },
      }),
    ).toBe(1);
  });

  it('lets only one competing worker claim an upload and denies deletion while inspecting', async () => {
    const entered = barrier();
    const release = barrier();
    const entry = await upload();
    const coordinator = jobs(async (claim, signal) => {
      entered.release();
      await release.promise;
      return inspector.inspect(claim, signal);
    });
    const first = coordinator.process(entry.id);
    await entered.promise;
    try {
      expect(await jobs().process(entry.id)).toBe('SKIPPED');
      const inspecting = await media.get(staff.owner.token, entry.id);
      await expect(
        media.remove(staff.owner.token, entry.id, { expectedRevision: inspecting.revision }),
      ).rejects.toMatchObject({ code: 'MEDIA_BUSY' });
    } finally {
      release.release();
    }
    expect(await first).toBe('READY');
    expect(await staff.db.mediaAsset.findUnique({ where: { id: entry.id } })).toMatchObject({
      attempts: 1,
    });
  });

  it('recovers an expired claim without letting its late result replace the winner', async () => {
    let time = new Date();
    const entered = barrier();
    const release = barrier();
    const entry = await upload();
    let oldKey = '';
    const original = jobs(
      async (claim, signal) => {
        const output = await inspector.inspect(claim, signal);
        oldKey = output.storageKey;
        entered.release();
        await release.promise;
        return output;
      },
      () => time,
    ).process(entry.id);
    await entered.promise;
    time = new Date(time.getTime() + 46_000);
    let winningKey = '';
    try {
      const replacement = jobs(undefined, () => time);
      expect(await replacement.pending()).toContain(entry.id);
      expect(await replacement.process(entry.id)).toBe('READY');
      winningKey = (await staff.db.mediaAsset.findUniqueOrThrow({ where: { id: entry.id } }))
        .storageKey!;
    } finally {
      release.release();
    }
    expect(await original).toBe('STALE');
    expect(winningKey).not.toBe(oldKey);
    expect(await readFile(storage.path(winningKey))).toBeDefined();
    expect(await readdir(root)).not.toContain(oldKey);
    expect(
      await staff.db.auditEntry.count({
        where: { targetId: entry.id, action: 'media.inspection.ready' },
      }),
    ).toBe(1);
  });

  it('bounds unavailable retries and rejects malformed content immediately', async () => {
    const entry = await upload();
    const unavailable = jobs(async () => {
      throw new MediaError('INSPECTION_UNAVAILABLE');
    });
    expect(await unavailable.process(entry.id)).toBe('RETRY');
    expect(await unavailable.process(entry.id)).toBe('RETRY');
    expect(await unavailable.process(entry.id)).toBe('REJECTED');
    expect(await unavailable.process(entry.id)).toBe('SKIPPED');
    expect(await staff.db.mediaAsset.findUnique({ where: { id: entry.id } })).toMatchObject({
      state: 'REJECTED',
      attempts: 3,
      rejection: 'INSPECTION_UNAVAILABLE',
    });
    const malformed = await upload();
    expect(
      await jobs(async () => {
        throw new MediaError('INVALID_MEDIA');
      }).process(malformed.id),
    ).toBe('REJECTED');
    expect(await staff.db.mediaAsset.findUnique({ where: { id: malformed.id } })).toMatchObject({
      attempts: 1,
      rejection: 'INVALID_MEDIA',
    });
  });

  it('preserves committed files when the database acknowledgement is lost', async () => {
    let loseAcknowledgement = false;
    const database = new Proxy(staff.db, {
      get(target, property) {
        if (property !== '$transaction') return Reflect.get(target, property, target);
        return async (...args: unknown[]) => {
          const result: unknown = await Reflect.apply(target.$transaction, target, args);
          if (loseAcknowledgement) {
            loseAcknowledgement = false;
            throw new Error('Synthetic lost acknowledgement');
          }
          return result;
        };
      },
    });
    const entry = await upload();
    const coordinator = jobs(
      async (claim, signal) => {
        const result = await inspector.inspect(claim, signal);
        loseAcknowledgement = true;
        return result;
      },
      () => new Date(),
      database,
    );
    await expect(coordinator.process(entry.id)).rejects.toThrow('Synthetic lost acknowledgement');
    const asset = await staff.db.mediaAsset.findUniqueOrThrow({ where: { id: entry.id } });
    expect(asset.state).toBe('READY');
    expect(await storage.checksum(asset.storageKey!)).toEqual({
      byteLength: asset.byteLength,
      sha256: asset.sha256,
    });
    expect(await jobs().process(entry.id)).toBe('SKIPPED');
  });

  it('rejects foreign output keys without deleting the referenced file', async () => {
    const other = await upload();
    await jobs().process(other.id);
    const protectedAsset = await staff.db.mediaAsset.findUniqueOrThrow({ where: { id: other.id } });
    const entry = await upload();
    expect(
      await jobs(async (claim, signal) => ({
        ...(await inspector.inspect(claim, signal)),
        storageKey: protectedAsset.storageKey!,
      })).process(entry.id),
    ).toBe('REJECTED');
    expect(await media.get(staff.owner.token, entry.id)).toMatchObject({
      rejection: 'INTEGRITY_MISMATCH',
    });
    expect(await readFile(storage.path(protectedAsset.storageKey!))).toBeDefined();
  });

  it('expires abandoned uploads and finishes explicit deletion while preserving audit history', async () => {
    const old = new Date(Date.now() - MEDIA_LIMITS.retentionMs - 1000);
    const reserved = await media.reserve(staff.owner.token, {
      filename: 'Old.png',
      mimeType: 'image/png',
      byteLength: 10,
    });
    await staff.db.mediaAsset.update({ where: { id: reserved.id }, data: { createdAt: old } });
    const receiving = await media.reserve(staff.owner.token, {
      filename: 'Interrupted.png',
      mimeType: 'image/png',
      byteLength: 10,
    });
    await staff.db.mediaAsset.update({
      where: { id: receiving.id },
      data: { state: 'RECEIVING', leaseToken: randomUUID(), leaseExpiresAt: old, createdAt: old },
    });
    await writeFile(storage.path(`${receiving.id}.part`), 'partial');
    const entry = await upload();
    const coordinator = jobs();
    await coordinator.process(entry.id);
    const ready = await media.get(staff.owner.token, entry.id);
    await media.remove(staff.owner.token, entry.id, { expectedRevision: ready.revision });
    await coordinator.sweep();
    expect(await media.get(staff.owner.token, reserved.id)).toMatchObject({
      state: 'REJECTED',
      rejection: 'UPLOAD_EXPIRED',
    });
    expect(await staff.db.mediaAsset.findUnique({ where: { id: receiving.id } })).toMatchObject({
      state: 'REJECTED',
      cleanedAt: expect.any(Date),
    });
    expect(await readdir(root)).not.toContain(`${receiving.id}.part`);
    expect(await staff.db.mediaAsset.findUnique({ where: { id: entry.id } })).toBeNull();
    expect((await readdir(root)).some((key) => key.startsWith(entry.id))).toBe(false);
    expect(
      await staff.db.auditEntry.findFirst({
        where: { targetId: entry.id, action: 'media.deleted' },
      }),
    ).not.toBeNull();
  });

  it('retains a recent upload for 24 hours even when its reservation is older', async () => {
    const entry = await upload();
    const old = new Date(Date.now() - MEDIA_LIMITS.retentionMs - 1000);
    await staff.db.mediaAsset.update({ where: { id: entry.id }, data: { createdAt: old } });
    let now = new Date();
    const coordinator = jobs(
      async () => {
        throw new MediaError('INVALID_MEDIA');
      },
      () => now,
    );
    await coordinator.sweep();
    expect(await media.get(staff.owner.token, entry.id)).toMatchObject({ state: 'QUARANTINED' });
    expect(await coordinator.process(entry.id)).toBe('REJECTED');
    await coordinator.sweep();
    expect(await readdir(root)).toContain(`${entry.id}.upload`);
    expect(await staff.db.mediaAsset.findUnique({ where: { id: entry.id } })).toMatchObject({
      cleanedAt: null,
    });
    now = new Date(now.getTime() + MEDIA_LIMITS.retentionMs + 1000);
    await coordinator.sweep();
    expect(await readdir(root)).not.toContain(`${entry.id}.upload`);
  });

  it('collects old orphan keys without following directories or touching READY and active files', async () => {
    const old = new Date(Date.now() - MEDIA_LIMITS.retentionMs - 1000);
    const ready = await upload();
    await jobs().process(ready.id);
    const asset = await staff.db.mediaAsset.findUniqueOrThrow({ where: { id: ready.id } });
    await utimes(storage.path(asset.storageKey!), old, old);
    const orphan = `${randomUUID()}.${randomUUID()}.ready`;
    const fresh = `${randomUUID()}.part`;
    for (const key of [orphan, fresh]) await writeFile(storage.path(key), 'private bytes');
    await utimes(storage.path(orphan), old, old);
    const active = await upload();
    await staff.db.mediaAsset.update({
      where: { id: active.id },
      data: {
        state: 'INSPECTING',
        attempts: 1,
        leaseToken: randomUUID(),
        leaseExpiresAt: new Date(Date.now() + 45_000),
      },
    });
    await utimes(storage.path(`${active.id}.upload`), old, old);
    await writeFile(join(root, 'operator-note.txt'), 'preserve non-media files');
    const directory = storage.path(`${randomUUID()}.upload`);
    await mkdir(directory);
    await writeFile(join(directory, 'preserve.txt'), 'preserve generated-name directories');
    await utimes(directory, old, old);
    const coordinator = jobs();
    for (let page = 0; page < 30; page++) await coordinator.sweep(2);
    const keys = await readdir(root);
    expect(keys).not.toContain(orphan);
    expect(keys).toEqual(
      expect.arrayContaining([asset.storageKey, fresh, `${active.id}.upload`, 'operator-note.txt']),
    );
    expect(await readFile(join(directory, 'preserve.txt'), 'utf8')).toBe(
      'preserve generated-name directories',
    );
  });
});
