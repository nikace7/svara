import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createLocalSetup } from './local-setup.js';

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('local setup', () => {
  it('creates fresh independent secrets and preserves existing local configuration', async () => {
    const root = await mkdtemp(join(tmpdir(), 'svara-setup-test-'));
    directories.push(root);
    await createLocalSetup(root);
    const first = await readFile(join(root, '.env'), 'utf8');
    expect(first).toContain('PROVIDER_MODE=fixture');
    expect(first).toMatch(/AUTH_TOKEN_PEPPER=[a-f0-9]{64}/);
    expect(first).toContain('/svara_dev');
    expect(first).toContain('/svara_test');
    const customised = `${first}\n# preserved customization\n`;
    await writeFile(join(root, '.env'), customised);
    await createLocalSetup(root);
    expect(await readFile(join(root, '.env'), 'utf8')).toBe(customised);
    expect(await readFile(join(root, '.env.compose'), 'utf8')).not.toContain('AZURE_SPEECH_KEY');
    const secondRoot = await mkdtemp(join(tmpdir(), 'svara-setup-test-'));
    directories.push(secondRoot);
    await createLocalSetup(secondRoot);
    expect(await readFile(join(secondRoot, '.env'), 'utf8')).not.toBe(first);
  });

  it('refuses to invent mismatched credentials for an incomplete existing setup', async () => {
    const root = await mkdtemp(join(tmpdir(), 'svara-setup-test-'));
    directories.push(root);
    await writeFile(join(root, '.env'), 'DATABASE_URL=postgresql://external/customer\n');
    await expect(createLocalSetup(root)).rejects.toThrow('POSTGRES_PASSWORD');
  });
});
