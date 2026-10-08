import { test, expect } from '@playwright/test';
import { io } from 'socket.io-client';
import { readFileSync } from 'node:fs';
import { DM_SECRET, PORT } from './playwright.config';

for (const [name, className, theme] of [
  ['Druk', 'Fighter', 'fighter'], ['Varis', 'Ranger', 'ranger'],
  ['Vanec', 'Sorcerer', 'sorcerer'], ['DM', '', 'dm-neutral-roll'],
]) test(`${name} reuses background-preloaded dice on the first roll`, async ({ page, request }) => {
  test.setTimeout(90000);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error' && /shader|WebGL|THREE/i.test(message.text())) errors.push(message.text());
  });
  const { code } = await (await request.post('/api/sessions', {
    headers: { 'x-dm-passphrase': DM_SECRET }, data: { name: `${name} preload` },
  })).json();
  const socket = io(`http://localhost:${PORT}`, { transports: ['websocket'] });
  try {
    const initial = await socket.timeout(5000).emitWithAck('join', {
      sessionCode: code, role: 'dm', dmPassphrase: DM_SECRET,
    });
    expect(initial.ok).toBe(true);
    const pc = initial.snapshot.characters.find((c: any) => c.name === name);
    if (pc) socket.emit('character:update', { characterId: pc.id, className });
    const map = await (await request.post(`/api/sessions/${code}/maps`, {
      headers: { 'x-dm-passphrase': DM_SECRET }, multipart: { name: 'Preload board', image: {
        name: 'courtyard.png', mimeType: 'image/png', buffer: readFileSync('assets/environment-preview/courtyard.png'),
      } },
    })).json();
    socket.emit('map:setActive', { mapId: map.id });
    if (name === 'DM') {
      await page.goto(`/dm?code=${code}`);
      await page.locator('input[type=password]').fill(DM_SECRET);
      await page.getByRole('button', { name: 'Rejoin as DM', exact: true }).click();
    } else {
      await page.goto(`/join?code=${code}`);
      await page.getByRole('button', { name: 'Join', exact: true }).click();
      // Session entry starts GPU preparation while the character chooser is
      // still open; choosing a character is no longer a prerequisite.
      await page.waitForFunction(theme=>JSON.parse(document.documentElement.dataset.dicePreloadedThemes??'[]').includes(theme),theme,{timeout:45000});
      await expect(page.locator('.claim-row').filter({hasText:name})).toBeVisible();
      await page.locator('.claim-row').filter({ hasText: name }).click();
    }
    const roll = page.getByRole('button', { name: 'Roll a d20', exact: true });
    await expect(roll).toBeVisible();
    await page.waitForFunction(theme=>JSON.parse(document.documentElement.dataset.dicePreloadedThemes??'[]').includes(theme),theme,{timeout:45000});
    await page.evaluate(()=>{
      const timing={clicked:performance.now(),started:0};(window as any).__firstDiceTiming=timing;
      const sample=()=>{
        if(Number(document.querySelector('.dice-tray-canvas')?.getAttribute('data-physics-elapsed')??0)>0){timing.started=performance.now();return;}
        requestAnimationFrame(sample);
      };requestAnimationFrame(sample);
    });
    await roll.click();
    const tray = page.locator('[data-live-dice="true"] .physics-dice-tray');
    await expect(tray).toHaveAttribute('data-theme', theme);
    await expect(tray).toHaveAttribute('data-dice-preloaded', 'true');
    await expect(tray).toHaveAttribute('data-renderer-reused','true');
    await expect.poll(()=>page.evaluate(()=>(window as any).__firstDiceTiming.started),{timeout:10000}).toBeGreaterThan(0);
    const timing=await page.evaluate(()=>(window as any).__firstDiceTiming);
    console.log(`${name} first-roll startup: ${Math.round(timing.started-timing.clicked)} ms`);
    expect(timing.started-timing.clicked,'The warmed first throw starts promptly').toBeLessThan(2000);
    await test.info().attach('first-roll-startup',{body:JSON.stringify({theme,ms:timing.started-timing.clicked}),contentType:'application/json'});
    const heading=page.locator('.roll-reveal-title');
    await expect(heading).toHaveRole('heading');
    expect(await heading.evaluate(el=>parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(22);
    await page.screenshot({path:test.info().outputPath('large-roll-heading.png')});
    await expect(tray).toHaveAttribute('data-status', 'settled', { timeout: 30000 });
    await expect(page.locator('[data-live-dice="true"]')).toHaveCount(0, { timeout: 10000 });
    expect(errors).toEqual([]);
  } finally { socket.disconnect(); }
});
