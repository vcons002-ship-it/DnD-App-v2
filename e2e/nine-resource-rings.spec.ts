import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import { io, type Socket } from 'socket.io-client';
import type { Character, StateSnapshot } from '../shared/types';
import { DM_SECRET, PORT } from './playwright.config';

const connections: Socket[] = [];
test.afterEach(() => connections.splice(0).forEach((socket) => socket.disconnect()));
const maxima = [4, 3, 3, 3, 3, 2, 2, 1, 1];
const slots = Object.fromEntries(maxima.map((max, index) => [`L${index + 1}`, { max, used: index % 3 === 0 ? 1 : 0, maxOverride: true }]));
const guardians = [
  { name: 'Nine-ring Fighter', race: 'Half-Orc', className: 'Fighter', art: 'half-orc-fighter' },
  { name: 'Nine-ring Sorcerer', race: 'Tiefling', className: 'Sorcerer', art: 'tiefling-sorcerer' },
  { name: 'Nine-ring Ranger', race: 'Half-Elf', className: 'Ranger', art: 'half-elf-ranger' },
];

// Every mutation goes to the config's throwaway database on port4099. The
// deliberately manual level-20 counters are not imported into a real campaign.
async function fixture(request: APIRequestContext, guardian = guardians[1], initialCount = 9) {
  const response = await request.post('/api/sessions', {
    headers: { 'x-dm-passphrase': DM_SECRET }, data: { name: 'Nine resource rings regression' },
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
  await snapshot();
  socket.emit('character:create', { name: guardian.name, race: guardian.race, className: guardian.className, level: 20, maxHp: 80 });
  const id = (await snapshot()).characters.find((character) => character.name === guardian.name)!.id;
  socket.emit('character:update', {
    characterId: id, level: 20, curHp: 53,
    spellSlots: Object.fromEntries(Object.entries(slots).slice(0, initialCount)),
    resources: { ...(initialCount === 9 ? { 'Sorcery Points': { max: 6, used: 2 } } : {}), 'Moon marks': { max: 3, used: 1 } },
  });
  const mapResponse = await request.post(`/api/sessions/${code}/maps`, {
    headers: { 'x-dm-passphrase': DM_SECRET },
    multipart: { name: 'Isolated ring geometry map', image: { name: 'fixture.png', mimeType: 'image/png',
      buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j9uoAAAAASUVORK5CYII=', 'base64') } },
  });
  expect(mapResponse.ok()).toBeTruthy();
  const map = await mapResponse.json();
  socket.emit('map:setActive', { mapId: map.id });
  socket.emit('fog:setLayer', { mapId: map.id, layer: 'map', enabled: false });
  socket.emit('fog:setLayer', { mapId: map.id, layer: 'tokens', enabled: false });
  socket.emit('chat:send', { text: 'Nine-tier resource layout: this full-width chat line must remain clear of the orb controls.' });
  const ready = await snapshot();
  const saved = ready.characters.find((character) => character.id === id)!;
  return { code, id, socket, snapshot, saved, guardian };
}

async function join(page: Page, setup: Awaited<ReturnType<typeof fixture>>) {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto(`/join?code=${setup.code}`);
  await page.getByRole('button', { name: 'Join', exact: true }).click();
  await page.locator('.claim-row').filter({ hasText: setup.guardian.name }).click();
  await expect(page.locator('.player-hud')).toHaveAttribute('data-orb-art', setup.guardian.art);
  await expect.poll(() => page.locator('.orb-holder').evaluate((image) => (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0)).toBe(true);
  await page.evaluate(() => document.fonts.ready);
}

async function layout(page: Page, mode: 'compact' | 'concentric', scale: number) {
  await page.getByRole('button', { name: 'Interface settings', exact: true }).click();
  await page.getByLabel(mode === 'concentric' ? 'Concentric arcs' : 'Compact rows', { exact: true }).check();
  await page.locator('#player-ui-scale').fill(String(scale));
  await page.getByRole('button', { name: 'Close interface settings', exact: true }).click();
  await page.mouse.move(700, 200);
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
}

async function geometry(page: Page) {
  return page.locator('.player-hud').evaluate((hud) => {
    const sculpture = hud.querySelector<HTMLElement>('.hud-orb-cluster')!;
    const frame = sculpture.getBoundingClientRect(), globe = hud.querySelector('.main-orb')!.getBoundingClientRect();
    const size = parseFloat(getComputedStyle(sculpture).width), zoom = frame.width / size;
    const cx = globe.x + globe.width / 2, cy = globe.y + globe.height / 2;
    const inspect = (element: Element) => {
      const bounds = element.getBoundingClientRect(), x = bounds.x + bounds.width / 2, y = bounds.y + bounds.height / 2;
      const clipping: string[] = [];
      for (let ancestor = element.parentElement; ancestor; ancestor = ancestor.parentElement) {
        const style = getComputedStyle(ancestor), box = ancestor.getBoundingClientRect();
        const clippedX = /hidden|clip|auto|scroll/.test(style.overflowX) && (bounds.left < box.left - 1 || bounds.right > box.right + 1);
        const clippedY = /hidden|clip|auto|scroll/.test(style.overflowY) && (bounds.top < box.top - 1 || bounds.bottom > box.bottom + 1);
        if (clippedX || clippedY) clipping.push(ancestor.className);
      }
      return { label: element.getAttribute('aria-label'), x, y, width: bounds.width, height: bounds.height,
        clickable: element.contains(document.elementFromPoint(x, y)),
        inViewport: bounds.left >= 0 && bounds.top >= 0 && bounds.right <= innerWidth && bounds.bottom <= innerHeight,
        clipping, rawWidth: bounds.width / zoom, radial: Math.hypot(x - cx, y - cy) };
    };
    const rows = [...hud.querySelectorAll('.curved-resource')].map((row) => ({
      radius: Number(/A\s*([\d.]+)/.exec(row.querySelector('.resource-arc-metal path')!.getAttribute('d')!)![1]),
      controls: [...row.querySelectorAll('.resource-sigil-trigger, .resource-jewel')].map(inspect),
    }));
    const customButton = hud.querySelector('.resource-custom-trigger');
    const custom = customButton ? inspect(customButton) : null;
    const box = hud.getBoundingClientRect(), feed = document.querySelector('.roll-log-overlay')?.getBoundingClientRect();
    return { size, zoom, cx, cy, bottom: frame.bottom, hudWidth: box.width, hudRight: box.right,
      feed: feed ? { left: feed.left, right: feed.right, width: feed.width } : null,
      extension: parseFloat(getComputedStyle(document.querySelector('.player-fantasy')!).getPropertyValue('--resource-wing-extension')) || 0,
      rows, custom };
  });
}

function counters(character: Character) { return { spellSlots: character.spellSlots, resources: character.resources }; }

for (const guardian of guardians) test(`${guardian.art}: nine spell rings and the tenth class ring stay aligned and clickable`, async ({ page, request }) => {
  const setup = await fixture(request, guardian);
  await join(page, setup);
  await expect(page.locator('.resource-branch-extended')).toHaveAttribute('data-resource-art', guardian.art);
  const trim = `/art/hud/resource-branch-${guardian.className.toLowerCase()}-v1.png`;
  await expect(page.locator('.resource-branch-extended image')).toHaveCount(5);
  for (const segment of await page.locator('.resource-branch-extended image').all()) {
    await expect(segment).toHaveAttribute('href', trim);
  }
  const trimResponse = await request.get(trim);
  expect(trimResponse.ok()).toBe(true);
  expect(trimResponse.headers()['content-type']).toContain('image/png');
  const dock = page.getByRole('region', { name: 'Character resources', exact: true });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const measurements = [];
  for (const [width, height] of [[1366, 768], [1920, 1080]]) for (const scale of [85, 100]) {
    await page.setViewportSize({ width, height });
    await layout(page, 'concentric', scale);
    await expect(dock).toHaveAttribute('data-resource-rings', '10');
    await expect(dock.locator('.curved-resource')).toHaveCount(10);
    const measured = await geometry(page);
    const details = `${guardian.art} ${width}px ${scale}%`;
    expect(measured.extension, details).toBe(156);
    expect(Math.abs(measured.hudWidth / measured.zoom - (measured.size + 152 + 156)), details).toBeLessThan(.1);
    expect(measured.feed, `${details}: retain the existing bottom feed`).not.toBeNull();
    expect(measured.feed!.left - measured.hudRight, `${details}: feed and HUD share the ancestor's width`).toBeGreaterThanOrEqual(7);
    expect(measured.feed!.width).toBeGreaterThan(500);
    const labels = measured.rows.map((row) => row.controls[0]);
    expect(Math.max(...labels.map((label) => label.y)) - Math.min(...labels.map((label) => label.y)), details).toBeLessThan(1);
    for (const [index, ring] of measured.rows.entries()) {
      if (index) expect(ring.radius - measured.rows[index - 1].radius, details).toBeCloseTo(27, 2);
      expect(ring.controls).toHaveLength((index === 9 ? 6 : maxima[index]) + 1);
      for (const [ordinal, control] of ring.controls.entries()) {
        const label = `${details}: ${JSON.stringify(control)}`;
        expect(Math.abs(control.radial - ring.radius * measured.zoom), label).toBeLessThan(1);
        const baseline = measured.bottom - (42 + (ordinal ? 24 + (ordinal - 1) * 20 : 0)) * measured.zoom;
        expect(Math.abs(control.y - baseline), label).toBeLessThan(1);
        expect(control.inViewport, label).toBe(true);
        expect(control.clickable, label).toBe(true);
        expect(control.clipping, label).toEqual([]);
        if (ordinal) expect(Math.abs(control.rawWidth - 17), label).toBeLessThan(.06);
      }
    }
    expect(measured.custom, `${details}: the eleventh row needs its overflow trigger`).not.toBeNull();
    expect(measured.custom!.clickable, `${details}: custom trackers remain accessible`).toBe(true);
    expect(measured.custom!.inViewport).toBe(true);
    expect(measured.custom!.clipping).toEqual([]);
    const ninth = dock.getByRole('button', { name: /^Level 9:/ });
    await expect(ninth.locator('.resource-sigil-letter')).toHaveText('IX');
    await ninth.click();
    const editor = page.getByRole('form', { name: 'Adjust L9', exact: true });
    await expect(editor.getByLabel('Total maximum', { exact: true })).toHaveValue('1');
    await editor.getByRole('button', { name: 'Cancel', exact: true }).click();
    // The tenth eligible class pool is now an outer ring. Unknown trackers and
    // further non-fitting rows belong to Additional resources, never a header.
    await expect(dock.locator('.concentric-continuation')).toHaveCount(0);
    const classPool = dock.locator('.curved-resource').getByRole('group', { name: 'Sorcery Points: 4 of 6 remaining', exact: true });
    await expect(classPool).toBeVisible();
    await expect(classPool.locator('.resource-jewel')).toHaveCount(6);
    await expect(classPool.locator('.resource-jewel').last()).toBeInViewport({ ratio: 1 });
    await dock.getByRole('button', { name: /^Additional resources/ }).click();
    await expect(dock.getByRole('group', { name: 'Moon marks: 2 of 3 remaining', exact: true })).toBeVisible();
    await dock.getByRole('button', { name: 'Close additional resources', exact: true }).click();
    await page.mouse.move(700, 200);
    measurements.push({ width, height, scale, ...measured });
    await test.info().attach(`${guardian.art}-${width}-${scale}.png`, { contentType: 'image/png', body: await page.screenshot({ animations: 'disabled' }) });
    await layout(page, 'compact', scale);
    const compact = await geometry(page);
    expect(Math.abs(compact.hudWidth / compact.zoom - (compact.size + 174)), `${details}: compact layout drops the extended width`).toBeLessThan(.1);
    await expect(dock.locator('.resource-jewel')).toHaveCount(maxima.reduce((sum, max) => sum + max, 0) + 6);
  }
  expect(counters((await setup.snapshot()).characters.find((character) => character.id === setup.id)!)).toEqual(counters(setup.saved));
  await test.info().attach('nine-ring-geometry.json', { contentType: 'application/json', body: JSON.stringify(measurements, null, 2) });
  expect(errors).toEqual([]);
});

test('original four spell centers and ordinary rack width survive priority rows pushing a custom ring outward', async ({ page, request }) => {
  const setup = await fixture(request, guardians[1], 4);
  await join(page, setup);
  const dock = page.getByRole('region', { name: 'Character resources', exact: true });
  await layout(page, 'concentric', 85);
  await expect(dock).toHaveAttribute('data-resource-rings', '5');
  const before = await geometry(page);
  expect(before.custom, 'No empty overflow button when every tracker fits').toBeNull();
  expect(Math.abs(before.hudWidth / before.zoom - (before.size + 152))).toBeLessThan(.1);
  setup.socket.emit('character:update', { characterId: setup.id, spellSlots: slots,
    resources: { 'Sorcery Points': { max: 6, used: 2 }, 'Moon marks': { max: 3, used: 1 } } });
  const expandedSaved = (await setup.snapshot()).characters.find((character) => character.id === setup.id)!;
  await expect(dock).toHaveAttribute('data-resource-rings', '10');
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  const after = await geometry(page);
  expect(after.rows.slice(0, 4)).toEqual(before.rows.slice(0, 4));
  expect(Math.abs((after.hudWidth - before.hudWidth) / after.zoom - 156)).toBeLessThan(.1);
  await page.reload();
  await expect(dock).toHaveAttribute('data-resource-rings', '10');
  expect(counters((await setup.snapshot()).characters.find((character) => character.id === setup.id)!)).toEqual(counters(expandedSaved));
});

test('eleventh, oversized and zero-capacity core trackers stay editable in Additional resources', async ({ page, request }) => {
  const setup = await fixture(request);
  for (const [key, max, used] of [['Action Surge', 2, 1], ['Ki Points', 25, 7], ['Channel Divinity', 0, 0]] as const) {
    setup.socket.emit('resource:set', { characterId: setup.id, group: 'resources', key, max, used });
  }
  const seeded = (await setup.snapshot()).characters.find((character) => character.id === setup.id)!;
  await join(page, setup);
  await layout(page, 'concentric', 85);
  const dock = page.getByRole('region', { name: 'Character resources', exact: true });
  const trigger = dock.getByRole('button', { name: 'Additional resources (4)', exact: true });
  await expect(dock).toHaveAttribute('data-resource-rings', '10');
  await expect(dock.locator('.concentric-continuation')).toHaveCount(0);
  await expect(trigger).toHaveAttribute('title', 'Open 4 additional resource trackers');
  await trigger.click();
  const drawer = dock.getByRole('region', { name: 'Additional resource trackers', exact: true });
  await expect(drawer.getByRole('group')).toHaveCount(4);
  await expect(drawer.getByRole('group', { name: 'Action Surge: 1 of 2 remaining', exact: true }).locator('.resource-jewel')).toHaveCount(2);
  await expect(drawer.getByRole('group', { name: 'Moon marks: 2 of 3 remaining', exact: true })).toBeVisible();
  await expect(drawer.getByRole('group', { name: 'Channel Divinity: 0 of 0 remaining', exact: true })).toContainText('No capacity');
  await expect(drawer.getByRole('group', { name: 'Ki Points: 18 of 25 remaining', exact: true }).locator('.resource-jewel')).toHaveCount(24);
  await drawer.getByRole('button', { name: /^Ki Points: 18 of 25 remaining/ }).click();
  const editor = page.getByRole('form', { name: 'Adjust Ki Points', exact: true });
  await editor.getByLabel('Total maximum', { exact: true }).fill('26');
  await editor.getByLabel('Remaining', { exact: true }).fill('7');
  await editor.getByRole('button', { name: 'Apply correction', exact: true }).click();
  await expect(drawer.getByRole('group', { name: 'Ki Points: 7 of 26 remaining', exact: true })).toBeVisible();
  await page.mouse.click(800, 200);
  await expect(drawer).toHaveCount(0);
  await trigger.click();
  await drawer.getByRole('button', { name: /^Ki Points: 7 of 26 remaining/ }).click();
  await expect(editor.getByLabel('Total maximum', { exact: true })).toHaveValue('26');
  await expect(editor.getByLabel('Remaining', { exact: true })).toHaveValue('7');
  await editor.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.keyboard.press('Escape');
  await expect(drawer).toHaveCount(0);
  await page.reload();
  await trigger.click();
  await expect(drawer.getByRole('group', { name: 'Ki Points: 7 of 26 remaining', exact: true })).toBeVisible();
  const saved = (await setup.snapshot()).characters.find((character) => character.id === setup.id)!;
  expect(saved.spellSlots).toEqual(seeded.spellSlots);
  expect(saved.resources['Ki Points']).toMatchObject({ max: 26, used: 19, maxOverride: true });
  for (const key of ['Action Surge', 'Channel Divinity', 'Moon marks', 'Sorcery Points']) expect(saved.resources[key]).toEqual(seeded.resources[key]);
});

test('custom rows fill both racks, remain editable, and move outward only for higher-priority rows', async ({ page, request }) => {
  const setup = await fixture(request, guardians[1], 2);
  // Intentionally insert custom resources before their recognized class pool,
  // and spell levels in reverse order. UI priority must not depend on insertion.
  setup.socket.emit('character:update', { characterId: setup.id,
    spellSlots: { L2: { max: 3, used: 1 }, L1: { max: 4, used: 0 } },
    resources: { 'Moon marks': { max: 3, used: 1 }, 'Rune charges': { max: 2, used: 0 }, 'Sorcery Points': { max: 6, used: 2 } } });
  const initial = (await setup.snapshot()).characters.find((character) => character.id === setup.id)!;
  await join(page, setup);
  const dock = page.getByRole('region', { name: 'Character resources', exact: true });
  const names = () => dock.locator('.core-resource-rows [role="group"]').evaluateAll((elements) =>
    elements.map((element) => element.getAttribute('aria-label')!.split(':')[0]));
  const initialOrder = ['L1', 'L2', 'Sorcery Points', 'Moon marks', 'Rune charges'];
  expect(await names()).toEqual(initialOrder);
  await expect(dock.getByRole('button', { name: /^Additional resources/ })).toHaveCount(0);
  await layout(page, 'concentric', 85);
  await expect(dock).toHaveAttribute('data-resource-rings', '5');
  expect(await names()).toEqual(initialOrder);
  expect(counters((await setup.snapshot()).characters.find((character) => character.id === setup.id)!)).toEqual(counters(initial));
  await dock.locator('.curved-resource').getByRole('button', { name: /^Moon marks: 2 of 3 remaining/ }).click();
  const editor = page.getByRole('form', { name: 'Adjust Moon marks', exact: true });
  await editor.getByLabel('Total maximum', { exact: true }).fill('4');
  await editor.getByLabel('Remaining', { exact: true }).fill('2');
  await editor.getByRole('button', { name: 'Apply correction', exact: true }).click();
  await expect(dock.locator('.curved-resource').getByRole('group', { name: 'Moon marks: 2 of 4 remaining', exact: true })).toBeVisible();
  const edited = (await setup.snapshot()).characters.find((character) => character.id === setup.id)!;
  expect(edited.resources['Moon marks']).toMatchObject({ max: 4, used: 2, maxOverride: true });

  for (let level = 9; level >= 3; level--) setup.socket.emit('resource:set', { characterId: setup.id, group: 'spellSlots', key: `L${level}`, max: 1, used: 0, preserveMax: true });
  await setup.snapshot();
  await expect(dock).toHaveAttribute('data-resource-rings', '10');
  await expect(dock.getByRole('button', { name: 'Additional resources (2)', exact: true })).toBeVisible();
  const priorityOrder = ['L1', 'L2', 'L3', 'L4', 'L5', 'L6', 'L7', 'L8', 'L9', 'Sorcery Points'];
  expect(await names()).toEqual(priorityOrder);
  await expect(dock.locator('.core-resource-rows').getByRole('group', { name: /^Moon marks:/ })).toHaveCount(0);
  await dock.getByRole('button', { name: 'Additional resources (2)', exact: true }).click();
  const drawer = dock.getByRole('region', { name: 'Additional resource trackers', exact: true });
  await expect(drawer.getByRole('group', { name: 'Moon marks: 2 of 4 remaining', exact: true })).toBeVisible();
  await expect(drawer.getByRole('group', { name: 'Rune charges: 2 of 2 remaining', exact: true })).toBeVisible();
  await drawer.getByRole('button', { name: 'Close additional resources', exact: true }).click();

  // Vacating one higher-priority position brings the first custom row back to
  // the outermost ring without touching its corrected maximum or remaining.
  setup.socket.emit('resource:set', { characterId: setup.id, group: 'spellSlots', key: 'L9', remove: true });
  const finalOrder = ['L1', 'L2', 'L3', 'L4', 'L5', 'L6', 'L7', 'L8', 'Sorcery Points', 'Moon marks'];
  await expect(dock.getByRole('button', { name: 'Additional resources (1)', exact: true })).toBeVisible();
  expect(await names()).toEqual(finalOrder);
  await expect(dock.locator('.curved-resource').last().getByRole('group', { name: 'Moon marks: 2 of 4 remaining', exact: true })).toBeVisible();
  await layout(page, 'compact', 85);
  expect(await names()).toEqual(finalOrder);
  await dock.getByRole('button', { name: 'Additional resources (1)', exact: true }).click();
  await expect(drawer.getByRole('group', { name: 'Rune charges: 2 of 2 remaining', exact: true })).toBeVisible();
  await drawer.getByRole('button', { name: 'Close additional resources', exact: true }).click();
  await page.reload();
  await expect(dock.getByRole('button', { name: /^Moon marks: 2 of 4 remaining/ })).toBeVisible();
  expect(await names()).toEqual(finalOrder);
  expect((await setup.snapshot()).characters.find((character) => character.id === setup.id)!.resources).toEqual(edited.resources);
});

test('each custom tracker has a browser-local per-character orb preference without changing counters', async ({ page, request, context }) => {
  const setup = await fixture(request, guardians[1], 2);
  const tracked = { 'Moon marks': { max: 3, used: 1 }, 'Rune charges': { max: 2, used: 0 }, 'Sorcery Points': { max: 6, used: 2 } };
  setup.socket.emit('character:update', { characterId: setup.id, resources: tracked });
  setup.socket.emit('character:create', { name: 'Preference companion', race: 'Tiefling', className: 'Sorcerer', level: 20, maxHp: 40 });
  const companion = (await setup.snapshot()).characters.find((character) => character.name === 'Preference companion')!;
  setup.socket.emit('character:update', { characterId: companion.id, spellSlots: setup.saved.spellSlots, resources: tracked });
  const seeded = await setup.snapshot();
  const initial = seeded.characters.find((character) => character.id === setup.id)!;
  const companionInitial = seeded.characters.find((character) => character.id === companion.id)!;
  await join(page, setup);
  const dock = page.getByRole('region', { name: 'Character resources', exact: true });
  const trigger = dock.getByRole('button', { name: /^Additional resources/ });
  const drawer = dock.getByRole('region', { name: 'Additional resource trackers', exact: true });
  const record = page.locator('.character-window');
  const moon = record.getByRole('checkbox', { name: 'Show Moon marks beside the health orb', exact: true });
  const rune = record.getByRole('checkbox', { name: 'Show Rune charges beside the health orb', exact: true });
  const openRecord = () => page.locator('.hud-actions').getByRole('button', { name: 'Character', exact: true }).click();
  const closeRecord = () => record.getByRole('button', { name: 'Close character window', exact: true }).click();
  const names = () => dock.locator('.core-resource-rows [role="group"]').evaluateAll((elements) =>
    elements.map((element) => element.getAttribute('aria-label')!.split(':')[0]));
  const switchCharacter = async (name: string) => {
    await page.locator('.hud-actions').getByRole('button', { name: 'Party', exact: true }).click();
    await record.getByRole('button', { name: 'Change my character', exact: true }).click();
    await page.locator('.claim-row').filter({ hasText: name }).click();
    await expect(page.locator('.hud-identity')).toContainText(name);
  };
  const allRows = ['L1', 'L2', 'Sorcery Points', 'Moon marks', 'Rune charges'];
  expect(await names()).toEqual(allRows);
  await expect(trigger).toHaveCount(0);
  await openRecord();
  await expect(moon).toBeChecked();
  await expect(rune).toBeChecked();
  await expect(record.getByRole('checkbox', { name: /beside the health orb/ })).toHaveCount(2);
  await moon.uncheck();
  await expect(rune).toBeChecked();
  await closeRecord();
  for (const mode of ['compact', 'concentric'] as const) {
    await layout(page, mode, 85);
    expect(await names()).toEqual(['L1', 'L2', 'Sorcery Points', 'Rune charges']);
    await expect(trigger).toHaveAccessibleName('Additional resources (1)');
    await trigger.click();
    await expect(drawer.getByRole('group')).toHaveCount(1);
    await expect(drawer.getByRole('group', { name: 'Moon marks: 2 of 3 remaining', exact: true })).toBeVisible();
    await drawer.getByRole('button', { name: 'Close additional resources', exact: true }).click();
  }
  expect(counters((await setup.snapshot()).characters.find((character) => character.id === setup.id)!)).toEqual(counters(initial));

  // Presentation preferences cannot replace the original maximum/remaining editor.
  await trigger.click();
  await drawer.getByRole('button', { name: /^Moon marks: 2 of 3 remaining/ }).click();
  const editor = page.getByRole('form', { name: 'Adjust Moon marks', exact: true });
  await editor.getByLabel('Total maximum', { exact: true }).fill('4');
  await editor.getByLabel('Remaining', { exact: true }).fill('1');
  await editor.getByRole('button', { name: 'Apply correction', exact: true }).click();
  await expect(drawer.getByRole('group', { name: 'Moon marks: 1 of 4 remaining', exact: true })).toBeVisible();
  const edited = (await setup.snapshot()).characters.find((character) => character.id === setup.id)!;
  expect(edited.resources['Moon marks']).toMatchObject({ max: 4, used: 3, maxOverride: true });
  expect(edited.spellSlots).toEqual(initial.spellSlots);
  for (const name of ['Rune charges', 'Sorcery Points']) expect(edited.resources[name]).toEqual(initial.resources[name]);
  await page.reload();
  await expect(trigger).toHaveAccessibleName('Additional resources (1)');
  await openRecord();
  await expect(moon).not.toBeChecked();
  await expect(rune).toBeChecked();
  await closeRecord();

  // Identically named counters on another character start checked in this same browser.
  await switchCharacter('Preference companion');
  await expect(trigger).toHaveCount(0);
  expect(await names()).toEqual(allRows);
  await openRecord();
  await expect(moon).toBeChecked();
  await expect(rune).toBeChecked();
  await closeRecord();
  await switchCharacter(setup.guardian.name);
  await expect(trigger).toHaveAccessibleName('Additional resources (1)');
  await openRecord();
  await expect(moon).not.toBeChecked();
  await moon.check();
  await rune.uncheck();
  await closeRecord();
  expect(await names()).toEqual(['L1', 'L2', 'Sorcery Points', 'Moon marks']);
  await trigger.click();
  await expect(drawer.getByRole('group', { name: 'Rune charges: 2 of 2 remaining', exact: true })).toBeVisible();
  await drawer.getByRole('button', { name: 'Close additional resources', exact: true }).click();
  await openRecord();
  await rune.check();
  await closeRecord();
  await expect(trigger).toHaveCount(0);
  await expect(drawer).toHaveCount(0);
  expect(await names()).toEqual(allRows);
  expect(counters((await setup.snapshot()).characters.find((character) => character.id === setup.id)!)).toEqual(counters(edited));

  // A real last overflow row moving back into the rack while open closes the
  // drawer and removes its trigger; making it overflow again must start closed.
  setup.socket.emit('resource:set', { characterId: setup.id, group: 'resources', key: 'Rune charges', max: 25, preserveMax: true });
  await expect(trigger).toHaveAccessibleName('Additional resources (1)');
  await trigger.click();
  await expect(drawer).toBeVisible();
  setup.socket.emit('resource:set', { characterId: setup.id, group: 'resources', key: 'Rune charges', max: 2, preserveMax: true });
  await expect(trigger).toHaveCount(0);
  await expect(drawer).toHaveCount(0);
  setup.socket.emit('resource:set', { characterId: setup.id, group: 'resources', key: 'Rune charges', max: 25, preserveMax: true });
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await expect(drawer).toHaveCount(0);
  setup.socket.emit('resource:set', { characterId: setup.id, group: 'resources', key: 'Rune charges', max: 2, preserveMax: true });
  await expect(trigger).toHaveCount(0);
  expect(counters((await setup.snapshot()).characters.find((character) => character.id === companion.id)!)).toEqual(counters(companionInitial));

  const dmPage = await context.newPage();
  try {
    // New fixture characters are not automatically placed on the map. Give
    // this disposable character a token so the DM can select its actual sheet.
    const state = await setup.snapshot();
    setup.socket.emit('token:spawn', { mapId: state.activeMapId, kind: 'pc', refId: setup.id, x: 100, y: 100 });
    await setup.snapshot();
    await dmPage.goto(`/dm?code=${setup.code}`);
    await dmPage.locator('input[type=password]').fill(DM_SECRET);
    await dmPage.getByRole('button', { name: 'Rejoin as DM', exact: true }).click();
    await dmPage.locator('.init-row').filter({ hasText: setup.guardian.name }).click();
    await expect(dmPage.locator('.side.right .resources').filter({ hasText: 'Moon marks' }).first()).toBeVisible();
    await expect(dmPage.getByRole('checkbox', { name: /beside the health orb/ })).toHaveCount(0);
  } finally {
    await dmPage.close();
  }
});
