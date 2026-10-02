import { test, expect, type APIRequestContext, type BrowserContext, type Page } from '@playwright/test';
import { io, type Socket } from 'socket.io-client';
import type { Character, SheetAbility, StateSnapshot } from '../shared/types';
import { DM_SECRET, PORT } from './playwright.config';

const connections: Socket[] = [];
const extraContexts: BrowserContext[] = [];
test.afterEach(async () => {
  connections.splice(0).forEach(socket => socket.disconnect());
  await Promise.all(extraContexts.splice(0).map(context => context.close()));
});

async function setup(request: APIRequestContext, page: Page, context: BrowserContext) {
  const response = await request.post('/api/sessions', { headers: { 'x-dm-passphrase': DM_SECRET }, data: { name: 'Haste live benefits' } });
  expect(response.ok()).toBeTruthy();
  const { code } = await response.json();
  const socket = io(`http://localhost:${PORT}`, { transports: ['websocket'], forceNew: true }); connections.push(socket);
  const snapshot = async (): Promise<StateSnapshot> => {
    const joined = await socket.timeout(5000).emitWithAck('join', { sessionCode: code, role: 'dm', dmPassphrase: DM_SECRET });
    expect(joined.ok).toBe(true); return joined.snapshot;
  };
  const first = await snapshot();
  const vanec = first.characters.find(c => c.name === 'Vanec')!, druk = first.characters.find(c => c.name === 'Druk')!;
  const catalog = (await (await request.get('/api/spells/all')).json()).results as SheetAbility[];
  const haste = { ...catalog.find(a => a.name === 'Haste')!, id: 'buff-haste', source: 'srd' as const, sourceClass: 'wizard' as const };
  expect(haste.name).toBe('Haste');
  socket.emit('character:update', { characterId: vanec.id, className: 'Wizard', level: 5, maxHp: 40, curHp: 40,
    stats: { STR: 10, DEX: 12, CON: 14, INT: 16, WIS: 10, CHA: 10 }, speed: '30 ft.', conditions: [],
    sheetAbilities: [haste], spellSlots: { L3: { max: 3, used: 0 } } });
  socket.emit('character:update', { characterId: druk.id, className: 'Fighter', level: 5, maxHp: 50, curHp: 50,
    armorClass: 17, speed: '30 ft.', conditions: [], stats: { STR: 18, DEX: 14, CON: 16, INT: 10, WIS: 10, CHA: 10 },
    sheetAbilities: [], weapons: [{ name: 'Greatsword', kind: 'melee', damage: '2d6', damageType: 'slashing' }], modifiers: [] });
  const png = await page.evaluate(() => {
    const canvas = document.createElement('canvas'); canvas.width = 1000; canvas.height = 600;
    const ctx = canvas.getContext('2d')!; ctx.fillStyle = '#36333a'; ctx.fillRect(0, 0, 1000, 600);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  const map = await (await request.post(`/api/sessions/${code}/maps`, { headers: { 'x-dm-passphrase': DM_SECRET },
    multipart: { name: 'Haste arena', image: { name: 'arena.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') } } })).json();
  socket.emit('map:setActive', { mapId: map.id });
  for (const layer of ['map', 'tokens']) socket.emit('fog:setLayer', { mapId: map.id, layer, enabled: false });
  socket.emit('token:spawn', { mapId: map.id, kind: 'pc', refId: vanec.id, x: 250, y: 240 });
  socket.emit('token:spawn', { mapId: map.id, kind: 'pc', refId: druk.id, x: 400, y: 240 });
  socket.emit('monster:create', { name: 'Training brute', maxHp: 1000, armorClass: 12, disposition: 'enemy', creatureType: 'Humanoid', stats: { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 } });
  const brute = (await snapshot()).monsterTemplates.find(m => m.name === 'Training brute')!;
  socket.emit('token:spawn', { mapId: map.id, kind: 'monster', refId: brute.id, x: 450, y: 240 });
  socket.emit('session:setManualDamage', { manual: false });
  const ready = await snapshot(), drukToken = ready.tokens.find(t => t.refId === druk.id)!, vanecToken = ready.tokens.find(t => t.refId === vanec.id)!;
  const join = async (target: Page, name: string) => {
    await target.addInitScript(() => localStorage.setItem('dnd.rollAnimOff', '1'));
    await target.setViewportSize({ width: 1366, height: 900 });
    await target.goto(`/join?code=${code}`);
    await target.getByRole('button', { name: 'Join', exact: true }).click();
    await target.locator('.claim-row').filter({ hasText: name }).click();
    await expect(target.getByRole('region', { name: 'Combat panel', exact: true })).toBeVisible();
  };
  await join(page, 'Vanec');
  // Distinct players must have distinct durable browser identities; two pages
  // in one context intentionally restore the same claimed character.
  const allyContext = await context.browser()!.newContext(); extraContexts.push(allyContext);
  const ally = await allyContext.newPage(); await join(ally, 'Druk');
  const character = async (id = druk.id): Promise<Character> => (await snapshot()).characters.find(c => c.id === id)!;
  const cast = async () => {
    await page.locator('.compact-player-combat').getByRole('combobox', { name: 'Buff target', exact: true }).selectOption(drukToken.id);
    await page.locator('.compact-player-combat').getByRole('button', { name: /Haste/, exact: false }).filter({ hasText: 'Haste' }).first().click();
    await expect.poll(async () => (await character()).conditions.some(c => c.label === 'Haste')).toBe(true);
  };
  const next = async (expected: string) => { socket.emit('initiative:next'); await expect.poll(async () => (await snapshot()).activeTurnTokenId, { timeout: 20000 }).toBe(expected); };
  const begin = async () => {
    socket.emit('initiative:set', { tokenId: drukToken.id, initiative: 20 });
    socket.emit('initiative:set', { tokenId: vanecToken.id, initiative: 10 });
    await next(drukToken.id);
  };
  return { socket, snapshot, character, druk, vanec, drukToken, vanecToken, page, ally, cast, begin, next };
}

async function clickMapToken(page: Page, tokenId: string) {
  const point = await page.evaluate(id => {
    const stage = (window as any).Konva.stages.find((s: any) => s.find('.token-hit-region').length);
    const shape = stage.find('.token-hit-region').find((node: any) => node.getAttr('tokenId') === id);
    const position = shape.getAbsolutePosition(), bounds = stage.container().getBoundingClientRect();
    return { x: bounds.left + position.x, y: bounds.top + position.y };
  }, tokenId);
  await page.mouse.click(point.x, point.y);
}

test('Haste can target an ally and immediately applies AC, speed and DEX-save advantage', async ({ page, request, context }) => {
  const f = await setup(request, page, context); await f.cast();
  await expect(f.ally.getByLabel('Armor Class 19', { exact: true })).toBeVisible();
  const benefits = f.ally.getByRole('region', { name: 'Haste benefits', exact: true });
  await expect(benefits).toContainText('+2 AC'); await expect(benefits).toContainText('60 ft.');
  expect((await f.character()).armorClass).toBe(17); expect((await f.character()).speed).toBe('30 ft.');
  expect((await f.character(f.vanec.id)).spellSlots.L3.used).toBe(1);
  await f.ally.getByRole('button', { name: 'Character', exact: true }).click();
  await expect(f.ally.locator('.character-window .sb-meta')).toContainText('AC 19');
  await expect(f.ally.locator('.character-window .sb-meta')).toContainText('Speed 60 ft.');
  await f.ally.locator('.character-window .sb-ability-roll').filter({ hasText: 'DEX' }).click();
  await f.ally.locator('.sb-roll-menu').getByRole('button', { name: /Save/ }).click();
  await expect.poll(async () => (await f.snapshot()).rollLog.filter(r => r.roller === 'Druk' && r.label === 'DEX save').length, { timeout: 20000 }).toBe(1);
  const save = (await f.snapshot()).rollLog.find(r => r.roller === 'Druk' && r.label === 'DEX save')!;
  expect(save.detail).toContain('Haste (DEX)'); expect(save.detail).toContain('adv:');
  await f.ally.getByRole('button', { name: 'Close character window', exact: true }).click();
  const point = await f.ally.evaluate(tokenId => {
    const stage = (window as any).Konva.stages.find((s: any) => s.find('.token-hit-region').length);
    const shape = stage.find('.token-hit-region').find((node: any) => node.getAttr('tokenId') === tokenId);
    const position = shape.getAbsolutePosition(), rect = stage.container().getBoundingClientRect();
    return { x: rect.left + position.x, y: rect.top + position.y };
  }, f.drukToken.id);
  await f.ally.mouse.move(point.x, point.y); await f.ally.mouse.down(); await f.ally.mouse.move(point.x + 80, point.y + 40, { steps: 5 });
  await expect.poll(() => f.ally.evaluate(tokenId => {
    const stage = (window as any).Konva.stages.find((s: any) => s.find('.token-move-preview').length);
    return stage.find('.token-move-preview').find((node: any) => node.getAttr('tokenId') === tokenId).find('Text').map((node: any) => node.text()).join(' ');
  }, f.drukToken.id)).toContain('/ 60 ft');
  await f.ally.keyboard.press('Escape'); await f.ally.mouse.up();
  await f.ally.screenshot({ path: test.info().outputPath('haste-benefits-desktop.png'), fullPage: true });
});

test('Haste grants one real weapon attack or restricted action per turn, with a compact mobile control', async ({ page, request, context }) => {
  const f = await setup(request, page, context); await f.cast();
  const benefits = f.ally.getByRole('region', { name: 'Haste benefits', exact: true });
  await expect(benefits.getByRole('button', { name: 'Ready extra attack', exact: true })).toBeDisabled();
  await f.begin();
  await benefits.getByRole('button', { name: 'Ready extra attack', exact: true }).click();
  await expect(benefits).toContainText('Choose one weapon below');
  await f.ally.locator('.compact-player-combat .combat-weapon-list').getByRole('button', { name: /Greatsword/ }).click();
  await expect.poll(async () => (await f.character()).conditions.find(c => c.label === 'Haste')?.combatEffect?.hasteActionUsed, { timeout: 20000 }).toBe('attack');
  await expect(benefits).toContainText('Used: attack');
  await expect(benefits.getByRole('button', { name: 'Ready extra attack', exact: true })).toHaveCount(0);
  // Genuine roll in the combat log; the extra action never creates a separate full attack routine.
  await expect.poll(async () => (await f.snapshot()).rollLog.filter(r => r.roller === 'Druk' && r.label === 'Attack').length, { timeout: 20000 }).toBe(1);
  await f.next(f.vanecToken.id); await f.next(f.drukToken.id);
  await expect(benefits.getByRole('button', { name: 'Ready extra attack', exact: true })).toBeVisible();
  await benefits.getByRole('combobox', { name: 'Haste extra action', exact: true }).selectOption('dash');
  await benefits.getByRole('button', { name: 'Use dash', exact: true }).click();
  await expect.poll(async () => (await f.character()).conditions.find(c => c.label === 'Haste')?.combatEffect?.hasteActionUsed).toBe('dash');
  await expect(benefits).toContainText('Dash adds another move');
  // A second request cannot silently provide a second extra action.
  f.socket.emit('haste:action', { kind: 'pc', refId: f.druk.id, action: 'hide' });
  expect((await f.character()).conditions.find(c => c.label === 'Haste')?.combatEffect?.hasteActionUsed).toBe('dash');
  await f.ally.setViewportSize({ width: 390, height: 844 });
  while (await f.ally.getByRole('button', { name: 'Dismiss announcement', exact: true }).count()) {
    await f.ally.getByRole('button', { name: 'Dismiss announcement', exact: true }).first().click();
  }
  await expect(f.ally.getByRole('button', { name: 'Dismiss announcement', exact: true })).toHaveCount(0);
  await benefits.scrollIntoViewIfNeeded(); const bounds = await benefits.boundingBox();
  expect(bounds!.width).toBeLessThanOrEqual(390); expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
  await f.ally.screenshot({ path: test.info().outputPath('haste-mobile.png'), fullPage: true });
});

test('Ending Haste causes visible lethargy, blocks movement, and recovers after the next target turn', async ({ page, request, context }) => {
  const f = await setup(request, page, context); await f.cast(); await f.begin();
  await page.getByRole('button', { name: 'Concentration: Haste. Edit conditions', exact: true }).click();
  await page.getByRole('dialog', { name: 'Conditions', exact: true }).getByRole('button', { name: 'Concentration', exact: true }).click();
  await expect.poll(async () => (await f.character()).conditions.some(c => c.label === 'Haste lethargy')).toBe(true);
  await expect(f.ally.locator('.haste-recovery')).toContainText('Incapacitated');
  await expect(f.ally.getByLabel('Armor Class 17', { exact: true })).toBeVisible();
  await expect(f.ally.locator('.compact-player-combat').getByRole('button', { name: /Greatsword/ })).toBeDisabled();
  expect((await f.character()).conditions.some(c => c.label === 'Incapacitated')).toBe(true);
  const player = io(`http://localhost:${PORT}`, { transports: ['websocket'], forceNew: true }); connections.push(player);
  const joined = await player.timeout(5000).emitWithAck('join', { sessionCode: (await f.snapshot()).sessionCode, role: 'player' });
  expect(joined.ok).toBe(true);
  // Server authority prevents movement even for a direct request while lethargic.
  const refused = new Promise<{message:string}>(resolve => player.once('notice', resolve));
  player.emit('token:move', { tokenId: f.drukToken.id, x: 700, y: 400 });
  expect((await refused).message).toMatch(/letharg|Haste|speed|move/i);
  const still = (await f.snapshot()).tokens.find(t => t.id === f.drukToken.id)!;
  expect({ x: still.x, y: still.y }).toEqual({ x: f.drukToken.x, y: f.drukToken.y });
  await f.next(f.vanecToken.id);
  expect((await f.character()).conditions.some(c => c.label === 'Haste lethargy')).toBe(true);
  await f.next(f.drukToken.id);
  expect((await f.character()).conditions.some(c => c.label === 'Haste lethargy')).toBe(true);
  await f.next(f.vanecToken.id);
  await expect.poll(async () => (await f.character()).conditions.some(c => c.label === 'Haste lethargy')).toBe(false);
  expect((await f.character()).conditions.some(c => c.label === 'Incapacitated')).toBe(false);
  await expect(f.ally.locator('.compact-player-combat').getByRole('button', { name: /Greatsword/ })).toBeEnabled();
});

test('Mass Healing Word rolls once, offers clear healing labels, and applies the shared total to chosen allies', async ({ page, request, context }) => {
  const f = await setup(request, page, context);
  const catalog = (await (await request.get('/api/spells/all')).json()).results as SheetAbility[];
  const mass = { ...catalog.find(a => a.name === 'Mass Healing Word')!, id: 'mass-heal', source: 'srd', sourceClass: 'cleric' };
  f.socket.emit('character:update', { characterId: f.vanec.id, className: 'Cleric', stats: { STR: 10, DEX: 10, CON: 14, INT: 10, WIS: 16, CHA: 10 },
    curHp: 20, sheetAbilities: [mass] });
  f.socket.emit('character:update', { characterId: f.druk.id, curHp: 10 }); await f.snapshot();
  await page.locator('.compact-player-combat').getByRole('button', { name: /Mass Healing Word/ }).click();
  await expect.poll(async () => (await f.snapshot()).rollLog.filter(r => r.label === 'Mass Healing Word').length, { timeout: 20000 }).toBe(1);
  const cast = (await f.snapshot()).rollLog.find(r => r.label === 'Mass Healing Word')!;
  expect(cast.apply?.healing).toBe(true); expect(cast.apply?.maxTargets).toBe(6);
  expect(cast.reveal?.title).toContain('Healing'); expect(cast.reveal?.damageMods).toContainEqual({ label: 'WIS modifier', value: 3 });
  const healing = page.getByRole('region', { name: 'Damage action', exact: true });
  await expect(healing).toContainText('Apply healing'); await expect(healing).toContainText(`${cast.total} HP`);
  await expect(healing).toContainText('6 targets left');
  await healing.getByRole('button', { name: /Apply healing/ }).click();
  await clickMapToken(page, f.drukToken.id);
  await expect.poll(async () => (await f.character()).curHp).toBe(10 + cast.total);
  await expect(healing).toContainText('5 targets left');
  await clickMapToken(page, f.vanecToken.id);
  await expect.poll(async () => (await f.character(f.vanec.id)).curHp).toBe(20 + cast.total);
  await expect(healing).toContainText('4 targets left');
  await healing.getByRole('button', { name: 'Done', exact: true }).click();
  expect((await f.character(f.vanec.id)).spellSlots.L3.used).toBe(1);
  const rolls = (await f.snapshot()).rollLog;
  expect(rolls.filter(r => r.label === 'Mass Healing Word')).toHaveLength(1);
  expect(rolls.find(r => r.id === cast.id)?.apply?.consumedTargets).toEqual([f.drukToken.id, f.vanecToken.id]);
  expect(rolls.filter(r => r.label === 'Healing').map(r => r.total)).toEqual([cast.total, cast.total]);
});

test('Hold Person applies linked Paralysis and automatically rolls a clearly labeled end-turn recovery save', async ({ page, request, context }) => {
  const f = await setup(request, page, context);
  const catalog = (await (await request.get('/api/spells/all')).json()).results as SheetAbility[];
  const hold = { ...catalog.find(a => a.name === 'Hold Person')!, id: 'hold-person', source: 'srd', sourceClass: 'wizard' };
  f.socket.emit('character:update', { characterId: f.vanec.id, stats: { STR: 10, DEX: 10, CON: 14, INT: 28, WIS: 10, CHA: 10 },
    sheetAbilities: [hold], spellSlots: { L2: { max: 3, used: 0 }, L3: { max: 3, used: 0 } } });
  const brute = (await f.snapshot()).monsters.find(m => m.name.startsWith('Training brute'))!;
  const bruteToken = (await f.snapshot()).tokens.find(t => t.refId === brute.id)!;
  f.socket.emit('monster:update', { monsterId: brute.id, stats: { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 1, CHA: 10 }, saveProficiencies: [] }); await f.snapshot();
  await page.locator('.compact-player-combat').getByRole('button', { name: /Hold Person/ }).click();
  await expect.poll(async () => (await f.snapshot()).monsters.find(m => m.id === brute.id)!.conditions.some(c => c.label === 'Paralyzed'), { timeout: 20000 }).toBe(true);
  const affected = (await f.snapshot()).monsters.find(m => m.id === brute.id)!;
  expect(affected.conditions.some(c => c.label === 'Incapacitated')).toBe(true);
  const initialSave = (await f.snapshot()).rollLog.find(r => r.label === 'WIS save')!;
  expect(initialSave.reveal?.effectOutcome).toMatch(/Hold Person.*success/i);
  // Improve this custom training creature's save on its actual DM stat block.
  // Every legal d20 now passes; no physics faces or outcomes are injected.
  // CR changes deliberately rescale the creature's baseline stats. Apply the
  // custom save after that edit so the intended WIS score is not overwritten.
  f.socket.emit('monster:update', { monsterId: brute.id, level: 30 });
  await expect.poll(async () => (await f.snapshot()).monsters.find(m => m.id === brute.id)!.level).toBe(30);
  f.socket.emit('monster:update', { monsterId: brute.id, stats: { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 30, CHA: 10 }, saveProficiencies: ['WIS'] });
  await expect.poll(async () => {
    const m = (await f.snapshot()).monsters.find(m => m.id === brute.id)!;
    return { level: m.level, wis: m.stats.WIS, saves: m.saveProficiencies };
  }).toEqual({ level: 30, wis: 30, saves: ['WIS'] });
  f.socket.emit('initiative:set', { tokenId: bruteToken.id, initiative: 20 });
  f.socket.emit('initiative:set', { tokenId: f.vanecToken.id, initiative: 10 });
  await f.next(bruteToken.id); await f.next(f.vanecToken.id);
  await expect.poll(async () => (await f.snapshot()).monsters.find(m => m.id === brute.id)!.conditions.some(c => c.label === 'Paralyzed'), { timeout: 20000 }).toBe(false);
  const recovered = (await f.snapshot()).monsters.find(m => m.id === brute.id)!;
  expect(recovered.conditions.some(c => c.label === 'Incapacitated')).toBe(false);
  const repeat = (await f.snapshot()).rollLog.find(r => r.label === 'Hold Person' && r.expr === 'WIS save')!;
  expect(repeat.reveal?.title).toMatch(/Hold Person.*WIS Saving Throw/i);
  expect(repeat.detail).toContain('PASS'); expect(repeat.reveal?.effectOutcome).toMatch(/Hold Person.*(end|recover)/i);
  expect((await f.character(f.vanec.id)).spellSlots.L2.used).toBe(1);
});
