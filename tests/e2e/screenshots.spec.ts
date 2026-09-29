/**
 * The handoff screenshot set (blueprint §17, docs/DEMO.md): `pnpm screenshots:handoff`.
 * Built only through the product's HTTP API and UI from the fictional Campus Admissions Guide
 * in fixtures/authoring.ts, on the test stack in demo mode, so every capture shows the mode it
 * really ran in. Originals are PNG; WebP delivery copies are made from them unedited.
 */
import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { test, expect } from '@playwright/test';
import type { APIRequestContext, Page } from '@playwright/test';
import { demoAuthoringBundles } from '../../fixtures/authoring.js';
import { pairKiosk } from './guide.js';

const out = 'artifacts/screenshots/handoff';
const sharp = createRequire(new URL('../../apps/worker/package.json', import.meta.url))(
  'sharp',
) as (input: string) => { webp(options: object): { toFile(path: string): Promise<unknown> } };

async function capture(page: Page, name: string) {
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: `${out}/${name}.png`, animations: 'disabled' });
  await sharp(`${out}/${name}.png`).webp({ quality: 90 }).toFile(`${out}/${name}.webp`);
}

/** The admissions guide, published once: approved bilingual knowledge, the unapproved fee
 * draft left out, and the welcome deck (text only: this stack has no media worker). */
async function campusGuide(request: APIRequestContext, baseURL: string) {
  const session = (await (await request.get('/api/v1/auth/session')).json()).data;
  const headers = { Origin: baseURL, 'X-CSRF-Token': session.csrfToken as string };
  const data = async (response: Promise<{ json(): Promise<unknown>; status(): number }>) => {
    const done = await response;
    expect(done.status()).toBeLessThan(300);
    return ((await done.json()) as { data: Record<string, unknown> & { id: string } }).data;
  };
  const guide = demoAuthoringBundles(new Uint8Array()).at(0)!.bots.at(0)!;
  const bot = await data(request.post('/api/v1/bots', { headers, data: { name: guide.name } }));
  await data(
    request.patch(`/api/v1/bots/${bot.id}`, {
      headers,
      data: {
        name: guide.name,
        description: 'Fictional demo campus.',
        expectedRevision: bot.revision,
        draft: guide.config,
      },
    }),
  );
  const entries: Record<string, string> = {};
  for (const item of guide.knowledge) {
    const created = await data(
      request.post(`/api/v1/bots/${bot.id}/knowledge`, {
        headers,
        data: { title: item.title, type: item.type },
      }),
    );
    let entry = await data(
      request.patch(`/api/v1/knowledge/${created.id}`, {
        headers,
        data: {
          title: item.title,
          type: item.type,
          question: item.question,
          content: item.content,
          expectedRevision: created.revision,
        },
      }),
    );
    if (item.approved)
      entry = await data(
        request.post(`/api/v1/knowledge/${created.id}/approval`, {
          headers,
          data: { approved: true, expectedRevision: entry.revision },
        }),
      );
    if (!item.selected)
      await data(
        request.post(`/api/v1/knowledge/${created.id}/selection`, {
          headers,
          data: { selected: false, expectedRevision: entry.revision },
        }),
      );
    entries[item.title] = created.id;
  }
  const source = guide.presentations.find((deck) => deck.selected)!;
  let deck = await data(
    request.post('/api/v1/presentations', { headers, data: { botId: bot.id, name: source.name } }),
  );
  for (const slide of source.slides) {
    await data(
      request.post(`/api/v1/presentations/${deck.id}/slides`, {
        headers,
        data: {
          expectedRevision: deck.revision,
          title: slide.title,
          body: slide.body,
          target: slide.target,
          durationSeconds: slide.durationSeconds,
        },
      }),
    );
    deck = await data(request.get(`/api/v1/presentations/${deck.id}`));
  }
  const current = await data(request.get(`/api/v1/bots/${bot.id}`));
  const release = await data(
    request.post(`/api/v1/bots/${bot.id}/releases`, {
      headers: { ...headers, 'Idempotency-Key': randomUUID() },
      data: { expectedRevision: current.revision },
    }),
  );
  return { botId: bot.id, releaseId: release.id, entries, headers, data };
}

