import { test, expect } from '@playwright/test';
import { DM_SECRET } from './playwright.config';

test('named conditions open their editor directly without expanding HP controls', async ({ page, request }) => {
  // Only the disposable E2E server/session is modified.
  const response = await request.post('/api/sessions', {
    headers: { 'x-dm-passphrase': DM_SECRET },
    data: { name: 'Player condition shortcut regression' },
  });
  expect(response.ok()).toBeTruthy();
  const { code } = await response.json();
  await page.setViewportSize({ width: 1366, height: 768 });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`/join?code=${code}`);
  await page.getByRole('button', { name: 'Join', exact: true }).click();
  await page.locator('.claim-row').filter({ hasText: 'Druk' }).click();

  const conditions = page.getByRole('group', { name: 'Active conditions', exact: true });
  const empty = conditions.getByRole('button', { name: /^No conditions/ });
  await expect(empty).toBeVisible();
  await empty.click();
  const editor = page.getByRole('dialog', { name: 'Conditions', exact: true });
  await expect(editor).toBeVisible();
  await expect(editor).toBeInViewport();
  await expect(editor.locator('details')).toHaveCount(0);
  await expect(page.locator('.hud-drawer')).toHaveCount(0);
  const poisonedToggle = editor.locator('.cond-grid').getByRole('button', { name: 'Poisoned', exact: true });
  await expect(poisonedToggle).toBeVisible();
  await poisonedToggle.click();
  const poisoned = conditions.getByRole('button', { name: 'Poisoned. Edit conditions', exact: true });
  await expect(poisoned).toBeVisible();
  await editor.getByRole('button', { name: 'Concentration', exact: true }).click();
  const concentration = conditions.getByRole('button', { name: 'Concentration. Edit conditions', exact: true });
  await expect(concentration).toBeVisible();
  await expect(conditions).not.toContainText('2 conditions');

  // The original empty-state trigger was replaced: focus returns to a live chip.
  await editor.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(editor).toHaveCount(0);
  await expect(poisoned).toBeFocused();
  await poisoned.press('Enter');
  await expect(poisonedToggle).toBeVisible();
  await expect(page.locator('.hud-drawer')).toHaveCount(0);
  await poisonedToggle.click();
  await expect(poisoned).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(editor).toHaveCount(0);
  await expect(concentration).toBeFocused();

  // Opening a named chip takes one click, and outside clicks dismiss the editor.
  await concentration.click();
  await expect(editor).toBeVisible();
  await page.mouse.click(650, 180);
  await expect(editor).toHaveCount(0);
  await concentration.click();
  await editor.getByRole('button', { name: 'Concentration', exact: true }).click();
  await expect(empty).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(empty).toBeFocused();
  await expect(page.locator('.hud-drawer')).toHaveCount(0);
  expect(errors).toEqual([]);
});
