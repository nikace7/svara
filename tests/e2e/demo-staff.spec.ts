import { fileURLToPath } from 'node:url';
import { test, expect } from '@playwright/test';
import { loadDemoCredentials } from '../../scripts/demo-credentials.js';

test('generated demo credentials open each seeded role with the correct organisation controls', async ({
  browser,
  baseURL,
}) => {
  const credentials = await loadDemoCredentials(
    fileURLToPath(new URL('../../.local/setup/', import.meta.url)),
    { allowCreate: false },
  );
  for (const account of credentials.accounts) {
    const context = await browser.newContext({ baseURL: baseURL! });
    try {
      const login = await context.request.post('/api/v1/auth/login', {
        headers: { Origin: baseURL! },
        data: { email: account.email, password: account.password },
      });
      expect(login.status()).toBe(200);
      const session = (await login.json()).data;
      expect(session.identity.membership.role).toBe(account.role);
      expect(session.identity.organisation.id).toBe(account.organisationId);
      const page = await context.newPage();
      await page.goto('/studio/settings');
      await expect(
        page.getByRole('heading', { name: 'Organisation settings', exact: true }),
      ).toBeVisible();
      if (account.role === 'OWNER')
        await expect(
          page.getByRole('button', { name: 'Create invitation', exact: true }),
        ).toBeVisible();
      else {
        await expect(page.getByLabel(/^Organisation name/)).toBeDisabled();
        await expect(
          page.getByRole('button', { name: 'Create invitation', exact: true }),
        ).toHaveCount(0);
      }
      await context.request.post('/api/v1/auth/logout', {
        headers: { Origin: baseURL!, 'X-CSRF-Token': session.csrfToken },
        data: {},
      });
    } finally {
      await context.close();
    }
  }
});
