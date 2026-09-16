import { test, expect, type APIRequestContext, type BrowserContext, type Page } from '@playwright/test';
import { io, type Socket } from 'socket.io-client';
import type { StateSnapshot } from '../shared/types';
import { DM_SECRET, PORT } from './playwright.config';

const BASE = `http://localhost:${PORT}`;
const connections: Socket[] = [];
test.afterEach(() => connections.splice(0).forEach((socket) => socket.disconnect()));

type OrbFrame = {
  stamp: number; shaderTime: number; fill: number; impact: number;
  impactAge: number; priorFill: number | null; width: number; height: number;
};
type OrbProbe = OrbFrame & {
  frames: number; history: OrbFrame[];
  glassAlpha: number; liquidAlpha: number; outsideAlpha: number;
  core: number[]; thinEdge: number[]; liquid: number[]; glass: number[];
  interior: number[][];
};

// Only the disposable E2E service on PORT is used: no preview/live database,
// claimed character or player session participates in these cosmetic checks.
async function orbFixture(request: APIRequestContext) {
  const response = await request.post('/api/sessions', {
    headers: { 'x-dm-passphrase': DM_SECRET },
    data: { name: 'Translucent liquid orb regression' },
  });
  expect(response.ok()).toBeTruthy();
  const { code } = await response.json();
  const socket = io(BASE, { transports: ['websocket'], forceNew: true });
  connections.push(socket);
  const snapshot = async (): Promise<StateSnapshot> => {
    const result = await socket.timeout(5000).emitWithAck('join', {
      sessionCode: code, role: 'dm', dmPassphrase: DM_SECRET,
    });
    expect(result.ok).toBe(true);
    return result.snapshot;
  };
  const initial = await snapshot();
  const characterId = initial.characters.find((character) => character.name === 'Druk')!.id;
  socket.emit('character:update', { characterId, maxHp: 80, curHp: 40, tempHp: 0 });
  const ready = await snapshot();
  expect(ready.characters.find((character) => character.id === characterId)).toMatchObject({ maxHp: 80, curHp: 40, tempHp: 0 });
  return { code, characterId, socket, snapshot };
}

async function joinPlayer(page: Page, code: string) {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto(`/join?code=${code}`);
  await page.getByRole('button', { name: 'Join', exact: true }).click();
  await page.locator('.claim-row').filter({ hasText: 'Druk' }).click();
  await expect(page.locator('[data-testid="player-hud"]')).toBeVisible();
}

/** Read actual shader output synchronously after its draw, before the browser
 * discards a non-preserved WebGL drawing buffer. Instrumentation is test-only;
 * no production preserveDrawingBuffer, counters or renderer debug APIs needed. */
async function watchOrbFrames(context: BrowserContext) {
  await context.addInitScript(() => {
    const original = WebGLRenderingContext.prototype.drawArrays;
    WebGLRenderingContext.prototype.drawArrays = function (...args: Parameters<typeof original>) {
      original.apply(this, args);
      if (this.isContextLost()) return;
      const canvas = this.canvas;
      if (!(canvas instanceof HTMLCanvasElement)) return;
      const root = canvas.closest('.liquid-orb-effects:not(.temporary)');
      if (!root) return;
      (root as HTMLElement & { orbRawDraw?: () => void }).orbRawDraw = () => original.call(this, this.TRIANGLES, 0, 6);
      const probe = root as HTMLElement & { orbProbe?: OrbProbe };
      const program = this.getParameter(this.CURRENT_PROGRAM) as WebGLProgram;
      const uniform = (name: string) => {
        const location = this.getUniformLocation(program, name);
        return location ? this.getUniform(program, location) as number : null;
      };
      // One bounded framebuffer read is cheaper than synchronizing the GPU for
      // each individual sample. The normal canvas is at most 384 square pixels.
      const pixels = new Uint8Array(canvas.width * canvas.height * 4);
      this.readPixels(0, 0, canvas.width, canvas.height, this.RGBA, this.UNSIGNED_BYTE, pixels);
      const rgbaAt = (x: number, y: number) => {
        const offset = (Math.floor(canvas.height * y) * canvas.width + Math.floor(canvas.width * x)) * 4;
        return Array.from(pixels.subarray(offset, offset + 4));
      };
      const frame: OrbFrame = {
        stamp: performance.now(), shaderTime: uniform('time')!,
        fill: uniform('fill')!, impact: uniform('impact')!,
        impactAge: uniform('impactAge')!, priorFill: uniform('priorFill'),
        width: canvas.width, height: canvas.height,
      };
      const glass = rgbaAt(.67, .82), liquid = rgbaAt(.5, .25);
      probe.orbProbe = {
        ...frame,
        frames: (probe.orbProbe?.frames ?? 0) + 1,
        history: [...(probe.orbProbe?.history ?? []).slice(-95), frame],
        glassAlpha: glass[3], liquidAlpha: liquid[3], outsideAlpha: rgbaAt(.02, .02)[3],
        core: rgbaAt(.5, .42), thinEdge: rgbaAt(.93, .42), glass, liquid,
        interior: [.2, .35, .5, .65, .8].flatMap((y) => [.2, .35, .5, .65, .8].map((x) => rgbaAt(x, y))),
      };
    };
  });
}

