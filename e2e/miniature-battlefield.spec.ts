import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { io, type Socket } from 'socket.io-client';
import type { StateSnapshot } from '../shared/types';
import { DM_SECRET, PORT } from './playwright.config';

const sockets: Socket[] = [];
test.afterEach(() => sockets.splice(0).forEach(socket => socket.disconnect()));

// Only the E2E server's disposable database is modified. The actual bundled
// GLBs, production map component, Socket.IO path and browser WebGL are used.
async function fixture(page: Page, request: APIRequestContext) {
  const created = await request.post('/api/sessions', {
    headers: { 'x-dm-passphrase': DM_SECRET }, data: { name: '3D battlefield regression' },
  });
  expect(created.ok()).toBeTruthy();
  const { code } = await created.json();
  const socket = io(`http://localhost:${PORT}`, { transports: ['websocket'], forceNew: true });
  sockets.push(socket);
  const snapshot = async (): Promise<StateSnapshot> => {
    const joined = await socket.timeout(5000).emitWithAck('join', {
      sessionCode: code, role: 'dm', dmPassphrase: DM_SECRET,
    });
    expect(joined.ok).toBe(true);
    return joined.snapshot;
  };
  const initial = await snapshot();
  const png = await page.evaluate(() => {
    const canvas = document.createElement('canvas'); canvas.width = 1200; canvas.height = 800;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#776e57'; ctx.fillRect(0, 0, 1200, 800);
    ctx.strokeStyle = '#afa78e'; ctx.lineWidth = 1;
    for (let x = 0; x <= 1200; x += 100) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 800); ctx.stroke(); }
    for (let y = 0; y <= 800; y += 100) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(1200, y); ctx.stroke(); }
    return canvas.toDataURL('image/png').split(',')[1];
  });
  const uploaded = await request.post(`/api/sessions/${code}/maps`, {
    headers: { 'x-dm-passphrase': DM_SECRET },
    multipart: { name: 'Miniature test board', image: { name: 'board.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') } },
  });
  expect(uploaded.ok()).toBeTruthy();
  const map = await uploaded.json();
  socket.emit('map:setActive', { mapId: map.id });
  socket.emit('map:select', { mapId: map.id });
  socket.emit('map:setGrid', { mapId: map.id, gridSizePx: 100, feetPerSquare: 5, widthFt: 60, locked: false });
  socket.emit('fog:setLayer', { mapId: map.id, layer: 'map', enabled: false });
  socket.emit('fog:setLayer', { mapId: map.id, layer: 'tokens', enabled: false });
  const names = ['Druk', 'Varis', 'Vanec'];
  for (const [index, name] of names.entries()) {
    const character = initial.characters.find(c => c.name === name)!;
    expect(character).toBeTruthy();
    socket.emit('token:spawn', { mapId: map.id, kind: 'pc', refId: character.id, x: 300 + index * 300, y: 360 });
  }
  const ready = await snapshot();
  expect(ready.tokens).toHaveLength(3);
  return { code, socket, snapshot, mapId: map.id, initial, ready };
}

async function enter(page: Page, code: string, characterName = 'Druk', tilted = true) {
  await page.goto(`/join?code=${code}`);
  await page.getByRole('button', { name: 'Join', exact: true }).click();
  await page.locator('.claim-row').filter({ hasText: characterName }).click();
  await expect(page.getByTestId('player-hud')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Flat battlefield view', exact: true })).toHaveAttribute('aria-pressed', 'true');
  if (tilted) await page.getByRole('button', { name: 'Tilted battlefield view', exact: true }).click();
}

async function afterPaint(page: Page) {
  // Allow both Konva and the separate WebGL canvas to present the last input.
  await page.evaluate(() => new Promise<void>(resolve =>
    requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))));
}

