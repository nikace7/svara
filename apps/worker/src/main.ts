import { createServer } from 'node:http';
import { loadWorkspaceEnvironment, parseServerConfig } from '@svara/config/server';
import {
  CommandOutbox,
  expireStaleSessions,
  createDependencies,
  MediaJobs,
  MediaStorage,
  type Readiness,
} from '@svara/domain';
import { MediaInspector } from './media/inspector.js';
import { MediaQueueRuntime } from './media/queue.js';
import { ScheduleLoop } from './schedules/loop.js';

loadWorkspaceEnvironment();
const config = parseServerConfig(process.env);
const dependencies = await createDependencies(config);
const storage = await MediaStorage.open(config.MEDIA_ROOT);
const inspector = new MediaInspector(storage, config);
const jobs = new MediaJobs(dependencies.database, storage, inspector.inspect.bind(inspector));
const mediaQueue = new MediaQueueRuntime(config.REDIS_URL, jobs, inspector.check.bind(inspector), {
  prefix: `${config.WORKER_NAMESPACE}:media`,
});
// Wake-ups carry IDs only; the API's device connections read the command from PostgreSQL.
// The same tick ends abandoned conversations, including after an API crash or restart.
const schedules = new ScheduleLoop(
  new CommandOutbox(dependencies.database),
  async (commands) => {
    await dependencies.redis.publish(
      `${config.WORKER_NAMESPACE}:device-commands`,
      JSON.stringify(commands.map(({ id, deviceId }) => ({ commandId: id, deviceId }))),
    );
  },
  { sweep: () => expireStaleSessions(dependencies.database) },
);
let closing = false;
let timer: ReturnType<typeof setTimeout> | undefined;

async function ready(): Promise<Readiness> {
  const infrastructure = await dependencies.ready();
  const available = !closing && mediaQueue.isReady();
  const scheduling = !closing && schedules.isReady();
  return {
    status: infrastructure.status === 'ready' && available && scheduling ? 'ready' : 'unavailable',
    dependencies: {
      ...infrastructure.dependencies,
      mediaInspection: available ? 'ready' : 'unavailable',
      scheduling: scheduling ? 'ready' : 'unavailable',
    },
  };
}

async function heartbeat(): Promise<void> {
  if (closing) return;
  try {
    if ((await ready()).status === 'ready' && !closing) {
      await dependencies.redis.set(
        `${config.WORKER_NAMESPACE}:worker:heartbeat`,
        new Date().toISOString(),
        'EX',
        15,
      );
    }
  } catch {
    console.error(JSON.stringify({ event: 'worker.heartbeat.failed' }));
  }
  if (!closing)
    timer = setTimeout(() => {
      void heartbeat();
    }, 5000);
}

const server = createServer((request, response) => {
  void (async () => {
    response.setHeader('Content-Type', 'application/json');
    response.setHeader('Cache-Control', 'no-store');
    if (
      request.method !== 'GET' ||
      !['/health/live', '/health/ready'].includes(request.url ?? '')
    ) {
      response.writeHead(404).end(JSON.stringify({ error: 'NOT_FOUND' }));
      return;
    }
    const readiness = request.url === '/health/ready' ? await ready() : { status: 'ok' };
    response.writeHead(readiness.status === 'unavailable' ? 503 : 200).end(
      JSON.stringify({
        data: { ...readiness, service: 'worker', providerMode: config.PROVIDER_MODE },
      }),
    );
  })().catch(() => {
    response.writeHead(503).end(JSON.stringify({ error: 'UNAVAILABLE' }));
  });
});

async function shutdown(): Promise<void> {
  if (closing) return;
  closing = true;
  clearTimeout(timer);
  server.close();
  const deadline = setTimeout(() => {
    console.error(JSON.stringify({ event: 'worker.shutdown.timeout' }));
    process.exit(1);
  }, 25_000);
  deadline.unref();
  try {
    await Promise.all([mediaQueue.close(), schedules.close()]);
  } finally {
    await dependencies.close();
    clearTimeout(deadline);
  }
}
function stop(): void {
  void shutdown().catch(() => {
    console.error(JSON.stringify({ event: 'worker.shutdown.failed' }));
    process.exitCode = 1;
  });
}
process.once('SIGINT', stop);
process.once('SIGTERM', stop);
server.on('error', () => {
  console.error(JSON.stringify({ event: 'worker.http.failed' }));
  process.exitCode = 1;
  stop();
});
server.listen(config.WORKER_PORT, config.BIND_HOST);
mediaQueue.start();
schedules.start();
await heartbeat();
console.info(
  JSON.stringify({
    event: 'worker.started',
    port: config.WORKER_PORT,
    responsibilities: [
      'dependency-health',
      'heartbeat',
      'media-inspection',
      'media-cleanup',
      'desired-state-reconciliation',
      'command-outbox',
    ],
  }),
);
