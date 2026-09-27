import { randomUUID } from 'node:crypto';
import { AxeBuilder } from '@axe-core/playwright';
import type { APIRequestContext } from '@playwright/test';
import { emptyBotDraft } from '../../packages/contracts/src/authoring.js';
import { test, expect } from './fixtures.js';

/** Runs on tests/e2e/live-stack.ts: real API wiring, stub providers that answer from the
 * top retrieved passage. Answer text can only mention room 12 if grounding reached them. */
async function guide(request: APIRequestContext, baseURL: string, knowledge: boolean) {
  const session = (await (await request.get('/api/v1/auth/session')).json()).data;
  const headers = { Origin: baseURL, 'X-CSRF-Token': session.csrfToken };
  const name = `Live guide ${randomUUID().slice(0, 8)}`;
  const bot = (await (await request.post('/api/v1/bots', { headers, data: { name } })).json()).data;
  const saved = await request.patch(`/api/v1/bots/${bot.id}`, {
    headers,
    data: {
      name,
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
  if (!knowledge) return { name, releaseId: null };
  const created = (
    await (
      await request.post(`/api/v1/bots/${bot.id}/knowledge`, {
        headers,
        data: { title: 'Admissions', type: 'FAQ' },
      })
    ).json()
  ).data;
  const entry = await request.patch(`/api/v1/knowledge/${created.id}`, {
    headers,
    data: {
      type: 'FAQ',
      title: 'Admissions',
      question: { en: 'Where is the admissions office?', ne: 'भर्ना कार्यालय कहाँ छ?' },
      content: { en: 'Admissions is in room 12.', ne: 'भर्ना कार्यालय कोठा १२ मा छ।' },
      expectedRevision: created.revision,
    },
  });
  expect(entry.status()).toBe(200);
  const preview = await request.post(`/api/v1/bots/${bot.id}/preview`, {
    headers: { ...headers, 'Idempotency-Key': randomUUID() },
    data: { expectedRevision: (await entry.json()).data.botRevision },
  });
  expect(preview.status()).toBe(201);
  return { name, releaseId: (await preview.json()).data.id as string };
}

test('answers from the chosen release in both languages and plays the speech', async ({
  page,
  context,
  baseURL,
}) => {
  const { name, releaseId } = await guide(context.request, baseURL!, true);
  await page.goto('/studio/voice-lab');
  await expect(page.getByText('Live providers', { exact: true })).toBeVisible();
  await page.getByLabel('Bot', { exact: true }).selectOption({ label: name });
  await expect(page.getByLabel('Grounding release')).toHaveValue(releaseId!);
  await expect(page.getByText("Answers use only this release's knowledge.")).toBeVisible();

  await page.getByLabel('Typed question').fill('Where is the admissions office?');
  const turn = page.waitForRequest('**/api/v1/feasibility/turn');
  await page.getByRole('button', { name: 'Ask', exact: true }).click();
  expect((await turn).postDataJSON()).toMatchObject({ locale: 'en-US', releaseId });
  await expect(page.getByLabel('Answer subtitles')).toContainText('Admissions is in room 12.');
  await expect(page.getByRole('status').filter({ hasText: 'Completed' })).toBeVisible();
  await expect(page.getByText('Answer finished', { exact: true })).toBeVisible();

  await page.getByLabel('Language', { exact: true }).selectOption('ne-NP');
  await page.getByLabel('Typed question').fill('भर्ना कार्यालय कहाँ छ?');
  await page.getByRole('button', { name: 'Ask', exact: true }).click();
  await expect(page.getByLabel('Answer subtitles')).toContainText('भर्ना कार्यालय कोठा १२ मा छ।');
  await expect(page.getByRole('status').filter({ hasText: 'Completed' })).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test('empty, refused and failed turns stay readable on a phone', async ({
  page,
  context,
  baseURL,
}) => {
  const empty = await guide(context.request, baseURL!, false);
  const grounded = await guide(context.request, baseURL!, true);
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto('/studio/voice-lab');
  await page.getByLabel('Bot', { exact: true }).selectOption({ label: empty.name });
  await expect(page.getByText(/no saved releases/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Ask', exact: true })).toBeDisabled();

  await page.getByLabel('Bot', { exact: true }).selectOption({ label: grounded.name });
  await page.getByLabel('Typed question').fill('Is there quota left?');
  await page.getByRole('button', { name: 'Ask', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'quota' })).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: 'Failed' })).toBeVisible();

  // A release can expire between listing and asking; the refusal must say why.
  await page.route('**/api/v1/feasibility/turn', (route) =>
    route.fulfill({
      status: 410,
      json: {
        error: {
          code: 'PREVIEW_EXPIRED',
          message: 'This preview has expired. Choose another release.',
          fieldErrors: {},
          retryable: false,
        },
      },
    }),
  );
  await page.getByRole('button', { name: 'Ask', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'preview has expired' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});
