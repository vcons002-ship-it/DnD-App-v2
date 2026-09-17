import { test, expect, type APIRequestContext, type Locator, type Page } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { io, type Socket } from 'socket.io-client';
import type { StateSnapshot } from '../shared/types';
import { DM_SECRET, PORT } from './playwright.config';

const connections: Socket[] = [];
test.afterEach(() => connections.splice(0).forEach((socket) => socket.disconnect()));

// This config owns a disposable database/server on 4099. Neither the live
// campaign nor the player-preview campaign is read or mutated by these tests.
async function gemFixture(request: APIRequestContext) {
  const response = await request.post('/api/sessions', {
    headers: { 'x-dm-passphrase': DM_SECRET }, data: { name: 'Resource gemstone regression' },
  });
  expect(response.ok()).toBeTruthy();
  const { code } = await response.json();
  const socket = io(`http://localhost:${PORT}`, { transports: ['websocket'], forceNew: true });
  connections.push(socket);
  const snapshot = async (): Promise<StateSnapshot> => {
    const result = await socket.timeout(5000).emitWithAck('join', {
      sessionCode: code, role: 'dm', dmPassphrase: DM_SECRET,
    });
    expect(result.ok).toBe(true);
    return result.snapshot;
  };
  await snapshot();
  socket.emit('character:create', { name: 'Gem Sorcerer', race: 'Tiefling', className: 'Sorcerer', level: 6, maxHp: 40 });
  const characterId = (await snapshot()).characters.find((character) => character.name === 'Gem Sorcerer')!.id;
  socket.emit('character:update', {
    characterId, level: 6,
    spellSlots: { L1: { max: 4, used: 0 }, L2: { max: 3, used: 1 } },
    resources: { 'Sorcery Points': { max: 6, used: 2 }, 'Moon marks': { max: 3, used: 1 } },
    sheetAbilities: [{
      id: 'gem-magic-missile', name: 'Magic Missile', type: 'spell', level: 1,
      description: 'Existing split-spell contract exercised by the disposable fixture.',
      roll: { kind: 'damage', dice: '1d4+1', baseLevel: 1, instances: 3, scaleInstances: 1, damageType: 'force' },
    }],
  });
  await snapshot();
  return { code, characterId, socket, snapshot };
}

async function joinPlayer(page: Page, code: string) {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto(`/join?code=${code}`);
  await page.getByRole('button', { name: 'Join', exact: true }).click();
  await page.locator('.claim-row').filter({ hasText: 'Gem Sorcerer' }).click();
  await expect(page.locator('[data-testid="player-hud"]')).toBeVisible();
}

const resources = (page: Page) => page.getByRole('region', { name: 'Character resources', exact: true });
const row = (page: Page, name: string) => resources(page).getByRole('group', { name: new RegExp(`^${name}:`) });
const gems = (page: Page, name: string) => row(page, name).locator('.resource-jewel');
const effects = (page: Page) => resources(page).locator('.resource-jewel[data-gem-effect="spend"], .resource-jewel[data-gem-effect="restore"]');

async function idle(page: Page) {
  await expect(effects(page)).toHaveCount(0, { timeout: 2500 });
  await expect(resources(page).locator('.resource-gem-reaction')).toHaveCount(0);
}

async function geometry(locator: Locator) {
  return locator.evaluateAll((elements) => elements.map((element) => {
    const box = element.getBoundingClientRect();
    return { x: box.x, y: box.y, width: box.width, height: box.height };
  }));
}

// Sample the real CSS keyframes instead of racing wall-clock animation phases.
// Negative stagger delays remain an implementation detail: every stone is
// compared at the same point in its own pulse. Finite spend/restore effects are
// deliberately not paused or retimed by this helper.
async function holdIdlePhase(locator: Locator, phase: number) {
  return locator.evaluateAll((elements, normalizedPhase) => {
    let sampled = 0;
    for (const element of elements) for (const animation of element.getAnimations({ subtree: true })) {
      const timing = animation.effect?.getTiming();
      if (!timing || timing.iterations !== Infinity || typeof timing.duration !== 'number') continue;
      animation.pause();
      animation.currentTime = timing.delay + timing.duration * (1 + normalizedPhase);
      sampled += 1;
    }
    return sampled;
  }, phase);
}

async function setLayout(page: Page, layout: 'compact' | 'concentric') {
  await page.getByRole('button', { name: 'Interface settings', exact: true }).click();
  await page.getByLabel(layout === 'compact' ? 'Compact rows' : 'Concentric arcs', { exact: true }).check();
  await page.getByRole('button', { name: 'Close interface settings', exact: true }).click();
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
}

