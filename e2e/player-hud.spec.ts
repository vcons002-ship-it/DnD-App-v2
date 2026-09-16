import { test, expect } from '@playwright/test';
import { io, type Socket } from 'socket.io-client';
import { DM_SECRET, PORT } from './playwright.config';

const BASE = `http://localhost:${PORT}`;
const connections: Socket[] = [];
async function join(code: string, role = 'player') {
  const socket = io(BASE, { transports: ['websocket'], forceNew: true });
  connections.push(socket);
  const result: any = await socket.timeout(5000).emitWithAck('join', {
    sessionCode: code,
    role,
    ...(role === 'dm' ? { dmPassphrase: DM_SECRET } : {}),
  });
  return { socket, result };
}
test.afterEach(() => {
  connections.splice(0).forEach((s) => s.disconnect());
});

test('invalid roles cannot receive a privileged snapshot', async ({
  request,
}) => {
  const res = await request.post('/api/sessions', {
    headers: { 'x-dm-passphrase': DM_SECRET },
    data: { name: 'Role gate test' },
  });
  const { code } = await res.json();
  for (const role of ['spectator', 'admin', '', 'DM']) {
    const { result } = await join(code, role);
    expect(result).toMatchObject({ ok: false, error: { code: 'BAD_ROLE' } });
    expect(result.snapshot).toBeUndefined();
  }
});

test('resource edits require both session membership and character ownership', async ({
  request,
}) => {
  const make = async () =>
    (
      await (
        await request.post('/api/sessions', {
          headers: { 'x-dm-passphrase': DM_SECRET },
          data: { name: 'Resource gate test' },
        })
      ).json()
    ).code;
  const first = await make(),
    second = await make();
  const remote = await join(second, 'dm');
  const target = remote.result.snapshot.characters[0];
  const otherDm = await join(first, 'dm');
  const unclaimedPlayer = await join(second);
  for (const s of [otherDm.socket, unclaimedPlayer.socket]) {
    s.emit('resource:set', {
      characterId: target.id,
      group: 'resources',
      key: 'Unauthorized row',
      max: 99,
      used: 0,
    });
    // Ordered socket events: a new join acknowledgement reads state after the edit.
    const after: any = await s.timeout(5000).emitWithAck('join', {
      sessionCode: second,
      role: 'dm',
      dmPassphrase: DM_SECRET,
    });
    expect(
      after.snapshot.characters.find((c: any) => c.id === target.id).resources[
        'Unauthorized row'
      ],
    ).toBeUndefined();
  }
});

