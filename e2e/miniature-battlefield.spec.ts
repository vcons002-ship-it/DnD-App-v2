import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { io, type Socket } from 'socket.io-client';
import type { StateSnapshot } from '../shared/types';
import { MONSTER_MODEL_TYPES, monsterVariation, monsterVariantIds } from '../shared/monsterAppearance';
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
    const canvas = node.getLayer().getNativeCanvasElement();
    const matrix = new DOMMatrix(getComputedStyle(canvas).transform);
    const w = stage.width(), h = stage.height();
    const projected = new DOMPoint(pos.x - w / 2, pos.y - h / 2).matrixTransform(matrix);
    return {
      projection: { matrix: Array.from(matrix.toFloat64Array()), w, h, left: rect.left, top: rect.top, x: pos.x, y: pos.y },
      x: rect.left + w / 2 + projected.x / projected.w, y: rect.top + h / 2 + projected.y / projected.w, scaleX: scale.x, scaleY: scale.y,
      texts: node.find('Text').map((n: any) => n.text()),
      roleBadges: node.find('.token-combat-role').length,
      labelBottom: node.findOne('.token-label') ? node.findOne('.token-label').y() + node.findOne('.token-label').height() : null,
      healthY: node.findOne('.token-health')?.y(),
      healthBars: node.find('Rect').filter((n: any) => n.height() === 6).map((n: any) => ({ width: n.width(), fill: n.fill() })),
      visibleBodyImages: node.find('Image').filter((n: any) => n.isVisible()).length,
      bodyVisible: node.findOne('.token-body')?.isVisible(),
      miniatureReady: node.getAttr('miniatureReady'),
      opacity: node.opacity(),
    };
  }, id);
}

// Project an offset through the browser's actual canvas matrix, not an affine approximation.
function offsetPoint(view: NonNullable<Awaited<ReturnType<typeof tokenView>>>, dx: number, dy: number) {
  const p = view.projection, m = p.matrix;
  const x = p.x + dx * view.scaleX - p.w / 2, y = p.y + dy * view.scaleY - p.h / 2;
  const w = m[3] * x + m[7] * y + m[15];
  return { x: p.left + p.w / 2 + (m[0] * x + m[4] * y + m[12]) / w,
    y: p.top + p.h / 2 + (m[1] * x + m[5] * y + m[13]) / w };
}

async function monsterFixture(page: Page, request: APIRequestContext) {
  const f = await fixture(page, request);
  const creatures = [
    { name: 'Goblin', x: 250, modelType: '', modelColor: '' },
    { name: 'Azure Bones', x: 550, modelType: 'skeleton', modelColor: 'blue' },
    { name: 'Ashfang', x: 850, modelType: 'wolf', modelColor: '' },
    { name: 'Elephant', x: 1050, modelType: 'elephant', modelColor: '' },
  ];
  for (const c of creatures) {
    f.socket.emit('monster:create', { name: c.name, maxHp: 12, modelType: c.modelType, modelColor: c.modelColor, visualTags: c.name === 'Ashfang' ? ['fire'] : [] });
    const template = (await f.snapshot()).monsterTemplates.find(m => m.name === c.name)!;
    f.socket.emit('token:spawn', { mapId: f.mapId, kind: 'monster', refId: template.id, x: c.x, y: 650 });
  }
  const ready = await f.snapshot();
  return { ...f, ready, monsters: ready.tokens.filter(t => t.kind === 'monster') };
}

test('expanded monster catalog loads every family in overhead and tilted views', async ({ page, request }, info) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1600, height: 1100 });
  const f = await fixture(page, request);
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('response', response => { if (response.url().endsWith('.glb') && !response.ok()) errors.push(`${response.status()} ${response.url()}`); });
  for (const [index, family] of MONSTER_MODEL_TYPES.entries()) {
    f.socket.emit('monster:create', { name: `Catalog ${family}`, maxHp: 12, modelType: family, visualTags: [] });
    const template = (await f.snapshot()).monsterTemplates.find(m => m.name === `Catalog ${family}`)!;
    f.socket.emit('token:spawn', { mapId: f.mapId, kind: 'monster', refId: template.id, x: 100 + (index % 6) * 190, y: 100 + Math.floor(index / 6) * 170 });
  }
  for (const [index, token] of f.ready.tokens.entries()) f.socket.emit('token:move', { tokenId: token.id, x: 300 + index * 300, y: 750 });
  const snapshot = await f.snapshot();
  await enter(page, f.code, 'Druk', false);
  const layer = page.getByTestId('miniature-layer');
  await expect(layer).toHaveAttribute('data-miniature-count', String(MONSTER_MODEL_TYPES.length + 3), { timeout: 90_000 });
  for (const token of snapshot.tokens.filter(t => t.kind === 'monster')) expect((await tokenView(page, token.id))?.miniatureReady).toBe(true);
  await afterPaint(page);
  await page.screenshot({ path: info.outputPath('all-families-overhead.png') });
  await page.getByRole('button', { name: 'Tilted battlefield view', exact: true }).click();
  await afterPaint(page);
  await expect(layer).toHaveAttribute('data-miniature-count', String(MONSTER_MODEL_TYPES.length + 3));
  await page.screenshot({ path: info.outputPath('all-families-tilted.png') });
  expect(errors).toEqual([]);
});

