import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { AxeBuilder } from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { test, expect } from './fixtures.js';

async function createPresentation(page: Page, name: string) {
  await page.getByRole('button', { name: 'New presentation', exact: true }).click();
  await page.getByRole('dialog').getByLabel('Presentation name', { exact: true }).fill(name);
  await page.getByRole('dialog').getByRole('button', { name: 'Create presentation' }).click();
  await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
}

test('builds bilingual slides, previews ready media and persists complete ordering and selection', async ({
  page,
  context,
  baseURL,
}) => {
  test.setTimeout(90000);
  const session = (await (await context.request.get('/api/v1/auth/session')).json()).data;
  const headers = { Origin: baseURL!, 'X-CSRF-Token': session.csrfToken };
  const response = await context.request.post('/api/v1/bots', {
    headers,
    data: { name: `Slides ${randomUUID().slice(0, 8)}` },
  });
  expect(response.status()).toBe(201);
  const bot = (await response.json()).data;
  await page.goto(`/studio/bots/${bot.id}/presentation`);
  await expect(page.getByRole('heading', { name: 'Presentation', exact: true })).toBeVisible();
  await createPresentation(page, 'Campus welcome');
  await expect(page.getByText('Selected for this bot', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Add slide', exact: true }).click();
  await page.getByLabel('Slide title', { exact: true }).fill('Welcome to campus');
  await page.getByLabel('Slide text', { exact: true }).fill('Start your visit at reception.');
  await page.getByRole('tab', { name: 'Nepali', exact: true }).click();
  await page.getByLabel('Slide title', { exact: true }).fill('स्वागत छ');
  await page.getByLabel('Slide text', { exact: true }).fill('स्वागत कक्षबाट सुरु गर्नुहोस्।');
  await page.getByLabel('Show on', { exact: true }).selectOption('SECONDARY');
  await page.getByLabel('Duration (seconds)', { exact: true }).fill('12');
  await page.getByRole('button', { name: 'Save slide', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Slide saved' })).toBeVisible();
  await page.getByLabel('Preview language').selectOption('ne');
  await expect(
    page
      .getByRole('region', { name: 'Primary screen preview' })
      .getByText('Not shown on this screen'),
  ).toBeVisible();
  await expect(
    page
      .getByRole('region', { name: 'Secondary screen preview' })
      .getByText('स्वागत छ', { exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Add slide', exact: true }).click();
  await page.getByRole('tab', { name: 'English', exact: true }).click();
  await page.getByLabel('Slide title', { exact: true }).fill('Admissions');
  await page.getByRole('button', { name: 'Save slide', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Slide saved' })).toBeVisible();
  await page.getByRole('button', { name: 'Move slide up', exact: true }).click();
  await page.getByRole('button', { name: 'Save order', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Slide order saved' })).toBeVisible();
  await page.reload();
  const outline = page.getByRole('list', { name: 'Slide outline' });
  await expect(outline.getByRole('button').first()).toContainText('Admissions');
  await expect(outline.getByRole('button').nth(1)).toContainText('Welcome to campus');

  const filename = `Slide-${randomUUID().slice(0, 8)}.png`;
  await page.getByRole('link', { name: 'Media', exact: true }).click();
  await page.getByLabel('Choose media').setInputFiles({
    name: filename,
    mimeType: 'image/png',
    buffer: await readFile('apps/worker/assets/inspection-probe.png'),
  });
  await page.getByRole('button', { name: 'Upload file', exact: true }).click();
  await expect(
    page.getByRole('listitem').filter({ hasText: filename }).getByText('Ready', { exact: true }),
  ).toBeVisible({ timeout: 20000 });
  await page.goto(`/studio/bots/${bot.id}/presentation`);
  await page.getByRole('button', { name: 'Choose media', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: `Use ${filename}`, exact: true })
    .click();
  await page.getByRole('button', { name: 'Save slide', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Slide saved' })).toBeVisible();
  const preview = page.getByRole('region', { name: 'Primary screen preview' });
  await expect
    .poll(() =>
      preview.getByRole('img').evaluate((element) => (element as HTMLImageElement).naturalWidth),
    )
    .toBe(32);
  const media = (
    await (await context.request.get(`/api/v1/media?search=${encodeURIComponent(filename)}`)).json()
  ).data.items[0];
  const removal = await context.request.delete(`/api/v1/media/${media.id}`, {
    headers,
    data: { expectedRevision: media.revision },
  });
  expect(removal.status()).toBe(409);
  expect((await removal.json()).error.code).toBe('MEDIA_IN_USE');
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.getByRole('link', { name: 'All bots', exact: true }).focus();
  await page.screenshot({
    path: 'artifacts/screenshots/m3-presentation-editor.png',
    fullPage: true,
  });

  await createPresentation(page, 'Open house');
  await page.getByRole('button', { name: 'Use for this bot', exact: true }).click();
  await expect(page.getByText('Selected for this bot', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Open house', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Remove presentation', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Remove presentation', exact: true })
    .click();
  await expect(page.getByRole('heading', { name: 'Campus welcome', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Use for this bot', exact: true })).toBeVisible();
});

test('preserves unsaved and conflicting slide text on mobile until an explicit reload', async ({
  page,
  context,
  baseURL,
}) => {
  test.setTimeout(60000);
  const session = (await (await context.request.get('/api/v1/auth/session')).json()).data;
  const headers = { Origin: baseURL!, 'X-CSRF-Token': session.csrfToken };
  const response = await context.request.post('/api/v1/bots', {
    headers,
    data: { name: `Slide conflicts ${randomUUID().slice(0, 8)}` },
  });
  expect(response.status()).toBe(201);
  const bot = (await response.json()).data;
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto(`/studio/bots/${bot.id}/presentation`);
  await expect(page.getByRole('heading', { name: 'Presentation', exact: true })).toBeVisible();
  await createPresentation(page, 'Draft welcome');
  await page.getByRole('button', { name: 'Add slide', exact: true }).click();
  await page.getByLabel('Slide title', { exact: true }).fill('My unsaved title');
  await expect(page.getByRole('button', { name: 'Add slide', exact: true })).toBeDisabled();
  await page.getByRole('link', { name: 'Knowledge', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Leave this draft?' })).toBeVisible();
  await page.getByRole('button', { name: 'Keep editing', exact: true }).click();
  await expect(page.getByLabel('Slide title', { exact: true })).toHaveValue('My unsaved title');
  const list = (await (await context.request.get(`/api/v1/presentations?botId=${bot.id}`)).json())
    .data;
  const deck = (
    await (await context.request.get(`/api/v1/presentations/${list.items[0].id}`)).json()
  ).data;
  const slide = deck.slides[0];
  const updated = await context.request.patch(`/api/v1/slides/${slide.id}`, {
    headers,
    data: {
      expectedRevision: slide.revision,
      title: { en: 'Saved by a colleague', ne: '' },
      body: slide.body,
      mediaId: null,
      target: 'BOTH',
      durationSeconds: 10,
    },
  });
  expect(updated.status()).toBe(200);
  await page.getByRole('button', { name: 'Save slide', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText(/changed|newer|another/i);
  await expect(page.getByLabel('Slide title', { exact: true })).toHaveValue('My unsaved title');
  await page.getByRole('button', { name: 'Reload saved version', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Discard edits and reload', exact: true })
    .click();
  await expect(page.getByLabel('Slide title', { exact: true })).toHaveValue('Saved by a colleague');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.screenshot({
    path: 'artifacts/screenshots/m3-presentation-mobile.png',
    fullPage: true,
  });
});
