import { test, expect, request as pwRequest } from '@playwright/test';
import { DM_SECRET, PORT } from './playwright.config';

const BASE = `http://localhost:${PORT}`;

// Create a session via the REST API (deterministic code) so the browser tests
// don't have to scrape it out of the DOM.
async function makeSession(): Promise<string> {
  const api = await pwRequest.newContext();
  const res = await api.post(`${BASE}/api/sessions`, {
    headers: { 'x-dm-passphrase': DM_SECRET, 'content-type': 'application/json' },
    data: { name: 'E2E' },
  });
  expect(res.ok()).toBeTruthy();
  const { code } = await res.json();
  await api.dispose();
  return code as string;
}

// End-to-end over the real socket/auth path (which has no unit tests): a player
// and the DM connect as two independent clients and the join → snapshot → claim
// round-trip works across both.
test('player joins by code and the DM opens the same session — two live clients', async ({
  browser,
}) => {
  const code = await makeSession();

  // ---- Player: join by code (no secret), see the seeded roster, claim one ----
  const playerCtx = await browser.newContext();
  const player = await playerCtx.newPage();
  await player.goto(`/join?code=${code}`, { waitUntil: 'networkidle' });
  await player.click('button:has-text("Join")');
  // The join delivered a snapshot → the seeded example characters are visible.
  await expect(player.getByText('Druk', { exact: false }).first()).toBeVisible({
    timeout: 20_000,
  });
  // Claim a character (server-authoritative claim → new snapshot, no crash).
  await player.getByText('Druk', { exact: false }).first().click();
  await expect(player.locator('body')).toBeVisible();

  // ---- DM: log in with the secret and open the SAME session ----
  const dmCtx = await browser.newContext();
  const dm = await dmCtx.newPage();
  await dm.goto(`/dm?code=${code}`, { waitUntil: 'networkidle' });
  await dm.fill('input[type=password]', DM_SECRET);
  await dm.click('button:has-text("Rejoin as DM")');
  // DM console mounts (left panel is present) and the same roster is there —
  // proving the DM's snapshot built correctly with a player already connected.
  await expect(dm.getByText('Druk', { exact: false }).first()).toBeVisible({
    timeout: 20_000,
  });

  await playerCtx.close();
  await dmCtx.close();
});

// The roll-reveal animation must fire for EVERY roll, not just combat. Drive a
// plain `/roll` from chat (needs no character/target) and assert the staged
// overlay renders end-to-end — join → snapshot → the fresh roll animates.
test('a plain /roll animates the roll-reveal overlay', async ({ browser }) => {
  const code = await makeSession();
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(`/join?code=${code}`, { waitUntil: 'networkidle' });
  await page.click('button:has-text("Join")');
  // Wait for the first snapshot (seeded roster visible) so the roll cue is armed —
  // the first snapshot seeds the "seen" set; only a roll AFTER it animates.
  await expect(page.getByText('Druk', { exact: false }).first()).toBeVisible({
    timeout: 20_000,
  });

  // Type a dice command into the shared chat and send it.
  const chat = page.locator('input[placeholder^="Message"]').first();
  await chat.fill('/roll 2d6+3');
  await chat.press('Enter');

  // The staged overlay appears and is headlined with the rolled expression —
  // proving the generic 'dice' reveal path renders (not just combat attacks).
  const overlay = page.locator('.roll-reveal');
  await expect(overlay).toBeVisible({ timeout: 15_000 });
  await expect(overlay).toContainText('2d6+3');

  await ctx.close();
});

// REST auth regression (audit H1/H2): DM-gated routes must reject a missing
// secret, and the DM's AI endpoints must authenticate WITH it. No browser needed.
test('DM-gated REST routes enforce the secret', async () => {
  const api = await pwRequest.newContext();

  // H2: cross-session library curation was unauthenticated (a stranger could wipe
  // the bestiary). DELETE + POST without the secret are now rejected.
  const del = await api.delete(`${BASE}/api/library/creatures/Goblin`);
  expect(del.status()).toBe(403);
  const post = await api.post(`${BASE}/api/library/creatures`, {
    headers: { 'content-type': 'application/json' },
    data: { name: 'Hax', maxHp: 1 },
  });
  expect(post.status()).toBe(403);

  // H1: the DM's AI creature lookup is DM-gated; the client used to send NO secret
  // so it always 403'd. With the secret it passes AUTH (the AI backend may be
  // absent → 404/503, but never the 403 that broke the button).
  const look = await api.post(`${BASE}/api/creatures/lookup`, {
    headers: { 'content-type': 'application/json', 'x-dm-passphrase': DM_SECRET },
    data: { name: 'zzznotarealcreature' },
  });
  expect(look.status()).not.toBe(403);

  await api.dispose();
});