test('monster miniatures load, recolor independently, use base hits and face their drag in both views', async ({ page, browser, request }, info) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1440, height: 1000 });
  const f = await monsterFixture(page, request);
  await enter(page, f.code);
  const playerLayer = page.getByTestId('miniature-layer');
  await expect(playerLayer).toHaveAttribute('data-miniature-count', '6', { timeout: 60_000 });
  const [goblin, skeleton, wolf, elephant] = f.monsters;
  for (const t of [goblin, skeleton, wolf]) {
    const view = (await tokenView(page, t.id))!;
    expect(view.miniatureReady).toBe(true);
    expect(view.roleBadges).toBe(1);
  }
  expect((await tokenView(page, elephant.id))?.bodyVisible).toBe(true);
  expect((await tokenView(page, elephant.id))?.miniatureReady).toBe(false);
  await afterPaint(page);
  await page.screenshot({ path: info.outputPath('monster-party-45.png') });
  await page.getByRole('button', { name: 'Flat battlefield view', exact: true }).click();
  await afterPaint(page);
  await page.screenshot({ path: info.outputPath('monster-party-overhead.png') });
  const context = await browser.newContext({ baseURL: `http://localhost:${PORT}`, viewport: { width: 1440, height: 1000 } });
  try {
    const dm = await context.newPage();
    const errors: string[] = [];
    dm.on('pageerror', e => errors.push(e.message));
    await dm.goto(`/dm?code=${f.code}`);
    await dm.locator('input[type=password]').fill(DM_SECRET);
    await dm.getByRole('button', { name: 'Rejoin as DM', exact: true }).click();
    await expect(dm.getByTestId('miniature-layer')).toHaveAttribute('data-miniature-count', '6', { timeout: 60_000 });
    const base = (await tokenView(dm, skeleton.id))!;
    await dm.mouse.click(base.x, base.y);
    const tokenInfo = dm.getByRole('region', { name: 'Token info', exact: true });
    await expect(tokenInfo.getByLabel('3D family', { exact: true })).toHaveValue('skeleton');
    await tokenInfo.getByLabel('Monster model color').selectOption('red');
    await expect.poll(async () => (await f.snapshot()).monsters.find(m => m.id === skeleton.refId)?.modelColor).toBe('red');
    await tokenInfo.getByLabel('3D family', { exact: true }).selectOption('wolf');
    await expect.poll(async () => (await f.snapshot()).monsters.find(m => m.id === skeleton.refId)?.modelType).toBe('wolf');
    // Two copies of the same cached wolf must retain their separate appearance.
    await expect(playerLayer).toHaveAttribute('data-miniature-count', '6');
    await afterPaint(page);
    await page.getByRole('button', { name: 'Tilted battlefield view', exact: true }).click();
    await afterPaint(page);
    await page.screenshot({ path: info.outputPath('independent-wolf-tints.png') });
    await tokenInfo.getByLabel('3D family', { exact: true }).selectOption('skeleton');
    await tokenInfo.getByLabel('Monster model color').selectOption('natural');
    await tokenInfo.getByLabel('Monster appearance tags').fill('[poison], blue');
    await tokenInfo.getByLabel('Monster appearance tags').press('Enter');
    await expect.poll(async () => (await f.snapshot()).monsters.find(m => m.id === skeleton.refId)?.visualTags).toEqual(['poison', 'blue']);
    await tokenInfo.scrollIntoViewIfNeeded();
    await dm.screenshot({ path: info.outputPath('monster-token-info.png') });
    // Close the inspector before dragging across the board.
    await dm.getByRole('button', { name: 'Close token inspector', exact: true }).click();
    for (const viewName of ['Flat battlefield view', 'Tilted battlefield view']) {
      await dm.getByRole('button', { name: viewName, exact: true }).click();
      await afterPaint(dm);
      const hits = await dm.evaluate(id => {
        const stage = (window as any).Konva.stages.find((s: any) => s.find('.token').some((n: any) => n.getAttr('tokenId') === id));
        const node = stage.find('.token').find((n: any) => n.getAttr('tokenId') === id);
        return [[0, 0], [29, 0], [49, 49], [0, -100], [70, 0]].map(([x, y]) => stage.getIntersection(node.getAbsoluteTransform().point({ x, y }))?.getAttr('tokenId') ?? null);
      }, goblin.id);
      expect(hits).toEqual([goblin.id, goblin.id, null, null, null]);
      const start = (await f.snapshot()).tokens.find(t => t.id === goblin.id)!;
      const view = (await tokenView(dm, goblin.id))!;
      const end = offsetPoint(view, 100, -80);
      await dm.mouse.move(view.x, view.y); await dm.mouse.down();
      await dm.mouse.move(end.x, end.y, { steps: 15 }); await afterPaint(dm);
      expect((await f.snapshot()).tokens.find(t => t.id === goblin.id)?.x).toBe(start.x);
      await dm.screenshot({ path: info.outputPath(`${viewName.startsWith('Flat') ? 'flat' : 'tilted'}-monster-held-drag.png`) });
      await dm.mouse.up();
      await expect.poll(async () => (await f.snapshot()).tokens.find(t => t.id === goblin.id)!.x).toBeGreaterThan(start.x + 90);
      const moved = (await f.snapshot()).tokens.find(t => t.id === goblin.id)!;
      expect(moved.facing).toBeCloseTo(Math.atan2(moved.x - start.x, moved.y - start.y), 5);
    }
    await page.getByRole('button', { name: '2D player tokens', exact: true }).click();
    await page.getByRole('button', { name: '2D monster tokens', exact: true }).click();
    await expect(playerLayer).toHaveCount(0);
    for (const t of f.monsters) expect((await tokenView(page, t.id))?.bodyVisible).toBe(true);
    await page.getByRole('button', { name: '3D player tokens', exact: true }).click();
    await page.getByRole('button', { name: '3D monster tokens', exact: true }).click();
    await expect(playerLayer).toHaveAttribute('data-miniature-count', '6', { timeout: 60_000 });
    expect(errors).toEqual([]);
  } finally { await context.close(); }
});

test('monster and player miniatures disappear as whole tokens under base-cell fog and live concealment', async ({ page, request }) => {
  test.setTimeout(120_000);
  const f = await monsterFixture(page, request);
  await enter(page, f.code);
  const layer = page.getByTestId('miniature-layer');
  await expect(layer).toHaveAttribute('data-miniature-count', '6', { timeout: 60_000 });
  const [goblin, skeleton, wolf] = f.monsters;
  const varis = f.ready.tokens.find(t => t.refId === f.initial.characters.find(c => c.name === 'Varis')!.id)!;
  // Fogged anchor removes the entire miniature, even when its body extends into a revealed cell.
  f.socket.emit('fog:paint', { mapId: f.mapId, layer: 'map', cells: ['9,3', '2,6', '8,6', '10,6'], reveal: true });
  f.socket.emit('fog:setLayer', { mapId: f.mapId, layer: 'map', enabled: true });
  await expect(layer).toHaveAttribute('data-miniature-count', '4');
  expect(await tokenView(page, skeleton.id)).toBeNull();
  expect(await tokenView(page, varis.id)).toBeNull();
  expect((await f.snapshot()).tokens).toHaveLength(7); // DM still sees all tokens.
  f.socket.emit('fog:paint', { mapId: f.mapId, layer: 'map', cells: ['5,6', '6,3'], reveal: true });
  await expect(layer).toHaveAttribute('data-miniature-count', '6');
  // A player dragging another PC into map fog loses its whole HUD as well as the model.
  const v = (await tokenView(page, varis.id))!, concealed = offsetPoint(v, 0, -220);
  await page.mouse.move(v.x, v.y); await page.mouse.down();
  await page.mouse.move(concealed.x, concealed.y, { steps: 15 });
  await expect.poll(async () => (await tokenView(page, varis.id))?.opacity).toBe(0);
  await page.mouse.up();
  await expect(layer).toHaveAttribute('data-miniature-count', '5');
  f.socket.emit('token:move', { tokenId: varis.id, x: varis.x, y: varis.y });
  await expect(layer).toHaveAttribute('data-miniature-count', '6');
  f.socket.emit('token:drag', { tokenId: skeleton.id, x: 10, y: 10 });
  await expect(layer).toHaveAttribute('data-miniature-count', '5');
  expect(await tokenView(page, skeleton.id)).toBeNull();
  // A paused held drag must not reappear when the ordinary tether timer expires.
  await page.waitForTimeout(500);
  expect(await tokenView(page, skeleton.id)).toBeNull();
  f.socket.emit('token:drag', { tokenId: skeleton.id, x: skeleton.x, y: skeleton.y });
  await expect(layer).toHaveAttribute('data-miniature-count', '6');
  f.socket.emit('fog:setLayer', { mapId: f.mapId, layer: 'map', enabled: false });
  f.socket.emit('fog:setLayer', { mapId: f.mapId, layer: 'tokens', enabled: true });
  await expect(layer).toHaveAttribute('data-miniature-count', '3');
  expect(await tokenView(page, goblin.id)).toBeNull();
  expect(await tokenView(page, wolf.id)).toBeNull();
  expect(await tokenView(page, varis.id)).not.toBeNull();
  f.socket.emit('monster:update', { monsterId: wolf.refId, disposition: 'friendly' });
  await expect(layer).toHaveAttribute('data-miniature-count', '4');
  f.socket.emit('token:setHidden', { tokenId: wolf.id, hidden: true });
  await expect(layer).toHaveAttribute('data-miniature-count', '3');
  expect(await tokenView(page, wolf.id)).toBeNull();
});

