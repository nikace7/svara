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

// One synthetic owner per spec file; real quotas stay enabled. Per test would spend the
// per-IP sign-in quota (30 per 10 minutes); per worker, one session carries the whole run
// past its request quota (180 per minute).
const owners = new Map<string, Promise<StaffState>>();

export const test = base.extend<{ staffState: StaffState }>({
  staffState: async ({ playwright, baseURL }, use, testInfo) => {
    let owner = owners.get(testInfo.file);
    if (!owner) {
      owner = registerOwner(playwright, String(baseURL));
      owners.set(testInfo.file, owner);
    }
    await use(await owner);
  },
  storageState: async ({ staffState }, use) => {
    await use(staffState);
  },
});
export { expect } from '@playwright/test';