const healthOrb = (page: Page) => page.locator('.liquid-orb-effects:not(.temporary)');
async function orbProbe(page: Page) {
  return healthOrb(page).evaluate((element) => (element as HTMLElement & { orbProbe?: OrbProbe }).orbProbe);
}

test('liquid shader has real transparency and responds only to actual HP changes', async ({ page, request }) => {
  const fixture = await orbFixture(request);
  await watchOrbFrames(page.context());
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await joinPlayer(page, fixture.code);
  const orb = healthOrb(page);
  await expect(orb).toHaveAttribute('data-liquid-renderer', 'webgl');
  await expect(orb).toHaveAttribute('data-liquid-effect', 'idle');
  await expect.poll(async () => (await orbProbe(page))?.frames ?? 0).toBeGreaterThan(1);
  const pixels = (await orbProbe(page))!;
  expect(pixels.fill).toBeCloseTo(.5, 2);
  expect(pixels.outsideAlpha).toBe(0);
  // Empty glass and submerged liquid both reveal the actual layer underneath;
  // the liquid remains denser so the remaining HP is immediately legible.
  expect(pixels.glassAlpha).toBeGreaterThan(0);
  expect(pixels.glassAlpha).toBeLessThan(110);
  expect(pixels.liquidAlpha).toBeGreaterThan(pixels.glassAlpha);
  expect(pixels.liquidAlpha).toBeLessThan(254);
  expect(pixels.liquid[0], 'The successfully linked shader must produce real colored liquid, not an empty buffer').toBeGreaterThan(10);
  expect(pixels.interior.some(([r, g, b, a]) => r + g + b > 12 && a > 16)).toBe(true);
  expect(pixels.impact).toBe(0);
  await expect(orb).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');

  // Count actual shader draws, not requestAnimationFrame callbacks. This is a
  // ceiling check, not a claim that a slow CI renderer reaches any target FPS.
  await orb.evaluate((element) => { (element as HTMLElement & { orbProbe: OrbProbe }).orbProbe.history = []; });
  await page.waitForTimeout(1120);
  const frames = (await orbProbe(page))!.history;
  expect(frames.length).toBeGreaterThan(2);
  const elapsed = frames.at(-1)!.shaderTime - frames[0].shaderTime;
  expect(elapsed).toBeGreaterThan(0);
  expect((frames.length - 1) / elapsed, 'The cosmetic renderer stays capped near 30 Hz').toBeLessThanOrEqual(32.5);
  for (const frame of frames) {
    expect(frame.width).toBeGreaterThanOrEqual(96);
    expect(frame.width).toBeLessThanOrEqual(384);
    expect(frame.height).toBe(frame.width);
    expect(frame.fill).toBeGreaterThanOrEqual(0);
    expect(frame.fill).toBeLessThanOrEqual(1);
  }
  await test.info().attach('liquid-renderer-budget.json', {
    contentType: 'application/json',
    body: JSON.stringify({ draws: frames.length, observedSeconds: elapsed, drawsPerSecond: (frames.length - 1) / elapsed,
      width: pixels.width, height: pixels.height, halfFill: { glass: pixels.glass, liquid: pixels.liquid, core: pixels.core, edge: pixels.thinEdge, outsideAlpha: pixels.outsideAlpha } }, null, 2),
  });

  // A larger maximum changes the fill, not the current HP or impact feedback.
  await orb.evaluate((element) => {
    const probe = element as HTMLElement & { effectHistory?: string[] };
    probe.effectHistory = [];
    new MutationObserver(() => probe.effectHistory!.push(probe.dataset.liquidEffect ?? ''))
      .observe(element, { attributes: true, attributeFilter: ['data-liquid-effect'] });
  });
  fixture.socket.emit('character:update', { characterId: fixture.characterId, maxHp: 100 });
  await expect(page.getByRole('button', { name: 'Health 40 of 100. Open health controls.', exact: true })).toBeVisible();
  await expect.poll(async () => Math.abs(((await orbProbe(page))?.fill ?? 1) - .4)).toBeLessThan(.005);
  expect(await orb.evaluate((element) => (element as HTMLElement & { effectHistory: string[] }).effectHistory)).toEqual([]);
  expect((await orbProbe(page))!.impact, 'A maximum-only edit cannot produce a damage or healing impulse').toBe(0);

  fixture.socket.emit('damage:apply', { kind: 'pc', refId: fixture.characterId, amount: 10 });
  await expect(page.getByRole('button', { name: 'Health 30 of 100. Open health controls.', exact: true })).toBeVisible();
  await expect(orb).toHaveAttribute('data-liquid-effect', 'damage');
  await expect.poll(async () => (await orbProbe(page))?.impact ?? 0).toBeLessThan(0);
  await expect(orb).toHaveAttribute('data-liquid-effect', 'idle', { timeout: 4000 });
  fixture.socket.emit('damage:apply', { kind: 'pc', refId: fixture.characterId, amount: -5 });
  await expect(page.getByRole('button', { name: 'Health 35 of 100. Open health controls.', exact: true })).toBeVisible();
  await expect(orb).toHaveAttribute('data-liquid-effect', 'healing');
  await expect.poll(async () => (await orbProbe(page))?.impact ?? 0).toBeGreaterThan(0);
  await expect(orb).toHaveAttribute('data-liquid-effect', 'idle', { timeout: 4000 });
  expect((await fixture.snapshot()).characters.find((character) => character.id === fixture.characterId)?.curHp).toBe(35);

  await page.reload();
  await expect(page.locator('[data-testid="player-hud"]')).toBeVisible();
  await expect(orb).toHaveAttribute('data-liquid-effect', 'idle');
  await expect.poll(async () => (await orbProbe(page))?.fill).toBeCloseTo(.35, 2);
  // A runtime context loss retains readable current HP and its static fill.
  const contextLossSupported = await orb.locator('canvas').evaluate((canvas) => {
    const extension = (canvas as HTMLCanvasElement).getContext('webgl')?.getExtension('WEBGL_lose_context');
    extension?.loseContext();
    return Boolean(extension);
  });
  expect(contextLossSupported).toBe(true);
  await expect(orb).toHaveAttribute('data-liquid-renderer', 'fallback');
  await expect(orb.locator('.orb-fallback-fill')).toHaveAttribute('style', /height: 35%/);
  expect(errors).toEqual([]);
});

