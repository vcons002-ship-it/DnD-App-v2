// Visual QA uses a disposable copy of the PREVIEW database. Never claim the
// character currently being reviewed by the user, or send test rolls to it.
const { chromium, expect } = require('@playwright/test');
const Database = require('better-sqlite3');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const sourceRoot = path.join(root, '.preview-review');
const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dnd-layout-qa-'));
const evidence = path.join(root, 'preview-evidence', 'revision-13');
const port = 4281;
const hudOnly = process.argv.includes('--hud-only');
let child, browser;
(async () => {
  fs.mkdirSync(evidence, { recursive: true });
  const source = new Database(path.join(sourceRoot, 'game.db'), { readonly: true });
  const { id: sessionId, code } = source.prepare('SELECT id, code FROM sessions ORDER BY last_played_at DESC LIMIT 1').get();
  await source.backup(path.join(dataRoot, 'game.db'));
  source.close();
  fs.cpSync(path.join(sourceRoot, 'uploads'), path.join(dataRoot, 'uploads'), { recursive: true });
  // Transient claims in a copied DB are unrelated to QA browser connections.
  const fixture = new Database(path.join(dataRoot, 'game.db'));
  fixture.exec('UPDATE characters SET claimed_by = NULL');
  // Seed the shield state only after the read-only source backup has closed.
  // This connection is exclusively the new disposable QA database.
  const seededTempHp = fixture.prepare('UPDATE characters SET temp_hp = ? WHERE session_id = ? AND name IN (?, ?, ?)')
    .run(12, sessionId, 'Druk', 'Vanec', 'Varis').changes;
  expect(seededTempHp).toBe(3);
  fixture.close();
  child = spawn(process.execPath, ['--import', 'tsx', 'server/src/index.ts'], {
    cwd: root, windowsHide: true, stdio: 'ignore',
    env: { ...process.env, DATA_ROOT: dataRoot, DB_PATH: path.join(dataRoot, 'game.db'), PORT: String(port), DND_HOST: '127.0.0.1', DND_PREVIEW: '1', PUBLIC_URL: `http://127.0.0.1:${port}`, DM_PASSPHRASE: 'isolated-layout-qa', GEMINI_API_KEY: '', OLLAMA_URL: 'http://127.0.0.1:1', COMFY_URL: 'http://127.0.0.1:1' },
  });
  child.on('error', (error) => console.error(error));
  await expect.poll(async () => {
    try { return (await fetch(`http://127.0.0.1:${port}/api/health`)).ok; } catch { return false; }
  }, { timeout: 20000 }).toBe(true);
  browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 }, deviceScaleFactor: 2 });
  const capture = (file) => page.screenshot({ path: path.join(evidence, file), animations: 'disabled' });
  const captureCorner = async (file) => {
    const clip = await page.locator('.player-hud').evaluate((element) => {
      const boxes = [...element.querySelectorAll('.hud-bottom, .hud-identity-line, .resource-dock-tools, .hud-status-strip, .core-resource-rows button')].map((el) => el.getBoundingClientRect());
      const y = Math.max(0, Math.min(...boxes.map((box) => box.y)) - 12);
      const bottom = Math.min(window.innerHeight, Math.max(...boxes.map((box) => box.bottom)) + 3);
      return { x: 0, y, width: Math.ceil(Math.max(...boxes.map((box) => box.right))) + 10, height: bottom - y };
    });
    return page.screenshot({ path: path.join(evidence, file), animations: 'disabled', clip });
  };
  const inspectTemporaryShield = async (name) => {
    await expect(page.locator('.temp-vessel')).toHaveCount(0);
    await expect(page.locator('.main-orb .orb-temp-shield')).toBeVisible();
    await expect(page.locator('.orb-temp-bonus')).toHaveText('+12');
    const result = await page.locator('.health-reliquary').evaluate((health) => {
      const globeElement = health.querySelector('.main-orb');
      const shieldElement = globeElement.querySelector('.orb-temp-shield');
      const bonus = health.querySelector('.orb-temp-bonus');
      const globe = globeElement.getBoundingClientRect();
      const shield = shieldElement.getBoundingClientRect();
      const hit = document.elementFromPoint(globe.x + globe.width / 2, globe.y + globe.height / 2);
      const box = (rect) => ({ x: rect.x, y: rect.y, width: rect.width, height: rect.height });
      return {
        globe: box(globe), shield: box(shield),
        shieldPointerEvents: getComputedStyle(shieldElement).pointerEvents,
        bonusColor: getComputedStyle(bonus).color,
        healthOwnsHit: hit?.closest('.health-reliquary') === health,
        shieldOwnsHit: shieldElement === hit || shieldElement.contains(hit),
      };
    });
    expect(result.shield.x, `${name}: shield extends left of globe`).toBeGreaterThanOrEqual(result.globe.x - .75);
    expect(result.shield.y, `${name}: shield extends above globe`).toBeGreaterThanOrEqual(result.globe.y - .75);
    expect(result.shield.x + result.shield.width, `${name}: shield extends right of globe`).toBeLessThanOrEqual(result.globe.x + result.globe.width + .75);
    expect(result.shield.y + result.shield.height, `${name}: shield extends below globe`).toBeLessThanOrEqual(result.globe.y + result.globe.height + .75);
    expect(result.shieldPointerEvents).toBe('none');
    expect(result.healthOwnsHit).toBe(true);
    expect(result.shieldOwnsHit).toBe(false);
    const [red, green, blue] = result.bonusColor.match(/[\d.]+/g).map(Number);
    expect(blue, `${name}: temporary HP bonus must be blue`).toBeGreaterThan(red + 15);
    expect(green, `${name}: temporary HP bonus must be blue/cyan`).toBeGreaterThan(red + 15);
    return result;
  };
  const setFixtureTempHp = async (amount) => {
    // The real health button and unchanged controls are exercised only on the
    // disposable QA server. No direct browser-store mutation or live writes.
    await page.locator('.health-reliquary').click();
    const controls = page.getByRole('region', { name: 'Health controls', exact: true });
    await expect(controls).toBeVisible();
    await expect(controls.getByRole('button', { name: 'Damage', exact: true })).toBeVisible();
    await expect(controls.getByRole('button', { name: 'Heal', exact: true })).toBeVisible();
    await expect(controls.getByRole('button', { name: 'Temp HP', exact: true })).toBeVisible();
    await controls.locator('.dmg-row input').fill(String(amount));
    await controls.getByRole('button', { name: 'Temp HP', exact: true }).click();
    if (amount === 0) {
      await expect(page.locator('.orb-temp-shield')).toHaveCount(0);
      await expect(page.locator('.orb-temp-bonus')).toHaveCount(0);
    } else {
      await expect(page.locator('.orb-temp-bonus')).toHaveText(`+${amount}`);
    }
    await controls.getByRole('button', { name: 'Close', exact: true }).click();
  };
  const readStableHudGeometry = () => page.locator('.player-hud').evaluate((hud) => {
    const box = (element) => {
      const rect = element.getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    };
    return {
      hud: box(hud.querySelector('.hud-bottom')),
      globe: box(hud.querySelector('.main-orb')),
      sculpture: box(hud.querySelector('.hud-orb-cluster')),
      identity: box(hud.querySelector('.hud-identity-line')),
      armor: box(hud.querySelector('.hud-armor')),
      realHp: hud.querySelector('.orb-readout > strong').textContent,
      resources: [...hud.querySelectorAll('.core-resource-rows button')].map((element) => ({ label: element.getAttribute('aria-label'), ...box(element) })),
    };
  });
  const errors = [], sizes = [], resourceCircles = [], temporaryHp = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${port}/join?code=${code}`);
  await page.getByRole('button', { name: 'Join', exact: true }).click();
  for (const name of ['Druk', 'Vanec', 'Varis']) {
    await page.locator('.claim-row').filter({ hasText: name }).click();
    await expect(page.locator('.hud-identity')).toContainText(name);
    await expect.poll(() => page.locator('.orb-holder').evaluate((el) => el.complete && el.naturalWidth > 0)).toBe(true);
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(450);
    for (const [width, height, label] of [[1366, 768, 'laptop'], [1920, 1080, 'desktop']]) {
      await page.setViewportSize({ width, height });
      await capture(`${name.toLowerCase()}-${label}.png`);
      const hud = await page.locator('.hud-bottom').boundingBox();
      const combat = await page.locator('.player-combat').boundingBox();
      expect(hud.height).toBeLessThanOrEqual(224);
      expect(hud.width).toBeLessThanOrEqual(474);
      const shield = await inspectTemporaryShield(name);
      await expect(page.locator('.player-combat .resources')).toHaveCount(0);
      expect(combat.x + combat.width).toBeGreaterThan(width - 8);
      expect((await page.locator('.stage-controls').boundingBox()).x).toBeLessThan(100);
      const overflow = await page.locator('.player-combat .floating-panel-content').evaluate((el) => el.scrollWidth > el.clientWidth + 1);
      expect(overflow).toBe(false);
      sizes.push({ name, width, height, hud, combat, shield });
    }
    await page.setViewportSize({ width: 1366, height: 768 });
    await captureCorner(`${name.toLowerCase()}-compact-corner.png`);
    await page.getByRole('button', { name: 'Interface settings', exact: true }).click();
    await page.getByLabel('Concentric arcs', { exact: true }).check();
    await page.getByRole('button', { name: 'Close interface settings', exact: true }).click();
    await page.mouse.move(650, 200);
    const circleAudit = await page.locator('.player-hud').evaluate((hud) => {
      const globe = hud.querySelector('.main-orb').getBoundingClientRect();
      const frame = hud.querySelector('.hud-orb-cluster');
      const frameBox = frame.getBoundingClientRect();
      const scale = frameBox.width / parseFloat(getComputedStyle(frame).width);
      const cx = globe.x + globe.width / 2, cy = globe.y + globe.height / 2;
      return [...hud.querySelectorAll('.curved-resource')].map((row) => {
        const radius = Number(row.querySelector('.resource-arc-metal path').getAttribute('d').match(/A([\d.]+)/)[1]) * scale;
        const points = [...row.querySelectorAll('.resource-sigil-trigger, .resource-jewel')].map((element) => {
          const rect = element.getBoundingClientRect();
          const x = rect.x + rect.width / 2, y = rect.y + rect.height / 2;
          return { label: element.getAttribute('aria-label'), x, y, radialError: Math.abs(Math.hypot(x - cx, y - cy) - radius), ...(element.classList.contains('resource-sigil-trigger') ? { baselineFromBottom: (frameBox.bottom - y) / scale } : {}) };
        });
        return { radius, cx, cy, points };
      });
    });
    for (const circle of circleAudit) for (const point of circle.points) {
      expect(point.radialError).toBeLessThan(1);
      if (point.baselineFromBottom !== undefined) expect(Math.abs(point.baselineFromBottom - 42)).toBeLessThan(.75);
    }
    resourceCircles.push({ name, circles: circleAudit });
    await capture(`${name.toLowerCase()}-concentric.png`);
    await captureCorner(`${name.toLowerCase()}-concentric-corner.png`);
    // Fit-to-window can letterbox the map behind the HUD. Zoom this disposable
    // QA viewport only so transparency is reviewed over actual map pixels.
    await page.getByTitle('Zoom in', { exact: true }).click({ clickCount: 4 });
    await page.waitForTimeout(250);
    await captureCorner(`${name.toLowerCase()}-map-through-corner.png`);
    await capture(`${name.toLowerCase()}-map-through.png`);
    const activeShield = await inspectTemporaryShield(name);
    const activeGeometry = await readStableHudGeometry();
    await captureCorner(`${name.toLowerCase()}-temp-shield-active-corner.png`);
    await capture(`${name.toLowerCase()}-temp-shield-active.png`);
    await setFixtureTempHp(0);
    await expect(page.locator('.temp-vessel')).toHaveCount(0);
    const zeroGeometry = await readStableHudGeometry();
    expect(zeroGeometry, `${name}: temporary HP removal changed HUD/resource geometry or real HP`).toEqual(activeGeometry);
    await captureCorner(`${name.toLowerCase()}-temp-shield-zero-corner.png`);
    await capture(`${name.toLowerCase()}-temp-shield-zero.png`);
    await setFixtureTempHp(12);
    await inspectTemporaryShield(name);
    const restoredGeometry = await readStableHudGeometry();
    expect(restoredGeometry, `${name}: temporary HP restoration changed HUD/resource geometry or real HP`).toEqual(activeGeometry);
    temporaryHp.push({ name, activeAmount: 12, zeroAmount: 0, restoredAmount: 12, activeShield, activeGeometry, zeroGeometry, restoredGeometry });
    await page.getByTitle('Fit to window', { exact: true }).click();
    await page.getByRole('button', { name: 'Interface settings', exact: true }).click();
    await page.getByLabel('Compact rows', { exact: true }).check();
    await page.getByRole('button', { name: 'Close interface settings', exact: true }).click();
    await page.locator('.hud-actions').getByRole('button', { name: 'Inventory', exact: true }).hover();
    await capture(`${name.toLowerCase()}-icon-tooltip.png`);
    if (name === 'Vanec' && !hudOnly) {
      await page.locator('.jewel-label button').first().click();
      await expect(page.getByLabel('Total maximum', { exact: true })).toBeInViewport();
      await capture('resource-adjust.png');
      await page.getByRole('button', { name: 'Cancel', exact: true }).click();
      await page.locator('.hud-actions').getByRole('button', { name: 'Checks', exact: true }).click();
      await expect(page.locator('.compact-checks')).toBeVisible();
      await page.mouse.move(650, 200);
      await capture('compact-skills.png');
      await page.locator('.compact-checks').getByRole('tab', { name: 'Stats', exact: true }).click();
      await capture('compact-stats.png');
      await page.locator('.compact-checks').getByRole('button', { name: /^Strength.*Choose check or save/ }).click();
      await capture('stat-save-choice.png');
      await page.keyboard.press('Escape');
      await page.getByRole('region', { name: 'Quick skill checks', exact: true }).getByRole('button', { name: 'Close', exact: true }).click();
      await page.getByRole('button', { name: 'Interface settings', exact: true }).click();
      await capture('interface-settings.png');
      await page.getByRole('button', { name: 'Close interface settings', exact: true }).click();
      await page.locator('.resource-title').click();
      await capture('resources-expanded.png');
      await page.locator('.resource-title').click();
      await page.getByRole('group', { name: 'Active conditions', exact: true }).getByRole('button').first().click();
      await expect(page.getByRole('dialog', { name: 'Conditions', exact: true })).toBeVisible();
      await capture('conditions.png');
      await page.getByRole('dialog', { name: 'Conditions', exact: true }).getByRole('button', { name: 'Close', exact: true }).click();
      await page.setViewportSize({ width: 860, height: 736 });
      await capture('vanec-narrow.png');
      await page.getByRole('button', { name: 'More dice', exact: true }).click();
      await capture('dice-picker-narrow.png');
      await page.keyboard.press('Escape');
      await page.setViewportSize({ width: 1366, height: 768 });
      // This is the disposable QA copy only. Capture the existing area-spell
      // apply control in the common damage dock without hitting any target.
      await page.locator('.compact-player-combat .combat-ability-row').getByRole('button', { name: /Fireball/ }).click();
      await expect(page.locator('.roll-reveal')).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(page.locator('.player-damage-dock')).toContainText('Fireball');
      await page.getByRole('button', { name: 'Open chat and roll log', exact: true }).click();
      await capture('spell-damage-dock.png');
      await page.locator('.player-damage-dock').getByRole('button', { name: 'Close', exact: true }).click();
      await page.getByRole('button', { name: 'Collapse chat and roll log', exact: true }).click();
    }
    if (name === 'Druk' && !hudOnly) {
      const before = await page.locator('.player-combat').boundingBox();
      await page.locator('.player-chat header button').click();
      expect(await page.locator('.player-combat').boundingBox()).toEqual(before);
      for (const [expr, mode, file] of [['1d20', 'adv', 'advantage'], ['2d6+1d4+3', 'dis', 'disadvantage-mixed'], ['1d100', 'adv', 'advantage-percentile']]) {
        await page.locator('.chat-input input').fill(`/roll ${expr} ${mode}`);
        await page.locator('.chat-input input').press('Enter');
        const compare = page.locator('.rr-comparison');
        await expect(compare.locator('[data-result="kept"]')).toHaveCount(1);
        await expect(compare.locator('[data-result="discarded"]')).toHaveCount(1);
        await expect(compare.locator('canvas:not([data-orientation="face-forward"])')).toHaveCount(0);
        await capture(`${file}.png`);
        await page.locator('.roll-reveal').click();
      }
      await page.locator('.player-chat header button').click();
    }
    await page.locator('.hud-actions').getByRole('button', { name: 'Party', exact: true }).click();
    await page.getByRole('button', { name: 'Change my character' }).click();
  }
  expect(errors).toEqual([]);
  const result = { source: 'read-only preview copy; no live campaign access', dataRoot, seededTempHp: { characters: seededTempHp, amount: 12, destination: 'disposable copied database only' }, errors, sizes, resourceCircles, temporaryHp };
  fs.writeFileSync(path.join(evidence, 'layout-checks.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
})().catch((error) => { console.error(error); process.exitCode = 1; }).finally(async () => {
  if (browser) await browser.close();
  // Only our own disposable QA child, never the preview or campaign service.
  if (child) child.kill();
});