test('native-size gemstone light pulses primarily inside the cut rather than around the socket on every map tone', async ({ page, request }, testInfo) => {
  const fixture = await gemFixture(request);
  fixture.socket.emit('character:update', {
    characterId: fixture.characterId,
    spellSlots: { L1: { max: 4, used: 1 }, L5: { max: 3, used: 1, maxOverride: true }, L9: { max: 3, used: 1, maxOverride: true } },
  });
  await fixture.snapshot();
  await joinPlayer(page, fixture.code);
  await setLayout(page, 'concentric');
  await idle(page);
  expect(await holdIdlePhase(resources(page).locator('.resource-jewel'), 0), 'Native emission proof samples the actual pulse crest').toBeGreaterThan(0);
  const first = gems(page, 'L1').first();
  const box = await first.boundingBox();
  expect(box!.width, 'Default 85% laptop UI, not an enlarged art demonstration').toBeGreaterThan(14);
  expect(box!.width).toBeLessThan(16);
  // Controlled map-tone swatches make alpha/emission comparisons repeatable;
  // this fixture does not read any preview or production campaign/map data.
  const backdrop = await page.addStyleTag({ content: `
    .stage-wrap { background: var(--gem-proof-map, #171e24) !important; }
    .stage-wrap::after { content: ''; position: absolute; inset: 0; pointer-events: none;
      background-image: linear-gradient(#ffffff0e 1px, transparent 1px), linear-gradient(90deg,#ffffff0e 1px,transparent 1px);
      background-size: 48px 48px; }
  ` });
  const emissionEvidence: {
    background: string; internalPixels: number; changedInternalPixels: number;
    internalMeanChange: number; outsideMeanChange: number; largestInternalChange: number;
  }[] = [];
  const clip = { x: Math.floor(box!.x) - 5, y: Math.floor(box!.y) - 5, width: 25, height: 25 };
  // The octagonal cut in the unchanged 32x32 art viewBox. Test the gemstone,
  // not its surrounding bronze frame or the rectangular button background.
  const cut = [[11, 6], [21, 6], [27, 12], [27, 21], [21, 27], [11, 27], [5, 21], [5, 12]];
  const insideCut = (x: number, y: number) => {
    let inside = false;
    for (let index = 0, previous = cut.length - 1; index < cut.length; previous = index, index += 1) {
      const [xi, yi] = cut[index];
      const [xj, yj] = cut[previous];
      if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  };
  const pixels = async () => {
    const buffer = await page.screenshot({ clip });
    return page.evaluate(async (encoded) => {
      const image = new Image();
      image.src = `data:image/png;base64,${encoded}`;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = image.width; canvas.height = image.height;
      const context = canvas.getContext('2d')!;
      context.drawImage(image, 0, 0);
      return { width: image.width, values: Array.from(context.getImageData(0, 0, image.width, image.height).data) };
    }, buffer.toString('base64'));
  };
  try {
    for (const [name, color] of [['dark', '#171e24'], ['medium', '#6b756b'], ['bright', '#c2b79c']] as const) {
      await page.evaluate((value) => document.documentElement.style.setProperty('--gem-proof-map', value), color);
      await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
      // Compare actual native-resolution pulse phases. Every other gemstone
      // remains frozen at the crest, isolating light from this original cut.
      await holdIdlePhase(first, .5);
      const trough = await pixels();
      const troughPath = testInfo.outputPath(`resource-inner-glow-${name}-native-trough.png`);
      await page.screenshot({ path: troughPath, clip: { x: 0, y: 360, width: 610, height: 408 } });
      await testInfo.attach(`resource-inner-glow-${name}-native-trough`, { path: troughPath, contentType: 'image/png' });
      await holdIdlePhase(first, 0);
      const crest = await pixels();
      const crestPath = testInfo.outputPath(`resource-inner-glow-${name}-native-crest.png`);
      await page.screenshot({ path: crestPath, clip: { x: 0, y: 360, width: 610, height: 408 } });
      await testInfo.attach(`resource-inner-glow-${name}-native-crest`, { path: crestPath, contentType: 'image/png' });
      let internalPixels = 0;
      let changedInternalPixels = 0;
      let internalChange = 0;
      let outsidePixels = 0;
      let outsideChange = 0;
      let largestInternalChange = 0;
      for (let index = 0; index < crest.values.length; index += 4) {
        const x = clip.x + (index / 4) % crest.width + .5;
        const y = clip.y + Math.floor((index / 4) / crest.width) + .5;
        const change = Math.max(...[0, 1, 2].map((channel) => Math.abs(crest.values[index + channel] - trough.values[index + channel])));
        if (insideCut((x - box!.x) / box!.width * 32, (y - box!.y) / box!.height * 32)) {
          internalPixels += 1;
          internalChange += change;
          largestInternalChange = Math.max(largestInternalChange, change);
          if (change >= 8) changedInternalPixels += 1;
        } else if (x < box!.x || x > box!.x + box!.width || y < box!.y || y > box!.y + box!.height) {
          outsidePixels += 1;
          outsideChange += change;
        }
      }
      const internalMeanChange = internalChange / internalPixels;
      const outsideMeanChange = outsideChange / outsidePixels;
      emissionEvidence.push({ background: name, internalPixels, changedInternalPixels, internalMeanChange, outsideMeanChange, largestInternalChange });
      expect(changedInternalPixels, `${name}: light must visibly change inside the original native-size stone`).toBeGreaterThanOrEqual(15);
      expect(internalMeanChange, `${name}: internal pulse cannot be an imperceptible opacity decoration`).toBeGreaterThanOrEqual(8);
      expect(internalMeanChange, `${name}: the gemstone must be the light source, not a surrounding halo`).toBeGreaterThan(outsideMeanChange * 2);
      expect(largestInternalChange).toBeGreaterThanOrEqual(20);
    }
    const evidencePath = testInfo.outputPath('native-size-internal-light-pixel-proof.json');
    await writeFile(evidencePath, JSON.stringify({ gemWidth: box!.width, mapTonesAreControlledFixtureSwatches: true, onlyFirstGemPhaseVaries: true, emissionEvidence }, null, 2));
    await testInfo.attach('native-size-internal-light-pixel-proof', { path: evidencePath, contentType: 'application/json' });
  } finally {
    await backdrop.evaluate((element) => element.remove());
    await page.evaluate(() => document.documentElement.style.removeProperty('--gem-proof-map'));
  }
});

test('faceted gems retain labels, hit targets, geometry and manual single/multi resource edits', async ({ page, request }) => {
  const fixture = await gemFixture(request);
  await joinPlayer(page, fixture.code);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await idle(page);
  const levelOne = gems(page, 'L1');
  await expect(levelOne).toHaveCount(4);
  await expect(levelOne.locator('svg.resource-gem-art')).toHaveCount(4);
  const artProperties = await levelOne.evaluateAll((elements) => elements.map((element) => ({
    width: parseFloat(getComputedStyle(element).width),
    height: parseFloat(getComputedStyle(element).height),
    decorative: element.querySelector('.resource-gem-art')?.getAttribute('aria-hidden'),
    facets: element.querySelectorAll('.resource-gem-art path, .resource-gem-art polygon').length,
  })));
  for (const art of artProperties) {
    // CSS zoom quantizes computed dimensions to the browser's layout grid;
    // 17px at 0.85 can serialize as 16.9853px without changing the hit target.
    expect(Math.min(Math.abs(art.width - 17), Math.abs(art.width - 18))).toBeLessThan(.05);
    expect(art.height).toBe(art.width);
    expect(art.decorative).toBe('true');
    expect(art.facets).toBeGreaterThan(1);
  }
  const gradientIds = await resources(page).locator('.resource-gem-art [id]').evaluateAll((elements) => elements.map((element) => element.id));
  expect(new Set(gradientIds).size, 'Each mounted gemstone owns unique SVG paint-server IDs').toBe(gradientIds.length);
  await expect(levelOne.last()).toHaveAccessibleName('L1 slot 4: set 3 remaining');
  await expect(levelOne.last()).toHaveAttribute('title', 'Set 3 / 4 remaining');
  for (const gem of await levelOne.all()) {
    expect(await gem.evaluate((element) => {
      const box = element.getBoundingClientRect();
      return element.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2));
    }), 'The facet/reaction artwork must retain the original jewel hit target').toBe(true);
  }
  const initialGeometry = await geometry(levelOne);
  await levelOne.last().click();
  await expect(row(page, 'L1')).toHaveAccessibleName('L1: 3 of 4 remaining');
  await expect(levelOne.last()).toHaveAttribute('data-gem-effect', 'spend');
  await expect(levelOne.last().locator('.resource-gem-reaction')).toHaveCount(1);
  await expect(levelOne.last().locator('.resource-gem-reaction')).toHaveCSS('pointer-events', 'none');
  await expect(levelOne.last().locator('.gem-energy-thread').first()).toHaveCSS('animation-name', 'gem-thread-spend');
  await expect(levelOne.last().locator('.gem-energy-thread').first()).toHaveCSS('animation-iteration-count', '1');
  await expect(effects(page)).toHaveCount(1);
  expect(await geometry(levelOne)).toEqual(initialGeometry);
  // Reverse while the first animation is still in progress: the old reaction
  // must detach and a fresh restoration reaction must replace it.
  const spentReaction = await levelOne.last().locator('.resource-gem-reaction').elementHandle();
  await levelOne.last().click();
  await expect(row(page, 'L1')).toHaveAccessibleName('L1: 4 of 4 remaining');
  await expect(levelOne.last()).toHaveAttribute('data-gem-effect', 'restore');
  expect(await spentReaction!.evaluate((element) => element.isConnected)).toBe(false);
  await spentReaction!.dispose();
  expect(await geometry(levelOne)).toEqual(initialGeometry);
  await idle(page);
  await expect(levelOne.last().locator('.gem-lit-body')).toHaveCSS('opacity', '1');

  fixture.socket.emit('resource:set', { characterId: fixture.characterId, group: 'spellSlots', key: 'L1', used: 3 });
  await expect(row(page, 'L1')).toHaveAccessibleName('L1: 1 of 4 remaining');
  await expect(levelOne.filter({ has: page.locator('.resource-gem-reaction') })).toHaveCount(3);
  await expect(resources(page).locator('.resource-jewel[data-gem-effect="spend"]')).toHaveCount(3);
  await expect(levelOne.first()).toHaveAttribute('data-gem-effect', 'idle');
  expect(await geometry(levelOne)).toEqual(initialGeometry);
  await idle(page);
  await expect(levelOne.last().locator('.gem-lit-body')).toHaveCSS('opacity', '0');
  fixture.socket.emit('resource:set', { characterId: fixture.characterId, group: 'spellSlots', key: 'L1', used: 0 });
  await expect(row(page, 'L1')).toHaveAccessibleName('L1: 4 of 4 remaining');
  await expect(resources(page).locator('.resource-jewel[data-gem-effect="restore"]')).toHaveCount(3);
  expect(await geometry(levelOne)).toEqual(initialGeometry);
  await idle(page);

  // The same existing correction form handles class and unknown custom rows.
  await resources(page).getByRole('button', { name: /^Sorcery Points: 4 of 6 remaining/ }).click();
  const editor = page.getByRole('form', { name: 'Adjust Sorcery Points', exact: true });
  await editor.getByLabel('Remaining', { exact: true }).fill('6');
  await editor.getByRole('button', { name: 'Apply correction', exact: true }).click();
  await expect(gems(page, 'Sorcery Points').nth(4)).toHaveAttribute('data-gem-effect', 'restore');
  await expect(gems(page, 'Sorcery Points').nth(5)).toHaveAttribute('data-gem-effect', 'restore');
  // A fitting custom row participates in the default ten-row compact rack.
  await expect(resources(page).locator('.core-resource-rows').getByRole('group', { name: /^Moon marks:/ })).toBeVisible();
  const custom = gems(page, 'Moon marks');
  await expect(custom).toHaveCount(3);
  for (const gem of await custom.all()) await expect(gem).toHaveAttribute('data-gem-effect', 'idle');
  await custom.last().click();
  await expect(row(page, 'Moon marks')).toHaveAccessibleName('Moon marks: 3 of 3 remaining');
  await expect(custom.last()).toHaveAttribute('data-gem-effect', 'restore');
  fixture.socket.emit('resource:set', { characterId: fixture.characterId, group: 'resources', key: 'Moon marks', used: 3 });
  await expect(row(page, 'Moon marks')).toHaveAccessibleName('Moon marks: 0 of 3 remaining');
  await expect(custom.locator('.resource-gem-reaction')).toHaveCount(3);
  for (const gem of await custom.all()) await expect(gem).toHaveAttribute('data-gem-effect', 'spend');
  await idle(page);
  const saved = (await fixture.snapshot()).characters.find((character) => character.id === fixture.characterId)!;
  expect(saved.spellSlots).toMatchObject({ L1: { max: 4, used: 0 }, L2: { max: 3, used: 1 } });
  expect(saved.resources).toMatchObject({ 'Sorcery Points': { max: 6, used: 0 }, 'Moon marks': { max: 3, used: 3 } });
  expect(errors).toEqual([]);
});

