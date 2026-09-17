import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import { io, type Socket } from 'socket.io-client';
import type { RollEntry, StateSnapshot } from '../shared/types';
import { DM_SECRET, PORT } from './playwright.config';

const connections: Socket[] = [];
test.afterEach(() => connections.splice(0).forEach((socket) => socket.disconnect()));

// Writes only to the Playwright configuration's disposable database/server.
async function fixture(request: APIRequestContext, page: Page, role: 'dm' | 'player' = 'player') {
  const response = await request.post('/api/sessions', {
    headers: { 'x-dm-passphrase': DM_SECRET }, data: { name: 'Weapon quick-menu regression' },
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
  const initial = await snapshot();
  const character = initial.characters.find((candidate) => candidate.name === 'Druk')!;
  const weapons = [{ name: 'Longsword', kind: 'melee', damage: '1d8', versatileDamage: '1d10',
    tags: ['versatile'], attackBonus: 100, diceOnly: true }];
  const stats = { STR: 18, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 };
  socket.emit('character:update', { characterId: character.id, weapons, stats, sheetAbilities: [] });
  socket.emit('session:setManualDamage', { manual: true });
  const png = await page.evaluate(() => {
    const canvas = document.createElement('canvas'); canvas.width = 1000; canvas.height = 600;
    const context = canvas.getContext('2d')!; context.fillStyle = '#273128'; context.fillRect(0, 0, 1000, 600);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  const mapResponse = await request.post(`/api/sessions/${code}/maps`, {
    headers: { 'x-dm-passphrase': DM_SECRET }, multipart: { name: 'Weapon fixture',
      image: { name: 'fixture.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') } },
  });
  expect(mapResponse.ok()).toBeTruthy();
  const map = await mapResponse.json();
  socket.emit('map:setActive', { mapId: map.id });
  socket.emit('fog:setLayer', { mapId: map.id, layer: 'map', enabled: false });
  socket.emit('fog:setLayer', { mapId: map.id, layer: 'tokens', enabled: false });
  socket.emit('token:spawn', { mapId: map.id, kind: 'pc', refId: character.id, x: 300, y: 240 });
  for (const [name, disposition] of [['Companion', 'friendly'], ['Practice target', 'enemy']]) {
    socket.emit('monster:create', { name, disposition, maxHp: 200, armorClass: 1,
      weapons, stats, sheetAbilities: [] });
    const template = (await snapshot()).monsterTemplates.find((candidate) => candidate.name === name)!;
    socket.emit('token:spawn', { mapId: map.id, kind: 'monster', refId: template.id,
      x: disposition === 'friendly' ? 450 : 600, y: 240 });
  }
  const ready = await snapshot();
  const pc = ready.tokens.find((token) => token.kind === 'pc' && token.refId === character.id)!;
  const friend = ready.tokens.find((token) => ready.monsters.some((monster) =>
    monster.id === token.refId && monster.name.startsWith('Companion')))!;
  const foe = ready.tokens.find((token) => ready.monsters.some((monster) =>
    monster.id === token.refId && monster.name.startsWith('Practice target')))!;
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto(`/${role === 'dm' ? 'dm' : 'join'}?code=${code}`);
  if (role === 'dm') {
    await page.locator('input[type=password]').fill(DM_SECRET);
    await page.getByRole('button', { name: 'Rejoin as DM', exact: true }).click();
  } else {
    await page.getByRole('button', { name: 'Join', exact: true }).click();
    await page.locator('.claim-row').filter({ hasText: 'Druk' }).click();
  }
  await expect(page.locator('.konvajs-content')).toBeVisible();
  // Token geometry exists before the uploaded image finishes loading. Wait for
  // the map and use the actual Fit control before sampling click coordinates.
  await expect.poll(() => page.evaluate(() =>
    (window as unknown as { Konva: { stages: any[] } }).Konva.stages.some((stage) =>
      stage.find('Image').some((node: any) => node.image()?.naturalWidth === 1000)),
  )).toBe(true);
  await page.getByTitle('Fit to window', { exact: true }).click();
  const clickToken = async (id: string, button: 'left' | 'right' = 'left') => {
    // Read canvas geometry, then interact with the actual browser hit region.
    const point = await page.evaluate((tokenId) => {
      const stages = (window as unknown as { Konva: { stages: any[] } }).Konva.stages;
      const stage = stages.find((candidate) => candidate.find('.token-hit-region').length);
      const shape = stage.find('.token-hit-region').find((node: any) => node.getAttr('tokenId') === tokenId);
      const position = shape.getAbsolutePosition(), bounds = stage.container().getBoundingClientRect();
      return { x: bounds.left + position.x, y: bounds.top + position.y };
    }, id);
    await page.mouse.click(point.x, point.y, { button });
  };
  const dismissReveal = async () => {
    await expect(page.locator('.roll-reveal')).toBeVisible();
    await page.locator('.roll-reveal').click({ position: { x: 10, y: 10 } });
    await expect(page.locator('.roll-reveal')).toHaveCount(0);
  };
  await clickToken(pc.id);
  const controls = page.locator('.attack-controls');
  await expect(controls).toBeVisible();
  return { snapshot, pc, friend, foe, controls, clickToken, dismissReveal };
}

async function quickAttack(page: Page, f: Awaited<ReturnType<typeof fixture>>, dice: '1d8' | '1d10') {
  // Do not mock RNG/server mechanics: a natural 1 is a legitimate miss. Retry
  // just that outcome; the authoritative pending damage must then match UI.
  for (let attempt = 0; attempt < 5; attempt++) {
    const previous = new Set((await f.snapshot()).rollLog.map((roll) => roll.id));
    await f.clickToken(f.foe.id, 'right');
    const menu = page.locator('.floating-menu');
    const weapon = menu.getByRole('button', { name: new RegExp(`Longsword \\(${dice}\\)`) });
    await expect(weapon).toBeVisible();
    await weapon.click();
    let result: RollEntry | undefined;
    await expect.poll(async () => {
      result = (await f.snapshot()).rollLog.find((roll) => !previous.has(roll.id) && roll.label === 'Attack');
      return !!result;
    }).toBe(true);
    if (dice === '1d10') expect(result!.detail).toContain('Longsword (2H)');
    else expect(result!.detail).not.toContain('Longsword (2H)');
    await f.dismissReveal();
    if (result!.pending) {
      expect(result!.pending.dice[0].label).toBe(dice);
      const unchangedTarget = (await f.snapshot()).monsters.find((monster) => monster.id === f.foe.refId)!;
      expect(unchangedTarget.curHp).toBe(200); // Existing manual damage mode stays manual.
      return result!;
    }
    expect(result!.reveal?.outcome).toBe('fumble');
  }
  throw new Error('Five consecutive natural-1 attacks produced no damage to inspect');
}

test('2H and off-hand panel choices drive the real right-click label and server damage', async ({ request, page }) => {
  const f = await fixture(request, page);
  const twoHanded = f.controls.getByRole('button', { name: '2H', exact: true });
  const offhand = f.controls.getByRole('button', { name: 'Off-hand', exact: true });
  await expect(twoHanded).toHaveAttribute('aria-pressed', 'false');
  await twoHanded.click();
  await offhand.click();
  await expect(f.controls.getByRole('button', { name: /Longsword/ })).toContainText('1d10');
  const offhandRoll = await quickAttack(page, f, '1d10');
  expect(offhandRoll.pending!.attacker).toEqual({ kind: 'pc', refId: f.pc.refId });
  expect(offhandRoll.pending!.mods.some((mod) => mod.label === 'STR')).toBe(false);
  expect(offhandRoll.detail).toContain('Off-hand (no ability modifier');
  await twoHanded.click();
  await offhand.click();
  await expect(f.controls.getByRole('button', { name: /Longsword/ })).toContainText('1d8');
  const ordinary = await quickAttack(page, f, '1d8');
  expect(ordinary.pending!.mods).toContainEqual({ label: 'STR', value: 4 });
});

test('a friendly right-click attacker does not borrow the player character weapon choices', async ({ request, page }) => {
  const f = await fixture(request, page);
  await f.controls.getByRole('button', { name: '2H', exact: true }).click();
  await f.controls.getByRole('button', { name: 'Off-hand', exact: true }).click();
  await f.clickToken(f.friend.id);
  // The existing player console continues to act as the PC; the menu acts as
  // the selected companion. Sharing options must not conflate those attackers.
  await expect(f.controls.getByRole('button', { name: '2H', exact: true })).toHaveAttribute('aria-pressed', 'true');
  const friendRoll = await quickAttack(page, f, '1d8');
  expect(friendRoll.pending!.attacker).toEqual({ kind: 'monster', refId: f.friend.refId });
  expect(friendRoll.pending!.mods).toContainEqual({ label: 'STR', value: 4 });
  await f.clickToken(f.pc.id);
  const pcRoll = await quickAttack(page, f, '1d10');
  expect(pcRoll.pending!.attacker).toEqual({ kind: 'pc', refId: f.pc.refId });
  expect(pcRoll.pending!.mods.some((mod) => mod.label === 'STR')).toBe(false);
});

test('DM switching attackers keeps each creature options and quick-menu damage independent', async ({ request, page }) => {
  const f = await fixture(request, page, 'dm');
  const twoHanded = f.controls.getByRole('button', { name: '2H', exact: true });
  const offhand = f.controls.getByRole('button', { name: 'Off-hand', exact: true });
  await twoHanded.click();
  await offhand.click();
  await f.clickToken(f.friend.id);
  await expect(twoHanded).toHaveAttribute('aria-pressed', 'false');
  await expect(offhand).toHaveAttribute('aria-pressed', 'false');
  const friendRoll = await quickAttack(page, f, '1d8');
  expect(friendRoll.pending!.attacker?.refId).toBe(f.friend.refId);
  expect(friendRoll.pending!.mods).toContainEqual({ label: 'STR', value: 4 });
  await f.clickToken(f.pc.id);
  await expect(twoHanded).toHaveAttribute('aria-pressed', 'true');
  await expect(offhand).toHaveAttribute('aria-pressed', 'true');
  const pcRoll = await quickAttack(page, f, '1d10');
  expect(pcRoll.pending!.attacker?.refId).toBe(f.pc.refId);
  expect(pcRoll.pending!.mods.some((mod) => mod.label === 'STR')).toBe(false);
});
