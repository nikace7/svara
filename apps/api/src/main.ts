import { loadWorkspaceEnvironment, parseServerConfig } from '@svara/config/server';
import {
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
  KnowledgeService,
  PresentationService,
  ReleaseService,
  ScheduleService,
  MediaService,
  MediaStorage,
} from '@svara/domain';
import { createApplication } from './app.js';

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
  runtime: {
    service: new DeviceRuntime(dependencies.database, config.AUTH_TOKEN_PEPPER),
    origin: config.APP_ORIGIN,
    pepper: config.AUTH_TOKEN_PEPPER,
    consumeLimit: createStaffLimiter(dependencies.redis, config.AUTH_TOKEN_PEPPER),
  },
  knowledge: new KnowledgeService(identity),
  presentations: new PresentationService(identity),
  releases: new ReleaseService(identity, { providerMode: config.PROVIDER_MODE }),
  schedules: new ScheduleService(identity),
  media: new MediaService(
    identity,
    dependencies.database,
    await MediaStorage.open(config.MEDIA_ROOT),
  ),
  ...(config.APP_ENV === 'local' ? { feasibilityOrigin: config.APP_ORIGIN } : {}),
  ...(config.APP_ENV === 'local' && config.PROVIDER_MODE === 'live' && config.GEMINI_API_KEY
    ? { liveVoice: liveVoiceProviders(config.GEMINI_API_KEY) }
    : {}),
});
let closing = false;
async function shutdown() {
  if (closing) return;
  closing = true;
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
