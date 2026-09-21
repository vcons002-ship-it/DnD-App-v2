import { test, expect, type APIRequestContext } from '@playwright/test';
import { io, type Socket } from 'socket.io-client';
import type { SheetAbility, StateSnapshot } from '../shared/types';
import { DM_SECRET, PORT } from './playwright.config';

const BASE = `http://localhost:${PORT}`;
const connections: Socket[] = [];
test.afterEach(() => connections.splice(0).forEach((socket) => socket.disconnect()));

// All setup goes through the isolated E2E server. Never read a preview or live DB.
async function combatFixture(request: APIRequestContext) {
  const response = await request.post('/api/sessions', {
    headers: { 'x-dm-passphrase': DM_SECRET },
    data: { name: 'Compact combat regression' },
  });
  expect(response.ok()).toBeTruthy();
  const { code } = await response.json();
  const socket = io(BASE, { transports: ['websocket'], forceNew: true });
  connections.push(socket);
  const snapshot = async (): Promise<StateSnapshot> => {
    const result = await socket.timeout(5000).emitWithAck('join', {
      sessionCode: code,
      role: 'dm',
      dmPassphrase: DM_SECRET,
    });
    expect(result.ok).toBe(true);
    return result.snapshot;
  };
  const initial = await snapshot();
  const characterId = initial.characters.find((character) => character.name === 'Druk')!.id;
  const abilities: SheetAbility[] = [
    {
      id: 'layout-mastery', name: 'Graze mastery', type: 'mastery',
      description: 'Fixture weapon mastery.',
      mastery: { active: false, appliesToTags: ['heavy'], effect: { grazeOnMiss: true } },
    },
    {
      id: 'layout-maneuver', name: 'Precision maneuver', type: 'maneuver',
      description: 'Fixture Battle Master maneuver.',
      maneuver: { active: false, addDieTo: 'attack' },
    },
    {
      id: 'layout-stance', name: 'Tracking stance', type: 'stance',
      description: 'Fixture targeted stance.',
      stance: { active: false, appliesTo: 'all', targeted: true },
    },
    {
      id: 'layout-spell', name: 'Arcane test bolt', type: 'spell', level: 1,
      description: 'Fixture upcastable attack spell.',
      roll: { kind: 'attack', dice: '1d6', baseLevel: 1, scaleDice: '1d6' },
    },
    {
      id: 'layout-heal', name: 'Restoring test light', type: 'spell', level: 1,
      description: 'Fixture healing spell.',
      roll: { kind: 'heal', dice: '1d4', baseLevel: 1 },
    },
  ];
  socket.emit('character:update', {
    characterId,
    className: 'Fighter', subclass: 'Battle Master', level: 6,
    weapons: [
      { name: 'Test longsword', kind: 'melee', damage: '1d8', versatileDamage: '1d10', tags: ['versatile', 'heavy'] },
      { name: 'Test longbow', kind: 'ranged', damage: '1d8' },
    ],
    sheetAbilities: abilities,
    spellSlots: { L1: { max: 4, used: 0 }, L2: { max: 2, used: 0 } },
    resources: { 'Superiority Dice': { max: 4, used: 0 } },
  });
  const mapResponse = await request.post(`/api/sessions/${code}/maps`, {
    headers: { 'x-dm-passphrase': DM_SECRET },
    multipart: {
      name: 'Local fixture map',
      image: {
        name: 'fixture.png', mimeType: 'image/png',
        buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j9uoAAAAASUVORK5CYII=', 'base64'),
      },
    },
  });
  expect(mapResponse.ok()).toBeTruthy();
  const map = await mapResponse.json();
  socket.emit('map:setActive', { mapId: map.id });
  socket.emit('fog:setLayer', { mapId: map.id, layer: 'map', enabled: false });
  socket.emit('fog:setLayer', { mapId: map.id, layer: 'tokens', enabled: false });
  socket.emit('token:spawn', { mapId: map.id, kind: 'pc', refId: characterId, x: 100, y: 100 });
  socket.emit('monster:create', { name: 'Training foe', maxHp: 100, armorClass: 10, disposition: 'enemy' });
  const withTemplate = await snapshot();
  const foe = withTemplate.monsterTemplates.find((monster) => monster.name === 'Training foe')!;
  expect(foe).toBeTruthy();
  for (const x of [200, 300]) {
    socket.emit('token:spawn', { mapId: map.id, kind: 'monster', refId: foe.id, x, y: 100 });
  }
  const ready = await snapshot();
  expect(ready.tokens).toHaveLength(3);
  expect(ready.characters.find((character) => character.id === characterId)!.sheetAbilities).toHaveLength(5);
  return { code, characterId, snapshot, socket };
}