test('perspective recedes toward the far edge and keeps wheel zoom and pan under the pointer', async ({ page, request }, info) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const f = await fixture(page, request);
  await enter(page, f.code);
  await expect(page.getByTestId('miniature-layer')).toHaveAttribute('data-miniature-count', '3', { timeout: 60000 });
  const druk = f.ready.tokens.find(t => t.refId === f.initial.characters.find(c => c.name === 'Druk')!.id)!;
  let v = (await tokenView(page, druk.id))!;
  const farLeft = offsetPoint(v, -200, -300), farRight = offsetPoint(v, 700, -300);
  const nearLeft = offsetPoint(v, -200, 300), nearRight = offsetPoint(v, 700, 300);
  expect(nearRight.x - nearLeft.x).toBeGreaterThan((farRight.x - farLeft.x) * 1.3);
  // A fixed, empty map point must stay under the cursor during zoom.
  const point = offsetPoint(v, 0, -200);
  await page.mouse.move(point.x, point.y); await page.mouse.wheel(0, -200);
  await expect.poll(async () => (await tokenView(page, druk.id))!.scaleX).toBeGreaterThan(v.scaleX);
  v = (await tokenView(page, druk.id))!;
  const zoomed = offsetPoint(v, 0, -200);
  expect(Math.hypot(zoomed.x - point.x, zoomed.y - point.y)).toBeLessThan(2);
  const target = { x: zoomed.x + 80, y: zoomed.y + 70 };
  await page.mouse.move(zoomed.x, zoomed.y); await page.mouse.down();
  await page.mouse.move(target.x, target.y, { steps: 20 }); await page.mouse.up();
  await expect.poll(async () => {
    const p = offsetPoint((await tokenView(page, druk.id))!, 0, -200);
    return Math.hypot(p.x - target.x, p.y - target.y);
  }).toBeLessThan(2);
  expect((await f.snapshot()).tokens).toEqual(f.ready.tokens);
  const beforeBlankPan = (await tokenView(page, druk.id))!;
  const blank = { x: beforeBlankPan.projection.left + 1000, y: beforeBlankPan.projection.top + 90 };
  await page.mouse.move(blank.x, blank.y); await page.mouse.down();
  await page.mouse.move(blank.x + 70, blank.y + 30, { steps: 20 }); await page.mouse.up();
  await expect.poll(async () => (await tokenView(page, druk.id))!.x - beforeBlankPan.x).toBeGreaterThan(20);
  await page.screenshot({ path: info.outputPath('perspective-pan.png') });
});

