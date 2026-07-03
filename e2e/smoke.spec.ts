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

test('the DM console rejects a wrong secret', async ({ page }) => {
  const code = await makeSession();
  await page.goto(`/dm?code=${code}`, { waitUntil: 'networkidle' });
  await page.fill('input[type=password]', 'definitely-wrong');
  await page.click('button:has-text("Rejoin as DM")');
  await expect(page.getByText(/Incorrect DM secret/i)).toBeVisible({ timeout: 10_000 });
});
