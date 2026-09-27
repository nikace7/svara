import { randomUUID } from 'node:crypto';
import type { APIRequestContext } from '@playwright/test';
import { expect } from '@playwright/test';
import { emptyBotDraft } from '../../packages/contracts/src/authoring.js';

/** A published guide in the signed-in owner's workspace, built only through HTTP. */
export async function publishedGuide(request: APIRequestContext, baseURL: string) {
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
  const botRevision = (await approved.json()).data.botRevision as number;
  /** Publishes the current draft again as the next version. */
  const publish = async () => {
    const published = await request.post(`/api/v1/bots/${bot.id}/releases`, {
      headers: { ...headers, 'Idempotency-Key': randomUUID() },
      data: { expectedRevision: botRevision },
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