test('real miniatures label players above health without combat badges; tilted drag round-trips and hidden tokens disappear', async ({ page, request }, info) => {
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
  expect(view.texts).toContain('Druk');
  expect(view.roleBadges).toBe(0);
  expect(view.labelBottom).toBeLessThan(view.healthY);
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
  await page.mouse.move(offsetPoint(view, 80, 55).x, offsetPoint(view, 80, 55).y, { steps: 12 });
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
      return [[0, 0], [29, 0], [49, 49], [0, -100], [70, 0]].map(([x, y]) => {
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
    await page.mouse.move(offsetPoint(view, dx, dy).x, offsetPoint(view, dx, dy).y, { steps: 20 });
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
  await expect.poll(async () => (await tokenView(page, rear.id))?.x).toBeCloseTo(offsetPoint(view, 100, 100).x, 1);
  await page.getByRole('button', { name: 'Flat battlefield view', exact: true }).click();
  await expect(layer).toHaveAttribute('data-tilt-degrees', '0');
  const flat = (await tokenView(page, rear.id))!;
  expect(flat.scaleY / flat.scaleX).toBeCloseTo(1, 5);
  expect(flat.texts).toContain('Rear goblin');
  expect((await tokenView(page, druk.id))!.texts).toContain('Druk');
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
    expect(before.texts).toContain('Druk');
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
  const screen = (x: number, y: number) => offsetPoint(view, x - druk.x, y - druk.y);
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

test('2D and 3D token choices persist per player without changing tilt or token state', async ({ page, browser, request }, info) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 1000 });
  const setup = await fixture(page, request);
  await enter(page, setup.code);
  await expect(page.getByTestId('miniature-layer')).toHaveAttribute('data-miniature-count', '3', { timeout: 60_000 });
  const druk = setup.ready.tokens.find(t => t.refId === setup.initial.characters.find(c => c.name === 'Druk')!.id)!;
  const before = (await tokenView(page, druk.id))!;
  const otherContext = await browser.newContext({ baseURL: `http://localhost:${PORT}` });
  try {
    const other = await otherContext.newPage();
    await enter(other, setup.code, 'Varis', false);
    await expect(other.getByTestId('miniature-layer')).toHaveAttribute('data-miniature-count', '3', { timeout: 60_000 });
    await page.getByRole('button', { name: '2D player tokens', exact: true }).click();
    await expect(page.getByTestId('miniature-layer')).toHaveCount(0);
    await expect(page.getByRole('button', { name: '2D player tokens', exact: true })).toHaveAttribute('aria-pressed', 'true');
    const flatToken = (await tokenView(page, druk.id))!;
    expect(flatToken.bodyVisible).toBe(true);
    expect(flatToken.texts).toContain('Druk');
    expect([flatToken.x, flatToken.y, flatToken.scaleX, flatToken.scaleY]).toEqual([before.x, before.y, before.scaleX, before.scaleY]);
    await expect(other.getByTestId('miniature-layer')).toHaveAttribute('data-miniature-count', '3');
    let modelRequests = 0;
    page.on('request', req => { if (req.url().endsWith('.glb')) modelRequests++; });
    await page.reload();
    await expect(page.getByRole('button', { name: '2D player tokens', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('button', { name: 'Tilted battlefield view', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('miniature-layer')).toHaveCount(0);
    expect(modelRequests).toBe(0);
    const pos = (await tokenView(page, druk.id))!;
    await page.mouse.move(pos.x, pos.y); await page.mouse.down();
    await page.mouse.move(offsetPoint(pos, 50, 0).x, offsetPoint(pos, 50, 0).y, { steps: 10 }); await page.mouse.up();
    await expect.poll(async () => (await setup.snapshot()).tokens.find(t => t.id === druk.id)!.x).toBeGreaterThan(druk.x + 45);
    const moved = (await setup.snapshot()).tokens.find(t => t.id === druk.id)!;
    await page.setViewportSize({ width: 430, height: 932 });
    for (const name of ['2D player tokens', '3D player tokens']) {
      const box = await page.getByRole('button', { name, exact: true }).boundingBox();
      expect(box).toBeTruthy(); expect(box!.x).toBeGreaterThanOrEqual(0); expect(box!.x + box!.width).toBeLessThanOrEqual(430);
    }
    await page.screenshot({ path: info.outputPath('mobile-2d-token-controls.png') });
    await page.getByRole('button', { name: '3D player tokens', exact: true }).click();
    await expect(page.getByTestId('miniature-layer')).toHaveAttribute('data-miniature-count', '3', { timeout: 60_000 });
    expect((await tokenView(page, druk.id))!.texts).toContain('Druk');
    expect((await setup.snapshot()).tokens.find(t => t.id === druk.id)).toEqual(moved);
    await page.reload();
    await expect(page.getByRole('button', { name: '3D player tokens', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('miniature-layer')).toHaveAttribute('data-miniature-count', '3', { timeout: 60_000 });
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

test('Vanec glows on accepted cantrip and spell casts, settles, and does not replay in 2D or on reload', async ({ page, request }, info) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 1000 });
  const f = await fixture(page, request);
  const vanec = f.initial.characters.find(c => c.name === 'Vanec')!;
  const token = f.ready.tokens.find(t => t.refId === vanec.id)!;
  f.socket.emit('character:update', { characterId: vanec.id, sheetAbilities: [
    { id: 'spark', name: 'Lightning Spark', type: 'spell', level: 0, description: 'Preview cantrip', roll: { kind: 'damage', dice: '1d6', damageType: 'lightning' } },
    { id: 'surge', name: 'Lightning Surge', type: 'spell', level: 1, description: 'Preview spell', roll: { kind: 'damage', dice: '2d6', baseLevel: 1, damageType: 'lightning' } },
  ], spellSlots: { L1: { max: 4, used: 0 } } });
  await f.snapshot();
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await enter(page, f.code, 'Vanec');
  const layer = page.getByTestId('miniature-layer');
  await expect(layer).toHaveAttribute('data-miniature-count', '3', { timeout: 60000 });
  await expect(layer).toHaveAttribute('data-casting-token-ids', '');
  const combat = page.getByRole('region', { name: 'Combat panel', exact: true });
  for (const name of ['Lightning Spark', 'Lightning Surge']) {
    await combat.locator('.combat-ability-row').filter({ hasText: name }).getByRole('button').click();
    await expect(layer).toHaveAttribute('data-casting-token-ids', token.id);
    await page.waitForTimeout(350);
    await page.screenshot({ path: info.outputPath(`${name.replace(' ', '-')}.png`) });
    await expect(layer).toHaveAttribute('data-casting-token-ids', '', { timeout: 5000 });
    if (await page.locator('.roll-reveal').count()) await page.locator('.roll-reveal').click({ position: { x: 10, y: 10 } });
    const done = page.locator('.spell-damage-dock').getByRole('button', { name: 'Done', exact: true });
    if (await done.count()) await done.click();
  }
  expect((await f.snapshot()).characters.find(c => c.id === vanec.id)!.spellSlots.L1.used).toBe(1);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await combat.locator('.combat-ability-row').filter({ hasText: 'Lightning Spark' }).getByRole('button').click();
  await expect(layer).toHaveAttribute('data-casting-token-ids', token.id);
  await expect(layer).toHaveAttribute('data-casting-token-ids', '', { timeout: 5000 });
  await page.reload();
  await expect(layer).toHaveAttribute('data-miniature-count', '3', { timeout: 60000 });
  await expect(layer).toHaveAttribute('data-casting-token-ids', '');
  await page.getByRole('button', { name: '2D player tokens', exact: true }).click();
  await expect(layer).toHaveCount(0);
  f.socket.emit('ability:roll', { kind: 'pc', refId: vanec.id, abilityId: 'spark' });
  await f.snapshot();
  await page.getByRole('button', { name: '3D player tokens', exact: true }).click();
  await expect(layer).toHaveAttribute('data-miniature-count', '3', { timeout: 60000 });
  await expect(layer).toHaveAttribute('data-casting-token-ids', '');
  expect(errors).toEqual([]);
});


test('DM sees all three miniatures and independently persists the same view choices as players', async ({ page, browser, request }, info) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1600, height: 1000 });
  const setup = await fixture(page, request);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`/dm?code=${setup.code}`);
  await page.locator('input[type=password]').fill(DM_SECRET);
  await page.getByRole('button', { name: 'Rejoin as DM', exact: true }).click();
  const layer = page.getByTestId('miniature-layer');
  await expect(layer).toHaveAttribute('data-miniature-count', '3', { timeout: 60_000 });
  await expect(layer).toHaveAttribute('data-tilt-degrees', '0');
  await expect(page.getByRole('button', { name: '3D player tokens', exact: true })).toHaveAttribute('aria-pressed', 'true');
  for (const token of setup.ready.tokens) expect((await tokenView(page, token.id))!.bodyVisible).toBe(false);
  const playerContext = await browser.newContext({ baseURL: `http://localhost:${PORT}` });
  try {
    const player = await playerContext.newPage();
    await enter(player, setup.code, 'Druk', false);
    await expect(player.getByTestId('miniature-layer')).toHaveAttribute('data-miniature-count', '3', { timeout: 60_000 });
    await page.getByRole('button', { name: 'Tilted battlefield view', exact: true }).click();
    await expect(layer).toHaveAttribute('data-tilt-degrees', '45');
    await afterPaint(page);
    await page.screenshot({ path: info.outputPath('dm-3d-45.png') });
    await page.getByRole('button', { name: '2D player tokens', exact: true }).click();
    await expect(layer).toHaveCount(0);
    for (const token of setup.ready.tokens) expect((await tokenView(page, token.id))!.bodyVisible).toBe(true);
    await page.reload();
    await expect(page.getByRole('button', { name: '2D player tokens', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('button', { name: 'Tilted battlefield view', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(layer).toHaveCount(0);
    await expect(player.getByTestId('miniature-layer')).toHaveAttribute('data-miniature-count', '3');
    await expect(player.getByTestId('miniature-layer')).toHaveAttribute('data-tilt-degrees', '0');
    await page.getByRole('button', { name: '3D player tokens', exact: true }).click();
    await expect(layer).toHaveAttribute('data-miniature-count', '3', { timeout: 60_000 });
    await page.getByRole('button', { name: 'Flat battlefield view', exact: true }).click();
    await expect(layer).toHaveAttribute('data-tilt-degrees', '0');
    await page.reload();
    await expect(layer).toHaveAttribute('data-miniature-count', '3', { timeout: 60_000 });
    await expect(layer).toHaveAttribute('data-tilt-degrees', '0');
    await afterPaint(page);
    await page.screenshot({ path: info.outputPath('dm-3d-overhead.png') });
    const before = setup.ready.tokens.map(t => ({ id: t.id, x: t.x, y: t.y, facing: t.facing }));
    expect((await setup.snapshot()).tokens.map(t => ({ id: t.id, x: t.x, y: t.y, facing: t.facing }))).toEqual(before);
    expect(errors).toEqual([]);
  } finally {
    await playerContext.close();
  }
});


test('DM workspace keeps drafts, spawning, turns and mobile tools usable', async ({ page, request }, info) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1366, height: 900 });
  const setup = await fixture(page, request);
  await page.goto(`/dm?code=${setup.code}`);
  await page.locator('input[type=password]').fill(DM_SECRET);
  await page.getByRole('button', { name: 'Rejoin as DM', exact: true }).click();
  await expect(page.getByTestId('miniature-layer')).toHaveAttribute('data-miniature-count', '3', { timeout: 60_000 });
  const drawer = page.locator('.dm-workspace:visible');
  const inspector = page.getByRole('complementary', { name: 'Token inspector', exact: true });
  await expect(drawer).toBeHidden();
  await expect(inspector).toBeHidden();
  expect((await page.locator('main.center').boundingBox())!.width).toBe(1366);
  await page.getByRole('button', { name: 'Maps', exact: true }).click();
  await drawer.getByPlaceholder('Map name (optional)').fill('Preserved draft');
  await page.getByRole('button', { name: 'Creatures', exact: true }).click();
  await expect(drawer.getByRole('heading', { name: 'Player characters', exact: true })).toBeVisible();
  await expect(drawer.getByPlaceholder('Map name (optional)')).toBeHidden();
  await page.getByRole('button', { name: 'Maps', exact: true }).click();
  await expect(drawer.getByPlaceholder('Map name (optional)')).toHaveValue('Preserved draft');
  const resize = page.getByRole('button', { name: 'Resize DM panel' });
  await resize.focus(); await page.keyboard.press('ArrowRight');
  expect((await drawer.boundingBox())!.width).toBe(380);
  await page.getByRole('button', { name: 'Close DM panel', exact: true }).click();
  await page.getByLabel('Campaign menu', { exact: true }).click();
  await expect(page.getByRole('button', { name: 'Copy player link', exact: true })).toBeVisible();
  await page.getByLabel('Campaign menu', { exact: true }).click();
  await page.getByRole('button', { name: 'Initiative', exact: true }).click();
  await drawer.getByRole('button', { name: 'Roll all', exact: true }).click();
  await expect.poll(async () => (await setup.snapshot()).round).toBe(1);
  const active = (await setup.snapshot()).activeTurnTokenId;
  await page.getByRole('button', { name: 'Next turn', exact: true }).click();
  await expect.poll(async () => (await setup.snapshot()).activeTurnTokenId).not.toBe(active);
  await drawer.locator('.init-row').filter({ hasText: 'Druk' }).click();
  await expect(inspector).toBeVisible();
  await page.screenshot({ path: info.outputPath('dm-desktop-workspace.png') });
  await page.getByRole('button', { name: 'Close token inspector' }).click();
  await page.getByRole('button', { name: 'Close DM panel', exact: true }).click();
  await page.setViewportSize({ width: 430, height: 932 });
  await page.getByRole('button', { name: 'Creatures', exact: true }).click();
  const box = (await drawer.boundingBox())!;
  expect(box.x).toBe(8); expect(box.width).toBe(414);
  await drawer.locator('.spawn-row').filter({ hasText: 'Druk' }).click();
  await expect(drawer).toBeHidden();
  const token = setup.ready.tokens[0], point = offsetPoint((await tokenView(page, token.id))!, 300, 180);
  await page.mouse.click(point.x, point.y);
  await expect.poll(async () => (await setup.snapshot()).tokens.length).toBe(4);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Token inspector', exact: true }).click();
  await expect(inspector).toBeVisible();
  await page.getByRole('button', { name: 'Maps', exact: true }).click();
  await expect(inspector).toBeHidden();
  await expect(drawer).toBeVisible();
  await page.screenshot({ path: info.outputPath('dm-mobile-workspace.png') });
  await page.getByRole('button', { name: 'Close DM panel', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Maps', exact: true })).toBeFocused();
  await page.screenshot({ path: info.outputPath('dm-mobile-map.png') });
  await page.reload();
  await page.getByRole('button', { name: 'Maps', exact: true }).click();
  await page.setViewportSize({ width: 1366, height: 900 });
  expect((await drawer.boundingBox())!.width).toBe(380);
});


test('DM pinned panels share a column, retain drafts and restore pins', async ({ page, request }, info) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 1000 });
  const setup = await fixture(page, request);
  await page.goto(`/dm?code=${setup.code}`);
  await page.locator('input[type=password]').fill(DM_SECRET);
  await page.getByRole('button', { name: 'Rejoin as DM', exact: true }).click();
  await page.getByRole('button', { name: 'Maps', exact: true }).click();
  const maps = page.getByRole('complementary', { name: 'Maps', exact: true });
  const full = (await maps.boundingBox())!;
  const menu = (await page.getByRole('navigation', { name: 'DM tools' }).boundingBox())!;
  const viewControls = (await page.locator('.stage-controls').boundingBox())!;
  expect(full.x).toBe(14); expect(menu.x).toBe(full.x);
  expect(menu.y + menu.height).toBeLessThan(full.y);
  expect(menu.x + menu.width).toBeLessThan(viewControls.x);
  await maps.getByPlaceholder('Map name (optional)').fill('Pinned draft');
  await maps.getByRole('button', { name: 'Pin Maps', exact: true }).click();
  await page.getByRole('button', { name: 'Creatures', exact: true }).click();
  const creatures = page.getByRole('complementary', { name: 'Creatures', exact: true });
  const a = (await maps.boundingBox())!, b = (await creatures.boundingBox())!;
  expect(a.x).toBe(full.x); expect(b.x).toBe(a.x); expect(b.width).toBe(a.width);
  expect(a.height).toBeCloseTo(b.height, 0); expect(a.height + b.height + 8).toBeCloseTo(full.height, 0);
  expect(b.y).toBeCloseTo(a.y + a.height + 8, 0);
  await expect(maps.getByPlaceholder('Map name (optional)')).toHaveValue('Pinned draft');
  await expect(creatures.getByRole('heading', { name: 'Player characters' })).toBeVisible();
  await page.screenshot({ path: info.outputPath('dm-pinned-pair.png') });
  await creatures.getByRole('button', { name: 'Pin Creatures', exact: true }).click();
  await page.getByRole('button', { name: 'Initiative', exact: true }).click();
  const initiative = page.getByRole('complementary', { name: 'Initiative', exact: true });
  expect((await maps.boundingBox())!.height).toBeCloseTo((await initiative.boundingBox())!.height, 0);
  await initiative.getByRole('button', { name: 'Close DM panel', exact: true }).click();
  await creatures.getByRole('button', { name: 'Unpin Creatures', exact: true }).click();
  await page.getByRole('button', { name: 'Chat & dice', exact: true }).click();
  await expect(creatures).toBeHidden(); await expect(maps).toBeVisible();
  await page.reload();
  await expect(maps.getByRole('button', { name: 'Unpin Maps', exact: true })).toBeVisible();
  expect((await maps.boundingBox())!.height).toBeCloseTo(full.height, 0);
  await maps.getByRole('button', { name: 'Close DM panel', exact: true }).click();
  await page.getByRole('button', { name: 'Token inspector', exact: true }).click();
  const inspector = page.getByRole('complementary', { name: 'Token inspector', exact: true });
  await inspector.getByRole('button', { name: 'Pin Token inspector', exact: true }).click();
  await page.getByRole('button', { name: 'Initiative', exact: true }).click();
  expect((await initiative.boundingBox())!.x).toBe((await inspector.boundingBox())!.x);
  await page.setViewportSize({ width: 430, height: 932 });
  const mobile = (await initiative.boundingBox())!;
  expect(mobile.x).toBe(8); expect(mobile.width).toBe(414);
  expect(mobile.y).toBeGreaterThanOrEqual((await inspector.boundingBox())!.y + (await inspector.boundingBox())!.height);
  await page.screenshot({ path: info.outputPath('dm-mobile-pinned.png') });
  for (const width of [320, 760, 999]) {
    await page.setViewportSize({ width, height: 932 });
    const menuBox = (await page.getByRole('navigation', { name: 'DM tools' }).boundingBox())!;
    const controlsBox = (await page.locator('.stage-controls').boundingBox())!;
    const panelBox = (await inspector.boundingBox())!;
    expect(menuBox.y + menuBox.height).toBeLessThan(controlsBox.y);
    expect(controlsBox.y + controlsBox.height).toBeLessThan(panelBox.y);
    expect(menuBox.x + menuBox.width).toBeLessThanOrEqual(width);
    await expect(page.getByRole('button', { name: 'Maps', exact: true })).toBeVisible();
    await page.screenshot({ path: info.outputPath(`dm-menu-${width}.png`) });
  }
});

for (const tilted of [false, true]) test(`DM Ctrl-drag selects bases without moving tokens or panning (${tilted ? '45 degrees' : 'overhead'})`, async ({ page, request }, info) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 1000 });
  const setup = await fixture(page, request);
  await page.goto(`/dm?code=${setup.code}`);
  await page.locator('input[type=password]').fill(DM_SECRET);
  await page.getByRole('button', { name: 'Rejoin as DM', exact: true }).click();
  await expect(page.getByTestId('miniature-layer')).toHaveAttribute('data-miniature-count', '3', { timeout: 60_000 });
  if (tilted) await page.getByRole('button', { name: 'Tilted battlefield view', exact: true }).click();
  await page.getByTitle('Zoom in', { exact: true }).click();
  const named = (name: string) => setup.ready.tokens.find(t => t.refId === setup.initial.characters.find(c => c.name === name)!.id)!;
  const first = (await tokenView(page, named('Druk').id))!, second = (await tokenView(page, named('Varis').id))!;
  const before = await setup.snapshot();
  await page.keyboard.down('Control');
  await page.mouse.move(first.x - 30, first.y - 30); await page.mouse.down();
  await page.mouse.move(second.x + 30, second.y + 30, { steps: 12 });
  await expect(page.getByTestId('dm-selection-box')).toBeVisible();
  await page.screenshot({ path: info.outputPath('dm-selection-box.png') });
  await page.mouse.up(); await page.keyboard.up('Control');
  const inspector = page.getByRole('complementary', { name: 'Token inspector', exact: true });
  await expect(inspector.getByRole('heading', { name: '2 tokens selected', level: 2 })).toBeVisible();
  expect((await setup.snapshot()).tokens).toEqual(before.tokens);
  const after = (await tokenView(page, named('Druk').id))!;
  expect([after.x, after.y, after.scaleX, after.scaleY]).toEqual([first.x, first.y, first.scaleX, first.scaleY]);
  await inspector.getByRole('button', { name: 'Close token inspector' }).click();
  const third = (await tokenView(page, named('Vanec').id))!;
  // Drag backwards, starting inside a token base: it must not drag that token.
  await page.keyboard.down('Control'); await page.keyboard.down('Shift');
  await page.mouse.move(third.x + 2, third.y + 2); await page.mouse.down();
  await page.mouse.move(third.x - 24, third.y - 24, { steps: 8 }); await page.mouse.up();
  await page.keyboard.up('Shift'); await page.keyboard.up('Control');
  await expect(inspector.getByRole('heading', { name: '3 tokens selected', level: 2 })).toBeVisible();
  expect((await setup.snapshot()).tokens).toEqual(before.tokens);
  await inspector.getByRole('button', { name: 'Close token inspector' }).click();
  // Ctrl-click still toggles the clicked token out of a multi-selection.
  await page.keyboard.down('Control'); await page.mouse.click(third.x, third.y); await page.keyboard.up('Control');
  await expect(inspector.getByRole('heading', { name: '2 tokens selected', level: 2 })).toBeVisible();
  await inspector.getByRole('button', { name: 'Close token inspector' }).click();
  await page.keyboard.down('Control');
  await page.mouse.move(first.x - 30, first.y - 30); await page.mouse.down();
  await page.mouse.move(second.x + 30, second.y + 30, { steps: 8 });
  await page.keyboard.press('Escape'); await expect(page.getByTestId('dm-selection-box')).toHaveCount(0);
  await page.mouse.up(); await page.keyboard.up('Control');
  await page.getByRole('button', { name: 'Token inspector', exact: true }).click();
  await expect(inspector.getByRole('heading', { name: '2 tokens selected', level: 2 })).toBeVisible();
  expect((await setup.snapshot()).tokens).toEqual(before.tokens);
});

test('players and DM size miniatures through the character panel and fit a five-foot base at either map scale', async ({ page, request, browser }, info) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 1000 });
  const setup = await fixture(page, request);
  await enter(page, setup.code, 'Druk', false);
  const druk = setup.ready.tokens.find(t => t.refId === setup.initial.characters.find(c => c.name === 'Druk')!.id)!;
  await expect(page.getByTestId('miniature-layer')).toHaveAttribute('data-miniature-count', '3', { timeout: 60_000 });
  const dmContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const dm = await dmContext.newPage();
  try {
    await dm.goto(`/dm?code=${setup.code}`);
    await dm.locator('input[type=password]').fill(DM_SECRET);
    await dm.getByRole('button', { name: 'Rejoin as DM', exact: true }).click();
    await expect(dm.getByTestId('miniature-layer')).toHaveAttribute('data-miniature-count', '3', { timeout: 60_000 });
    const dmPoint = (await tokenView(dm, druk.id))!;
    await dm.mouse.click(dmPoint.x, dmPoint.y);
    const dmSize = dm.locator('.dm-token-actions').getByRole('region', { name: '3D figure size', exact: true });
    await expect(dm.locator('#dm-panel-inspect .char-sheet .miniature-size-control')).toHaveCount(0);
    const openCharacter = async () => page.locator('.hud-actions').getByRole('button', { name: 'Character', exact: true }).click();
    await openCharacter();
    const playerSize = page.getByRole('region', { name: '3D figure size', exact: true });
    const playerInput = playerSize.getByLabel('Base width (ft)', { exact: true });
    const dmInput = dmSize.getByLabel('Base width (ft)', { exact: true });
    await expect(playerInput).toHaveValue('4');
    expect((await playerSize.boundingBox())!.height).toBeLessThanOrEqual(32);
    expect((await dmSize.boundingBox())!.height).toBeLessThanOrEqual(32);
    const width = async () => (await setup.snapshot()).tokens.find(t => t.id === druk.id)!.miniatureWidthFt;
    expect((await setup.snapshot()).tokens.find(t => t.id === druk.id)!.widthFt).toBe(5);
    const renderedDiameter = async (target: Page) => (await tokenView(target, druk.id))!.healthBars[0].width;
    await playerInput.fill('7.5'); await playerInput.press('Enter');
    await expect.poll(width).toBe(7.5);
    await expect(dmInput).toHaveValue('7.5');
    await expect.poll(() => renderedDiameter(page)).toBe(150);
    await expect.poll(() => renderedDiameter(dm)).toBe(150);
    await playerSize.getByRole('button', { name: 'Fit to map', exact: true }).click();
    await expect.poll(width).toBe(5);
    // Clicking Fit while the field has an uncommitted edit must win over blur.
    await playerInput.fill('9');
    await playerSize.getByRole('button', { name: 'Fit to map', exact: true }).click();
    await expect(dmInput).toHaveValue('5'); await expect(playerInput).toHaveValue('5');
    await expect.poll(() => renderedDiameter(page)).toBe(100);
    await dmInput.fill('8'); await dmInput.press('Enter');
    await expect(playerInput).toHaveValue('8');
    await dmSize.getByRole('button', { name: 'Fit to map', exact: true }).click();
    await expect(playerInput).toHaveValue('5');
    await page.screenshot({ path: info.outputPath('player-figure-size.png') });
    await page.getByRole('button', { name: 'Close character window' }).click();
    // Ten feet per 100-pixel square: a five-foot base is half a square, in both cameras.
    setup.socket.emit('map:setGrid', { mapId: setup.mapId, gridSizePx: 100, feetPerSquare: 10, widthFt: 120, locked: false });
    await expect.poll(() => renderedDiameter(page)).toBe(50);
    await expect.poll(() => renderedDiameter(dm)).toBe(50);
    for (const target of [page, dm]) {
      await target.getByRole('button', { name: 'Tilted battlefield view', exact: true }).click();
      await afterPaint(target);
      const v = (await tokenView(target, druk.id))!;
      expect(v.miniatureReady).toBe(true);
      // Real Konva hit testing uses the resized round base; decoration cannot enlarge it.
      const hitAt = async (dx: number) => target.evaluate(({ id, dx }) => {
        const stage = (window as any).Konva.stages.find((s: any) => s.find('.token').some((n: any) => n.getAttr('tokenId') === id));
        const node = stage.find('.token').find((n: any) => n.getAttr('tokenId') === id);
        const point = node.getAbsoluteTransform().point({ x: dx, y: 0 });
        return stage.getIntersection(point)?.findAncestor('.token', true)?.getAttr('tokenId') ?? null;
      }, { id: druk.id, dx });
      expect(await hitAt(20)).toBe(druk.id); expect(await hitAt(30)).not.toBe(druk.id);
    }
    const placed = (await setup.snapshot()).tokens.find(t => t.id === druk.id)!;
    expect(placed).toMatchObject({ x: druk.x, y: druk.y, facing: druk.facing, widthFt: 5 });
    await dmSize.scrollIntoViewIfNeeded();
    await dm.screenshot({ path: info.outputPath('dm-figure-size.png') });
    await openCharacter();
    await playerSize.getByRole('button', { name: 'Larger figure', exact: true }).click();
    await expect.poll(width).toBe(5.5);
    await page.reload();
    await expect(page.getByTestId('player-hud')).toBeVisible();
    await openCharacter();
    await expect(playerInput).toHaveValue('5.5');
    await page.setViewportSize({ width: 430, height: 932 });
    await playerSize.scrollIntoViewIfNeeded();
    const button = playerSize.getByRole('button', { name: 'Fit to map', exact: true });
    expect((await playerSize.boundingBox())!.height).toBeLessThanOrEqual(32);
    const b = (await button.boundingBox())!;
    expect(b.x).toBeGreaterThanOrEqual(0); expect(b.x + b.width).toBeLessThanOrEqual(430);
    await button.click(); await expect.poll(width).toBe(5);
    await page.screenshot({ path: info.outputPath('phone-figure-size.png') });
  } finally { await dmContext.close(); }
});