test('laptop HUD edits resources and keeps chat, character windows and every 3D die usable', async ({
  page,
  request,
}) => {
  const res = await request.post('/api/sessions', {
    headers: { 'x-dm-passphrase': DM_SECRET },
    data: { name: 'HUD regression' },
  });
  const { code } = await res.json();
  await page.setViewportSize({ width: 1366, height: 768 });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`/join?code=${code}`);
  await page.getByRole('button', { name: 'Join', exact: true }).click();
  await page.locator('.claim-row').filter({ hasText: 'Druk' }).click();
  await expect(page.locator('[data-testid="player-hud"]')).toBeVisible();
  await expect(page.locator('.player-combat')).toBeInViewport();
  const rail = page.locator('.hud-actions');
  await expect(rail.locator('svg')).toHaveCount(5);
  const firstIcon = rail.getByRole('button', { name: 'Character', exact: true });
  const lastIcon = rail.getByRole('button', { name: 'Party', exact: true });
  const firstBox = (await firstIcon.boundingBox())!;
  const lastBox = (await lastIcon.boundingBox())!;
  expect(firstBox.x).toBeLessThan(20);
  expect(lastBox.x).toBe(firstBox.x);
  expect(lastBox.y).toBeGreaterThan(firstBox.y);
  await firstIcon.hover();
  await expect(firstIcon.locator('.hud-tooltip')).toBeVisible();
  await page.mouse.move(600, 200);
  await firstIcon.press('Tab');
  await page.keyboard.press('Shift+Tab');
  await expect(firstIcon.locator('.hud-tooltip')).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  const hudBox = (await page.locator('.hud-bottom').boundingBox())!;
  expect(hudBox.width).toBeLessThanOrEqual(450);
  expect(hudBox.height).toBeLessThanOrEqual(220);
  // Zero temporary HP needs no second vessel, badge or empty shield display.
  await expect(page.locator('.temp-vessel, .orb-temp-shield, .orb-temp-bonus')).toHaveCount(0);
  await expect(page.locator('.main-orb')).toBeInViewport({ ratio: 1 });
  expect(await page.locator('.health-reliquary').evaluate((element) => {
    const globe = element.querySelector('.main-orb')!.getBoundingClientRect();
    return element.contains(document.elementFromPoint(globe.x + globe.width / 2, globe.y + globe.height / 2));
  }), 'The health orb retains an unobstructed health/temp-controls target').toBe(true);
  const combatBox = (await page.locator('.player-combat').boundingBox())!;
  expect(combatBox.x + combatBox.width).toBeGreaterThan(1355);
  expect(combatBox.y - (await page.locator('.body').boundingBox())!.y).toBeLessThanOrEqual(7);
  // The first ten prioritized rows stay inline; overflow has its own drawer.
  const customToggle = page.getByRole('button', { name: /^Additional resources/ });
  await expect(customToggle).toHaveCount(0);
  await expect(page.locator('.custom-resource-drawer')).toHaveCount(0);
  await expect(page.locator('[data-testid="player-hud"]').getByRole('button', { name: '+ Row', exact: true })).toHaveCount(0);
  // Tracker management belongs in the character record, not on the map HUD.
  await firstIcon.click();
  const characterWindow = page.locator('.character-window');
  const resourceManager = characterWindow.locator('.resources');
  await expect(resourceManager.getByRole('heading', { name: 'Resources', exact: true })).toBeVisible();
  await expect(resourceManager.getByRole('button', { name: '+ Row', exact: true })).toHaveCount(1);
  await expect(resourceManager.getByRole('button', { name: '+ Add', exact: true })).toHaveCount(0);
  await resourceManager.getByRole('button', { name: '+ Row', exact: true }).click();
  const addResource = page.getByRole('form', { name: 'Add resource row', exact: true });
  await addResource.getByLabel('Name', { exact: true }).fill('Rune charges');
  await addResource.getByLabel('Maximum', { exact: true }).fill('7');
  await addResource.getByRole('button', { name: 'Add row', exact: true }).click();
  await expect(resourceManager.locator('.res-row').filter({ hasText: 'Rune charges' })).toBeVisible();
  await characterWindow.getByRole('button', { name: 'Close character window', exact: true }).click();
  await expect(characterWindow).toHaveCount(0);
  await expect(page.getByRole('button', { name: '+ Row', exact: true })).toHaveCount(0);
  const row = page.locator('.core-resource-rows').getByRole('group', { name: /^Rune charges:/ });
  await expect(row).toBeVisible();
  await expect(page.locator('.custom-resource-drawer')).toHaveCount(0);
  await expect(row.locator('.resource-jewel.lit')).toHaveCount(7);
  await row.locator('.resource-jewel').nth(3).click();
  await expect(row.locator('.resource-jewel.lit')).toHaveCount(4);
  await page.reload();
  await expect(page.locator('[data-testid="player-hud"]')).toBeVisible();
  await expect(customToggle).toHaveCount(0);
  await expect(page.locator('.custom-resource-drawer')).toHaveCount(0);
  await expect(row.locator('.resource-jewel.lit')).toHaveCount(4);

  await page
    .locator('.hud-actions')
    .getByRole('button', { name: 'Inventory', exact: true })
    .click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.locator('.player-chat header button').click();
  await expect(page.locator('.chat-input input')).toBeInViewport();
  await page.locator('.chat-dice-options summary').click();
  for (const sides of [4, 6, 8, 10, 12, 20, 100]) {
    await page
      .locator('.dice-quick')
      .getByRole('button', { name: `d${sides}`, exact: true })
      .click();
    const dice = page.locator('.roll-reveal .three-die');
    await expect(dice).toHaveCount(sides === 100 ? 2 : 1);
    await expect(dice.first()).toHaveAttribute(
      'data-sides',
      String(sides === 100 ? 10 : sides),
    );
    await expect(
      page.locator('.roll-reveal canvas[aria-label*="rolling"]'),
    ).toHaveCount(0);
    await expect(page.locator('.roll-reveal canvas[data-orientation="face-forward"]')).toHaveCount(sides === 100 ? 2 : 1);
    await page.locator('.roll-reveal').click();
  }
  for (const [expr, mode, dicePerSet] of [
    ['1d20', 'adv', 1],
    ['1d20', 'dis', 1],
    ['2d6+1d4+3', 'adv', 3],
    ['1d100', 'dis', 2],
  ] as const) {
    await page.locator('.chat-input input').fill(`/roll ${expr} ${mode}`);
    await page.locator('.chat-input input').press('Enter');
    const comparison = page.locator(`.rr-comparison[data-mode="${mode}"]`);
    await expect(comparison.locator('.rr-candidate')).toHaveCount(2);
    await expect(comparison.locator('.three-die')).toHaveCount(dicePerSet * 2);
    await expect(comparison.locator('[data-result="kept"]')).toHaveCount(1);
    await expect(comparison.locator('[data-result="discarded"]')).toHaveCount(1);
    await expect(comparison.locator('canvas[data-orientation="face-forward"]')).toHaveCount(dicePerSet * 2);
    await page.locator('.roll-reveal').click();
  }
  expect(errors).toEqual([]);
});

