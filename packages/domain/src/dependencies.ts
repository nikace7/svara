import { randomUUID } from 'node:crypto';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Redis } from 'ioredis';
import { createDatabase } from '@svara/database';
import type { ServerConfig } from '@svara/config/server';
import { checkReadiness } from './health.js';

export async function createDependencies(config: ServerConfig) {
  const database = createDatabase(config.DATABASE_URL);
  const redis = new Redis(config.REDIS_URL, {
    lazyConnect: true,
    enableOfflineQueue: false,
    maxRetriesPerRequest: 1,
    connectTimeout: 1500,
    commandTimeout: 1500,
    retryStrategy: (attempt) => Math.min(attempt * 250, 2000),
  });
  redis.on('error', () => {
    console.error(JSON.stringify({ event: 'dependency.error', dependency: 'redis' }));
  });
  await mkdir(config.MEDIA_ROOT, { recursive: true });
  // Startup remains live when Redis is down; readiness and admission are separate.
  try {
    await redis.connect();
  } catch {
    /* The error event records a safe category; readiness reports unavailable. */
  }

  const probes = {
    database: async () => {
      await database.$queryRaw`SELECT 1`;
    },
    redis: async () => {
      if ((await redis.ping()) !== 'PONG') throw new Error('Redis unavailable');
    },
    media: async () => {
      const path = join(config.MEDIA_ROOT, `.health-${randomUUID()}`);
      await writeFile(path, '', { flag: 'wx', mode: 0o600 });
      await unlink(path);
    },
  };

  return {
    database,
    redis,
    ready: (includeWorker = false) =>
      checkReadiness({
        ...probes,
        ...(includeWorker
          ? {
              worker: async () => {
                if (!(await redis.get(`${config.WORKER_NAMESPACE}:worker:heartbeat`)))
                  throw new Error('Worker unavailable');
              },
            }
          : {}),
      }),
    close: async () => {
      redis.disconnect();
      await database.$disconnect();
    },
  };
}
