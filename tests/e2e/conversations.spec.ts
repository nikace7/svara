import { AxeBuilder } from '@axe-core/playwright';
import type { APIRequestContext, Browser } from '@playwright/test';
import { pairKiosk, publishedGuide } from './guide.js';
import { test, expect } from './fixtures.js';

test('a visitor talks through a public link in English and Nepali until it is turned off', async ({
  context,
  browser,
  baseURL,
}) => {
  const guide = await publishedGuide(context.request, baseURL!);
  const created = await context.request.post('/api/v1/assistant-links', {
    headers: guide.headers,
    data: { releaseId: guide.releaseId, label: 'Open day' },
  });
  expect(created.status()).toBe(201);
  const link = (await created.json()).data as { id: string; slug: string; revision: number };

  // A separate, signed-out profile: the visitor holds only the link-bound grant.
  const visitorContext = await browser.newContext({ baseURL: baseURL! });
  const visitor = await visitorContext.newPage();
  await visitor.goto(`/assistant/${link.slug}`);
  await expect(visitor.getByRole('heading', { name: guide.name })).toBeVisible();
  await expect(visitor.getByText('Welcome to the open house.')).toBeVisible();
  // The approved FAQ question is offered; its answer is not on the page until asked.
  await expect(visitor.getByText('Room 12.')).toHaveCount(0);
  await visitor.getByRole('button', { name: 'Where is admissions?' }).click();
  const answer = visitor.locator('.conversation-answer').last();
  await expect(answer).toContainText('From this release: Room 12.');
  await expect(answer).toContainText('From: Admissions');

  await visitor.getByRole('button', { name: 'नेपाली' }).click();
  await visitor.getByLabel('आफ्नो प्रश्न लेख्नुहोस्').fill('भर्ना कहाँ छ?');
  await visitor.getByRole('button', { name: 'सोध्नुहोस्', exact: true }).click();
  await expect(visitor.locator('.conversation-answer').last()).toContainText(
    'From this release: कोठा १२।',
  );
  expect((await new AxeBuilder({ page: visitor }).analyze()).violations).toEqual([]);

  const disabled = await context.request.patch(`/api/v1/assistant-links/${link.id}`, {
    headers: guide.headers,
    data: {
      releaseId: guide.releaseId,
      label: 'Open day',
      enabled: false,
      expiresAt: null,
      expectedRevision: link.revision,
    },
  });
  expect(disabled.status()).toBe(200);
  await visitor.getByLabel('आफ्नो प्रश्न लेख्नुहोस्').fill('अझै छ?');
  await visitor.getByRole('button', { name: 'सोध्नुहोस्', exact: true }).click();
  await expect(visitor.getByText('This assistant link is no longer available.')).toBeVisible();
  await visitor.reload();
  await expect(
    visitor.getByRole('heading', { name: 'This assistant is not available' }),
  ).toBeVisible();
  await visitorContext.close();
});

