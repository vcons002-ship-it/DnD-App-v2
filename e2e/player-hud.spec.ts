import { test, expect } from './helpers/test';
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