test('compact player combat keeps keyboard-operable targets, weapons, toggles and upcasts', async ({ page, request }) => {
  const fixture = await combatFixture(request);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1366, height: 768 });
  // The new single-header console must not inherit a hidden action area from
  // an older collapsed Combat section. Other reference preferences remain.
  await page.addInitScript((code) => {
    localStorage.setItem(`playerConsole:${code}-collapsed`, JSON.stringify(['combat', 'abilities']));
  }, fixture.code);
  await page.goto(`/join?code=${fixture.code}`);
  await page.getByRole('button', { name: 'Join', exact: true }).click();
  await page.locator('.claim-row').filter({ hasText: 'Druk' }).click();
  const panel = page.getByRole('region', { name: 'Combat panel', exact: true });
  const controls = panel.locator('.compact-player-combat');
  await expect(controls).toBeVisible();
  await expect(panel.getByRole('heading', { name: 'Combat', exact: true })).toHaveCount(1);
  await expect(panel.getByRole('heading', { name: 'Your attacks & abilities', exact: true })).toHaveCount(0);
  await expect(panel.locator('.reorder-label').filter({ hasText: /^Combat$/ })).toHaveCount(0);
  await expect(page.locator('.side.left, .side.right')).toHaveCount(0);

  const bounds = await panel.boundingBox();
  const bodyBounds = await page.locator('.body').boundingBox();
  expect(bounds!.width).toBeLessThanOrEqual(320);
  expect(bounds!.x + bounds!.width).toBeGreaterThanOrEqual(1350);
  expect(bounds!.y - bodyBounds!.y).toBeLessThanOrEqual(10);
  expect(await panel.locator('.floating-panel-content').evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);

  const target = controls.getByLabel('Attack target');
  await expect(target.locator('option')).toHaveCount(2);
  const targets = await target.locator('option').evaluateAll((options) => options.map((option) => (option as HTMLOptionElement).value));
  await target.focus();
  await page.keyboard.press('Home');
  await page.keyboard.press('ArrowDown');
  await expect(target).toHaveValue(targets[1]);

  for (const [name, onText] of [['Graze mastery', 'On'], ['Precision maneuver', 'Armed'], ['Tracking stance', 'On']]) {
    const row = controls.locator('.combat-toggle-row').filter({ hasText: name });
    const toggle = row.getByRole('button', { name: 'Off', exact: true });
    await toggle.focus();
    await page.keyboard.press('Enter');
    await expect(row.getByRole('button', { name: onText, exact: true })).toHaveClass(/\bon\b/);
    await row.getByRole('button', { name: onText, exact: true }).press('Enter');
    await expect(row.getByRole('button', { name: 'Off', exact: true })).toBeVisible();
  }
  await expect(controls.locator('.combat-toggle-row').filter({ hasText: 'Tracking stance' }).locator('select')).toBeVisible();

  const advantage = controls.getByRole('button', { name: /ADV$/ });
  await advantage.focus();
  await page.keyboard.press('Space');
  await expect(advantage).toHaveClass(/\bon\b/);
  await advantage.press('Space');
  await expect(advantage).not.toHaveClass(/\bon\b/);

  const weapons = controls.locator('.combat-weapon-list');
  await expect(weapons.getByRole('button')).toHaveCount(2);
  await expect(weapons.getByRole('button', { name: /Test longsword/ })).toBeEnabled();
  await expect(weapons.getByRole('button', { name: /Test longbow/ })).toBeEnabled();
  const twoHanded = controls.getByRole('button', { name: '2H', exact: true });
  await twoHanded.focus();
  await page.keyboard.press('Space');
  await expect(weapons.getByRole('button', { name: /Test longsword/ })).toContainText('1d10');
  await expect(controls.getByRole('button', { name: 'Off-hand', exact: true })).toBeEnabled();

  // Drive a real targeted attack from the compact panel, not a generic /roll.
  // Both displayed d20s must match the two faces the server recorded.
  await advantage.press('Space');
  await weapons.getByRole('button', { name: /Test longsword/ }).press('Enter');
  const reveal = page.locator('.roll-reveal');
  await expect(reveal.locator('.rr-comparison')).toHaveAttribute('data-mode', 'adv');
  await expect(reveal.locator('.rr-candidate')).toHaveCount(2);
  await expect(reveal.locator('.rr-candidate .three-die[data-sides="20"]')).toHaveCount(2);
  await expect(reveal.locator('.rr-candidate-label').filter({ hasText: /^Kept$/ })).toHaveCount(1);
  await expect(reveal.locator('.rr-candidate-label').filter({ hasText: /^Discarded$/ })).toHaveCount(1);
  const rolled = (await fixture.snapshot()).rollLog.find((roll) => roll.detail.includes('Test longsword') && /d20\[\d+,\d+\]/.test(roll.detail))!;
  expect(rolled).toBeTruthy();
  const recorded = /d20\[(\d+),(\d+)\]/.exec(rolled.detail)!;
  const values = [Number(recorded[1]), Number(recorded[2])];
  for (let index = 0; index < 2; index++) {
    await expect(reveal.locator(`.rr-candidate[data-candidate="${index}"] .three-die`)).toHaveAttribute('data-value', String(values[index]));
  }
  await expect(reveal.locator('.rr-candidate[data-result="kept"] .three-die')).toHaveAttribute('data-value', String(Math.max(...values)));
  await expect(advantage).not.toHaveClass(/\bon\b/);
  await page.keyboard.press('Escape');
  await expect(reveal).toHaveCount(0);
  if (rolled.pending && !rolled.pending.done) {
    // Existing two-step damage uses Enter/Space as a global shortcut. Finish
    // this explicit damage step before keyboard-activating another action.
    await page.getByTitle('Roll the damage for this hit and apply it (Enter / Space)').focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('.damage-prompt')).toHaveCount(0);
    await expect(reveal).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(reveal).toHaveCount(0);
  }

  const spell = controls.locator('.combat-ability-row').filter({ hasText: 'Arcane test bolt' });
  await expect(spell.getByRole('button')).toBeEnabled();
  const upcast = spell.getByTitle('Cast at level (upcast)');
  await upcast.focus();
  await page.keyboard.press('ArrowDown');
  await expect(upcast).toHaveValue('2');
  await expect(controls.locator('.combat-ability-row').filter({ hasText: 'Restoring test light' }).getByRole('button')).toBeEnabled();
  await expect(controls.getByText('Heal target', { exact: true })).toBeVisible();
  // Trackers belong only to the orb dock; combat still spends the same counters.
  await expect(controls.locator('.resources')).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Character resources', exact: true })
    .getByRole('group', { name: 'Superiority Dice: 4 of 4 remaining', exact: true })
    .locator('.resource-jewel')).toHaveCount(4);

  // A keyboard-activated spell still uses the original server-authoritative
  // cast path and spends the selected L2 slot, not a locally computed amount.
  await spell.getByRole('button').focus();
  await page.keyboard.press('Enter');
  await expect.poll(async () => {
    const state = await fixture.snapshot();
    return state.characters.find((character) => character.id === fixture.characterId)!.spellSlots.L2.used;
  }).toBe(1);
  expect(errors).toEqual([]);
});

