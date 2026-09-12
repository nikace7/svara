import { randomUUID } from 'node:crypto';
import { AxeBuilder } from '@axe-core/playwright';
import { emptyBotDraft } from '../../packages/contracts/src/authoring.js';
import type { APIRequestContext } from '@playwright/test';
import { test, expect } from './fixtures.js';

async function draft(context: { request: APIRequestContext }, baseURL: string) {
  const session = (await (await context.request.get('/api/v1/auth/session')).json()).data;
  const headers = { Origin: baseURL, 'X-CSRF-Token': session.csrfToken };
  const created = await context.request.post('/api/v1/bots', {
    headers,
    data: { name: `Release guide ${randomUUID().slice(0, 8)}` },
  });
  expect(created.status()).toBe(201);
  const bot = (await created.json()).data;
  const saved = await context.request.patch(`/api/v1/bots/${bot.id}`, {
    headers,
    data: {
      name: bot.name,
      description: '',
      expectedRevision: bot.revision,
      draft: {
        ...emptyBotDraft(),
        persona: 'Help visitors find campus services.',
        greeting: { en: 'Welcome to campus.', ne: 'क्याम्पसमा स्वागत छ।' },
        fallback: { en: 'Please ask reception.', ne: 'स्वागत कक्षमा सोध्नुहोस्।' },
      },
    },
  });
  expect(saved.status()).toBe(200);
  return { bot: (await saved.json()).data, headers, session };
}

test('previews draft knowledge, publishes approved content and inspects the frozen version', async ({
  page,
  context,
  baseURL,
}) => {
  const { bot, headers } = await draft(context, baseURL!);
  const created = (
    await (
      await context.request.post(`/api/v1/bots/${bot.id}/knowledge`, {
        headers,
        data: { title: 'Reception', type: 'FAQ' },
      })
    ).json()
  ).data;
  const fields = {
    type: 'FAQ',
    title: 'Reception',
    question: { en: 'Where is reception?', ne: 'स्वागत कक्ष कहाँ छ?' },
    content: { en: 'Reception is in room 12.', ne: 'स्वागत कक्ष कोठा १२ मा छ।' },
  };
  const saved = (
    await (
      await context.request.patch(`/api/v1/knowledge/${created.id}`, {
        headers,
        data: { ...fields, expectedRevision: created.revision },
      })
    ).json()
  ).data;
  await page.goto(`/studio/bots/${bot.id}`);
  await page.getByRole('link', { name: 'Releases', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Releases', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Publish release', exact: true })).toBeDisabled();
  await expect(page.getByRole('link', { name: /Review knowledge/ })).toBeVisible();
  await page.getByRole('button', { name: 'Create preview', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Save preview', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Preview saved' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Preview snapshot', exact: true })).toBeVisible();
  await expect(page.getByText('Draft · For staff testing', { exact: true })).toBeVisible();
  await page.getByLabel('Query language', { exact: true }).selectOption('ne');
  await page
    .getByRole('textbox', { name: 'Question to inspect', exact: true })
    .fill('स्वागत कक्ष कहाँ छ?');
  await page.getByRole('button', { name: 'Search knowledge', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Knowledge results' })).toContainText('कोठा १२');
  const approval = await context.request.post(`/api/v1/knowledge/${created.id}/approval`, {
    headers,
    data: { expectedRevision: saved.revision, approved: true },
  });
  expect(approval.status()).toBe(200);
  await page.getByRole('button', { name: 'Recheck draft', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Publish release', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Publish release', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Publish version', exact: true })
    .click();
  await expect(page.getByRole('status').filter({ hasText: 'Version 1 saved' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Version 1', exact: true })).toBeVisible();
  const approved = (await approval.json()).data;
  expect(
    (
      await context.request.patch(`/api/v1/knowledge/${created.id}`, {
        headers,
        data: {
          ...fields,
          content: { ...fields.content, en: 'The draft moved to room 99.' },
          expectedRevision: approved.revision,
        },
      })
    ).status(),
  ).toBe(200);
  await page
    .getByRole('textbox', { name: 'Question to inspect', exact: true })
    .fill('Where is reception?');
  await page.getByRole('button', { name: 'Search knowledge', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Knowledge results' })).toContainText('room 12');
  await expect(page.getByRole('region', { name: 'Knowledge results' })).not.toContainText(
    'room 99',
  );
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.getByRole('link', { name: 'All bots', exact: true }).focus();
  await page.screenshot({ path: 'artifacts/screenshots/m3-releases.png', fullPage: true });
  await page.setViewportSize({ width: 360, height: 800 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Recheck draft', exact: true }).focus();
  await page.screenshot({ path: 'artifacts/screenshots/m3-releases-mobile.png', fullPage: true });
});

test('retries an uncertain publication with the original key and rejects a stale capture', async ({
  page,
  context,
  baseURL,
}) => {
  const { bot, headers } = await draft(context, baseURL!);
  await page.goto(`/studio/bots/${bot.id}/releases`);
  const keys: string[] = [];
  let first = true;
  await page.route(`**/api/v1/bots/${bot.id}/releases`, async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    keys.push(route.request().headers()['idempotency-key']!);
    if (first) {
      first = false;
      const response = await route.fetch();
      expect(response.status()).toBe(201);
      await route.abort();
    } else await route.continue();
  });
  await page.getByRole('button', { name: 'Publish release', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Publish version', exact: true })
    .click();
  await expect(page.getByRole('dialog').getByRole('alert')).toBeVisible();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Retry request', exact: true })
    .click();
  await expect(page.getByRole('status').filter({ hasText: 'Version 1 saved' })).toBeVisible();
  expect(keys).toHaveLength(2);
  expect(keys[0]).toBe(keys[1]);
  const list = (await (await context.request.get(`/api/v1/bots/${bot.id}/releases`)).json()).data;
  expect(list.total).toBe(1);
  expect(
    (
      await context.request.patch(`/api/v1/bots/${bot.id}`, {
        headers,
        data: {
          name: 'Changed elsewhere',
          description: bot.description,
          draft: bot.draft,
          expectedRevision: bot.revision,
        },
      })
    ).status(),
  ).toBe(200);
  await page.getByRole('button', { name: 'Publish release', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Publish version', exact: true })
    .click();
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('changed elsewhere');
  await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByRole('button', { name: 'Recheck draft', exact: true }).click();
  await expect(page.getByText('Changed elsewhere', { exact: true })).toBeVisible();
  expect(
    (await (await context.request.get(`/api/v1/bots/${bot.id}/releases`)).json()).data.total,
  ).toBe(1);
});
