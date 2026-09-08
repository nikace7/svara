import { loadWorkspaceEnvironment, parseServerConfig } from '@svara/config/server';
import {
  BotService,
  createDependencies,
  createStaffLimiter,
  IdentityService,
  KnowledgeService,
  MediaService,
  MediaStorage,
} from '@svara/domain';
import { createApplication } from './app.js';

loadWorkspaceEnvironment();
const config = parseServerConfig(process.env);
const dependencies = await createDependencies(config);
const identity = new IdentityService(dependencies.database, config.AUTH_TOKEN_PEPPER);
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
  knowledge: new KnowledgeService(identity),
  media: new MediaService(
    identity,
    dependencies.database,
    await MediaStorage.open(config.MEDIA_ROOT),
  ),
  ...(config.APP_ENV === 'local' && config.PROVIDER_MODE === 'fixture'
    ? { feasibilityOrigin: config.APP_ORIGIN }
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
