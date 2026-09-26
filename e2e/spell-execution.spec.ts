import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import { io, type Socket } from 'socket.io-client';
import type { SheetAbility, StateSnapshot } from '../shared/types';
import { DM_SECRET, PORT } from './playwright.config';

// Every write is to Playwright's throwaway database. No installed/preview saves.
const connections: Socket[] = [];
test.afterEach(() => connections.splice(0).forEach((socket) => socket.disconnect()));

async function fixture(request: APIRequestContext, page: Page, spawnEnemies = true) {
  const response = await request.post('/api/sessions', {
    headers: { 'x-dm-passphrase': DM_SECRET }, data: { name: 'Spell workflow regression' },
  });
  expect(response.ok()).toBeTruthy();
  const { code } = await response.json();
  const socket = io(`http://localhost:${PORT}`, { transports: ['websocket'], forceNew: true });
  connections.push(socket);
  const snapshot = async (): Promise<StateSnapshot> => {
    const joined = await socket.timeout(5000).emitWithAck('join', { sessionCode: code, role: 'dm', dmPassphrase: DM_SECRET });
    expect(joined.ok).toBe(true);
    return joined.snapshot;
  };
  const initial = await snapshot();
  const characterId = initial.characters.find((character) => character.name === 'Vanec')!.id;
  const abilities: SheetAbility[] = [
    { id: 'hold', name: 'Hold Person', type: 'spell', level: 2, description: 'Save-only control spell; effects manual.' },
    { id: 'pattern', name: 'Hypnotic Pattern', type: 'spell', level: 3, description: 'Save-only area spell; effects manual.' },
    { id: 'command', name: 'Command', type: 'spell', level: 1, description: 'Save-only single target; effects manual.' },
    { id: 'fireball', name: 'Fireball', type: 'spell', level: 3, description: 'Area damage.', roll: { kind: 'save', dice: '8d6', save: 'DEX', damageType: 'fire', baseLevel: 3 } },
    { id: 'bolt', name: 'Test bolt', type: 'spell', level: 1, description: 'Manual damage attack.', roll: { kind: 'attack', dice: '2d6', baseLevel: 1, damageType: 'fire' } },
    { id: 'missile', name: 'Magic Missile', type: 'spell', level: 1, description: 'Darts.', roll: { kind: 'damage', dice: '1d4+1', instances: 3, baseLevel: 1, damageType: 'force' } },
    { id: 'ray', name: 'Scorching Ray', type: 'spell', level: 2, description: 'Separate rays.', roll: { kind: 'attack', dice: '2d6', baseLevel: 2, damageType: 'fire' } },
    { id: 'blast', name: 'Eldritch Blast', type: 'spell', level: 0, description: 'Separate beams.', roll: { kind: 'attack', dice: '1d10', scaleDice: '1d10', baseLevel: 0, damageType: 'force' } },
    { id: 'chromatic', name: 'Chromatic Orb', type: 'spell', level: 1, description: 'Choose damage for this cast.', roll: { kind: 'attack', dice: '3d8', scaleDice: '1d8', baseLevel: 1 } },
  ];
  socket.emit('character:update', { characterId, className: 'Sorcerer', level: 6,
    stats: { STR: 10, DEX: 10, CON: 10, INT: 20, WIS: 10, CHA: 16 },
    sheetAbilities: abilities, weapons: [],
    spellSlots: { L1: { max: 8, used: 0 }, L2: { max: 4, used: 0 }, L3: { max: 8, used: 0 } },
  });
  // Generate a plain, local fixture PNG in a browser canvas, not external art.
  const png = await page.evaluate(() => {
    const canvas = document.createElement('canvas'); canvas.width = 1000; canvas.height = 600;
    const ctx = canvas.getContext('2d')!; ctx.fillStyle = '#273128'; ctx.fillRect(0, 0, 1000, 600);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  const mapResponse = await request.post(`/api/sessions/${code}/maps`, {
    headers: { 'x-dm-passphrase': DM_SECRET }, multipart: { name: 'Spell test map',
      image: { name: 'fixture.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') } },
  });
  expect(mapResponse.ok()).toBeTruthy();
  const map = await mapResponse.json();
  socket.emit('map:setActive', { mapId: map.id });
  socket.emit('fog:setLayer', { mapId: map.id, layer: 'map', enabled: false });
  socket.emit('fog:setLayer', { mapId: map.id, layer: 'tokens', enabled: false });
  socket.emit('token:spawn', { mapId: map.id, kind: 'pc', refId: characterId, x: 300, y: 300 });
  if (spawnEnemies) {
    socket.emit('monster:create', { name: 'Save target', maxHp: 200, armorClass: 1,
      stats: { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 }, disposition: 'enemy' });
    const template = (await snapshot()).monsterTemplates.find((monster) => monster.name === 'Save target')!;
    for (const x of [500, 600]) socket.emit('token:spawn', { mapId: map.id, kind: 'monster', refId: template.id, x, y: 300 });
  }
  const ready = await snapshot();
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.goto(`/join?code=${code}`);
  await page.getByRole('button', { name: 'Join', exact: true }).click();
  await page.locator('.claim-row').filter({ hasText: 'Vanec' }).click();
  const combat = page.getByRole('region', { name: 'Combat panel', exact: true });
  await expect(combat).toBeVisible();
  const row = (name: string) => combat.locator('.combat-ability-row').filter({ hasText: name });
  const dismissReveal = async (expectedRollId?: string) => {
    // A DM-socket snapshot confirms server completion, not that this player's
    // socket has rendered the same roll yet. Wait for the known result before
    // dismissing it, otherwise a late reveal can intercept the next map click.
    if (expectedRollId) await expect(page.locator('.roll-reveal')).toHaveAttribute('data-roll-id', expectedRollId);
    if (await page.locator('.roll-reveal').count()) {
      await page.locator('.roll-reveal').click({ position: { x: 10, y: 10 } });
      await expect(page.locator('.roll-reveal')).toHaveCount(0);
    }
  };
  // Konva exposes this read-only scene geometry; still click through the real
  // browser hit-test, never call an app event handler or forge a client store.
  const clickToken = async (id: string, button: 'left' | 'right' = 'left') => {
    const point = await page.evaluate((tokenId) => {
      const stages = (window as unknown as { Konva: { stages: any[] } }).Konva.stages;
      const stage = stages.find((candidate) => candidate.find('.token-hit-region').length);
      const shape = stage.find('.token-hit-region').find((node: any) => node.getAttr('tokenId') === tokenId);
      const position = shape.getAbsolutePosition(), bounds = stage.container().getBoundingClientRect();
      return { x: bounds.left + position.x, y: bounds.top + position.y };
    }, id);
    await page.mouse.click(point.x, point.y, {button});
  };
  return { socket, snapshot, ready, characterId, abilities, combat, row, dismissReveal, clickToken };
}

test('single save casts at selected target; area save and damage apply independently without recasting', async ({ page, request }, testInfo) => {
  const f = await fixture(request, page);
  const errors: string[] = []; page.on('pageerror', (error) => errors.push(error.message));
  const targets = f.ready.tokens.filter((token) => token.kind === 'monster');
  await f.combat.getByLabel('Attack target').selectOption(targets[1].id);
  await f.row('Hold Person').getByRole('button').click();
  await expect.poll(async () => (await f.snapshot()).rollLog.find((roll) => roll.label === 'Hold Person')?.apply?.consumedTargets)
    .toEqual([targets[1].id]);
  let state = await f.snapshot();
  expect(state.characters.find((character) => character.id === f.characterId)!.sheetAbilities).toEqual(f.abilities);
  expect(state.characters.find((character) => character.id === f.characterId)!.spellSlots.L2.used).toBe(1);
  expect(state.monsters.every((monster: any) => monster.curHp === 200 && monster.conditions.length === 0)).toBe(true);
  await f.dismissReveal(state.rollLog.at(-1)!.id);
  await expect(page.locator('.spell-damage-dock')).toHaveCount(0);

  // Upcasting the same raw saved spell changes only this cast's target workflow.
  await f.row('Hold Person').getByTitle('Cast at level (upcast)').selectOption('3');
  await f.row('Hold Person').getByRole('button').click();
  const dock = page.locator('.spell-damage-dock');
  await expect(dock).toContainText('Roll saving throws');
  await expect(dock).not.toContainText('0 damage');
  const cast = [...(await f.snapshot()).rollLog].reverse().find((roll) => roll.label === 'Hold Person')!;
  expect(cast.apply!.targetMode).toBe('multiple');
  await dock.locator('.damage-prompt-btn').click();
  await expect(dock).toContainText('Choose targets on the map');
  for (const target of targets) {
    await f.clickToken(target.id);
    await expect.poll(async () => (await f.snapshot()).rollLog.find((roll) => roll.id === cast.id)?.apply?.consumedTargets)
      .toContain(target.id);
    await f.dismissReveal((await f.snapshot()).rollLog.at(-1)!.id);
  }
  const beforeDuplicate = (await f.snapshot()).rollLog.length;
  await f.clickToken(targets[0].id);
  expect((await f.snapshot()).rollLog).toHaveLength(beforeDuplicate);
  await dock.getByRole('button', { name: 'Done', exact: true }).click();
  expect((await f.snapshot()).characters.find((character) => character.id === f.characterId)!.spellSlots.L3.used).toBe(1);

  await f.row('Fireball').getByRole('button').click();
  await expect(page.locator('.roll-reveal')).toBeVisible();
  await f.dismissReveal();
  await expect(dock).toContainText('Apply spell damage');
  state = await f.snapshot();
  const fireball = state.rollLog.find((roll) => roll.label === 'Fireball')!;
  const hpBefore = targets.map((target) => (state.monsters.find((monster) => monster.id === target.refId) as any).curHp);
  await dock.locator('.damage-prompt-btn').click();
  await expect(dock).toContainText('Choose targets on the map');
  for (const target of targets) {
    await f.clickToken(target.id);
    await expect.poll(async () => (await f.snapshot()).rollLog.find((roll) => roll.id === fireball.id)?.apply?.consumedTargets)
      .toContain(target.id);
    await f.dismissReveal((await f.snapshot()).rollLog.at(-1)!.id);
  }
  state = await f.snapshot();
  targets.forEach((target, index) => {
    const amount = hpBefore[index] - (state.monsters.find((monster) => monster.id === target.refId) as any).curHp;
    expect([fireball.total, Math.floor(fireball.total / 2)]).toContain(amount);
  });
  expect(state.characters.find((character) => character.id === f.characterId)!.spellSlots.L3.used).toBe(2);
  expect(state.rollLog.filter((roll) => roll.label === 'Fireball')).toHaveLength(1);
  await page.screenshot({ path: testInfo.outputPath('spell-save-and-damage-workflow.png') });
  expect(errors).toEqual([]);
});

test('area and save-only area spells stay available when there is no hostile target', async ({ page, request }) => {
  const f = await fixture(request, page, false);
  await expect(f.combat.getByLabel('Attack target')).toHaveCount(0);
  await expect(f.row('Fireball').getByRole('button')).toBeEnabled();
  await expect(f.row('Hypnotic Pattern').getByRole('button')).toBeEnabled();
  await expect(f.row('Magic Missile').getByRole('button')).toBeEnabled();
  await expect(f.row('Hold Person').getByRole('button')).toBeDisabled();
  await f.row('Hypnotic Pattern').getByRole('button').click();
  await expect(page.locator('.spell-damage-dock')).toContainText('Roll saving throws');
  await expect(page.locator('.spell-damage-dock')).not.toContainText('0 damage');
  await page.getByRole('button', { name: 'Open chat and roll log', exact: true }).click();
  await expect(page.locator('.roll-entry').filter({ hasText: 'Hypnotic Pattern' }).getByRole('button', { name: '🎯 Roll saving throws', exact: true })).toBeVisible();
});

test('rays roll separate attacks and pause for existing manual damage without another slot spend', async ({ page, request }, testInfo) => {
  const f = await fixture(request, page);
  const targets = f.ready.tokens.filter((token) => token.kind === 'monster');
  await f.combat.getByRole('button', { name: /ADV$/ }).click();
  await f.row('Scorching Ray').getByRole('button').click();
  const dock = page.locator('.player-damage-dock');
  await expect(dock).toContainText('Assign rays');
  await expect(dock).toContainText('3 attacks left');
  const cast = (await f.snapshot()).rollLog.find((roll) => roll.label === 'Scorching Ray')!;
  expect(cast.apply?.attacks).toBe(3);
  await dock.locator('.damage-prompt-btn').click();
  for (let index = 0; index < 3; index++) {
    const target = targets[index % 2];
    const before = await f.snapshot();
    const hp = (before.monsters.find((monster) => monster.id === target.refId) as any).curHp;
    await f.clickToken(target.id);
    await expect.poll(async () => (await f.snapshot()).rollLog.find((roll) => roll.id === cast.id)?.apply?.consumedAttacks).toBe(index + 1);
    await expect(page.locator('.roll-reveal')).toBeVisible();
    let state = await f.snapshot();
    const attack = state.rollLog.at(-1)!;
    if (index === 0) expect(attack.detail).toMatch(/d20\[\d+,\d+\]/);
    else expect(attack.detail).not.toMatch(/d20\[\d+,\d+\]/);
    if (attack.pending) {
      // Main's reveal gating must survive the move into our player action dock:
      // a pending spell hit cannot offer damage before its d20 reveal finishes.
      await expect(dock.locator('.damage-prompt-btn')).toHaveCount(0);
    }
    await f.dismissReveal();
    if (attack.pending) {
      expect(attack.pending.sourceRollId).toBe(cast.id);
      expect((state.monsters.find((monster) => monster.id === target.refId) as any).curHp).toBe(hp);
      await expect(dock).toContainText(/roll damage/i);
      // A stray extra target click while the damage step is open must not
      // allocate another ray or bypass the attack's pending damage.
      if (index < 2) {
        await f.clickToken(targets[(index + 1) % 2].id);
        expect((await f.snapshot()).rollLog.find((roll) => roll.id === cast.id)?.apply?.consumedAttacks).toBe(index + 1);
      }
      await dock.locator('.damage-prompt-btn').click();
      await expect.poll(async () => (await f.snapshot()).rollLog.find((roll) => roll.id === attack.id)?.pending?.done).toBe(true);
      await expect(page.locator('.roll-reveal')).toBeVisible();
      await f.dismissReveal();
      state = await f.snapshot();
      expect((state.monsters.find((monster) => monster.id === target.refId) as any).curHp).toBeLessThan(hp);
    }
    if (index < 2) await expect(dock).toContainText(`${2 - index} attack`);
  }
  await expect(dock).toHaveCount(0);
  const state = await f.snapshot();
  expect(state.characters.find((character) => character.id === f.characterId)!.spellSlots.L2.used).toBe(1);
  expect(state.characters.find((character) => character.id === f.characterId)!.sheetAbilities).toEqual(f.abilities);
  await f.row('Eldritch Blast').getByRole('button').click();
  await expect(dock).toContainText('2 attacks left');
  const blast = (await f.snapshot()).rollLog.find((roll) => roll.label === 'Eldritch Blast')!;
  expect(blast.apply).toMatchObject({ attacks: 2, dice: '1d10' });
  await page.screenshot({ path: testInfo.outputPath('separate-ray-attacks.png') });
});

test('Chromatic Orb exposes a per-cast type and preserves its saved definition', async ({ page, request }, testInfo) => {
  const f = await fixture(request, page);
  const row = f.row('Chromatic Orb');
  const choice = row.getByLabel('Chromatic Orb damage type');
  await expect(choice).toHaveValue('acid');
  await expect(choice.locator('option')).toHaveCount(6);
  await choice.selectOption('cold');
  await row.getByRole('button').click();
  await expect(page.locator('.roll-reveal')).toBeVisible();
  const state = await f.snapshot();
  const cast = state.rollLog.find((roll) => roll.label === 'Attack' && roll.expr === 'Chromatic Orb')!;
  expect(cast).toBeTruthy();
  expect(state.characters.find((character) => character.id === f.characterId)!.sheetAbilities).toEqual(f.abilities);
  expect(state.characters.find((character) => character.id === f.characterId)!.spellSlots.L1.used).toBe(1);
  // A natural 1 may miss: selected type is checked on hits; the backend's
  // deterministic tests additionally verify cold resistance and invalid types.
  if (cast.pending) expect(cast.pending.damageType).toBe('cold');
  else expect(cast.reveal?.outcome).toMatch(/miss|fumble/);
  await f.dismissReveal();
  expect(await f.combat.locator('.floating-panel-content').evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('chromatic-orb-damage-choice.png') });
});

