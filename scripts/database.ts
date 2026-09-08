import { spawnSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadWorkspaceEnvironment } from '../packages/config/src/server.js';
import { createDatabase } from '../packages/database/src/index.js';
import { assertDemoDatabase, assertTestDatabase } from '../packages/database/src/safety.js';
import { seedOrganisations } from '../packages/database/src/seed.js';

loadWorkspaceEnvironment();
const operation = process.argv[2];
if (!['migrate', 'seed', 'test'].includes(operation ?? ''))
  throw new Error('Expected migrate, seed or test.');
const url = (operation === 'test' ? process.env.TEST_DATABASE_URL : process.env.DATABASE_URL) ?? '';
if (operation === 'test') assertTestDatabase(url, 'test');
else assertDemoDatabase(url, process.env.APP_ENV ?? '');

if (operation !== 'seed') {
  const cli = realpathSync(
    fileURLToPath(
      new URL('../packages/database/node_modules/prisma/build/index.js', import.meta.url),
    ),
  );
  const config = fileURLToPath(new URL('../packages/database/prisma.config.ts', import.meta.url));
  const result = spawnSync(process.execPath, [cli, 'migrate', 'deploy', '--config', config], {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: url, APP_ENV: operation === 'test' ? 'test' : 'local' },
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
} else {
  const db = createDatabase(url);
  try {
    const marker = await db.applicationMetadata.findUnique({ where: { id: 'svara' } });
    if (marker?.schemaVersion !== 1)
      throw new Error('Refusing seed: expected Svara application marker.');
    await seedOrganisations(db);
    console.info(
      'Seeded two fictional organisations. Existing records were preserved. Create an owner workspace at /register; demo staff seeds are still pending.',
    );
  } finally {
    await db.$disconnect();
  }
}