test('one-HP changes have small signed impulses rather than a minimum-strength splash', async ({ page, request }) => {
  const fixture = await orbFixture(request);
  await watchOrbFrames(page.context());
  await joinPlayer(page, fixture.code);
  await expect.poll(async () => (await orbProbe(page))?.frames ?? 0).toBeGreaterThan(0);
  fixture.socket.emit('damage:apply', { kind: 'pc', refId: fixture.characterId, amount: 1 });
  await expect(page.locator('.health-reliquary')).toHaveAccessibleName('Health 39 of 80. Open health controls.');
  await expect.poll(async () => (await orbProbe(page))?.impact ?? 0).toBeLessThan(0);
  const damage = (await orbProbe(page))!;
  expect(Math.abs(damage.impact)).toBeLessThan(.35);
  expect(damage.impact).toBeCloseTo(-2.4 / 80, 3);
  expect(damage.priorFill).toBeCloseTo(.5, 3);
  fixture.socket.emit('damage:apply', { kind: 'pc', refId: fixture.characterId, amount: -1 });
  await expect(page.locator('.health-reliquary')).toHaveAccessibleName('Health 40 of 80. Open health controls.');
  await expect.poll(async () => (await orbProbe(page))?.impact ?? 0).toBeGreaterThan(0);
  const healing = (await orbProbe(page))!;
  expect(healing.impact).toBeLessThan(.35);
  expect(healing.impact).toBeCloseTo(2.4 / 80, 3);
  expect(healing.priorFill).toBeCloseTo(39 / 80, 3);
  expect((await fixture.snapshot()).characters.find((character) => character.id === fixture.characterId))
    .toMatchObject({ curHp: 40, maxHp: 80, tempHp: 0 });
});

test('empty and full endpoints render clear glass versus a translucent volumetric liquid', async ({ browser, request }) => {
  const fixture = await orbFixture(request);
  const context = await browser.newContext({ reducedMotion: 'reduce' });
  try {
    await watchOrbFrames(context);
    const page = await context.newPage();
    await joinPlayer(page, fixture.code);
    const orb = healthOrb(page);
    await expect(orb).toHaveAttribute('data-liquid-renderer', 'webgl');
    fixture.socket.emit('character:update', { characterId: fixture.characterId, curHp: 0 });
    await expect(page.locator('.health-reliquary')).toHaveAccessibleName('Health 0 of 80. Open health controls.');
    await expect.poll(async () => (await orbProbe(page))?.fill).toBe(0);
    await expect(orb).toHaveAttribute('data-liquid-empty', 'true');
    const emptyShadow = await orb.evaluate((element) => getComputedStyle(element).boxShadow);
    const emptyShadowColors = [...emptyShadow.matchAll(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,[^)]+)?\)/g)];
    expect(emptyShadowColors.every(([, r, g, b]) => Number(r) <= Math.max(Number(g), Number(b))),
      `Empty glass must not retain a red CSS halo: ${emptyShadow}`).toBe(true);
    expect(emptyShadow === 'none' || emptyShadow.replace(/rgba?\([^)]*\)/g, 'color').split(',').every((layer) => layer.includes('inset')),
      `Only a neutral inset glass shadow may remain at zero HP: ${emptyShadow}`).toBe(true);
    const empty = (await orbProbe(page))!;
    const redness = (samples: number[][]) => Math.max(...samples.map(([r, g, b]) => r - Math.max(g, b)));
    expect(empty.outsideAlpha).toBe(0);
    expect(empty.interior.some(([r, g, b, a]) => r + g + b > 0 && a > 0), 'Empty still renders its transparent glass shell').toBe(true);
    expect(redness(empty.interior), `No red liquid or residual glow may remain at zero fill: ${JSON.stringify(empty.interior)}`).toBeLessThanOrEqual(24);
    expect(empty.core[3], 'The empty center is clear glass, not an opaque colored disk').toBeLessThan(110);
    expect(empty.impact).toBe(0);

    fixture.socket.emit('character:update', { characterId: fixture.characterId, curHp: 80 });
    await expect(page.locator('.health-reliquary')).toHaveAccessibleName('Health 80 of 80. Open health controls.');
    await expect.poll(async () => (await orbProbe(page))?.fill).toBe(1);
    await expect(orb).not.toHaveAttribute('data-liquid-empty', 'true');
    await expect(orb).toHaveAttribute('data-liquid-full', 'true');
    const full = (await orbProbe(page))!;
    expect(full.outsideAlpha).toBe(0);
    expect(redness(full.interior)).toBeGreaterThan(Math.max(30, redness(empty.interior) + 15));
    expect(full.core[3]).toBeGreaterThan(100);
    expect(full.core[3], 'Even the dense center retains slight real transparency').toBeLessThan(254);
    expect(full.thinEdge[3]).toBeGreaterThan(0);
    expect(full.thinEdge[3], `The thin side transmits more map than the thick center: ${JSON.stringify({ core: full.core, edge: full.thinEdge })}`)
      .toBeLessThan(full.core[3]);
    expect(full.interior.every((rgba) => rgba.length === 4 && rgba.every(Number.isFinite))).toBe(true);
    expect(full.impact).toBe(0);
    await test.info().attach('liquid-volume-pixels.json', {
      contentType: 'application/json',
      body: JSON.stringify({ empty: { core: empty.core, edge: empty.thinEdge, glass: empty.glass, samples: empty.interior }, full: { core: full.core, edge: full.thinEdge, glass: full.glass, samples: full.interior } }, null, 2),
    });
  } finally {
    await context.close();
  }
});

