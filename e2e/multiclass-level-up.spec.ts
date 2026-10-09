import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import { io, type Socket } from 'socket.io-client';
import type { Character, StateSnapshot } from '../shared/types';
import type { LevelUpPlan } from '../shared/levelingTypes';
import { DM_SECRET, PORT } from './playwright.config';

const connections: Socket[] = [];
test.afterEach(() => connections.splice(0).forEach(socket => socket.disconnect()));

async function fixture(request: APIRequestContext, page: Page, patch: Partial<Character>) {
  const created = await request.post('/api/sessions', { headers: { 'x-dm-passphrase': DM_SECRET }, data: { name: 'Guided level-up' } });
  expect(created.ok()).toBeTruthy();
  const { code } = await created.json();
  const socket = io(`http://localhost:${PORT}`, { transports: ['websocket'], forceNew: true });
  connections.push(socket);
  const snapshot = async (): Promise<StateSnapshot> => {
    const ack = await socket.timeout(5000).emitWithAck('join', { sessionCode: code, role: 'dm', dmPassphrase: DM_SECRET });
    expect(ack.ok).toBe(true);
    return ack.snapshot;
  };
  const character = (await snapshot()).characters.find(c => c.name === 'Druk')!;
  socket.emit('character:update', { characterId: character.id, level: 3, className: 'Fighter', subclass: 'Battle Master',
    stats: { STR: 16, DEX: 12, CON: 14, INT: 14, WIS: 10, CHA: 10 }, maxHp: 31, curHp: 20, ...patch });
  const png = await page.evaluate(() => {
    const canvas = document.createElement('canvas'); canvas.width = 800; canvas.height = 500;
    const ctx = canvas.getContext('2d')!; ctx.fillStyle = '#273128'; ctx.fillRect(0, 0, 800, 500);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  const map = await (await request.post(`/api/sessions/${code}/maps`, {
    headers: { 'x-dm-passphrase': DM_SECRET }, multipart: { name: 'Training camp', image: { name: 'camp.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') } },
  })).json();
  socket.emit('map:setActive', { mapId: map.id });
  socket.emit('fog:setLayer', { mapId: map.id, layer: 'map', enabled: false });
  socket.emit('fog:setLayer', { mapId: map.id, layer: 'tokens', enabled: false });
  socket.emit('token:spawn', { mapId: map.id, kind: 'pc', refId: character.id, x: 350, y: 240 });
  const ready = await snapshot();
  const token = ready.tokens.find(t => t.kind === 'pc' && t.refId === character.id)!;
  return { code, socket, snapshot, characterId: character.id, token };
}

/** A sheet saved before classes came from a fixed list ("Fighter / Wizard").
 *  The sheet editor no longer accepts free text, so — like a real old save — it
 *  arrives through the character library, which keeps saved values as they are. */
async function legacyFixture(request: APIRequestContext, page: Page, sheet: Partial<Character> & { name: string }) {
  const f = await fixture(request, page, {});
  const saved = await request.post('/api/library/characters?overwrite=true', { headers: { 'x-dm-passphrase': DM_SECRET }, data: {
    race: 'Human', subclass: '', stats: { STR: 16, DEX: 12, CON: 14, INT: 14, WIS: 10, CHA: 10 }, ...sheet } });
  expect(saved.ok()).toBeTruthy();
  f.socket.emit('character:loadFromLibrary', { name: sheet.name });
  await expect.poll(async () => (await f.snapshot()).characters.some(c => c.name === sheet.name)).toBe(true);
  const character = (await f.snapshot()).characters.find(c => c.name === sheet.name)!;
  expect(character.className).toBe(sheet.className); // kept verbatim, never rewritten
  const map = (await f.snapshot()).activeMapId!;
  f.socket.emit('token:spawn', { mapId: map, kind: 'pc', refId: character.id, x: 500, y: 240 });
  await expect.poll(async () => (await f.snapshot()).tokens.some(t => t.refId === character.id)).toBe(true);
  const token = (await f.snapshot()).tokens.find(t => t.kind === 'pc' && t.refId === character.id)!;
  return { ...f, characterId: character.id, token };
}

async function grant(f: Awaited<ReturnType<typeof fixture>>) {
  const result = await f.socket.timeout(5000).emitWithAck('character:levelGrant', { characterId: f.characterId });
  expect(result.ok).toBe(true);
  return result.value.leveling.pending;
}

async function planFor(f: Awaited<ReturnType<typeof fixture>>, className: string, subclass?: string): Promise<LevelUpPlan> {
  const result = await f.socket.timeout(5000).emitWithAck('character:levelPlan', { characterId: f.characterId, className, subclass });
  expect(result.ok).toBe(true);
  return result.value;
}

async function chooseSpells(guide: ReturnType<Page['locator']>, names: string[]) {
  for (const name of names) {
    await guide.getByLabel('Find a spell', { exact: true }).fill(name);
    await guide.getByRole('checkbox', { name: new RegExp(`^${name}`) }).check();
  }
}

test('Fighter enters Wizard with class-level HP and spells without a total-level ASI', async ({ page, request }) => {
  const f = await fixture(request, page, {});
  await grant(f);
  const guide = await openPlayer(page, f.code);
  await guide.getByRole('combobox', { name: 'Class to advance', exact: true }).selectOption('wizard');
  await expect(guide).toContainText('Wizard 0 → 1');
  await expect(guide).toContainText('d6 + Constitution');
  await expect(guide.getByRole('combobox', { name: 'Class to advance', exact: true }).locator('option[value=paladin]')).toHaveAttribute('disabled', '');
  await page.screenshot({ path: test.info().outputPath('multiclass-class-choice.png'), fullPage: true });
  await guide.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(guide.getByRole('combobox', { name: 'Subclass', exact: true })).toHaveCount(0);
  await guide.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(guide).toContainText('Add 6 new spells. Add 3 new cantrips.');
  await expect(guide.getByRole('combobox', { name: 'First +1', exact: true })).toHaveCount(0);
  await chooseSpells(guide, ['Magic Missile', 'Shield', 'Feather Fall', 'Sleep', 'Thunderwave', 'Charm Person', 'Fire Bolt', 'Mage Hand', 'Ray of Frost']);
  await guide.getByRole('button', { name: 'Preview level-up', exact: true }).click();
  await expect(guide).toContainText('31 → 37');
  await page.screenshot({ path: test.info().outputPath('fighter-wizard-preview.png'), fullPage: true });
  await guide.getByRole('button', { name: 'Apply level 4', exact: true }).click();
  await expect(guide).toHaveCount(0);
  const c = (await f.snapshot()).characters.find(c => c.id === f.characterId)!;
  expect(c.leveling!.classes).toEqual([{ className: 'fighter', level: 3, subclass: 'Battle Master' }, { className: 'wizard', level: 1 }]);
  expect(c.maxHp).toBe(37);
  expect(c.spellSlots.L1.max).toBe(2);
  expect(c.spellSlots.L2).toBeUndefined();
  expect(c.leveling!.history[0].choices.asi).toBeUndefined();
  for (const spell of c.sheetAbilities.filter(a => a.type === 'spell')) {
    expect(spell.sourceClass).toBe('wizard');
    if (spell.roll) expect(spell.roll.castingAbility).toBe('INT');
  }
});

test('Wizard class level governs ASI and spell learning while shared slots can be higher', async ({ page, request }) => {
  const f = await fixture(request, page, { className: 'Wizard', subclass: 'Abjurer', level: 4, maxHp: 25,
    stats: { STR: 10, DEX: 12, CON: 14, INT: 16, WIS: 14, CHA: 10 },
    leveling: { rules: '2024', classes: [{ className: 'wizard', level: 3, subclass: 'Abjurer' }, { className: 'cleric', level: 1 }], history: [] } });
  await grant(f);
  const guide = await openPlayer(page, f.code);
  await expect(guide).toContainText('Wizard 3 → 4');
  await guide.getByRole('button', { name: 'Next', exact: true }).click();
  await guide.getByRole('button', { name: 'Next', exact: true }).click();
  await guide.getByRole('combobox', { name: 'First +1', exact: true }).selectOption('INT');
  await guide.getByRole('combobox', { name: 'Second +1', exact: true }).selectOption('INT');
  await guide.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(guide).toContainText('Available spell levels come from this class');
  await guide.getByLabel('Find a spell', { exact: true }).fill('Fireball');
  await expect(guide.getByRole('checkbox', { name: /^Fireball/ })).toHaveCount(0);
  await chooseSpells(guide, ['Invisibility', 'Scorching Ray', 'Ray of Frost']);
  await guide.getByRole('button', { name: 'Preview level-up', exact: true }).click();
  await expect(guide).toContainText('INT: 16 → 18');
  await guide.getByRole('button', { name: 'Apply level 5', exact: true }).click();
  await expect(guide).toHaveCount(0);
  const c = (await f.snapshot()).characters.find(c => c.id === f.characterId)!;
  expect(c.leveling!.classes!.map(entry => entry.level)).toEqual([4, 1]);
  expect(c.spellSlots.L3.max).toBe(2);
  await expect(page.locator('.character-window-head')).toContainText('Wizard 4 / Cleric 1');
  await expect(page.locator('.character-window-head')).toContainText('Total level 5');
  await expect(page.locator('.hud-identity small')).toContainText('Wizard 4 / Cleric 1');
  await page.locator('.character-window').getByRole('button', { name: 'Spellbook', exact: true }).click();
  const budgets = page.locator('.character-window [aria-label="Spells by class"]');
  await expect(budgets.locator('[data-spell-class=wizard]')).toContainText('Wizard 4 · INT · spells up to L2');
  await expect(budgets.locator('[data-spell-class=cleric]')).toContainText('Cleric 1 · WIS · spells up to L1');
  await page.screenshot({ path: test.info().outputPath('multiclass-spell-budgets.png'), fullPage: true });
});

test('DM explicitly configures a legacy split without rebuilding its existing stats', async ({ page, request }) => {
  const f = await legacyFixture(request, page, { name: 'Old Druk', className: 'Fighter / Wizard', level: 5, maxHp: 37, curHp: 37 });
  await openDmSheet(page, f);
  await expect(page.getByRole('button', { name: 'Grant level 6', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Edit class levels', exact: true }).click();
  const config = page.getByRole('dialog', { name: 'Class levels · Old Druk', exact: true });
  await config.getByRole('button', { name: 'Add class', exact: true }).click();
  await config.getByRole('combobox', { name: 'Class 1', exact: true }).selectOption('fighter');
  await config.getByRole('spinbutton', { name: 'Class level 1', exact: true }).fill('3');
  await config.getByRole('combobox', { name: 'Subclass 1', exact: true }).selectOption('Battle Master');
  // A partial split is now a deliberate level correction, clearly labelled.
  await expect(config.getByRole('button', { name: 'Save and set level 3', exact: true })).toBeEnabled();
  await expect(config.getByRole('status')).toContainText('level 5 → 3');
  await config.getByRole('button', { name: 'Add class', exact: true }).click();
  await config.getByRole('combobox', { name: 'Class 2', exact: true }).selectOption('wizard');
  await config.getByRole('spinbutton', { name: 'Class level 2', exact: true }).fill('2');
  await config.getByRole('button', { name: 'Save class levels', exact: true }).click();
  await expect(config).toHaveCount(0);
  const beforeGrant = (await f.snapshot()).characters.find(c => c.id === f.characterId)!;
  expect(beforeGrant.leveling!.classes).toEqual([{ className: 'fighter', level: 3, subclass: 'Battle Master' }, { className: 'wizard', level: 2 }]);
  expect(beforeGrant.maxHp).toBe(37); expect(beforeGrant.stats.STR).toBe(16);
  await page.getByRole('button', { name: 'Grant level 6', exact: true }).click();
  const guide = page.locator('[data-level-up=true]');
  await guide.getByRole('combobox', { name: 'Class to advance', exact: true }).selectOption('wizard');
  await expect(guide).toContainText('Wizard 2 → 3');
  await guide.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(guide.getByRole('combobox', { name: 'Subclass', exact: true })).toBeVisible();
  await guide.getByRole('combobox', { name: 'Subclass', exact: true }).selectOption('Evoker');
  await expect(guide).toContainText('Evocation Savant');
  await page.screenshot({ path: test.info().outputPath('legacy-split-subclass.png'), fullPage: true });
});

test('Class is picked from the 12-class list; an old free-text class is shown, not rewritten', async ({ page, request }) => {
  const f = await legacyFixture(request, page, { name: 'Old Sly', className: 'Rogue (Thief)', level: 3, maxHp: 24, curHp: 24 });
  await openDmSheet(page, f);
  const sheet = page.locator('.char-sheet');
  await expect(sheet.locator('.class-offlist')).toContainText('it reads as Rogue');
  await sheet.getByRole('button', { name: 'Edit', exact: true }).first().click();
  const pick = sheet.getByRole('combobox', { name: 'Class', exact: true });
  await expect(pick).toHaveValue('Rogue (Thief)');
  await expect(pick.locator('option')).toHaveCount(13); // the saved value + 12 classes
  await expect(pick.locator('option').first()).toHaveText('Rogue (Thief) (not in list)');
  await pick.selectOption('Rogue');
  await sheet.getByRole('button', { name: 'Save', exact: true }).click();
  await expect.poll(async () => (await f.snapshot()).characters.find(c => c.id === f.characterId)!.className).toBe('Rogue');
  await expect(sheet.locator('.class-offlist')).toHaveCount(0);
  // Free text is refused at the server too, without losing the rest of the edit.
  f.socket.emit('character:update', { characterId: f.characterId, className: 'Swashbuckler', curHp: 20 });
  await expect.poll(async () => (await f.snapshot()).characters.find(c => c.id === f.characterId)!.curHp).toBe(20);
  expect((await f.snapshot()).characters.find(c => c.id === f.characterId)!.className).toBe('Rogue');
});

test('A new-class HP roll visibly uses its die and locks that class across reopening on mobile', async ({ page, request }) => {
  test.setTimeout(90_000);
  const f = await fixture(request, page, {});
  await grant(f);
  const guide = await openPlayer(page, f.code);
  await page.setViewportSize({ width: 390, height: 844 });
  await guide.getByRole('combobox', { name: 'Class to advance', exact: true }).selectOption('barbarian');
  await guide.getByRole('radio', { name: /Roll for HP/ }).check();
  await guide.getByRole('button', { name: 'Roll d12 for HP', exact: true }).click();
  const live = page.locator('[data-live-dice=true]');
  await expect(live).toBeVisible({ timeout: 15_000 });
  await expect(live.getByRole('group', { name: 'Live dice tray' })).toHaveAttribute('data-material', 'obsidian-gold');
  await expect(guide.getByRole('combobox', { name: 'Class to advance', exact: true })).toBeDisabled();
  await page.screenshot({ path: test.info().outputPath('mobile-multiclass-hp-roll.png'), fullPage: true });
  await expect.poll(async () => (await f.snapshot()).characters.find(c => c.id === f.characterId)!.leveling?.pending?.hpRoll, { timeout: 40_000 }).toBeGreaterThan(0);
  const pending = (await f.snapshot()).characters.find(c => c.id === f.characterId)!.leveling!.pending!;
  expect(pending.hpClassName).toBe('barbarian'); expect(pending.hpRoll).toBeLessThanOrEqual(12);
  await expect(guide).toContainText(`Your d12 rolled ${pending.hpRoll}`);
  await expect(page.locator('.roll-reveal[data-roll-id]')).toBeVisible({ timeout: 40_000 });
  await page.locator('.roll-reveal[data-roll-id]').click();
  await guide.getByRole('button', { name: 'Close level-up guide' }).click();
  await page.getByRole('button', { name: 'Continue level-up', exact: true }).click();
  await expect(guide.getByRole('combobox', { name: 'Class to advance', exact: true })).toHaveValue('barbarian');
  await expect(guide.getByRole('combobox', { name: 'Class to advance', exact: true })).toBeDisabled();
  await expect(guide.getByRole('button', { name: 'Roll d12 for HP', exact: true })).toHaveCount(0);
  const bounds = await guide.boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(0); expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(844);
});

test('Warlock subclass and Pact Magic advance by class level while spent uses remain spent', async ({ page, request }) => {
  const f = await fixture(request, page, { level: 5, stats: { STR: 16, DEX: 12, CON: 14, INT: 14, WIS: 10, CHA: 16 },
    leveling: { rules: '2024', classes: [{ className: 'fighter', level: 3, subclass: 'Battle Master' }, { className: 'warlock', level: 2 }], history: [] },
    spellSlots: { P1: { max: 2, used: 1 } } });
  await grant(f);
  const guide = await openPlayer(page, f.code);
  await guide.getByRole('combobox', { name: 'Class to advance', exact: true }).selectOption('warlock');
  await expect(guide).toContainText('Warlock 2 → 3');
  await guide.getByRole('button', { name: 'Next', exact: true }).click();
  await guide.getByRole('combobox', { name: 'Subclass', exact: true }).selectOption('Fiend Patron');
  await expect(guide).toContainText(/Dark One.s Blessing/);
  const plan = await planFor(f, 'warlock', 'Fiend Patron');
  expect(plan.progression.featChoice).toBeNull();
  expect(plan.spellChoices.newSpells).toBe(1);
  await guide.getByRole('button', { name: 'Next', exact: true }).click();
  await chooseSpells(guide, ['Hold Person']);
  await guide.getByRole('button', { name: 'Preview level-up', exact: true }).click();
  await guide.getByRole('button', { name: 'Apply level 6', exact: true }).click();
  await expect(guide).toHaveCount(0);
  const c = (await f.snapshot()).characters.find(c => c.id === f.characterId)!;
  expect(c.leveling!.classes![1]).toEqual({ className: 'warlock', level: 3, subclass: 'Fiend Patron' });
  expect(c.spellSlots.P1).toBeUndefined(); expect(c.spellSlots.P2).toMatchObject({ max: 2, used: 1 });
  expect(Object.keys(c.spellSlots).some(key => /^L/.test(key))).toBe(false);
  expect(c.sheetAbilities.find(a => a.name === 'Hold Person')).toMatchObject({ sourceClass: 'warlock' });
  await expect(page.locator('[data-spell-class=warlock]').first()).toContainText('Warlock 3 · CHA · spells up to L2');
});

test('A multiclass caster explicitly spends either shared or Pact slots in the real spell flow', async ({ page, request }) => {
  test.setTimeout(90_000);
  const f = await fixture(request, page, { className: 'Wizard', subclass: '', level: 5,
    stats: { STR: 10, DEX: 12, CON: 14, INT: 16, WIS: 10, CHA: 16 },
    leveling: { rules: '2024', classes: [{ className: 'wizard', level: 2 }, { className: 'warlock', level: 3, subclass: 'Fiend Patron' }], history: [] },
    spellSlots: { L1: { max: 3, used: 0 }, P2: { max: 2, used: 0 } },
    sheetAbilities: [{ id: 'pool-healing', name: 'Pool Healing', type: 'spell', source: 'custom', sourceClass: 'wizard', level: 1,
      description: 'A test spell used to verify an explicitly chosen slot pool.', roll: { kind: 'heal', dice: '1d4', castingAbility: 'INT' } }] });
  await openDmSheet(page, f);
  const entry = page.locator('.combat-ability-row').filter({ has: page.getByRole('button', { name: /Pool Healing/ }) });
  await expect(entry).toBeVisible();
  await entry.getByRole('combobox', { name: 'Pool Healing slot pool', exact: true }).selectOption('pact');
  await entry.getByRole('button', { name: /Pool Healing/ }).click();
  await expect(page.locator('[data-live-dice=true]')).toBeVisible({ timeout: 15_000 });
  await expect.poll(async () => (await f.snapshot()).characters.find(c => c.id === f.characterId)!.spellSlots.P2.used, { timeout: 40_000 }).toBe(1);
  expect((await f.snapshot()).characters.find(c => c.id === f.characterId)!.spellSlots.L1.used).toBe(0);
  await expect(page.locator('.roll-reveal[data-roll-id]')).toBeVisible({ timeout: 40_000 });
  await page.locator('.roll-reveal[data-roll-id]').click();
  await entry.getByRole('combobox', { name: 'Pool Healing slot pool', exact: true }).selectOption('spellcasting');
  await entry.getByRole('button', { name: /Pool Healing/ }).click();
  await expect.poll(async () => (await f.snapshot()).characters.find(c => c.id === f.characterId)!.spellSlots.L1.used, { timeout: 40_000 }).toBe(1);
  expect((await f.snapshot()).characters.find(c => c.id === f.characterId)!.spellSlots.P2.used).toBe(1);
});

test('Manually added Channel Divinity counters use the selected class level and keep separate pools', async ({ page, request }) => {
  const f = await fixture(request, page, { className: 'Wizard', subclass: '', level: 17,
    leveling: { rules: '2024', classes: [{ className: 'wizard', level: 12, subclass: 'Abjurer' }, { className: 'cleric', level: 2 }, { className: 'paladin', level: 3, subclass: 'Devotion' }], history: [] },
    resources: {}, sheetAbilities: [] });
  await openDmSheet(page, f);
  const spells = page.locator('.spells');
  const addFeature = async (className: string, featureName: string) => {
    await spells.getByRole('button', { name: /Add spell or ability/ }).click();
    await spells.getByRole('combobox', { name: 'Class for added spells', exact: true }).selectOption(className);
    await spells.locator('.spell-add input').fill(featureName);
    await spells.locator('.suggest-row').filter({ hasText: featureName }).first().click();
  };
  await addFeature('cleric', 'Channel Divinity: Turn Undead');
  await expect.poll(async () => (await f.snapshot()).characters.find(c => c.id === f.characterId)!.resources['Cleric Channel Divinity']?.max).toBe(2);
  await addFeature('paladin', 'Channel Divinity: Sacred Weapon');
  await expect.poll(async () => (await f.snapshot()).characters.find(c => c.id === f.characterId)!.resources['Paladin Channel Divinity']?.max).toBe(2);
  const c = (await f.snapshot()).characters.find(c => c.id === f.characterId)!;
  expect(c.sheetAbilities.find(a => a.name === 'Channel Divinity: Turn Undead')).toMatchObject({ sourceClass: 'cleric', useCounter: { name: 'Cleric Channel Divinity' } });
  expect(c.sheetAbilities.find(a => a.name === 'Channel Divinity: Sacred Weapon')).toMatchObject({ sourceClass: 'paladin', useCounter: { name: 'Paladin Channel Divinity' } });
});

test('A player spends the selected mixed Hit Dice pool and retains each pool after reload', async ({ page, request }) => {
  test.setTimeout(90_000);
  const f = await fixture(request, page, { level: 5, maxHp: 100, curHp: 1,
    hitDiceUsed: 0, hitDiceUsedByDie: {},
    leveling: { rules: '2024', classes: [{ className: 'fighter', level: 3, subclass: 'Battle Master' }, { className: 'wizard', level: 2 }], history: [] } });
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.addInitScript(() => localStorage.setItem('dnd.rollAnimOff', '1'));
  await page.goto(`/join?code=${f.code}`);
  await page.getByRole('button', { name: 'Join', exact: true }).click();
  await page.locator('.claim-row').filter({ hasText: 'Druk' }).click();
  await expect(page.locator('.compact-player-combat')).toBeVisible();

  const hud = page.locator('.hit-dice-hud');
  const spender = hud.getByRole('group', { name: 'Spend Hit Dice', exact: true });
  await hud.getByRole('button', { name: /^Hit Dice: 5 of 5 left/ }).click();
  await spender.getByRole('combobox', { name: 'Hit Die size', exact: true }).selectOption('6');
  await spender.getByRole('combobox', { name: 'Hit Dice to spend', exact: true }).selectOption('2');
  await spender.getByRole('button', { name: /Spend 2d6/ }).click();
  // Turning the animation off still uses the authoritative physical roll.
  await expect.poll(async () => (await f.snapshot()).characters.find(c => c.id === f.characterId)!.hitDiceUsed, { timeout: 40_000 }).toBe(2);
  const afterD6 = await f.snapshot();
  const c6 = afterD6.characters.find(c => c.id === f.characterId)!;
  const d6Roll = afterD6.rollLog.at(-1)!;
  expect(c6.hitDiceUsedByDie).toEqual({ d10: 0, d6: 2 });
  expect(d6Roll).toMatchObject({ label: 'Hit Dice', expr: '2d6' });
  expect(d6Roll.total).toBeGreaterThanOrEqual(6); // Two minimum faces, plus +2 CON per die.
  expect(d6Roll.total).toBeLessThanOrEqual(16);
  expect(c6.curHp).toBe(1 + d6Roll.total);

  await hud.getByRole('button', { name: /^Hit Dice: 3 of 5 left/ }).click();
  await expect(spender.getByRole('combobox', { name: 'Hit Die size', exact: true })).toHaveValue('6');
  await expect(spender.getByRole('button', { name: /Spend 1d6/ })).toBeDisabled();
  await spender.getByRole('combobox', { name: 'Hit Die size', exact: true }).selectOption('10');
  await spender.getByRole('button', { name: /Spend 1d10/ }).click();
  await expect.poll(async () => (await f.snapshot()).characters.find(c => c.id === f.characterId)!.hitDiceUsed, { timeout: 40_000 }).toBe(3);
  const afterD10 = await f.snapshot();
  const c10 = afterD10.characters.find(c => c.id === f.characterId)!;
  const d10Roll = afterD10.rollLog.at(-1)!;
  expect(c10.hitDiceUsedByDie).toEqual({ d10: 1, d6: 2 });
  expect(d10Roll).toMatchObject({ label: 'Hit Dice', expr: '1d10' });
  expect(d10Roll.total).toBeGreaterThanOrEqual(3);
  expect(d10Roll.total).toBeLessThanOrEqual(12);
  expect(c10.curHp).toBe(c6.curHp + d10Roll.total);

  await page.reload();
  await expect(page.locator('.compact-player-combat')).toBeVisible();
  await hud.getByRole('button', { name: /^Hit Dice: 2 of 5 left/ }).click();
  const pool = spender.getByRole('combobox', { name: 'Hit Die size', exact: true });
  await expect(pool).toHaveValue('10');
  await expect(pool.locator('option[value="6"]')).toContainText('0/2');
  await expect(pool.locator('option[value="10"]')).toContainText('2/3');
  await page.screenshot({ path: test.info().outputPath('mixed-hit-dice-after-reload.png'), fullPage: true });
  const reloaded = (await f.snapshot()).characters.find(c => c.id === f.characterId)!;
  expect(reloaded.hitDiceUsedByDie).toEqual({ d10: 1, d6: 2 });
  expect(reloaded.curHp).toBe(c10.curHp);
});

async function openDmSheet(page: Page, f: Awaited<ReturnType<typeof fixture>>) {
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.goto(`/dm?code=${f.code}`);
  await page.locator('input[type=password]').fill(DM_SECRET);
  await page.getByRole('button', { name: 'Rejoin as DM', exact: true }).click();
  await expect(page.locator('.konvajs-content').first()).toBeVisible();
  await expect.poll(() => page.evaluate((id) => {
    const stages = (window as unknown as { Konva: { stages: any[] } }).Konva.stages;
    return stages.some(stage => stage.find('.token-hit-region').some((node: any) => node.getAttr('tokenId') === id));
    // 3D miniatures are the default and can take a while to load their models.
  }, f.token.id), { timeout: 20_000 }).toBe(true);
  await page.getByTitle('Fit to window', { exact: true }).click();
  const point = await page.evaluate((id) => {
    const stage = (window as unknown as { Konva: { stages: any[] } }).Konva.stages.find(stage => stage.find('.token-hit-region').length);
    const shape = stage.find('.token-hit-region').find((node: any) => node.getAttr('tokenId') === id);
    const position = shape.getAbsolutePosition(), bounds = stage.container().getBoundingClientRect();
    return { x: bounds.left + position.x, y: bounds.top + position.y };
  }, f.token.id);
  await page.mouse.click(point.x, point.y);
  // Selecting a token opens the inspector. Clicking its rail button again
  // would close that panel, so wait for the existing selection behavior.
  await expect(page.getByRole('button', { name: 'Token inspector', exact: true })).toHaveAttribute('aria-expanded', 'true');
  // Character info is collapsible in the inspector; open it through the UI.
  const sheet = page.locator('.char-sheet');
  if (!(await sheet.isVisible())) {
    const section = page.locator('.reorder-section').filter({ has: page.getByRole('heading', { name: 'Sheet info', exact: true }) });
    if (await section.count()) await section.getByRole('button', { name: 'Expand section', exact: true }).click();
  }
  await expect(sheet).toBeVisible();
}

async function openPlayer(page: Page, code: string) {
  await page.goto(`/join?code=${code}`);
  await page.getByRole('button', { name: 'Join', exact: true }).click();
  await page.locator('.claim-row').filter({ hasText: 'Druk' }).click();
  await expect(page.getByRole('button', { name: 'Character', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Character', exact: true }).click();
  await page.getByRole('button', { name: 'Continue level-up', exact: true }).click();
  return page.getByRole('dialog', { name: /Druk.*Level/ });
}