// Konva exposes its stage registry itself. Read actual production transforms
// and display nodes, without adding test hooks to the application.
async function tokenView(page: Page, id: string) {
  return page.evaluate((tokenId) => {
    const K = (window as any).Konva;
    const stage = K.stages.find((s: any) => s.find('.token').some((n: any) => n.getAttr('tokenId') === tokenId));
    if (!stage) return null;
    const node = stage.find('.token').find((n: any) => n.getAttr('tokenId') === tokenId);
    const rect = stage.container().getBoundingClientRect();
    const pos = node.getAbsolutePosition();
    const scale = node.getAbsoluteScale();
    return {
      x: rect.left + pos.x, y: rect.top + pos.y, scaleX: scale.x, scaleY: scale.y,
      texts: node.find('Text').map((n: any) => n.text()),
      healthBars: node.find('Rect').filter((n: any) => n.height() === 6).map((n: any) => ({ width: n.width(), fill: n.fill() })),
      visibleBodyImages: node.find('Image').filter((n: any) => n.isVisible()).length,
      bodyVisible: node.findOne('.token-body')?.isVisible(),
      miniatureReady: node.getAttr('miniatureReady'),
    };
  }, id);
}

test('real miniatures hide player names and retain health; tilted drag round-trips and hidden tokens disappear', async ({ page, request }, info) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 1000 });
  const setup = await fixture(page, request);
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await enter(page, setup.code);
  const layer = page.getByTestId('miniature-layer');
  await expect(layer).toHaveAttribute('data-miniature-count', '3', { timeout: 60_000 });
  await expect(layer).toHaveAttribute('data-tilt-degrees', '45');
  const druk = setup.ready.tokens.find(t => t.refId === setup.initial.characters.find(c => c.name === 'Druk')!.id)!;
  const view = (await tokenView(page, druk.id))!;
  expect(view.texts).not.toContain('Druk');
  expect(view.healthBars.length).toBeGreaterThanOrEqual(2);
  expect(view.visibleBodyImages).toBe(0);
  expect(view.bodyVisible).toBe(false);
  expect(view.miniatureReady).toBe(true);
  for (const token of setup.ready.tokens) {
    expect((await tokenView(page, token.id))!.texts).not.toContain('👑');
  }
  expect(view.scaleY / view.scaleX).toBeCloseTo(Math.cos(45 * Math.PI / 180), 4);
  await page.screenshot({ path: info.outputPath('desktop-miniatures.png') });
  await page.mouse.move(view.x, view.y);
  await page.mouse.down();
  await page.mouse.move(view.x + 80 * view.scaleX, view.y + 55 * view.scaleY, { steps: 12 });
  await page.mouse.up();
  // Chromium quantizes delivered mouse coordinates to CSS pixels. Bound the
  // round-trip error in screen pixels, not fractional unscaled map units.
  await expect.poll(async () => Math.abs((await setup.snapshot()).tokens.find(t => t.id === druk.id)!.x - druk.x - 80) * view.scaleX).toBeLessThan(1.1);
  expect(Math.abs((await setup.snapshot()).tokens.find(t => t.id === druk.id)!.y - druk.y - 55) * view.scaleY).toBeLessThan(1.1);
  const moved = (await setup.snapshot()).tokens.find(t => t.id === druk.id)!;
  expect(moved.facing).toBeCloseTo(Math.atan2(moved.x - druk.x, moved.y - druk.y), 5);
  setup.socket.emit('character:update', { characterId: druk.refId, curHp: 1 });
  await expect.poll(async () => (await tokenView(page, druk.id))?.healthBars.some(b => b.fill === '#e23b3b')).toBe(true);
  const varis = setup.ready.tokens.find(t => t.refId === setup.initial.characters.find(c => c.name === 'Varis')!.id)!;
  setup.socket.emit('token:setHidden', { tokenId: varis.id, hidden: true });
  await expect(layer).toHaveAttribute('data-miniature-count', '2');
  setup.socket.emit('token:setHidden', { tokenId: varis.id, hidden: false });
  await expect(layer).toHaveAttribute('data-miniature-count', '3');
  for (let step = 0; step < 4; step++) await page.getByTitle('Zoom in', { exact: true }).click();
  await expect.poll(async () => (await tokenView(page, varis.id))!.scaleX).toBeGreaterThan(view.scaleX * 2);
  await afterPaint(page);
  await page.screenshot({ path: info.outputPath('desktop-miniatures-close.png') });
  expect(errors).toEqual([]);
});

