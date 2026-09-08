import { randomUUID } from 'node:crypto';
import { test, expect } from '@playwright/test';
import { AxeBuilder } from '@axe-core/playwright';

test('staff can create a workspace, sign out, and sign in again', async ({ page, context }) => {
  const email = `browser-${randomUUID()}@example.test`;
  const password = `Svara test ${randomUUID()}`;
  await page.goto('/studio');
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
  await page.getByRole('link', { name: 'Create a workspace' }).click();
  await page.getByLabel('Your name', { exact: true }).fill('Demo Owner');
  await page.getByLabel('Organisation name', { exact: true }).fill('Browser Studio');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.getByRole('button', { name: 'Create workspace', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Workspace overview' })).toBeVisible();
  const cookie = (await context.cookies()).find((item) => item.name === 'svara-session');
  expect(cookie?.httpOnly).toBe(true);
  await page.getByRole('link', { name: 'Settings', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Organisation settings', exact: true }),
  ).toBeVisible();
  await page.getByLabel('Organisation name', { exact: true }).fill('Browser Studio Updated');
  await page.getByRole('button', { name: 'Save organisation' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Organisation saved' })).toBeVisible();
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Workspace overview' })).toBeVisible();
  await expect(page.getByText('Browser Studio Updated', { exact: true }).first()).toBeVisible();
});
