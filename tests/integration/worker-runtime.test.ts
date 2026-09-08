import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { Readable } from 'node:stream';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { parseServerConfig } from '../../packages/config/src/server.js';
import { IdentityService } from '../../packages/domain/src/identity/service.js';
import { MediaService } from '../../packages/domain/src/media/service.js';
import { MediaStorage } from '../../packages/domain/src/media/storage.js';
import { mediaQueueFixture } from '../../apps/worker/test/media-queue-fixture.js';
import { imageFixture } from '../../apps/worker/test/media-fixtures.js';
import { staffFixture } from './staff-fixture.js';

describe('compiled worker runtime', () => {
  let staff: Awaited<ReturnType<typeof staffFixture>>;
  let root: string;
  let media: MediaService;
  beforeAll(async () => {
    staff = await staffFixture();
    root = await mkdtemp(join(tmpdir(), 'svara-worker-runtime-test-'));
    const storage = await MediaStorage.open(root);
    media = new MediaService(new IdentityService(staff.db, staff.pepper), staff.db, storage);
  });
  afterAll(async () => {
    if (staff) {
      await staff.db.mediaAsset.deleteMany({
        where: { organisationId: staff.owner.identity.organisation.id },
      });
      await staff.close();
    }
    if (root) {
      if (
        dirname(resolve(root)) !== resolve(tmpdir()) ||
        !basename(root).startsWith('svara-worker-runtime-test-')
      )
        throw new Error('Unsafe worker test cleanup.');
      await rm(root, { recursive: true, force: true });
    }
  });

  async function launch(overrides: Record<string, string> = {}) {
    const fixture = mediaQueueFixture(parseServerConfig(process.env).REDIS_URL);
    const reservation = createServer();
    reservation.listen(0, '127.0.0.1');
    await once(reservation, 'listening');
    const address = reservation.address();
    if (!address || typeof address === 'string') throw new Error('No worker test port.');
    await new Promise<void>((resolve, reject) =>
      reservation.close((error) => (error ? reject(error) : resolve())),
    );
    const child = spawn(process.execPath, ['apps/worker/dist/main.js'], {
      env: {
        ...process.env,
        APP_ENV: 'test',
        PROVIDER_MODE: 'fixture',
        DATABASE_URL: process.env.TEST_DATABASE_URL,
        MEDIA_ROOT: root,
        AUTH_TOKEN_PEPPER: staff.pepper,
        WORKER_NAMESPACE: fixture.namespace,
        WORKER_PORT: String(address.port),
        BIND_HOST: '127.0.0.1',
        ...overrides,
      },
      windowsHide: true,
      stdio: 'ignore',
    });
    const exited = new Promise<void>((resolve, reject) => {
      child.once('exit', () => resolve());
      child.once('error', () => reject(new Error('Worker test process could not start.')));
    });
    // Register immediately so an early spawn failure is observed during launch.
    void exited.catch(() => {});
    const response = (path: string) =>
      fetch(`http://127.0.0.1:${address.port}${path}`, { signal: AbortSignal.timeout(3000) });
    async function close() {
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM');
      const force = setTimeout(() => child.kill('SIGKILL'), 5000);
      try {
        await exited;
      } finally {
        clearTimeout(force);
        await fixture.close();
      }
    }
    try {
      await expect
        .poll(async () => (await response('/health/live')).status, { timeout: 5000 })
        .toBe(200);
      return { response, close };
    } catch (error) {
      await close();
      throw error;
    }
  }

  it('inspects a durable upload and reports actual processing readiness', async () => {
    const bytes = await imageFixture();
    const reserved = await media.reserve(staff.owner.token, {
      filename: 'Worker.png',
      mimeType: 'image/png',
      byteLength: bytes.length,
    });
    await media.receive(
      staff.owner.token,
      reserved.id,
      Readable.from([bytes]),
      AbortSignal.timeout(2000),
    );
    const worker = await launch();
    try {
      await expect
        .poll(async () => (await worker.response('/health/ready')).status, { timeout: 10000 })
        .toBe(200);
      const ready = await worker.response('/health/ready');
      expect(ready.headers.get('cache-control')).toBe('no-store');
      expect(await ready.json()).toMatchObject({
        data: { status: 'ready', service: 'worker', dependencies: { mediaInspection: 'ready' } },
      });
      await expect
        .poll(async () => (await media.get(staff.owner.token, reserved.id)).state, {
          timeout: 5000,
        })
        .toBe('READY');
    } finally {
      await worker.close();
    }
  }, 20000);

  it('stays live but unready when the configured media parser is missing', async () => {
    const worker = await launch({ FFPROBE_PATH: join(root, 'missing-ffprobe') });
    try {
      const response = await worker.response('/health/ready');
      expect(response.status).toBe(503);
      expect(await response.json()).toMatchObject({
        data: { status: 'unavailable', dependencies: { mediaInspection: 'unavailable' } },
      });
      expect((await worker.response('/health/live')).status).toBe(200);
    } finally {
      await worker.close();
    }
  });
});