for (const family of ['goblin', 'skeleton', 'human-bandit']) test(`${family} variety loads the same model pool for DM and player`, async ({ page, browser, request }) => {
  test.setTimeout(120_000);
  const f = await fixture(page, request);
  const expected = new Set<string>();
  // Generate until all three choices are represented, independent of random IDs.
  for (let i = 0; i < 30 && (expected.size < 3 || i < 6); i++) {
    f.socket.emit('monster:create', { name: `${family} ${i + 1}`, maxHp: 12, modelType: family });
    const template = (await f.snapshot()).monsterTemplates.find(m => m.name === `${family} ${i + 1}`)!;
    f.socket.emit('token:spawn', { mapId: f.mapId, kind: 'monster', refId: template.id, x: 100 + i % 6 * 180, y: 100 + Math.floor(i / 6) * 110 });
    const snapshot = await f.snapshot();
    for (const token of snapshot.tokens.filter(t => t.kind === 'monster')) {
      const variant = monsterVariation(family, token.refId).variant;
      expected.add(`/miniatures/monsters/${monsterVariantIds(family)[variant]}.glb`);
    }
  }
  expect(expected.size).toBe(3);
  const count = String((await f.snapshot()).tokens.length);
  const observe = (p: Page) => {
    const paths = new Set<string>();
    p.on('response', r => { if (r.ok() && r.url().includes(`/miniatures/monsters/${family}`)) paths.add(new URL(r.url()).pathname); });
    return paths;
  };
  const playerPaths = observe(page);
  await enter(page, f.code);
  await expect(page.getByTestId('miniature-layer')).toHaveAttribute('data-miniature-count', count, {timeout:90_000});
  expect([...playerPaths].sort()).toEqual([...expected].sort());
  const context = await browser.newContext({baseURL:`http://localhost:${PORT}`});
  try {
    const dm = await context.newPage(), dmPaths = observe(dm);
    await dm.goto(`/dm?code=${f.code}`);
    await dm.locator('input[type=password]').fill(DM_SECRET);
    await dm.getByRole('button', {name:'Rejoin as DM',exact:true}).click();
    await expect(dm.getByTestId('miniature-layer')).toHaveAttribute('data-miniature-count', count, {timeout:90_000});
    expect([...dmPaths].sort()).toEqual([...expected].sort());
  } finally { await context.close(); }
});

