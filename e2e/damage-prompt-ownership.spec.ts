import { test, expect, type Page } from '@playwright/test';
import { io, type Socket } from 'socket.io-client';
import type { StateSnapshot } from '../shared/types';
import { DM_SECRET, PORT } from './playwright.config';

const connections: Socket[] = [];
test.afterEach(() => connections.splice(0).forEach((socket) => socket.disconnect()));

// Disposable Playwright database only (port 4099). The big damage prompt is a
// "your hit" control: a player's parked damage belongs to that player, so the
// DM's map must not offer to take it — while the DM's own hits still prompt.
test('the DM prompt ignores a player-owned hit and still shows the DM\'s own', async ({ page, browser, request }) => {
  const created = await request.post('/api/sessions', {
    headers: { 'x-dm-passphrase': DM_SECRET }, data: { name: 'Prompt ownership' },
  });
  expect(created.ok()).toBeTruthy();
  const { code } = await created.json();
  const socket = io(`http://localhost:${PORT}`, { transports: ['websocket'], forceNew: true });
  connections.push(socket);
  const snapshot = async (): Promise<StateSnapshot> => {
    const result = await socket.timeout(5000).emitWithAck('join', { sessionCode: code, role: 'dm', dmPassphrase: DM_SECRET });
    expect(result.ok).toBe(true);
    return result.snapshot;
  };
  const character = (await snapshot()).characters.find((c) => c.name === 'Druk')!;
  socket.emit('character:update', { characterId: character.id, armorClass: 1, maxHp: 200, curHp: 200,
    stats: { STR: 18, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 },
    weapons: [{ name: 'Owner greatsword', kind: 'melee', damage: '2d6', damageType: 'slashing', attackBonus: 100 }] });
  socket.emit('session:setManualDamage', { manual: true });
  const png = await page.evaluate(() => {
    const canvas = document.createElement('canvas'); canvas.width = 1000; canvas.height = 600;
    const ctx = canvas.getContext('2d')!; ctx.fillStyle = '#273128'; ctx.fillRect(0, 0, 1000, 600);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  const map = await (await request.post(`/api/sessions/${code}/maps`, {
    headers: { 'x-dm-passphrase': DM_SECRET }, multipart: { name: 'Ownership fixture',
      image: { name: 'fixture.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') } },
  })).json();
  socket.emit('map:setActive', { mapId: map.id });
  socket.emit('fog:setLayer', { mapId: map.id, layer: 'map', enabled: false });
  socket.emit('fog:setLayer', { mapId: map.id, layer: 'tokens', enabled: false });
  socket.emit('token:spawn', { mapId: map.id, kind: 'pc', refId: character.id, x: 300, y: 240 });
  socket.emit('monster:create', { name: 'Ownership target', disposition: 'enemy', maxHp: 200, armorClass: 1,
    weapons: [{ name: 'DM blade', kind: 'melee', damage: '1d6', damageType: 'slashing', attackBonus: 100 }] });
  const template = (await snapshot()).monsterTemplates.find((m) => m.name === 'Ownership target')!;
  socket.emit('token:spawn', { mapId: map.id, kind: 'monster', refId: template.id, x: 600, y: 240 });
  const ready = await snapshot();
  const pc = ready.tokens.find((t) => t.kind === 'pc')!;
  const enemy = ready.tokens.find((t) => t.kind === 'monster')!;

  const quiet = (p: Page) => p.addInitScript(() => localStorage.setItem('dnd.rollAnimOff', '1'));
  await page.setViewportSize({ width: 1366, height: 900 });
  await quiet(page);
  await page.goto(`/join?code=${code}`);
  await page.getByRole('button', { name: 'Join', exact: true }).click();
  await page.locator('.claim-row').filter({ hasText: 'Druk' }).click();
  await expect(page.locator('.compact-player-combat')).toBeVisible();

  const dmContext = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  try {
    const dm = await dmContext.newPage();
    await quiet(dm);
    await dm.goto(`/dm?code=${code}`);
    await dm.locator('input[type=password]').fill(DM_SECRET);
    await dm.getByRole('button', { name: 'Rejoin as DM', exact: true }).click();
    await expect(dm.locator('.konvajs-content').first()).toBeVisible();

    // The player's hit parks damage (a natural 1 still misses; retry, never forge).
    let playerHit;
    for (let attempt = 0; attempt < 5 && !playerHit; attempt++) {
      await page.locator('.compact-player-combat').getByRole('button', { name: /Owner greatsword/ }).click();
      await expect.poll(async () => (await snapshot()).rollLog.length).toBeGreaterThan(attempt);
      playerHit = (await snapshot()).rollLog.findLast((r) => r.pending && !r.pending.done);
    }
    expect(playerHit).toBeTruthy();
    expect(playerHit!.roller).not.toBe('DM');
    await expect(page.locator('.damage-prompt-btn')).toBeVisible();
    // The DM's map offers nothing for it — no button, and the hotkey does nothing.
    await dm.waitForTimeout(500);
    await expect(dm.locator('.damage-prompt-btn')).toHaveCount(0);
    await dm.keyboard.press('Enter');
    await dm.waitForTimeout(300);
    expect((await snapshot()).rollLog.find((r) => r.id === playerHit!.id)!.pending!.done).toBeFalsy();

    // The DM's own monster hit still gets the big prompt.
    let dmHit;
    for (let attempt = 0; attempt < 5 && !dmHit; attempt++) {
      socket.emit('combat:attack', { attackerTokenId: enemy.id, targetTokenId: pc.id, weaponIndex: 0 });
      await expect.poll(async () => (await snapshot()).rollLog.filter((r) => r.roller === 'DM').length).toBeGreaterThan(attempt);
      dmHit = (await snapshot()).rollLog.findLast((r) => r.roller === 'DM' && r.pending && !r.pending.done);
    }
    expect(dmHit).toBeTruthy();
    await expect(dm.locator('.damage-prompt-btn')).toBeVisible();
  } finally {
    await dmContext.close();
  }
});
