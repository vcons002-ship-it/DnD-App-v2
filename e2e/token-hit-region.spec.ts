import { test, expect, type Page, type Route } from '@playwright/test';
import { build } from 'esbuild';
import path from 'node:path';

// Renders the actual component in an empty browser document. No application
// server, sockets, campaign database, or fixture writes are needed by this file.
let componentBundle: string;
const imageUrl = 'https://token-hit.test/portrait.svg';
const imageFixture = '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" fill="#4388bf"/></svg>';

type Hit = { name: string; tokenId: string } | null;
type RenderOptions = { shape?: string; icon?: string; listening?: boolean; adjacent?: boolean };
type QaWindow = Window & { __tokenHitQA: {
  render: (options: RenderOptions) => void;
  hits: (points: number[][]) => Hit[];
  imageLoaded: () => boolean;
  events: Array<{ name: string; tokenId: string; x?: number; y?: number }>;
  count: () => { hitShapes: number; listeningArt: number };
} };

test.beforeAll(async () => {
  const result = await build({
    stdin: {
      resolveDir: process.cwd(), loader: 'jsx', sourcefile: 'token-hit-qa.jsx',
      contents: `
        import React from 'react';
        import { createRoot } from 'react-dom/client';
        import { flushSync } from 'react-dom';
        import { Stage, Layer } from 'react-konva';
        import { TokenShape } from './client/src/canvas/TokenShape.tsx';
        const root = createRoot(document.getElementById('root'));
        const stageRef = React.createRef();
        const events = [];
        const record = (name) => (token, x, y) => events.push({ name, tokenId: token.id, x, y });
        const callbacks = {
          onSelect: record('select'), onActivate: record('activate'),
          onMove: record('move'), onContextMenu: record('context'),
          onHover: record('hover'), onHoverEnd: record('hoverEnd'),
          onDragActive: (active) => events.push({ name: active ? 'dragStart' : 'dragEnd' }),
        };
        const display = { name: 'A wide decorative token name', curHp: 7, maxHp: 10,
          tempHp: 8, icon: '', disposition: 'friendly',
          conditions: [{ label: 'Poisoned', aura: 'red' }, { label: 'Bless', aura: 'green' }] };
        const token = { id: 'front', kind: 'pc', refId: 'pc1', x: 200, y: 200,
          widthFt: 5, shape: 'circle', combatRole: 'caster' };
        const props = { display, gridSizePx: 40, pxPerFoot: 16, draggable: true,
          selected: true, activeTurn: true, initiativeRank: 1, ...callbacks };
        const render = ({ shape = 'circle', icon = '', listening = true, adjacent = false } = {}) => {
          flushSync(() => root.render(<Stage width={500} height={420} ref={stageRef}>
            <Layer>
              {adjacent && <TokenShape {...props} activeTurn={false} initiativeRank={null}
                token={{ ...token, id: 'behind', kind: 'monster', y: 135 }} />}
              <TokenShape {...props} display={{ ...display, icon }} listening={listening} token={{ ...token, shape }} />
            </Layer>
          </Stage>));
          stageRef.current.draw();
        };
        window.__tokenHitQA = {
          render, events,
          imageLoaded: () => stageRef.current.find('Image').length > 0,
          hits: (points) => { stageRef.current.draw(); return points.map(([x, y]) => {
            const shape = stageRef.current.getIntersection({ x, y });
            return shape ? { name: shape.name(), tokenId: shape.getAttr('tokenId') } : null;
          }); },
          count: () => ({ hitShapes: stageRef.current.find('.token-hit-region').length,
            listeningArt: stageRef.current.find('.token-art').filter(node => node.isListening()).length }),
        };
        render();
      `,
    },
    absWorkingDir: path.resolve('.'), bundle: true, write: false,
    platform: 'browser', format: 'iife', define: { 'process.env.NODE_ENV': '"development"' },
  });
  componentBundle = result.outputFiles[0].text;
});

async function mount(page: Page, options: RenderOptions = {}) {
  // Locally fulfilled fixture: exercises the actual image loader without a
  // network dependency, application server, or special production URL support.
  await page.route(imageUrl, (route) => route.fulfill({
    contentType: 'image/svg+xml', body: imageFixture,
    headers: { 'access-control-allow-origin': '*' },
  }));
  await page.setContent('<html><body style="margin:0"><div id="root"></div></body></html>');
  await page.addScriptTag({ content: componentBundle });
  await page.evaluate((settings) => (window as unknown as QaWindow).__tokenHitQA.render(settings), options);
  if (options.icon === imageUrl) {
    await expect.poll(() => page.evaluate(() => (window as unknown as QaWindow).__tokenHitQA.imageLoaded())).toBe(true);
  }
}

