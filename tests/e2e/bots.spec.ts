import { randomUUID } from 'node:crypto';
import { AxeBuilder } from '@axe-core/playwright';
import { test, expect } from './fixtures.js';

test('authors create bilingual drafts, retain translations and resolve stale edits explicitly', async ({
  page,
  context,
}) => {
  const name = `Admissions ${randomUUID().slice(0, 8)}`;
  const english = page.getByRole('tabpanel', { name: /English/ });
  const nepali = page.getByRole('tabpanel', { name: /Nepali/ });
  await page.goto('/studio/bots');
  await expect(page.getByRole('heading', { name: 'Bots', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Create bot', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel(/^Bot name/).fill(name);
  await dialog.getByRole('button', { name: 'Create draft' }).click();
  await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
  await page.getByLabel(/^Persona/).fill('A calm campus guide.');
  await page.getByRole('link', { name: 'All bots' }).click();
  await expect(page.getByRole('dialog', { name: 'Leave this draft?' })).toBeVisible();
  await page.getByRole('button', { name: 'Keep editing' }).click();
  await expect(page.getByLabel(/^Persona/)).toHaveValue('A calm campus guide.');
  await english
    .getByRole('textbox', { name: 'Greeting', exact: true })
    .fill('Welcome to our campus.');
  await english
    .getByRole('textbox', { name: 'Fallback', exact: true })
    .fill('Please ask the front desk.');
  await page.getByRole('tab', { name: /Nepali/ }).click();
  await nepali
    .getByRole('textbox', { name: 'Greeting', exact: true })
    .fill('हाम्रो क्याम्पसमा स्वागत छ।');
  await nepali
    .getByRole('textbox', { name: 'Fallback', exact: true })
    .fill('कृपया सोधपुछ कक्षमा सम्पर्क गर्नुहोस्।');
  await page.getByRole('tab', { name: /English/ }).click();
  await expect(english.getByRole('textbox', { name: 'Greeting', exact: true })).toHaveValue(
    'Welcome to our campus.',
  );
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
  await expect(nepali.getByRole('textbox', { name: 'Greeting', exact: true })).toHaveValue(
    'हाम्रो क्याम्पसमा स्वागत छ।',
  );
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.getByRole('heading', { name, exact: true }).click();
  await page.screenshot({
    path: 'artifacts/screenshots/m3-bot-editor-desktop.png',
    fullPage: true,
  });
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
  await expect(page.getByRole('status').filter({ hasText: 'Bot archived.' })).toBeVisible();
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
  await page.getByRole('heading', { name, exact: true }).click();
  await page.screenshot({ path: 'artifacts/screenshots/m3-bot-editor-mobile.png', fullPage: true });
});

test('viewers can read drafts but cannot create or save them', async ({
  context,
  browser,
  baseURL,
}) => {
  const session = (await (await context.request.get('/api/v1/auth/session')).json()).data;
  const headers = { Origin: baseURL!, 'X-CSRF-Token': session.csrfToken };
  const botResponse = await context.request.post('/api/v1/bots', {
    headers,
    data: { name: `Read only ${randomUUID().slice(0, 8)}` },
  });
  expect(botResponse.status()).toBe(201);
  const bot = (await botResponse.json()).data;
  const email = `bot-viewer-${randomUUID()}@example.test`;
  const password = `Viewer password ${randomUUID()}`;
  const invite = await context.request.post('/api/v1/members/invitations', {
    headers,
    data: { email, role: 'VIEWER' },
  });
  expect(invite.status()).toBe(201);
  const token = new URLSearchParams(new URL((await invite.json()).data.url).hash.slice(1)).get(
    'token',
  );
  const viewer = await browser.newContext({ baseURL: baseURL! });
  try {
    expect(
      (
        await viewer.request.post('/api/v1/auth/activate', {
          headers: { Origin: baseURL! },
          data: { token, password, displayName: 'Bot Viewer' },
        })
      ).status(),
    ).toBe(200);
    const login = await viewer.request.post('/api/v1/auth/login', {
      headers: { Origin: baseURL! },
      data: { email, password },
    });
    expect(login.status()).toBe(200);
    const csrf = (await login.json()).data.csrfToken;
    const page = await viewer.newPage();
    await page.goto('/studio/bots');
    await expect(page.getByRole('link', { name: bot.name, exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Create bot', exact: true })).toHaveCount(0);
    await page.getByRole('link', { name: bot.name, exact: true }).click();
    await expect(page.getByLabel(/^Persona/)).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Save draft', exact: true })).toHaveCount(0);
    const rejected = await viewer.request.patch(`/api/v1/bots/${bot.id}`, {
      headers: { Origin: baseURL!, 'X-CSRF-Token': csrf },
      data: { name: 'Denied', description: '', draft: bot.draft, expectedRevision: 1 },
    });
    expect(rejected.status()).toBe(403);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  } finally {
    await viewer.close();
  }
});
