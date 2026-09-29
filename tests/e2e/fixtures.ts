import { randomUUID } from 'node:crypto';
import { test as base, expect } from '@playwright/test';
import type { APIRequestContext, PlaywrightWorkerArgs } from '@playwright/test';

type StaffState = Awaited<ReturnType<APIRequestContext['storageState']>>;

async function registerOwner(playwright: PlaywrightWorkerArgs['playwright'], baseURL: string) {
  const client = await playwright.request.newContext({
    baseURL,
    extraHTTPHeaders: { Origin: baseURL },
  });
  try {
    const response = await client.post('/api/v1/auth/register', {
      data: {
        email: `e2e-${randomUUID()}@example.test`,
        password: `Test account ${randomUUID()}`,
        displayName: 'Fixture Owner',
        organisationName: 'Browser QA Workspace',
      },
    });
    expect(response.status()).toBe(201);
    return await client.storageState();
  } finally {
    await client.dispose();
  }
}

// Real quotas stay enabled, so owners rotate through a small pool by spec file. The run
// already spends ~23 of the 30 sign-ins per IP per 10 minutes on the flows that test
// sign-in, and one owner for the whole run would pass 180 requests per minute on its
// session. Files run one at a time, so consecutive files land on different sessions.
const POOL_SIZE = 3;
const pool: Promise<StaffState>[] = [];
const slots = new Map<string, number>();

export const test = base.extend<{ staffState: StaffState }>({
  staffState: async ({ playwright, baseURL }, use, testInfo) => {
    let slot = slots.get(testInfo.file);
    if (slot === undefined) {
      slot = slots.size % POOL_SIZE;
      slots.set(testInfo.file, slot);
    }
    const owner = (pool[slot] ??= registerOwner(playwright, String(baseURL)));
    await use(await owner);
  },
  storageState: async ({ staffState }, use) => {
    await use(staffState);
  },
});
export { expect } from '@playwright/test';
