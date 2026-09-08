import { mkdir } from 'node:fs/promises';
import { test, expect } from './fixtures.js';
import { AxeBuilder } from '@axe-core/playwright';

for (const [width, height] of [
  [360, 800],
  [768, 1024],
  [1440, 900],
  [1920, 1080],
  [1080, 1920],
] as const) {
  test(`workspace fits ${width}x${height} with readable navigation`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto('/studio');
    await expect(page.getByText('All services ready', { exact: true })).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await mkdir('artifacts/screenshots', { recursive: true });
    await page.screenshot({
      path: `artifacts/screenshots/m0-overview-${width}x${height}.png`,
      fullPage: true,
    });
  });
}

test('an unavailable dependency cannot be presented as healthy', async ({ page }) => {
  await page.route('**/api/v1/health/ready', (route) =>
    route.fulfill({
      status: 503,
      json: {
        data: {
          status: 'unavailable',
          service: 'api',
          providerMode: 'fixture',
          dependencies: {
            database: 'unavailable',
            redis: 'ready',
            media: 'ready',
            worker: 'unavailable',
          },
        },
      },
    }),
  );
  await page.goto('/studio');
  await expect(page.getByText('Services need attention', { exact: true })).toBeVisible();
  await expect(page.getByText('All services ready', { exact: true })).not.toBeVisible();
  await expect(page.getByText('Unavailable', { exact: true })).toHaveCount(2);
});

test('mobile navigation traps focus and returns it to its trigger', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto('/studio');
  const trigger = page.getByRole('button', { name: 'Open navigation' });
  await trigger.focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Workspace navigation' });
  await expect(dialog).toBeVisible();
  for (let index = 0; index < 7; index++) {
    await page.keyboard.press('Tab');
    expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  }
  await page.keyboard.press('Escape');
  await expect(trigger).toBeFocused();
});