test('movement heading survives reconnect and uses the same base hit region in both views', async ({ page, request }, info) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 1000 });
  const setup = await fixture(page, request);
  const warnings: string[] = [];
  page.on('console', message => { if (message.text().includes('Miniature base texture unavailable')) warnings.push(message.text()); });
  const texture = page.waitForResponse(response => response.url().endsWith('/miniatures/druk-basalt-e19b0a12af0c.png'));
  await enter(page, setup.code, 'Druk', false);
  await expect(page.getByTestId('miniature-layer')).toHaveAttribute('data-miniature-count', '3', { timeout: 60_000 });
  expect((await texture).ok()).toBe(true);
  const druk = setup.ready.tokens.find(t => t.refId === setup.initial.characters.find(c => c.name === 'Druk')!.id)!;
  for (const [x, y, angle] of [[400, 360, Math.PI / 2], [400, 460, 0], [300, 460, -Math.PI / 2], [300, 360, Math.PI]]) {
    setup.socket.emit('token:move', { tokenId: druk.id, x, y });
    await expect.poll(async () => (await setup.snapshot()).tokens.find(t => t.id === druk.id)!.facing).toBeCloseTo(angle, 5);
    await afterPaint(page);
  }
  await page.reload();
  await expect(page.getByTestId('miniature-layer')).toHaveAttribute('data-miniature-count', '3', { timeout: 60_000 });
  expect((await setup.snapshot()).tokens.find(t => t.id === druk.id)!.facing).toBeCloseTo(Math.PI, 5);
  for (const viewName of ['Flat battlefield view', 'Tilted battlefield view']) {
    await page.getByRole('button', { name: viewName, exact: true }).click();
    await afterPaint(page);
    const hits = await page.evaluate(id => {
      const stage = (window as any).Konva.stages.find((s: any) => s.find('.token').some((n: any) => n.getAttr('tokenId') === id));
      const node = stage.find('.token').find((n: any) => n.getAttr('tokenId') === id);
      return [[0, 0], [49, 0], [49, 49], [0, -100], [70, 0]].map(([x, y]) => {
        const p = node.getAbsoluteTransform().point({ x, y });
        return stage.getIntersection(p)?.getAttr('tokenId') ?? null;
      });
    }, druk.id);
    expect(hits).toEqual([druk.id, druk.id, null, null, null]);
    await page.screenshot({ path: info.outputPath(viewName.startsWith('Flat') ? 'facing-north-overhead.png' : 'facing-north-45.png') });
  }
  expect(warnings).toEqual([]);
});