test('captures the seven handoff screens in demo mode', async ({ browser, baseURL }) => {
  test.setTimeout(180_000);
  await mkdir(out, { recursive: true });
  const staffContext = await browser.newContext({
    baseURL: baseURL!,
    viewport: { width: 1920, height: 1200 },
  });
  const registered = await staffContext.request.post('/api/v1/auth/register', {
    headers: { Origin: baseURL! },
    data: {
      email: `demo-${randomUUID()}@example.test`,
      password: `Demo account ${randomUUID()}`,
      displayName: 'Demo Owner',
      organisationName: 'Himal Campus (fictional demo)',
    },
  });
  expect(registered.status()).toBe(201);
  const page = await staffContext.newPage();
  const guide = await campusGuide(staffContext.request, baseURL!);
  const device = await guide.data(
    staffContext.request.post('/api/v1/devices', {
      headers: guide.headers,
      data: { name: 'Lobby kiosk' },
    }),
  );
  // A second, registered but never paired device: the board must show it as such.
  await guide.data(
    staffContext.request.post('/api/v1/devices', {
      headers: guide.headers,
      data: { name: 'Library display' },
    }),
  );
  const { context: kioskContext, kiosk } = await pairKiosk(page, browser, baseURL!, 'Lobby kiosk');
  await kiosk.setViewportSize({ width: 1920, height: 1080 });
  await guide.data(
    staffContext.request.post(`/api/v1/devices/${device.id}/override`, {
      headers: guide.headers,
      data: { releaseId: guide.releaseId, minutes: 60 },
    }),
  );

  // 04: an English question, then a slide the kiosk acknowledges.
  const panel = kiosk.getByRole('region', { name: 'Ask this kiosk' });
  await expect(panel).toBeVisible();
  await panel.getByLabel('Type your question').fill('Where is the admissions office?');
  await panel.getByRole('button', { name: 'Ask', exact: true }).click();
  await expect(panel.locator('.conversation-answer').last()).toContainText('room 12');
  await panel.getByLabel('Type your question').fill('Please show the Himal Campus welcome slide.');
  await panel.getByRole('button', { name: 'Ask', exact: true }).click();
  await expect(panel.getByText('Slide: applied')).toBeVisible();
  await capture(kiosk, '04-voice-and-command');

  // 01: the fleet board: each device's desired release and what it acknowledged applying.
  await page.goto('/studio/schedule');
  await expect(page.getByText('Applied on device').first()).toBeVisible();
  await capture(page, '01-fleet-overview');

  // 02: bilingual knowledge with its approval state.
  await page.goto(`/studio/bots/${guide.botId}/knowledge/${guide.entries['Admissions office']}`);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await capture(page, '02-bilingual-knowledge');

  // 03: the slide outline and screen previews.
  await page.goto(`/studio/bots/${guide.botId}/presentation`);
  await expect(page.getByText('Welcome to Himal Campus').first()).toBeVisible();
  await capture(page, '03-presentation-editor');

  // 05: the override with the device's command history open.
  await page.goto('/studio/schedule');
  const lobby = page.getByRole('region', { name: 'Lobby kiosk' });
  await lobby.getByText('Delivery history').click();
  // The kiosk's slide command is listed as one, not as an idle release.
  await expect(lobby.locator('.schedule-timeline')).toContainText('show slide');
  await capture(page, '05-deployment-recovery');

  // 06: the kiosk conversation record with citations, the slide outcome and timings.
  await page.goto('/studio/sessions');
  await page.getByRole('row').filter({ hasText: 'Lobby kiosk' }).getByRole('link').first().click();
  await expect(page.getByText(/Tool show_slide: APPLIED/)).toBeVisible();
  await capture(page, '06-session-inspector');

  // 07: a Nepali visitor on a phone through a public link.
  const link = await guide.data(
    staffContext.request.post('/api/v1/assistant-links', {
      headers: guide.headers,
      data: { releaseId: guide.releaseId, label: 'Open day' },
    }),
  );
  const visitorContext = await browser.newContext({
    baseURL: baseURL!,
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  const visitor = await visitorContext.newPage();
  await visitor.goto(`/assistant/${link.slug as string}`);
  await visitor.getByRole('button', { name: 'नेपाली' }).click();
  // Typed, as a visitor would, rather than picking one of the suggested FAQs.
  await visitor.locator('#conversation-question').fill('भर्ना कार्यालय कहाँ छ?');
  await visitor.locator('#conversation-question').press('Enter');
  await expect(visitor.locator('.conversation-answer').last()).toContainText('कोठा १२');
  await capture(visitor, '07-visitor-mobile-nepali');

  await Promise.all([visitorContext.close(), kioskContext.close(), staffContext.close()]);
});