test('editing a profile-only spell preserves upcasting and explicit custom save overrides', async ({ page, request }) => {
  const f = await fixture(request, page);
  await page.locator('.hud-actions').getByRole('button', { name: 'Spellbook', exact: true }).click();
  const entry = page.getByRole('dialog').locator('.spell-entry').filter({ has: page.getByText('Command', { exact: true }) });
  await entry.locator('.spell-toggle').click();
  await expect(entry.getByTitle('Saving throw ability')).toHaveValue('WIS');
  await expect(entry.getByLabel('Damage on a successful save')).toHaveValue('none');
  await entry.getByPlaceholder('DC', { exact: true }).fill('18');
  await expect.poll(async () => (await f.snapshot()).characters.find((character) => character.id === f.characterId)!.sheetAbilities.find((ability) => ability.id === 'command')!.roll)
    .toEqual({ kind: 'save', dc: 18 });
  await page.getByRole('button', { name: 'Close character window', exact: true }).click();
  await f.row('Command').getByTitle('Cast at level (upcast)').selectOption('2');
  await f.row('Command').getByRole('button').click();
  await expect(page.locator('.spell-damage-dock')).toContainText('Roll saving throws');
  const cast = (await f.snapshot()).rollLog.find((roll) => roll.label === 'Command')!;
  expect(cast.apply).toMatchObject({ targetMode: 'multiple', save: 'WIS', dc: 18 });
  await page.locator('.spell-damage-dock').getByRole('button', { name: 'Close', exact: true }).click();
  await page.locator('.hud-actions').getByRole('button', { name: 'Spellbook', exact: true }).click();
  await entry.locator('.spell-toggle').click();
  await entry.getByTitle('Saving throw ability').selectOption('CON');
  await expect.poll(async () => (await f.snapshot()).characters.find((character) => character.id === f.characterId)!.sheetAbilities.find((ability) => ability.id === 'command')!.roll)
    .toMatchObject({ kind: 'save', dc: 18, save: 'CON', targetMode: 'single', saveDamage: 'none' });
});


