import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import { io, type Socket } from 'socket.io-client';
import type { Character, StateSnapshot } from '../shared/types';
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

async function openDmSheet(page: Page, f: Awaited<ReturnType<typeof fixture>>) {
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.goto(`/dm?code=${f.code}`);
  await page.locator('input[type=password]').fill(DM_SECRET);
  await page.getByRole('button', { name: 'Rejoin as DM', exact: true }).click();
  await expect(page.locator('.konvajs-content').first()).toBeVisible();
  await expect.poll(() => page.evaluate((id) => {
    const stages = (window as unknown as { Konva: { stages: any[] } }).Konva.stages;
    return stages.some(stage => stage.find('.token-hit-region').some((node: any) => node.getAttr('tokenId') === id));
  }, f.token.id)).toBe(true);
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

test('DM grants one level; the player previews an ASI before applying it', async ({ page, context, request }) => {
  const f = await fixture(request, page, {});
  f.socket.emit('resource:set', { characterId: f.characterId, group: 'resources', key: 'Superiority Dice', max: 4, used: 2 });
  await f.snapshot();
  await openDmSheet(page, f);
  await page.getByRole('button', { name: 'Grant level 4', exact: true }).click();
  const dmGuide = page.locator('[data-level-up="true"]');
  await expect(dmGuide).toBeVisible();
  await dmGuide.getByRole('button', { name: 'Close level-up guide' }).click();
  const player = await context.newPage();
  const guide = await openPlayer(player, f.code);
  await expect(guide).toContainText('Level 3 → 4');
  await guide.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(guide.getByRole('heading', { name: 'Your new class features' })).toBeVisible();
  await guide.getByRole('button', { name: 'Next', exact: true }).click();
  await guide.getByRole('combobox', { name: 'First +1', exact: true }).selectOption('STR');
  await guide.getByRole('combobox', { name: 'Second +1', exact: true }).selectOption('STR');
  await guide.getByRole('button', { name: 'Preview level-up', exact: true }).click();
  await expect(guide.getByRole('heading', { name: 'Review level 4' })).toBeVisible();
  await expect(guide).toContainText('31 → 39');
  await expect(guide).toContainText('STR: 16 → 18');
  await page.screenshot({ path: test.info().outputPath('dm-granted-level.png'), fullPage: true });
  await player.screenshot({ path: test.info().outputPath('player-level-up-preview.png'), fullPage: true });
  expect((await f.snapshot()).characters.find(c => c.id === f.characterId)!.level).toBe(3);
  await guide.getByRole('button', { name: 'Apply level 4', exact: true }).click();
  await expect(guide).toHaveCount(0);
  const result = (await f.snapshot()).characters.find(c => c.id === f.characterId)!;
  expect(result.level).toBe(4); expect(result.maxHp).toBe(39);
  expect(result.resources['Superiority Dice'].used).toBe(2);
  expect(result.leveling?.pending).toBeUndefined(); expect(result.leveling?.history).toHaveLength(1);
  expect(result.leveling?.history[0].choices.asi).toEqual({ STR: 2 });
  // The server ignores duplicate commits; the grant is no longer available.
  await expect(player.getByRole('button', { name: 'Continue level-up', exact: true })).toHaveCount(0);
  // Real library save must preserve ASIs/history and leave a new pending grant
  // with this original sheet rather than handing that grant to every copy.
  const nextGrant = await f.socket.timeout(5000).emitWithAck('character:levelGrant', { characterId: f.characterId });
  expect(nextGrant.ok).toBe(true);
  await player.locator('.character-window').getByRole('button', { name: /Save to library/ }).click();
  const library = player.locator('.modal').filter({ has: player.getByRole('heading', { name: 'Save character to library', exact: true }) });
  await expect(library).toBeVisible();
  const savedName = `Leveled Druk ${f.code}`;
  await library.getByLabel('Save as').fill(savedName);
  const saving = player.waitForResponse(response => response.url().includes('/api/library/characters') && response.request().method() === 'POST');
  await library.getByRole('button', { name: 'Save', exact: true }).click();
  expect((await saving).ok()).toBe(true);
  const copies = await (await request.get(`/api/library/characters?q=${encodeURIComponent(savedName)}`)).json();
  const saved = copies.find((copy: { name: string }) => copy.name === savedName);
  expect(saved.modifiers).toEqual(result.modifiers);
  expect(saved.leveling).toEqual({ rules: '2024', history: result.leveling!.history });
  expect((await f.snapshot()).characters.find(c => c.id === f.characterId)!.leveling?.pending?.toLevel).toBe(5);
  await player.close();
});

test('Wizard level-up requires two spellbook additions and the new cantrip', async ({ page, request }) => {
  const f = await fixture(request, page, { className: 'Wizard', subclass: 'Evoker', maxHp: 20 });
  const grant = await f.socket.timeout(5000).emitWithAck('character:levelGrant', { characterId: f.characterId });
  expect(grant.ok).toBe(true);
  const guide = await openPlayer(page, f.code);
  await guide.getByRole('button', { name: 'Next', exact: true }).click();
  await guide.getByRole('button', { name: 'Next', exact: true }).click();
  await guide.getByRole('combobox', { name: 'First +1', exact: true }).selectOption('INT');
  await guide.getByRole('combobox', { name: 'Second +1', exact: true }).selectOption('INT');
  await guide.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(guide).toContainText('Add 2 new spells. Add 1 new cantrip.');
  await guide.getByRole('button', { name: 'Preview level-up', exact: true }).click();
  await expect(guide.getByRole('alert')).toContainText('Choose 2 new spells');
  for (const name of ['Invisibility', 'Scorching Ray', 'Ray of Frost']) {
    await guide.getByLabel('Find a spell', { exact: true }).fill(name);
    await guide.getByRole('checkbox', { name: new RegExp(`^${name}`) }).check();
  }
  await guide.getByRole('button', { name: 'Preview level-up', exact: true }).click();
  await expect(guide.getByRole('heading', { name: 'Review level 4' })).toBeVisible();
  for (const name of ['Invisibility', 'Scorching Ray', 'Ray of Frost']) await expect(guide).toContainText(name);
  await guide.getByRole('button', { name: 'Apply level 4', exact: true }).click();
  await expect(guide).toHaveCount(0);
  const result = (await f.snapshot()).characters.find(c => c.id === f.characterId)!;
  expect(result.level).toBe(4);
  expect(result.leveling?.history[0].choices.spellNames).toEqual(['Invisibility', 'Scorching Ray']);
  expect(result.leveling?.history[0].choices.cantripNames).toEqual(['Ray of Frost']);
  expect(result.sheetAbilities.map(a => a.name)).toEqual(expect.arrayContaining(['Invisibility', 'Scorching Ray', 'Ray of Frost']));
});

test('Wizard 1 to 2 selects two spells without forcing a premature subclass or feat', async ({ page, request }) => {
  const f = await fixture(request, page, { level: 1, className: 'Wizard', subclass: '', maxHp: 8, proficientSkills: ['Arcana'] });
  const grant = await f.socket.timeout(5000).emitWithAck('character:levelGrant', { characterId: f.characterId });
  expect(grant.ok).toBe(true);
  const guide = await openPlayer(page, f.code);
  await guide.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(guide.getByLabel('Subclass', { exact: true })).toHaveCount(0);
  await guide.getByRole('checkbox', { name: /^Arcana/ }).check();
  await guide.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(guide.getByRole('heading', { name: 'Grow your spell collection' })).toBeVisible();
  for (const name of ['Magic Missile', 'Shield']) {
    await guide.getByLabel('Find a spell', { exact: true }).fill(name);
    await guide.getByRole('checkbox', { name: new RegExp(`^${name}`) }).check();
  }
  await guide.getByRole('button', { name: 'Preview level-up', exact: true }).click();
  await expect(guide.getByRole('heading', { name: 'Review level 2' })).toBeVisible();
  await expect(guide).toContainText('8 → 14');
  await guide.getByRole('button', { name: 'Apply level 2', exact: true }).click();
  await expect(guide).toHaveCount(0);
  const result = (await f.snapshot()).characters.find(c => c.id === f.characterId)!;
  expect(result.level).toBe(2); expect(result.subclass).toBe('');
  expect(result.leveling?.history[0].choices.spellNames).toEqual(['Magic Missile', 'Shield']);
});

test('Blessed Warrior reveals its own cantrip choices and clears them when the style changes', async ({ page, request }) => {
  const f = await fixture(request, page, { level: 1, className: 'Paladin', subclass: '' });
  const grant = await f.socket.timeout(5000).emitWithAck('character:levelGrant', { characterId: f.characterId });
  expect(grant.ok).toBe(true);
  const guide = await openPlayer(page, f.code);
  await guide.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(guide.getByRole('group', { name: /Blessed Warrior cantrips/ })).toHaveCount(0);
  await guide.getByRole('checkbox', { name: /^Blessed Warrior/ }).check();
  const cantrips = guide.getByRole('group', { name: /Blessed Warrior cantrips/ });
  await cantrips.getByRole('checkbox', { name: /^Guidance/ }).check();
  await cantrips.getByRole('checkbox', { name: /^Sacred Flame/ }).check();
  await guide.getByRole('checkbox', { name: /^Defense/ }).check();
  await expect(cantrips).toHaveCount(0);
  await guide.getByRole('checkbox', { name: /^Blessed Warrior/ }).check();
  await expect(cantrips.getByRole('checkbox', { checked: true })).toHaveCount(0);
  await guide.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(guide.getByRole('alert')).toContainText('Choose 2 for Blessed Warrior cantrips');
  await cantrips.getByRole('checkbox', { name: /^Guidance/ }).check();
  await cantrips.getByRole('checkbox', { name: /^Sacred Flame/ }).check();
  await guide.getByRole('button', { name: 'Next', exact: true }).click();
  // Normal Paladin preparation is optional here; style cantrips are separate.
  await guide.getByRole('button', { name: 'Preview level-up', exact: true }).click();
  await expect(guide.getByRole('heading', { name: 'Review level 2' })).toBeVisible();
  await guide.getByRole('button', { name: 'Apply level 2', exact: true }).click();
  await expect(guide).toHaveCount(0);
  const result = (await f.snapshot()).characters.find(c => c.id === f.characterId)!;
  expect(result.leveling?.history[0].choices.featureSelections?.warriorCantrips).toEqual(['Guidance', 'Sacred Flame']);
  expect(result.sheetAbilities.map(a => a.name)).toEqual(expect.arrayContaining(['Guidance', 'Sacred Flame']));
  await page.locator('.character-window').getByRole('button', { name: 'Spellbook', exact: true }).click();
  await expect(page.locator('.character-window .spell-caps')).toContainText(/Cantrips\s+2 bonus/);
});

test('Battle Master level 3 chooses maneuvers and keeps their 2024 definitions in Spellbook', async ({ page, request }) => {
  const f = await fixture(request, page, { level: 2, className: 'Fighter', subclass: '', proficientSkills: ['Athletics'] });
  const grant = await f.socket.timeout(5000).emitWithAck('character:levelGrant', { characterId: f.characterId });
  expect(grant.ok).toBe(true);
  const guide = await openPlayer(page, f.code);
  await guide.getByRole('button', { name: 'Next', exact: true }).click();
  await guide.getByRole('combobox', { name: 'Subclass', exact: true }).selectOption('Battle Master');
  const maneuvers = guide.getByRole('group', { name: /Battle Master maneuvers/ });
  await expect(maneuvers).toBeVisible();
  for (const name of ['Precision Attack', 'Pushing Attack', 'Riposte']) await maneuvers.getByRole('checkbox', { name: new RegExp(`^${name}`) }).check();
  await guide.getByRole('group', { name: /Student of War skill/ }).getByRole('checkbox', { name: /^Perception/ }).check();
  await guide.getByRole('button', { name: 'Preview level-up', exact: true }).click();
  await expect(guide.getByRole('heading', { name: 'Review level 3' })).toBeVisible();
  await guide.getByRole('button', { name: 'Apply level 3', exact: true }).click();
  await expect(guide).toHaveCount(0);
  const result = (await f.snapshot()).characters.find(c => c.id === f.characterId)!;
  expect(result.level).toBe(3); expect(result.subclass).toBe('Battle Master');
  expect(result.proficientSkills).toContain('Perception');
  expect(result.resources['Superiority Dice'].max).toBe(4);
  expect(result.sheetAbilities.find(a => a.name === 'Precision Attack')?.maneuver?.addDieTo).toBe('none');
  const resolved = page.waitForResponse(response => response.url().includes('/api/spells/resolve') && response.request().method() === 'POST');
  await page.locator('.character-window').getByRole('button', { name: 'Spellbook', exact: true }).click();
  expect((await resolved).ok()).toBe(true);
  await expect(page.locator('.character-window .spell-entry')).toContainText(['Precision Attack', 'Pushing Attack', 'Riposte']);
  await expect(page.locator('.character-window .rules-update')).toHaveCount(0);
});

test('Rolled HP is visible above the guide, persists once, and fits on a phone', async ({ page, request }) => {
  test.setTimeout(90_000);
  const f = await fixture(request, page, { level: 4 });
  const grant = await f.socket.timeout(5000).emitWithAck('character:levelGrant', { characterId: f.characterId });
  expect(grant.ok).toBe(true);
  await page.setViewportSize({ width: 390, height: 844 });
  const guide = await openPlayer(page, f.code);
  const bounds = await guide.boundingBox();
  expect(bounds).not.toBeNull(); expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.y).toBeGreaterThanOrEqual(0); expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(844);
  await page.screenshot({ path: test.info().outputPath('mobile-level-up-hp.png'), fullPage: true });
  await guide.getByRole('radio', { name: /Roll for HP/ }).check();
  await guide.getByRole('button', { name: 'Roll d10 for HP', exact: true }).click();
  const live = page.locator('[data-live-dice="true"]');
  await expect(live).toBeVisible({ timeout: 15_000 });
  // The actual top-layer dialog contains the real tray, not an inline fake die.
  expect(await live.evaluate(el => !!el.closest('dialog[open]'))).toBe(true);
  await expect(live.getByRole('group', { name: 'Live dice tray' })).toHaveAttribute('data-material', 'obsidian-gold');
  // Let the live toss enter the visible tray before taking its visual evidence.
  await page.waitForTimeout(400);
  await page.screenshot({ path: test.info().outputPath('mobile-level-up-live-die.png'), fullPage: true });
  await expect.poll(async () => (await f.snapshot()).characters.find(c => c.id === f.characterId)?.leveling?.pending?.hpRoll, { timeout: 40_000 }).toBeDefined();
  await expect(guide.getByRole('radio', { name: /Fixed increase/ })).toBeDisabled();
  const face = (await f.snapshot()).characters.find(c => c.id === f.characterId)!.leveling!.pending!.hpRoll!;
  expect(face).toBeGreaterThanOrEqual(1); expect(face).toBeLessThanOrEqual(10);
  await expect(guide).toContainText(`rolled ${face}`);
  // Wait for the result card, then close only that animation and keep choices.
  await expect(page.locator('.roll-reveal[data-roll-id]')).toBeVisible({ timeout: 40_000 });
  await page.locator('.roll-reveal[data-roll-id]').click();
  await guide.getByRole('button', { name: 'Close level-up guide' }).click();
  await page.getByRole('button', { name: 'Continue level-up', exact: true }).click();
  await expect(page.locator('[data-level-up="true"]')).toContainText(`rolled ${face}`);
  await expect(page.getByRole('button', { name: 'Roll d10 for HP', exact: true })).toHaveCount(0);
});
