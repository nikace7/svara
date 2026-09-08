import { randomUUID } from 'node:crypto';
import { AxeBuilder } from '@axe-core/playwright';
import { test, expect } from './fixtures.js';

test('authors review bilingual FAQs, preserve selection approval and invalidate edited content', async ({
  page,
  context,
  baseURL,
}) => {
  const session = (await (await context.request.get('/api/v1/auth/session')).json()).data;
  const response = await context.request.post('/api/v1/bots', {
    headers: { Origin: baseURL!, 'X-CSRF-Token': session.csrfToken },
    data: { name: `Knowledge ${randomUUID().slice(0, 8)}` },
  });
  expect(response.status()).toBe(201);
  const bot = (await response.json()).data;
  await page.goto(`/studio/bots/${bot.id}`);
  await page.getByRole('link', { name: 'Knowledge', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Knowledge', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Add entry', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByLabel(/^Entry title/)
    .fill('Admissions desk');
  await page.getByRole('dialog').getByRole('button', { name: 'Create entry', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Admissions desk', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Approve entry', exact: true }).click();
  await expect(
    page.getByRole('alert').filter({ hasText: 'Complete both languages' }),
  ).toBeVisible();
  const english = page.getByRole('tabpanel', { name: /English/ });
  const nepali = page.getByRole('tabpanel', { name: /Nepali/ });
  await english
    .getByRole('textbox', { name: 'Question', exact: true })
    .fill('Where is the admissions desk?');
  await english
    .getByRole('textbox', { name: 'Answer', exact: true })
    .fill('The admissions desk is on the ground floor.');
  await page.getByRole('tab', { name: /Nepali/ }).click();
  await nepali.getByRole('textbox', { name: 'Question', exact: true }).fill('भर्ना कक्ष कहाँ छ?');
  await nepali
    .getByRole('textbox', { name: 'Answer', exact: true })
    .fill('भर्ना कक्ष भुइँतलामा छ।');
  await page.getByRole('tab', { name: /English/ }).click();
  await expect(english.getByRole('textbox', { name: 'Answer', exact: true })).toHaveValue(
    'The admissions desk is on the ground floor.',
  );
  await page.getByRole('button', { name: 'Save entry', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Entry saved' })).toBeVisible();
  await page.getByRole('button', { name: 'Approve entry', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Entry approved' })).toBeVisible();
  await page.getByRole('button', { name: 'Exclude from release', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Entry excluded' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Return to draft', exact: true })).toBeVisible();
  await english
    .getByRole('textbox', { name: 'Answer', exact: true })
    .fill('The admissions desk has moved to reception.');
  await page.getByRole('button', { name: 'Save entry', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Entry saved' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Approve entry', exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole('tab', { name: /Nepali/ }).click();
  await expect(nepali.getByRole('textbox', { name: 'Answer', exact: true })).toHaveValue(
    'भर्ना कक्ष भुइँतलामा छ।',
  );
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.getByRole('heading', { name: 'Admissions desk', exact: true }).click();
  await page.screenshot({ path: 'artifacts/screenshots/m3-knowledge-editor.png', fullPage: true });
  await page.getByRole('link', { name: 'All entries', exact: true }).click();
  await page.getByLabel('Review status').selectOption('APPROVED');
  await expect(page.getByRole('link', { name: 'Admissions desk', exact: true })).toHaveCount(0);
  await page.getByLabel('Review status').selectOption('DRAFT');
  await expect(page.getByRole('link', { name: 'Admissions desk', exact: true })).toBeVisible();
});

test('reference notes work on mobile and conflicting edits preserve local text', async ({
  page,
  context,
  baseURL,
}) => {
  const session = (await (await context.request.get('/api/v1/auth/session')).json()).data;
  const headers = { Origin: baseURL!, 'X-CSRF-Token': session.csrfToken };
  const botResponse = await context.request.post('/api/v1/bots', {
    headers,
    data: { name: `Notes ${randomUUID().slice(0, 8)}` },
  });
  expect(botResponse.status()).toBe(201);
  const bot = (await botResponse.json()).data;
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto(`/studio/bots/${bot.id}/knowledge`);
  await page.getByRole('button', { name: 'Add entry', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Entry type').selectOption('NOTE');
  await dialog.getByLabel(/^Entry title/).fill('Welcome note');
  await dialog.getByRole('button', { name: 'Create entry' }).click();
  await expect(page.getByRole('heading', { name: 'Welcome note', exact: true })).toBeVisible();
  const english = page.getByRole('tabpanel', { name: /English/ });
  const nepali = page.getByRole('tabpanel', { name: /Nepali/ });
  await expect(english.getByRole('textbox', { name: 'Question', exact: true })).toHaveCount(0);
  await english
    .getByRole('textbox', { name: 'Reference content', exact: true })
    .fill('Welcome to campus.');
  await page.getByRole('tab', { name: /Nepali/ }).click();
  await nepali
    .getByRole('textbox', { name: 'Reference content', exact: true })
    .fill('क्याम्पसमा स्वागत छ।');
  await page.getByRole('button', { name: 'Save entry', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Entry saved' })).toBeVisible();
  const id = new URL(page.url()).pathname.split('/').at(-1)!;
  const stored = (await (await context.request.get(`/api/v1/knowledge/${id}`)).json()).data;
  expect(
    (
      await context.request.patch(`/api/v1/knowledge/${id}`, {
        headers,
        data: {
          type: 'NOTE',
          title: 'Saved elsewhere',
          content: stored.content,
          question: stored.question,
          expectedRevision: stored.revision,
        },
      })
    ).status(),
  ).toBe(200);
  await page.getByLabel(/^Entry title/).fill('Local unsaved title');
  await page.getByRole('button', { name: 'Save entry', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'changed elsewhere' })).toBeVisible();
  await expect(page.getByLabel(/^Entry title/)).toHaveValue('Local unsaved title');
  await page.getByRole('button', { name: 'Load latest version' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Discard edits and load' }).click();
  await expect(page.getByLabel(/^Entry title/)).toHaveValue('Saved elsewhere');
  await page.getByRole('button', { name: 'Approve entry', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Entry approved' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.getByRole('button', { name: 'Delete entry', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete entry', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Knowledge', exact: true })).toBeVisible();
  expect((await context.request.get(`/api/v1/knowledge/${id}`)).status()).toBe(404);
});