test('active miniature ring stays off the HUD and held drags preview facing before placement', async ({ page, request }, info) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 1000 });
  const setup = await fixture(page, request);
  const druk = setup.ready.tokens.find(t => t.refId === setup.initial.characters.find(c => c.name === 'Druk')!.id)!;
  for (const token of setup.ready.tokens) setup.socket.emit('initiative:set', { tokenId: token.id, initiative: token.id === druk.id ? 30 : 10 });
  setup.socket.emit('initiative:rollMissing');
  expect((await setup.snapshot()).activeTurnTokenId).toBe(druk.id);
  await enter(page, setup.code);
  const layer = page.getByTestId('miniature-layer');
  await expect(layer).toHaveAttribute('data-miniature-count', '3', { timeout: 60_000 });
  const view = (await tokenView(page, druk.id))!;
  expect(await page.evaluate(() => (window as any).Konva.stages.flatMap((s: any) => s.find('.active-turn-ring')).length)).toBe(0);
  await page.mouse.move(view.x, view.y);
  await page.mouse.down();
  for (const [name, dx, dy] of [['east', 100, 0], ['southeast', 100, 80]] as const) {
    await page.mouse.move(view.x + dx * view.scaleX, view.y + dy * view.scaleY, { steps: 20 });
    await afterPaint(page);
    const pending = (await setup.snapshot()).tokens.find(t => t.id === druk.id)!;
    // Cursor position changes while the authoritative start remains untouched.
    expect([pending.x, pending.y, pending.facing]).toEqual([druk.x, druk.y, 0]);
    await page.screenshot({ path: info.outputPath(`held-${name}.png`) });
  }
  await page.mouse.up();
  await expect.poll(async () => (await setup.snapshot()).tokens.find(t => t.id === druk.id)!.x).toBeGreaterThan(druk.x + 95);
  const finished = (await setup.snapshot()).tokens.find(t => t.id === druk.id)!;
  expect(finished.facing).toBeCloseTo(Math.atan2(finished.x - druk.x, finished.y - druk.y), 5);
  expect((await setup.snapshot()).activeTurnTokenId).toBe(druk.id);
  const contextLost = page.evaluate(() => {
    const canvas = document.querySelector('[data-testid="miniature-layer"] canvas') as HTMLCanvasElement;
    canvas.dispatchEvent(new Event('webglcontextlost', { cancelable: true }));
  });
  await contextLost;
  await expect(layer).toHaveAttribute('data-miniature-status', 'unavailable');
  await expect.poll(() => page.evaluate(() => (window as any).Konva.stages.flatMap((s: any) => s.find('.active-turn-ring')).length)).toBe(1);
});

test('rear flat tokens are occluded by miniature pixels and keep their hit regions', async ({ page, request }, info) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 1000 });
  const setup = await fixture(page, request);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await enter(page, setup.code);
  const layer = page.getByTestId('miniature-layer');
  await expect(layer).toHaveAttribute('data-miniature-count', '3', { timeout: 60_000 });
  const druk = setup.ready.tokens.find(t => t.refId === setup.initial.characters.find(c => c.name === 'Druk')!.id)!;
  const view = (await tokenView(page, druk.id))!;
  const diameter = druk.widthFt * 20 * view.scaleX;
  const clip = {
    x: Math.floor(view.x - diameter * 0.8), y: Math.floor(view.y - diameter * 1.8),
    width: Math.ceil(diameter * 1.6), height: Math.ceil(diameter * 1.8),
  };
  await afterPaint(page);
  const before = await page.screenshot({ clip });
  const withoutMiniatures = async () => {
    await layer.evaluate(el => { el.style.visibility = 'hidden'; });
    try { return await page.screenshot({ clip }); }
    finally { await layer.evaluate(el => { el.style.visibility = ''; }); }
  };
  const groundBefore = await withoutMiniatures();
  setup.socket.emit('monster:create', { name: 'Rear goblin', maxHp: 7, icon: '👺', disposition: 'enemy' });
  const template = (await setup.snapshot()).monsterTemplates.find(t => t.name === 'Rear goblin')!;
  setup.socket.emit('token:spawn', { mapId: setup.mapId, kind: 'monster', refId: template.id, x: druk.x, y: druk.y - 100 });
  const rear = (await setup.snapshot()).tokens.find(t => t.kind === 'monster')!;
  await expect.poll(() => tokenView(page, rear.id)).not.toBeNull();
  await afterPaint(page);
  const after = await page.screenshot({ clip });
  const groundAfter = await withoutMiniatures();
  // Compare actual browser pixels, not just z-index values. Find interior
  // miniature pixels that overlap the newly painted ground token; the model
  // must remain unchanged there, while the token is painted behind it.
  const pixels = await page.evaluate(async (images) => {
    const decoded = await Promise.all(images.map(async base64 => {
      const bytes = Uint8Array.from(atob(base64), ch => ch.charCodeAt(0));
      const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(bitmap, 0, 0); bitmap.close();
      return { width: canvas.width, height: canvas.height, data: ctx.getImageData(0, 0, canvas.width, canvas.height).data };
    }));
    const [before, groundBefore, after, groundAfter] = decoded;
    const distance = (a: Uint8ClampedArray, b: Uint8ClampedArray, i: number) =>
      Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]);
    let overlap = 0, preserved = 0;
    for (let y = 2; y < before.height - 2; y++) for (let x = 2; x < before.width - 2; x++) {
      const i = (y * before.width + x) * 4;
      if (distance(groundBefore.data, groundAfter.data, i) < 80) continue;
      let interior = true;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
        const j = ((y + dy) * before.width + x + dx) * 4;
        if (distance(before.data, groundBefore.data, j) < 60) interior = false;
      }
      if (!interior) continue;
      overlap++;
      if (distance(before.data, after.data, i) < 8) preserved++;
    }
    return { overlap, preserved };
  }, [before, groundBefore, after, groundAfter].map(image => image.toString('base64')));
  expect(pixels.overlap).toBeGreaterThan(100);
  expect(pixels.preserved / pixels.overlap).toBeGreaterThan(0.98);
  await page.screenshot({ path: info.outputPath('rear-monster-occlusion.png') });
  const point = (await tokenView(page, rear.id))!;
  await page.mouse.click(point.x, point.y, { button: 'right' });
  await expect(page.locator('.floating-menu')).toBeVisible();
  // Server movement from rear to front keeps the flat token and its hit region
  // together; switching to Flat still uses its original map position.
  setup.socket.emit('token:move', { tokenId: rear.id, x: druk.x + 100, y: druk.y + 100 });
  await expect.poll(async () => (await tokenView(page, rear.id))?.x).toBeCloseTo(view.x + 100 * view.scaleX, 1);
  await page.getByRole('button', { name: 'Flat battlefield view', exact: true }).click();
  await expect(layer).toHaveAttribute('data-tilt-degrees', '0');
  const flat = (await tokenView(page, rear.id))!;
  expect(flat.scaleY / flat.scaleX).toBeCloseTo(1, 5);
  expect(flat.texts).toContain('Rear goblin 1');
  expect((await tokenView(page, druk.id))!.texts).not.toContain('Druk');
  expect(errors).toEqual([]);
});