test('damage and healing visibly roll and reshape liquid at a 145-pixel globe', async ({ page, request }) => {
  const fixture = await orbFixture(request);
  await watchOrbFrames(page.context());
  await joinPlayer(page, fixture.code);
  await expect.poll(async () => (await orbProbe(page))?.frames ?? 0).toBeGreaterThan(0);
  // Replay the app's actual compiled shader at a fixed visual size and time.
  // Each comparison changes only the impact, not HP fill or background, so a
  // falling number or moving liquid level cannot masquerade as visible motion.
  const evidence = await healthOrb(page).evaluate((element) => {
    const canvas = element.querySelector('canvas')!;
    const gl = canvas.getContext('webgl')!;
    const program = gl.getParameter(gl.CURRENT_PROGRAM) as WebGLProgram;
    const draw = (element as HTMLElement & { orbRawDraw: () => void }).orbRawDraw;
    const names = ['time', 'fill', 'priorFill', 'impact', 'impactAge'];
    const uniforms = names.map((name) => {
      const location = gl.getUniformLocation(program, name)!;
      return { name, location, value: gl.getUniform(program, location) as number };
    });
    const previousFramebuffer = gl.getParameter(gl.FRAMEBUFFER_BINDING) as WebGLFramebuffer | null;
    const previousTexture = gl.getParameter(gl.TEXTURE_BINDING_2D) as WebGLTexture | null;
    const previousViewport = Array.from(gl.getParameter(gl.VIEWPORT) as Int32Array);
    const texture = gl.createTexture()!, framebuffer = gl.createFramebuffer()!;
    const size = 145, fill = .65, h0 = fill * 2 - 1;
    try {
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, size, size, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error('Unable to create the isolated liquid pixel-readback target');
      gl.viewport(0, 0, size, size);
      const render = (impact: number, age: number, prior: number) => {
        const values: Record<string, number> = { time: 12.5, fill, priorFill: prior, impact, impactAge: age };
        uniforms.forEach(({ name, location }) => gl.uniform1f(location, values[name]));
        draw();
        const rgba = new Uint8Array(size * size * 4);
        gl.readPixels(0, 0, size, size, gl.RGBA, gl.UNSIGNED_BYTE, rgba);
        return rgba;
      };
      const comparisons = [-.6, .6].flatMap((impact) => [.12, .30, .55].map((age) => {
        const prior = impact < 0 ? .82 : .48;
        const baseline = render(0, age, prior), reaction = render(impact, age, prior);
        let changed = 0, surfaceChanged = 0, bodyChanged = 0, interior = 0, outsideColored = 0;
        for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
          const px = (x + .5) / size * 2 - 1, py = (y + .5) / size * 2 - 1;
          const r2 = px * px + py * py, index = (y * size + x) * 4;
          if (r2 > 1) { if (reaction[index + 3]) outsideColored++; continue; }
          if (r2 > .94 * .94) continue;
          interior++;
          const beforeAlpha = baseline[index + 3] / 255, afterAlpha = reaction[index + 3] / 255;
          const background = [90, 84, 71];
          const difference = Math.max(...background.map((bg, channel) => Math.abs(
            reaction[index + channel] * afterAlpha + bg * (1 - afterAlpha)
            - baseline[index + channel] * beforeAlpha - bg * (1 - beforeAlpha),
          )));
          if (difference < 12) continue;
          changed++;
          if (Math.abs(py - h0) < .25) surfaceChanged++;
          if (py < h0 - .25) bodyChanged++;
        }
        const liquidTop = (pixels: Uint8Array, x: number) => {
          let highest = -1;
          for (let y = Math.floor((fill - .25) * size); y < size; y++) {
            const index = (y * size + x) * 4;
            if (pixels[index + 3] > 90 && pixels[index] - Math.max(pixels[index + 1], pixels[index + 2]) > 28) highest = y;
          }
          return highest;
        };
        let maximumSurfaceShift = 0;
        for (let x = Math.floor(size * .18); x <= size * .82; x++) {
          const before = liquidTop(baseline, x), after = liquidTop(reaction, x);
          if (before >= 0 && after >= 0) maximumSurfaceShift = Math.max(maximumSurfaceShift, Math.abs(after - before));
        }
        return { mode: impact < 0 ? 'damage' : 'healing', impact, age, size, changed, surfaceChanged, bodyChanged, changedPercent: 100 * changed / interior, maximumSurfaceShift, outsideColored };
      }));
      return comparisons;
    } finally {
      gl.bindFramebuffer(gl.FRAMEBUFFER, previousFramebuffer);
      gl.bindTexture(gl.TEXTURE_2D, previousTexture);
      gl.viewport(previousViewport[0], previousViewport[1], previousViewport[2], previousViewport[3]);
      uniforms.forEach(({ location, value }) => gl.uniform1f(location, value));
      gl.deleteFramebuffer(framebuffer);
      gl.deleteTexture(texture);
      draw();
    }
  });
  for (const mode of ['damage', 'healing']) {
    const frames = evidence.filter((frame) => frame.mode === mode);
    const details = `${mode}: ${JSON.stringify(frames)}`;
    expect(Math.max(...frames.map((frame) => frame.changed)), details).toBeGreaterThanOrEqual(200);
    expect(Math.max(...frames.map((frame) => frame.surfaceChanged)), details).toBeGreaterThanOrEqual(50);
    expect(Math.max(...frames.map((frame) => frame.bodyChanged)), details).toBeGreaterThanOrEqual(50);
    expect(Math.max(...frames.map((frame) => frame.maximumSurfaceShift)), details).toBeGreaterThanOrEqual(3);
    expect(frames.every((frame) => frame.outsideColored === 0), 'The liquid moves inside a fixed sphere').toBe(true);
  }
  await test.info().attach('liquid-reaction-145px.json', { contentType: 'application/json', body: JSON.stringify(evidence, null, 2) });
  expect((await fixture.snapshot()).characters.find((character) => character.id === fixture.characterId))
    .toMatchObject({ curHp: 40, maxHp: 80, tempHp: 0 });
});