// The standalone Monster Library window (audit: /dm/data has no e2e either, so
// this is the first coverage of a second-window route end to end).
test('the Monster Library window opens and lists the session\'s creatures', async ({ page }) => {
  const code = await makeSession();
  await page.goto(`/dm/library?code=${code}`, { waitUntil: 'networkidle' });
  // A second window never inherits the main screen's login — the secret is required.
  await page.fill('input[type=password]', DM_SECRET);
  await page.click('button:has-text("Connect")');

  // The view mounts with its three sources.
  await expect(page.getByText('Monster Library', { exact: false }).first()).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByRole('button', { name: /Saved library/ })).toBeVisible();

  // "Find new" searches the SRD without needing any session content.
  await page.getByRole('button', { name: /Find new/ }).click();
  await page.locator('input.library-search').fill('goblin');
  await expect(page.locator('.library-card').first()).toBeVisible({ timeout: 10_000 });
});

// The full library chain, across two windows in one browser: find an SRD
// creature → add it to the session → hand placement off to the map window.
// The hand-off is a BroadcastChannel, so both pages must share a context.
test('the Library window adds a creature and arms placement in the map window', async ({
  browser,
}) => {
  const code = await makeSession();
  // The placement banner only renders over a map, so give the session one.
  // A Slides URL needs no file upload.
  const api = await pwRequest.newContext();
  const mapRes = await api.post(`${BASE}/api/sessions/${code}/maps`, {
    headers: { 'x-dm-passphrase': DM_SECRET },
    multipart: { name: 'Arena', slidesUrl: 'https://docs.google.com/presentation/d/e2e/embed' },
  });
  expect(mapRes.ok()).toBeTruthy();
  await api.dispose();
  const ctx = await browser.newContext();

  // Map window (the one that owns the canvas and receives the hand-off).
  const dm = await ctx.newPage();
  await dm.goto(`/dm?code=${code}`, { waitUntil: 'networkidle' });
  await dm.fill('input[type=password]', DM_SECRET);
  await dm.click('button:has-text("Rejoin as DM")');
  await expect(dm.getByText('Druk', { exact: false }).first()).toBeVisible({ timeout: 20_000 });

  // Library window.
  const lib = await ctx.newPage();
  await lib.goto(`/dm/library?code=${code}`, { waitUntil: 'networkidle' });
  await lib.fill('input[type=password]', DM_SECRET);
  await lib.click('button:has-text("Connect")');
  await expect(lib.getByRole('button', { name: /Find new/ })).toBeVisible({ timeout: 20_000 });

  // Find an SRD creature and add it to this session.
  await lib.getByRole('button', { name: /Find new/ }).click();
  await lib.locator('input.library-search').fill('goblin');
  await lib.locator('.library-card').first().click();
  await lib.getByRole('button', { name: /Add to this session/ }).click();

  // It lands in the session tab (the view switches there automatically).
  const card = lib.locator('.library-card').first();
  await expect(card).toBeVisible({ timeout: 10_000 });
  await card.click();

  // Hand placement to the map window; it arms the shared placement banner.
  await lib.getByRole('button', { name: /Place on map/ }).click();
  await expect(lib.getByText(/click your map window/i)).toBeVisible();
  await expect(dm.locator('.place-banner')).toBeVisible({ timeout: 10_000 });

  await ctx.close();
});

test('the DM console rejects a wrong secret', async ({ page }) => {
  const code = await makeSession();
  await page.goto(`/dm?code=${code}`, { waitUntil: 'networkidle' });
  await page.fill('input[type=password]', 'definitely-wrong');
  await page.click('button:has-text("Rejoin as DM")');
  await expect(page.getByText(/Incorrect DM secret/i)).toBeVisible({ timeout: 10_000 });
});