test('Orb matching dice offers a free leap, sorted targets and right-click casting controls work', async ({page,request},testInfo) => {
  const f=await fixture(request,page);
  f.socket.emit('character:update',{characterId:f.characterId,spellSlots:{L7:{max:4,used:0}}});
  await f.snapshot();
  const targets=f.ready.tokens.filter(t=>t.kind==='monster');
  const options=await f.combat.getByLabel('Attack target').locator('option').allTextContents();
  expect(options.every(label=>/ ft/.test(label))).toBe(true);
  expect(options.map(label=>Number(label.match(/\u00b7 ([0-9.]+) ft/)![1]))).toEqual(
    options.map(label=>Number(label.match(/\u00b7 ([0-9.]+) ft/)![1])).sort((a,b)=>a-b));
  await f.combat.getByLabel('Attack target').selectOption(targets[0].id);
  const row=f.row('Chromatic Orb');
  await row.getByTitle('Cast at level (upcast)').selectOption('7');
  // Nine d8 guarantee matching faces. Only a natural 1 can miss this AC-1 target.
  let cast: any;
  for(let i=0;i<4;i++) {
    await row.getByRole('button').click();
    await expect(page.locator('.roll-reveal')).toBeVisible();
    cast=(await f.snapshot()).rollLog.filter(r=>r.apply?.orb).at(-1)!;
    await f.dismissReveal(cast.id);
    if(cast.pending) break;
  }
  expect(cast.pending).toBeTruthy();
  await expect(page.getByRole('region',{name:'Chromatic Orb',exact:true})).toHaveCount(0);
  await page.locator('.player-damage-dock .damage-prompt-btn').click();
  await expect(page.locator('.roll-reveal')).toBeVisible();
  await f.dismissReveal();
  const prompt=page.getByRole('region',{name:'Chromatic Orb',exact:true});
  await expect(prompt).toContainText('Matching dice');
  await expect(prompt).toContainText('Leap 1 of 7');
  await expect(prompt.locator('.orb-matches span')).not.toHaveCount(0);
  await page.screenshot({path:testInfo.outputPath('orb-matching-dice.png'),animations:'disabled'});
  const used=(await f.snapshot()).characters.find(c=>c.id===f.characterId)!.spellSlots.L7.used;
  const targetName=(await f.snapshot()).monsters.find(m=>m.id===targets[1].refId)!.name.replace(/ [0-9]+$/,'');
  await prompt.locator('.orb-targets button').filter({hasText:targetName}).first().click();
  await expect.poll(async()=> (await f.snapshot()).rollLog.filter(r=>r.apply?.orb).at(-1)?.apply?.orb?.leapsUsed).toBe(1);
  expect((await f.snapshot()).characters.find(c=>c.id===f.characterId)!.spellSlots.L7.used).toBe(used);
  await expect(page.locator('.roll-reveal')).toBeVisible(); await f.dismissReveal();
  const next=(await f.snapshot()).rollLog.filter(r=>r.apply?.orb).at(-1)!;
  if(next.pending) { await page.locator('.player-damage-dock .damage-prompt-btn').click(); await expect(page.locator('.roll-reveal')).toBeVisible(); await f.dismissReveal(); }
  if(next.apply?.orb?.available) await prompt.getByRole('button',{name:'End spell'}).click();
  await expect(prompt).toHaveCount(0);
  await f.clickToken(targets[1].id,'right');
  const menu=page.getByRole('dialog',{name:'Token actions'});
  await expect(menu).toBeVisible(); await expect(menu.getByLabel('Act as')).toHaveValue(f.ready.tokens.find(t=>t.refId===f.characterId)!.id);
  await expect(menu.getByRole('button',{name:'Adv',exact:true})).toBeVisible();
  await expect(menu.getByTitle('Cast at level (upcast)').first()).toBeVisible();
  await menu.getByRole('button',{name:'Adv',exact:true}).click();
  await expect(menu.getByRole('button',{name:'Adv',exact:true})).toHaveClass(/on/);
  await page.screenshot({path:testInfo.outputPath('expanded-token-menu.png')});
  await menu.getByLabel('Close token actions').click();
});
