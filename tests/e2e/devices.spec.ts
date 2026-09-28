import { AxeBuilder } from '@axe-core/playwright';
import { pairKiosk, publishedGuide } from './guide.js';
import { test, expect } from './fixtures.js';

test('two isolated kiosks, a mirrored display, a failed update and revocation', async ({
  page,
  context,
  browser,
  baseURL,
}) => {
  test.setTimeout(90_000);
  const guide = await publishedGuide(context.request, baseURL!);
  const lobby = await guide.device('Lobby kiosk');
  const hall = await guide.device('Hall kiosk');
  const a = await pairKiosk(page, browser, baseURL!, lobby.name);
  const b = await pairKiosk(page, browser, baseURL!, hall.name);
  await expect(a.kiosk.getByRole('heading', { name: 'Nothing scheduled' })).toBeVisible();

  const display = await a.context.newPage();
  await display.goto('/display');
  await expect(display.getByRole('heading', { name: 'Waiting for the kiosk' })).toBeVisible();

  const override = async (releaseId: string, replaceOverrideId: string | null = null) => {
    const response = await context.request.post(`/api/v1/devices/${lobby.id}/override`, {
      headers: guide.headers,
      data: { releaseId, minutes: 30, replaceOverrideId },
    });
    expect(response.status()).toBe(201);
    return (await response.json()).data as { id: string };
  };
  // The worker wake-up reaches only the lobby kiosk; the hall kiosk stays idle.
  const first = await override(guide.releaseId);
  await expect(a.kiosk.getByRole('heading', { name: 'Welcome to the open house.' })).toBeVisible();
  await expect(a.kiosk.getByText(`${guide.name} · v1`)).toBeVisible();
  await expect(display.getByText(`${guide.name} · v1`)).toBeVisible();
  await expect(b.kiosk.getByRole('heading', { name: 'Nothing scheduled' })).toBeVisible();

  // A failed download keeps the complete release on screen and reports REJECTED.
  const second = await guide.publish();
  await a.kiosk.route('**/api/v1/runtime/manifest**', (route) => route.abort());
  const failed = await override(second, first.id);
  await expect(
    a.kiosk.getByRole('alert').filter({ hasText: 'failed (DOWNLOAD_FAILED)' }),
  ).toBeVisible();
  await expect(a.kiosk.getByText(`${guide.name} · v1`)).toBeVisible();
  await a.kiosk.unroute('**/api/v1/runtime/manifest**');
  await override(second, failed.id);
  await expect(a.kiosk.getByText(`${guide.name} · v2`)).toBeVisible();
  await expect(display.getByText(`${guide.name} · v2`)).toBeVisible();
  const timeline = await (await context.request.get(`/api/v1/devices/${lobby.id}/timeline`)).json();
  expect(
    timeline.data.commands.map((command: { status: string }) => command.status).slice(0, 3),
  ).toEqual(['ACKNOWLEDGED', 'FAILED', 'ACKNOWLEDGED']);
  expect((await new AxeBuilder({ page: a.kiosk }).analyze()).violations).toEqual([]);

  // Revocation reaches both windows of the lobby kiosk at once; the hall kiosk is untouched.
  await page.goto('/studio/devices');
  const row = page.getByRole('listitem').filter({ hasText: lobby.name });
  await row.getByRole('button', { name: 'Revoke' }).click();
  await row.getByRole('button', { name: 'Confirm revoke' }).click();
  await expect(a.kiosk.getByText('This kiosk was unpaired or disabled by staff.')).toBeVisible();
  await expect(a.kiosk.getByRole('button', { name: 'Pair kiosk' })).toBeVisible();
  await expect(display.getByText('This kiosk was unpaired or disabled by staff.')).toBeVisible();
  await expect(b.kiosk.getByText('Online', { exact: true })).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await a.context.close();
  await b.context.close();
});
