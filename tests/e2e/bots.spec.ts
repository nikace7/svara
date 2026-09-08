import { randomUUID } from 'node:crypto';
import { AxeBuilder } from '@axe-core/playwright';
import { test, expect } from './fixtures';

test('authors create bilingual drafts, retain translations and resolve stale edits explicitly', async ({
  page,
  context,
}) => {
  const name = `Admissions ${randomUUID().slice(0, 8)}`;
  await page.goto('/studio/bots');
  await expect(page.getByRole('heading', { name: 'Bots', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Create bot', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel(/^Bot name/).fill(name);
  await dialog.getByRole('button', { name: 'Create draft' }).click();
  await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
  await page.getByLabel(/^Persona/).fill('A calm campus guide.');
  await page.getByLabel(/^Greeting/).fill('Welcome to our campus.');
  await page.getByLabel(/^Fallback/).fill('Please ask the front desk.');
  await page.getByRole('tab', { name: /Nepali/ }).click();
  await page.getByLabel(/^Greeting/).fill('हाम्रो क्याम्पसमा स्वागत छ।');
  await page.getByLabel(/^Fallback/).fill('कृपया सोधपुछ कक्षमा सम्पर्क गर्नुहोस्।');
  await page.getByRole('tab', { name: /English/ }).click();
  await expect(page.getByLabel(/^Greeting/)).toHaveValue('Welcome to our campus.');
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Draft saved' })).toBeVisible();
  const second = await context.newPage();
  try {
    await second.goto(page.url());
    await expect(second.getByLabel(/^Persona/)).toHaveValue('A calm campus guide.');
    await page.getByLabel(/^Persona/).fill('Updated in first tab.');
    await page.getByRole('button', { name: 'Save draft', exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Draft saved' })).toBeVisible();
    await second.getByLabel(/^Persona/).fill('Unsaved second-tab work.');
    await second.getByRole('button', { name: 'Save draft', exact: true }).click();
    await expect(second.getByRole('alert').filter({ hasText: 'changed elsewhere' })).toBeVisible();
    await expect(second.getByLabel(/^Persona/)).toHaveValue('Unsaved second-tab work.');
    await second.getByRole('button', { name: 'Load latest version' }).click();
    await second
      .getByRole('dialog')
      .getByRole('button', { name: 'Discard edits and load' })
      .click();
    await expect(second.getByLabel(/^Persona/)).toHaveValue('Updated in first tab.');
  } finally {
    await second.close();
  }
  await page.reload();
  await page.getByRole('tab', { name: /Nepali/ }).click();
  await expect(page.getByLabel(/^Greeting/)).toHaveValue('हाम्रो क्याम्पसमा स्वागत छ।');
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test('archive and restore preserve the draft and search works at mobile width', async ({
  page,
  context,
  baseURL,
}) => {
  const session = (await (await context.request.get('/api/v1/auth/session')).json()).data;
  const name = `Archive ${randomUUID().slice(0, 8)}`;
  const response = await context.request.post('/api/v1/bots', {
    headers: { Origin: baseURL!, 'X-CSRF-Token': session.csrfToken },
    data: { name },
  });
  expect(response.status()).toBe(201);
  const bot = (await response.json()).data;
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto(`/studio/bots/${bot.id}`);
  await page.getByRole('button', { name: 'Archive bot', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Archive bot', exact: true }).click();
  await expect(page.getByLabel(/^Persona/)).toBeDisabled();
  await page.getByRole('link', { name: 'All bots' }).click();
  await page.getByLabel('Search bots').fill(name);
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page.getByRole('link', { name, exact: true })).toHaveCount(0);
  await page.getByLabel('Include archived').check();
  await expect(page.getByRole('link', { name, exact: true })).toBeVisible();
  await page.getByRole('link', { name, exact: true }).click();
  await page.getByRole('button', { name: 'Restore bot', exact: true }).click();
  await expect(page.getByLabel(/^Persona/)).toBeEnabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});