test('temporary HP is an enveloping forcefield and inline bonus with unchanged absorption and edit controls', async ({ page, request }) => {
  const fixture = await orbFixture(request);
  await watchOrbFrames(page.context());
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await joinPlayer(page, fixture.code);
  const orb = healthOrb(page);
  const healthButton = page.locator('.health-reliquary');
  const shield = page.locator('.main-orb .orb-temp-shield');
  const bonus = page.locator('.orb-readout .orb-temp-bonus');
  const controls = page.getByRole('region', { name: 'Health controls', exact: true });
  await expect(page.locator('.temp-vessel, .liquid-orb.temporary')).toHaveCount(0);
  await expect(shield).toHaveCount(0);
  await expect(bonus).toHaveCount(0);
  await expect(page.locator('.orb-ward-flow, .orb-ward-spark, .orb-ward-sigil')).toHaveCount(0);
  await expect(healthButton).toHaveAccessibleName('Health 40 of 80. Open health controls.');

  // Grant through the same existing owner-edit controls as before, not a new
  // shield-specific handler or locally simulated temporary-HP total.
  await healthButton.click();
  await expect(controls).toBeVisible();
  await controls.getByRole('spinbutton').fill('12');
  await controls.getByRole('button', { name: 'Temp HP', exact: true }).click();
  await expect(bonus).toHaveText('+12');
  await expect(shield).toBeVisible();
  await expect(shield).toHaveAttribute('aria-hidden', 'true');
  await expect(shield).toHaveCSS('pointer-events', 'none');
  await expect(shield).toHaveCSS('animation-name', 'orb-shield-breathe');
  await expect(shield).toHaveAttribute('data-shield-effect', 'idle');
  await expect(shield.locator('.orb-ward-impact')).toHaveCount(0);
  await expect(shield).toHaveCSS('border-radius', '50%');
  await expect(shield.locator('svg, img, .orb-ward-sigil')).toHaveCount(0);
  await expect(shield.locator('.orb-ward-flow.flow-back')).toHaveCount(1);
  await expect(shield.locator('.orb-ward-flow.flow-front')).toHaveCount(1);
  await expect.poll(() => shield.locator('.orb-ward-spark').count()).toBeGreaterThanOrEqual(1);
  const shellGeometry = await shield.evaluate((element) => {
    const shell = element.getBoundingClientRect();
    const globe = element.closest('.main-orb')!.getBoundingClientRect();
    return {
      diameterDifference: Math.abs(shell.width - shell.height),
      widthRatio: shell.width / globe.width,
      centerDifference: Math.hypot(shell.x + shell.width / 2 - globe.x - globe.width / 2,
        shell.y + shell.height / 2 - globe.y - globe.height / 2),
    };
  });
  expect(shellGeometry.diameterDifference, 'The protective layer remains a circular shell').toBeLessThanOrEqual(1);
  expect(shellGeometry.centerDifference, 'The forcefield envelops the globe rather than becoming a separate emblem').toBeLessThanOrEqual(1);
  expect(shellGeometry.widthRatio).toBeGreaterThanOrEqual(.9);
  expect(shellGeometry.widthRatio).toBeLessThanOrEqual(1.1);
  await expect(healthButton).toHaveAccessibleName('Health 40 of 80. 12 temporary HP. Open health controls.');
  await expect(orb).toHaveAttribute('data-liquid-effect', 'idle');
  await controls.getByRole('button', { name: 'Close', exact: true }).click();

  const hit = await shield.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    const x = bounds.x + bounds.width / 2, y = bounds.y + bounds.height / 2;
    const target = document.elementFromPoint(x, y);
    return {
      x, y,
      healthTarget: Boolean(element.closest('.health-reliquary')?.contains(target)),
      intercepted: Boolean(target?.closest('.orb-temp-shield')),
    };
  });
  expect(hit.healthTarget).toBe(true);
  expect(hit.intercepted, 'The decorative shield must not intercept the health-orb click').toBe(false);
  await page.mouse.click(hit.x, hit.y);
  await expect(controls).toBeVisible();
  await expect(controls.getByRole('button', { name: 'Temp HP', exact: true })).toBeEnabled();
  await controls.getByRole('button', { name: 'Close', exact: true }).click();

  fixture.socket.emit('damage:apply', { kind: 'pc', refId: fixture.characterId, amount: 2 });
  await expect(bonus).toHaveText('+10');
  await expect(shield).toHaveAttribute('data-shield-effect', 'hit');
  const firstHitRing = await shield.locator('.orb-ward-impact-ring.ring-first').elementHandle();
  expect(firstHitRing).not.toBeNull();
  // A second hit while the first pulse is active must create a fresh wavefront,
  // not inherit the old animation's elapsed time or stale cleanup timeout.
  fixture.socket.emit('damage:apply', { kind: 'pc', refId: fixture.characterId, amount: 3 });
  await expect(bonus).toHaveText('+7');
  await expect(shield).toHaveAttribute('data-shield-effect', 'hit');
  expect(await firstHitRing!.evaluate((element) => element.isConnected), 'Rapid successive hits restart the decorative wavefront').toBe(false);
  await firstHitRing!.dispose();
  await expect(shield.locator('.orb-ward-impact-ring')).toHaveCount(2);
  const impactRing = shield.locator('.orb-ward-impact-ring.ring-first');
  await expect(impactRing).toHaveCSS('animation-name', 'orb-ward-impact-ring');
  const ringBefore = (await impactRing.boundingBox())!;
  await page.waitForTimeout(100);
  const ringAfter = (await impactRing.boundingBox())!;
  expect(ringAfter.width - ringBefore.width, 'The shield hit draws an expanding visible wavefront, not just a state attribute').toBeGreaterThan(5);
  await expect(healthButton).toHaveAccessibleName('Health 40 of 80. 7 temporary HP. Open health controls.');
  await expect(orb).toHaveAttribute('data-liquid-effect', 'idle');
  await expect.poll(async () => (await orbProbe(page))?.fill).toBeCloseTo(.5, 2);
  expect((await fixture.snapshot()).characters.find((character) => character.id === fixture.characterId))
    .toMatchObject({ curHp: 40, maxHp: 80, tempHp: 7 });
  await expect(shield).toHaveAttribute('data-shield-effect', 'idle', { timeout: 2500 });
  await expect(shield.locator('.orb-ward-impact')).toHaveCount(0);

  await page.reload();
  await expect(shield).toBeVisible();
  await expect(bonus).toHaveText('+7');
  await expect(shield).toHaveAttribute('data-shield-effect', 'idle');
  await expect(shield.locator('.orb-ward-impact')).toHaveCount(0);
  await expect(orb).toHaveAttribute('data-liquid-effect', 'idle');
  // The original server absorption consumes seven temp HP and only then three
  // real HP. Shield removal and the globe fill follow those authoritative values.
  fixture.socket.emit('damage:apply', { kind: 'pc', refId: fixture.characterId, amount: 10 });
  await expect(shield).toHaveAttribute('data-shield-effect', 'breaking');
  await expect(bonus).toHaveCount(0);
  await expect(shield).toHaveCSS('animation-name', 'orb-ward-dissipate');
  await expect(shield.locator('.orb-ward-impact-ring')).toHaveCount(2);
  await expect(shield).toHaveCount(0, { timeout: 2500 });
  await expect(page.locator('.orb-ward-flow, .orb-ward-spark, .orb-ward-sigil')).toHaveCount(0);
  await expect(healthButton).toHaveAccessibleName('Health 37 of 80. Open health controls.');
  await expect(orb).toHaveAttribute('data-liquid-effect', 'damage');
  expect((await fixture.snapshot()).characters.find((character) => character.id === fixture.characterId))
    .toMatchObject({ curHp: 37, maxHp: 80, tempHp: 0 });
  fixture.socket.emit('damage:apply', { kind: 'pc', refId: fixture.characterId, amount: -5 });
  await expect(healthButton).toHaveAccessibleName('Health 42 of 80. Open health controls.');
  await expect(shield).toHaveCount(0);
  await expect(bonus).toHaveCount(0);
  await expect(page.locator('.orb-ward-flow, .orb-ward-spark, .orb-ward-sigil')).toHaveCount(0);
  expect((await fixture.snapshot()).characters.find((character) => character.id === fixture.characterId))
    .toMatchObject({ curHp: 42, tempHp: 0 });
  expect(errors).toEqual([]);
});

