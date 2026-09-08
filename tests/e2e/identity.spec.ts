import { randomUUID } from 'node:crypto';
import { test, expect } from '@playwright/test';
import { AxeBuilder } from '@axe-core/playwright';
import type { BrowserContext } from '@playwright/test';

async function register(context: BrowserContext, baseURL: string, displayName: string) {
  const input = {
    email: `journey-${randomUUID()}@example.test`,
    password: `Browser password ${randomUUID()}`,
    displayName,
    organisationName: `${displayName} Workspace`,
  };
  const response = await context.request.post(`${baseURL}/api/v1/auth/register`, {
    headers: { Origin: baseURL },
    data: input,
  });
  expect(response.status()).toBe(201);
  return { ...input, session: (await response.json()).data };
}

test('staff can create a workspace, sign out, and sign in again', async ({ page, context }) => {
  const email = `browser-${randomUUID()}@example.test`;
  const password = `Svara test ${randomUUID()}`;
  await page.goto('/studio');
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
  await page.getByRole('link', { name: 'Create a workspace' }).click();
  await page.getByLabel(/^Your name/).fill('Demo Owner');
  await page.getByLabel(/^Organisation name/).fill('Browser Studio');
  await page.getByLabel(/^Email/).fill(email);
  await page.getByLabel(/^Password/).fill(password);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.getByRole('button', { name: 'Create workspace', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Workspace overview' })).toBeVisible();
  const cookie = (await context.cookies()).find((item) => item.name === 'svara-session');
  expect(cookie?.httpOnly).toBe(true);
  await page.getByRole('link', { name: 'Settings', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Organisation settings', exact: true }),
  ).toBeVisible();
  await page.getByLabel(/^Organisation name/).fill('Browser Studio Updated');
  await page.getByRole('button', { name: 'Save organisation' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Organisation saved' })).toBeVisible();
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.getByLabel(/^Email/).fill(email);
  await page.getByLabel(/^Password/).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Workspace overview' })).toBeVisible();
  await expect(page.getByText('Browser Studio Updated', { exact: true }).first()).toBeVisible();
});

test('owner invitations, viewer restrictions, recovery and revocation work in separate browsers', async ({
  page,
  context,
  browser,
  baseURL,
}) => {
  await register(context, baseURL!, 'Invitation Owner');
  const invitee = await browser.newContext({ baseURL: baseURL! });
  const guest = await invitee.newPage();
  const email = `viewer-${randomUUID()}@example.test`;
  const password = `Viewer password ${randomUUID()}`;
  try {
    await page.goto('/studio/settings');
    await page.getByLabel('Invite email').fill(email);
    await page.getByRole('button', { name: 'Create invitation', exact: true }).click();
    const link = await page.getByLabel('Access link', { exact: true }).inputValue();
    expect(new URL(link).hash).toMatch(/^#token=/);
    await guest.goto(link);
    await expect(guest).toHaveURL(/\/activate$/);
    await guest.getByLabel(/^Your name/).fill('Invited Viewer');
    await guest.getByLabel(/^Password/).fill(password);
    await guest.getByRole('button', { name: 'Activate invitation' }).click();
    await guest.getByRole('link', { name: 'Continue to sign in' }).click();
    await guest.getByLabel(/^Email/).fill(email);
    await guest.getByLabel(/^Password/).fill(password);
    await guest.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(guest.getByRole('heading', { name: 'Workspace overview' })).toBeVisible();
    await guest.goto('/studio/settings');
    await expect(guest.getByLabel(/^Organisation name/)).toBeDisabled();
    await expect(guest.getByRole('button', { name: 'Create invitation', exact: true })).toHaveCount(
      0,
    );
    expect((await new AxeBuilder({ page: guest }).analyze()).violations).toEqual([]);
    await page.reload();
    const member = page.locator('.member-row').filter({ hasText: 'Invited Viewer' });
    await member.getByRole('button', { name: 'Create recovery link' }).click();
    const recovery = await page.getByLabel('Access link', { exact: true }).inputValue();
    await guest.goto(recovery);
    await guest.getByLabel(/^Password/).fill(`Recovered password ${randomUUID()}`);
    await guest.getByRole('button', { name: 'Update password', exact: true }).click();
    await expect(guest.getByRole('heading', { name: 'Password updated' })).toBeVisible();
    await guest.goto('/studio');
    await expect(guest).toHaveURL(/\/login$/);
    await member.getByRole('button', { name: 'Manage Invited Viewer', exact: true }).click();
    await page.getByLabel('Enable workspace access').uncheck();
    await page.getByRole('button', { name: 'Save member access' }).click();
    await expect(member.getByText('Viewer · Disabled', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Manage Invitation Owner', exact: true }).click();
    await page.getByLabel('Enable workspace access').uncheck();
    await page.getByRole('button', { name: 'Save member access' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'owner' })).toBeVisible();
    await page.getByRole('button', { name: 'Close member access' }).click();
    await page.setViewportSize({ width: 360, height: 800 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.screenshot({ path: 'artifacts/screenshots/m2-settings-mobile.png', fullPage: true });
  } finally {
    await invitee.close();
  }
});

test('existing staff can switch organisations without sharing workspace state', async ({
  page,
  context,
  browser,
  baseURL,
}) => {
  const first = await register(context, baseURL!, 'First Owner');
  const secondContext = await browser.newContext({ baseURL: baseURL! });
  try {
    const second = await register(secondContext, baseURL!, 'Second Owner');
    const response = await context.request.post('/api/v1/members/invitations', {
      headers: { Origin: baseURL!, 'X-CSRF-Token': first.session.csrfToken },
      data: { email: second.email, role: 'VIEWER' },
    });
    expect(response.status()).toBe(201);
    const token = new URL((await response.json()).data.url).hash.slice('#token='.length);
    const activation = await secondContext.request.post('/api/v1/auth/activate', {
      headers: { Origin: baseURL! },
      data: { token, displayName: second.displayName, password: second.password },
    });
    expect(activation.status()).toBe(200);
    const otherPage = await secondContext.newPage();
    await otherPage.goto('/studio/settings');
    await otherPage.getByLabel('Active workspace').selectOption({ label: 'First Owner Workspace' });
    await otherPage.getByRole('button', { name: 'Switch workspace' }).click();
    await expect(otherPage.getByRole('heading', { name: 'Workspace overview' })).toBeVisible();
    await otherPage.getByRole('link', { name: 'Settings', exact: true }).click();
    await expect(otherPage.getByLabel(/^Organisation name/)).toHaveValue('First Owner Workspace');
    await expect(otherPage.getByLabel(/^Organisation name/)).toBeDisabled();
    await page.goto('/studio/settings');
    await expect(page.getByLabel(/^Organisation name/)).toBeEnabled();
  } finally {
    await secondContext.close();
  }
});

for (const width of [360, 1440]) {
  test(`sign-in fits ${width}px and missing access links explain recovery`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/login');
    await page.evaluate(() => document.fonts.ready);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await page.screenshot({ path: `artifacts/screenshots/m2-login-${width}.png`, fullPage: true });
    await page.goto('/recover');
    await page.getByLabel(/^Password/).fill('A complete sample password');
    await page.getByRole('button', { name: 'Update password' }).click();
    await expect(
      page.getByRole('alert').filter({ hasText: 'complete invitation or recovery link' }),
    ).toBeVisible();
  });
}
