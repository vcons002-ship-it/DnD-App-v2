import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import { io, type Socket } from 'socket.io-client';
import type { Character, SheetAbility, StateSnapshot } from '../shared/types';
import { DM_SECRET, PORT } from './playwright.config';

const connections: Socket[] = [];
test.afterEach(() => connections.splice(0).forEach(socket => socket.disconnect()));

async function fixture(request: APIRequestContext, page: Page, names: string[], patch: Partial<Character> = {}) {
  const response = await request.post('/api/sessions', { headers: { 'x-dm-passphrase': DM_SECRET }, data: { name: 'Spell support' } });
  expect(response.ok()).toBeTruthy();
  const { code } = await response.json();
  const socket = io(`http://localhost:${PORT}`, { transports: ['websocket'], forceNew: true });
  connections.push(socket);
  const snapshot = async (): Promise<StateSnapshot> => {
    const joined = await socket.timeout(5000).emitWithAck('join', { sessionCode: code, role: 'dm', dmPassphrase: DM_SECRET });
    expect(joined.ok).toBe(true); return joined.snapshot;
  };
  const characterId = (await snapshot()).characters.find(c => c.name === 'Vanec')!.id;
  const catalog = (await (await request.get('/api/spells/all')).json()).results as SheetAbility[];
  const abilities = names.map((name, index): SheetAbility => {
    const found = catalog.find(a => a.name === name);
    expect(found, `${name} is in the real spell catalog`).toBeTruthy();
    return { ...found!, id: `support-${index}`, source: 'srd', sourceClass: 'wizard' };
  });
  // These saved entries lack mechanics; reviewed runtime profiles must still work.
  for (const ability of abilities) {
    if (ability.name === 'Hold Person') delete ability.roll;
    if (ability.name === 'Mage Hand') delete ability.summon;
  }
  socket.emit('character:update', { characterId, className: 'Wizard', subclass: '', level: 5,
    stats: { STR: 10, DEX: 10, CON: 14, INT: 16, WIS: 10, CHA: 16 },
    maxHp: 30, curHp: 30, weapons: [], sheetAbilities: abilities,
    spellSlots: { L1: { max: 6, used: 0 }, L2: { max: 6, used: 0 }, L3: { max: 6, used: 0 } }, ...patch });
  const png = await page.evaluate(() => {
    const canvas = document.createElement('canvas'); canvas.width = 1000; canvas.height = 600;
    canvas.getContext('2d')!.fillRect(0, 0, 1000, 600);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  const map = await (await request.post(`/api/sessions/${code}/maps`, {
    headers: { 'x-dm-passphrase': DM_SECRET }, multipart: { name: 'Spell camp', image: { name: 'camp.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') } },
  })).json();
  socket.emit('map:setActive', { mapId: map.id });
  socket.emit('fog:setLayer', { mapId: map.id, layer: 'map', enabled: false });
  socket.emit('fog:setLayer', { mapId: map.id, layer: 'tokens', enabled: false });
  socket.emit('token:spawn', { mapId: map.id, kind: 'pc', refId: characterId, x: 300, y: 250 });
  socket.emit('monster:create', { name: 'Save subject', maxHp: 60, armorClass: 15, disposition: 'enemy', stats: { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 } });
  const monster = (await snapshot()).monsterTemplates.find(m => m.name === 'Save subject')!;
  socket.emit('token:spawn', { mapId: map.id, kind: 'monster', refId: monster.id, x: 500, y: 250 });
  const ready = await snapshot();
  await page.addInitScript(() => localStorage.setItem('dnd.rollAnimOff', '1'));
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.goto(`/join?code=${code}`);
  await page.getByRole('button', { name: 'Join', exact: true }).click();
  await page.locator('.claim-row').filter({ hasText: 'Vanec' }).click();
  await expect(page.getByRole('region', { name: 'Combat panel', exact: true })).toBeVisible();
  const openSheet = async () => {
    await page.getByRole('button', { name: 'Character', exact: true }).click();
    await page.locator('.character-window').getByRole('button', { name: 'Spellbook', exact: true }).click();
  };
  const entry = (name: string) => page.locator('.character-window .spell-entry').filter({ has: page.locator('.spell-name').filter({ hasText: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`) }) });
  const clickToken = async (id: string, button: 'left' | 'right' = 'left') => {
    const point = await page.evaluate((tokenId) => {
      const stage = (window as unknown as { Konva: { stages: any[] } }).Konva.stages.find(s => s.find('.token-hit-region').length);
      const shape = stage.find('.token-hit-region').find((node: any) => node.getAttr('tokenId') === tokenId);
      const position = shape.getAbsolutePosition(), bounds = stage.container().getBoundingClientRect();
      return { x: bounds.left + position.x, y: bounds.top + position.y };
    }, id);
    await page.mouse.click(point.x, point.y, { button });
  };
  return { socket, snapshot, characterId, ready, abilities, openSheet, entry, clickToken };
}

test('Saved and catalog spells show honest support, filters, and a route to Combat', async ({ page, request }) => {
  const f = await fixture(request, page, ['Magic Missile', 'Hold Person', 'Shield', 'Mage Hand', 'Divine Smite', 'Hail of Thorns', 'Conjure Animals']);
  await f.openSheet();
  await expect(f.entry('Magic Missile').locator('[data-spell-support]')).toHaveAttribute('data-spell-support', 'ready');
  await expect(f.entry('Hold Person').locator('[data-spell-support]')).toHaveAttribute('data-spell-support', 'partial');
  await expect(f.entry('Shield').locator('[data-spell-support]')).toHaveAttribute('data-spell-support', 'manual');
  for (const name of ['Mage Hand', 'Divine Smite']) await expect(f.entry(name).getByRole('button', { name: 'Look up mechanics', exact: true })).toHaveCount(0);
  await expect(f.entry('Hail of Thorns').getByRole('button', { name: 'Cast manually', exact: true })).toHaveCount(0);
  await expect(f.entry('Conjure Animals').getByRole('button', { name: /Summon/ })).toHaveCount(0);
  await f.entry('Hold Person').locator('.spell-toggle').click();
  await expect(f.entry('Hold Person').getByLabel('Hold Person combat support')).toContainText('Paralyzed');
  await expect(f.entry('Hold Person').getByLabel('Hold Person combat support')).toContainText('App handles:');
  await expect(f.entry('Hold Person').getByLabel('Hold Person combat support')).toContainText('You handle:');
  await f.entry('Hold Person').getByLabel('Hold Person combat support').scrollIntoViewIfNeeded();
  await page.screenshot({ path: test.info().outputPath('saved-spell-support.png'), fullPage: true });
  await f.entry('Hold Person').getByRole('button', { name: 'Use in Combat', exact: true }).click();
  await expect(page.locator('.character-window')).toHaveCount(0);
  await expect(page.locator('.compact-player-combat').getByRole('button', { name: /Hold Person/ })).toBeVisible();

  await f.openSheet();
  await page.getByRole('button', { name: /Add spell or ability/ }).click();
  await page.locator('.spell-add input').fill('False Life');
  await expect(page.locator('.suggest-row').filter({ hasText: 'False Life' }).locator('[data-spell-support]')).toHaveAttribute('data-spell-support', 'manual');
  await page.getByRole('button', { name: /Browse spellbook/ }).click();
  const book = page.locator('.spellbook');
  for (const status of ['ready', 'partial', 'manual']) {
    await book.getByRole('combobox', { name: 'Filter by combat support', exact: true }).selectOption(status);
    await expect(book.locator('.spellbook-row')).not.toHaveCount(0);
    expect(await book.locator('[data-spell-support]').evaluateAll(nodes => [...new Set(nodes.map(node => node.getAttribute('data-spell-support')))])).toEqual([status]);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await book.getByRole('combobox', { name: 'Filter by combat support', exact: true }).selectOption('partial');
  await book.locator('.spellbook-search').fill('Hold Person');
  await book.locator('.spell-toggle').click();
  await expect(book.getByLabel('Hold Person combat support')).toBeVisible();
  const bounds = await book.boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(0); expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
  expect(bounds!.y).toBeGreaterThanOrEqual(0); expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(844);
  await page.screenshot({ path: test.info().outputPath('mobile-spell-support-filter.png'), fullPage: true });
});

test('Manual spells record casting and slots without fake healing, damage, or legacy summons', async ({ page, request }) => {
  const f = await fixture(request, page, ['False Life', 'Conjure Animals']);
  const combat = page.locator('.compact-player-combat');
  await expect(combat.getByRole('button', { name: /Cast manually.*False Life/ })).toBeVisible();
  await combat.getByRole('button', { name: /Cast manually.*False Life/ }).click();
  await expect.poll(async () => (await f.snapshot()).characters.find(c => c.id === f.characterId)!.spellSlots.L1.used).toBe(1);
  const first = await f.snapshot();
  const c = first.characters.find(c => c.id === f.characterId)!;
  expect(c.curHp).toBe(30); expect(c.tempHp).toBe(0);
  const roll = first.rollLog.find(r => r.label === 'False Life')!;
  expect(roll).toBeTruthy(); expect(roll.apply).toBeUndefined(); expect(roll.pending).toBeUndefined(); expect(roll.reveal).toBeUndefined();
  expect(c.sheetAbilities).toEqual(f.abilities);
  await expect(page.locator('.roll-reveal, [data-live-dice=true]')).toHaveCount(0);

  // The same manual workflow is available from a genuine map right-click.
  const pc = f.ready.tokens.find(t => t.refId === f.characterId)!;
  const enemy = f.ready.tokens.find(t => t.kind === 'monster')!;
  await f.clickToken(pc.id); await f.clickToken(enemy.id, 'right');
  await page.locator('.floating-menu').getByRole('button', { name: /Cast manually.*Conjure Animals/ }).click();
  await expect.poll(async () => (await f.snapshot()).characters.find(c => c.id === f.characterId)!.spellSlots.L3.used).toBe(1);
  const after = await f.snapshot();
  expect(after.tokens.length).toBe(f.ready.tokens.length);
  expect(after.characters.find(c => c.id === f.characterId)!.conditions.some(condition => condition.isConcentration)).toBe(true);
  await expect(combat.getByTitle(/Summon Conjured Beast/)).toHaveCount(0);
});

test('Supported summons use real tokens and the selected Pact slot pool', async ({ page, request }) => {
  const f = await fixture(request, page, ['Mage Hand', 'Find Familiar'], {
    leveling: { rules: '2024', classes: [{ className: 'wizard', level: 2 }, { className: 'warlock', level: 3, subclass: 'Fiend Patron' }], history: [] },
    spellSlots: { L1: { max: 3, used: 0 }, P2: { max: 2, used: 0 } },
  });
  const combat = page.locator('.compact-player-combat');
  await combat.getByTitle('Summon Mage Hand', { exact: true }).click();
  await expect.poll(async () => (await f.snapshot()).monsters.some(m => m.name === 'Mage Hand')).toBe(true);
  const hand = (await f.snapshot()).monsters.find(m => m.name === 'Mage Hand')!;
  expect(hand.disposition).toBe('friendly');
  expect((await f.snapshot()).tokens.some(token => token.refId === hand.id)).toBe(true);
  await combat.getByRole('combobox', { name: 'Find Familiar summon slot pool', exact: true }).selectOption('pact');
  await expect(combat.getByRole('combobox', { name: 'Find Familiar summon level', exact: true })).toHaveValue('2');
  await combat.getByTitle('Summon Familiar (spends a spell slot)', { exact: true }).click();
  await expect.poll(async () => (await f.snapshot()).characters.find(c => c.id === f.characterId)!.spellSlots.P2.used).toBe(1);
  const after = await f.snapshot();
  expect(after.characters.find(c => c.id === f.characterId)!.spellSlots.L1.used).toBe(0);
  expect(after.monsters.some(m => m.name === 'Familiar')).toBe(true);
});

test('The browse picker tracks duplicate spell names separately for each learned class', async ({ page, request }) => {
  const f = await fixture(request, page, ['Mage Hand'], {
    leveling: { rules: '2024', classes: [{ className: 'wizard', level: 2 }, { className: 'warlock', level: 3, subclass: 'Fiend Patron' }], history: [] },
  });
  await f.openSheet();
  await page.getByRole('button', { name: /Add spell or ability/ }).click();
  await page.getByRole('button', { name: /Browse spellbook/ }).click();
  const book = page.locator('.spellbook');
  await book.locator('.spellbook-search').fill('Mage Hand');
  await book.getByRole('combobox', { name: 'Spellbook learning class', exact: true }).selectOption('wizard');
  await expect(book.getByRole('button', { name: /Added/ })).toBeDisabled();
  await book.getByRole('combobox', { name: 'Spellbook learning class', exact: true }).selectOption('warlock');
  await book.getByRole('button', { name: '+ Add', exact: true }).click();
  await expect.poll(async () => (await f.snapshot()).characters.find(c => c.id === f.characterId)!.sheetAbilities.filter(a => a.name === 'Mage Hand').map(a => a.sourceClass).sort()).toEqual(['warlock', 'wizard']);
  await expect(book.getByRole('button', { name: /Added/ })).toBeDisabled();
});

test('A deliberate unsafe-spell roll override is labelled authored and retains its chosen mechanics', async ({ page, request }) => {
  const f = await fixture(request, page, ['False Life', 'Shield'], { curHp: 8 });
  await f.openSheet();
  const entry = f.entry('False Life');
  await expect(entry.locator('[data-spell-support]')).toHaveAttribute('data-spell-support', 'manual');
  await entry.locator('.spell-toggle').click();
  // Intentionally author a homebrew healing variant, rather than executing the
  // catalogue's incorrect temp-HP-as-healing shape silently.
  await entry.getByRole('button', { name: /Add roll/ }).click();
  await entry.getByTitle('What this roll does', { exact: true }).selectOption('heal');
  await entry.getByPlaceholder('dice e.g. 8d6', { exact: true }).fill('1d4');
  await entry.getByRole('combobox', { name: 'Healing bonus', exact: true }).selectOption('none');
  await expect.poll(async () => (await f.snapshot()).characters.find(c => c.id === f.characterId)!.sheetAbilities.find(a => a.name === 'False Life')!.roll)
    .toMatchObject({ kind: 'heal', dice: '1d4', healingBonus: 'none' });
  const edited = (await f.snapshot()).characters.find(c => c.id === f.characterId)!.sheetAbilities.find(a => a.name === 'False Life')!;
  expect(edited.executionProfile).toBe('manual');
  expect(edited.description).toBe(f.abilities.find(a => a.name === 'False Life')!.description);
  await expect(entry.locator('[data-spell-support]')).toHaveAttribute('data-spell-support', 'partial');
  await expect(entry.getByLabel('False Life combat support')).toContainText('Custom or explicitly authored');
  await page.getByRole('button', { name: 'Close character window', exact: true }).click();
  const combat = page.locator('.compact-player-combat');
  await expect(combat.getByRole('button', { name: /Cast manually.*False Life/ })).toHaveCount(0);
  await combat.getByRole('button', { name: /False Life/ }).click();
  await expect.poll(async () => (await f.snapshot()).characters.find(c => c.id === f.characterId)!.curHp, { timeout: 40_000 }).toBeGreaterThan(8);
  const after = (await f.snapshot()).characters.find(c => c.id === f.characterId)!;
  expect(after.curHp).toBeLessThanOrEqual(12);
  expect(after.spellSlots.L1.used).toBe(1);
  expect(after.sheetAbilities.find(a => a.name === 'Shield')).toEqual(f.abilities.find(a => a.name === 'Shield'));
});
