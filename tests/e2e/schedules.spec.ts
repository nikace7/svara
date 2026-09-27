import { randomUUID } from 'node:crypto';
import { AxeBuilder } from '@axe-core/playwright';
import type { APIRequestContext } from '@playwright/test';
import { emptyBotDraft } from '../../packages/contracts/src/authoring.js';
import { loadWorkspaceEnvironment } from '../../packages/config/src/server.js';
import { createDatabase } from '../../packages/database/src/index.js';
import { assertTestDatabase } from '../../packages/database/src/safety.js';
import { test, expect } from './fixtures.js';

/** A published bot and a registered kiosk in the signed-in owner's workspace. Device rows are
 * inserted directly until M4's device routes land; everything else goes through HTTP. */
async function workspace(request: APIRequestContext, baseURL: string) {
  const session = (await (await request.get('/api/v1/auth/session')).json()).data;
  const headers = { Origin: baseURL, 'X-CSRF-Token': session.csrfToken };
  const name = `Open house guide ${randomUUID().slice(0, 6)}`;
  const bot = (await (await request.post('/api/v1/bots', { headers, data: { name } })).json()).data;
  const saved = await request.patch(`/api/v1/bots/${bot.id}`, {
    headers,
    data: {
      name,
      description: '',
      expectedRevision: bot.revision,
      draft: {
        ...emptyBotDraft(),
        persona: 'Help open-house visitors.',
        greeting: { en: 'Welcome.', ne: 'स्वागत छ।' },
        fallback: { en: 'Please ask reception.', ne: 'स्वागत कक्षमा सोध्नुहोस्।' },
      },
    },
  });
  expect(saved.status()).toBe(200);
  const created = (
    await (
      await request.post(`/api/v1/bots/${bot.id}/knowledge`, {
        headers,
        data: { title: 'Admissions', type: 'FAQ' },
      })
    ).json()
  ).data;
  const entry = (
    await (
      await request.patch(`/api/v1/knowledge/${created.id}`, {
        headers,
        data: {
          type: 'FAQ',
          title: 'Admissions',
          question: { en: 'Where is admissions?', ne: 'भर्ना कहाँ छ?' },
          content: { en: 'Room 12.', ne: 'कोठा १२।' },
          expectedRevision: created.revision,
        },
      })
    ).json()
  ).data;
  const approved = await request.post(`/api/v1/knowledge/${created.id}/approval`, {
    headers,
    data: { approved: true, expectedRevision: entry.revision },
  });
  expect(approved.status()).toBe(200);
  const published = await request.post(`/api/v1/bots/${bot.id}/releases`, {
    headers: { ...headers, 'Idempotency-Key': randomUUID() },
    data: { expectedRevision: (await approved.json()).data.botRevision },
  });
  expect(published.status()).toBe(201);
  loadWorkspaceEnvironment();
  const url = process.env.TEST_DATABASE_URL ?? '';
  assertTestDatabase(url, 'test');
  const db = createDatabase(url);
  try {
    const kiosk = await db.device.create({
      data: {
        organisationId: session.identity.organisation.id,
        name: `Lobby kiosk ${randomUUID().slice(0, 6)}`,
        capabilities: { microphone: true, speaker: true, secondaryDisplay: false },
      },
    });
    return { name, kiosk: kiosk.name };
  } finally {
    await db.$disconnect();
  }
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
