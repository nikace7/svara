import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { AxeBuilder } from '@axe-core/playwright';
import { test, expect } from './fixtures.js';

test.setTimeout(60000);

test('uploads an image, shows real inspection outcomes, previews and removes media', async ({
  page,
}) => {
  const name = `स्वागत-${randomUUID().slice(0, 8)}.png`;
  await page.goto('/studio/media');
  await expect(page.getByRole('heading', { name: 'Media library', exact: true })).toBeVisible();
  await expect(page.locator('.breadcrumb strong')).toHaveText('Media library');
  await page.getByLabel('Choose media').setInputFiles({
    name,
    mimeType: 'image/png',
    buffer: await readFile('apps/worker/assets/inspection-probe.png'),
  });
  await page.getByRole('button', { name: 'Upload file', exact: true }).click();
  const card = page.getByRole('listitem').filter({ hasText: name });
  await expect(card.getByText('Ready', { exact: true })).toBeVisible({ timeout: 20000 });
  const title = card.getByRole('heading', { name, exact: true });
  await title.scrollIntoViewIfNeeded();
  expect(
    await title.evaluate((element) => {
      const bounds = element.getBoundingClientRect();
      return document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2)
        ?.textContent;
    }),
  ).toBe(name);
  await card.getByRole('button', { name: `Preview ${name}` }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('img', { name, exact: true })).toBeVisible();
  await expect
    .poll(() =>
      dialog
        .getByRole('img', { name, exact: true })
        .evaluate((element) => (element as HTMLImageElement).naturalWidth),
    )
    .toBe(32);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await dialog.getByRole('button', { name: 'Close preview' }).click();
  await expect(card.getByRole('button', { name: `Preview ${name}` })).toBeFocused();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.getByRole('button', { name: 'Refresh library' }).focus();
  await expect(page.getByRole('link', { name: 'Skip to content' })).not.toBeInViewport();
  await page.screenshot({ path: 'artifacts/screenshots/m3-media-library.png', fullPage: true });
  const bad = `Invalid-${randomUUID().slice(0, 8)}.png`;
  await page
    .getByLabel('Choose media')
    .setInputFiles({ name: bad, mimeType: 'image/png', buffer: Buffer.from('not an image') });
  await page.getByRole('button', { name: 'Upload file', exact: true }).click();
  const rejected = page.getByRole('listitem').filter({ hasText: bad });
  await expect(rejected.getByText('Rejected', { exact: true })).toBeVisible({ timeout: 20000 });
  await expect(rejected.getByRole('button', { name: /Preview/ })).toHaveCount(0);
  await expect(rejected.getByText(/genuine JPEG|could not be read/)).toBeVisible();
  await card.getByRole('button', { name: `Remove ${name}` }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Remove file', exact: true }).click();
  await expect(card).toHaveCount(0, { timeout: 15000 });
});

test('previews a real video through scoped range requests and fits a mobile screen', async ({
  page,
}) => {
  const name = `Welcome-${randomUUID().slice(0, 8)}.mp4`;
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto('/studio/media');
  await expect(page.getByRole('heading', { name: 'Media library', exact: true })).toBeVisible();
  await page.getByLabel('Choose media').setInputFiles({
    name,
    mimeType: 'video/mp4',
    buffer: await readFile('apps/worker/assets/inspection-probe.mp4'),
  });
  await page.getByRole('button', { name: 'Upload file', exact: true }).click();
  const card = page.getByRole('listitem').filter({ hasText: name });
  await expect(card.getByText('Ready', { exact: true })).toBeVisible({ timeout: 20000 });
  await page.getByLabel('Media type').selectOption('VIDEO');
  const range = page.waitForResponse(
    (response) =>
      response.url().includes('/api/v1/media/') &&
      response.url().endsWith('/content') &&
      response.status() === 206,
  );
  await card.getByRole('button', { name: `Preview ${name}` }).click();
  await range;
  const video = page.getByRole('dialog').locator('video');
  await expect
    .poll(() => video.evaluate((element) => (element as HTMLVideoElement).videoWidth))
    .toBe(32);
  await expect
    .poll(() => video.evaluate((element) => (element as HTMLVideoElement).readyState))
    .toBeGreaterThanOrEqual(2);
  await page.getByRole('dialog').getByRole('button', { name: 'Close preview' }).click();
  await expect(card.getByRole('button', { name: `Preview ${name}` })).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.getByRole('button', { name: 'Refresh library' }).focus();
  await page.screenshot({ path: 'artifacts/screenshots/m3-media-mobile.png', fullPage: true });
});
