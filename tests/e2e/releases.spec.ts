import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
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
  await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Retry release request', exact: true }),
  ).toBeFocused();
  await expect(page.getByRole('button', { name: 'Publish release', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Retry release request', exact: true }).click();
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

test('rejects mismatched query responses and explains preview expiry while keeping saved content', async ({
  page,
  context,
  baseURL,
}) => {
  const { bot, headers } = await draft(context, baseURL!);
  const response = await context.request.post(`/api/v1/bots/${bot.id}/preview`, {
    headers: { ...headers, 'Idempotency-Key': randomUUID() },
    data: { expectedRevision: bot.revision },
  });
  expect(response.status()).toBe(201);
  const release = (await response.json()).data;
  const queryRoute = `**/api/v1/releases/${release.id}/knowledge/query`;
  await page.route(queryRoute, (route) =>
    route.fulfill({
      status: 200,
      json: {
        data: {
          releaseId: randomUUID(),
          snapshotHash: release.snapshotHash,
          locale: 'en',
          passages: [],
        },
      },
    }),
  );
  await page.goto(`/studio/bots/${bot.id}/releases`);
  await page
    .getByRole('textbox', { name: 'Question to inspect', exact: true })
    .fill('Where is reception?');
  await page.getByRole('button', { name: 'Search knowledge', exact: true }).click();
  await expect(
    page.getByRole('alert').filter({ hasText: 'did not match this saved release' }),
  ).toBeVisible();
  await expect(page.getByRole('region', { name: 'Knowledge results' })).toHaveCount(0);
  await page.unroute(queryRoute);
  await page.route(queryRoute, (route) =>
    route.fulfill({
      status: 410,
      json: { error: { code: 'PREVIEW_EXPIRED', message: 'This preview has expired.' } },
    }),
  );
  await page.getByRole('button', { name: 'Search knowledge', exact: true }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'expired for new queries' }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Search knowledge', exact: true })).toBeDisabled();
  await expect(page.getByRole('heading', { name: 'Preview snapshot', exact: true })).toBeVisible();
  await page.getByText('Bot identity & voice', { exact: true }).click();
  await expect(page.getByText('Welcome to campus.', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Create preview', exact: true })).toBeEnabled();
});

test('browses release history and frozen media with viewer access after the draft is archived', async ({
  page,
  context,
  browser,
  baseURL,
}) => {
  test.setTimeout(90000);
  const { bot, headers } = await draft(context, baseURL!);
  const filename = `Release-video-${randomUUID().slice(0, 8)}.mp4`;
  await page.goto('/studio/media');
  await page.getByLabel('Choose media').setInputFiles({
    name: filename,
    mimeType: 'video/mp4',
    buffer: await readFile('apps/worker/assets/inspection-probe.mp4'),
  });
  await page.getByRole('button', { name: 'Upload file', exact: true }).click();
  await expect(
    page.getByRole('listitem').filter({ hasText: filename }).getByText('Ready', { exact: true }),
  ).toBeVisible({ timeout: 20000 });
  const media = (
    await (await context.request.get(`/api/v1/media?search=${encodeURIComponent(filename)}`)).json()
  ).data.items[0];
  const presentation = await context.request.post('/api/v1/presentations', {
    headers,
    data: { botId: bot.id, name: 'Campus welcome' },
  });
  expect(presentation.status()).toBe(201);
  const deck = (await presentation.json()).data;
  const slide = await context.request.post(`/api/v1/presentations/${deck.id}/slides`, {
    headers,
    data: {
      expectedRevision: deck.revision,
      title: { en: 'Welcome to campus', ne: 'क्याम्पसमा स्वागत छ' },
      body: { en: 'Start at reception.', ne: 'स्वागत कक्षबाट सुरु गर्नुहोस्।' },
      mediaId: media.id,
      target: 'SECONDARY',
      durationSeconds: 12,
    },
  });
  expect(slide.status()).toBe(201);
  const savedDeck = (await slide.json()).data;
  const current = (await (await context.request.get(`/api/v1/bots/${bot.id}`)).json()).data;
  for (let version = 1; version <= 11; version++) {
    const release = await context.request.post(`/api/v1/bots/${bot.id}/releases`, {
      headers: { ...headers, 'Idempotency-Key': randomUUID() },
      data: { expectedRevision: current.revision },
    });
    expect(release.status()).toBe(201);
    expect((await release.json()).data.version).toBe(version);
  }
  expect(
    (
      await context.request.post(`/api/v1/bots/${bot.id}/preview`, {
        headers: { ...headers, 'Idempotency-Key': randomUUID() },
        data: { expectedRevision: current.revision },
      })
    ).status(),
  ).toBe(201);
  expect(
    (
      await context.request.delete(`/api/v1/presentations/${deck.id}`, {
        headers,
        data: { expectedRevision: savedDeck.revision },
      })
    ).status(),
  ).toBe(200);
  const latest = (await (await context.request.get(`/api/v1/bots/${bot.id}`)).json()).data;
  expect(
    (
      await context.request.post(`/api/v1/bots/${bot.id}/archive`, {
        headers,
        data: { expectedRevision: latest.revision, archived: true },
      })
    ).status(),
  ).toBe(200);
  const removal = await context.request.delete(`/api/v1/media/${media.id}`, {
    headers,
    data: { expectedRevision: media.revision },
  });
  expect(removal.status()).toBe(409);
  expect((await removal.json()).error.code).toBe('MEDIA_IN_USE');

  const email = `release-viewer-${randomUUID()}@example.test`;
  const password = `Release viewer ${randomUUID()}`;
  const invitation = await context.request.post('/api/v1/members/invitations', {
    headers,
    data: { email, role: 'VIEWER' },
  });
  expect(invitation.status()).toBe(201);
  const token = new URLSearchParams(new URL((await invitation.json()).data.url).hash.slice(1)).get(
    'token',
  );
  const viewer = await browser.newContext({
    baseURL: baseURL!,
    storageState: { cookies: [], origins: [] },
  });
  try {
    expect(
      (
        await viewer.request.post('/api/v1/auth/activate', {
          headers: { Origin: baseURL! },
          data: { token, password, displayName: 'Release Viewer' },
        })
      ).status(),
    ).toBe(200);
    expect(
      (
        await viewer.request.post('/api/v1/auth/login', {
          headers: { Origin: baseURL! },
          data: { email, password },
        })
      ).status(),
    ).toBe(200);
    const guest = await viewer.newPage();
    const mediaRoute = `**/api/v1/media/${media.id}/content`;
    await guest.route(mediaRoute, (route) => route.abort());
    await guest.goto(`/studio/bots/${bot.id}/releases`);
    await expect(guest.getByText(/You have view access/)).toBeVisible();
    await expect(guest.getByText(/This bot is archived/)).toBeVisible();
    for (const name of ['Publish release', 'Create preview', 'Recheck draft'])
      await expect(guest.getByRole('button', { name, exact: true })).toHaveCount(0);
    await guest.getByLabel('Show releases', { exact: true }).selectOption('PUBLISHED');
    await expect(guest.getByRole('heading', { name: 'Version 11', exact: true })).toBeVisible();
    await guest.getByRole('button', { name: 'Next', exact: true }).click();
    await expect(guest.getByRole('heading', { name: 'Version 1', exact: true })).toBeVisible();
    const primary = guest.getByRole('region', { name: 'Primary screen preview', exact: true });
    const secondary = guest.getByRole('region', { name: 'Secondary screen preview', exact: true });
    await expect(primary.getByText('Not shown on this screen')).toBeVisible();
    await expect(secondary.getByRole('alert')).toContainText('Media could not load');
    await guest.unroute(mediaRoute);
    await guest.getByRole('button', { name: 'Reload preview media', exact: true }).click();
    const video = secondary.locator('video');
    await expect
      .poll(() => video.evaluate((element) => (element as HTMLVideoElement).videoWidth))
      .toBe(32);
    expect(await video.evaluate((element) => (element as HTMLVideoElement).muted)).toBe(true);
    await video.evaluate((element) => {
      (element as HTMLVideoElement).muted = false;
    });
    await expect
      .poll(() => video.evaluate((element) => (element as HTMLVideoElement).muted))
      .toBe(true);
    await guest.getByLabel('Content language', { exact: true }).selectOption('ne');
    await expect(secondary.getByText('क्याम्पसमा स्वागत छ', { exact: true })).toBeVisible();
    await guest.getByLabel('Preview orientation', { exact: true }).selectOption('portrait');
    const dimensions = await secondary.locator('.slide-canvas').boundingBox();
    expect(dimensions!.height / dimensions!.width).toBeCloseTo(16 / 9, 1);
    await guest
      .getByRole('textbox', { name: 'Question to inspect', exact: true })
      .fill('No selected knowledge');
    await guest.getByRole('button', { name: 'Search knowledge', exact: true }).click();
    await expect(guest.getByRole('region', { name: 'Knowledge results' })).toContainText(
      'Please ask reception.',
    );
    expect((await new AxeBuilder({ page: guest }).analyze()).violations).toEqual([]);
    await guest.setViewportSize({ width: 360, height: 800 });
    expect(await guest.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await guest.getByRole('link', { name: 'All bots', exact: true }).focus();
    await guest.screenshot({
      path: 'artifacts/screenshots/m3-release-portrait.png',
      fullPage: true,
    });
    await guest.getByLabel('Show releases', { exact: true }).selectOption('PREVIEW');
    await expect(
      guest.getByRole('heading', { name: 'Preview snapshot', exact: true }),
    ).toBeVisible();
    await expect(guest.getByRole('region', { name: 'Knowledge results' })).toHaveCount(0);
  } finally {
    await viewer.close();
  }
});
