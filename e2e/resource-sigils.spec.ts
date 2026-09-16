import { test, expect } from '@playwright/test';
import { io } from 'socket.io-client';
import { DM_SECRET, PORT } from './playwright.config';

// The shared E2E config starts a disposable DATA_ROOT/DB on 4099. This fixture
// creates a new session and never reads or modifies either campaign copy.
test('resource sigils stay identifiable and manually edited extra slots survive reload', async ({ page, request }) => {
  const response = await request.post('/api/sessions', {
    headers: { 'x-dm-passphrase': DM_SECRET },
    data: { name: 'Resource sigil regression' },
  });
  expect(response.ok()).toBeTruthy();
  const { code } = await response.json();
  const dm = io(`http://localhost:${PORT}`, { transports: ['websocket'], forceNew: true });
  const snapshot = async () => {
    const result: any = await dm.timeout(5000).emitWithAck('join', {
      sessionCode: code,
      role: 'dm',
      dmPassphrase: DM_SECRET,
    });
    expect(result.ok).toBe(true);
    return result.snapshot;
  };

  try {
    await snapshot();
    dm.emit('character:create', {
      name: 'Sigil Sorcerer',
      race: 'Tiefling',
      className: 'Sorcerer',
      level: 6,
      maxHp: 40,
    });
    // Ordered socket events: the next acknowledgement observes creation.
    const created = (await snapshot()).characters.find((c: any) => c.name === 'Sigil Sorcerer');
    expect(created).toBeTruthy();
    dm.emit('character:update', {
      characterId: created.id,
      level: 6,
      spellSlots: {
        L1: { max: 4, used: 1 },
        L2: { max: 3, used: 0 },
        L3: { max: 3, used: 1 },
      },
      resources: {
        'Sorcery Points': { max: 6, used: 2 },
        'Moon marks': { max: 3, used: 1 },
      },
    });
    await snapshot();

    await page.setViewportSize({ width: 1366, height: 768 });
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(`/join?code=${code}`);
    await page.getByRole('button', { name: 'Join', exact: true }).click();
    await page.locator('.claim-row').filter({ hasText: 'Sigil Sorcerer' }).click();
    const resources = page.getByRole('region', { name: 'Character resources', exact: true });
    // First verify editing in the compact rack, including seven L1 slots.
    // The second half explicitly switches to concentric and tests its geometry
    // and overflow, independently of the player's new concentric default.
    await page.getByRole('button', { name: 'Interface settings', exact: true }).click();
    await page.getByLabel('Compact rows', { exact: true }).check();
    await page.getByRole('button', { name: 'Close interface settings', exact: true }).click();
    await expect(resources).toBeVisible();
    const customToggle = resources.getByRole('button', { name: /^Additional resources/ });
    await expect(customToggle).toHaveCount(0);
    await expect(resources.locator('.resource-dock-tools button')).toHaveCount(0);
    await expect(resources.getByRole('button', { name: '+ Row', exact: true })).toHaveCount(0);
    await expect(resources.locator('.custom-resource-drawer')).toHaveCount(0);
    await expect(resources.locator('.core-resource-rows').getByRole('button', { name: /^Moon marks:/ })).toBeVisible();
    const core = resources.locator('.core-resource-rows');
    const sorcery = core.getByRole('button', { name: /^Sorcery Points: 4 of 6 remaining/ });
    // Core spell/class counters stay visible without scrolling, even at a
    // narrow desktop width. Identity text must not sit on top of the orb art.
    const assertDockGeometry = async (width: number) => {
      await page.setViewportSize({ width, height: 768 });
      await expect(page.locator('.temp-vessel')).toHaveCount(0);
      await expect(page.locator('.main-orb')).toBeInViewport({ ratio: 1 });
      await expect(sorcery).toBeInViewport({ ratio: 1 });
      await expect(core.getByRole('button', { name: /^Level 1:/ })).toBeInViewport({ ratio: 1 });
      await expect(core.getByRole('button', { name: /^Level 2:/ })).toBeInViewport({ ratio: 1 });
      await expect(core.getByRole('button', { name: /^Level 3:/ })).toBeInViewport({ ratio: 1 });
      const geometry = await core.evaluate((element) => ({
        scrollTop: element.scrollTop,
        scrollHeight: element.scrollHeight,
        clientHeight: element.clientHeight,
        overflowY: getComputedStyle(element).overflowY,
      }));
      expect(geometry.scrollTop).toBe(0);
      expect(geometry.scrollHeight).toBeLessThanOrEqual(geometry.clientHeight + 1);
      expect(['scroll', 'auto']).not.toContain(geometry.overflowY);
      const identity = (await page.locator('.hud-identity').boundingBox())!;
      const orb = (await page.locator('.orb-holder').boundingBox())!;
      const overlapWidth = Math.max(0, Math.min(identity.x + identity.width, orb.x + orb.width) - Math.max(identity.x, orb.x));
      const overlapHeight = Math.max(0, Math.min(identity.y + identity.height, orb.y + orb.height) - Math.max(identity.y, orb.y));
      expect(overlapWidth * overlapHeight, `Identity overlaps orb artwork at ${width}px`).toBe(0);
      await expect(customToggle).toHaveCount(0);
    };
    await assertDockGeometry(1366);
    await assertDockGeometry(860);
    await page.setViewportSize({ width: 1366, height: 768 });
    const levelOne = resources.getByRole('button', { name: /^Level 1: 3 of 4 remaining/ });
    await expect(levelOne.locator('.resource-sigil-spell .resource-sigil-letter')).toHaveText('I');
    await expect(resources.getByRole('button', { name: /^Level 2:/ }).locator('.resource-sigil-letter')).toHaveText('II');
    await expect(resources.getByRole('button', { name: /^Level 3:/ }).locator('.resource-sigil-letter')).toHaveText('III');

    await expect(sorcery.locator('.resource-sigil-sorcery')).toBeVisible();
    await sorcery.hover();
    await expect(page.getByRole('tooltip')).toContainText('Sorcery Points');
    await expect(page.getByRole('tooltip')).toContainText('4 / 6 remaining');
    await page.mouse.move(650, 230);
    await expect(page.getByRole('tooltip')).toHaveCount(0);
    await sorcery.focus();
    await expect(page.getByRole('tooltip')).toContainText('Sorcery Points');
    await expect(page.getByRole('tooltip')).toBeInViewport();
    await sorcery.press('Escape');
    await expect(page.getByRole('tooltip')).toHaveCount(0);

    // The Roman medallion is still a keyboard-operable maximum/remaining editor.
    await levelOne.focus();
    await expect(page.getByRole('tooltip')).toContainText('Level 1');
    await expect(page.getByRole('tooltip')).toContainText('3 / 4 remaining');
    await levelOne.press('Enter');
    const editor = page.getByRole('form', { name: 'Adjust L1', exact: true });
    await expect(editor).toBeVisible();
    await expect(editor).toContainText('2024 reference: 4 standard slots');
    await editor.getByLabel('Total maximum', { exact: true }).fill('7');
    await editor.getByLabel('Remaining', { exact: true }).fill('2');
    await editor.getByRole('button', { name: 'Apply correction', exact: true }).click();

    const editedButton = resources.getByRole('button', { name: /^Level 1: 2 of 7 remaining/ });
    const editedRow = resources.locator('.jewel-row').filter({
      has: page.getByRole('button', { name: /^Level 1: 2 of 7 remaining/ }),
    });
    await expect(editedButton).toBeVisible();
    await expect(editedRow.locator('.resource-jewel')).toHaveCount(7);
    await expect(editedRow.locator('.resource-jewel.lit')).toHaveCount(2);
    await expect(editedRow.locator('.resource-jewel.extra')).toHaveCount(3);
    await expect(editedRow.locator('.resource-jewel.extra.lit')).toHaveCount(0);
    await expect(editedRow.locator('.resource-jewel.extra .gem-extra-engraving')).toHaveCount(3);
    for (const mark of await editedRow.locator('.resource-jewel.extra .gem-extra-engraving').all()) await expect(mark).toBeVisible();
    await expect(resources.locator('.extra-caption')).toHaveCount(0);

    await page.reload();
    await expect(editedButton).toBeVisible();
    await expect(editedRow.locator('.resource-jewel.extra')).toHaveCount(3);
    await expect(editedRow.locator('.resource-jewel.lit')).toHaveCount(2);
    await expect(resources.locator('.custom-resource-drawer')).toHaveCount(0);
    await assertDockGeometry(1366);
    await assertDockGeometry(860);
    await expect(customToggle).toHaveCount(0);
    await expect(resources.locator('.custom-resource-drawer')).toHaveCount(0);
    await expect(core.getByRole('button', { name: /^Moon marks: 2 of 3 remaining/ })).toBeVisible();
    const saved = (await snapshot()).characters.find((c: any) => c.id === created.id);
    expect(saved.spellSlots.L1).toMatchObject({ max: 7, used: 5, maxOverride: true });
    expect(saved.spellSlots.L2).toMatchObject({ max: 3, used: 0 });
    expect(saved.resources['Sorcery Points']).toEqual({ max: 6, used: 2 });
    expect(saved.resources['Moon marks']).toEqual({ max: 3, used: 1 });
    await expect(resources.locator('.resource-amount')).toHaveCount(0);
    await page.getByRole('button', { name: 'Interface settings', exact: true }).click();
    await page.getByLabel('Concentric arcs', { exact: true }).check();
    await page.getByRole('button', { name: 'Close interface settings', exact: true }).click();
    await expect(resources.locator('.concentric-resource-rows')).toBeVisible();
    // Curves originate on the actual globe rather than the resource panel.
    const geometry = await page.evaluate(() => {
      const orb = document.querySelector('.main-orb')!.getBoundingClientRect();
      const rail = document.querySelector('.resource-arc-metal')!.getBoundingClientRect();
      return { cx: orb.x + orb.width / 2, cy: orb.y + orb.height / 2, x: rail.x, y: rail.y };
    });
    expect(Math.abs(geometry.cx - geometry.x)).toBeLessThan(1.5);
    expect(Math.abs(geometry.cy - geometry.y)).toBeLessThan(1.5);
    const curvedRows = core.locator('.curved-resource');
    // The expanded seven-slot L1 pool uses Additional resources if its rail
    // would cross the nameplate; the fitting custom Moon marks now joins the rack.
    await expect.poll(() => curvedRows.count()).toBeGreaterThanOrEqual(4);
    const symbolPositions = () => curvedRows.locator('.resource-sigil-trigger').evaluateAll((elements) => elements.map((element) => {
      const box = element.getBoundingClientRect();
      return {
        name: element.getAttribute('aria-label')!.split(':')[0],
        x: box.x + box.width / 2,
        y: box.y + box.height / 2,
      };
    }));
    for (const width of [1366, 860]) {
      await page.setViewportSize({ width, height: 768 });
      // ResizeObserver supplies globe measurements; flush its post-layout work
      // before testing exact geometry rather than relying on a fixed delay.
      await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
      await expect(page.locator('.temp-vessel')).toHaveCount(0);
      await expect(page.locator('.main-orb')).toBeInViewport({ ratio: 1 });
      const symbols = await symbolPositions();
      expect(Math.max(...symbols.map((symbol) => symbol.y)) - Math.min(...symbols.map((symbol) => symbol.y)),
        `Concentric labels need a shared baseline at ${width}px`).toBeLessThan(1.5);
      if (width === 1366) {
        await expect(curvedRows).toHaveCount(5);
        await expect(customToggle).toHaveCount(0);
      } else {
        // Only the non-fitting seven-slot pool requires an overflow icon.
        await expect(customToggle).toHaveAttribute('aria-expanded', 'false');
        await expect(customToggle.locator('svg')).toBeVisible();
        expect(await customToggle.evaluate((element) => {
          const copy = element.cloneNode(true) as HTMLElement;
          copy.querySelectorAll('svg, [role="tooltip"]').forEach((child) => child.remove());
          return copy.textContent?.trim();
        }), 'Overflow access has no persistent text/count caption').toBe('');
        await customToggle.hover();
        await expect(customToggle.getByRole('tooltip')).toHaveText('Additional resources');
        await expect(customToggle.getByRole('tooltip')).toBeVisible();
        await page.mouse.move(650, 230);
        await expect(customToggle.locator('[role="tooltip"]')).not.toBeVisible();
        const customIconPosition = await customToggle.evaluate((element) => {
          const icon = element.getBoundingClientRect();
          const ringControls = [...document.querySelectorAll('.curved-resource .resource-sigil-trigger, .curved-resource .resource-jewel')]
            .map((control) => control.getBoundingClientRect());
          const ringsRight = Math.max(...ringControls.map((box) => box.right));
          const label = document.querySelector('.curved-resource .resource-sigil-trigger')!.getBoundingClientRect();
          const sculpture = document.querySelector('.hud-orb-cluster')!;
          const zoom = sculpture.getBoundingClientRect().width / parseFloat(getComputedStyle(sculpture).width);
          const hud = document.querySelector('.player-hud')!.getBoundingClientRect();
          return {
            gap: icon.left - ringsRight,
            rawBaselineOffset: (icon.y + icon.height / 2 - label.y - label.height / 2) / zoom,
            ringCount: document.querySelectorAll('.curved-resource').length,
            rightPlacementWouldOverflow: ringsRight + 7 * zoom + icon.width + 4 * zoom > hud.right + .5,
            inViewport: icon.left >= 0 && icon.top >= 0 && icon.right <= innerWidth && icon.bottom <= innerHeight,
            overlapAreas: ringControls.map((box) => Math.max(0, Math.min(box.right, icon.right) - Math.max(box.left, icon.left))
              * Math.max(0, Math.min(box.bottom, icon.bottom) - Math.max(box.top, icon.top))),
            clickable: element.contains(document.elementFromPoint(icon.x + icon.width / 2, icon.y + icon.height / 2)),
          };
        });
        if (customIconPosition.gap < -1) {
          // The existing five-wide-ring safeguard allows one lower row only
          // when the icon cannot fit to the right; it must never cover a ring.
          expect(customIconPosition.ringCount, JSON.stringify(customIconPosition)).toBe(5);
          expect(customIconPosition.rightPlacementWouldOverflow, JSON.stringify(customIconPosition)).toBe(true);
          expect(Math.abs(customIconPosition.rawBaselineOffset - 30), JSON.stringify(customIconPosition)).toBeLessThan(1);
        } else {
          expect(customIconPosition.gap, `Custom icon sits right of the outermost ring at ${width}px`).toBeGreaterThanOrEqual(-1);
        }
        expect(customIconPosition.overlapAreas.every((area) => area === 0), JSON.stringify(customIconPosition)).toBe(true);
        expect(customIconPosition.inViewport, JSON.stringify(customIconPosition)).toBe(true);
        expect(customIconPosition.gap, `Custom icon stays close to the outermost ring at ${width}px`).toBeLessThanOrEqual(24);
        expect(customIconPosition.clickable, `Custom icon stays directly clickable at ${width}px`).toBe(true);
      }
      // Measure the rendered hit targets against the actual globe, not the
      // implementation's coordinate helper. This catches wrong containing
      // blocks, CSS transforms/zoom, and symbol offsets from their metal rails.
      const radialGeometry = await curvedRows.evaluateAll((rows) => {
        const globe = document.querySelector('.main-orb')!.getBoundingClientRect();
        const sculpture = document.querySelector<HTMLElement>('.hud-orb-cluster')!;
        const zoom = sculpture.getBoundingClientRect().width / parseFloat(getComputedStyle(sculpture).width);
        const center = { x: globe.x + globe.width / 2, y: globe.y + globe.height / 2 };
        return {
          center,
          zoom,
          sculptureBottom: sculpture.getBoundingClientRect().bottom,
          rows: rows.map((row) => {
            const path = row.querySelector('.resource-arc-metal path')!.getAttribute('d')!;
            const radius = Number(/A\s*([\d.]+)/.exec(path)?.[1]);
            return {
              path,
              radius,
              renderedRadius: radius * zoom,
              controls: [...row.querySelectorAll('.resource-sigil-trigger, .resource-jewel')].map((element) => {
                const bounds = element.getBoundingClientRect();
                const x = bounds.x + bounds.width / 2, y = bounds.y + bounds.height / 2;
                const distance = Math.hypot(x - center.x, y - center.y);
                return { label: element.getAttribute('aria-label'), x, y, distance, error: Math.abs(distance - radius * zoom) };
              }),
            };
          }),
        };
      });
      // Temporary-HP placement must not move the resource medallions: preserve
      // the original baseline exactly 42 unscaled CSS pixels above the art base.
      const expectedSymbolY = radialGeometry.sculptureBottom - 42 * radialGeometry.zoom;
      for (const symbol of symbols) {
        expect(Math.abs(symbol.y - expectedSymbolY),
          `${symbol.name} moved off the original S-42 baseline at ${width}px: ${JSON.stringify({ symbol, expectedSymbolY, zoom: radialGeometry.zoom })}`)
          .toBeLessThanOrEqual(1);
      }
      for (const row of radialGeometry.rows) {
        expect(Number.isFinite(row.radius), `SVG arc radius missing: ${row.path}`).toBe(true);
        for (const control of row.controls) {
          expect(control.error, JSON.stringify({ width, ...radialGeometry, failedControl: control.label })).toBeLessThanOrEqual(1);
        }
      }
      const placements = await curvedRows.evaluateAll((rows) => {
        const controls = [...document.querySelectorAll('.resource-dock-tools button, .resource-dock-tools a, .hud-status-strip button')]
          .map((element) => ({ label: element.getAttribute('aria-label') || element.textContent, box: element.getBoundingClientRect() }))
          .filter(({ box }) => box.width > 0 && box.height > 0);
        return rows.map((row) => {
          const label = row.querySelector('.resource-sigil-trigger')!;
          const box = label.getBoundingClientRect();
          return {
            label: label.getAttribute('aria-label'),
            centerY: box.y + box.height / 2,
            pipCentersY: [...row.querySelectorAll('.resource-jewel')].map((pip) => {
              const bounds = pip.getBoundingClientRect();
              return bounds.y + bounds.height / 2;
            }),
            overlaps: controls.map((control) => ({
              control: control.label,
              area: Math.max(0, Math.min(box.right, control.box.right) - Math.max(box.left, control.box.left))
                * Math.max(0, Math.min(box.bottom, control.box.bottom) - Math.max(box.top, control.box.top)),
            })),
          };
        });
      });
      for (let ordinal = 0; ordinal < Math.max(...placements.map((row) => row.pipCentersY.length)); ordinal++) {
        const peers = placements.filter((row) => row.pipCentersY.length > ordinal)
          .map((row) => ({ label: row.label, y: row.pipCentersY[ordinal] }));
        if (peers.length < 2) continue;
        expect(Math.max(...peers.map((peer) => peer.y)) - Math.min(...peers.map((peer) => peer.y)),
          `Jewel ${ordinal + 1} must share its horizontal tier across concentric rings at ${width}px: ${JSON.stringify(peers)}`)
          .toBeLessThanOrEqual(1);
      }
      for (const placement of placements) {
        for (const centerY of placement.pipCentersY) {
          expect(centerY, `${placement.label}: every pip ascends above its label at ${width}px`).toBeLessThan(placement.centerY);
        }
        for (const overlap of placement.overlaps) {
          expect(overlap.area, `${placement.label} overlaps ${overlap.control} at ${width}px`).toBe(0);
        }
      }
      // Sigils open the editors, so their pointer targets are just as important
      // as the jewels. Decorative SVG or utility controls must not cover either.
      for (const control of await core.locator('.resource-jewel, .resource-sigil-trigger').all()) {
        await expect(control).toBeInViewport({ ratio: 1 });
        const hit = await control.evaluate((el) => {
          const r = el.getBoundingClientRect();
          const target = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
          return { clickable: el.contains(target), label: el.getAttribute('aria-label'), target: target?.outerHTML.slice(0, 350) };
        });
        expect(hit.clickable, JSON.stringify({ width, ...hit })).toBe(true);
      }

      // Spending/restoring affects lighting only: the medallions cannot rotate
      // or relocate around the orb as a resource's remaining count changes.
      const levelTwoRow = curvedRows.filter({ has: page.getByRole('button', { name: /^Level 2:/ }) });
      const lastLevelTwoPip = levelTwoRow.locator('.resource-jewel').last();
      await lastLevelTwoPip.click();
      await expect(levelTwoRow.locator('.resource-jewel.lit')).toHaveCount(2);
      expect(await symbolPositions()).toEqual(symbols);
      expect((await snapshot()).characters.find((c: any) => c.id === created.id).spellSlots.L2).toEqual({ ...saved.spellSlots.L2, used: 1 });
      await lastLevelTwoPip.click();
      await expect(levelTwoRow.locator('.resource-jewel.lit')).toHaveCount(3);
      expect(await symbolPositions()).toEqual(symbols);
      expect((await snapshot()).characters.find((c: any) => c.id === created.id).spellSlots.L2).toEqual(saved.spellSlots.L2);

      // A temporary-HP shield belongs inside the globe and must not displace
      // the established resource-symbol baseline when it appears or expires.
      dm.emit('tempHp:set', { kind: 'pc', refId: created.id, amount: 9 });
      await expect(page.locator('.main-orb .orb-temp-shield')).toBeVisible();
      await expect(page.locator('.orb-readout .orb-temp-bonus')).toHaveText('+9');
      expect(await symbolPositions()).toEqual(symbols);
      dm.emit('tempHp:set', { kind: 'pc', refId: created.id, amount: 0 });
      await expect(page.locator('.orb-temp-shield, .orb-temp-bonus')).toHaveCount(0);
      expect(await symbolPositions()).toEqual(symbols);
    }
    await customToggle.click();
    await editedButton.click();
    await expect(editor.getByLabel('Total maximum', { exact: true })).toHaveValue('7');
    await expect(editor.getByLabel('Remaining', { exact: true })).toHaveValue('2');
    await editor.getByRole('button', { name: 'Cancel', exact: true }).click();
    await page.reload();
    await expect(resources.locator('.concentric-resource-rows')).toBeVisible();
    await customToggle.click();
    await expect(editedRow.locator('.resource-jewel.extra')).toHaveCount(3);
    const afterLayout = (await snapshot()).characters.find((c: any) => c.id === created.id);
    expect(afterLayout.spellSlots).toEqual(saved.spellSlots);
    expect(afterLayout.resources).toEqual(saved.resources);
    expect(errors).toEqual([]);
  } finally {
    dm.disconnect();
  }
});