test('DM opens initiative and the full combat inspector from its compact workspace', async ({ page, request }) => {
  const fixture = await combatFixture(request);
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto(`/dm?code=${fixture.code}`);
  await page.locator('input[type=password]').fill(DM_SECRET);
  await page.getByRole('button', { name: 'Rejoin as DM', exact: true }).click();
  await page.getByRole('button', { name: 'Initiative', exact: true }).click();
  await page.locator('.init-row').filter({ hasText: 'Druk' }).click();
  const left = page.locator('.side.left');
  const right = page.locator('.side.right');
  await expect(left).toBeVisible();
  await expect(right).toBeVisible();
  await expect(page.locator('.player-fantasy, .player-combat, .compact-player-console, .compact-player-combat')).toHaveCount(0);
  await expect(right.locator('.reorder-label').filter({ hasText: /^Combat$/ })).toHaveCount(1);
  await expect(right.locator('.attack-controls')).toBeVisible();
  await expect(right.locator('.combat-weapon-list')).toHaveCount(0);
  await expect(right.locator('.attack-controls > .attack-row')).toHaveCount(2);
  await expect(right.locator('.combat-toggles')).toHaveCSS('display', 'flex');
  await expect(right.getByText('Next roll', { exact: true })).toBeVisible();
  await expect(right.getByLabel('Attack target')).toBeVisible();
  expect((await left.boundingBox())!.width).toBe(360);
  expect((await right.boundingBox())!.width).toBe(360);
});

