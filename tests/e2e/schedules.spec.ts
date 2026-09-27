import { randomUUID } from 'node:crypto';
import { AxeBuilder } from '@axe-core/playwright';
import type { APIRequestContext } from '@playwright/test';
import { publishedGuide } from './guide.js';
import { test, expect } from './fixtures.js';

async function workspace(request: APIRequestContext, baseURL: string) {
  const guide = await publishedGuide(request, baseURL);
  return { name: guide.name, kiosk: (await guide.device()).name };
}

test('schedules a release, explains a conflict, overrides it and ends the override', async ({
  page,
  context,
  baseURL,
}) => {
  const { name, kiosk } = await workspace(context.request, baseURL!);
  await page.goto('/studio/schedule');
  await expect(page.getByRole('heading', { name: 'Events & Deployments' })).toBeVisible();
  const device = page.getByRole('region', { name: kiosk });
  await expect(device.getByText('Now: Idle')).toBeVisible();

  const schedule = async () => {
    await page.getByRole('button', { name: 'Schedule deployment' }).click();
    const dialog = page.getByRole('dialog', { name: 'Schedule a deployment' });
    await dialog.getByLabel('Device').selectOption({ label: kiosk });
    await dialog.getByLabel('Bot').selectOption({ label: name });
    await expect(dialog.getByLabel('Published release')).toHaveText('Version 1');
    // Starting a minute ago makes the deployment govern the device immediately.
    const starts = await dialog.getByLabel('Starts').inputValue();
    const earlier = new Date(Date.parse(`${starts}:00Z`) - 16 * 60_000).toISOString().slice(0, 16);
    await dialog.getByLabel('Starts').fill(earlier);
    await dialog.getByRole('button', { name: 'Schedule', exact: true }).click();
    return dialog;
  };
  await schedule();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(device.getByText(`Now: ${name} v1`)).toBeVisible();
  await expect(device.getByText('Waiting for device · revision 1')).toBeVisible();
  await expect(device.getByText('active', { exact: true })).toBeVisible();

  const conflict = await schedule();
  await expect(conflict.getByRole('alert')).toContainText(
    'This device already has a deployment in that time.',
  );
  await expect(conflict.getByRole('alert')).toContainText(`${name} v1:`);
  await conflict.getByRole('button', { name: 'Close schedule a deployment' }).click();

  await device.getByRole('button', { name: 'Override now' }).click();
  const override = page.getByRole('dialog', { name: `Override ${kiosk}` });
  await override.getByLabel('Bot').selectOption({ label: name });
  await override.getByLabel('Minutes').fill('15');
  await override.getByRole('button', { name: 'Start override' }).click();
  await expect(device.getByText(`Now: ${name} v1 (override)`)).toBeVisible();
  await expect(device.getByText('Waiting for device · revision 2')).toBeVisible();

  await device.getByText('Delivery history').click();
  await expect(device.getByRole('listitem').filter({ hasText: 'Revision 2' })).toContainText(
    'queued',
  );
  await expect(device.getByRole('listitem').filter({ hasText: 'Revision 1' })).toContainText(
    'superseded',
  );

  await device.getByRole('button', { name: 'End override' }).click();
  await device.getByRole('button', { name: 'Confirm end override' }).click();
  await expect(device.getByText(`Now: ${name} v1`, { exact: true })).toBeVisible();
  await expect(device.getByText('Waiting for device · revision 3')).toBeVisible();

  const scan = await new AxeBuilder({ page }).analyze();
  expect(scan.violations).toEqual([]);
});

test('adds and archives an event and fits a phone screen', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto('/studio/schedule');
  const events = page.getByRole('region', { name: 'Events', exact: true });
  const title = `Open house ${randomUUID().slice(0, 6)}`;
  await events.getByRole('button', { name: 'Add event' }).click();
  const dialog = page.getByRole('dialog', { name: 'Add an event' });
  await dialog.getByLabel('Event name').fill(title);
  await dialog.getByLabel('Venue').fill('Main hall');
  await dialog.getByRole('button', { name: 'Add event', exact: true }).click();
  await expect(events.getByRole('listitem').filter({ hasText: title })).toBeVisible();
  await expect(events.getByText('Main hall · 0 deployments')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await events.getByRole('button', { name: `Archive ${title}` }).click();
  await expect(events.getByRole('listitem').filter({ hasText: title })).toHaveCount(0);
});
