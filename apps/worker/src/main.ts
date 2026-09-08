import { createServer } from 'node:http';
import { loadWorkspaceEnvironment, parseServerConfig } from '@svara/config/server';
import { createDependencies } from '@svara/domain';

loadWorkspaceEnvironment();
const config = parseServerConfig(process.env);
const dependencies = await createDependencies(config);
let closing = false;
let timer: ReturnType<typeof setTimeout> | undefined;

async function heartbeat(): Promise<void> {
  if (closing) return;
  try {
    if ((await dependencies.ready()).status === 'ready') {
      await dependencies.redis.set('svara:worker:heartbeat', new Date().toISOString(), 'EX', 15);
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
    const readiness =
      request.url === '/health/ready' ? await dependencies.ready() : { status: 'ok' };
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
  await dependencies.close();
}
process.once('SIGINT', () => {
  void shutdown();
});
process.once('SIGTERM', () => {
  void shutdown();
});
server.listen(config.WORKER_PORT, config.BIND_HOST);
await heartbeat();
console.info(
  JSON.stringify({
    event: 'worker.started',
    port: config.WORKER_PORT,
    responsibilities: ['dependency-health', 'heartbeat'],
  }),
);
