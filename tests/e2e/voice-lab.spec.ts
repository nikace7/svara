import { test, expect } from '@playwright/test';
import { AxeBuilder } from '@axe-core/playwright';

test('English/Nepali fixtures and typed fallback are explicit and accessible', async ({ page }) => {
  await page.goto('/studio/voice-lab');
  await expect(page.getByRole('heading', { name: 'Voice lab', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Run scenario', exact: true }).click();
  await expect(page.getByLabel('Answer subtitles')).toContainText('A-101');
  await expect(page.getByRole('status').filter({ hasText: 'Completed' })).toBeVisible();
  await expect(page.getByText('Text-only fixture', { exact: true })).toBeVisible();
  await page.getByLabel('Language', { exact: true }).selectOption('ne-NP');
  await expect(page.getByLabel('Answer subtitles')).not.toContainText('A-101');
  await page.getByRole('button', { name: 'Run scenario', exact: true }).click();
  await expect(page.getByLabel('Answer subtitles')).toContainText('भर्ना');
  await expect(page.getByRole('status').filter({ hasText: 'Completed' })).toBeVisible();
  await page.getByLabel('Language', { exact: true }).selectOption('en-US');
  await page.getByLabel('Typed question').fill('Where is admissions?');
  await page.getByRole('button', { name: 'Send text' }).click();
  await expect(page.getByLabel('Answer subtitles')).toContainText('Fixture mode');
  await expect(page.getByRole('status').filter({ hasText: 'Completed' })).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test('interrupt and language switching discard late output', async ({ page }) => {
  await page.goto('/studio/voice-lab');
  await page.getByLabel('Scenario', { exact: true }).selectOption('interrupt_answer');
  await page.getByRole('button', { name: 'Run scenario', exact: true }).click();
  await expect(page.getByLabel('Answer subtitles')).toContainText('A-101');
  await page.getByRole('button', { name: 'Interrupt', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Interrupted' })).toBeVisible();
  const partial = await page.getByLabel('Answer subtitles').innerText();
  await page.waitForTimeout(600);
  expect(await page.getByLabel('Answer subtitles').innerText()).toBe(partial);
  await page.getByLabel('Language', { exact: true }).selectOption('ne-NP');
  await expect(page.getByLabel('Answer subtitles')).not.toContainText('A-101');
  await page.getByRole('button', { name: 'End & clear' }).click();
  await expect(page.getByLabel('Question transcript')).toContainText('Choose a scenario');
});

test('speech failure retains readable text and quota failure stays incomplete', async ({
  page,
}) => {
  await page.goto('/studio/voice-lab');
  await page.getByLabel('Scenario', { exact: true }).selectOption('tts_failure');
  await page.getByRole('button', { name: 'Run scenario', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('speech failure');
  await expect(page.getByLabel('Answer subtitles')).toContainText('A-101');
  await page.getByLabel('Scenario', { exact: true }).selectOption('provider_quota');
  await page.getByRole('button', { name: 'Run scenario', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('quota');
});

test('speaker check uses real PCM worklet playback and mobile layout fits', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto('/studio/voice-lab');
  await page.getByRole('button', { name: 'Test speaker' }).click();
  await expect(page.getByText('Test tone completed', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({ path: 'artifacts/screenshots/m1-voice-lab-mobile.png', fullPage: true });
});

test('microphone denial offers text fallback', async ({ page }) => {
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => {
      throw new DOMException('Denied', 'NotAllowedError');
    };
  });
  await page.goto('/studio/voice-lab');
  await page.getByRole('button', { name: 'Test microphone' }).click();
  await expect(page.getByRole('alert')).toContainText('Microphone permission denied');
  await expect(page.getByRole('button', { name: 'Send text' })).toBeEnabled();
});
