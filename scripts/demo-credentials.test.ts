import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadDemoCredentials } from './demo-credentials.js';

const directories: string[] = [];
afterEach(async () => {
  for (const directory of directories.splice(0))
    await rm(directory, { recursive: true, force: true });
});
describe('local demo credentials', () => {
  it('does not invent replacement credentials when accounts already exist', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'svara-credentials-'));
    directories.push(directory);
    await expect(loadDemoCredentials(directory, { allowCreate: false })).rejects.toThrow(
      'Existing demo credentials',
    );
    await expect(readFile(join(directory, 'demo-staff.json'))).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });
  it('generates distinct local passwords once and preserves them on repeated setup', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'svara-credentials-'));
    directories.push(directory);
    const first = await loadDemoCredentials(directory);
    expect(first.accounts).toHaveLength(5);
    expect(new Set(first.accounts.map((account) => account.password)).size).toBe(5);
    expect(first.accounts.every((account) => /^[A-Za-z0-9_-]{43}$/.test(account.password))).toBe(
      true,
    );
    const before = await readFile(first.path, 'utf8');
    expect(await loadDemoCredentials(directory)).toEqual(first);
    expect(await readFile(first.path, 'utf8')).toBe(before);
  });
  it('refuses corrupt or identity-altered credential files without replacing them', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'svara-credentials-'));
    directories.push(directory);
    const initial = await loadDemoCredentials(directory);
    for (const content of [
      '{broken',
      JSON.stringify({
        version: 1,
        accounts: initial.accounts.map((account) => ({
          ...account,
          email: 'changed@example.test',
        })),
      }),
    ]) {
      await writeFile(initial.path, content);
      await expect(loadDemoCredentials(directory)).rejects.toThrow('Existing demo credentials');
      expect(await readFile(initial.path, 'utf8')).toBe(content);
    }
  });
});