test('tilted map draws and hit-tests beyond the original raster edge after zoom and resize', async ({page,request}) => {
  const f=await fixture(page,request);
  await enter(page,f.code);
  await expect(page.getByTestId('miniature-layer')).toHaveAttribute('data-miniature-count','3',{timeout:60000});
  for(let i=0;i<6;i++) await page.getByTitle('Zoom in',{exact:true}).click();
  const edge = async () => {
    await afterPaint(page);
    return page.evaluate(() => {
      const stage=(window as any).Konva.stages.find((s:any)=>s.find('.token').length);
      const layer=stage.getLayers()[0], canvas=layer.getNativeCanvasElement();
      const w=stage.width(),h=stage.height(),k=1/Math.max(w*.85,h*1.35,1);
      const x=w/2,y=h/2+(30-h/2)/(1+(30-h/2)*k);
      const px=-parseFloat(canvas.style.left),py=-parseFloat(canvas.style.top),ratio=canvas.width/parseFloat(canvas.style.width);
      const pixel=Array.from(canvas.getContext('2d').getImageData(Math.round((x+px)*ratio),Math.round((y+py)*ratio),1,1).data);
      return {y,pixel,hit:layer.getIntersection({x,y})?.getClassName(),extra:canvas.height>h*ratio};
    });
  };
  for(const viewport of [{width:1440,height:1000},{width:1100,height:850}]) {
    await page.setViewportSize(viewport);
    const sample=await edge();
    expect(sample.y).toBeLessThan(0); expect(sample.extra).toBe(true);
    expect(sample.pixel[3]).toBe(255); expect(sample.pixel[0]).toBeGreaterThan(60);
    expect(sample.hit).toBe('Image');
  }
  await page.getByRole('button',{name:'Flat battlefield view',exact:true}).click();
  await afterPaint(page);
  expect(await page.evaluate(()=>{
    const stage=(window as any).Konva.stages.find((s:any)=>s.find('.token').length);
    const canvas=stage.getLayers()[0].getNativeCanvasElement();
    return {left:canvas.style.left,transform:canvas.style.transform,width:parseFloat(canvas.style.width),stage:stage.width()};
  })).toMatchObject({left:'0px',transform:'none',width:1100,stage:1100});
});