test('idle gemstone light visibly fades in and out with stronger spell tiers, stable geometry and dark spent sockets', async ({ page, request }, testInfo) => {
  const fixture = await gemFixture(request);
  const spellSlots = Object.fromEntries(Array.from({ length: 9 }, (_, index) => [
    `L${index + 1}`, { max: index === 0 ? 6 : 3, used: 1, maxOverride: true },
  ]));
  fixture.socket.emit('character:update', {
    characterId: fixture.characterId, spellSlots,
    resources: { 'Sorcery Points': { max: 6, used: 2 }, L9: { max: 2, used: 0 } },
  });
  await fixture.snapshot();
  await joinPlayer(page, fixture.code);
  await idle(page);
  const spellGems = (level: number) => resources(page).locator(`.resource-jewel[data-gem-spell-level="${level}"]`);
  const idlePaint = async (locator: Locator) => locator.evaluateAll((elements) => elements.map((element) => ({
    lit: element.classList.contains('lit'),
    effect: element.getAttribute('data-gem-effect'),
    filter: getComputedStyle(element.querySelector('.gem-lit-body')!).filter,
    opacity: Number(getComputedStyle(element.querySelector('.gem-lit-body')!).opacity),
    radiance: Number(getComputedStyle(element.querySelector('.gem-level-radiance')!).opacity),
    bloom: Number(getComputedStyle(element.querySelector('.gem-emission-bloom')!).opacity),
    // Inner emission is a child of the lit body; spent stones hide that whole
    // body rather than replacing the inner path's own paint value.
    core: Number(getComputedStyle(element.querySelector('.gem-inner-emission')!).opacity)
      * Number(getComputedStyle(element.querySelector('.gem-lit-body')!).opacity),
  })));
  const verifyProgression = async (phase: number, reduced = false) => {
    if (reduced) {
      // Do not pause or seek animations while testing that motion is disabled.
      // Poll the browser's real animation list as the media rule takes effect.
      await expect.poll(() => resources(page).locator('.resource-jewel').evaluateAll((elements) =>
        elements.reduce((count, element) => count + element.getAnimations({ subtree: true }).length, 0)),
      ).toBe(0);
    } else {
      expect(await holdIdlePhase(resources(page).locator('.resource-jewel'), phase),
        'Available gemstones must actually run a repeating light animation').toBeGreaterThan(0);
    }
    const activeBrightness: number[] = [];
    const activeRadiance: number[] = [];
    const activeBloom: number[] = [];
    const activeCore: number[] = [];
    for (let level = 1; level <= 9; level += 1) {
      await expect(spellGems(level)).toHaveCount(level === 1 ? 6 : 3);
      const paint = await idlePaint(spellGems(level));
      for (const gem of paint) {
        expect(gem.effect).toBe('idle');
        if (gem.lit) {
          const brightness = Number(/^brightness\(([^)]+)\)$/.exec(gem.filter)?.[1]);
          expect(brightness, `Level ${level} internal glow`).toBeGreaterThanOrEqual(1);
          expect(gem.radiance, `Level ${level} emitted radiance`).toBeGreaterThan(0);
          expect(gem.bloom, `Level ${level} halo must remain subordinate to the gemstone`).toBeLessThanOrEqual(.25);
          if (reduced || phase === 0) {
            expect(gem.core, `Level ${level} internal light must be visible at its crest`).toBeGreaterThanOrEqual(.85);
          } else {
            expect(gem.core, `Level ${level} internal light must visibly fade at its trough`).toBeLessThanOrEqual(.3);
            expect(gem.core, `Level ${level} is still available at the trough`).toBeGreaterThan(0);
          }
          expect(gem.opacity).toBe(1);
        } else {
          expect(gem.filter).toBe('none');
          expect(gem.radiance).toBe(0);
          expect(gem.bloom).toBe(0);
          expect(gem.core).toBe(0);
          expect(gem.opacity).toBe(0);
        }
      }
      activeBrightness.push(Number(/^brightness\(([^)]+)\)$/.exec(paint[0].filter)?.[1]));
      activeRadiance.push(paint[0].radiance);
      activeBloom.push(paint[0].bloom);
      activeCore.push(paint[0].core);
    }
    for (let index = 1; index < activeBrightness.length; index += 1) {
      expect(activeBrightness[index]).toBeGreaterThan(activeBrightness[index - 1]);
      expect(activeRadiance[index]).toBeGreaterThan(activeRadiance[index - 1]);
      expect(activeBloom[index]).toBeGreaterThan(activeBloom[index - 1]);
      expect(activeCore[index]).toBeGreaterThan(activeCore[index - 1]);
    }
    // Extra capacity has an engraving, not a brighter tier than its own level.
    await expect(spellGems(1).nth(4)).toHaveClass(/extra/);
    expect((await idlePaint(spellGems(1).nth(4)))[0]).toEqual((await idlePaint(spellGems(1).first()))[0]);
    for (const gem of await gems(page, 'Sorcery Points').all()) {
      await expect(gem).not.toHaveAttribute('data-gem-spell-level');
      const paint = (await idlePaint(gem))[0];
      const levelOnePaint = (await idlePaint(spellGems(1).first()))[0];
      expect(paint.filter).toBe(paint.lit ? levelOnePaint.filter : 'none');
      expect(paint.radiance).toBe(paint.lit ? levelOnePaint.radiance : 0);
      expect(paint.bloom).toBe(paint.lit ? levelOnePaint.bloom : 0);
      expect(paint.core).toBe(paint.lit ? levelOnePaint.core : 0);
    }
    return { brightness: activeBrightness, radiance: activeRadiance, bloom: activeBloom, core: activeCore };
  };

  const pulseEvidence: Record<string, unknown> = {};
  for (const layout of ['compact', 'concentric'] as const) {
    await setLayout(page, layout);
    const initialGeometry = await geometry(resources(page).locator('.resource-jewel'));
    const trough = await verifyProgression(.5);
    const troughPath = testInfo.outputPath(`spell-level-idle-glow-${layout}-trough.png`);
    await page.screenshot({ path: troughPath });
    await testInfo.attach(`spell-level-idle-glow-${layout}-trough`, { path: troughPath, contentType: 'image/png' });
    const crest = await verifyProgression(0);
    for (let level = 0; level < 9; level += 1) {
      expect(crest.core[level] - trough.core[level], `L${level + 1} needs a clear internal fade, not a nearly static shimmer`).toBeGreaterThanOrEqual(.6);
      expect(crest.core[level] / trough.core[level], `L${level + 1} internal light contrast`).toBeGreaterThanOrEqual(3);
      expect(crest.core[level] - trough.core[level], `L${level + 1} the surrounding halo must not overpower its inner light`)
        .toBeGreaterThan((crest.bloom[level] - trough.bloom[level]) * 3);
      expect(crest.radiance[level], 'Static facets retain spell-tier legibility throughout the pulse').toBe(trough.radiance[level]);
    }
    expect(await geometry(resources(page).locator('.resource-jewel')), 'Light fades must not move or scale resource controls').toEqual(initialGeometry);
    const crestPath = testInfo.outputPath(`spell-level-idle-glow-${layout}-crest.png`);
    await page.screenshot({ path: crestPath });
    await testInfo.attach(`spell-level-idle-glow-${layout}-crest`, { path: crestPath, contentType: 'image/png' });
    pulseEvidence[layout] = { trough, crest, unchangedGeometry: true };
  }
  await resources(page).getByRole('button', { name: /^Additional resources/ }).click();
  const customL9 = page.getByRole('region', { name: 'Additional resource trackers', exact: true })
    .getByRole('group', { name: /^L9:/ }).locator('.resource-jewel');
  await expect(customL9).toHaveCount(2);
  expect(await holdIdlePhase(customL9, 0)).toBeGreaterThan(0);
  for (const gem of await customL9.all()) await expect(gem).not.toHaveAttribute('data-gem-spell-level');
  const levelOnePaint = (await idlePaint(spellGems(1).first()))[0];
  for (const paint of await idlePaint(customL9)) {
    expect(paint.filter).toBe(levelOnePaint.filter);
    expect(paint.radiance).toBe(levelOnePaint.radiance);
    expect(paint.bloom).toBe(levelOnePaint.bloom);
    expect(paint.core).toBe(levelOnePaint.core);
  }
  await page.getByRole('button', { name: 'Close additional resources', exact: true }).click();

  // Tier boosts disappear for the existing outgoing/incoming effects, then
  // return only once a restored gemstone settles back into its active idle.
  fixture.socket.emit('resource:set', { characterId: fixture.characterId, group: 'spellSlots', key: 'L9', used: 2 });
  await expect(spellGems(9).nth(1)).toHaveAttribute('data-gem-effect', 'spend');
  await expect(spellGems(9).nth(1).locator('.gem-level-radiance')).toHaveCSS('opacity', '0');
  await expect(spellGems(9).nth(1).locator('.gem-emission-bloom')).toHaveCSS('animation-iteration-count', '1');
  await idle(page);
  expect((await idlePaint(spellGems(9).nth(1)))[0]).toMatchObject({ lit: false, filter: 'none', radiance: 0, opacity: 0 });
  fixture.socket.emit('resource:set', { characterId: fixture.characterId, group: 'spellSlots', key: 'L9', used: 1 });
  await expect(spellGems(9).nth(1)).toHaveAttribute('data-gem-effect', 'restore');
  await expect(spellGems(9).nth(1).locator('.gem-level-radiance')).toHaveCSS('opacity', '0');
  await expect(spellGems(9).nth(1).locator('.gem-emission-bloom')).toHaveCSS('animation-iteration-count', '1');
  await idle(page);
  await verifyProgression(0);

  // Reduced motion keeps available gems clearly lit with their tier ladder,
  // but removes the continuously running pulse as well as finite reactions.
  // A fresh document discards every animation paused/seeked by phase sampling.
  // This exercises natural CSS animations, not browser-version-specific WAAPI
  // ownership of the animation objects the test has previously manipulated.
  await page.reload();
  await expect(spellGems(9)).toHaveCount(3);
  await idle(page);
  expect(await spellGems(9).first().evaluate((element) =>
    element.getAnimations({ subtree: true }).filter((animation) => animation.playState === 'running').length),
  'Fresh available gems animate naturally before the preference changes').toBeGreaterThan(0);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(spellGems(9).first()).toHaveAttribute('data-gem-motion', 'reduced');
  pulseEvidence.reducedMotion = await verifyProgression(0, true);
  const animations = await resources(page).locator('.resource-jewel, .resource-jewel *').evaluateAll((elements) =>
    elements.map((element) => getComputedStyle(element).animationName));
  expect(animations.every((name) => name === 'none')).toBe(true);
  const evidencePath = testInfo.outputPath('gem-idle-pulse-proof.json');
  await writeFile(evidencePath, JSON.stringify(pulseEvidence, null, 2));
  await testInfo.attach('gem-idle-pulse-proof', { path: evidencePath, contentType: 'application/json' });
  const saved = (await fixture.snapshot()).characters.find((character) => character.id === fixture.characterId)!;
  expect(saved.spellSlots).toMatchObject(spellSlots);
  expect(saved.resources).toMatchObject({ 'Sorcery Points': { max: 6, used: 2 }, L9: { max: 2, used: 0 } });
});

