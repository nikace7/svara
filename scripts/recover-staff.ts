import { randomBytes, randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { loadWorkspaceEnvironment } from '../packages/config/src/server.js';
import { createDatabase } from '../packages/database/src/index.js';
import { assertDemoDatabase } from '../packages/database/src/safety.js';
import { recoverLocalStaff } from '../packages/domain/src/identity/local.js';
import { loginInputSchema } from '../packages/contracts/src/identity.js';

loadWorkspaceEnvironment();
const args = process.argv.slice(2);
if (args.length !== 2 || args[0] !== '--email')
  throw new Error('Usage: pnpm staff:recover --email person@example.test');
const input = loginInputSchema.safeParse({ email: args[1], password: 'local-recovery' });
if (!input.success) throw new Error('Expected one valid recovery email.');
const url = process.env.DATABASE_URL ?? '';
assertDemoDatabase(url, process.env.APP_ENV ?? '');
const db = createDatabase(url);
try {
  if ((await db.applicationMetadata.findUnique({ where: { id: 'svara' } }))?.schemaVersion !== 1)
    throw new Error('Refusing recovery: expected Svara application marker.');
  if (!(await db.user.findUnique({ where: { email: input.data.email }, select: { id: true } })))
    throw new Error('Local recovery account not found.');
  const directory = fileURLToPath(new URL('../.local/setup/', import.meta.url));
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const path = join(directory, `recovery-${randomUUID()}.json`);
  const password = randomBytes(32).toString('base64url');
  await writeFile(path, `${JSON.stringify({ email: input.data.email, password }, null, 2)}\n`, {
    flag: 'wx',
    mode: 0o600,
  });
  await recoverLocalStaff(db, input.data.email, password);
  console.info(
    `Local password recovery completed. Sessions and grants revoked. New credentials: ${path}`,
  );
  console.info(
    'Existing role/access settings were preserved. The original seed file was not changed.',
  );
} finally {
  await db.$disconnect();
}