test('character resource manager retains zero rows, duplicate protection and manual spell maxima', async ({ page, request }) => {
  const response = await request.post('/api/sessions', {
    headers: { 'x-dm-passphrase': DM_SECRET },
    data: { name: 'Character resource manager regression' },
  });
  expect(response.ok()).toBeTruthy();
  const { code } = await response.json();
  const { socket, result } = await join(code, 'dm');
  const characterId = result.snapshot.characters.find((character: any) => character.name === 'Druk').id;
  const snapshot = async () => {
    const next: any = await socket.timeout(5000).emitWithAck('join', {
      sessionCode: code, role: 'dm', dmPassphrase: DM_SECRET,
    });
    expect(next.ok).toBe(true);
    return next.snapshot.characters.find((character: any) => character.id === characterId);
  };
  socket.emit('character:update', {
    characterId, className: 'Fighter', subclass: 'Battle Master', level: 6,
    spellSlots: {}, resources: { 'Existing mark': { max: 3, used: 1 } },
  });
  const initial = await snapshot();
  expect(initial.spellSlots.L4).toBeUndefined();
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto(`/join?code=${code}`);
  await page.getByRole('button', { name: 'Join', exact: true }).click();
  await page.locator('.claim-row').filter({ hasText: 'Druk' }).click();
  await expect(page.locator('[data-testid="player-hud"]')).toBeVisible();
  // This editor regression deliberately includes a zero-capacity row and an
  // oversized manual pool. Compact rows keep both inline; concentric defaults
  // and their fit/overflow rules have dedicated layout/ring coverage.
  await page.getByRole('button', { name: 'Interface settings', exact: true }).click();
  await page.getByLabel('Compact rows', { exact: true }).check();
  await page.getByRole('button', { name: 'Close interface settings', exact: true }).click();
  await page.locator('.hud-actions').getByRole('button', { name: 'Character', exact: true }).click();
  const characterWindow = page.locator('.character-window');
  const manager = characterWindow.locator('.resources');
  const addButton = manager.getByRole('button', { name: '+ Row', exact: true });
  const form = page.getByRole('form', { name: 'Add resource row', exact: true });
  await expect(addButton).toHaveCount(1);
  await expect(manager.getByRole('button', { name: '+ Add', exact: true })).toHaveCount(0);

  await addButton.click();
  await form.getByLabel('Name', { exact: true }).fill('Dormant rune');
  await form.getByLabel('Maximum', { exact: true }).fill('0');
  await form.getByRole('button', { name: 'Add row', exact: true }).click();
  await expect(form).toHaveCount(0);
  await expect(manager.locator('.res-row').filter({ hasText: 'Dormant rune' })).toContainText('0/0');
  expect((await snapshot()).resources['Dormant rune']).toMatchObject({ max: 0, used: 0 });

  // Moving the form cannot turn duplicate creation into an overwrite of a
  // character's existing maximum or spent uses.
  await addButton.click();
  await form.getByLabel('Name', { exact: true }).fill('Existing mark');
  await form.getByLabel('Maximum', { exact: true }).fill('99');
  await expect(form.getByRole('status')).toContainText('already exists');
  await expect(form.getByRole('button', { name: 'Add row', exact: true })).toBeDisabled();
  await form.getByRole('button', { name: 'Cancel', exact: true }).click();
  expect((await snapshot()).resources['Existing mark']).toEqual(initial.resources['Existing mark']);

  // A deliberately nonstandard missing spell level is still a manual tracker,
  // not a class/level rule conversion. Its override survives the new editor.
  await addButton.click();
  await form.getByRole('combobox', { name: 'Kind', exact: true }).selectOption('spellSlots');
  await form.getByRole('combobox', { name: 'Spell level', exact: true }).selectOption('L4');
  await form.getByLabel('Maximum', { exact: true }).fill('5');
  await form.getByRole('button', { name: 'Add row', exact: true }).click();
  await expect(form).toHaveCount(0);
  await expect(manager.locator('.res-row').filter({ hasText: 'Lvl 4' })).toContainText('5/5');
  const saved = await snapshot();
  expect(saved.spellSlots.L4).toMatchObject({ max: 5, used: 0, maxOverride: true });
  await characterWindow.getByRole('button', { name: 'Close character window', exact: true }).click();
  await expect(page.getByRole('button', { name: '+ Row', exact: true })).toHaveCount(0);
  await page.reload();
  await expect(page.locator('[data-testid="player-hud"]')).toBeVisible();
  const levelFour = page.locator('.core-resource-rows .jewel-row').filter({
    has: page.getByRole('button', { name: /^Level 4: 5 of 5 remaining/ }),
  });
  await expect(levelFour.locator('.resource-jewel.extra')).toHaveCount(5);
  const customToggle = page.getByRole('button', { name: /^Additional resources/ });
  await expect(customToggle).toHaveCount(0);
  await expect(page.locator('.core-resource-rows').getByRole('button', { name: /^Dormant rune: 0 of 0 remaining/ })).toBeVisible();
  const reloaded = await snapshot();
  expect(reloaded.spellSlots).toEqual(saved.spellSlots);
  expect(reloaded.resources).toEqual(saved.resources);
});

