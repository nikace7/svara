import { spawnSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { loadWorkspaceEnvironment, parseServerConfig } from '../packages/config/src/server.js';
import { createDatabase } from '../packages/database/src/index.js';
import { assertDemoDatabase, assertTestDatabase } from '../packages/database/src/safety.js';
import { seedOrganisations } from '../packages/database/src/seed.js';
import { demoStaffIds, loadDemoCredentials } from './demo-credentials.js';

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
    const { seedLocalStaff } = await import('../packages/domain/src/identity/local.js');
    const credentials = await loadDemoCredentials(
      fileURLToPath(new URL('../.local/setup/', import.meta.url)),
      { allowCreate: (await db.user.count({ where: { id: { in: demoStaffIds } } })) === 0 },
    );
    const created = await seedLocalStaff(db, credentials.accounts);
    console.info(
      `Seeded two fictional organisations and ${created} new staff accounts. Existing identities and access were preserved.`,
    );
    console.info(
      `Initial demo credentials: ${credentials.path}. Changed passwords are never reset by seeding.`,
    );
    const { seedLocalAuthoring } = await import('../packages/domain/src/local/authoring.js');
    const { MediaStorage } = await import('../packages/domain/src/media/storage.js');
    const { MediaInspector } = await import('../apps/worker/src/media/inspector.js');
    const { demoAuthoringBundles } = await import('../fixtures/authoring.js');
    const config = parseServerConfig(process.env);
    const storage = await MediaStorage.open(config.MEDIA_ROOT);
    const inspector = new MediaInspector(storage, config);
    const map = await readFile(new URL('../fixtures/media/himal-campus-map.png', import.meta.url));
    let added = 0;
    for (const bundle of demoAuthoringBundles(map))
      if (await seedLocalAuthoring(db, bundle, storage, inspector.inspect.bind(inspector)))
        added += bundle.bots.length;
    console.info(
      `Added ${added} fictional demo guides. Completed seed bundles, edits and deleted content were preserved.`,
    );
  } finally {
    await db.$disconnect();
  }
}
