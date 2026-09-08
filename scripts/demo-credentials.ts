import { randomBytes } from 'node:crypto';
import { lstat, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { DemoStaffAccount } from '../packages/domain/src/identity/local.js';

const himal = '10000000-0000-4000-8000-000000000001';
const riverside = '20000000-0000-4000-8000-000000000001';
const inventory: Omit<DemoStaffAccount, 'password'>[] = [
  {
    id: '10000000-0000-4000-8000-000000000011',
    email: 'owner@himal.svara.test',
    displayName: 'Himal Owner',
    organisationId: himal,
    role: 'OWNER',
  },
  {
    id: '10000000-0000-4000-8000-000000000012',
    email: 'admin@himal.svara.test',
    displayName: 'Himal Administrator',
    organisationId: himal,
    role: 'ADMINISTRATOR',
  },
  {
    id: '10000000-0000-4000-8000-000000000013',
    email: 'operator@himal.svara.test',
    displayName: 'Himal Operator',
    organisationId: himal,
    role: 'OPERATOR',
  },
  {
    id: '10000000-0000-4000-8000-000000000014',
    email: 'viewer@himal.svara.test',
    displayName: 'Himal Viewer',
    organisationId: himal,
    role: 'VIEWER',
  },
  {
    id: '20000000-0000-4000-8000-000000000011',
    email: 'owner@riverside.svara.test',
    displayName: 'Riverside Owner',
    organisationId: riverside,
    role: 'OWNER',
  },
];
export const demoStaffIds = inventory.map((account) => account.id);

/** Write before touching the DB; restarts reuse credentials and never guess a new password. */
export async function loadDemoCredentials(
  directory: string,
  { allowCreate = true }: { allowCreate?: boolean } = {},
): Promise<{ path: string; accounts: DemoStaffAccount[] }> {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const path = join(directory, 'demo-staff.json');
  if (allowCreate)
    try {
      const accounts = inventory.map((account) => ({
        ...account,
        password: randomBytes(32).toString('base64url'),
      }));
      await writeFile(path, `${JSON.stringify({ version: 1, accounts }, null, 2)}\n`, {
        flag: 'wx',
        mode: 0o600,
      });
      return { path, accounts };
    } catch (error) {
      if (!(error instanceof Error && 'code' in error && error.code === 'EEXIST')) throw error;
    }
  try {
    const info = await lstat(path);
    if (!info.isFile() || info.size > 16384) throw new Error('Invalid file.');
    const data: unknown = JSON.parse(await readFile(path, 'utf8'));
    if (
      !data ||
      typeof data !== 'object' ||
      !('version' in data) ||
      data.version !== 1 ||
      !('accounts' in data) ||
      !Array.isArray(data.accounts) ||
      data.accounts.length !== inventory.length
    )
      throw new Error('Invalid inventory.');
    const accounts = data.accounts as unknown[];
    for (const [index, account] of accounts.entries()) {
      if (
        !account ||
        typeof account !== 'object' ||
        !('password' in account) ||
        typeof account.password !== 'string' ||
        !/^[A-Za-z0-9_-]{43}$/.test(account.password)
      )
        throw new Error('Invalid password.');
      for (const [key, value] of Object.entries(inventory[index]!))
        if (!(key in account) || account[key as keyof typeof account] !== value)
          throw new Error('Changed identity.');
    }
    return { path, accounts: accounts as DemoStaffAccount[] };
  } catch {
    throw new Error(
      'Existing demo credentials are missing or invalid. Restore the original file; it was not overwritten.',
    );
  }
}
