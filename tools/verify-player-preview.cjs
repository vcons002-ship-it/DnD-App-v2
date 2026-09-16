const { chromium, expect } = require('@playwright/test');
const Database = require('better-sqlite3');
const fs = require('node:fs');
const path = require('node:path');
// This harness refuses any database outside this checkout's preview sandbox.
const root = path.resolve(__dirname, '..');
const db = new Database(path.join(root, '.preview-review/game.db'), {
  readonly: true,
});
const session = db
  .prepare('SELECT code FROM sessions ORDER BY last_played_at DESC LIMIT 1')
  .get();
const evidence = path.join(root, 'preview-evidence');
fs.mkdirSync(evidence, { recursive: true });
(async () => {
  const browser = await chromium.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: true,
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`http://127.0.0.1:4276/join?code=${session.code}`);
  await page.getByRole('button', { name: 'Join', exact: true }).click();
  await page.locator('.claim-row').filter({ hasText: 'Druk' }).click();
  await page.locator('[data-testid="player-hud"]').waitFor();
  await page.waitForTimeout(1200);
  await page.screenshot({ path: path.join(evidence, 'druk-desktop.png') });
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.screenshot({ path: path.join(evidence, 'druk-laptop.png') });
  const vitality = db
    .prepare(
      'SELECT cur_hp, temp_hp FROM characters WHERE session_id=(SELECT id FROM sessions WHERE code=?) AND name=?',
    )
    .get(session.code, 'Druk');
  await page.locator('.health-reliquary').click();
  const health = page.getByRole('region', { name: 'Health and conditions' });
  const amount = health.locator('.dmg-row input');
  // Exercise the real manual controls on the copy, then restore both pools.
  await amount.fill('0');
  await health.getByRole('button', { name: 'Temp HP', exact: true }).click();
  const damage = Math.min(20, Math.floor(vitality.cur_hp / 2));
  await amount.fill(String(damage));
  await health.getByRole('button', { name: 'Damage', exact: true }).click();
  await expect(page.locator('.orb-readout strong')).toHaveText(
    String(vitality.cur_hp - damage),
  );
  await amount.fill('12');
  await health.getByRole('button', { name: 'Temp HP', exact: true }).click();
  await expect(page.locator('.temp-vessel')).toHaveAttribute(
    'aria-label',
    '12 temporary HP. Edit temporary HP.',
  );
  await health.getByRole('button', { name: 'Close', exact: true }).click();
  await page.waitForTimeout(700);
  await page.screenshot({
    path: path.join(evidence, 'druk-hp-and-temp-liquid.png'),
  });
  await page.locator('.health-reliquary').click();
  await amount.fill(String(damage));
  await health.getByRole('button', { name: 'Heal', exact: true }).click();
  await amount.fill(String(vitality.temp_hp));
  await health.getByRole('button', { name: 'Temp HP', exact: true }).click();
  await expect(page.locator('.orb-readout strong')).toHaveText(
    String(vitality.cur_hp),
  );
  await health.getByRole('button', { name: 'Close', exact: true }).click();
  await page
    .locator('.hud-actions')
    .getByRole('button', { name: 'Inventory', exact: true })
    .click();
  await page.screenshot({ path: path.join(evidence, 'inventory-laptop.png') });
  await page.getByRole('button', { name: 'Close character window' }).click();
  await page.locator('.player-chat header button').click();
  await expect(page.locator('.chat-input input')).toBeInViewport();
  await page.screenshot({ path: path.join(evidence, 'chat-laptop.png') });
  await page.locator('.chat-dice-options summary').click();
  const dice = [];
  for (const sides of [4, 6, 8, 10, 12, 20, 100]) {
    await page
      .locator('.player-chat .dice-quick')
      .getByRole('button', { name: `d${sides}`, exact: true })
      .click();
    await page.locator('.roll-reveal .three-die').first().waitFor();
    await expect(
      page.locator('.roll-reveal canvas[aria-label*="rolling"]'),
    ).toHaveCount(0);
    await page.waitForTimeout(300);
    const result = db
      .prepare(
        'SELECT total FROM roll_log WHERE session_id = (SELECT id FROM sessions WHERE code = ?) ORDER BY created_at DESC LIMIT 1',
      )
      .get(session.code);
    const rendered = await page
      .locator('.roll-reveal canvas')
      .evaluateAll((els) =>
        els.map((e) => ({
          sides: Number(e.dataset.sides),
          value: Number(e.dataset.value),
        })),
      );
    const shown =
      sides === 100
        ? rendered[0].value + rendered[1].value || 100
        : rendered[0].value;
    expect(shown).toBe(result.total);
    dice.push({ sides, rendered, serverTotal: result.total });
    await page.screenshot({ path: path.join(evidence, `dice-d${sides}.png`) });
    await page.locator('.roll-reveal').click();
  }
  await page.locator('.player-chat header button').click();
  const characters = [];
  for (const name of ['Vanec', 'Varis']) {
    await page
      .locator('.hud-actions')
      .getByRole('button', { name: 'Party', exact: true })
      .click();
    await page.getByRole('button', { name: 'Change my character' }).click();
    await page.locator('.claim-row').filter({ hasText: name }).click();
    await expect(page.locator('.hud-identity')).toContainText(name);
    await page.waitForTimeout(350);
    const art = await page.locator('.orb-holder').getAttribute('src');
    characters.push({ name, art });
    await page.screenshot({
      path: path.join(evidence, `${name.toLowerCase()}-laptop.png`),
    });
    await page
      .locator('.hud-actions')
      .getByRole('button', { name: 'Spellbook', exact: true })
      .click();
    await page.screenshot({
      path: path.join(evidence, `${name.toLowerCase()}-spellbook.png`),
    });
    await page.getByRole('button', { name: 'Close character window' }).click();
    if (name === 'Vanec') {
      const row = page
        .locator('.jewel-row')
        .filter({ has: page.getByRole('button', { name: /^Level 1/ }) });
      const id = db
        .prepare(
          'SELECT id FROM characters WHERE session_id=(SELECT id FROM sessions WHERE code=?) AND name=?',
        )
        .get(session.code, name).id;
      const original = JSON.parse(
        db.prepare('SELECT spell_slots FROM characters WHERE id=?').get(id)
          .spell_slots,
      ).L1;
      await row.locator('.jewel-label button').click();
      await page
        .getByLabel('Total maximum', { exact: true })
        .fill(String(original.max + 2));
      await page.getByRole('button', { name: 'Apply correction' }).click();
      await expect(row.locator('.resource-jewel.extra')).toHaveCount(
        original.max + 2 - 4,
      );
      await page.screenshot({
        path: path.join(evidence, 'vanec-extra-slots.png'),
      });
      await row.locator('.jewel-label button').click();
      await page.screenshot({
        path: path.join(evidence, 'vanec-resource-editor.png'),
      });
      await page
        .getByLabel('Total maximum', { exact: true })
        .fill(String(original.max));
      await page
        .getByLabel('Remaining', { exact: true })
        .fill(String(original.max - original.used));
      await page.getByRole('button', { name: 'Apply correction' }).click();
      await expect(row.locator('.resource-jewel')).toHaveCount(original.max);
    }
  }
  const geometry = await page
    .locator('.player-hud, .player-combat, .player-chat, .dice-button-overlay')
    .evaluateAll((els) =>
      els.map((e) => ({
        class: e.className,
        rect: e.getBoundingClientRect().toJSON(),
      })),
    );
  fs.writeFileSync(
    path.join(evidence, 'browser-checks.json'),
    JSON.stringify({ errors, dice, characters, geometry }, null, 2),
  );
  console.log(JSON.stringify({ errors, dice, characters }, null, 2));
  await page
    .locator('.hud-actions')
    .getByRole('button', { name: 'Party', exact: true })
    .click();
  await page.getByRole('button', { name: 'Change my character' }).click();
  await browser.close();
  db.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
