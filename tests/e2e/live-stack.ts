/** A self-contained live-mode stack for `pnpm test:e2e:live`: the built web in live mode,
 * the real API wiring with stub Gemini providers, and one same-origin gateway like Caddy's.
 * Stubs keep the browser suite deterministic and quota-free; `pnpm eval:gemini` covers the
 * real provider. Uses the test database only. Requires `pnpm build` first. */
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { cpSync, existsSync } from 'node:fs';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { createApplication } from '../../apps/api/dist/app.js';
import { loadWorkspaceEnvironment } from '../../packages/config/src/server.js';
import { createDatabase } from '../../packages/database/src/index.js';
import { assertTestDatabase } from '../../packages/database/src/safety.js';
import {
  BotService,
  IdentityService,
  KnowledgeService,
  ReleaseService,
  ScheduleService,
} from '../../packages/domain/dist/index.js';
import { GeminiError } from '../../packages/providers/dist/index.js';
import type { RecognitionEvent } from '../../packages/providers/dist/index.js';

const LIVE_ORIGIN = 'http://localhost:4330';
const [GATEWAY, API, WEB] = [4330, 4110, 3011];

/** Answers from the top retrieved passage, so the page can only show release text if
 * grounding reached the model. A question mentioning quota exercises the failure path. */
const liveVoice = {
  /** Hears only what the browser actually sent: under half a second is treated as silence. */
  recognizer: {
    async open(_context: unknown, emit: (event: RecognitionEvent) => void) {
      let bytes = 0;
      return {
        write: ({ pcm }: { pcm: ArrayBuffer }) => {
          bytes += pcm.byteLength;
        },
        finish: async () =>
          emit({ type: 'final', text: bytes >= 16000 ? 'Where is the admissions office?' : '' }),
        close() {},
      };
    },
  },
  generator: {
    async *generate(input: { question: string; passages: readonly { text: string }[] }) {
      if (/quota/i.test(input.question))
        throw new GeminiError('PROVIDER_QUOTA', 429, 'quota exhausted');
      const top = input.passages[0]?.text.split('\n').at(-1);
      yield top ? `From this release: ${top}` : 'This release has no answer to that.';
    },
  },
  synthesizer: {
    async *synthesize() {
      // 0.3 s of quiet 440 Hz PCM16 at 24 kHz: several packets for the real worklet queue.
      const samples = new Int16Array(7200);
      for (let i = 0; i < samples.length; i++)
        samples[i] = Math.round(Math.sin((2 * Math.PI * 440 * i) / 24000) * 1500);
      yield samples.buffer;
    },
  },
};

loadWorkspaceEnvironment();
const url = process.env.TEST_DATABASE_URL ?? '';
assertTestDatabase(url, 'test');
const db = createDatabase(url);
const pepper = randomBytes(48).toString('hex');
const identity = new IdentityService(db, pepper);
const app = await createApplication({
  providerMode: 'live',
  localDocs: true,
  probe: async () => ({ status: 'ready', dependencies: {} }),
  feasibilityOrigin: LIVE_ORIGIN,
  identity: { service: identity, origin: LIVE_ORIGIN, pepper, consumeLimit: async () => 0 },
  authoring: new BotService(identity),
  knowledge: new KnowledgeService(identity),
  releases: new ReleaseService(identity, { providerMode: 'live' }),
  schedules: new ScheduleService(identity),
  liveVoice,
});
await app.listen(API, '127.0.0.1');

// The standalone server needs its static assets beside it, exactly as infra/Dockerfile copies them.
const webRoot = fileURLToPath(new URL('../../apps/web/', import.meta.url));
const standalone = `${webRoot}.next/standalone/apps/web/`;
if (!existsSync(`${standalone}server.js`)) throw new Error('Run pnpm build before test:e2e:live.');
cpSync(`${webRoot}.next/static`, `${standalone}.next/static`, { recursive: true });
cpSync(`${webRoot}public`, `${standalone}public`, { recursive: true });
const web = spawn(process.execPath, [`${standalone}server.js`], {
  stdio: 'inherit',
  env: {
    ...process.env,
    PORT: String(WEB),
    HOSTNAME: '127.0.0.1',
    APP_ENV: 'local',
    PROVIDER_MODE: 'live',
    APP_ORIGIN: LIVE_ORIGIN,
    API_INTERNAL_ORIGIN: `http://127.0.0.1:${API}`,
  },
});

const gateway = http.createServer((request, response) => {
  const upstream = http.request(
    {
      host: '127.0.0.1',
      port: request.url?.startsWith('/api/') ? API : WEB,
      path: request.url,
      method: request.method,
      headers: request.headers,
    },
    (reply) => {
      response.writeHead(reply.statusCode ?? 502, reply.headers);
      reply.pipe(response);
    },
  );
  upstream.on('error', () => {
    if (!response.headersSent) response.writeHead(502);
    response.end();
  });
  request.pipe(upstream);
});
gateway.listen(GATEWAY, '127.0.0.1');

let closing = false;
async function shutdown() {
  if (closing) return;
  closing = true;
  web.kill();
  gateway.close();
  await app.close();
  await db.$disconnect();
  process.exit(0);
}
web.once('exit', () => void shutdown());
process.once('SIGINT', () => void shutdown());
process.once('SIGTERM', () => void shutdown());
