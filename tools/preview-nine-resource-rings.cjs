// Nine-tier visual evidence uses only a read-only backup of the preview DB.
// All fixture edits and claims are private to the temporary server on 4283.
const { chromium, expect } = require('@playwright/test');
const Database = require('better-sqlite3');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');
const { createHash } = require('node:crypto');
const root = path.resolve(__dirname, '..');
const sourceRoot = path.join(root, '.preview-review');
const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dnd-nine-rings-'));
const port = 4283;
const normal = process.argv.includes('--normal');
const tenRings = process.argv.includes('--ten-rings');
const allCharacters = process.argv.includes('--all-characters');
const resourcePreferences = process.argv.includes('--resource-preferences');
if (normal && tenRings) throw new Error('Choose original character resources or the seeded ten-ring demo, not both');
if (resourcePreferences && !normal) throw new Error('Resource preference evidence requires --normal; no seeded counters are used');
const evidencePrefix = normal ? 'current-character-resources' : `${tenRings ? 'ten' : 'nine'}-resource-rings`;
const evidence = path.join(root, 'preview-evidence', `${evidencePrefix}-${new Date().toISOString().replace(/[:.]/g, '-')}`);
const hash = (buffer) => createHash('sha256').update(buffer).digest('hex');
const sourceFingerprint = () => Object.fromEntries(['game.db', 'game.db-wal'].filter((name) => fs.existsSync(path.join(sourceRoot, name)))
  .map((name) => [name, hash(fs.readFileSync(path.join(sourceRoot, name)))]));