test('damage dock stays clickable above open panels; spells use the same dock without recasting', async ({ page, request }) => {
  const fixture = await combatFixture(request);
  fixture.socket.emit('character:update', {
    characterId: fixture.characterId,
    weapons: [{ name: 'Certain sword', kind: 'melee', damage: '1d4', attackBonus: 100 }],
    sheetAbilities: [
      { id: 'damage-fireball', name: 'Fireball', type: 'spell', level: 3, description: 'Fixture area save spell.', roll: { kind: 'save', dice: '8d6', save: 'DEX', baseLevel: 3, damageType: 'fire' } },
      { id: 'damage-missile', name: 'Magic Missile', type: 'spell', level: 1, description: 'Fixture split spell.', roll: { kind: 'damage', dice: '1d4+1', baseLevel: 1, instances: 3, scaleInstances: 1, damageType: 'force' } },
    ],
    spellSlots: { L1: { max: 4, used: 0 }, L3: { max: 3, used: 0 } },
  });
  await fixture.snapshot();
  await page.setViewportSize({ width: 860, height: 736 });
  await page.goto(`/join?code=${fixture.code}`);
  await page.getByRole('button', { name: 'Join', exact: true }).click();
  await page.locator('.claim-row').filter({ hasText: 'Druk' }).click();
  await page.getByRole('button', { name: 'Open chat and roll log', exact: true }).click();
  const combat = page.getByRole('region', { name: 'Combat panel', exact: true });
  // Bounded retry for a natural 1; no dice result is altered for the UI test.
  for (let attempt = 0; attempt < 5; attempt++) {
    await combat.getByRole('button', { name: /Certain sword/ }).click();
    await expect(page.locator('.roll-reveal')).toBeVisible();
    await page.keyboard.press('Escape');
    if (await page.locator('.damage-prompt-btn').count()) break;
  }
  const dock = page.locator('.player-damage-dock');
  const button = dock.locator('.damage-prompt-btn');
  await expect(button).toContainText(/roll damage/i);
  const weaponPosition = await dock.boundingBox();
  expect(await button.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return el.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
  })).toBe(true);
  // Keyboard activation of another button must not also apply pending damage.
  const before = (await fixture.snapshot()).rollLog.find((roll) => roll.pending && !roll.pending.done)!;
  await page.getByRole('button', { name: 'Interface settings', exact: true }).press('Enter');
  await expect(page.getByRole('region', { name: 'Interface settings', exact: true })).toBeVisible();
  expect((await fixture.snapshot()).rollLog.find((roll) => roll.id === before.id)?.pending?.done).not.toBe(true);
  await page.getByRole('button', { name: 'Close interface settings', exact: true }).click();
  await button.click(); // Real hit-test; force is deliberately not used.
  await expect(dock).toHaveCount(0);
  await expect(page.locator('.roll-reveal')).toBeVisible();
  await page.keyboard.press('Escape');
  expect((await fixture.snapshot()).rollLog.find((roll) => roll.id === before.id)?.pending?.done).toBe(true);

  for (const [name, level, text] of [['Fireball', 'L3', 'Apply spell damage'], ['Magic Missile', 'L1', 'Roll damage · assign darts']]) {
    await combat.locator('.combat-ability-row').getByRole('button', { name: new RegExp(name) }).click();
    if (name === 'Fireball') {
      await expect(page.locator('.roll-reveal')).toBeVisible();
      await page.keyboard.press('Escape');
    }
    await expect(button).toContainText(text);
    const spellPosition = await dock.boundingBox();
    expect(spellPosition!.x).toBe(weaponPosition!.x);
    expect(spellPosition!.y).toBe(weaponPosition!.y);
    const state = await fixture.snapshot();
    const cast = [...state.rollLog].reverse().find((roll) => roll.label === name)!;
    const character = state.characters.find((c) => c.id === fixture.characterId)!;
    expect(character.spellSlots[level].used).toBe(1);
    const count = state.rollLog.length;
    await button.click();
    await expect(button).toContainText('Choose targets on the map');
    await expect(page.locator('.save-resolve-banner')).toHaveCount(0);
    // Arming/closing only changes local targeting; no damage, new roll or slot spend.
    const armedState = await fixture.snapshot();
    expect(armedState.rollLog).toHaveLength(count);
    expect(armedState.characters.find((c) => c.id === fixture.characterId)!.spellSlots[level].used).toBe(1);
    await dock.getByRole('button', { name: 'Done', exact: true }).click();
    await expect(dock).toHaveCount(0);
    // Existing full-log control can reopen the same cast in the same dock.
    const entry = page.locator('.roll-entry').filter({ hasText: name }).filter({ has: page.locator('.apply-dmg') }).last();
    await entry.locator('.apply-dmg').click();
    await expect(button).toContainText('Choose targets on the map');
    await expect(dock).toContainText(name);
    await dock.getByRole('button', { name: 'Done', exact: true }).click();
    if (name === 'Magic Missile') {
      // Server ownership/budget is unchanged; its three explicit target actions
      // close the prompt, and reconnect does not resurrect spent darts.
      const target = state.tokens.find((token) => token.kind === 'monster')!;
      for (let i = 0; i < 3; i++) fixture.socket.emit('save:resolve', { rollId: cast.id, tokenId: target.id });
      expect((await fixture.snapshot()).rollLog.find((roll) => roll.id === cast.id)!.apply!.consumedDarts).toBe(3);
      await page.reload();
      await expect(page.locator('.player-hud')).toBeVisible();
      await expect(dock).toHaveCount(0);
    }
  }
});
