import { test, expect } from '@playwright/test';
import { io } from 'socket.io-client';
import { readFileSync } from 'node:fs';
import { PORT, DM_SECRET } from './playwright.config';

// Route-delayed cold assets must not be served by the app's offline cache.
test.use({ serviceWorkers: 'block' });

for (const scenario of [
  { spell: 'Cure Wounds', cold: false },
  { spell: 'Hail of Thorns', cold: false, mark: true },
  { spell: 'Cure Wounds', cold: true },
  { spell: 'Cure Wounds', cold: true, skip: 'click' },
  { spell: 'Cure Wounds', cold: false, skip: 'button' },
  { spell: 'Cure Wounds', cold: false, skip: 'escape' },
]) test(`${scenario.spell}${scenario.cold ? ' with cold graphics' : ''}${scenario.skip ? ` skipped by ${scenario.skip}` : ''} clears the roll window before map effects start`, async ({ page, request }) => {
  test.setTimeout(150_000);
  const { spell, cold } = scenario;
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error' && /shader|WebGL|THREE/i.test(message.text())) errors.push(message.text());
  });
  let textureReleasedAt = 0;
  if (cold) await page.route('**/art/dice-trays/ranger-v1.webp', async route => {
    // Exercise a cold download beyond the old 2.5-second launch timeout.
    await new Promise(resolve => setTimeout(resolve, 6000));
    textureReleasedAt = Date.now();
    await route.continue();
  });
  const { code } = await (await request.post('/api/sessions', {
    headers: { 'x-dm-passphrase': DM_SECRET }, data: { name: 'Spell impact presentation' },
  })).json();
  const socket = io(`http://localhost:${PORT}`, { transports: ['websocket'] });
  const frames: { elapsed: number; at: number }[] = [];
  socket.on('dice:frame', frame => frames.push({ elapsed: frame.elapsed, at: Date.now() }));
  const snapshot = async () => {
    const result = await socket.timeout(8000).emitWithAck('join', {
      sessionCode: code, role: 'dm', dmPassphrase: DM_SECRET,
    });
    expect(result.ok).toBe(true);
    return result.snapshot;
  };
  try {
    const initial = await snapshot(), caster = initial.characters.find((c: any) => c.name === 'Varis');
    const catalog = (await (await request.get('/api/spells/all')).json()).results;
    socket.emit('character:update', {
      characterId: caster.id, className: 'Ranger', level: 6, maxHp: 100, curHp: 10,
      stats: { STR: 10, DEX: 18, CON: 12, INT: 10, WIS: 18, CHA: 10 }, spellSlots: { L1: { max: 5, used: 0 } },
      weapons: [{ name: 'Timing bow', kind: 'ranged', damage: '1d8', damageType: 'piercing', attackBonus: 100 }],
      sheetAbilities: catalog.filter((s: any) => ['Cure Wounds', 'Hail of Thorns'].includes(s.name) || scenario.mark && /Hunter.s Mark/.test(s.name))
        .map((s: any) => ({ ...s, id: s.name })),
    });
    const map = await (await request.post(`/api/sessions/${code}/maps`, {
      headers: { 'x-dm-passphrase': DM_SECRET }, multipart: { name: 'Impact fixture', image: {
        name: 'courtyard.png', mimeType: 'image/png', buffer: readFileSync('assets/environment-preview/courtyard.png'),
      } },
    })).json();
    socket.emit('map:setGrid', { mapId: map.id, gridSizePx: 64, feetPerSquare: 5, widthFt: 100, locked: false });
    for (const layer of ['map', 'tokens']) socket.emit('fog:setLayer', { mapId: map.id, layer, enabled: false });
    socket.emit('map:setActive', { mapId: map.id });
    socket.emit('session:setManualDamage', { manual: true });
    socket.emit('token:spawn', { mapId: map.id, kind: 'pc', refId: caster.id, x: 430, y: 640 });
    for (const [name, x] of [['Target', 650], ['Neighbor', 690]] as const) {
      socket.emit('monster:create', { name, creatureType: 'humanoid', maxHp: 200, armorClass: 1, stats: { DEX: 10 } });
      const monster = (await snapshot()).monsterTemplates.find((m: any) => m.name === name);
      socket.emit('token:spawn', { mapId: map.id, kind: 'monster', refId: monster.id, x, y: 450 });
    }
    await snapshot();
    await page.goto(`/join?code=${code}`);
    await page.getByRole('button', { name: 'Join', exact: true }).click();
    await page.locator('.claim-row').filter({ hasText: 'Varis' }).click();
    await expect(page.locator('.compact-player-combat')).toBeVisible();
    // The ordinary first roll should reuse the background-compiled material.
    if (!cold) await page.waitForTimeout(6000);
    if (spell === 'Hail of Thorns') {
      if (scenario.mark) {
        await page.locator('.compact-player-combat').getByRole('button', { name: /Hunter.s Mark/ }).click();
        await expect.poll(async () => (await snapshot()).characters.find((c: any) => c.id === caster.id).sheetAbilities.some((a: any) => a.mark?.refId)).toBe(true);
      }
      for (let attempt = 0; attempt < 5; attempt++) {
        await page.locator('.compact-player-combat').getByRole('button', { name: /Timing bow/ }).click();
        await expect(page.locator('[data-live-dice="true"]')).toBeVisible();
        await expect(page.locator('.physics-dice-tray')).toHaveAttribute('data-dice-preloaded', 'true');
        await expect(page.locator('[data-live-dice="true"]')).toHaveCount(0, { timeout: 45000 });
        await page.keyboard.press('Escape');
        if (await page.locator('.damage-prompt-btn').isVisible()) break;
      }
      await page.locator('.damage-prompt').getByRole('button', { name: 'Hail of Thorns', exact: true }).click();
    }
    await page.evaluate(() => {
      const samples: any[] = [];
      (window as any).__impactSamples = samples;
      (window as any).__impactSampling = true;
      const sample = () => {
        const cards = [...document.querySelectorAll('.roll-reveal')];
        const fx = ((window as any).Konva?.stages ?? []).flatMap((stage: any) => stage.find('.hp-floater-number'));
        const tray = document.querySelector('.physics-dice-tray');
        const boxes = [...document.querySelectorAll('.tray-die-result')];
        samples.push({ time: performance.now(), fx: fx.length,
          numbers: fx.map((node: any) => ({ text: node.text(), color: node.fill(), opacity: node.getParent().opacity(), x: node.getParent().x(), y: node.getParent().y() })),
          live: !!document.querySelector('[data-live-dice="true"]'),
          settled: tray?.getAttribute('data-status') === 'settled',
          filled: boxes.length > 0 && boxes.every(e => e.getAttribute('data-filled') === 'true'),
          renderTime: Number(document.querySelector('.dice-tray-canvas')?.getAttribute('data-render-time') ?? 0),
          large: cards.some(e => e.getBoundingClientRect().height > 180) });
        if ((window as any).__impactSampling) requestAnimationFrame(sample);
      };
      sample();
    });
    if (spell === 'Cure Wounds') {
      await page.locator('.compact-player-combat').getByRole('button', { name: /Cure Wounds/ }).click();
      await expect(page.locator('[data-live-dice="true"]')).toBeVisible();
      if (!cold) await expect(page.locator('.physics-dice-tray')).toHaveAttribute('data-dice-preloaded', 'true');
    } else await page.locator('.damage-prompt').getByRole('button', { name: 'L1', exact: true }).click();
    if (scenario.skip) {
      if (scenario.skip === 'escape') {
        // Exercise the added reading pause after every number has arrived.
        await expect(page.locator('.tray-die-result[data-filled="false"]')).toHaveCount(0, {timeout: 30000});
        await page.keyboard.press('Escape');
      } else if (scenario.skip === 'button') {
        // Skip during the actual toss; it still resolves real physics server-side.
        await expect.poll(() => frames.some(frame => frame.elapsed > 0), {timeout: 15000}).toBe(true);
        await page.getByRole('button', {name: 'Skip roll animation'}).click();
      } else await page.getByRole('status', {name: 'Live dice roll', exact: true}).click();
      await expect(page.locator('[data-live-dice="true"]')).toHaveCount(0, {timeout: 700});
    }
    await expect.poll(() => page.evaluate(() => (window as any).__impactSamples.some((s: any) => s.fx > 0)),
      { timeout: 90000 }).toBe(true);
    if (scenario.mark) {
      await page.waitForTimeout(350);
      await page.screenshot({path: test.info().outputPath('bow-mark-thorns-damage.png')});
      await page.waitForTimeout(2900);
    } else await page.waitForTimeout(1000);
    const samples = await page.evaluate(() => {
      (window as any).__impactSampling = false;
      return (window as any).__impactSamples;
    });
    expect(samples.some((s: any) => s.live)).toBe(true);
    expect(samples.filter((s: any) => s.fx && (s.live || s.large)).slice(0, 5),
      'Map effects must not play beneath the live tray or a full result card').toEqual([]);
    if (scenario.mark) {
      const together = samples.find((s: any) => new Set(s.numbers.map((n: any) => n.color)).size >= 3);
      expect(together, 'Bow, force mark, and piercing thorns have three distinct colors').toBeTruthy();
      expect(together.numbers.every((n: any) => Math.min(Math.abs(n.x-650),Math.abs(n.x-690)) <= 32*.4+.01),
        'Damage stays above its creature instead of spreading across the map').toBe(true);
      expect(await page.evaluate(() => ((window as any).Konva?.stages??[]).flatMap((stage:any)=>stage.find('.hp-floater-label')).length)).toBe(0);
      const start = samples.find((s: any) => s.fx > 0).time;
      expect(samples.find((s: any) => s.time >= start + 2100)?.numbers.every((n: any) => n.opacity > .95)).toBe(true);
      expect(samples.find((s: any) => s.time >= start + 3000)?.fx).toBeGreaterThan(0);
      expect(samples.find((s: any) => s.time >= start + 3000)?.numbers.some((n: any) => n.opacity > .2 && n.opacity < .95)).toBe(true);
    }
    if (scenario.skip) {
      await expect(page.locator('.roll-reveal')).toHaveCount(0);
      expect((await snapshot()).characters.find((c: any) => c.id === caster.id).curHp).toBeGreaterThan(10);
    } else if (spell === 'Cure Wounds') {
      const filling = samples.filter((s: any) => s.live && s.settled && !s.filled && s.renderTime);
      expect(filling.at(-1).renderTime - filling[0].renderTime,
        'Dice material animations must continue during number flights').toBeGreaterThan(400);
      const reading = samples.filter((s: any) => s.live && s.filled && s.renderTime);
      expect(reading.at(-1).renderTime - reading[0].renderTime,
        'Filled results remain readable with animated dice for at least 1.7 seconds').toBeGreaterThan(1700);
    }
    if (cold && !scenario.skip) {
      expect(textureReleasedAt).toBeGreaterThan(0);
      expect(frames.find(frame => frame.elapsed > 0)!.at).toBeGreaterThanOrEqual(textureReleasedAt);
    }
    expect(errors).toEqual([]);
  } finally { socket.disconnect(); }
});
