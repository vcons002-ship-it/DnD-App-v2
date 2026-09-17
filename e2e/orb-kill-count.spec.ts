import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import { io, type Socket } from 'socket.io-client';
import type { StateSnapshot } from '../shared/types';
import { DM_SECRET, PORT } from './playwright.config';

const connections: Socket[] = [];
test.afterEach(() => connections.splice(0).forEach((socket) => socket.disconnect()));

// All fixture writes use the config's throwaway database. There is deliberately
// no API for setting a kill tally: production credit rules remain unchanged.
async function fixture(request: APIRequestContext) {
  const response = await request.post('/api/sessions', {
    headers: { 'x-dm-passphrase': DM_SECRET }, data: { name: 'Orb kill tally regression' },
  });
  expect(response.ok()).toBeTruthy();
  const { code } = await response.json();
  const socket = io(`http://localhost:${PORT}`, { transports: ['websocket'], forceNew: true });
  connections.push(socket);
  const snapshot = async (): Promise<StateSnapshot> => {
    const joined = await socket.timeout(5000).emitWithAck('join', {
      sessionCode: code, role: 'dm', dmPassphrase: DM_SECRET,
    });
    expect(joined.ok).toBe(true);
    return joined.snapshot;
  };
  const initial = await snapshot();
  const character = initial.characters.find((entry) => entry.name === 'Druk')!;
  socket.emit('character:update', {
    characterId: character.id, race: 'Half-Orc', className: 'Fighter', level: 6,
    maxHp: 52, curHp: 43, tempHp: 8, armorClass: 18,
    stats: { STR: 18, DEX: 12, CON: 16, INT: 10, WIS: 12, CHA: 10 },
    weapons: [{ name: 'Tally sword', kind: 'melee', damage: '1d8', attackBonus: 100 }],
    resources: { 'Superiority Dice': { max: 4, used: 1 }, 'Second Wind': { max: 2, used: 0 } },
  });
  await snapshot();
  return { code, socket, snapshot, characterId: character.id };
}

async function joinPlayer(page: Page, code: string) {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto(`/join?code=${code}`);
  await page.getByRole('button', { name: 'Join', exact: true }).click();
  await page.locator('.claim-row').filter({ hasText: 'Druk' }).click();
  await expect(page.locator('[data-testid="player-hud"]')).toBeVisible();
}

