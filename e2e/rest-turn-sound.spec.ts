import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import { io, type Socket } from 'socket.io-client';
import type { StateSnapshot } from '../shared/types';
import { DM_SECRET, PORT } from './playwright.config';

const connections: Socket[] = [];
test.afterEach(() => connections.splice(0).forEach((socket) => socket.disconnect()));

// Disposable Playwright database only (port 4099).
async function fixture(request: APIRequestContext, page: Page, name: string) {
  const created = await request.post('/api/sessions', { headers: { 'x-dm-passphrase': DM_SECRET }, data: { name } });
  expect(created.ok()).toBeTruthy();
  const { code } = await created.json();
  const socket = io(`http://localhost:${PORT}`, { transports: ['websocket'], forceNew: true });
  connections.push(socket);
  const snapshot = async (): Promise<StateSnapshot> => {
    const result = await socket.timeout(5000).emitWithAck('join', { sessionCode: code, role: 'dm', dmPassphrase: DM_SECRET });
    expect(result.ok).toBe(true);
    return result.snapshot;
  };
  const druk = (await snapshot()).characters.find((c) => c.name === 'Druk')!;
  socket.emit('character:update', { characterId: druk.id, level: 5, maxHp: 44, curHp: 9, armorClass: 1,
    stats: { STR: 18, DEX: 10, CON: 14, INT: 10, WIS: 10, CHA: 10 },
    weapons: [{ name: 'Rest greatsword', kind: 'melee', damage: '2d6', damageType: 'slashing', attackBonus: 100 }] });
  const png = await page.evaluate(() => {
    const canvas = document.createElement('canvas'); canvas.width = 1000; canvas.height = 600;
    const ctx = canvas.getContext('2d')!; ctx.fillStyle = '#273128'; ctx.fillRect(0, 0, 1000, 600);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  const map = await (await request.post(`/api/sessions/${code}/maps`, {
    headers: { 'x-dm-passphrase': DM_SECRET }, multipart: { name: 'Camp',
      image: { name: 'camp.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') } },
  })).json();
  socket.emit('map:setActive', { mapId: map.id });
  socket.emit('fog:setLayer', { mapId: map.id, layer: 'map', enabled: false });
  socket.emit('fog:setLayer', { mapId: map.id, layer: 'tokens', enabled: false });
  socket.emit('token:spawn', { mapId: map.id, kind: 'pc', refId: druk.id, x: 300, y: 240 });
  socket.emit('monster:create', { name: 'Turn ogre', disposition: 'enemy', maxHp: 200, armorClass: 1 });
  const template = (await snapshot()).monsterTemplates.find((m) => m.name === 'Turn ogre')!;
  socket.emit('token:spawn', { mapId: map.id, kind: 'monster', refId: template.id, x: 600, y: 240 });
  const ready = await snapshot();
  return {
    code, socket, snapshot, druk,
    pc: ready.tokens.find((t) => t.kind === 'pc')!,
    ogre: ready.tokens.find((t) => t.kind === 'monster')!,
  };
}

async function openDm(page: Page, code: string) {
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.goto(`/dm?code=${code}`);
  await page.locator('input[type=password]').fill(DM_SECRET);
  await page.getByRole('button', { name: 'Rejoin as DM', exact: true }).click();
  await expect(page.locator('.konvajs-content').first()).toBeVisible();
}

test('Next turn hands the DM the creature whose turn it is — but never on join', async ({ page, request }) => {
  const f = await fixture(request, page, 'Next turn selection');
  f.socket.emit('initiative:set', { tokenId: f.pc.id, initiative: 20 });
  f.socket.emit('initiative:set', { tokenId: f.ogre.id, initiative: 10 });
  f.socket.emit('initiative:next'); // Druk
  f.socket.emit('initiative:next'); // the ogre
  await expect.poll(async () => (await f.snapshot()).activeTurnTokenId).toBe(f.ogre.id);
  // Joining mid-turn keeps an empty selection.
  await openDm(page, f.code);
  await page.getByRole('button', { name: 'Token inspector' }).click();
  await expect(page.getByRole('heading', { name: 'No token selected' })).toBeVisible();
  // A real change of turn selects the DM-run creature.
  f.socket.emit('initiative:next'); // wraps to Druk (unclaimed: DM-run too)
  f.socket.emit('initiative:next'); // the ogre again
  await expect.poll(async () => (await f.snapshot()).activeTurnTokenId).toBe(f.ogre.id);
  await expect(page.getByRole('heading', { name: 'No token selected' })).toHaveCount(0);
  await expect(page.getByRole('complementary', { name: 'Token inspector' }).getByRole('heading', { name: 'Turn ogre 1', level: 2 })).toBeVisible();
});

test('the DM rests the party from the toolbar: HP back, banner, summary', async ({ page, request }) => {
  const f = await fixture(request, page, 'Long rest');
  await openDm(page, f.code);
  await page.locator('summary', { hasText: 'Campaign' }).click();
  await page.getByRole('button', { name: '🏕 Rest ▾' }).click();
  await page.getByRole('menuitem', { name: /Long Rest/ }).click();
  await page.getByRole('button', { name: 'Confirm Long Rest' }).click();
  await expect.poll(async () => (await f.snapshot()).characters.find((c) => c.id === f.druk.id)!.curHp).toBe(44);
  await expect(page.locator('.combat-moment-rest')).toContainText('Long Rest');
  expect((await f.snapshot()).chat.at(-1)!.text).toMatch(/^🏕 Long Rest\nDruk: HP 9→44/);
});

test('a player spends Hit Dice and tunes sound in their own settings', async ({ page, request }) => {
  const f = await fixture(request, page, 'Hit dice');
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.addInitScript(() => localStorage.setItem('dnd.rollAnimOff', '1'));
  await page.goto(`/join?code=${f.code}`);
  await page.getByRole('button', { name: 'Join', exact: true }).click();
  await page.locator('.claim-row').filter({ hasText: 'Druk' }).click();
  await expect(page.locator('.compact-player-combat')).toBeVisible();
  await page.getByRole('button', { name: /^Hit Dice: 5 of 5 d12 left/ }).click(); // Druk is a Barbarian
  await page.getByRole('group', { name: 'Spend Hit Dice' }).getByLabel('Hit Dice to spend').selectOption('2');
  await page.getByRole('button', { name: /Spend 2d12/ }).click();
  await expect.poll(async () => (await f.snapshot()).characters.find((c) => c.id === f.druk.id)!.hitDiceUsed).toBe(2);
  const healed = (await f.snapshot()).characters.find((c) => c.id === f.druk.id)!.curHp;
  expect(healed).toBeGreaterThanOrEqual(9 + 6); // 2 × (d12 + 2 CON), each at least 1 + 2
  await expect(page.getByRole('button', { name: /^Hit Dice: 3 of 5/ })).toBeVisible({ timeout: 30_000 });
  expect((await f.snapshot()).rollLog.at(-1)!.label).toBe('Hit Dice');

  await page.getByRole('button', { name: 'Interface settings', exact: true }).click();
  const panel = page.locator('#player-layout-options');
  await expect(panel.getByText('Sound & dice')).toBeVisible();
  await panel.getByRole('slider', { name: 'Sound volume' }).fill('40');
  await panel.getByLabel(/Dice sounds/).uncheck();
  expect(await page.evaluate(() => [localStorage.getItem('dnd.sfxVolume'), localStorage.getItem('dnd.diceSfxOff')])).toEqual(['0.4', '1']);
  await panel.getByRole('checkbox', { name: /^Sound \(/ }).uncheck();
  expect(await page.evaluate(() => localStorage.getItem('dnd.sfxMuted'))).toBe('1');
});

test('the dice make sound from real collisions, and the toggle silences them', async ({ page, request }) => {
  test.setTimeout(120_000);
  const f = await fixture(request, page, 'Dice sound');
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.addInitScript(() => {
    const starts: { loop: boolean; at: number }[] = [];
    (window as any).__diceSound = starts;
    const start = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (...args: Parameters<AudioBufferSourceNode['start']>) {
      starts.push({ loop: this.loop, at: performance.now() });
      return start.apply(this, args);
    };
  });
  await page.goto(`/join?code=${f.code}`);
  await page.getByRole('button', { name: 'Join', exact: true }).click();
  await page.locator('.claim-row').filter({ hasText: 'Druk' }).click();
  await expect(page.locator('.compact-player-combat')).toBeVisible();
  const roll = async () => {
    await page.evaluate(() => { (window as any).__diceSound.length = 0; });
    await page.locator('.compact-player-combat').getByRole('button', { name: /Rest greatsword/ }).click();
    await expect(page.locator('.roll-reveal')).toBeVisible();
    // A live server roll (headless, software WebGL) can take a while to present.
    await expect(page.locator('.roll-reveal')).toHaveCount(0, { timeout: 30_000 });
    return page.evaluate(() => (window as any).__diceSound as { loop: boolean }[]);
  };
  const heard = await roll();
  expect(heard.filter((s) => !s.loop).length).toBeGreaterThan(0); // strikes
  expect(heard.filter((s) => s.loop).length).toBeGreaterThan(0);  // a rolling voice
  await page.evaluate(() => localStorage.setItem('dnd.diceSfxOff', '1'));
  const silent = await roll();
  expect(silent).toEqual([]);
});
