/**
 * pnpm demo:reset svara_dev
 *
 * Returns the native local demo to a freshly seeded state. It refuses anything but the local
 * svara_dev database carrying the Svara marker and the workspace's own .local/media directory,
 * and it takes a verified-format backup first, so a reset is always recoverable with
 * `pnpm restore`. Staff passwords come back from .local/setup/demo-staff.json as seeding does.
 * The Compose demo keeps its data in volumes; reset that with the documented volume commands.
 */
import { spawnSync } from 'node:child_process';
import { readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadWorkspaceEnvironment, parseServerConfig } from '../packages/config/src/server.js';
import { createDatabase } from '../packages/database/src/index.js';
import { assertResetTarget } from '../packages/database/src/safety.js';

const root = fileURLToPath(new URL('../', import.meta.url));
function run(script: string, ...args: string[]): void {
  const result = spawnSync(process.execPath, ['--import', 'tsx', script, ...args], {
    cwd: root,
    stdio: 'inherit',
  });
  if (result.status !== 0) throw new Error(`${script} ${args.join(' ')} failed; reset stopped.`);
}

loadWorkspaceEnvironment();
const url = process.env.DATABASE_URL ?? '';
const { MEDIA_ROOT } = parseServerConfig(process.env);
assertResetTarget(url, process.env.APP_ENV ?? '', MEDIA_ROOT, process.argv[2]);

const db = createDatabase(url);
try {
  const marker = await db.applicationMetadata.findUnique({ where: { id: 'svara' } });
  if (marker?.schemaVersion !== 1) throw new Error('Refusing reset: no Svara application marker.');
} finally {
  await db.$disconnect();
}

run('scripts/backup.ts', 'create');
const reset = createDatabase(url);
try {
  await reset.$executeRawUnsafe('DROP SCHEMA public CASCADE');
  await reset.$executeRawUnsafe('CREATE SCHEMA public');
} finally {
  await reset.$disconnect();
}
for (const entry of await readdir(MEDIA_ROOT))
  await rm(join(MEDIA_ROOT, entry), { recursive: true, force: true });
run('scripts/database.ts', 'migrate');
run('scripts/database.ts', 'seed');
console.info('Demo reset complete. The previous state is in the newest .local/backups entry.');
