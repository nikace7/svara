import { loadWorkspaceEnvironment, parseServerConfig } from '@svara/config/server';
import {
  FixtureAnswerGenerator,
  GeminiAnswerGenerator,
  GeminiSpeechRecognizer,
  GeminiSpeechSynthesizer,
} from '@svara/providers';
import {
  BotService,
  createDependencies,
  createStaffLimiter,
  IdentityService,
  DeviceService,
  DeviceRuntime,
  DeviceCommands,
  DeviceReleases,
  KnowledgeService,
  PresentationService,
  ReleaseService,
  ScheduleService,
  MediaService,
  MediaStorage,
  AssistantLinkService,
  ConversationService,
  ConversationSessions,
  PublicAssistants,
} from '@svara/domain';
import { commandWakeupSchema } from '@svara/contracts';
import { createApplication } from './app.js';
import { DeviceGateway } from './devices/gateway.js';
import { ActiveTurns } from './conversations/stream.js';

loadWorkspaceEnvironment();
const config = parseServerConfig(process.env);
const dependencies = await createDependencies(config);
const identity = new IdentityService(dependencies.database, config.AUTH_TOKEN_PEPPER);
function liveVoiceProviders(apiKey: string) {
  const gemini = {
    apiKey,
    model: config.GEMINI_MODEL,
    ttsModel: config.GEMINI_TTS_MODEL,
    sttModel: config.GEMINI_STT_MODEL,
    voice: config.GEMINI_VOICE,
    retries: 2,
  };
  return {
    generator: new GeminiAnswerGenerator(gemini),
    synthesizer: new GeminiSpeechSynthesizer(gemini),
    recognizer: new GeminiSpeechRecognizer(gemini),
  };
}
const storage = await MediaStorage.open(config.MEDIA_ROOT);
const deviceRuntime = new DeviceRuntime(dependencies.database, config.AUTH_TOKEN_PEPPER);
const gateway = new DeviceGateway({
  origin: config.APP_ORIGIN,
  runtime: deviceRuntime,
  commands: new DeviceCommands(deviceRuntime),
});
// Configuration already requires a key in live mode, so live never falls back to demo mode.
const liveKey = config.PROVIDER_MODE === 'live' ? config.GEMINI_API_KEY : undefined;
const conversationMode = liveKey ? 'live' : 'fixture';
const conversations = new ConversationService(dependencies.database, identity, deviceRuntime, {
  providerMode: conversationMode,
  pepper: config.AUTH_TOKEN_PEPPER,
});
const app = await createApplication({
  providerMode: config.PROVIDER_MODE,
  localDocs: config.APP_ENV === 'local',
  probe: () => dependencies.ready(true),
  trustedProxyHops: config.TRUST_PROXY_HOPS === 1 ? 1 : 0,
  identity: {
    service: identity,
    origin: config.APP_ORIGIN,
    pepper: config.AUTH_TOKEN_PEPPER,
    consumeLimit: createStaffLimiter(dependencies.redis, config.AUTH_TOKEN_PEPPER),
  },
  authoring: new BotService(identity),
  devices: new DeviceService(identity, config.AUTH_TOKEN_PEPPER),
  deviceGateway: gateway,
  runtime: {
    service: deviceRuntime,
    releases: new DeviceReleases(deviceRuntime, storage),
    origin: config.APP_ORIGIN,
    pepper: config.AUTH_TOKEN_PEPPER,
    consumeLimit: createStaffLimiter(dependencies.redis, config.AUTH_TOKEN_PEPPER),
  },
  knowledge: new KnowledgeService(identity),
  presentations: new PresentationService(identity),
  releases: new ReleaseService(identity, { providerMode: config.PROVIDER_MODE }),
  schedules: new ScheduleService(identity),
  media: new MediaService(identity, dependencies.database, storage),
  conversations: {
    service: conversations,
    sessions: new ConversationSessions(identity),
    links: new AssistantLinkService(identity),
    publics: new PublicAssistants(dependencies.database, storage, {
      pepper: config.AUTH_TOKEN_PEPPER,
      providerMode: conversationMode,
    }),
    streaming: {
      service: conversations,
      runner: {
        service: conversations,
        providers: liveKey
          ? liveVoiceProviders(liveKey)
          : { generator: new FixtureAnswerGenerator() },
        slides: { show: (deviceId, command) => gateway.showSlide(deviceId, command) },
      },
      active: new ActiveTurns(),
    },
    origin: config.APP_ORIGIN,
    pepper: config.AUTH_TOKEN_PEPPER,
    consumeLimit: createStaffLimiter(dependencies.redis, config.AUTH_TOKEN_PEPPER),
  },
  ...(config.APP_ENV === 'local' ? { feasibilityOrigin: config.APP_ORIGIN } : {}),
  ...(config.APP_ENV === 'local' && config.PROVIDER_MODE === 'live' && config.GEMINI_API_KEY
    ? { liveVoice: liveVoiceProviders(config.GEMINI_API_KEY) }
    : {}),
});
// Worker wake-ups name commands by ID; the gateway re-reads desired state from PostgreSQL.
const subscriber = dependencies.redis.duplicate();
subscriber.on('error', () => {
  console.error(JSON.stringify({ event: 'dependency.error', dependency: 'redis-subscriber' }));
});
subscriber.on('message', (_channel, message) => {
  let parsed: ReturnType<typeof commandWakeupSchema.safeParse>;
  try {
    parsed = commandWakeupSchema.safeParse(JSON.parse(message));
  } catch {
    return;
  }
  if (parsed.success) void gateway.wake(parsed.data.map((item) => item.deviceId));
});
await subscriber.subscribe(`${config.WORKER_NAMESPACE}:device-commands`);
let closing = false;
async function shutdown() {
  if (closing) return;
  closing = true;
  subscriber.disconnect();
  await gateway.close();
  await app.close();
  await dependencies.close();
}
process.once('SIGINT', () => {
  void shutdown();
});
process.once('SIGTERM', () => {
  void shutdown();
});
await app.listen(config.API_PORT, config.BIND_HOST);
console.info(
  JSON.stringify({
    event: 'api.started',
    port: config.API_PORT,
    providerMode: config.PROVIDER_MODE,
  }),
);