test('reduced-motion and unavailable WebGL have a usable static fallback', async ({
  browser,
  request,
}) => {
  const res = await request.post('/api/sessions', {
    headers: { 'x-dm-passphrase': DM_SECRET },
    data: { name: 'Fallback regression' },
  });
  const { code } = await res.json();
  const context = await browser.newContext({ reducedMotion: 'reduce' });
  await context.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (
      kind: any,
      ...args: any[]
    ) {
      if (kind === 'webgl') return null;
      return original.call(this, kind, ...args);
    } as typeof original;
  });
  const page = await context.newPage();
  await page.goto(`/join?code=${code}`);
  await page.getByRole('button', { name: 'Join', exact: true }).click();
  await page.locator('.claim-row').filter({ hasText: 'Druk' }).click();
  await expect(page.locator('.liquid-orb.fallback')).toHaveCount(1);
  await page.locator('.player-chat header button').click();
  await page.locator('.chat-input input').fill('/roll 1d100');
  await page.locator('.chat-input input').press('Enter');
  await expect(page.locator('.roll-reveal .three-die')).toHaveCount(2);
  await expect(
    page.locator('.roll-reveal canvas[aria-label*="rolling"]'),
  ).toHaveCount(0);
  await expect(page.locator('.roll-reveal canvas[data-orientation="face-forward"]')).toHaveCount(2);
  await context.close();
});
