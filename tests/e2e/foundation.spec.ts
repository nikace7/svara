import { test, expect } from './fixtures.js';
import { AxeBuilder } from '@axe-core/playwright';

test('overview shows actual dependency readiness and honest milestone state', async ({ page }) => {
  await page.goto('/studio');
  await expect(page.getByRole('heading', { name: 'Workspace overview' })).toBeVisible();
  await expect(page.getByText('All services ready', { exact: true })).toBeVisible();
  await expect(page.getByText('No devices paired', { exact: true })).toBeVisible();
  await expect(page.getByText('Staff access is ready', { exact: true })).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test('gallery field validation and dialog work with the keyboard and restore focus', async ({
  page,
}) => {
  await page.goto('/studio/design-system');
  await expect(page.getByRole('heading', { name: 'Component gallery' })).toBeVisible();
  await page.getByRole('button', { name: 'Validate sample' }).click();
  await expect(page.getByText('Enter a device name.')).toBeVisible();
  await page.getByLabel('Device name').fill('Lobby Kiosk');
  await page.getByRole('button', { name: 'Validate sample' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Sample validated' })).toBeVisible();
  const trigger = page.getByRole('button', { name: 'Open sample dialog' });
  await trigger.focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'A considered confirmation' });
  await expect(dialog).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(trigger).toBeFocused();
});

test('sample table search and Nepali text fit narrow screens', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto('/studio/design-system');
  await page.getByRole('textbox', { name: 'Search sample devices' }).fill('Registration');
  await expect(page.getByRole('cell', { name: 'Registration Kiosk' })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'Lobby Kiosk' })).not.toBeVisible();
  await expect(page.locator('[lang="ne"]').first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});