test('native laptop gems visibly breathe through two real-time cycles without moving their sockets', async ({ page, request }, testInfo) => {
  const fixture = await gemFixture(request);
  fixture.socket.emit('character:update', {
    characterId: fixture.characterId,
    spellSlots: { L1: { max: 4, used: 1 }, L5: { max: 3, used: 1, maxOverride: true }, L9: { max: 3, used: 1, maxOverride: true } },
  });
  await fixture.snapshot();
  await joinPlayer(page, fixture.code);
  await setLayout(page, 'concentric');
  await idle(page);
  const first = gems(page, 'L1').first();
  const initialGeometry = await geometry(resources(page).locator('.resource-jewel'));
  const samples = await first.evaluate((element) => new Promise<{ at: number; bloom: number; core: number }[]>((resolve) => {
    const started = performance.now();
    const result: { at: number; bloom: number; core: number }[] = [];
    const frame = () => {
      const at = performance.now() - started;
      result.push({ at,
        bloom: Number(getComputedStyle(element.querySelector('.gem-emission-bloom')!).opacity),
        core: Number(getComputedStyle(element.querySelector('.gem-inner-emission')!).opacity),
      });
      if (at < 7600) requestAnimationFrame(frame);
      else resolve(result);
    };
    requestAnimationFrame(frame);
  }));
  expect(samples.length).toBeGreaterThan(30);
  const coreMinimum = Math.min(...samples.map((sample) => sample.core));
  const coreMaximum = Math.max(...samples.map((sample) => sample.core));
  const bloomMinimum = Math.min(...samples.map((sample) => sample.bloom));
  const bloomMaximum = Math.max(...samples.map((sample) => sample.bloom));
  expect(coreMinimum).toBeLessThan(.3);
  expect(coreMaximum).toBeGreaterThan(.85);
  expect(coreMaximum - coreMinimum, 'A live browser must paint the inner fade, not just declare unused keyframes').toBeGreaterThan(.6);
  expect(bloomMaximum, 'External light stays a subtle reflection around the socket').toBeLessThanOrEqual(.25);
  expect(coreMaximum - coreMinimum).toBeGreaterThan((bloomMaximum - bloomMinimum) * 3);
  expect(await geometry(resources(page).locator('.resource-jewel'))).toEqual(initialGeometry);
  await expect(gems(page, 'L1').last().locator('.gem-emission-bloom')).toHaveCSS('opacity', '0');
  const evidencePath = testInfo.outputPath('gem-live-pulse-samples.json');
  await writeFile(evidencePath, JSON.stringify({ viewport: '1366x768', unchangedGeometry: true, coreMinimum, coreMaximum, bloomMinimum, bloomMaximum, samples }, null, 2));
  await testInfo.attach('gem-live-pulse-samples', { path: evidencePath, contentType: 'application/json' });
});