test('player and monster appearance switches are independent for players and DM', async ({page,browser,request}) => {
  test.setTimeout(120000);
  const f=await monsterFixture(page,request);
  await enter(page,f.code);
  const count=async(p:Page,n:number)=> n ? expect(p.getByTestId('miniature-layer')).toHaveAttribute('data-miniature-count',String(n),{timeout:60000}) : expect(p.getByTestId('miniature-layer')).toHaveCount(0);
  await count(page,6);
  await page.getByRole('button',{name:'2D monster tokens',exact:true}).click();await count(page,3);
  await page.reload();await count(page,3);
  await expect(page.getByRole('button',{name:'2D monster tokens',exact:true})).toHaveAttribute('aria-pressed','true');
  await page.getByRole('button',{name:'2D player tokens',exact:true}).click();await count(page,0);
  await page.getByRole('button',{name:'3D monster tokens',exact:true}).click();await count(page,3);
  await page.reload();await count(page,3);
  await expect(page.getByRole('button',{name:'2D player tokens',exact:true})).toHaveAttribute('aria-pressed','true');
  const ctx=await browser.newContext({baseURL:`http://localhost:${PORT}`});
  try {
    const dm=await ctx.newPage();await dm.goto(`/dm?code=${f.code}`);
    await dm.locator('input[type=password]').fill(DM_SECRET);
    await dm.getByRole('button',{name:'Rejoin as DM',exact:true}).click();await count(dm,6);
    await dm.getByRole('button',{name:'2D player tokens',exact:true}).click();await count(dm,3);
    await dm.reload();await count(dm,3);
    await expect(dm.getByRole('button',{name:'3D monster tokens',exact:true})).toHaveAttribute('aria-pressed','true');
    await dm.getByRole('button',{name:'2D monster tokens',exact:true}).click();await count(dm,0);
    await count(page,3);
    await dm.getByRole('button',{name:'3D player tokens',exact:true}).click();await count(dm,3);
    await dm.getByRole('button',{name:'3D monster tokens',exact:true}).click();await count(dm,6);
  } finally {await ctx.close();}
  await page.getByRole('button',{name:'3D player tokens',exact:true}).click();await count(page,6);
});