test('mobile tap and pinch keep the miniature projection aligned', async ({ browser, request }, info) => {
  test.setTimeout(120_000);
  const context = await browser.newContext({ viewport: { width: 430, height: 932 }, hasTouch: true, deviceScaleFactor: 2 });
  try {
    const page = await context.newPage();
    const setup = await fixture(page, request);
    await enter(page, setup.code);
    await expect(page.getByTestId('miniature-layer')).toHaveAttribute('data-miniature-count', '3', { timeout: 60_000 });
    await page.getByRole('button', { name: 'Collapse combat', exact: true }).click();
    const druk = setup.ready.tokens.find(t => t.refId === setup.initial.characters.find(c => c.name === 'Druk')!.id)!;
    const before = (await tokenView(page, druk.id))!;
    await page.touchscreen.tap(before.x, before.y);
    await page.screenshot({ path: info.outputPath('mobile-miniatures.png') });
    expect(before.texts).not.toContain('Druk');
    expect(before.healthBars.length).toBeGreaterThanOrEqual(2);
    const cdp = await context.newCDPSession(page);
    const center = { x: 215, y: 430 };
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: center.x - 35, y: center.y }, { x: center.x + 35, y: center.y }] });
    for (const spread of [45, 60, 75]) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: center.x - spread, y: center.y }, { x: center.x + spread, y: center.y }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect.poll(async () => (await tokenView(page, druk.id))!.scaleX).toBeGreaterThan(before.scaleX);
    const after = (await tokenView(page, druk.id))!;
    expect(after.scaleX).toBeGreaterThan(before.scaleX);
    expect(after.scaleY / after.scaleX).toBeCloseTo(Math.cos(45 * Math.PI / 180), 4);
    await expect(page.getByTestId('miniature-layer')).toHaveAttribute('data-miniature-count', '3');
    await afterPaint(page);
    await page.screenshot({ path: info.outputPath('mobile-miniatures-zoomed.png') });
    const flat = page.getByRole('button', { name: 'Flat battlefield view', exact: true });
    const flatBounds = await flat.boundingBox();
    expect(flatBounds).not.toBeNull();
    expect(flatBounds!.x).toBeGreaterThanOrEqual(0);
    expect(flatBounds!.x + flatBounds!.width).toBeLessThanOrEqual(430);
    await flat.tap();
    await expect(page.getByTestId('miniature-layer')).toHaveAttribute('data-tilt-degrees', '0');
    await expect.poll(async () => {
      const current = (await tokenView(page, druk.id))!;
      return current.scaleY / current.scaleX;
    }).toBeCloseTo(1, 4);
    await afterPaint(page);
    await page.screenshot({ path: info.outputPath('mobile-flat-miniatures.png') });
    await page.getByRole('button', { name: 'Tilted battlefield view', exact: true }).tap();
    await expect(page.getByTestId('miniature-layer')).toHaveAttribute('data-tilt-degrees', '45');
  } finally { await context.close(); }
});