test('initial temporary HP, increases and character changes do not invent shield hits', async ({ page, request }) => {
  const fixture = await orbFixture(request);
  fixture.socket.emit('tempHp:set', { kind: 'pc', refId: fixture.characterId, amount: 4 });
  fixture.socket.emit('character:create', { name: 'Ward companion', race: 'Human', className: 'Fighter', level: 1, maxHp: 20 });
  const companion = (await fixture.snapshot()).characters.find((character) => character.name === 'Ward companion')!;
  expect(companion).toBeTruthy();
  fixture.socket.emit('character:update', { characterId: companion.id, curHp: 12, tempHp: 2 });
  await fixture.snapshot();
  await joinPlayer(page, fixture.code);
  const shield = page.locator('.orb-temp-shield');
  await expect(page.locator('.orb-temp-bonus')).toHaveText('+4');
  await expect(shield).toHaveAttribute('data-shield-effect', 'idle');
  await expect(shield.locator('.orb-ward-impact')).toHaveCount(0);
  fixture.socket.emit('tempHp:set', { kind: 'pc', refId: fixture.characterId, amount: 9 });
  await expect(page.locator('.orb-temp-bonus')).toHaveText('+9');
  await expect(shield).toHaveAttribute('data-shield-effect', 'idle');
  await expect(shield.locator('.orb-ward-impact')).toHaveCount(0);
  await page.locator('.hud-actions').getByRole('button', { name: 'Party', exact: true }).click();
  await page.locator('.character-window').getByRole('button', { name: 'Change my character', exact: true }).click();
  await page.locator('.claim-row').filter({ hasText: 'Ward companion' }).click();
  await expect(page.locator('.health-reliquary')).toHaveAccessibleName('Health 12 of 20. 2 temporary HP. Open health controls.');
  await expect(shield).toHaveAttribute('data-shield-effect', 'idle');
  await expect(shield.locator('.orb-ward-impact')).toHaveCount(0);
  const characters = (await fixture.snapshot()).characters;
  expect(characters.find((character) => character.id === fixture.characterId)).toMatchObject({ curHp: 40, tempHp: 9 });
  expect(characters.find((character) => character.id === companion.id)).toMatchObject({ curHp: 12, tempHp: 2 });
});

