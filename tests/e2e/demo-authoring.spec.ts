import { fileURLToPath } from 'node:url';
import { test, expect } from '@playwright/test';
import { AxeBuilder } from '@axe-core/playwright';
import { loadDemoCredentials } from '../../scripts/demo-credentials.js';
import { demoAuthoringIds } from '../../fixtures/authoring.js';

test('seeded owners can inspect the fictional bilingual release and private campus map', async ({
  browser,
  baseURL,
}) => {
  const credentials = await loadDemoCredentials(
    fileURLToPath(new URL('../../.local/setup/', import.meta.url)),
    { allowCreate: false },
  );
  const himal = credentials.accounts.find((account) => account.email === 'owner@himal.svara.test')!;
  const context = await browser.newContext({
    baseURL: baseURL!,
    storageState: { cookies: [], origins: [] },
  });
  try {
    const login = await context.request.post('/api/v1/auth/login', {
      headers: { Origin: baseURL! },
      data: { email: himal.email, password: himal.password },
    });
    expect(login.status()).toBe(200);
    const page = await context.newPage();
    await page.goto(`/studio/bots/${demoAuthoringIds.admissions}/releases`);
    await expect(page.getByRole('heading', { name: 'Releases', exact: true })).toBeVisible();
    await page.getByLabel('Show releases', { exact: true }).selectOption('PUBLISHED');
    await expect(page.getByRole('heading', { name: 'Version 1', exact: true })).toBeVisible();
    await page.getByLabel('Query language', { exact: true }).selectOption('ne');
    await page
      .getByRole('textbox', { name: 'Question to inspect', exact: true })
      .fill('भर्ना कार्यालय कहाँ छ?');
    await page.getByRole('button', { name: 'Search knowledge', exact: true }).click();
    await expect(page.getByRole('region', { name: 'Knowledge results' })).toContainText('कोठा १२');
    await page.getByLabel('Content language', { exact: true }).selectOption('ne');
    await page.getByLabel('Saved slide', { exact: true }).selectOption('1');
    const preview = page.getByRole('region', { name: 'Secondary screen preview', exact: true });
    await expect
      .poll(() =>
        preview.getByRole('img').evaluate((element) => (element as HTMLImageElement).naturalWidth),
      )
      .toBe(960);
    await expect(preview.getByText('आफ्नो गन्तव्य भेट्टाउनुहोस्', { exact: true })).toBeVisible();
    await expect(
      page.getByRole('region', { name: 'Primary screen preview', exact: true }),
    ).toContainText('Not shown on this screen');
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.getByRole('link', { name: 'All bots', exact: true }).focus();
    await page.screenshot({ path: 'artifacts/screenshots/m3-seeded-campus.png', fullPage: true });
    await page.getByLabel('Query language', { exact: true }).selectOption('en');
    await page
      .getByRole('textbox', { name: 'Question to inspect', exact: true })
      .fill('tuition fee');
    await page.getByRole('button', { name: 'Search knowledge', exact: true }).click();
    await expect(page.getByRole('region', { name: 'Knowledge results' })).toContainText(
      'This detail is not in the demo information.',
    );
    await page.setViewportSize({ width: 360, height: 800 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.getByRole('link', { name: 'All bots', exact: true }).focus();
    await page.screenshot({
      path: 'artifacts/screenshots/m3-seeded-campus-mobile.png',
      fullPage: true,
    });
    expect((await context.request.get(`/api/v1/bots/${demoAuthoringIds.riverside}`)).status()).toBe(
      404,
    );
  } finally {
    await context.close();
  }
});