test('orb tally shows zero, receives existing manual-damage kill credit and survives reload', async ({ page, request }) => {
  const f = await fixture(request);
  // Minimal generated map: no preview campaign or production assets are read.
  const image = await page.evaluate(() => {
    const canvas = document.createElement('canvas'); canvas.width = 900; canvas.height = 600;
    const context = canvas.getContext('2d')!; context.fillStyle = '#273128'; context.fillRect(0, 0, 900, 600);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  const response = await request.post(`/api/sessions/${f.code}/maps`, {
    headers: { 'x-dm-passphrase': DM_SECRET }, multipart: {
      name: 'Tally fixture', image: { name: 'fixture.png', mimeType: 'image/png', buffer: Buffer.from(image, 'base64') },
    },
  });
  expect(response.ok()).toBeTruthy();
  const map = await response.json();
  f.socket.emit('map:setActive', { mapId: map.id });
  f.socket.emit('fog:setLayer', { mapId: map.id, layer: 'map', enabled: false });
  f.socket.emit('fog:setLayer', { mapId: map.id, layer: 'tokens', enabled: false });
  f.socket.emit('token:spawn', { mapId: map.id, kind: 'pc', refId: f.characterId, x: 300, y: 200 });
  f.socket.emit('monster:create', { name: 'Tally target', disposition: 'enemy', maxHp: 1, armorClass: 1 });
  const template = (await f.snapshot()).monsterTemplates.find((entry) => entry.name === 'Tally target')!;
  f.socket.emit('token:spawn', { mapId: map.id, kind: 'monster', refId: template.id, x: 500, y: 200 });
  const ready = await f.snapshot();
  const attacker = ready.tokens.find((entry) => entry.refId === f.characterId)!;
  const target = ready.tokens.find((entry) => entry.kind === 'monster')!;
  await joinPlayer(page, f.code);
  const badge = page.locator('.orb-kill-count');
  await expect(badge).toBeVisible();
  await expect(badge).toHaveAttribute('data-kill-count', '0');
  await expect(badge).toHaveAccessibleName('Druk: 0 kills');
  await expect(badge).toHaveCSS('pointer-events', 'none');
  const badgeBox = (await badge.boundingBox())!;
  await page.mouse.click(badgeBox.x + badgeBox.width / 2, badgeBox.y + badgeBox.height / 2);
  await expect(page.getByRole('region', { name: 'Health controls', exact: true })).toBeVisible();
  await page.getByRole('region', { name: 'Health controls', exact: true }).getByRole('button', { name: 'Close', exact: true }).click();
  let pending;
  for (let attempt = 0; attempt < 8; attempt++) {
    // Natural 1 is still allowed; retry an actual authoritative attack, never
    // manufacture the roll or bypass the user's second-click damage workflow.
    f.socket.emit('combat:attack', { attackerTokenId: attacker.id, targetTokenId: target.id, weaponIndex: 0 });
    pending = (await f.snapshot()).rollLog.findLast((entry) => entry.pending && !entry.pending.done);
    if (pending) break;
  }
  expect(pending).toBeTruthy();
  await expect(badge).toHaveAttribute('data-kill-count', '0');
  f.socket.emit('combat:damage', { rollId: pending!.id });
  await expect(badge).toHaveAttribute('data-kill-count', '1');
  await expect(badge).toHaveAccessibleName('Druk: 1 kill');
  const killed = await f.snapshot();
  expect(killed.characters.find((entry) => entry.id === f.characterId)!.killCount).toBe(1);
  expect(killed.monsters.find((entry) => entry.id === target.refId)!.curHp).toBe(0);
  // Existing once-only pending damage protection also prevents tally inflation.
  f.socket.emit('combat:damage', { rollId: pending!.id });
  expect((await f.snapshot()).characters.find((entry) => entry.id === f.characterId)!.killCount).toBe(1);
  await page.reload();
  await expect(badge).toHaveAttribute('data-kill-count', '1');
  await expect(badge).toHaveAccessibleName('Druk: 1 kill');
});

test('large orb tallies retain readable gothic text without covering health, AC or resources', async ({ page, request }, testInfo) => {
  const f = await fixture(request);
  let displayCount = 9999;
  // Display-only edge cases: amend snapshots travelling TO this test browser,
  // not the server or DB. The real kill-credit/persistence path is tested above.
  await page.routeWebSocket(/\/socket\.io\//, (websocket) => {
    const server = websocket.connectToServer();
    server.onMessage((message) => {
      if (typeof message === 'string' && message.startsWith('42["state:snapshot",')) {
        const [event, snapshot] = JSON.parse(message.slice(2)) as [string, StateSnapshot];
        const character = snapshot.characters.find((entry) => entry.id === f.characterId);
        if (character) character.killCount = displayCount;
        websocket.send(`42${JSON.stringify([event, snapshot])}`);
      } else websocket.send(message);
    });
  });
  await joinPlayer(page, f.code);
  const badge = page.locator('.orb-kill-count');
  await expect(badge).toHaveAttribute('data-kill-count', '9999');
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  for (const [race, className, art] of [
    ['Half-Orc', 'Fighter', 'half-orc-fighter'],
    ['Tiefling', 'Sorcerer', 'tiefling-sorcerer'],
    ['Half-Elf', 'Ranger', 'half-elf-ranger'],
    ['Human', 'Wizard', 'generic-orb'],
  ]) {
    const spellSlots = className === 'Fighter' ? {} : {
      L1: { max: 4, used: 1 }, L2: { max: className === 'Ranger' ? 2 : 3, used: 1 },
      ...(className !== 'Ranger' ? { L3: { max: 3, used: 1 } } : {}),
    };
    const resources = className === 'Fighter'
      ? { 'Superiority Dice': { max: 4, used: 1 }, 'Second Wind': { max: 2, used: 0 } }
      : className === 'Sorcerer' ? { 'Sorcery Points': { max: 6, used: 2 } } : {};
    f.socket.emit('character:update', { characterId: f.characterId, race, className, spellSlots, resources });
    await expect(page.locator('[data-testid="player-hud"]')).toHaveAttribute('data-orb-art', art);
    for (const [width, scale] of [[980, 70], [980, 85], [980, 115], [1366, 70], [1366, 115], [1366, 85]]) {
      await page.setViewportSize({ width, height: 768 });
      await page.getByRole('button', { name: 'Interface settings', exact: true }).click();
      await page.locator('#player-ui-scale').fill(String(scale));
      await page.getByRole('button', { name: 'Close interface settings', exact: true }).click();
      const layout = await badge.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        const value = element.querySelector('.orb-kill-value')!;
        const lineBox = value.getBoundingClientRect();
        const valueBox = element.querySelector('.orb-kill-inscription')!.getBoundingClientRect();
        const textRange = document.createRange(); textRange.selectNodeContents(value);
        const textBox = textRange.getBoundingClientRect();
        return {
          visible: rect.x >= 0 && rect.y >= 0 && rect.right <= innerWidth && rect.bottom <= innerHeight,
          // Cinzel's font-ascent Range extends above its visible capitals. The
          // actual line box must fit vertically; glyph width must fit its cell.
          textFits: textBox.width <= valueBox.width + 1 && lineBox.top >= rect.top - 1 && lineBox.bottom <= rect.bottom + 1,
          textBounds: { text: textBox.toJSON(), inscription: valueBox.toJSON(), badge: rect.toJSON() },
          font: getComputedStyle(value).fontFamily,
          identityFont: getComputedStyle(document.querySelector('.hud-identity strong')!).fontFamily,
          overlaps: [...document.querySelectorAll('.main-orb, .orb-readout, .hud-armor, .hud-identity, .resource-jewel')]
            .filter((item) => {
              const box = item.getBoundingClientRect();
              return Math.min(rect.right, box.right) - Math.max(rect.left, box.left) > 1
                && Math.min(rect.bottom, box.bottom) - Math.max(rect.top, box.top) > 1;
            }).map((item) => item.className),
        };
      });
      if (!layout.textFits || layout.overlaps.length) {
        console.log(`ORB_TALLY_LAYOUT ${JSON.stringify({ art, width, scale, ...layout })}`);
        await page.screenshot({ path: testInfo.outputPath('orb-tally-layout-failure.png') });
      }
      expect(layout.visible, `${art} ${width}px ${scale}% tally is inside the viewport`).toBe(true);
      expect(layout.textFits, `${art} ${width}px ${scale}% digits are not clipped`).toBe(true);
      expect(layout.font, 'Match the character identity gothic face').toBe(layout.identityFont);
      expect(layout.overlaps, `${art} ${width}px ${scale}% keeps gameplay readouts clear`).toEqual([]);
    }
    displayCount = 12;
    f.socket.emit('character:update', { characterId: f.characterId, level: 6 });
    await expect(badge).toHaveAttribute('data-kill-count', '12');
    await page.screenshot({ path: testInfo.outputPath(`orb-tally-${art}-native.png`), clip: { x: 0, y: 360, width: 650, height: 408 } });
    displayCount = 9999;
  }
  displayCount = 123456;
  f.socket.emit('character:update', { characterId: f.characterId, race: 'Half-Orc', className: 'Fighter' });
  await expect(badge).toHaveAttribute('data-kill-count', '123456');
  await expect(badge).toHaveAccessibleName('Druk: 123456 kills');
  expect((await f.snapshot()).characters.find((entry) => entry.id === f.characterId)!.killCount,
    'Synthetic large tallies never alter authoritative campaign data').toBe(0);
  await page.screenshot({ path: testInfo.outputPath('orb-large-tally.png') });
  expect(errors).toEqual([]);
});

test('DM keeps the existing layout rather than receiving the player orb tally', async ({ page, request }) => {
  const f = await fixture(request);
  await page.goto(`/dm?code=${f.code}`);
  await page.locator('input[type="password"]').fill(DM_SECRET);
  await page.getByRole('button', { name: 'Rejoin as DM', exact: true }).click();
  await expect(page.getByText('Druk', { exact: false }).first()).toBeVisible();
  await expect(page.locator('.orb-kill-count')).toHaveCount(0);
  await expect(page.locator('[data-testid="player-hud"]')).toHaveCount(0);
});