test('reduced motion draws on HP updates without a looping animation or damage flash', async ({ browser, request }) => {
  const fixture = await orbFixture(request);
  const context = await browser.newContext({ reducedMotion: 'reduce' });
  try {
    await watchOrbFrames(context);
    const page = await context.newPage();
    await joinPlayer(page, fixture.code);
    const orb = healthOrb(page);
    await expect(orb).toHaveAttribute('data-liquid-renderer', 'webgl');
    await expect(orb).toHaveAttribute('data-liquid-motion', 'reduced');
    await expect.poll(async () => (await orbProbe(page))?.fill).toBeCloseTo(.5, 2);
    // Two requestAnimationFrames flush initial mount/layout effects; thereafter
    // no unchanged redraws should occur while the page stays visible.
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    const before = (await orbProbe(page))!.frames;
    await page.waitForTimeout(450);
    expect((await orbProbe(page))!.frames).toBe(before);
    fixture.socket.emit('damage:apply', { kind: 'pc', refId: fixture.characterId, amount: 10 });
    await expect(page.getByRole('button', { name: 'Health 30 of 80. Open health controls.', exact: true })).toBeVisible();
    await expect.poll(async () => (await orbProbe(page))?.fill).toBeCloseTo(.375, 2);
    await expect(orb).toHaveAttribute('data-liquid-effect', 'idle');
    expect((await orbProbe(page))!.frames).toBeGreaterThan(before);
    const after = (await orbProbe(page))!.frames;
    await page.waitForTimeout(450);
    expect((await orbProbe(page))!.frames).toBe(after);
    await expect(orb).toHaveCSS('animation-name', 'none');
    fixture.socket.emit('tempHp:set', { kind: 'pc', refId: fixture.characterId, amount: 8 });
    const shield = page.locator('.main-orb .orb-temp-shield');
    await expect(shield).toBeVisible();
    await expect(page.locator('.orb-temp-bonus')).toHaveText('+8');
    const reducedAnimations = await shield.evaluate((element) => [element, ...element.querySelectorAll('*')].map((layer) => ({
      layer: layer.className,
      names: [null, '::before', '::after'].map((pseudo) => getComputedStyle(layer, pseudo).animationName),
    })));
    for (const layer of reducedAnimations) {
      expect(layer.names, `Reduced motion disables every forcefield layer: ${String(layer.layer)}`)
        .toEqual(['none', 'none', 'none']);
    }
    await expect(orb).toHaveAttribute('data-liquid-effect', 'idle');
    fixture.socket.emit('damage:apply', { kind: 'pc', refId: fixture.characterId, amount: 3 });
    await expect(page.locator('.orb-temp-bonus')).toHaveText('+5');
    await expect(shield).toHaveAttribute('data-shield-effect', 'idle');
    await expect(shield.locator('.orb-ward-impact')).toHaveCount(0);
    fixture.socket.emit('damage:apply', { kind: 'pc', refId: fixture.characterId, amount: 5 });
    await expect(page.locator('.health-reliquary')).toHaveAccessibleName('Health 30 of 80. Open health controls.');
    expect(await shield.count(), 'Reduced motion removes a depleted shell without a breaking animation').toBe(0);
    await expect(page.locator('.orb-ward-impact, .orb-temp-bonus')).toHaveCount(0);
  } finally {
    await context.close();
  }
});

