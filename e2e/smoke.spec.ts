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

test('the DM console rejects a wrong secret', async ({ page }) => {
  const code = await makeSession();
  await page.goto(`/dm?code=${code}`, { waitUntil: 'networkidle' });
  await page.fill('input[type=password]', 'definitely-wrong');
  await page.click('button:has-text("Rejoin as DM")');
  await expect(page.getByText(/Incorrect DM secret/i)).toBeVisible({ timeout: 10_000 });
});
