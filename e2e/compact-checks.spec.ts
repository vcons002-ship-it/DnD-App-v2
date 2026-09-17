import { test, expect } from '@playwright/test';
import { io } from 'socket.io-client';
import type { StateSnapshot } from '../shared/types';
import { SKILLS, abilityMod, proficiencyBonus, signed, skillBonus } from '../shared/skills';
import { effectiveStats, saveExtra, skillExtra } from '../shared/modifiers';
import { DM_SECRET, PORT } from './playwright.config';

// All writes go to the e2e config's throwaway DB, never a preview or campaign.
test('compact checks share advantage, expose all roll types and preserve proficiency edits', async ({ page, request }) => {
  const response = await request.post('/api/sessions', {
    headers: { 'x-dm-passphrase': DM_SECRET },
    data: { name: 'Compact checks regression' },
  });
  expect(response.ok()).toBeTruthy();
  const { code } = await response.json();
  const observer = io(`http://localhost:${PORT}`, { transports: ['websocket'], forceNew: true });
  let snapshot: StateSnapshot;
  observer.on('state:snapshot', (next: StateSnapshot) => { snapshot = next; });
  try {
    const joined = await observer.timeout(5000).emitWithAck('join', {
      sessionCode: code, role: 'dm', dmPassphrase: DM_SECRET,
    });
    expect(joined.ok).toBe(true);
    snapshot = joined.snapshot;
    const character = () => snapshot.characters.find((entry) => entry.name === 'Druk')!;
    const entry = (label: string) => snapshot.rollLog.find((roll) => roll.label === label);
    // Fresh sessions seed names, not complete campaign sheets. Supply a real
    // disposable stat block so checks are enabled and equipped bonuses matter.
    observer.emit('character:update', {
      characterId: character().id,
      className: 'Fighter',
      subclass: 'Battle Master',
      level: 6,
      stats: { STR: 14, DEX: 14, CON: 16, INT: 10, WIS: 12, CHA: 8 },
      proficientSkills: [],
      saveProficiencies: ['STR', 'CON'],
      items: [{
        id: 'checks-fixture-charm', name: 'Check fixture charm', qty: 1,
        note: 'Test-only equipped modifiers', equipped: true,
        modifiers: [
          { id: 'checks-str', source: 'Check fixture charm', target: { kind: 'ability', ability: 'STR' }, value: 2 },
          { id: 'checks-dex', source: 'Check fixture charm', target: { kind: 'ability', ability: 'DEX' }, value: 2 },
          { id: 'checks-skill', source: 'Check fixture charm', target: { kind: 'skill', skill: 'Acrobatics' }, value: 1 },
          { id: 'checks-save', source: 'Check fixture charm', target: { kind: 'save', ability: 'STR' }, value: 1 },
        ],
      }],
    });
    await expect.poll(() => character().stats).toEqual({ STR: 14, DEX: 14, CON: 16, INT: 10, WIS: 12, CHA: 8 });
    expect(character().level).toBe(6);
    expect(effectiveStats(character()).scores.STR).toBe(16);
    expect(effectiveStats(character()).scores.DEX).toBe(16);
    expect(skillExtra(character(), 'Acrobatics').total).toBe(1);
    expect(saveExtra(character(), 'STR').total).toBe(1);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.goto(`/join?code=${code}`);
    await page.getByRole('button', { name: 'Join', exact: true }).click();
    await page.locator('.claim-row').filter({ hasText: 'Druk' }).click();
    await page.locator('.hud-actions').getByRole('button', { name: 'Checks', exact: true }).click();

    const checks = page.locator('.compact-checks');
    await expect(checks).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(checks.getByRole('button', { name: 'Adv', exact: true })).toHaveCount(1);
    await expect(checks.getByRole('button', { name: 'Dis', exact: true })).toHaveCount(1);
    await expect(checks.getByRole('tabpanel', { name: 'Skills', exact: true }).getByRole('button', { name: /^Roll / })).toHaveCount(18);
    expect((await page.locator('.hud-checks-drawer').boundingBox())!.width).toBeLessThanOrEqual(208);
    expect(await checks.locator('.skill-list').evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);

    // The existing dot still sends character:update; no local-only proficiency state.
    const proficiency = checks.getByRole('button', { name: 'Toggle Acrobatics proficiency', exact: true });
    const wasProficient = character().proficientSkills.includes('Acrobatics');
    await proficiency.click();
    await expect.poll(() => character().proficientSkills.includes('Acrobatics')).toBe(!wasProficient);
    await expect(proficiency).toHaveAttribute('aria-pressed', String(!wasProficient));
    const skillTotal = skillBonus(effectiveStats(character()).scores, 'DEX', character().level, !wasProficient)
      + skillExtra(character(), 'Acrobatics').total;
    await expect(checks.getByRole('button', { name: `Roll Acrobatics check ${signed(skillTotal)}`, exact: true })).toBeVisible();

    // One-shot advantage is shared across tabs, and consumed by the same store action.
    await checks.getByRole('button', { name: 'Adv', exact: true }).click();
    await checks.getByRole('tab', { name: 'Skills', exact: true }).focus();
    await page.keyboard.press('ArrowRight');
    await expect(checks.getByRole('tab', { name: 'Stats', exact: true })).toBeFocused();
    await expect(checks.getByRole('tab', { name: 'Stats', exact: true })).toHaveAttribute('aria-selected', 'true');
    await expect(checks.getByRole('tab')).toHaveCount(2);
    await expect(checks.getByRole('tabpanel', { name: 'Stats', exact: true }).getByRole('button')).toHaveCount(6);
    await expect(checks.getByRole('button', { name: 'Adv', exact: true })).toHaveClass(/\bon\b/);
    const abilityTotal = abilityMod(effectiveStats(character()).scores.STR);
    const strength = checks.getByRole('button', { name: `Strength ${effectiveStats(character()).scores.STR}. Choose check or save`, exact: true });
    await strength.click();
    const chooser = checks.getByRole('group', { name: 'Strength roll options', exact: true });
    await expect(chooser).toBeVisible();
    await expect(chooser.getByRole('button')).toHaveCount(2);
    await expect(chooser.getByRole('button', { name: `Roll Strength ability check ${signed(abilityTotal)}`, exact: true })).toBeFocused();
    // Opening/dismissing the existing-style Stat/Save chooser never spends Adv.
    await expect(checks.getByRole('button', { name: 'Adv', exact: true })).toHaveClass(/\bon\b/);
    await page.keyboard.press('Escape');
    await expect(chooser).toHaveCount(0);
    await expect(strength).toBeFocused();
    await strength.press('Enter');
    await expect(chooser).toBeVisible();
    await checks.getByRole('button', { name: `Roll Strength ability check ${signed(abilityTotal)}`, exact: true }).click();
    await expect.poll(() => entry('STR check')?.detail).toContain('adv');
    await expect(checks.getByRole('button', { name: 'Adv', exact: true })).not.toHaveClass(/\bon\b/);
    await expect(page.locator('.roll-reveal')).toBeVisible();
    await expect(page.locator('.roll-reveal canvas[aria-label*="rolling"]')).toHaveCount(0);
    await page.locator('.roll-reveal').click();

    await expect(chooser).toHaveCount(0);
    await strength.click();
    await expect(chooser).toBeVisible();
    const saveProficient = character().saveProficiencies.some((name) => name.trim().toUpperCase() === 'STR');
    const saveTotal = abilityTotal + (saveProficient ? proficiencyBonus(character().level) : 0) + saveExtra(character(), 'STR').total;
    await checks.getByRole('button', { name: `Roll Strength saving throw ${signed(saveTotal)}`, exact: true }).click();
    await expect.poll(() => entry('STR save')?.label).toBe('STR save');
    expect(entry('STR save')!.detail).not.toContain('adv');
    await expect(page.locator('.roll-reveal')).toBeVisible();
    await expect(page.locator('.roll-reveal canvas[aria-label*="rolling"]')).toHaveCount(0);
    await page.locator('.roll-reveal').click();

    await checks.getByRole('tab', { name: 'Stats', exact: true }).focus();
    await page.keyboard.press('Home');
    await expect(checks.getByRole('tab', { name: 'Skills', exact: true })).toBeFocused();
    await checks.getByRole('button', { name: `Roll Acrobatics check ${signed(skillTotal)}`, exact: true }).click();
    await expect.poll(() => entry('Acrobatics check')?.label).toBe('Acrobatics check');
    expect(entry('Acrobatics check')!.detail).not.toContain('adv');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(errors).toEqual([]);
  } finally {
    observer.disconnect();
  }
});