test('existing Magic Missile cast automatically spends exactly one matching spell-slot gem', async ({ page, request }) => {
  const fixture = await gemFixture(request);
  await joinPlayer(page, fixture.code);
  const before = await fixture.snapshot();
  // Exercise the existing server cast contract without inventing a target or
  // applying damage. Magic Missile creates its established assign-darts roll.
  fixture.socket.emit('ability:roll', { kind: 'pc', refId: fixture.characterId, abilityId: 'gem-magic-missile', castLevel: 1 });
  await expect(row(page, 'L1')).toHaveAccessibleName('L1: 3 of 4 remaining');
  await expect(gems(page, 'L1').last()).toHaveAttribute('data-gem-effect', 'spend');
  await expect(effects(page)).toHaveCount(1);
  const after = await fixture.snapshot();
  const saved = after.characters.find((character) => character.id === fixture.characterId)!;
  expect(after.rollLog.length).toBe(before.rollLog.length + 1);
  expect(after.rollLog.at(-1)?.label).toBe('Magic Missile');
  expect(saved.spellSlots).toMatchObject({ L1: { max: 4, used: 1 }, L2: { max: 3, used: 1 } });
  expect(saved.resources).toMatchObject({ 'Sorcery Points': { max: 6, used: 2 }, 'Moon marks': { max: 3, used: 1 } });
  await idle(page);
});