test('a kiosk shows a requested slide on its display, stops a long answer and keeps a record', async ({
  page,
  context,
  browser,
  baseURL,
}) => {
  test.setTimeout(120_000);
  const guide = await publishedGuide(context.request, baseURL!, { kiosk: true });
  const lobby = await guide.device('Lobby kiosk');
  const { context: kioskContext, kiosk } = await pairKiosk(page, browser, baseURL!, lobby.name);
  const display = await kioskContext.newPage();
  await display.goto('/display');
  const override = await context.request.post(`/api/v1/devices/${lobby.id}/override`, {
    headers: guide.headers,
    data: { releaseId: guide.releaseId, minutes: 30 },
  });
  expect(override.status()).toBe(201);
  const panel = kiosk.getByRole('region', { name: 'Ask this kiosk' });
  await expect(panel).toBeVisible();
  await expect(display.locator('.device-slide')).toContainText('Campus map');

  // The model names a slide; the kiosk acknowledges it and the display follows.
  await panel.getByLabel('Type your question').fill('Please show the admissions slide');
  await panel.getByRole('button', { name: 'Ask', exact: true }).click();
  await expect(panel.getByText('Slide: applied')).toBeVisible();
  await expect(panel.locator('.conversation-answer').last()).toContainText(
    'The slide request was applied.',
  );
  await expect(display.locator('.device-slide')).toContainText('Admissions steps');
  await expect(kiosk.locator('.device-slide')).toContainText('Admissions steps');

  // Stopping a long answer ends it at once: nothing later is shown.
  await panel.getByLabel('Type your question').fill('Give me a long answer');
  await panel.getByRole('button', { name: 'Ask', exact: true }).click();
  await expect(panel.getByText('This is sentence 1 of a long answer.')).toBeVisible();
  await panel.getByRole('button', { name: 'Stop speaking' }).click();
  await expect(panel.getByText('Assistant · Interrupted')).toBeVisible();
  await kiosk.waitForTimeout(2000);
  await expect(panel.getByText('sentence 8 of a long answer')).toHaveCount(0);
  expect((await new AxeBuilder({ page: kiosk }).analyze()).violations).toEqual([]);

  // Staff see the kiosk's conversation: the slide outcome and the interrupted answer.
  await page.goto('/studio/sessions');
  await page.getByRole('row').filter({ hasText: lobby.name }).getByRole('link').first().click();
  await expect(page.getByText('Tool show_slide: APPLIED · kiosk applied it')).toBeVisible();
  await expect(page.getByText(/ANSWER · interrupted/)).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);

  // A lost network shows at once: the last complete release stays and answers pause.
  await kioskContext.setOffline(true);
  await expect(
    kiosk.getByRole('alert').filter({ hasText: 'Offline. Showing the last complete release' }),
  ).toBeVisible();
  await expect(kiosk.locator('.device-slide')).toContainText('Admissions steps');
  await expect(panel).toContainText('Answers are unavailable until this kiosk is back online.');
  await expect(panel.getByRole('button', { name: 'Ask', exact: true })).toBeHidden();
  await kioskContext.setOffline(false);
  await expect(panel.getByRole('button', { name: 'Ask', exact: true })).toBeVisible();
  await kioskContext.close();
});