test('unavailable WebGL keeps translucent static health and an updating temporary-HP shield', async ({ browser, request }) => {
  const fixture = await orbFixture(request);
  const context = await browser.newContext({ reducedMotion: 'reduce' });
  try {
    await context.addInitScript(() => {
      const original = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (kind: any, ...args: any[]) {
        if (kind === 'webgl' || kind === 'webgl2') return null;
        return original.call(this, kind, ...args);
      } as typeof original;
    });
    const page = await context.newPage();
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await joinPlayer(page, fixture.code);
    const orb = healthOrb(page);
    await expect(page.locator('.liquid-orb-effects.fallback')).toHaveCount(1);
    await expect(page.locator('.orb-temp-shield, .orb-temp-bonus')).toHaveCount(0);
    await expect(orb.locator('.orb-fallback-fill')).toHaveAttribute('style', /height: 50%/);
    fixture.socket.emit('damage:apply', { kind: 'pc', refId: fixture.characterId, amount: 10 });
    fixture.socket.emit('tempHp:set', { kind: 'pc', refId: fixture.characterId, amount: 12 });
    await expect(page.getByRole('button', { name: 'Health 30 of 80. 12 temporary HP. Open health controls.', exact: true })).toBeVisible();
    await expect(orb.locator('.orb-fallback-fill')).toHaveAttribute('style', /height: 37.5%/);
    await expect(page.locator('.main-orb .orb-temp-shield')).toBeVisible();
    await expect(page.locator('.orb-readout .orb-temp-bonus')).toHaveText('+12');
    await expect(page.locator('.orb-temp-shield')).toHaveCSS('animation-name', 'none');
    await expect(page.locator('.temp-vessel, .liquid-orb.temporary')).toHaveCount(0);
    await expect(page.locator('.liquid-orb-effects.fallback')).toHaveCount(1);
    await expect(orb).toHaveAttribute('data-liquid-effect', 'idle');
    await expect(orb).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    const snapshot = await fixture.snapshot();
    expect(snapshot.characters.find((character) => character.id === fixture.characterId)).toMatchObject({ curHp: 30, maxHp: 80, tempHp: 12 });
    expect(errors).toEqual([]);
  } finally {
    await context.close();
  }
});

test('hidden fallback pages cancel shield impacts and resume without replaying hidden damage', async ({ browser, request }) => {
  const fixture = await orbFixture(request);
  fixture.socket.emit('tempHp:set', { kind: 'pc', refId: fixture.characterId, amount: 12 });
  await fixture.snapshot();
  const context = await browser.newContext({ reducedMotion: 'no-preference' });
  try {
    await context.addInitScript(() => {
      const original = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (kind: any, ...args: any[]) {
        if (kind === 'webgl' || kind === 'webgl2') return null;
        return original.call(this, kind, ...args);
      } as typeof original;
    });
    const page = await context.newPage();
    await joinPlayer(page, fixture.code);
    const shield = page.locator('.orb-temp-shield');
    await expect(healthOrb(page)).toHaveAttribute('data-liquid-renderer', 'fallback');
    await expect(shield).toHaveAttribute('data-shield-effect', 'idle');
    await expect(shield).toHaveAttribute('data-shield-paused', 'false');
    fixture.socket.emit('damage:apply', { kind: 'pc', refId: fixture.characterId, amount: 1 });
    await expect(page.locator('.orb-temp-bonus')).toHaveText('+11');
    await expect(shield).toHaveAttribute('data-shield-effect', 'hit');

    // Deliberately simulate the document visibility contract in this isolated
    // browser context. This does not claim an OS/background-tab integration test.
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await expect(shield).toHaveAttribute('data-shield-paused', 'true');
    await expect(shield).toHaveAttribute('data-shield-effect', 'idle');
    await expect(shield.locator('.orb-ward-impact')).toHaveCount(0);
    const pausedLayers = await shield.evaluate((element) => [element, ...element.querySelectorAll('*')].flatMap((layer) =>
      [null, '::before', '::after'].map((pseudo) => ({
        name: getComputedStyle(layer, pseudo).animationName,
        state: getComputedStyle(layer, pseudo).animationPlayState,
      })),
    ));
    expect(pausedLayers.some((layer) => layer.name !== 'none')).toBe(true);
    for (const layer of pausedLayers.filter((layer) => layer.name !== 'none')) expect(layer.state).toBe('paused');
    fixture.socket.emit('damage:apply', { kind: 'pc', refId: fixture.characterId, amount: 3 });
    await expect(page.locator('.orb-temp-bonus')).toHaveText('+8');
    await expect(shield).toHaveAttribute('data-shield-effect', 'idle');
    await expect(shield.locator('.orb-ward-impact')).toHaveCount(0);
    await page.evaluate(() => {
      Reflect.deleteProperty(document, 'hidden');
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await expect(shield).toHaveAttribute('data-shield-paused', 'false');
    await expect(shield).toHaveAttribute('data-shield-effect', 'idle');
    await expect(shield).toHaveCSS('animation-play-state', 'running');
    await expect(shield.locator('.orb-ward-impact')).toHaveCount(0);
    await expect(page.locator('.health-reliquary')).toHaveAccessibleName('Health 40 of 80. 8 temporary HP. Open health controls.');
    expect((await fixture.snapshot()).characters.find((character) => character.id === fixture.characterId))
      .toMatchObject({ curHp: 40, maxHp: 80, tempHp: 8 });
  } finally {
    // Disposing the context also discards the synthetic own-property override
    // if an assertion failed before the normal visibility restoration above.
    await context.close();
  }
});
