import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import { io, type Socket } from 'socket.io-client';
import { writeFileSync } from 'node:fs';
import type { StateSnapshot } from '../shared/types';
import { DM_SECRET, PORT } from './playwright.config';

const connections: Socket[] = [];
test.afterEach(() => connections.splice(0).forEach((socket) => socket.disconnect()));
test.use({ video: process.env.DND_TIMING_VIDEO === '1' ? { mode: 'on', size: { width: 1366, height: 900 } } : 'off' });

async function fixture(request: APIRequestContext, page: Page) {
  const response = await request.post('/api/sessions', {
    headers: { 'x-dm-passphrase': DM_SECRET }, data: { name: 'Damage reveal timing' },
  });
  expect(response.ok()).toBeTruthy();
  const { code } = await response.json();
  const socket = io(`http://localhost:${PORT}`, { transports: ['websocket'], forceNew: true });
  connections.push(socket);
  const snapshot = async (): Promise<StateSnapshot> => {
    const result = await socket.timeout(5000).emitWithAck('join', { sessionCode: code, role: 'dm', dmPassphrase: DM_SECRET });
    expect(result.ok).toBe(true);
    return result.snapshot;
  };
  const initial = await snapshot();
  const character = initial.characters.find((candidate) => candidate.name === 'Druk')!;
  socket.emit('character:update', { characterId: character.id,
    weapons: [{ name: 'Timing greatsword', kind: 'melee', damage: '2d6', attackBonus: 100 }],
    stats: { STR: 18, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 },
    sheetAbilities: [{ id: 'timing-save', name: 'Timing flame', type: 'feat', description: 'Single-target save fixture',
      roll: { kind: 'save', dice: '2d6', save: 'DEX', saveDamage: 'half', targetMode: 'single', damageType: 'fire' } }],
  });
  socket.emit('session:setManualDamage', { manual: true });
  const png = await page.evaluate(() => {
    const canvas = document.createElement('canvas'); canvas.width = 1000; canvas.height = 600;
    const ctx = canvas.getContext('2d')!; ctx.fillStyle = '#273128'; ctx.fillRect(0, 0, 1000, 600);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  const mapResponse = await request.post(`/api/sessions/${code}/maps`, {
    headers: { 'x-dm-passphrase': DM_SECRET }, multipart: { name: 'Timing fixture',
      image: { name: 'fixture.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') } },
  });
  expect(mapResponse.ok()).toBeTruthy();
  const map = await mapResponse.json();
  socket.emit('map:setActive', { mapId: map.id });
  socket.emit('fog:setLayer', { mapId: map.id, layer: 'map', enabled: false });
  socket.emit('fog:setLayer', { mapId: map.id, layer: 'tokens', enabled: false });
  socket.emit('token:spawn', { mapId: map.id, kind: 'pc', refId: character.id, x: 300, y: 240 });
  socket.emit('monster:create', { name: 'Timing target', disposition: 'enemy', maxHp: 200, armorClass: 1 });
  const template = (await snapshot()).monsterTemplates.find((candidate) => candidate.name === 'Timing target')!;
  socket.emit('token:spawn', { mapId: map.id, kind: 'monster', refId: template.id, x: 600, y: 240 });
  const ready = await snapshot();
  const target = ready.monsters.find((monster) => monster.name.startsWith('Timing target'))!;
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.addInitScript(() => {
    const timeline = { samples: [] as any[], sounds: [] as any[], running: false };
    (window as any).__revealTiming = timeline;
    const create = AudioContext.prototype.createOscillator;
    AudioContext.prototype.createOscillator = function () {
      const oscillator = create.call(this);
      const start = oscillator.start.bind(oscillator);
      oscillator.start = (when?: number) => {
        timeline.sounds.push({ time: performance.now(), frequency: oscillator.frequency.value });
        return start(when);
      };
      return oscillator;
    };
  });
  await page.goto(`/join?code=${code}`);
  await page.getByRole('button', { name: 'Join', exact: true }).click();
  await page.locator('.claim-row').filter({ hasText: 'Druk' }).click();
  await expect(page.locator('.compact-player-combat')).toBeVisible();
  return { snapshot, character, target, socket };
}

async function startTrace(page: Page) {
  await page.evaluate(() => {
    const trace = (window as any).__revealTiming;
    trace.samples = []; trace.sounds = []; trace.running = true;
    const sample = () => {
      if (!trace.running) return;
      const popup = document.querySelector('.roll-reveal');
      trace.samples.push({
        time: performance.now(), visible: !!popup,
        attackTotal: Number(popup?.querySelector('.rr-total')?.textContent ?? 0),
        damageTotal: Number(popup?.querySelector('.rr-dmg-num, .rr-roll-num')?.firstChild?.textContent ?? 0),
        attackDice: [...(popup?.querySelectorAll('.roll-reveal-tohit canvas') ?? [])].map((die) => (die as HTMLElement).dataset.orientation),
        damageDice: [...(popup?.querySelectorAll('.roll-reveal-damage canvas') ?? [])].map((die) => ({
          orientation: (die as HTMLElement).dataset.orientation, value: Number((die as HTMLElement).dataset.value),
        })),
        outcome: popup?.querySelector('.roll-reveal-outcome')?.textContent,
        prompt: !!document.querySelector('.damage-prompt-btn'),
        floaters: ((window as any).Konva?.stages ?? []).flatMap((stage: any) => stage.find('Text')
          .filter((node: any) => /^[+−]\d+$/.test(node.text()) && node.fill() === '#e23b3b')
          .map((node: any) => ({ text: node.text(), opacity: node.getAbsoluteOpacity() }))),
      });
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
}

async function endTrace(page: Page) {
  return page.evaluate(() => {
    const trace = (window as any).__revealTiming; trace.running = false;
    const origin = trace.samples.find((sample: any) => sample.visible)?.time ?? trace.samples[0].time;
    return {
      samples: trace.samples.map((sample: any) => ({ ...sample, time: Math.round(sample.time - origin) })),
      sounds: trace.sounds.map((sound: any) => ({ ...sound, time: Math.round(sound.time - origin) })),
    };
  });
}

test('attack and manual damage totals wait for the actual 3D dice landing', async ({ page, request }, testInfo) => {
  const f = await fixture(request, page);
  let attack: Awaited<ReturnType<typeof endTrace>> | undefined;
  let pending;
  // A natural 1 remains a valid miss. No random result is forged by this test.
  for (let attempt = 0; attempt < 5; attempt++) {
    await startTrace(page);
    await page.locator('.compact-player-combat').getByRole('button', { name: /Timing greatsword/ }).click();
    await expect(page.locator('.roll-reveal')).toBeVisible();
    await expect(page.locator('.roll-reveal')).toHaveCount(0, { timeout: 12_000 });
    attack = await endTrace(page);
    pending = (await f.snapshot()).rollLog.findLast((entry) => entry.pending && !entry.pending.done);
    if (pending) break;
  }
  expect(pending).toBeTruthy();
  expect((await f.snapshot()).monsters.find((monster) => monster.id === f.target.id)!.curHp).toBe(200);
  await expect(page.locator('.damage-prompt-btn')).toBeVisible();
  await startTrace(page);
  await page.locator('.damage-prompt-btn').click();
  await expect(page.locator('.roll-reveal')).toBeVisible();
  await expect(page.locator('.roll-reveal')).toHaveCount(0, { timeout: 12_000 });
  const damage = await endTrace(page);
  const state = await f.snapshot();
  expect(state.monsters.find((monster) => monster.id === f.target.id)!.curHp).toBe(200 - pending!.pending!.amount);
  const summary = {
    attackFirstTotal: attack!.samples.find((sample: any) => sample.attackTotal > 0)?.time,
    attackLanded: attack!.samples.find((sample: any) => sample.attackDice.length && sample.attackDice.every((orientation: string) => orientation === 'face-forward'))?.time,
    damageFirstTotal: damage.samples.find((sample: any) => sample.damageTotal > 0)?.time,
    damageFirstLanded: damage.samples.find((sample: any) => sample.damageDice.some((die: any) => die.orientation === 'face-forward'))?.time,
    damageAllLanded: damage.samples.find((sample: any) => sample.damageDice.length && sample.damageDice.every((die: any) => die.orientation === 'face-forward'))?.time,
    damageFinalTotal: damage.samples.find((sample: any) => sample.damageTotal === pending!.pending!.amount)?.time,
    damageFloater: damage.samples.find((sample: any) => sample.floaters.some((floater: any) => floater.opacity > .1))?.time,
    damageSounds: damage.sounds,
  };
  const receipt = { summary, attack, damage, authoritativeDamage: pending!.pending!.amount };
  const path = testInfo.outputPath('timing.json');
  writeFileSync(path, JSON.stringify(receipt, null, 2));
  await testInfo.attach('timing', { path, contentType: 'application/json' });
  console.log(`REVEAL_TIMING ${JSON.stringify(summary)}`);
  if (process.env.DND_TIMING_BASELINE === '1') return;
  expect(summary.attackFirstTotal).toBeGreaterThanOrEqual(summary.attackLanded);
  expect(summary.damageFirstTotal).toBeGreaterThanOrEqual(summary.damageFirstLanded);
  expect(summary.damageFloater).toBeGreaterThanOrEqual(summary.damageFinalTotal - 20);
  expect(damage.samples.filter((sample: any) => sample.damageTotal > 0 && !sample.damageDice.some((die: any) => die.orientation === 'face-forward'))).toHaveLength(0);
  expect(damage.sounds.filter((sound: any) => sound.time < summary.damageAllLanded)).toHaveLength(0);
  expect(summary.damageFinalTotal).toBeDefined();
});

async function armManualDamage(page: Page, f: Awaited<ReturnType<typeof fixture>>) {
  for (let attempt = 0; attempt < 5; attempt++) {
    await page.locator('.compact-player-combat').getByRole('button', { name: /Timing greatsword/ }).click();
    await expect(page.locator('.roll-reveal')).toBeVisible();
    await page.keyboard.press('Escape');
    const pending = (await f.snapshot()).rollLog.findLast((entry) => entry.pending && !entry.pending.done);
    if (pending) {
      await expect(page.locator('.damage-prompt-btn')).toBeVisible();
      return pending;
    }
  }
  throw new Error('Five consecutive misses');
}

async function floaters(page: Page) {
  return page.evaluate(() => ((window as any).Konva?.stages ?? []).flatMap((stage: any) => stage.find('Text')
    .filter((node: any) => /^[+−]\d+$/.test(node.text()) && node.fill() === '#e23b3b')
    .map((node: any) => node.text())));
}

test('skip releases its correlated floater while unrelated direct damage stays immediate', async ({ page, request }) => {
  const f = await fixture(request, page);
  const pending = await armManualDamage(page, f);
  const amount = pending.pending!.amount;
  await page.locator('.damage-prompt-btn').click();
  await expect(page.locator('.roll-reveal')).toHaveAttribute('data-reveal-kind', 'damage');
  // Server HP changes now, even though this roll's cosmetic number is held.
  expect((await f.snapshot()).monsters.find((monster) => monster.id === f.target.id)!.curHp).toBe(200 - amount);
  expect(await floaters(page)).not.toContain(`−${amount}`);
  f.socket.emit('damage:apply', { kind: 'monster', refId: f.target.id, amount: 1 });
  await expect.poll(() => floaters(page)).toContain('−1');
  expect(await floaters(page)).not.toContain(`−${amount}`);
  await page.keyboard.press('Escape');
  await expect(page.locator('.roll-reveal')).toHaveCount(0);
  await expect.poll(() => floaters(page)).toContain(`−${amount}`);
  expect((await floaters(page)).filter((value: string) => value === `−${amount}`)).toHaveLength(1);
  await expect.poll(() => floaters(page), { timeout: 4000 }).toEqual([]);
  // Refresh seeds history silently; resolved damage must not replay its FX.
  await page.reload();
  await expect(page.locator('.compact-player-combat')).toBeVisible();
  expect(await floaters(page)).toEqual([]);
  await expect(page.locator('.roll-reveal')).toHaveCount(0);
});

test('animations off never holds manual damage floating feedback', async ({ page, request }) => {
  await page.addInitScript(() => localStorage.setItem('dnd.rollAnimOff', '1'));
  const f = await fixture(request, page);
  let pending;
  for (let attempt = 0; attempt < 5; attempt++) {
    const oldCount = (await f.snapshot()).rollLog.length;
    await page.locator('.compact-player-combat').getByRole('button', { name: /Timing greatsword/ }).click();
    await expect.poll(async () => (await f.snapshot()).rollLog.length).toBeGreaterThan(oldCount);
    pending = (await f.snapshot()).rollLog.findLast((entry) => entry.pending && !entry.pending.done);
    if (pending) break;
  }
  expect(pending).toBeTruthy();
  await expect(page.locator('.roll-reveal')).toHaveCount(0);
  await page.locator('.damage-prompt-btn').click();
  await expect.poll(() => floaters(page)).toContain(`−${pending!.pending!.amount}`);
  await expect(page.locator('.roll-reveal')).toHaveCount(0);
});

test('a concentration reminder cannot suppress the following damage reveal or release its floater early', async ({ page, request }) => {
  const f = await fixture(request, page);
  f.socket.emit('condition:set', { kind: 'monster', refId: f.target.id,
    condition: { label: 'Concentrating', aura: 'blue', isConcentration: true } });
  await f.snapshot();
  const pending = await armManualDamage(page, f);
  await page.locator('.damage-prompt-btn').click();
  const popup = page.locator('.roll-reveal');
  await expect(popup).toHaveAttribute('data-reveal-kind', 'damage');
  const snapshot = await f.snapshot();
  expect(snapshot.rollLog.slice(-2).map((entry) => entry.label)).toEqual(['Concentration', 'Damage']);
  await expect(popup).toHaveAttribute('data-roll-id', snapshot.rollLog.at(-1)!.id);
  expect(await floaters(page)).not.toContain(`−${pending.pending!.amount}`);
  await expect(popup).toHaveAttribute('data-impact-ready', 'true', { timeout: 5000 });
  await expect.poll(() => floaters(page)).toContain(`−${pending.pending!.amount}`);
});

test('a targeted save shows its latest roll and floats damage only after that save resolves', async ({ page, request }) => {
  const f = await fixture(request, page);
  await startTrace(page);
  await page.locator('.compact-player-combat').getByRole('button', { name: /Timing flame/ }).click();
  const popup = page.locator('.roll-reveal');
  await expect(popup).toHaveAttribute('data-reveal-kind', 'check');
  const snapshot = await f.snapshot();
  const last = snapshot.rollLog.at(-1)!;
  expect(last.reveal?.kind).toBe('check');
  await expect(popup).toHaveAttribute('data-roll-id', last.id);
  expect(await floaters(page)).toEqual([]);
  await expect(popup).toHaveCount(0, { timeout: 6000 });
  const trace = await endTrace(page);
  const outcomeAt = trace.samples.find((sample: any) => sample.outcome)?.time;
  const floaterAt = trace.samples.find((sample: any) => sample.floaters.some((floater: any) => floater.opacity > .1))?.time;
  expect(outcomeAt).toBeDefined();
  expect(floaterAt).toBeDefined();
  expect(floaterAt).toBeGreaterThanOrEqual(outcomeAt);
});