test('rulers, grid snapping and drawn annotations use the tilted map plane', async ({ page, request }, info) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 1000 });
  const setup = await fixture(page, request);
  setup.socket.emit('map:setGrid', { mapId: setup.mapId, gridSizePx: 100, feetPerSquare: 5, widthFt: 60, offsetX: 20, offsetY: 30, locked: false });
  await expect.poll(async () => (await setup.snapshot()).maps.find(map => map.id === setup.mapId)?.gridOffsetY).toBe(30);
  await enter(page, setup.code);
  await expect(page.getByTestId('miniature-layer')).toHaveAttribute('data-miniature-count', '3', { timeout: 60_000 });
  const druk = setup.ready.tokens.find(token => token.refId === setup.initial.characters.find(character => character.name === 'Druk')!.id)!;
  const view = (await tokenView(page, druk.id))!;
  // Use the actual token-layer transform to target known map coordinates.
  // The stored server values and displayed distance independently verify input.
  const screen = (x: number, y: number) => ({
    x: view.x + (x - druk.x) * view.scaleX,
    y: view.y + (y - druk.y) * view.scaleY,
  });
  await page.getByTitle('Measuring & AOE tools', { exact: true }).click();
  await page.locator('.measure-row').filter({ hasText: 'Line' }).click();
  await page.getByTitle('Drag to size', { exact: true }).click();
  const start = screen(220, 130), end = screen(520, 530);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 12 });
  await page.mouse.up();
  await expect.poll(async () => (await setup.snapshot()).measurements.length).toBe(1);
  const measurement = (await setup.snapshot()).measurements[0];
  expect(measurement.kind).toBe('ruler');
  expect(measurement.origin).toEqual({ x: 220, y: 130 });
  expect(measurement.target).toEqual({ x: 520, y: 530 });
  await expect.poll(() => page.evaluate(() => (window as any).Konva.stages
    .flatMap((stage: any) => stage.find('Text').map((node: any) => node.text())).includes('25 ft'))).toBe(true);

  await page.getByTitle('Freehand pen — draw on the map', { exact: true }).click();
  const penStart = screen(700, 100), penEnd = screen(700, 500);
  await page.mouse.move(penStart.x, penStart.y);
  await page.mouse.down();
  await page.mouse.move(penEnd.x, penEnd.y, { steps: 12 });
  await page.mouse.up();
  await expect.poll(async () => (await setup.snapshot()).annotations.filter(item => item.kind === 'freehand').length).toBe(1);
  const points = (await setup.snapshot()).annotations.find(item => item.kind === 'freehand')!.points!;
  expect(points.length).toBeGreaterThanOrEqual(6);
  expect(Math.abs(points[0] - 700) * view.scaleX).toBeLessThan(1.1);
  expect(Math.abs(points[1] - 100) * view.scaleY).toBeLessThan(1.1);
  expect(Math.abs(points.at(-2)! - 700) * view.scaleX).toBeLessThan(1.1);
  expect(Math.abs(points.at(-1)! - 500) * view.scaleY).toBeLessThan(1.1);
  await afterPaint(page);
  await page.screenshot({ path: info.outputPath('tilted-ruler-and-annotation.png') });
});

