import { loadWorkspaceEnvironment, parseServerConfig } from '@svara/config/server';
import { createDependencies } from '@svara/domain';
import { createApplication } from './app.js';

loadWorkspaceEnvironment();
const config = parseServerConfig(process.env);
const dependencies = await createDependencies(config);
const app = await createApplication({
  providerMode: config.PROVIDER_MODE,
  localDocs: config.APP_ENV === 'local',
  probe: () => dependencies.ready(true),
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
