import { fileURLToPath } from 'node:url';
import { createLocalSetup } from './local-setup.js';

await createLocalSetup(fileURLToPath(new URL('../', import.meta.url)));
console.info('Svara local configuration is ready. Existing files were preserved.');
console.info('Next: pnpm infra:up, pnpm db:generate, pnpm db:migrate, pnpm db:seed, pnpm dev.');
console.info('Once running, open http://localhost:4320/login and create your owner workspace.');