test('starter library models and attacks load for DM and player', async ({ page, browser, request }, info) => {
  test.setTimeout(180_000);
  const f = await fixture(page, request);
  const entries = await (await request.get('/api/library/creatures')).json();
  const names = ['Mage Hand', 'Kobold', 'Zombie', 'Giant Rat', 'Mimic'];
  for (const [index, name] of names.entries()) {
    const entry = entries.find((c: any) => c.name === name);
    expect(entry).toBeTruthy();
    if (name === 'Mage Hand') expect(entry.weapons).toEqual([]);
    if (name !== 'Mage Hand') expect(entry.weapons.length).toBeGreaterThan(0);
    f.socket.emit('monster:create', { ...entry, source: 'manual' });
    const template = (await f.snapshot()).monsterTemplates.find(m => m.name === name)!;
    expect(template.modelType).toBe(entry.modelType);
    f.socket.emit('token:spawn', { mapId: f.mapId, kind: 'monster', refId: template.id, x: 140 + index * 220, y: 190 });
  }
  await enter(page, f.code);
  await expect(page.getByTestId('miniature-layer')).toHaveAttribute('data-miniature-count', '8', { timeout: 90_000 });
  await afterPaint(page);
  await page.screenshot({ path: info.outputPath('starter-models-player.png') });
  const context = await browser.newContext({baseURL:`http://localhost:${PORT}`});
  try {
    const dm = await context.newPage();
    await dm.goto(`/dm?code=${f.code}`);
    await dm.locator('input[type=password]').fill(DM_SECRET);
    await dm.getByRole('button', {name:'Rejoin as DM',exact:true}).click();
    await expect(dm.getByTestId('miniature-layer')).toHaveAttribute('data-miniature-count', '8', { timeout: 90_000 });
    await afterPaint(dm);
    await dm.screenshot({ path: info.outputPath('starter-models-dm.png') });
  } finally { await context.close(); }
});

for (const tilted of [false, true]) test(`base overlap nudges a player drop in ${tilted ? 'tilted' : 'overhead'} view`, async ({page,request}) => {
  const f=await fixture(page,request);
  const druk=f.ready.tokens.find(t=>t.refId===f.initial.characters.find(c=>c.name==='Druk')!.id)!;
  const varis=f.ready.tokens.find(t=>t.refId===f.initial.characters.find(c=>c.name==='Varis')!.id)!;
  await enter(page,f.code,'Druk',tilted);
  await expect(page.getByTestId('miniature-layer')).toHaveAttribute('data-miniature-count','3',{timeout:60000});
  const a=(await tokenView(page,druk.id))!,b=(await tokenView(page,varis.id))!;
  await page.mouse.move(a.x,a.y);await page.mouse.down();
  await page.mouse.move(b.x,b.y,{steps:20});await page.mouse.up();
  await expect.poll(async()=>{
    const t=(await f.snapshot()).tokens.find(t=>t.id===druk.id)!;
    return Math.hypot(t.x-varis.x,t.y-varis.y);
  }).toBeGreaterThan(30);
  const placed=(await f.snapshot()).tokens.find(t=>t.id===druk.id)!;
  expect(Math.hypot(placed.x-varis.x,placed.y-varis.y)).toBeLessThan(60);
  expect(placed.x).toBeLessThan(varis.x); // backs out to the approach side
  expect((await f.snapshot()).tokens.find(t=>t.id===varis.id)).toMatchObject({x:varis.x,y:varis.y});
  // Both the draggable hit region and the rendered miniature receive the accepted position.
  await expect.poll(()=>page.evaluate(id=>{
    const stage=(window as any).Konva.stages.find((s:any)=>s.find('.token').length);
    const node=stage.find('.token').find((n:any)=>n.getAttr('tokenId')===id);
    return node.position();
  },druk.id)).toEqual({x:placed.x,y:placed.y});
});
