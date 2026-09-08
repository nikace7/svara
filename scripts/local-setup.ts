import { randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { parseEnv } from 'node:util';

async function writeIfMissing(path: string, content: string): Promise<void> {
  try {
    await writeFile(path, content, { flag: 'wx', mode: 0o600 });
  } catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'EEXIST')) throw error;
  }
}

export async function createLocalSetup(root: string): Promise<void> {
  const mediaRoot = resolve(root, '.local/media').replaceAll('\\', '/');
  await mkdir(mediaRoot, { recursive: true });
  const password = randomBytes(24).toString('hex');
  await writeIfMissing(
    join(root, '.env'),
    [
      '# Generated local Svara settings. Do not commit.',
      'APP_ENV=local',
      'APP_ORIGIN=http://localhost:4320',
      `POSTGRES_PASSWORD=${password}`,
      `DATABASE_URL=postgresql://svara:${password}@127.0.0.1:5434/svara_dev`,
      `TEST_DATABASE_URL=postgresql://svara:${password}@127.0.0.1:5434/svara_test`,
      'REDIS_URL=redis://127.0.0.1:6381',
      `MEDIA_ROOT="${mediaRoot}"`,
      `AUTH_TOKEN_PEPPER=${randomBytes(32).toString('hex')}`,
      'PROVIDER_MODE=fixture',
      'ALLOW_LIVE_EVAL=false',
      '',
    ].join('\n'),
  );
  const settings = parseEnv(await readFile(join(root, '.env'), 'utf8'));
  if (!settings.POSTGRES_PASSWORD || !/^[a-f0-9]{48}$/.test(settings.POSTGRES_PASSWORD)) {
    throw new Error(
      'Existing .env needs its original generated POSTGRES_PASSWORD; configuration was preserved.',
    );
  }
  if (!settings.AUTH_TOKEN_PEPPER || !/^[a-f0-9]{64}$/.test(settings.AUTH_TOKEN_PEPPER)) {
    throw new Error(
      'Existing .env needs its original AUTH_TOKEN_PEPPER; configuration was preserved.',
    );
  }
  await writeIfMissing(
    join(root, '.env.compose'),
    [
      '# Generated local Compose interpolation. Do not commit.',
      'COMPOSE_PROJECT_NAME=svara',
      `POSTGRES_PASSWORD=${settings.POSTGRES_PASSWORD}`,
      `AUTH_TOKEN_PEPPER=${settings.AUTH_TOKEN_PEPPER}`,
      '',
    ].join('\n'),
  );
}