const maxima = [4, 3, 3, 3, 3, 2, 2, 1, 1];
const slots = Object.fromEntries(maxima.map((max, i) => [`L${i + 1}`, { max, used: i % 3 === 0 ? 1 : 0, maxOverride: true }]));
let child, browser;
(async () => {
  fs.mkdirSync(evidence, { recursive: true });
  const sourceBefore = sourceFingerprint();
  const source = new Database(path.join(sourceRoot, 'game.db'), { readonly: true });
  const session = source.prepare('SELECT id, code FROM sessions ORDER BY last_played_at DESC LIMIT 1').get();
  await source.backup(path.join(dataRoot, 'game.db'));
  source.close();
  fs.cpSync(path.join(sourceRoot, 'uploads'), path.join(dataRoot, 'uploads'), { recursive: true });
  const fixture = new Database(path.join(dataRoot, 'game.db'));
  const original = fixture.prepare('SELECT id, name, race, class_name, spell_slots, resources, level FROM characters WHERE session_id=? AND name IN (?, ?, ?)')
    .all(session.id, 'Druk', 'Vanec', 'Varis');
  expect(original).toHaveLength(3);
  fixture.exec('UPDATE characters SET claimed_by=NULL');
  for (const character of normal ? [] : original) {
    const counters = JSON.parse(character.resources);
    counters['Nine-ring QA marks'] = { max: 3, used: 1 };
    if (tenRings) {
      counters['Sorcery Points'] = { max: 6, used: 2 };
      counters['Action Surge'] = { max: 2, used: 1 };
      counters['Ki Points'] = { max: 25, used: 7 };
      counters['Channel Divinity'] = { max: 0, used: 0 };
    }
    fixture.prepare('UPDATE characters SET level=20, spell_slots=?, resources=? WHERE id=?')
      .run(JSON.stringify(slots), JSON.stringify(counters), character.id);
  }
  const seeded = fixture.prepare('SELECT id, spell_slots, resources, level FROM characters WHERE session_id=? ORDER BY id').all(session.id);
  fixture.close();
  child = spawn(process.execPath, ['--import', 'tsx', 'server/src/index.ts'], {
    cwd: root, windowsHide: true, stdio: 'ignore',
    env: { ...process.env, DATA_ROOT: dataRoot, DB_PATH: path.join(dataRoot, 'game.db'), PORT: String(port),
      DND_HOST: '127.0.0.1', DND_PREVIEW: '1', PUBLIC_URL: `http://127.0.0.1:${port}`, DM_PASSPHRASE: 'nine-ring-visual-only',
      GEMINI_API_KEY: '', OLLAMA_URL: 'http://127.0.0.1:1', COMFY_URL: 'http://127.0.0.1:1', AI_MODE: 'local' },
  });
  child.on('error', (error) => console.error(error));
  await expect.poll(async () => {
    try { return (await fetch(`http://127.0.0.1:${port}/api/health`)).ok; } catch { return false; }
  }, { timeout: 20000 }).toBe(true);
  const servedHtml = await (await fetch(`http://127.0.0.1:${port}/`)).text();
  const servedAssets = [];
  for (const [, url] of servedHtml.matchAll(/(?:src|href)="(\/assets\/[^" ]+)"/g)) {
    servedAssets.push({ url, sha256: hash(Buffer.from(await (await fetch(`http://127.0.0.1:${port}${url}`)).arrayBuffer())) });
  }
  browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 }, deviceScaleFactor: 2 });
  const errors = [], measurements = [], files = [], preferenceChecks = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${port}/join?code=${session.code}`);
  await page.getByRole('button', { name: 'Join', exact: true }).click();
  for (const name of normal && !allCharacters ? ['Vanec'] : ['Vanec', 'Druk', 'Varis']) {
    await page.locator('.claim-row').filter({ hasText: name }).click();
    await expect(page.locator('.hud-identity')).toContainText(name);
    await expect.poll(() => page.locator('.orb-holder').evaluate((image) => image.complete && image.naturalWidth > 0)).toBe(true);
    await page.evaluate(() => document.fonts.ready);
    await page.getByRole('button', { name: 'Interface settings', exact: true }).click();
    await page.getByLabel('Concentric arcs', { exact: true }).check();
    await page.getByRole('button', { name: 'Close interface settings', exact: true }).click();
    if (tenRings) await expect(page.locator('.orb-resource-dock')).toHaveAttribute('data-resource-rings', '10');
    else if (!normal) await expect.poll(async () => Number(await page.locator('.orb-resource-dock').getAttribute('data-resource-rings'))).toBeGreaterThanOrEqual(9);
    // Fill the lower corner with the copied map rather than fit-to-window's
    // black letterbox. This changes only the disposable browser's map viewport.
    await page.getByTitle('Zoom in', { exact: true }).click({ clickCount: 4 });
    for (const [width, height] of normal ? [[1366, 768]] : [[1366, 768], [1920, 1080]]) for (const scale of normal ? [85] : [85, 100]) {
      await page.setViewportSize({ width, height });
      await page.getByRole('button', { name: 'Interface settings', exact: true }).click();
      await page.locator('#player-ui-scale').fill(String(scale));
      await page.getByRole('button', { name: 'Close interface settings', exact: true }).click();
      await page.mouse.move(width / 2, 160);
      await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const measurement = await page.locator('.player-hud').evaluate((hud) => {
        const frame = hud.querySelector('.hud-orb-cluster'), orb = hud.querySelector('.main-orb').getBoundingClientRect();
        const frameBox = frame.getBoundingClientRect(), zoom = frameBox.width / parseFloat(getComputedStyle(frame).width);
        const cx = orb.x + orb.width / 2, cy = orb.y + orb.height / 2;
        const circles = [...hud.querySelectorAll('.curved-resource')].map((row) => {
          const radius = Number(/A\s*([\d.]+)/.exec(row.querySelector('.resource-arc-metal path').getAttribute('d'))[1]);
          return { radius, points: [...row.querySelectorAll('.resource-sigil-trigger, .resource-jewel')].map((element) => {
            const box = element.getBoundingClientRect(), x = box.x + box.width / 2, y = box.y + box.height / 2;
            return { label: element.getAttribute('aria-label'), x, y, width: box.width, height: box.height,
              radialError: Math.abs(Math.hypot(x - cx, y - cy) - radius * zoom),
              clickable: element.contains(document.elementFromPoint(x, y)) };
          }) };
        });
        const boxes = [...hud.querySelectorAll('.hud-orb-cluster, .hud-identity-line, .resource-dock-tools button, .core-resource-rows button')].map((element) => element.getBoundingClientRect());
        const top = Math.max(0, Math.min(...boxes.map((box) => box.top)) - 12);
        return { zoom, cx, cy, hudWidth: hud.getBoundingClientRect().width, circles,
          clip: { x: 0, y: top, width: Math.min(window.innerWidth, Math.ceil(Math.max(...boxes.map((box) => box.right))) + 12), height: window.innerHeight - top } };
      });
      if (tenRings) expect(measurement.circles).toHaveLength(10);
      else if (!normal) expect(measurement.circles.length).toBeGreaterThanOrEqual(9);
      for (const circle of measurement.circles) for (const point of circle.points) {
        expect(point.radialError, JSON.stringify({ name, width, scale, point })).toBeLessThan(1);
        expect(point.clickable, JSON.stringify({ name, width, scale, point })).toBe(true);
      }
      const basename = `${name.toLowerCase()}-${normal ? 'original-' : ''}${width}-${scale}`;
      const full = path.join(evidence, `${basename}-full.png`), corner = path.join(evidence, `${basename}-corner.png`);
      await page.screenshot({ path: full, animations: 'disabled' });
      await page.screenshot({ path: corner, animations: 'disabled', clip: measurement.clip });
      files.push(full, corner);
      measurements.push({ name, width, height, scale, ...measurement });
      console.log(JSON.stringify({ name, width, scale, full, corner }));
      if (tenRings) {
        await page.getByRole('button', { name: /^Additional resources/ }).click();
        const drawer = page.getByRole('region', { name: 'Additional resource trackers', exact: true });
        await expect(drawer).toBeVisible();
        await expect(drawer.getByRole('group', { name: 'Ki Points: 18 of 25 remaining', exact: true })).toBeVisible();
        const openedFull = path.join(evidence, `${basename}-drawer-full.png`);
        const openedCorner = path.join(evidence, `${basename}-drawer-corner.png`);
        const drawerBox = await drawer.boundingBox();
        const top = Math.max(0, Math.min(measurement.clip.y, drawerBox.y - 8));
        const right = Math.min(width, Math.max(measurement.clip.width, drawerBox.x + drawerBox.width + 8));
        await page.screenshot({ path: openedFull, animations: 'disabled' });
        await page.screenshot({ path: openedCorner, animations: 'disabled', clip: { x: 0, y: top, width: right, height: height - top } });
        files.push(openedFull, openedCorner);
        console.log(JSON.stringify({ name, width, scale, openedFull, openedCorner }));
        await drawer.getByRole('button', { name: 'Close additional resources', exact: true }).click();
      }
    }
    if (resourcePreferences && name === 'Vanec') {
      const character = original.find((item) => item.name === name);
      const storageKey = `dnd:player-custom-resource-overflow:v1:${character.id}`;
      const dock = page.getByRole('region', { name: 'Character resources', exact: true });
      const readPreference = () => page.evaluate((key) => localStorage.getItem(key), storageKey);
      const additional = dock.getByRole('button', { name: /^Additional resources/ });
      const inlineLabel = (resource) => dock.locator('.curved-resource').getByRole('button', { name: new RegExp(`^${resource}:`) });
      const openCharacter = async () => {
        await page.locator('.hud-actions').getByRole('button', { name: 'Character', exact: true }).click();
        const window = page.locator('.character-window');
        await expect(window).toBeVisible();
        await window.locator('.resources').scrollIntoViewIfNeeded();
        return window;
      };
      const captureResources = async (window, stage) => {
        const full = path.join(evidence, `vanec-resource-preferences-${stage}-full.png`);
        const section = path.join(evidence, `vanec-resource-preferences-${stage}-section.png`);
        await page.mouse.move(1200, 80);
        await page.screenshot({ path: full, animations: 'disabled' });
        await window.locator('.resources').screenshot({ path: section, animations: 'disabled' });
        files.push(full, section);
      };
      await expect(dock).toHaveAttribute('data-resource-rings', '6');
      await expect(additional).toHaveCount(0);
      await expect.poll(readPreference).toBe('[]');
      const before = await readPreference();
      let window = await openCharacter();
      const cloak = window.getByRole('checkbox', { name: 'Show Cloak Spell Slot beside the health orb', exact: true });
      const azuth = window.getByRole('checkbox', { name: "Show AZUTH'S Knowledge beside the health orb", exact: true });
      await expect(cloak).toBeChecked();
      await expect(azuth).toBeChecked();
      await expect(window.locator('.resources').getByRole('checkbox')).toHaveCount(2);
      await captureResources(window, 'both-checked');
      await cloak.uncheck();
      await expect(cloak).not.toBeChecked();
      await expect(azuth).toBeChecked();
      await expect.poll(readPreference).toBe(JSON.stringify(['Cloak Spell Slot']));
      await captureResources(window, 'cloak-unchecked');
      const whileUnchecked = await readPreference();
      await window.getByRole('button', { name: 'Close character window', exact: true }).click();
      await expect(dock).toHaveAttribute('data-resource-rings', '5');
      await expect(inlineLabel('Cloak Spell Slot')).toHaveCount(0);
      await expect(inlineLabel("AZUTH'S Knowledge")).toHaveCount(1);
      await expect(additional).toHaveAccessibleName('Additional resources (1)');
      await additional.click();
      const drawer = page.getByRole('region', { name: 'Additional resource trackers', exact: true });
      await expect(drawer.getByRole('button', { name: /^Cloak Spell Slot:/ })).toBeVisible();
      await expect(drawer.getByRole('button', { name: /^AZUTH'S Knowledge:/ })).toHaveCount(0);
      const full = path.join(evidence, 'vanec-resource-preferences-overflow-full.png');
      const corner = path.join(evidence, 'vanec-resource-preferences-overflow-corner.png');
      const bounds = await dock.locator('.custom-resource-drawer').boundingBox();
      const hud = await page.locator('.hud-bottom').boundingBox();
      const top = Math.max(0, bounds.y - 12);
      const right = Math.min(1366, Math.ceil(Math.max(bounds.x + bounds.width, hud.x + hud.width)) + 12);
      await page.mouse.move(680, 180);
      await page.screenshot({ path: full, animations: 'disabled' });
      await page.screenshot({ path: corner, animations: 'disabled', clip: { x: 0, y: top, width: right, height: 768 - top } });
      files.push(full, corner);
      await drawer.getByRole('button', { name: 'Close additional resources', exact: true }).click();
      window = await openCharacter();
      await window.getByRole('checkbox', { name: 'Show Cloak Spell Slot beside the health orb', exact: true }).check();
      await window.getByRole('button', { name: 'Close character window', exact: true }).click();
      await expect(dock).toHaveAttribute('data-resource-rings', '6');
      await expect(additional).toHaveCount(0);
      await expect(inlineLabel('Cloak Spell Slot')).toHaveCount(1);
      await expect(inlineLabel("AZUTH'S Knowledge")).toHaveCount(1);
      await expect.poll(readPreference).toBe(before);
      preferenceChecks.push({ name, storageKey, before, whileUnchecked, after: await readPreference(),
        changedOnly: 'Cloak Spell Slot', otherCustomRemainedInline: true,
        ringsBefore: 6, ringsWhileUnchecked: 5, ringsAfter: 6,
        overflowCountWhileUnchecked: 1, zeroOverflowButtonHiddenBeforeAndAfter: true,
        preferenceRestored: true, counterMutationRequested: false });
      console.log(JSON.stringify({ name, resourcePreferences: 'verified', full, corner }));
    }
    await page.getByTitle('Fit to window', { exact: true }).click();
    await page.locator('.hud-actions').getByRole('button', { name: 'Party', exact: true }).click();
    await page.getByRole('button', { name: 'Change my character', exact: true }).click();
  }
  const verify = new Database(path.join(dataRoot, 'game.db'), { readonly: true });
  const after = verify.prepare('SELECT id, spell_slots, resources, level FROM characters WHERE session_id=? ORDER BY id').all(session.id);
  verify.close();
  expect(after).toEqual(seeded);
  expect(errors).toEqual([]);
  const sourceAfter = sourceFingerprint();
  expect(sourceAfter).toEqual(sourceBefore);
  const result = { source: normal ? 'Read-only preview backup; original counters displayed only in disposable copy' : 'Read-only preview backup; level-20 nine-slot and class-resource examples exist only in disposable copy', tenRings, seededOverflow: tenRings ? ['Action Surge', 'Ki Points', 'Channel Divinity', 'Nine-ring QA marks'] : [], port, dataRoot, evidence, files, errors, servedAssets, sourceBefore, sourceAfter, sourceUnchanged: true, originalCharacters: original.map(({ name, race, class_name, level, spell_slots, resources }) => ({ name, race, className: class_name, originalLevel: level, spellSlots: JSON.parse(spell_slots), resources: JSON.parse(resources) })), seededSlots: normal ? null : slots, countersUnchangedByViewing: true, measurements };
  if (resourcePreferences) result.preferenceChecks = preferenceChecks;
  fs.writeFileSync(path.join(evidence, 'nine-ring-checks.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ evidence, screenshots: files.length, countersUnchangedByViewing: true, errors }));
})().catch((error) => { console.error(error); process.exitCode = 1; }).finally(async () => {
  if (browser) await browser.close();
  if (child) child.kill();
});