test('staff test a release in the playground and see what it cited', async ({
  page,
  context,
  baseURL,
}) => {
  const guide = await publishedGuide(context.request, baseURL!);
  await page.goto('/studio/playground');
  await page.getByLabel('Bot', { exact: true }).selectOption({ label: guide.name });
  await page.getByLabel('Type your question').fill('Where is admissions?');
  await page.getByRole('button', { name: 'Ask', exact: true }).click();
  await expect(page.locator('.conversation-answer').last()).toContainText(
    'From this release: Room 12.',
  );
  await expect(page.getByText(/Answered in \d+ ms · cited Admissions/)).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test('analytics show measured live timings and keep demo results separate', async ({
  page,
  context,
  baseURL,
}) => {
  const guide = await publishedGuide(context.request, baseURL!);
  await page.goto('/studio/playground');
  await page.getByLabel('Bot', { exact: true }).selectOption({ label: guide.name });
  await page.getByLabel('Type your question').fill('Where is admissions?');
  await page.getByRole('button', { name: 'Ask', exact: true }).click();
  await expect(page.getByText(/Answered in \d+ ms/)).toBeVisible();

  await page.getByRole('link', { name: 'Analytics' }).click();
  await expect(page.getByRole('heading', { name: 'Analytics', level: 1 })).toBeVisible();
  await expect(page.getByText('Live results')).toBeVisible();
  const timing = page.getByRole('region', { name: 'Response timing' });
  // Typed questions were never recognised: unavailable, not a zero-millisecond result.
  await expect(timing.getByRole('row', { name: /Speech recognised/ })).toContainText(
    'Unavailable: nothing measured',
  );
  await expect(timing.getByRole('row', { name: /Whole answer/ })).toContainText(/samples/);
  await expect(page.getByRole('heading', { name: /^Questions · [1-9]/ })).toBeVisible();
  await page.screenshot({ path: 'artifacts/screenshots/m7-analytics-live.png', fullPage: true });

  await page.getByLabel('Results').selectOption('fixture');
  await expect(page.getByText('Demo results')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Questions · 0' })).toBeVisible();
  await expect(timing.getByRole('row', { name: /Whole answer/ })).toContainText(
    'Unavailable: nothing measured',
  );
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

/** A visitor on a public link with its own signed-out browser profile. */
async function visitorOn(browser: Browser, baseURL: string, request: APIRequestContext) {
  const guide = await publishedGuide(request, baseURL);
  const created = await request.post('/api/v1/assistant-links', {
    headers: guide.headers,
    data: { releaseId: guide.releaseId, label: 'Failures' },
  });
  const { slug } = (await created.json()).data as { slug: string };
  const context = await browser.newContext({ baseURL });
  return { context, slug };
}

test('a refused microphone and blocked audio still leave typed questions and readable answers', async ({
  context,
  browser,
  baseURL,
}) => {
  const visitor = await visitorOn(browser, baseURL!, context.request);
  await visitor.context.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = () =>
      Promise.reject(new DOMException('Permission denied', 'NotAllowedError'));
    // Autoplay refused: the audio output never starts.
    AudioContext.prototype.resume = () => new Promise<void>(() => undefined);
  });
  const page = await visitor.context.newPage();
  await page.goto(`/assistant/${visitor.slug}`);
  await page.getByRole('button', { name: 'Ask by voice' }).click();
  await expect(
    page
      .getByRole('alert')
      .filter({ hasText: 'Microphone permission was denied. Type the question instead.' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Where is admissions?' }).click();
  const answer = page.locator('.conversation-answer').last();
  await expect(answer).toContainText('From this release: Room 12.');
  await expect(answer).toContainText('Answer audio could not play; read it here.');
  // The same failures read in Nepali once the visitor switches language.
  await page.getByRole('button', { name: 'नेपाली' }).click();
  await page.getByRole('button', { name: 'बोलेर सोध्नुहोस्' }).click();
  await expect(
    page.getByRole('alert').filter({ hasText: 'माइक्रोफोन अनुमति दिइएन।' }),
  ).toBeVisible();
  await page.getByLabel('आफ्नो प्रश्न लेख्नुहोस्').fill('भर्ना कहाँ छ, कोटा बाँकी छ? quota');
  await page.getByRole('button', { name: 'सोध्नुहोस्', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'सेवाको कोटा सकियो।' })).toBeVisible();
  await visitor.context.close();
});

test('a provider failure is named, and a dropped connection reconnects with finished answers', async ({
  context,
  browser,
  baseURL,
}) => {
  const visitor = await visitorOn(browser, baseURL!, context.request);
  const page = await visitor.context.newPage();
  await page.goto(`/assistant/${visitor.slug}`);
  const ask = async (question: string) => {
    await page.getByLabel('Type your question').fill(question);
    await page.getByRole('button', { name: 'Ask', exact: true }).click();
  };
  // A question the release can answer, so it reaches the provider, which is out of quota.
  await ask('Where is admissions, if there is quota left?');
  await expect(
    page.getByRole('alert').filter({ hasText: 'The provider quota is exhausted.' }),
  ).toBeVisible();
  // The same conversation still answers once the provider does.
  await ask('Where is admissions?');
  await expect(page.locator('.conversation-answer').last()).toContainText(
    'From this release: Room 12.',
  );

  await visitor.context.setOffline(true);
  await ask('Are you still there?');
  await expect(
    page.getByRole('alert').filter({ hasText: 'The connection dropped mid-answer.' }),
  ).toBeVisible();
  await visitor.context.setOffline(false);
  await page.getByRole('button', { name: 'Reconnect' }).click();
  await expect(page.getByText('Restored from the previous conversation.')).toBeVisible();
  await expect(page.getByText('From this release: Room 12.')).toBeVisible();
  await ask('Where is admissions?');
  await expect(page.locator('.conversation-answer')).toHaveCount(2);
  await visitor.context.close();
});
