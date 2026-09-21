import { expect, test, type APIRequestContext, type Locator, type Page } from '@playwright/test';
import { io, type Socket } from 'socket.io-client';
import { DM_SECRET, PORT } from './playwright.config';

const connections: Socket[] = [];
test.afterEach(() => connections.splice(0).forEach((socket) => socket.disconnect()));

async function fixture(request: APIRequestContext) {
  const response = await request.post('/api/sessions', {
    headers: { 'x-dm-passphrase': DM_SECRET }, data: { name: 'Settings placement regression' },
  });
  expect(response.ok()).toBeTruthy();
  const { code } = await response.json();
  const socket = io(`http://localhost:${PORT}`, { transports: ['websocket'], forceNew: true });
  connections.push(socket);
  const join = () => socket.timeout(5000).emitWithAck('join', { sessionCode: code, role: 'dm', dmPassphrase: DM_SECRET });
  expect((await join()).ok).toBe(true);
  const mapResponse = await request.post(`/api/sessions/${code}/maps`, {
    headers: { 'x-dm-passphrase': DM_SECRET },
    multipart: { name: 'Placement map', image: { name: 'fixture.png', mimeType: 'image/png',
      buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j9uoAAAAASUVORK5CYII=', 'base64') } },
  });
  expect(mapResponse.ok()).toBeTruthy();
  const map = await mapResponse.json();
  socket.emit('map:setActive', { mapId: map.id });
  expect((await join()).ok).toBe(true);
  return code;
}

async function unobscured(control: Locator) {
  await expect(control).toBeInViewport();
  await expect.poll(() => control.evaluate((element) => {
    const box = element.getBoundingClientRect();
    const top = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
    return top === element || !!top && element.contains(top);
  })).toBe(true);
  await control.click({ trial: true });
}

async function insideViewport(element: Locator, page: Page) {
  await expect.poll(async () => {
    const box = await element.boundingBox();
    const viewport = page.viewportSize()!;
    return !!box && box.x >= 0 && box.y >= 0 && box.x + box.width <= viewport.width + 1 && box.y + box.height <= viewport.height + 1;
  }).toBe(true);
}

for (const scale of [.70, .85, 1.15]) {
  test(`player settings and map/dice lanes remain clickable at ${Math.round(scale * 100)}% scale`, async ({ page, request }) => {
    await page.addInitScript((value) => localStorage.setItem('dnd:player-layout:v1', JSON.stringify({ scale: value })), scale);
    const code = await fixture(request);
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.goto(`/join?code=${code}`);
    await page.getByRole('button', { name: 'Join', exact: true }).click();
    await page.locator('.claim-row').filter({ hasText: 'Druk' }).click();
    const settings = page.getByRole('button', { name: 'Interface settings', exact: true });
    const moreDice = page.getByRole('button', { name: 'More dice', exact: true });
    const diceMenu = page.getByRole('group', { name: 'Choose a die' });

    for (const viewport of [
      { width: 1920, height: 1080 },
      { width: 1366, height: 768 },
      { width: 860, height: 736 },
      { width: 480, height: 900 },
      { width: 360, height: 900 },
    ]) {
      await page.setViewportSize(viewport);
      await expect(page.locator('.topbar-actions > .player-layout-controls.in-toolbar')).toBeVisible();
      await unobscured(settings);
      await unobscured(moreDice);
      await moreDice.click();
      await expect(diceMenu).toBeVisible();
      await insideViewport(diceMenu, page);
      for (const button of await diceMenu.getByRole('button').all()) await unobscured(button);
      for (const title of ['Zoom out', 'Zoom in', 'Fit to window']) await unobscured(page.getByTitle(title, { exact: true }));
      for (const name of ['2D tokens', '3D tokens']) await unobscured(page.getByRole('button', { name, exact: true }));
      // A pinned dice menu cannot cover the toolbar's settings trigger.
      await unobscured(settings);
      await settings.click();
      await expect(diceMenu).toBeHidden();
      const options = page.getByRole('region', { name: 'Interface settings', exact: true });
      await insideViewport(options, page);
      await expect(options.locator('output')).toHaveText(`${Math.round(scale * 100)}%`);
      await unobscured(page.getByRole('button', { name: 'Close interface settings', exact: true }));
      await page.keyboard.press('Escape');
      await expect(options).toHaveCount(0);
      await expect(settings).toBeFocused();
      await page.getByTitle('Zoom in', { exact: true }).click();
      await page.getByTitle('Fit to window', { exact: true }).click();
      // Narrow reserved lanes must not push a resizable combat panel offscreen.
      await insideViewport(page.getByRole('region', { name: 'Combat panel', exact: true }), page);
    }
  });
}

test('DM toolbar and original top-right map controls are unchanged', async ({ page, request }) => {
  const code = await fixture(request);
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto(`/dm?code=${code}`);
  await page.locator('input[type="password"]').fill(DM_SECRET);
  await page.getByRole('button', { name: 'Rejoin as DM', exact: true }).click();
  await expect(page.locator('.stage-controls')).toBeVisible();
  await expect(page.locator('.player-layout-controls')).toHaveCount(0);
  const stage = (await page.locator('.stage-wrap').boundingBox())!;
  const controls = (await page.locator('.stage-controls').boundingBox())!;
  expect(controls.y - stage.y).toBeCloseTo(8, 0);
  expect(stage.x + stage.width - controls.x - controls.width).toBeCloseTo(8, 0);
  await unobscured(page.getByTitle('Zoom in', { exact: true }));
});