test('overhead is the default; each player can persist overhead or 45 degrees with aligned dragging', async ({ page, browser, request }, info) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 1000 });
  const setup = await fixture(page, request);
  await enter(page, setup.code, 'Druk', false);
  await expect(page.getByTestId('miniature-layer')).toHaveAttribute('data-tilt-degrees', '0');
  const layer = page.getByTestId('miniature-layer');
  await expect(layer).toHaveAttribute('data-miniature-count', '3', { timeout: 60_000 });
  const otherContext = await browser.newContext({ baseURL: `http://localhost:${PORT}`, viewport: { width: 1440, height: 1000 } });
  try {
    const otherPage = await otherContext.newPage();
    await enter(otherPage, setup.code, 'Varis', false);
    const otherLayer = otherPage.getByTestId('miniature-layer');
    await expect(otherLayer).toHaveAttribute('data-miniature-count', '3', { timeout: 60_000 });
    await expect(otherLayer).toHaveAttribute('data-tilt-degrees', '0');
    await otherPage.getByRole('button', { name: 'Tilted battlefield view', exact: true }).click();
    await page.getByRole('button', { name: 'Flat battlefield view', exact: true }).click();
    await expect(layer).toHaveAttribute('data-tilt-degrees', '0');
    await expect(page.getByRole('button', { name: 'Flat battlefield view', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(otherLayer).toHaveAttribute('data-tilt-degrees', '45');
    const druk = setup.ready.tokens.find(token => token.refId === setup.initial.characters.find(character => character.name === 'Druk')!.id)!;
    await expect.poll(async () => { const v = (await tokenView(page, druk.id))!; return v.scaleY / v.scaleX; }).toBeCloseTo(1, 5);
    const point = (await tokenView(page, druk.id))!;
    await page.mouse.move(point.x, point.y);
    await page.mouse.down();
    await page.mouse.move(point.x + 80 * point.scaleX, point.y + 55 * point.scaleY, { steps: 12 });
    await page.mouse.up();
    await expect.poll(async () => Math.abs((await setup.snapshot()).tokens.find(token => token.id === druk.id)!.x - druk.x - 80) * point.scaleX).toBeLessThan(1.1);
    await expect.poll(async () => Math.abs((await setup.snapshot()).tokens.find(token => token.id === druk.id)!.y - druk.y - 55) * point.scaleY).toBeLessThan(1.1);
    await page.reload();
    await expect(layer).toHaveAttribute('data-miniature-count', '3', { timeout: 60_000 });
    await expect(layer).toHaveAttribute('data-tilt-degrees', '0');
    await afterPaint(page);
    await page.screenshot({ path: info.outputPath('flat-player-view.png') });
    await expect(otherLayer).toHaveAttribute('data-tilt-degrees', '45');
    await page.getByRole('button', { name: 'Tilted battlefield view', exact: true }).click();
    await expect(layer).toHaveAttribute('data-tilt-degrees', '45');
    await expect.poll(async () => { const v = (await tokenView(page, druk.id))!; return v.scaleY / v.scaleX; }).toBeCloseTo(Math.cos(45 * Math.PI / 180), 5);
    await page.reload();
    await expect(layer).toHaveAttribute('data-tilt-degrees', '45');
  } finally { await otherContext.close(); }
});

test('failed model download keeps the original usable token', async ({ page, request }) => {
  const setup = await fixture(page, request);
  await page.route('**/miniatures/*.glb', route => route.abort());
  await enter(page, setup.code);
  const druk = setup.ready.tokens.find(t => t.refId === setup.initial.characters.find(c => c.name === 'Druk')!.id)!;
  await expect.poll(async () => (await tokenView(page, druk.id))?.texts.includes('Druk')).toBe(true);
  const point = (await tokenView(page, druk.id))!;
  expect(point.healthBars.length).toBeGreaterThanOrEqual(2);
  expect(point.bodyVisible).toBe(true);
  expect(point.texts).toContain('👑');
  await page.mouse.click(point.x, point.y, { button: 'right' });
  await expect(page.locator('.floating-menu')).toBeVisible();
});

test('WebGL context loss restores all token bodies, HUD and menus', async ({ page, request }, info) => {
  test.setTimeout(120_000);
  const setup = await fixture(page, request);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await enter(page, setup.code);
  const layer = page.getByTestId('miniature-layer');
  await expect(layer).toHaveAttribute('data-miniature-count', '3', { timeout: 60_000 });
  for (const token of setup.ready.tokens) expect((await tokenView(page, token.id))!.bodyVisible).toBe(false);
  // Exercise an actual browser WebGL loss, without renderer internals or a fake event.
  await layer.locator('canvas').evaluate((canvas: HTMLCanvasElement) => {
    const extension = canvas.getContext('webgl2')?.getExtension('WEBGL_lose_context');
    if (!extension) throw new Error('Chrome did not provide WEBGL_lose_context');
    extension.loseContext();
  });
  await expect(layer).toHaveAttribute('data-miniature-status', 'unavailable');
  await expect(layer).toHaveAttribute('data-miniature-count', '0');
  await expect(layer.locator('canvas')).toHaveCount(0);
  for (const token of setup.ready.tokens) {
    await expect.poll(async () => (await tokenView(page, token.id))?.bodyVisible).toBe(true);
    const view = (await tokenView(page, token.id))!;
    expect(view.miniatureReady).toBe(false);
    expect(view.texts).toContain('👑');
    expect(view.texts).toContain(setup.initial.characters.find(character => character.id === token.refId)!.name);
    expect(view.healthBars.length).toBeGreaterThanOrEqual(2);
  }
  const druk = setup.ready.tokens.find(token => token.refId === setup.initial.characters.find(character => character.name === 'Druk')!.id)!;
  const point = (await tokenView(page, druk.id))!;
  await page.mouse.click(point.x, point.y, { button: 'right' });
  await expect(page.locator('.floating-menu')).toBeVisible();
  await page.screenshot({ path: info.outputPath('context-loss-fallback.png') });
  expect(errors).toEqual([]);
});

test('unavailable WebGL at startup leaves ordinary tokens fully usable', async ({ page, request }) => {
  const setup = await fixture(page, request);
  await page.addInitScript(() => {
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type: string, ...args: any[]) {
      if (type === 'webgl' || type === 'webgl2' || type === 'experimental-webgl') return null;
      return (getContext as any).call(this, type, ...args);
    } as typeof getContext;
  });
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await enter(page, setup.code);
  const layer = page.getByTestId('miniature-layer');
  await expect(layer).toHaveAttribute('data-miniature-status', 'unavailable');
  await expect(layer).toHaveAttribute('data-miniature-count', '0');
  const druk = setup.ready.tokens.find(token => token.refId === setup.initial.characters.find(character => character.name === 'Druk')!.id)!;
  await expect.poll(async () => (await tokenView(page, druk.id))?.bodyVisible).toBe(true);
  const point = (await tokenView(page, druk.id))!;
  expect(point.texts).toContain('Druk');
  expect(point.healthBars.length).toBeGreaterThanOrEqual(2);
  await page.mouse.click(point.x, point.y, { button: 'right' });
  await expect(page.locator('.floating-menu')).toBeVisible();
  expect(errors).toEqual([]);
});

test('a failed optional renderer chunk preserves the battlefield', async ({ page, request }) => {
  const setup = await fixture(page, request);
  await page.route('**/assets/MiniatureLayer-*.js', route => route.abort());
  await enter(page, setup.code);
  const druk = setup.ready.tokens.find(token => token.refId === setup.initial.characters.find(character => character.name === 'Druk')!.id)!;
  await expect.poll(async () => (await tokenView(page, druk.id))?.bodyVisible).toBe(true);
  const point = (await tokenView(page, druk.id))!;
  expect(point.texts).toContain('Druk');
  expect(point.healthBars.length).toBeGreaterThanOrEqual(2);
  await page.mouse.click(point.x, point.y, { button: 'right' });
  await expect(page.locator('.floating-menu')).toBeVisible();
});
