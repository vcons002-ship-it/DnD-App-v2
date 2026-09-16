import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { io, type Socket } from 'socket.io-client';
import type { Character, StateSnapshot } from '../shared/types';
import { DM_SECRET, PORT } from './playwright.config';

const STORAGE_KEY = 'dnd:player-layout:v1';
const connections: Socket[] = [];
const guardians = [
  { race: 'Half-Orc', className: 'Fighter', art: 'half-orc-fighter-v9.png' },
  { race: 'Tiefling', className: 'Sorcerer', art: 'tiefling-sorcerer-v6.png' },
  { race: 'Half-Elf', className: 'Ranger', art: 'half-elf-ranger-v7.png' },
];

test.afterEach(() => connections.splice(0).forEach((socket) => socket.disconnect()));

// All session/character writes are confined to the existing E2E config's
// throwaway database. No campaign copy or production process is involved.
async function fixture(request: APIRequestContext, guardian = guardians[0]) {
  const response = await request.post('/api/sessions', {
    headers: { 'x-dm-passphrase': DM_SECRET }, data: { name: 'Player layout defaults regression' },
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
  const name = 'Layout preview actor';
  socket.emit('character:create', { name, race: guardian.race, className: guardian.className, level: 6, maxHp: 40 });
  const id = (await snapshot()).characters.find((character) => character.name === name)!.id;
  socket.emit('character:update', {
    characterId: id, spellSlots: {}, resources: { 'Layout test charges': { max: 3, used: 1 } },
  });
  const saved = (await snapshot()).characters.find((character) => character.id === id)!;
  return { code, name, id, guardian, saved, snapshot };
}

async function enter(page: Page, setup: Awaited<ReturnType<typeof fixture>>) {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto(`/join?code=${setup.code}`);
  await page.getByRole('button', { name: 'Join', exact: true }).click();
  await page.locator('.claim-row').filter({ hasText: setup.name }).click();
  await expect(page.getByTestId('player-hud')).toBeVisible();
}

async function seedPreference(page: Page, stored: string) {
  await page.addInitScript(({ key, value }) => {
    // Seed only the first document so reload verifies the app's persisted
    // choice rather than silently replacing it with the test input again.
    if (sessionStorage.getItem('layout-defaults-seeded')) return;
    localStorage.setItem(key, value);
    sessionStorage.setItem('layout-defaults-seeded', 'yes');
  }, { key: STORAGE_KEY, value: stored });
}

const counters = (character: Character) => ({ spellSlots: character.spellSlots, resources: character.resources });

for (const guardian of guardians) {
  test(`new player defaults to concentric resources and current ${guardian.className} guardian art`, async ({ page, request }) => {
    const setup = await fixture(request, guardian);
    await enter(page, setup);
    await expect(page.locator('.player-fantasy')).toHaveClass(/resource-layout-concentric/);
    await expect(page.locator('.concentric-resource-rows .curved-resource')).toHaveCount(1);
    await expect(page.locator('.compact-resource-rows')).toHaveCount(0);
    await expect(page.locator('.resource-gem-art')).toHaveCount(3);
    await expect(page.locator('.orb-holder')).toHaveAttribute('src', `/art/hud/${guardian.art}`);
    await expect.poll(() => page.locator('.orb-holder').evaluate((image) =>
      (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0)).toBe(true);
    await expect(page.locator('.hud-branch-art')).toHaveAttribute('src', '/art/hud/resource-branch-v4.png');
    await expect(page.locator('.main-orb .liquid-orb-effects')).toBeVisible();
    await expect(page.locator('.hud-actions button')).toHaveCount(5);
    await expect(page.locator('.side.left')).toHaveCount(0);
    await expect(page.locator('.player-combat')).toBeInViewport();
    await expect.poll(() => page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).resourceLayout, STORAGE_KEY)).toBe('concentric');
    expect(counters((await setup.snapshot()).characters.find((character) => character.id === setup.id)!)).toEqual(counters(setup.saved));
  });
}

for (const sample of [
  { name: 'older preferences without a resource layout', value: JSON.stringify({ scale: .9 }) },
  { name: 'an unknown resource layout', value: JSON.stringify({ resourceLayout: 'obsolete', scale: .9 }) },
  { name: 'malformed saved JSON', value: '{broken' },
]) {
  test(`${sample.name} falls back to concentric resources`, async ({ page, request }) => {
    await seedPreference(page, sample.value);
    const setup = await fixture(request);
    await enter(page, setup);
    await expect(page.locator('.player-fantasy')).toHaveClass(/resource-layout-concentric/);
    await expect(page.locator('.concentric-resource-rows .curved-resource')).toHaveCount(1);
    await page.getByRole('button', { name: 'Interface settings', exact: true }).click();
    await expect(page.getByLabel('Concentric arcs', { exact: true })).toBeChecked();
    await expect(page.locator('.player-layout-options output')).toHaveText(sample.value === '{broken' ? '85%' : '90%');
  });
}

test('an explicit compact preference survives reload and reset restores concentric defaults', async ({ page, request }) => {
  await seedPreference(page, JSON.stringify({ resourceLayout: 'compact', scale: .9, combat: { width: 350, height: 430 } }));
  const setup = await fixture(request);
  await enter(page, setup);
  await expect(page.locator('.player-fantasy')).toHaveClass(/resource-layout-compact/);
  await expect(page.locator('.compact-resource-rows .jewel-row')).toHaveCount(1);
  await expect(page.locator('.concentric-resource-rows')).toHaveCount(0);
  await page.reload();
  await expect(page.getByTestId('player-hud')).toBeVisible();
  await expect(page.locator('.player-fantasy')).toHaveClass(/resource-layout-compact/);
  await page.getByRole('button', { name: 'Interface settings', exact: true }).click();
  await expect(page.getByLabel('Compact rows', { exact: true })).toBeChecked();
  await expect(page.locator('.player-layout-options output')).toHaveText('90%');
  await expect(page.getByRole('spinbutton', { name: 'Combat width', exact: true })).toHaveValue('350');
  await page.getByRole('button', { name: 'Reset interface layout', exact: true }).click();
  await expect(page.getByLabel('Concentric arcs', { exact: true })).toBeChecked();
  await expect(page.locator('.player-layout-options output')).toHaveText('85%');
  await expect(page.getByRole('spinbutton', { name: 'Combat width', exact: true })).toHaveValue('320');
  await page.reload();
  await expect(page.locator('.player-fantasy')).toHaveClass(/resource-layout-concentric/);
  await expect(page.locator('.concentric-resource-rows .curved-resource')).toHaveCount(1);
  expect(counters((await setup.snapshot()).characters.find((character) => character.id === setup.id)!)).toEqual(counters(setup.saved));
});