test('reload, layout changes, character changes and capacity edits never invent gem spending or restoration', async ({ page, request }) => {
  const fixture = await gemFixture(request);
  await joinPlayer(page, fixture.code);
  await idle(page);
  const expectNoReaction = async () => {
    expect(await effects(page).count(), 'Presentation changes must not start a resource-use effect').toBe(0);
    await expect(resources(page).locator('.resource-gem-reaction')).toHaveCount(0);
  };
  await setLayout(page, 'concentric');
  await expect(resources(page).locator('.curved-resource')).toHaveCount(4);
  await expectNoReaction();
  const curvedGeometry = await geometry(gems(page, 'L2'));
  fixture.socket.emit('resource:set', { characterId: fixture.characterId, group: 'spellSlots', key: 'L2', used: 2 });
  await expect(row(page, 'L2')).toHaveAccessibleName('L2: 1 of 3 remaining');
  await expect(gems(page, 'L2').nth(1)).toHaveAttribute('data-gem-effect', 'spend');
  expect(await geometry(gems(page, 'L2'))).toEqual(curvedGeometry);
  await page.reload();
  await expect(row(page, 'L2')).toHaveAccessibleName('L2: 1 of 3 remaining');
  await expectNoReaction();
  await setLayout(page, 'compact');
  await expectNoReaction();

  await resources(page).getByRole('button', { name: /^Level 2:/ }).click();
  const editor = page.getByRole('form', { name: 'Adjust L2', exact: true });
  await editor.getByLabel('Total maximum', { exact: true }).fill('5');
  await editor.getByRole('button', { name: 'Apply correction', exact: true }).click();
  await expect(row(page, 'L2')).toHaveAccessibleName('L2: 3 of 5 remaining');
  await expect(gems(page, 'L2').filter({ has: page.locator('.gem-extra-engraving') })).toHaveCount(2);
  await expect(gems(page, 'L2').locator('.gem-extra-engraving')).toHaveCount(2);
  for (const mark of await gems(page, 'L2').locator('.gem-extra-engraving').all()) await expect(mark).toBeVisible();
  await expect(gems(page, 'L2').last()).toHaveAccessibleName('L2 extra slot 5: set 5 remaining');
  await expect(gems(page, 'L2').last()).toHaveAttribute('title', /beyond 2024 reference/);
  await expectNoReaction();
  fixture.socket.emit('resource:set', { characterId: fixture.characterId, group: 'spellSlots', key: 'L2', max: 3, preserveMax: true });
  await expect(row(page, 'L2')).toHaveAccessibleName('L2: 1 of 3 remaining');
  await expectNoReaction();

  fixture.socket.emit('character:create', { name: 'Gem companion', race: 'Tiefling', className: 'Sorcerer', level: 6, maxHp: 30 });
  const companion = (await fixture.snapshot()).characters.find((character) => character.name === 'Gem companion')!;
  fixture.socket.emit('character:update', { characterId: companion.id,
    spellSlots: { L1: { max: 4, used: 3 }, L2: { max: 3, used: 0 } }, resources: { 'Sorcery Points': { max: 6, used: 0 } } });
  await fixture.snapshot();
  await page.locator('.hud-actions').getByRole('button', { name: 'Party', exact: true }).click();
  await page.locator('.character-window').getByRole('button', { name: 'Change my character', exact: true }).click();
  await page.locator('.claim-row').filter({ hasText: 'Gem companion' }).click();
  await expect(row(page, 'L1')).toHaveAccessibleName('L1: 1 of 4 remaining');
  await expect(row(page, 'L2')).toHaveAccessibleName('L2: 3 of 3 remaining');
  await expectNoReaction();
  const saved = (await fixture.snapshot()).characters.find((character) => character.id === fixture.characterId)!;
  expect(saved.spellSlots.L2).toMatchObject({ max: 3, used: 2, maxOverride: true });
});

