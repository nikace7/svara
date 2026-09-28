import { randomUUID } from 'node:crypto';
import type { APIRequestContext, Browser, Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { emptyBotDraft } from '../../packages/contracts/src/authoring.js';

/** A published guide in the signed-in owner's workspace, built only through HTTP. A kiosk
 * guide may also show slides: a campus map first, then admissions steps. */
export async function publishedGuide(
  request: APIRequestContext,
  baseURL: string,
  options: { kiosk?: boolean } = {},
) {
  const session = (await (await request.get('/api/v1/auth/session')).json()).data;
  const headers = { Origin: baseURL, 'X-CSRF-Token': session.csrfToken as string };
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
        greeting: { en: 'Welcome to the open house.', ne: 'खुला दिवसमा स्वागत छ।' },
        fallback: { en: 'Please ask reception.', ne: 'स्वागत कक्षमा सोध्नुहोस्।' },
        ...(options.kiosk
          ? { tools: ['lookup_knowledge', 'select_reference', 'show_slide', 'get_event_schedule'] }
          : {}),
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
  if (options.kiosk) {
    const deck = await request.post('/api/v1/presentations', {
      headers,
      data: { botId: bot.id, name: 'Open house' },
    });
    expect(deck.status()).toBe(201);
    let presentation = (await deck.json()).data as { id: string; revision: number };
    for (const title of [
      { en: 'Campus map', ne: 'क्याम्पस नक्सा' },
      { en: 'Admissions steps', ne: 'भर्ना चरणहरू' },
    ]) {
      const slide = await request.post(`/api/v1/presentations/${presentation.id}/slides`, {
        headers,
        data: {
          expectedRevision: presentation.revision,
          title,
          body: { en: 'Visit room 12.', ne: 'कोठा १२ मा जानुहोस्।' },
          durationSeconds: 30,
        },
      });
      expect(slide.status()).toBe(201);
      presentation = (await (await request.get(`/api/v1/presentations/${presentation.id}`)).json())
        .data;
    }
  }
  /** Publishes the current draft again as the next version. */
  const publish = async () => {
    const current = (await (await request.get(`/api/v1/bots/${bot.id}`)).json()).data;
    const published = await request.post(`/api/v1/bots/${bot.id}/releases`, {
      headers: { ...headers, 'Idempotency-Key': randomUUID() },
      data: { expectedRevision: current.revision as number },
    });
    expect(published.status()).toBe(201);
    return (await published.json()).data.id as string;
  };
  const releaseId = await publish();
  /** Registers a device over the staff API. */
  const device = async (label = 'Lobby kiosk') => {
    const response = await request.post('/api/v1/devices', {
      headers,
      data: { name: `${label} ${randomUUID().slice(0, 6)}` },
    });
    expect(response.status()).toBe(201);
    return (await response.json()).data as { id: string; name: string; revision: number };
  };
  return { name, headers, releaseId, publish, device };
}

/** Pairs a fresh, isolated browser profile as a kiosk through the staff UI's code. */
export async function pairKiosk(staff: Page, browser: Browser, baseURL: string, name: string) {
  await staff.goto('/studio/devices');
  const row = staff.getByRole('listitem').filter({ hasText: name });
  await row.getByRole('button', { name: /^(Re-)?[Pp]air$/ }).click();
  const dialog = staff.getByRole('dialog', { name: `Pair ${name}` });
  const code = (await dialog.getByLabel('Pairing code').textContent())!.trim();
  const link = await dialog.getByRole('link').getAttribute('href');
  await dialog.getByRole('button', { name: 'Close pairing' }).click();
  const context = await browser.newContext({ baseURL });
  const kiosk = await context.newPage();
  await kiosk.goto(link!);
  await kiosk.getByLabel('Pairing code').fill(code);
  await kiosk.getByRole('button', { name: 'Pair kiosk' }).click();
  await expect(kiosk.getByRole('banner')).toContainText(name);
  await expect(kiosk.getByText('Online', { exact: true })).toBeVisible();
  return { context, kiosk };
}
