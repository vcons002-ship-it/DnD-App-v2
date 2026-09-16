import { expect, test, type Page, type APIRequestContext } from '@playwright/test';
import { DM_SECRET } from './playwright.config';

async function enterPlayer(page: Page, request: APIRequestContext) {
  const response = await request.post('/api/sessions', {
    headers: { 'x-dm-passphrase': DM_SECRET },
    data: { name: 'Player interface layout' },
  });
  const { code } = await response.json();
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto(`/join?code=${code}`);
  await page.getByRole('button', { name: 'Join', exact: true }).click();
  await page.locator('.claim-row').filter({ hasText: 'Druk' }).click();
  await expect(page.locator('[data-testid="player-hud"]')).toBeVisible();
}

async function dragCorner(page: Page, name: string, dx: number, dy: number) {
  const box = (await page.getByRole('button', { name, exact: true }).boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + dx, box.y + box.height / 2 + dy, { steps: 6 });
  await page.mouse.up();
}

test('combat and chat resize independently, retain their dimensions, and collapse to compact controls', async ({ page, request }) => {
  await enterPlayer(page, request);
  const combat = page.locator('.player-combat');
  const chat = page.locator('.player-chat');
  const originalCombat = (await combat.boundingBox())!;
  expect(originalCombat.width).toBeCloseTo(320 * .85, 0);
  expect(originalCombat.height).toBeCloseTo(410 * .85, 0);
  expect((await chat.boundingBox())!.width).toBeLessThan(40);
  await expect(chat.locator('h2')).toHaveCount(0);
  await expect(chat.locator('button svg')).toHaveCount(1);

  await page.getByRole('button', { name: 'Open chat and roll log', exact: true }).click();
  const firstOpen = (await combat.boundingBox())!;
  expect(firstOpen).toEqual(originalCombat);
  const originalChat = (await chat.boundingBox())!;
  await dragCorner(page, 'Resize combat panel', -45, 35);
  const resizedCombat = (await combat.boundingBox())!;
  expect(resizedCombat.width - originalCombat.width).toBeCloseTo(45, 0);
  expect(resizedCombat.height - originalCombat.height).toBeCloseTo(35, 0);
  expect(await chat.boundingBox()).toEqual(originalChat);
  await dragCorner(page, 'Resize chat and roll log', -60, -30);
  const resizedChat = (await chat.boundingBox())!;
  expect(resizedChat.width - originalChat.width).toBeCloseTo(60, 0);
  expect(resizedChat.height - originalChat.height).toBeCloseTo(30, 0);
  expect(await combat.boundingBox()).toEqual(resizedCombat);

  await page.getByRole('button', { name: 'Collapse combat', exact: true }).click();
  await page.getByRole('button', { name: 'Collapse chat and roll log', exact: true }).click();
  await page.getByRole('button', { name: 'Open chat and roll log', exact: true }).click();
  await expect(combat).toHaveClass(/collapsed/);
  expect(await chat.boundingBox()).toEqual(resizedChat);
  await page.getByRole('button', { name: 'Expand combat', exact: true }).click();
  expect(await combat.boundingBox()).toEqual(resizedCombat);
  await page.reload();
  await expect(page.locator('[data-testid="player-hud"]')).toBeVisible();
  expect(await combat.boundingBox()).toEqual(resizedCombat);
  await page.getByRole('button', { name: 'Open chat and roll log', exact: true }).click();
  expect(await chat.boundingBox()).toEqual(resizedChat);
});

test('interface scale and exact sizes are browser-local, keyboard adjustable, resettable and viewport bounded', async ({ page, request }) => {
  await enterPlayer(page, request);
  const centerBefore = (await page.locator('.center').boundingBox())!;
  const handle = page.getByRole('button', { name: 'Resize combat panel', exact: true });
  await handle.focus();
  await handle.press('ArrowLeft');
  await handle.press('Shift+ArrowDown');
  await page.getByRole('button', { name: 'Interface settings', exact: true }).click();
  await expect(page.getByRole('spinbutton', { name: 'Combat width', exact: true })).toHaveValue('330');
  await expect(page.getByRole('spinbutton', { name: 'Combat height', exact: true })).toHaveValue('435');
  await page.getByRole('spinbutton', { name: 'Combat width', exact: true }).fill('450');
  await page.getByRole('spinbutton', { name: 'Combat width', exact: true }).press('Enter');
  await page.getByRole('spinbutton', { name: 'Chat / roll log height', exact: true }).fill('310');
  await page.getByRole('spinbutton', { name: 'Chat / roll log height', exact: true }).press('Enter');
  const slider = page.getByRole('slider', { name: 'UI scale' });
  await slider.fill('100');
  await expect(page.locator('.player-layout-options output')).toHaveText('100%');
  expect((await page.locator('.player-combat').boundingBox())!.width).toBeCloseTo(450, 0);
  const centerAfter = (await page.locator('.center').boundingBox())!;
  // Zoom affects player widgets, not the map canvas's full-width coordinate space.
  expect(centerAfter.width).toEqual(centerBefore.width);
  await page.keyboard.press('Escape');
  await expect(page.locator('.player-layout-options')).toHaveCount(0);
  await page.reload();
  await expect(page.locator('[data-testid="player-hud"]')).toBeVisible();
  expect((await page.locator('.player-combat').boundingBox())!.width).toBeCloseTo(450, 0);
  await page.getByRole('button', { name: 'Interface settings', exact: true }).click();
  await expect(page.locator('.player-layout-options output')).toHaveText('100%');
  await page.getByRole('button', { name: 'Reset interface layout', exact: true }).click();
  await expect(page.locator('.player-layout-options output')).toHaveText('85%');
  await expect(page.getByRole('spinbutton', { name: 'Combat width', exact: true })).toHaveValue('320');
  await expect(page.getByRole('spinbutton', { name: 'Chat / roll log height', exact: true })).toHaveValue('270');
  await slider.fill('115');
  await page.getByRole('spinbutton', { name: 'Combat width', exact: true }).fill('1000');
  await page.getByRole('spinbutton', { name: 'Combat width', exact: true }).press('Enter');
  await page.getByRole('spinbutton', { name: 'Combat height', exact: true }).fill('1000');
  await page.getByRole('spinbutton', { name: 'Combat height', exact: true }).press('Enter');
  await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 860, height: 560 });
  await expect(page.locator('.player-combat')).toBeInViewport();
  await expect.poll(async () => {
    const box = (await page.locator('.player-combat').boundingBox())!;
    return box.x >= 0 && box.y >= 0 && box.x + box.width <= 861 && box.y + box.height <= 561;
  }).toBe(true);
});

test('invalid saved interface preferences safely fall back within supported limits', async ({ page, request }) => {
  await page.addInitScript(() => {
    localStorage.setItem('dnd:player-layout:v1', JSON.stringify({ scale: 100, combat: { width: -100, height: 'broken' }, chat: null }));
  });
  await enterPlayer(page, request);
  await page.getByRole('button', { name: 'Interface settings', exact: true }).click();
  await expect(page.locator('.player-layout-options output')).toHaveText('115%');
  await expect(page.getByRole('spinbutton', { name: 'Combat width', exact: true })).toHaveValue('280');
  await expect(page.getByRole('spinbutton', { name: 'Combat height', exact: true })).toHaveValue('410');
  await expect(page.getByRole('spinbutton', { name: 'Chat / roll log width', exact: true })).toHaveValue('420');
});
