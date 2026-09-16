import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import { io, type Socket } from 'socket.io-client';
import type { StateSnapshot } from '../shared/types';
import { DM_SECRET, PORT } from './playwright.config';

const connections: Socket[] = [];
test.afterEach(() => connections.splice(0).forEach((socket) => socket.disconnect()));

// Only the E2E configuration's disposable server/database receives these writes.
async function fixture(request: APIRequestContext, page: Page, slides: boolean) {
  const response = await request.post('/api/sessions', {
    headers: { 'x-dm-passphrase': DM_SECRET }, data: { name: 'Upstream dice reconciliation' },
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
  const characterId = initial.characters.find((character) => character.name === 'Druk')!.id;
  socket.emit('character:update', { characterId,
    weapons: [{ name: 'Player test sword', kind: 'melee', damage: '1d6', attackBonus: 2 }],
  });
  const png = await page.evaluate(() => {
    const canvas = document.createElement('canvas'); canvas.width = 1000; canvas.height = 600;
    const context = canvas.getContext('2d')!; context.fillStyle = '#273128'; context.fillRect(0, 0, 1000, 600);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  const mapResponse = await request.post(`/api/sessions/${code}/maps`, {
    headers: { 'x-dm-passphrase': DM_SECRET },
    multipart: slides
      ? { name: 'Local Slides fixture', slidesUrl: 'https://docs.google.com/presentation/d/dice-e2e/embed' }
      : { name: 'Local dice fixture', image: { name: 'fixture.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') } },
  });
  expect(mapResponse.ok()).toBeTruthy();
  const map = await mapResponse.json();
  socket.emit('map:setActive', { mapId: map.id });
  socket.emit('fog:setLayer', { mapId: map.id, layer: 'map', enabled: false });
  socket.emit('fog:setLayer', { mapId: map.id, layer: 'tokens', enabled: false });
  if (!slides) {
    socket.emit('token:spawn', { mapId: map.id, kind: 'pc', refId: characterId, x: 300, y: 300 });
    socket.emit('monster:create', { name: 'Friendly dice companion', maxHp: 20, armorClass: 12, disposition: 'friendly',
      weapons: [{ name: 'Companion bite', kind: 'melee', damage: '1d4', attackBonus: 2 }],
    });
    const template = (await snapshot()).monsterTemplates.find((monster) => monster.name === 'Friendly dice companion')!;
    socket.emit('token:spawn', { mapId: map.id, kind: 'monster', refId: template.id, x: 500, y: 300 });
  }
  const ready = await snapshot();
  // Exercise the real Slides render branch without contacting Google.
  await page.route('https://docs.google.com/**', (route) => route.fulfill({
    contentType: 'text/html', body: '<html><body style="background:#273128">Local Slides fixture</body></html>',
  }));
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.goto(`/join?code=${code}`);
  await page.getByRole('button', { name: 'Join', exact: true }).click();
  await page.locator('.claim-row').filter({ hasText: 'Druk' }).click();
  await expect(page.locator('.player-dice-picker')).toBeVisible();
  const clickToken = async (id: string) => {
    // Read Konva geometry, then use a real browser click; never mutate the store.
    const point = await page.evaluate((tokenId) => {
      const stages = (window as unknown as { Konva: { stages: any[] } }).Konva.stages;
      const stage = stages.find((candidate) => candidate.find('.token-hit-region').length);
      const shape = stage.find('.token-hit-region').find((node: any) => node.getAttr('tokenId') === tokenId);
      const position = shape.getAbsolutePosition(), bounds = stage.container().getBoundingClientRect();
      return { x: bounds.left + position.x, y: bounds.top + position.y };
    }, id);
    await page.mouse.click(point.x, point.y);
  };
  return { snapshot, ready, characterId, clickToken };
}

async function expectPair(page: Page, mode: 'adv' | 'dis') {
  const comparison = page.locator(`.rr-comparison[data-mode="${mode}"]`);
  await expect(comparison.locator('.rr-candidate')).toHaveCount(2);
  await expect(comparison.locator('.three-die')).toHaveCount(2);
  await expect(comparison.locator('[data-result="kept"]')).toHaveCount(1);
  await expect(comparison.locator('[data-result="discarded"]')).toHaveCount(1);
  await expect(comparison.locator('canvas[data-orientation="face-forward"]')).toHaveCount(2);
  const values = await comparison.locator('.three-die').evaluateAll((dice) => dice.map((die) => Number(die.getAttribute('data-value'))));
  const kept = Number(await comparison.locator('[data-result="kept"]').getAttribute('data-candidate'));
  await page.locator('.roll-reveal').click();
  await expect(page.locator('.roll-reveal')).toHaveCount(0);
  return { values, kept };
}

for (const slides of [false, true]) {
  test(`player map ADV/DIS produces paired 3D rolls on ${slides ? 'Slides' : 'image'} maps`, async ({ page, request }) => {
    const setup = await fixture(request, page, slides);
    const picker = page.locator('.player-dice-picker');
    await page.mouse.move(700, 500);
    await expect(picker.locator('.dice-adv-btn.up')).toHaveCSS('opacity', '1');
    await expect(picker.locator('.dice-adv-btn.down')).toHaveCSS('opacity', '1');
    const displayed = new Map<string, Awaited<ReturnType<typeof expectPair>>>();
    for (const mode of ['adv', 'dis'] as const) {
      const button = picker.getByRole('button', { name: `${mode === 'adv' ? 'Advantage' : 'Disadvantage'} for Druk`, exact: true });
      await button.click();
      await expect(button).toHaveAttribute('aria-pressed', 'true');
      await expect(picker.locator('.dice-adv-armed')).toContainText(`Druk: ${mode === 'adv' ? 'advantage' : 'disadvantage'}`);
      await picker.getByRole('button', { name: 'Roll a d20', exact: true }).click();
      await expect(button).toHaveAttribute('aria-pressed', 'false');
      await expect(picker.locator('.dice-adv-armed')).toHaveCount(0);
      displayed.set(mode, await expectPair(page, mode));
    }
    const rolls = (await setup.snapshot()).rollLog;
    expect(rolls).toHaveLength(2);
    const recordedModes: string[] = [];
    for (const roll of rolls) {
      expect(roll.expr).toBe('1d20');
      // Comparison metadata is client-only. Verify the two painted faces
      // directly against the server's authoritative, persisted raw detail.
      const detail = /^1d20\[(\d+)\] \(=(\d+)\) \/ 1d20\[(\d+)\] \(=(\d+)\) → (adv|dis) (\d+)$/.exec(roll.detail);
      expect(detail, roll.detail).not.toBeNull();
      const values = [Number(detail![1]), Number(detail![3])], mode = detail![5];
      recordedModes.push(mode);
      expect(values).toEqual([Number(detail![2]), Number(detail![4])]);
      const expected = mode === 'adv' ? Math.max(...values) : Math.min(...values);
      expect(roll.total).toBe(expected);
      expect(Number(detail![6])).toBe(expected);
      expect(roll.reveal?.damage).toBe(expected);
      expect(displayed.get(mode)!.values).toEqual(values);
      expect(values[displayed.get(mode)!.kept]).toBe(expected);
    }
    expect(recordedModes.sort()).toEqual(['adv', 'dis']);
    if (!slides) {
      // The new compact ADV buttons must not occupy the zoom/fit click targets.
      for (const size of [{ width: 1366, height: 900 }, { width: 480, height: 640 }]) {
        await page.setViewportSize(size);
        await page.mouse.move(350, 350);
        await expect(picker.getByRole('group', { name: 'Choose a die' })).toBeHidden();
        for (const control of await page.locator('.stage-controls button').all()) {
          await expect(control).toBeInViewport();
          expect(await control.evaluate((button) => {
            const box = button.getBoundingClientRect();
            return button.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2));
          })).toBe(true);
        }
      }
    }
  });
}

test('player and friendly companion keep independent armed rolls shared with combat controls', async ({ page, request }) => {
  const setup = await fixture(request, page, false);
  const picker = page.locator('.player-dice-picker');
  await picker.getByRole('button', { name: 'Advantage for Druk', exact: true }).click();
  const pcToken = setup.ready.tokens.find((token) => token.kind === 'pc' && token.refId === setup.characterId)!;
  const friendToken = setup.ready.tokens.find((token) => token.kind === 'monster' && setup.ready.monsters.some(
    (monster) => monster.id === token.refId && monster.name.startsWith('Friendly dice companion'),
  ))!;
  const friend = setup.ready.monsters.find((monster) => monster.id === friendToken.refId)!;
  await setup.clickToken(friendToken.id);
  const friendDisadvantage = picker.getByRole('button', { name: `Disadvantage for ${friend.name}`, exact: true });
  await expect(friendDisadvantage).toHaveAttribute('aria-pressed', 'false');
  await expect(picker.locator('.dice-adv-armed')).toHaveCount(0);
  await friendDisadvantage.click();
  // The established player combat console still acts as the claimed PC when
  // a friendly is selected. Its ADV must remain armed while the map die acts
  // as the selected companion and consumes only that companion's DIS.
  const combatToggle = page.locator('.player-combat').getByTitle("Advantage on this creature's next roll of any kind, then clears", { exact: true });
  await expect(combatToggle).toHaveClass(/on/);
  await picker.getByRole('button', { name: 'Roll a d20', exact: true }).click();
  await expect(combatToggle).toHaveClass(/on/);
  await expectPair(page, 'dis');
  await setup.clickToken(pcToken.id);
  await expect(picker.getByRole('button', { name: 'Advantage for Druk', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await picker.getByRole('button', { name: 'Roll a d20', exact: true }).click();
  await expect(combatToggle).not.toHaveClass(/on/);
  await expectPair(page, 'adv');
  await expect(picker.locator('.dice-adv-armed')).toHaveCount(0);
  expect((await setup.snapshot()).rollLog).toHaveLength(2);
});