for (const sample of [
  { shape: 'circle', inside: [[39, 0], [0, -39]], outside: [[41, 0], [39, 39]] },
  { shape: 'square', inside: [[39, 39], [-39, -39]], outside: [[41, 0], [0, -41]] },
  { shape: 'image', label: 'loaded image', icon: imageUrl, inside: [[39, 39], [-39, -39]], outside: [[41, 0], [0, -41]] },
  { shape: 'image', label: 'missing image fallback', inside: [[39, 0], [0, -39]], outside: [[41, 0], [39, 39]] },
  { shape: 'diamond', inside: [[50, 0], [25, 25]], outside: [[54, 0], [28, 28]] },
  { shape: 'triangle', inside: [[0, -38], [0, 18]], outside: [[0, 22], [20, -30]] },
]) {
  test(`${sample.label ?? sample.shape} hit region matches only its body silhouette`, async ({ page }) => {
    await mount(page, { shape: sample.shape, icon: sample.icon });
    const hits = await page.evaluate((points) => (window as unknown as QaWindow).__tokenHitQA.hits(points),
      [...sample.inside, ...sample.outside].map(([x, y]) => [x + 200, y + 200]));
    expect(hits.slice(0, sample.inside.length)).toEqual(sample.inside.map(() => ({ name: 'token-hit-region', tokenId: 'front' })));
    expect(hits.slice(sample.inside.length)).toEqual(sample.outside.map(() => null));
    expect(await page.evaluate(() => (window as unknown as QaWindow).__tokenHitQA.count()))
      .toEqual({ hitShapes: 1, listeningArt: 0 });
  });
}

test('loading and failed image icons keep the circular fallback hit region', async ({ page }) => {
  await mount(page, { shape: 'image' });
  const unavailableImageUrl = 'https://token-hit.test/unavailable.png';
  let captureRoute!: (route: Route) => void;
  const pendingRequest = new Promise<Route>((resolve) => { captureRoute = resolve; });
  await page.route(unavailableImageUrl, captureRoute);
  await page.evaluate((icon) => (window as unknown as QaWindow).__tokenHitQA.render({ shape: 'image', icon }), unavailableImageUrl);
  const route = await pendingRequest;
  const assertFallback = async () => {
    expect(await page.evaluate(() => (window as unknown as QaWindow).__tokenHitQA.imageLoaded())).toBe(false);
    expect(await page.evaluate(() => (window as unknown as QaWindow).__tokenHitQA.hits([[239, 200], [239, 239], [241, 200]])))
      .toEqual([{ name: 'token-hit-region', tokenId: 'front' }, null, null]);
  };
  await assertFallback();
  const failed = page.waitForEvent('requestfailed', (request) => request.url() === unavailableImageUrl);
  await route.abort();
  await failed;
  await assertFallback();
});

test('names, crown, health bar and rings do not steal a nearby body hit', async ({ page }) => {
  await mount(page, { adjacent: true });
  // Front token is painted last: its 4r-wide name crosses the rear token's body.
  expect(await page.evaluate(() => (window as unknown as QaWindow).__tokenHitQA.hits([[200, 135], [280, 130], [200, 246], [255, 200]])))
    .toEqual([{ name: 'token-hit-region', tokenId: 'behind' }, null, null, null]);
  await page.mouse.click(200, 135);
  expect(await page.evaluate(() => (window as unknown as QaWindow).__tokenHitQA.events.filter(event => event.name === 'select')))
    .toEqual([{ name: 'select', tokenId: 'behind', x: false }]);
});

test('body keeps select, hover, context menu, activation and drag; measurement disables hits', async ({ page }) => {
  await mount(page);
  await page.mouse.move(200, 200);
  await page.mouse.click(200, 200);
  await page.mouse.click(200, 200, { button: 'right' });
  await page.mouse.dblclick(200, 200);
  await page.mouse.move(200, 200);
  await page.mouse.down();
  await page.mouse.move(250, 230, { steps: 8 });
  await page.mouse.up();
  const events = await page.evaluate(() => (window as unknown as QaWindow).__tokenHitQA.events);
  for (const name of ['select', 'hover', 'context', 'activate', 'dragStart', 'dragEnd', 'move'])
    expect(events.some(event => event.name === name), name).toBe(true);
  const movement = events.find(event => event.name === 'move')!;
  expect(movement.x).toBeCloseTo(250, 1);
  expect(movement.y).toBeCloseTo(230, 1);
  await page.evaluate(() => (window as unknown as QaWindow).__tokenHitQA.render({ listening: false }));
  expect(await page.evaluate(() => (window as unknown as QaWindow).__tokenHitQA.hits([[200, 200], [250, 230]])))
    .toEqual([null, null]);
});

test('body retains touch tap and long-press context', async ({ browser }) => {
  const context = await browser.newContext({ hasTouch: true, viewport: { width: 500, height: 420 } });
  const page = await context.newPage();
  try {
    await mount(page);
    await page.touchscreen.tap(200, 200);
    expect(await page.evaluate(() => (window as unknown as QaWindow).__tokenHitQA.events.some(event => event.name === 'select'))).toBe(true);
    // Separate this hold from the component's deliberate double-tap threshold.
    await page.waitForTimeout(400);
    const session = await context.newCDPSession(page);
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 200, y: 200 }] });
    await expect.poll(() => page.evaluate(() => (window as unknown as QaWindow).__tokenHitQA.events.some(event => event.name === 'context'))).toBe(true);
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  } finally { await context.close(); }
});
