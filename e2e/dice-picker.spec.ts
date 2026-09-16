import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { io, type Socket } from 'socket.io-client';
import type { StateSnapshot } from '../shared/types';
import { DM_SECRET, PORT } from './playwright.config';

const connections: Socket[] = [];
test.afterEach(() => connections.splice(0).forEach((socket) => socket.disconnect()));

async function diceFixture(request: APIRequestContext) {
  const response = await request.post('/api/sessions', {
    headers: { 'x-dm-passphrase': DM_SECRET },
    data: { name: 'Responsive dice picker' },
  });
  expect(response.ok()).toBeTruthy();
  const { code } = await response.json();
  const socket = io(`http://localhost:${PORT}`, { transports: ['websocket'], forceNew: true });
  connections.push(socket);
  const snapshot = async (): Promise<StateSnapshot> => {
    const result = await socket.timeout(5000).emitWithAck('join', {
      sessionCode: code, role: 'dm', dmPassphrase: DM_SECRET,
    });
    expect(result.ok).toBe(true);
    return result.snapshot;
  };
  await snapshot();
  const mapResponse = await request.post(`/api/sessions/${code}/maps`, {
    headers: { 'x-dm-passphrase': DM_SECRET },
    multipart: {
      name: 'Dice test map',
      image: {
        name: 'fixture.png', mimeType: 'image/png',
        buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j9uoAAAAASUVORK5CYII=', 'base64'),
      },
    },
  });
  expect(mapResponse.ok()).toBeTruthy();
  const map = await mapResponse.json();
  socket.emit('map:setActive', { mapId: map.id });
  await snapshot();
  return { code, snapshot };
}

async function joinPlayer(page: Page, code: string) {
  await page.setViewportSize({ width: 860, height: 640 });
  await page.goto(`/join?code=${code}`);
  await page.getByRole('button', { name: 'Join', exact: true }).click();
  await page.locator('.claim-row').filter({ hasText: 'Druk' }).click();
  await expect(page.locator('.player-dice-picker')).toBeVisible();
}

test('player can cross the connected hover region into every die without the picker vanishing', async ({ page, request }) => {
  const fixture = await diceFixture(request);
  await joinPlayer(page, fixture.code);
  const picker = page.locator('.player-dice-picker');
  const trigger = picker.getByRole('button', { name: 'Roll a d20', exact: true });
  await trigger.hover();
  const options = picker.getByRole('group', { name: 'Choose a die' });
  await expect(options).toBeVisible();
  await expect(options.getByRole('button')).toHaveCount(7);
  const triggerBox = (await picker.boundingBox())!;
  // Pause inside the transparent bridge itself, rather than teleport to a die.
  await page.mouse.move(triggerBox.x + 20, triggerBox.y + triggerBox.height + 1, { steps: 6 });
  await page.waitForTimeout(300);
  await expect(options).toBeVisible();
  for (const die of ['d20', 'd12', 'd10', 'd8', 'd6', 'd4', 'd100']) {
    const box = (await options.getByRole('button', { name: die, exact: true }).boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 8 });
    await page.waitForTimeout(250);
    await expect(options).toBeVisible();
  }
  expect((await fixture.snapshot()).rollLog).toHaveLength(0);
  await options.getByRole('button', { name: 'd100', exact: true }).click();
  await expect.poll(async () => (await fixture.snapshot()).rollLog.map((entry) => entry.expr)).toEqual(['1d100']);
});

test('explicit disclosure and keyboard navigation do not accidentally quick-roll d20', async ({ page, request }) => {
  const fixture = await diceFixture(request);
  await joinPlayer(page, fixture.code);
  const picker = page.locator('.player-dice-picker');
  const disclosure = picker.getByRole('button', { name: 'More dice', exact: true });
  const options = picker.getByRole('group', { name: 'Choose a die' });
  await disclosure.click();
  await page.mouse.move(450, 320);
  await page.waitForTimeout(300);
  await expect(options).toBeVisible();
  expect((await fixture.snapshot()).rollLog).toHaveLength(0);
  await disclosure.press('ArrowDown');
  await expect(options.getByRole('button', { name: 'd20', exact: true })).toBeFocused();
  await page.keyboard.press('End');
  await expect(options.getByRole('button', { name: 'd100', exact: true })).toBeFocused();
  await page.keyboard.press('Home');
  await page.keyboard.press('ArrowRight');
  await expect(options.getByRole('button', { name: 'd12', exact: true })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await fixture.snapshot()).rollLog.map((entry) => entry.expr)).toEqual(['1d12']);
  await expect(options).toBeHidden();
  await page.locator('.roll-reveal').click();
  await disclosure.focus();
  await disclosure.press('Space');
  await expect(options).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(options).toBeHidden();
  await expect(disclosure).toBeFocused();
  expect((await fixture.snapshot()).rollLog).toHaveLength(1);
});

test('player dice choices fit narrow windows at large UI scale and remain above other panels', async ({ page, request }) => {
  await page.addInitScript(() => localStorage.setItem('dnd:player-layout:v1', JSON.stringify({ scale: 1.15 })));
  const fixture = await diceFixture(request);
  await joinPlayer(page, fixture.code);
  const picker = page.locator('.player-dice-picker');
  await picker.getByRole('button', { name: 'More dice', exact: true }).click();
  for (const viewport of [{ width: 480, height: 520 }, { width: 360, height: 420 }, { width: 850, height: 500 }]) {
    await page.setViewportSize(viewport);
    const options = picker.getByRole('group', { name: 'Choose a die' });
    await expect(options).toBeVisible();
    await expect.poll(async () => {
      const box = (await options.boundingBox())!;
      return box.x >= 0 && box.y >= 0 && box.x + box.width <= viewport.width && box.y + box.height <= viewport.height;
    }).toBe(true);
    for (const button of await options.getByRole('button').all()) await expect(button).toBeInViewport();
  }
  await page.setViewportSize({ width: 360, height: 420 });
  await picker.getByRole('button', { name: 'd4', exact: true }).click();
  await expect.poll(async () => (await fixture.snapshot()).rollLog.map((entry) => entry.expr)).toEqual(['1d4']);
});

test('DM keeps its existing bottom-right picker and direct d20 action', async ({ page, request }) => {
  const fixture = await diceFixture(request);
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto(`/dm?code=${fixture.code}`);
  await page.locator('input[type="password"]').fill(DM_SECRET);
  await page.getByRole('button', { name: 'Rejoin as DM', exact: true }).click();
  const picker = page.locator('.dice-button-overlay');
  await expect(picker).toBeVisible();
  await expect(page.locator('.player-dice-picker')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'More dice', exact: true })).toHaveCount(0);
  const stageBox = (await page.locator('.stage-wrap').boundingBox())!;
  const pickerBox = (await picker.boundingBox())!;
  const button = picker.getByRole('button', { name: 'Roll a d20', exact: true });
  const buttonBox = (await button.boundingBox())!;
  // Main centers the d20 under its wider ADV/DIS row. The whole corner
  // container is anchored bottom-right; the die itself is not right-aligned.
  expect(stageBox.x + stageBox.width - pickerBox.x - pickerBox.width).toBeLessThan(20);
  expect(stageBox.y + stageBox.height - pickerBox.y - pickerBox.height).toBeLessThan(20);
  expect(buttonBox.x + buttonBox.width / 2).toBeCloseTo(pickerBox.x + pickerBox.width / 2, 0);
  await expect(picker.locator('.dice-adv-row')).toBeVisible();
  await button.click();
  await expect.poll(async () => (await fixture.snapshot()).rollLog.map((entry) => entry.expr)).toEqual(['1d20']);
});
