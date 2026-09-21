import { test, expect, type APIRequestContext, type Locator, type Page } from '@playwright/test';
import { io, type Socket } from 'socket.io-client';
import type { RollEntry, StateSnapshot } from '../shared/types';
import { DM_SECRET, PORT } from './playwright.config';

const connections: Socket[] = [];
test.afterEach(() => connections.splice(0).forEach((socket) => socket.disconnect()));

// This fixture only writes to Playwright's disposable database on port 4099.
async function fixture(request: APIRequestContext, page: Page) {
  const response = await request.post('/api/sessions', {
    headers: { 'x-dm-passphrase': DM_SECRET }, data: { name: 'Damage roll-log regression' },
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
  const stats = { STR: 18, DEX: 10, CON: 10, INT: 18, WIS: 10, CHA: 10 };
  socket.emit('character:update', { characterId: character.id, stats, armorClass: 1, maxHp: 200, curHp: 200,
    weapons: [{ name: 'Log greatsword', kind: 'melee', damage: '2d6', damageType: 'slashing', attackBonus: 100 }],
    sheetAbilities: [{ id: 'log-flame', name: 'Log flame', type: 'feat', description: 'Single-target damage log fixture',
      roll: { kind: 'save', dice: '2d6', save: 'DEX', saveDamage: 'half', targetMode: 'single', damageType: 'fire' } }],
  });
  socket.emit('session:setManualDamage', { manual: true });
  socket.emit('session:setHideDmRolls', { hide: false });
  const png = await page.evaluate(() => {
    const canvas = document.createElement('canvas'); canvas.width = 1000; canvas.height = 600;
    const ctx = canvas.getContext('2d')!; ctx.fillStyle = '#273128'; ctx.fillRect(0, 0, 1000, 600);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  const mapResponse = await request.post(`/api/sessions/${code}/maps`, {
    headers: { 'x-dm-passphrase': DM_SECRET }, multipart: { name: 'Damage log fixture',
      image: { name: 'fixture.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') } },
  });
  expect(mapResponse.ok()).toBeTruthy();
  const map = await mapResponse.json();
  socket.emit('map:setActive', { mapId: map.id });
  socket.emit('fog:setLayer', { mapId: map.id, layer: 'map', enabled: false });
  socket.emit('fog:setLayer', { mapId: map.id, layer: 'tokens', enabled: false });
  socket.emit('token:spawn', { mapId: map.id, kind: 'pc', refId: character.id, x: 300, y: 240 });
  socket.emit('monster:create', { name: 'Log target', disposition: 'enemy', maxHp: 200, armorClass: 1, stats,
    weapons: [{ name: 'Secret blade', kind: 'melee', damage: '1d6', damageType: 'slashing', attackBonus: 100, diceOnly: true }],
  });
  const template = (await snapshot()).monsterTemplates.find((candidate) => candidate.name === 'Log target')!;
  socket.emit('token:spawn', { mapId: map.id, kind: 'monster', refId: template.id, x: 600, y: 240 });
  const ready = await snapshot();
  const pc = ready.tokens.find((token) => token.kind === 'pc' && token.refId === character.id)!;
  const target = ready.tokens.find((token) => token.kind === 'monster')!;
  await page.setViewportSize({ width: 1366, height: 900 });
  // These checks concern durable history, independent of optional roll animation.
  await page.addInitScript(() => localStorage.setItem('dnd.rollAnimOff', '1'));
  await page.goto(`/join?code=${code}`);
  await page.getByRole('button', { name: 'Join', exact: true }).click();
  await page.locator('.claim-row').filter({ hasText: 'Druk' }).click();
  await expect(page.locator('.compact-player-combat')).toBeVisible();
  return { code, socket, snapshot, character, pc, target };
}

async function playerAttack(page: Page, f: Awaited<ReturnType<typeof fixture>>, manual: boolean) {
  // Preserve real server RNG. Natural 1 remains a miss, so retry that outcome.
  for (let attempt = 0; attempt < 5; attempt++) {
    const previous = new Set((await f.snapshot()).rollLog.map((entry) => entry.id));
    await page.locator('.compact-player-combat').getByRole('button', { name: /Log greatsword/ }).click();
    let result: RollEntry | undefined;
    await expect.poll(async () => {
      result = (await f.snapshot()).rollLog.find((entry) => !previous.has(entry.id) && entry.label === 'Attack');
      return !!result;
    }).toBe(true);
    if (manual ? !!result!.pending : (result!.reveal?.damage ?? 0) > 0) return result!;
    expect(result!.reveal?.outcome).toBe('fumble');
  }
  throw new Error('Five consecutive natural-1 attacks produced no damage to inspect');
}

async function expectRecordedDamage(node: Locator, entry: RollEntry, includeLabels = true) {
  await expect(node).toBeVisible();
  await expect(node).toContainText('Damage:');
  const reveal = entry.reveal!;
  for (const step of reveal.damageDice ?? []) {
    await expect(node).toContainText(step.label);
    if (step.faces?.length) await expect(node).toContainText(`[${step.faces.join(', ')}]`);
  }
  if (includeLabels) for (const step of reveal.damageMods ?? []) {
    if (step.label) await expect(node).toContainText(step.label);
    await expect(node).toContainText(`${step.value >= 0 ? '+' : '−'}${Math.abs(step.value)}`);
  }
  await expect(node).toContainText(`→ ${reveal.damage}`);
  if (reveal.damageType) await expect(node).toContainText(reveal.damageType);
}

test('manual damage keeps its recorded dice and modifiers in full history, the overlay, and after reload', async ({ page, request }, testInfo) => {
  const f = await fixture(request, page);
  await page.getByRole('button', { name: 'Open chat and roll log', exact: true }).click();
  const attack = await playerAttack(page, f, true);
  expect(attack.pending!.mods).toContainEqual({ label: 'STR', value: 4 });
  expect((await f.snapshot()).monsters.find((monster) => monster.id === f.target.refId)!.curHp).toBe(200);
  // The pending payload is not a new public result. Do not reveal damage early.
  await expect(page.locator('.roll-log .roll-damage-breakdown')).toHaveCount(0);
  await expect(page.locator('.roll-log .roll-dmg')).toBeVisible();
  await page.locator('.roll-log .roll-dmg').click();
  let damage: RollEntry | undefined;
  await expect.poll(async () => {
    damage = (await f.snapshot()).rollLog.findLast((entry) => entry.label === 'Damage');
    return !!damage;
  }).toBe(true);
  expect(damage!.reveal?.damageDice).toEqual(attack.pending!.dice);
  expect(damage!.reveal?.damageMods).toEqual(attack.pending!.mods);
  await expectRecordedDamage(page.locator('.roll-log .roll-damage-breakdown'), damage!);
  await page.screenshot({ path: testInfo.outputPath('player-full-damage-log.png') });
  await page.getByRole('button', { name: 'Collapse chat and roll log', exact: true }).click();
  await expectRecordedDamage(page.locator('.roll-log-overlay .roll-damage-breakdown'), damage!);
  await expect.poll(() => page.locator('.roll-log-overlay .roll-entry').last()
    .evaluate((node) => Number(getComputedStyle(node).opacity))).toBe(1);
  await page.screenshot({ path: testInfo.outputPath('player-damage-overlay.png') });
  await page.reload();
  await expect(page.locator('.compact-player-combat')).toBeVisible();
  await expectRecordedDamage(page.locator('.roll-log-overlay .roll-damage-breakdown'), damage!);
  await page.getByRole('button', { name: 'Open chat and roll log', exact: true }).click();
  await expectRecordedDamage(page.locator('.roll-log .roll-damage-breakdown'), damage!);
  expect((await f.snapshot()).rollLog.filter((entry) => entry.label === 'Damage')).toHaveLength(1);
});

test('automatic weapon attacks show the same authoritative damage breakdown without a second damage entry', async ({ page, request }) => {
  const f = await fixture(request, page);
  f.socket.emit('session:setManualDamage', { manual: false });
  await f.snapshot();
  const attack = await playerAttack(page, f, false);
  expect(attack.pending).toBeUndefined();
  expect(attack.reveal?.damageMods).toContainEqual({ label: 'STR', value: 4 });
  await expectRecordedDamage(page.locator('.roll-log-overlay .roll-damage-breakdown'), attack);
  await page.getByRole('button', { name: 'Open chat and roll log', exact: true }).click();
  await expectRecordedDamage(page.locator('.roll-log .roll-damage-breakdown'), attack);
  expect((await f.snapshot()).rollLog.filter((entry) => entry.label === 'Damage')).toHaveLength(0);
});

test('a targeted saving-throw spell preserves its cast dice in history without treating the saving throw as new damage dice', async ({ page, request }) => {
  const f = await fixture(request, page);
  await page.locator('.compact-player-combat').getByRole('button', { name: /Log flame/ }).click();
  let cast: RollEntry | undefined;
  await expect.poll(async () => {
    cast = (await f.snapshot()).rollLog.find((entry) => entry.label === 'Log flame');
    return !!cast?.apply?.consumedTargets?.length;
  }).toBe(true);
  expect(cast!.reveal?.kind).toBe('damage');
  expect((await f.snapshot()).rollLog.at(-1)?.reveal?.kind).toBe('check');
  await page.getByRole('button', { name: 'Open chat and roll log', exact: true }).click();
  await expect(page.locator('.roll-log .roll-damage-breakdown')).toHaveCount(1);
  await expectRecordedDamage(page.locator('.roll-log .roll-damage-breakdown'), cast!);
  await expect(page.locator('.roll-log .roll-entry').last().locator('.roll-damage-breakdown')).toHaveCount(0);
});

test('enemy damage history exposes recorded dice but never restores modifier labels redacted from the player snapshot', async ({ page, request, browser }) => {
  const f = await fixture(request, page);
  f.socket.emit('session:setManualDamage', { manual: false });
  await f.snapshot();
  let attack: RollEntry | undefined;
  for (let attempt = 0; attempt < 5; attempt++) {
    f.socket.emit('combat:attack', { attackerTokenId: f.target.id, targetTokenId: f.pc.id, weaponIndex: 0 });
    attack = (await f.snapshot()).rollLog.at(-1)!;
    if ((attack.reveal?.damage ?? 0) > 0) break;
  }
  expect(attack?.hideMods).toBe(true);
  expect(attack!.reveal?.damageMods).toContainEqual({ label: 'STR', value: 4 });
  await page.getByRole('button', { name: 'Open chat and roll log', exact: true }).click();
  const playerBreakdown = page.locator('.roll-log .roll-damage-breakdown');
  await expectRecordedDamage(playerBreakdown, attack!, false);
  await expect(playerBreakdown).not.toContainText('STR');
  await expect(page.locator('.roll-log')).not.toContainText('[STR]');

  const dmContext = await browser.newContext();
  try {
    const dm = await dmContext.newPage();
    await dm.goto(`/dm?code=${f.code}`);
    await dm.locator('input[type=password]').fill(DM_SECRET);
    await dm.getByRole('button', { name: 'Rejoin as DM', exact: true }).click();
    await dm.getByRole('button', { name: 'Chat & dice', exact: true }).click();
    await expectRecordedDamage(dm.locator('.roll-log .roll-damage-breakdown'), attack!);
    // Existing hidden-DM behavior remains stronger than modifier redaction:
    // a hidden roll adds no player history entry at all.
    const playerRows = await page.locator('.roll-log .roll-entry').count();
    f.socket.emit('session:setHideDmRolls', { hide: true });
    f.socket.emit('combat:attack', { attackerTokenId: f.target.id, targetTokenId: f.pc.id, weaponIndex: 0 });
    const last = (await f.snapshot()).rollLog.at(-1)!;
    expect(last.dmOnly).toBe(true);
    await expect(dm.locator('.roll-log .roll-entry')).toHaveCount(playerRows + 1);
    await expect(page.locator('.roll-log .roll-entry')).toHaveCount(playerRows);
  } finally {
    await dmContext.close();
  }
});
