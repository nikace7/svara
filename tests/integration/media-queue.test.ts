import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { Readable } from 'node:stream';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { parseServerConfig } from '../../packages/config/src/server.js';
import { IdentityService } from '../../packages/domain/src/identity/service.js';
import { MediaJobs } from '../../packages/domain/src/media/jobs.js';
import { MediaError } from '../../packages/domain/src/media/errors.js';
import { MediaService } from '../../packages/domain/src/media/service.js';
import { MediaStorage } from '../../packages/domain/src/media/storage.js';
import { MediaInspector } from '../../apps/worker/src/media/inspector.js';
import { MediaQueueRuntime } from '../../apps/worker/src/media/queue.js';
import { mediaQueueFixture } from '../../apps/worker/test/media-queue-fixture.js';
import { imageFixture } from '../../apps/worker/test/media-fixtures.js';
import { staffFixture } from './staff-fixture.js';
import { redisRelay } from './redis-relay.js';

describe('recoverable media queue runtime', () => {
  let staff: Awaited<ReturnType<typeof staffFixture>>;
  let root: string;
  let storage: MediaStorage;
  let media: MediaService;
  let inspector: MediaInspector;
  let config: ReturnType<typeof parseServerConfig>;
  const runtimes: MediaQueueRuntime[] = [];
  const fixtures: ReturnType<typeof mediaQueueFixture>[] = [];
  beforeAll(async () => {
    staff = await staffFixture();
    root = await mkdtemp(join(tmpdir(), 'svara-media-queue-test-'));
    storage = await MediaStorage.open(root);
    media = new MediaService(new IdentityService(staff.db, staff.pepper), staff.db, storage);
    config = parseServerConfig(process.env);
    inspector = new MediaInspector(storage, config);
  });
  afterEach(async () => {
    await Promise.all(runtimes.splice(0).map((runtime) => runtime.close()));
    await Promise.all(fixtures.splice(0).map((fixture) => fixture.close()));
  });
  afterAll(async () => {
    await Promise.all(runtimes.map((runtime) => runtime.close()));
    await Promise.all(fixtures.map((fixture) => fixture.close()));
    if (staff) {
      await staff.db.mediaAsset.deleteMany({
        where: { organisationId: staff.owner.identity.organisation.id },
      });
      await staff.close();
    }
    if (root) {
      if (
        dirname(resolve(root)) !== resolve(tmpdir()) ||
        !basename(root).startsWith('svara-media-queue-test-')
      )
        throw new Error('Unsafe queue test cleanup.');
      await rm(root, { recursive: true, force: true });
    }
  });
  async function upload() {
    const bytes = await imageFixture();
    const entry = await media.reserve(staff.owner.token, {
      filename: 'Queue.png',
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
  function runtime(
    jobs: Pick<MediaJobs, 'process' | 'pending' | 'sweep' | 'close'>,
    probe = async () => {},
    redisUrl = config.REDIS_URL,
  ) {
    const fixture = mediaQueueFixture(config.REDIS_URL);
    const instance = new MediaQueueRuntime(redisUrl, jobs, probe, {
      prefix: fixture.prefix,
      intervalMs: 100,
    });
    fixtures.push(fixture);
    runtimes.push(instance);
    return { fixture, instance };
  }

  it('rediscovers a durable upload whose Redis notification disappeared', async () => {
    const entry = await upload();
    const coordinator = new MediaJobs(staff.db, storage, inspector.inspect.bind(inspector));
    const { fixture, instance } = runtime(coordinator);
    expect(await fixture.discardNotification(entry.id)).toBe(0);
    instance.start();
    await expect
      .poll(async () => (await media.get(staff.owner.token, entry.id)).state, { timeout: 8000 })
      .toBe('READY');
    await expect.poll(() => instance.isReady(), { timeout: 3000 }).toBe(true);
    await instance.close();
    expect(instance.isReady()).toBe(false);
  });

  it('removes failed notifications so a transient database failure can be retried', async () => {
    const entry = await upload();
    const coordinator = new MediaJobs(staff.db, storage, inspector.inspect.bind(inspector));
    let calls = 0;
    const { instance, fixture } = runtime({
      process: async (id, signal) => {
        if (++calls === 1) throw new Error('Synthetic temporary database failure');
        return coordinator.process(id, signal);
      },
      pending: coordinator.pending.bind(coordinator),
      sweep: coordinator.sweep.bind(coordinator),
      close: coordinator.close.bind(coordinator),
    });
    instance.start();
    await expect
      .poll(async () => (await media.get(staff.owner.token, entry.id)).state, { timeout: 8000 })
      .toBe('READY');
    expect(calls).toBeGreaterThanOrEqual(2);
    expect(await fixture.failedCount()).toBe(0);
    await instance.close();
  });

  it('keeps inspection unavailable until the real processing probe succeeds', async () => {
    const entry = await upload();
    const coordinator = new MediaJobs(staff.db, storage, inspector.inspect.bind(inspector));
    let available = false;
    const { instance } = runtime(coordinator, async () => {
      if (!available) throw new Error('Synthetic unavailable parser');
    });
    instance.start();
    await instance.tick();
    expect(instance.isReady()).toBe(false);
    expect(await media.get(staff.owner.token, entry.id)).toMatchObject({ state: 'QUARANTINED' });
    available = true;
    await instance.tick();
    await expect
      .poll(async () => (await media.get(staff.owner.token, entry.id)).state, { timeout: 8000 })
      .toBe('READY');
    await instance.close();
  });

  it('returns interrupted work to quarantine on graceful shutdown', async () => {
    const entry = await upload();
    let entered = false;
    const coordinator = new MediaJobs(staff.db, storage, async (_claim, signal) => {
      entered = true;
      await new Promise<void>((_resolve, reject) => {
        if (signal?.aborted) reject(new MediaError('INSPECTION_TIMEOUT'));
        else
          signal?.addEventListener('abort', () => reject(new MediaError('INSPECTION_TIMEOUT')), {
            once: true,
          });
      });
      throw new Error('Unreachable');
    });
    const { instance } = runtime(coordinator);
    instance.start();
    await expect.poll(() => entered, { timeout: 5000 }).toBe(true);
    await instance.close();
    expect(await media.get(staff.owner.token, entry.id)).toMatchObject({
      state: 'QUARANTINED',
      rejection: null,
    });
    expect(
      await new MediaJobs(staff.db, storage, inspector.inspect.bind(inspector)).process(entry.id),
    ).toBe('READY');
  });

  it('pauses queued uploads after a parser failure and resumes once its probe recovers', async () => {
    const entries = [await upload(), await upload()];
    let available = true;
    let inspections = 0;
    let failedProbes = 0;
    const coordinator = new MediaJobs(staff.db, storage, async (claim, signal) => {
      if (++inspections === 1) available = false;
      if (!available) throw new MediaError('INSPECTION_UNAVAILABLE');
      return inspector.inspect(claim, signal);
    });
    const { instance } = runtime(coordinator, async () => {
      if (!available) {
        failedProbes++;
        throw new MediaError('INSPECTION_UNAVAILABLE');
      }
    });
    instance.start();
    await expect.poll(() => failedProbes, { timeout: 5000 }).toBeGreaterThan(0);
    expect(instance.isReady()).toBe(false);
    expect(inspections).toBe(1);
    const rows = await staff.db.mediaAsset.findMany({
      where: { id: { in: entries.map((entry) => entry.id) } },
    });
    expect(rows.every((row) => row.state === 'QUARANTINED')).toBe(true);
    expect(rows.map((row) => row.attempts).sort()).toEqual([0, 1]);
    available = true;
    await expect
      .poll(
        async () =>
          Promise.all(
            entries.map(async (entry) => (await media.get(staff.owner.token, entry.id)).state),
          ),
        { timeout: 8000 },
      )
      .toEqual(['READY', 'READY']);
  });

  it('recovers from Redis being unavailable both at startup and after a ready connection', async () => {
    const relay = await redisRelay(config.REDIS_URL);
    const coordinator = new MediaJobs(staff.db, storage, inspector.inspect.bind(inspector));
    const { instance } = runtime(coordinator, async () => {}, relay.url);
    try {
      instance.start();
      await instance.tick();
      expect(instance.isReady()).toBe(false);
      relay.setAvailable(true);
      await expect.poll(() => instance.isReady(), { timeout: 8000 }).toBe(true);
      relay.setAvailable(false);
      await expect.poll(() => instance.isReady(), { timeout: 3000 }).toBe(false);
      const entry = await upload();
      await instance.tick();
      expect(await media.get(staff.owner.token, entry.id)).toMatchObject({ state: 'QUARANTINED' });
      relay.setAvailable(true);
      await expect
        .poll(async () => (await media.get(staff.owner.token, entry.id)).state, { timeout: 8000 })
        .toBe('READY');
      await expect.poll(() => instance.isReady(), { timeout: 3000 }).toBe(true);
    } finally {
      relay.setAvailable(true);
      await instance.close();
      await relay.close();
    }
  }, 25000);
});