test('reduced motion keeps resource state editable without looping gem or reaction animations', async ({ browser, request }) => {
  const fixture = await gemFixture(request);
  const context = await browser.newContext({ reducedMotion: 'reduce' });
  try {
    const page = await context.newPage();
    await joinPlayer(page, fixture.code);
    fixture.socket.emit('resource:set', { characterId: fixture.characterId, group: 'spellSlots', key: 'L1', used: 2 });
    await expect(row(page, 'L1')).toHaveAccessibleName('L1: 2 of 4 remaining');
    await expect(gems(page, 'L1').filter({ has: page.locator('.resource-gem-art') })).toHaveCount(4);
    expect(await effects(page).count()).toBe(0);
    await expect(resources(page).locator('.resource-gem-reaction')).toHaveCount(0);
    fixture.socket.emit('resource:set', { characterId: fixture.characterId, group: 'spellSlots', key: 'L1', used: 0 });
    await expect(row(page, 'L1')).toHaveAccessibleName('L1: 4 of 4 remaining');
    expect(await effects(page).count()).toBe(0);
    const animationNames = await resources(page).locator('.resource-jewel, .resource-jewel *').evaluateAll((elements) =>
      elements.flatMap((element) => [null, '::before', '::after'].map((pseudo) => getComputedStyle(element, pseudo).animationName)),
    );
    expect(animationNames.every((name) => name === 'none'), JSON.stringify(animationNames)).toBe(true);
    expect((await fixture.snapshot()).characters.find((character) => character.id === fixture.characterId)?.spellSlots.L1)
      .toMatchObject({ max: 4, used: 0 });
  } finally { await context.close(); }
});

