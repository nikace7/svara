/** A self-contained stack for `pnpm test:e2e:live`: the built web in live mode, the real API
 * wiring with stub Gemini providers, and one same-origin gateway like Caddy's. Stubs keep the
 * browser suite deterministic and quota-free; `pnpm eval:gemini` covers the real provider.
 * With SVARA_STACK_MODE=fixture it runs honest demo mode instead (FixtureAnswerGenerator, no
 * speech), which the screenshot set uses so every capture is labelled truthfully.
 * Uses the test database only. Requires `pnpm build` first. */
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { cpSync, existsSync, mkdtempSync } from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApplication } from '../../apps/api/dist/app.js';
import { ActiveTurns } from '../../apps/api/dist/conversations/stream.js';
import { DeviceGateway } from '../../apps/api/dist/devices/gateway.js';
import { ScheduleLoop } from '../../apps/worker/src/schedules/loop.js';
import { loadWorkspaceEnvironment } from '../../packages/config/src/server.js';
import { createDatabase } from '../../packages/database/src/index.js';
import { assertTestDatabase } from '../../packages/database/src/safety.js';
import {
  AssistantLinkService,
  BotService,
  ConversationService,
  ConversationSessions,
  expireStaleSessions,
  PublicAssistants,
  IdentityService,
  KnowledgeService,
  CommandOutbox,
  DeviceCommands,
  DeviceReleases,
  DeviceRuntime,
  DeviceService,
  MediaStorage,
  PresentationService,
  ReleaseService,
  ScheduleService,
} from '../../packages/domain/dist/index.js';
import { FixtureAnswerGenerator, GeminiError } from '../../packages/providers/dist/index.js';
import type { AnswerInput, RecognitionEvent } from '../../packages/providers/dist/index.js';

const LIVE_ORIGIN = 'http://localhost:4330';
const mode = process.env.SVARA_STACK_MODE === 'fixture' ? 'fixture' : 'live';
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
    async *generate(input: AnswerInput) {
      if (/quota/i.test(input.question))
        throw new GeminiError('PROVIDER_QUOTA', 429, 'quota exhausted');
      // A kiosk asking for a slide proposes the first listed one, then reports the outcome.
      if (input.toolRound) {
        const outcome = input.toolRound.results[0]?.result as { status?: string } | undefined;
        yield `The slide request was ${String(outcome?.status ?? 'unknown').toLowerCase()}.`;
        return;
      }
      const question = input.question.toLowerCase();
      const slide =
        input.slides?.find((item) =>
          item.title
            .toLowerCase()
            .split(' ')
            .some((word) => word.length > 4 && question.includes(word)),
        ) ?? input.slides?.[0];
      if (
        slide &&
        input.tools?.some((tool) => tool.name === 'show_slide') &&
        /slide/i.test(input.question)
      ) {
        yield {
          type: 'tool' as const,
          callId: 'stub-slide',
          name: 'show_slide',
          args: { slide: slide.label },
        };
        return;
      }
      // A long answer gives the browser time to interrupt it.
      if (/long/i.test(input.question)) {
        for (let index = 1; index <= 8; index++)
          yield `This is sentence ${index} of a long answer. `;
        return;
      }
      const top = input.passages[0];
      yield top
        ? `From this release: ${top.text.split('\n').at(-1)} [${top.id}]`
        : 'This release has no answer to that.';
    },
  },
  synthesizer: {
    async *synthesize(text: string) {
      if (/long answer/.test(text)) await new Promise((done) => setTimeout(done, 700));
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
const runtime = new DeviceRuntime(db, pepper);
const gateway = new DeviceGateway({
  origin: LIVE_ORIGIN,
  runtime,
  commands: new DeviceCommands(runtime),
});
// The stack has no worker or Redis: scan the outbox in-process and wake devices directly.
const schedules = new ScheduleLoop(
  new CommandOutbox(db),
  (claimed) => gateway.wake(claimed.map((command) => command.deviceId)),
  { sweep: () => expireStaleSessions(db) },
);
const conversations = new ConversationService(db, identity, runtime, {
  providerMode: mode,
  pepper,
});
const media = await MediaStorage.open(mkdtempSync(join(tmpdir(), 'svara-e2e-media-')));
const app = await createApplication({
  providerMode: mode,
  localDocs: true,
  probe: async () => ({ status: 'ready', dependencies: {} }),
  feasibilityOrigin: LIVE_ORIGIN,
  identity: { service: identity, origin: LIVE_ORIGIN, pepper, consumeLimit: async () => 0 },
  authoring: new BotService(identity),
  knowledge: new KnowledgeService(identity),
  presentations: new PresentationService(identity),
  releases: new ReleaseService(identity, { providerMode: mode }),
  schedules: new ScheduleService(identity),
  devices: new DeviceService(identity, pepper),
  deviceGateway: gateway,
  runtime: {
    service: runtime,
    releases: new DeviceReleases(runtime, media),
    origin: LIVE_ORIGIN,
    pepper,
    consumeLimit: async () => 0,
  },
  ...(mode === 'live' ? { liveVoice } : {}),
  conversations: {
    service: conversations,
    sessions: new ConversationSessions(identity),
    links: new AssistantLinkService(identity),
    publics: new PublicAssistants(db, media, { pepper, providerMode: mode }),
    streaming: {
      service: conversations,
      runner: {
        service: conversations,
        providers: mode === 'live' ? liveVoice : { generator: new FixtureAnswerGenerator() },
        slides: { show: (deviceId, command) => gateway.showSlide(deviceId, command) },
      },
      active: new ActiveTurns(),
    },
    origin: LIVE_ORIGIN,
    pepper,
    consumeLimit: async () => 0,
  },
});
await app.listen(API, '127.0.0.1');
schedules.start();

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
    PROVIDER_MODE: mode,
    APP_ORIGIN: LIVE_ORIGIN,
    API_INTERNAL_ORIGIN: `http://127.0.0.1:${API}`,
  },
});

const proxy = http.createServer((request, response) => {
  const upstream = http.request(
    {
      host: '127.0.0.1',
      port: /^\/(api|socket\.io)\//.test(request.url ?? '') ? API : WEB,
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
// Device sockets upgrade to WebSocket; pass the raw connection through like Caddy does.
proxy.on('upgrade', (request, client, head) => {
  const upstream = net.connect(
    request.url?.startsWith('/socket.io/') ? API : WEB,
    '127.0.0.1',
    () => {
      const lines = Object.entries(request.headers).map(
        ([key, value]) => `${key}: ${String(value)}`,
      );
      upstream.write(
        [`${request.method} ${request.url} HTTP/${request.httpVersion}`, ...lines, '', ''].join(
          '\r\n',
        ),
      );
      upstream.write(head);
      client.pipe(upstream).pipe(client);
    },
  );
  upstream.on('error', () => client.destroy());
  client.on('error', () => upstream.destroy());
});
proxy.listen(GATEWAY, '127.0.0.1');

let closing = false;
async function shutdown() {
  if (closing) return;
  closing = true;
  web.kill();
  proxy.close();
  await schedules.close();
  await gateway.close();
  await app.close();
  await db.$disconnect();
  process.exit(0);
}
web.once('exit', () => void shutdown());
process.once('SIGINT', () => void shutdown());
process.once('SIGTERM', () => void shutdown());
