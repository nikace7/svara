import { randomUUID } from 'node:crypto';
import { test as base, expect } from '@playwright/test';
import type { APIRequestContext } from '@playwright/test';

type StaffState = Awaited<ReturnType<APIRequestContext['storageState']>>;

/** One synthetic owner per worker; real credential quotas stay enabled. */
export const test = base.extend<object, { staffState: StaffState }>({
  staffState: [
    async ({ playwright }, use, worker) => {
      const baseURL = String(worker.project.use.baseURL);
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
        await use(await client.storageState());
      } finally {
        await client.dispose();
      }
    },
    { scope: 'worker' },
  ],
  storageState: async ({ staffState }, use) => {
    await use(staffState);
  },
});
export { expect } from '@playwright/test';
