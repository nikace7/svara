/**
 * Local backup and restore.
 *
 *   pnpm backup [--compose]             -> .local/backups/<timestamp>/{database.dump,media/,manifest.json}
 *   pnpm restore <dir> [svara_restore]  -> a NEW database beside svara_dev, media beside it, verified
 *
 * The dump runs inside the Compose PostgreSQL container (no local client tools, no password on
 * a command line). Media comes from MEDIA_ROOT, or with --compose from the demo stack's media
 * volume through its API container. A restore never touches svara_dev, svara_test or the live media root: it
 * creates a separately named database and media directory, then checks them against the
 * manifest. Swapping a restored copy into use is a documented manual step (docs/OPERATIONS.md).
 */
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream, existsSync } from 'node:fs';
import { cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import { loadWorkspaceEnvironment, parseServerConfig } from '../packages/config/src/server.js';
import { createDatabase } from '../packages/database/src/index.js';
import type { PrismaClient } from '../packages/database/src/index.js';
import { assertDemoDatabase, assertRestoreTarget } from '../packages/database/src/safety.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const project = process.env.COMPOSE_PROJECT_NAME ?? 'svara';

function container(service = 'postgres'): string {
  const found = spawnSync(
    'docker',
    [
      'ps',
      '--filter',
      `label=com.docker.compose.project=${project}`,
      '--filter',
      `label=com.docker.compose.service=${service}`,
      '--format',
      '{{.Names}}',
    ],
    { encoding: 'utf8' },
  );
  const name = found.stdout?.trim().split('\n')[0];
  if (found.status !== 0 || !name)
    throw new Error(`No running ${project} ${service} container. Start the stack first.`);
  return name;
}

/** Runs a client tool in the container; stdin/stdout may stream a dump file. */
async function inContainer(args: string[], io: { from?: string; to?: string } = {}): Promise<void> {
  const child = spawn('docker', ['exec', ...(io.from ? ['-i'] : []), container(), ...args], {
    stdio: [io.from ? 'pipe' : 'ignore', io.to ? 'pipe' : 'inherit', 'inherit'],
  });
  const exit = new Promise<number | null>((done, fail) => {
    child.once('error', fail);
    child.once('close', done);
  });
  const streams: Promise<void>[] = [];
  if (io.from) streams.push(pipeline(createReadStream(io.from), child.stdin!));
  if (io.to) streams.push(pipeline(child.stdout!, createWriteStream(io.to, { flags: 'wx' })));
  await Promise.all(streams);
  const code = await exit;
  if (code !== 0) throw new Error(`${args[0]} failed with exit code ${String(code)}.`);
}

/** Exact row counts for every table in the schema, whatever migrations it has reached. */
async function counts(db: PrismaClient): Promise<Record<string, number>> {
  const tables = await db.$queryRaw<{ name: string }[]>`
    SELECT table_name AS name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name`;
  const result: Record<string, number> = {};
  for (const { name } of tables) {
    // Names come from the catalogue itself, quoted as identifiers.
    const [row] = await db.$queryRawUnsafe<{ n: number }[]>(
      `SELECT count(*)::int AS n FROM "${name.replaceAll('"', '""')}"`,
    );
    result[name] = row?.n ?? 0;
  }
  return result;
}
const total = (table: Record<string, number>) =>
  `${Object.keys(table).length} tables, ${Object.values(table).reduce((a, b) => a + b, 0)} rows`;
type Counts = Record<string, number>;
interface Manifest {
  createdAt: string;
  database: string;
  sha256: string;
  mediaFiles: number;
  counts: Counts;
}

async function sha256(path: string): Promise<string> {
  const hash = createHash('sha256');
  await pipeline(createReadStream(path), hash);
  return hash.digest('hex');
}

async function backup(url: string, mediaRoot: string | 'compose'): Promise<void> {
  const stamp = new Date().toISOString().replaceAll(/[:.]/g, '-');
  const out = join(root, '.local', 'backups', stamp);
  await mkdir(out, { recursive: true, mode: 0o700 });
  const database = new URL(url).pathname.slice(1);
  const dump = join(out, 'database.dump');
  const db = createDatabase(url);
  let complete = false;
  try {
    // The manifest's counts must describe the dump: if anything was added or removed while it
    // ran, the backup is refused rather than recorded with counts it cannot prove.
    const before = await counts(db);
    // A consistent snapshot in PostgreSQL's custom format; roles and grants are not copied.
    await inContainer(
      [
        'pg_dump',
        '-U',
        'svara',
        '-d',
        database,
        '--format=custom',
        '--no-owner',
        '--no-privileges',
      ],
      { to: dump },
    );
    if (JSON.stringify(await counts(db)) !== JSON.stringify(before))
      throw new Error('The database changed during the backup. Run it again when idle.');
    if (mediaRoot === 'compose') {
      const copied = spawnSync('docker', ['cp', `${container('api')}:/app/.local/media`, out], {
        stdio: 'inherit',
      });
      if (copied.status !== 0) throw new Error('Copying the media volume failed.');
    } else await cp(mediaRoot, join(out, 'media'), { recursive: true, errorOnExist: true });
    const manifest: Manifest = {
      createdAt: new Date().toISOString(),
      database,
      sha256: await sha256(dump),
      mediaFiles: (await readdir(join(out, 'media'))).length,
      counts: before,
    };
    await writeFile(
      join(out, 'manifest.json'),
      `${JSON.stringify(manifest, null, 2)}
`,
      {
        flag: 'wx',
      },
    );
    complete = true;
    console.info(`Backup written to ${out}`);
    console.info(`${total(before)}, ${manifest.mediaFiles} media files.`);
  } finally {
    await db.$disconnect();
    // Never leave a partial backup that could later be mistaken for a complete one.
    if (!complete) await rm(out, { recursive: true, force: true });
  }
}

async function restore(url: string, from: string, target: string): Promise<void> {
  assertRestoreTarget(target);
  const dir = resolve(from);
  const manifest = JSON.parse(await readFile(join(dir, 'manifest.json'), 'utf8')) as Manifest;
  const dump = join(dir, 'database.dump');
  if ((await sha256(dump)) !== manifest.sha256)
    throw new Error('Refusing restore: the dump does not match its manifest checksum.');
  const mediaTarget = join(root, '.local', `${target}-media`);
  if (existsSync(mediaTarget))
    throw new Error(`Refusing restore: ${mediaTarget} already exists. Choose another target.`);
  // createdb fails if the database already exists, so nothing is ever overwritten.
  await inContainer(['createdb', '-U', 'svara', target]);
  await inContainer(['pg_restore', '-U', 'svara', '-d', target, '--no-owner', '--exit-on-error'], {
    from: dump,
  });
  await cp(join(dir, 'media'), mediaTarget, { recursive: true, errorOnExist: true });

  const restoredUrl = new URL(url);
  restoredUrl.pathname = `/${target}`;
  const db = createDatabase(restoredUrl.toString());
  try {
    const marker = await db.applicationMetadata.findUnique({ where: { id: 'svara' } });
    const restored = await counts(db);
    const stored = await db.mediaAsset.findMany({
      where: { storageKey: { not: null } },
      select: { storageKey: true },
    });
    const files = new Set(await readdir(mediaTarget));
    const missing = stored.filter((asset) => !files.has(asset.storageKey!)).length;
    const differs = Object.entries(manifest.counts).filter(
      ([table, count]) => restored[table] !== count,
    );
    if (marker?.schemaVersion !== 1 || differs.length || missing)
      throw new Error(
        `Restore verification failed: marker ${marker ? 'present' : 'missing'}, ${differs.length} table counts differ, ${missing} media files missing.`,
      );
    console.info(`Restored ${manifest.createdAt} into database ${target} and ${mediaTarget}.`);
    console.info(`Verified ${total(restored)} and all ${stored.length} stored media files.`);
  } finally {
    await db.$disconnect();
  }
}

loadWorkspaceEnvironment();
const url = process.env.DATABASE_URL ?? '';
assertDemoDatabase(url, process.env.APP_ENV ?? '');
const [command, from, target = 'svara_restore'] = process.argv.slice(2);
if (command === 'create')
  await backup(url, from === '--compose' ? 'compose' : parseServerConfig(process.env).MEDIA_ROOT);
else if (command === 'restore' && from) await restore(url, from, target);
else
  throw new Error(
    'Usage: backup.ts create [--compose] | backup.ts restore <backup-directory> [target]',
  );