for (const layout of [
  { width: 1920, height: 1080, scale: .85 },
  { width: 1366, height: 768, scale: 1.15 },
  { width: 760, height: 768, scale: .7 },
]) {
  test(`quick checks remain narrow and readable at ${layout.width}px / ${Math.round(layout.scale * 100)}%`, async ({ page, request }) => {
    const response = await request.post('/api/sessions', {
      headers: { 'x-dm-passphrase': DM_SECRET },
      data: { name: 'Compact checks layout' },
    });
    expect(response.ok()).toBeTruthy();
    const { code } = await response.json();
    const observer = io(`http://localhost:${PORT}`, { transports: ['websocket'], forceNew: true });
    let snapshot: StateSnapshot;
    observer.on('state:snapshot', (next: StateSnapshot) => { snapshot = next; });
    try {
      const joined = await observer.timeout(5000).emitWithAck('join', {
        sessionCode: code, role: 'dm', dmPassphrase: DM_SECRET,
      });
      expect(joined.ok).toBe(true);
      snapshot = joined.snapshot;
      const character = () => snapshot.characters.find((entry) => entry.name === 'Druk')!;
      observer.emit('character:update', {
        characterId: character().id,
        stats: { STR: 18, DEX: 14, CON: 16, INT: 10, WIS: 12, CHA: 8 },
      });
      await expect.poll(() => character().stats.STR).toBe(18);
      const savedResources = JSON.stringify([character().spellSlots, character().resources]);
      const initialRolls = snapshot.rollLog.length;
      await page.setViewportSize({ width: layout.width, height: layout.height });
      await page.addInitScript((scale) => {
        localStorage.setItem('dnd:player-layout:v1', JSON.stringify({ scale }));
      }, layout.scale);
      await page.goto(`/join?code=${code}`);
      await page.getByRole('button', { name: 'Join', exact: true }).click();
      await page.locator('.claim-row').filter({ hasText: 'Druk' }).click();
      await page.locator('.hud-actions').getByRole('button', { name: 'Checks', exact: true }).click();
      const drawer = page.locator('.hud-checks-drawer');
      const checks = drawer.locator('.compact-checks');
      await expect(checks).toBeVisible();
      // CSS zoom rounds fractional layout pixels; compare within one CSS pixel.
      expect(await drawer.evaluate((element) => parseFloat(getComputedStyle(element).width))).toBeCloseTo(244, 0);
      expect((await drawer.boundingBox())!.width).toBeLessThanOrEqual(244 * layout.scale + 1);
      expect(await drawer.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);

      // The longest names (Animal Handling / Sleight of Hand) must remain fully
      // legible beside their stats and bonuses, not ellipsized or off-canvas.
      for (const skill of SKILLS) {
        const row = checks.locator('.skill-row').filter({ hasText: skill.name });
        await row.scrollIntoViewIfNeeded();
        await expect(row.getByRole('button', { name: new RegExp(`^Roll ${skill.name} check `) })).toBeVisible();
        expect(await row.evaluate((element) => {
          const rowRect = element.getBoundingClientRect();
          return [...element.querySelectorAll('.skill-name, .skill-abil, .skill-bonus')].every((span) => {
            const range = document.createRange();
            range.selectNodeContents(span);
            const labelRect = span.getBoundingClientRect();
            return span.scrollWidth <= span.clientWidth + 1 && [...range.getClientRects()].every((rect) =>
              rect.left >= labelRect.left - 1 && rect.right <= labelRect.right + 1
              && rect.left >= rowRect.left - 1 && rect.right <= rowRect.right + 1);
          });
        })).toBe(true);
      }
      await checks.getByRole('tab', { name: 'Stats', exact: true }).click();
      for (const name of ['Strength', 'Dexterity', 'Constitution', 'Intelligence', 'Wisdom', 'Charisma']) {
        const stat = checks.getByRole('button', { name: new RegExp(`^${name} .*Choose check or save$`) });
        await stat.scrollIntoViewIfNeeded();
        expect(await stat.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
        await stat.click();
        const chooser = checks.getByRole('group', { name: `${name} roll options`, exact: true });
        await expect(chooser).toBeVisible();
        await expect(chooser.getByRole('button')).toHaveCount(2);
        const menuRect = (await chooser.boundingBox())!;
        const drawerRect = (await drawer.boundingBox())!;
        expect(menuRect.x).toBeGreaterThanOrEqual(drawerRect.x);
        expect(menuRect.x + menuRect.width).toBeLessThanOrEqual(drawerRect.x + drawerRect.width);
        await page.keyboard.press('Escape');
        await expect(stat).toBeFocused();
      }
      await expect(page.getByRole('dialog')).toHaveCount(0);
      expect(snapshot.rollLog.length).toBe(initialRolls);
      expect(JSON.stringify([character().spellSlots, character().resources])).toBe(savedResources);
    } finally {
      observer.disconnect();
    }
  });
}