test('hidden pages cancel gem reactions and resume without replaying hidden resource edits', async ({ page, request }) => {
  const fixture = await gemFixture(request);
  await joinPlayer(page, fixture.code);
  fixture.socket.emit('resource:set', { characterId: fixture.characterId, group: 'spellSlots', key: 'L1', used: 1 });
  await expect(row(page, 'L1')).toHaveAccessibleName('L1: 3 of 4 remaining');
  await expect(gems(page, 'L1').last()).toHaveAttribute('data-gem-effect', 'spend');
  // A bounded synthetic visibility contract, not an OS background-window test.
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(gems(page, 'L1').last()).toHaveAttribute('data-gem-paused', 'true');
  await expect(gems(page, 'L1').last()).toHaveAttribute('data-gem-effect', 'idle');
  await expect(resources(page).locator('.resource-gem-reaction')).toHaveCount(0);
  const activeBloom = gems(page, 'L1').first().locator('.gem-emission-bloom');
  const activeCore = gems(page, 'L1').first().locator('.gem-inner-emission');
  await expect(activeBloom).toHaveCSS('animation-play-state', 'paused');
  await expect(activeCore).toHaveCSS('animation-play-state', 'paused');
  const pausedAt = await activeBloom.evaluate((element) => element.getAnimations()[0].currentTime);
  await page.waitForTimeout(150);
  expect(await activeBloom.evaluate((element) => element.getAnimations()[0].currentTime), 'Hidden-page idle light must stop advancing').toBe(pausedAt);
  fixture.socket.emit('resource:set', { characterId: fixture.characterId, group: 'spellSlots', key: 'L1', used: 3 });
  await expect(row(page, 'L1')).toHaveAccessibleName('L1: 1 of 4 remaining');
  expect(await effects(page).count()).toBe(0);
  await page.evaluate(() => {
    Reflect.deleteProperty(document, 'hidden');
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(gems(page, 'L1').last()).toHaveAttribute('data-gem-paused', 'false');
  await expect(activeBloom).toHaveCSS('animation-play-state', 'running');
  await expect(activeCore).toHaveCSS('animation-play-state', 'running');
  expect(await effects(page).count()).toBe(0);
  await expect(resources(page).locator('.resource-gem-reaction')).toHaveCount(0);
  fixture.socket.emit('resource:set', { characterId: fixture.characterId, group: 'spellSlots', key: 'L1', used: 0 });
  await expect(row(page, 'L1')).toHaveAccessibleName('L1: 4 of 4 remaining');
  await expect(resources(page).locator('.resource-jewel[data-gem-effect="restore"]')).toHaveCount(3);
  // A preference change during a running pulse cancels it immediately; turning
  // motion back on must not treat the already-restored resources as a new grant.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(gems(page, 'L1').last()).toHaveAttribute('data-gem-motion', 'reduced');
  expect(await effects(page).count()).toBe(0);
  await expect(resources(page).locator('.resource-gem-reaction')).toHaveCount(0);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await expect(gems(page, 'L1').last()).toHaveAttribute('data-gem-motion', 'animated');
  expect(await effects(page).count()).toBe(0);
  await expect(resources(page).locator('.resource-gem-reaction')).toHaveCount(0);
});
