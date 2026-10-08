import { test, expect } from '@playwright/test';
import { io } from 'socket.io-client';
import { readFileSync } from 'node:fs';
import { PORT, DM_SECRET } from './playwright.config';

// Route-delayed cold assets must not be served by the app's offline cache.
test.use({ serviceWorkers: 'block' });

for (const scenario of [
  { spell: 'Cure Wounds', cold: false },
  { spell: 'Hail of Thorns', cold: false, mark: true },
  { spell: 'Hail of Thorns', cold: false, mark: true, skip:'escape' },
  { spell: 'Cure Wounds', cold: true },
  { spell: 'Cure Wounds', cold: true, skip: 'click' },
  { spell: 'Cure Wounds', cold: false, skip: 'button' },
  { spell: 'Cure Wounds', cold: false, skip: 'escape' },
]) test(`${scenario.spell}${scenario.cold ? ' with cold graphics' : ''}${scenario.skip ? ` skipped by ${scenario.skip}` : ''} clears the roll window before map effects start`, async ({ page, request }) => {
  test.setTimeout(150_000);
  const { spell, cold } = scenario;
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error' && /shader|WebGL|THREE/i.test(message.text())) errors.push(message.text());
  });
  let textureReleasedAt = 0;
  if (cold) await page.route('**/art/dice-trays/ranger-v1.webp', async route => {
    // Exercise a cold download beyond the old 2.5-second launch timeout.
    await new Promise(resolve => setTimeout(resolve, 6000));
    textureReleasedAt = Date.now();
    await route.continue();
  });
  const { code } = await (await request.post('/api/sessions', {
    headers: { 'x-dm-passphrase': DM_SECRET }, data: { name: 'Spell impact presentation' },
  })).json();
  const socket = io(`http://localhost:${PORT}`, { transports: ['websocket'] });
  const frames: { elapsed: number; at: number;label:string;calculation:boolean;sides:number[];mods:any[] }[] = [];
  socket.on('dice:frame', frame => frames.push({ elapsed: frame.elapsed, at: Date.now(),label:frame.label,calculation:!!frame.calculation,sides:frame.sides,mods:frame.calculation?.damageMods??[] }));
  const snapshot = async () => {
    const result = await socket.timeout(8000).emitWithAck('join', {
      sessionCode: code, role: 'dm', dmPassphrase: DM_SECRET,
    });
    expect(result.ok).toBe(true);
    return result.snapshot;
  };
  try {
    const initial = await snapshot(), caster = initial.characters.find((c: any) => c.name === 'Varis');
    const catalog = (await (await request.get('/api/spells/all')).json()).results;
    socket.emit('character:update', {
      characterId: caster.id, className: 'Ranger', level: 6, maxHp: 100, curHp: 10,
      stats: { STR: 10, DEX: 18, CON: 12, INT: 10, WIS: 18, CHA: 10 }, spellSlots: { L1: { max: 5, used: 0 }, L2: {max:3,used:0} },
      weapons: [{ name: 'Timing bow', kind: 'ranged', damage: '1d10', damageType: 'piercing', attackBonus: 100 }],
      sheetAbilities: catalog.filter((s: any) => ['Cure Wounds', 'Hail of Thorns'].includes(s.name) || scenario.mark && /Hunter.s Mark/.test(s.name))
        .map((s: any) => ({ ...s, id: s.name })),
    });
    const map = await (await request.post(`/api/sessions/${code}/maps`, {
      headers: { 'x-dm-passphrase': DM_SECRET }, multipart: { name: 'Impact fixture', image: {
        name: 'courtyard.png', mimeType: 'image/png', buffer: readFileSync('assets/environment-preview/courtyard.png'),
      } },
    })).json();
    socket.emit('map:setGrid', { mapId: map.id, gridSizePx: 64, feetPerSquare: 5, widthFt: 100, locked: false });
    for (const layer of ['map', 'tokens']) socket.emit('fog:setLayer', { mapId: map.id, layer, enabled: false });
    socket.emit('map:setActive', { mapId: map.id });
    socket.emit('session:setManualDamage', { manual: true });
    socket.emit('token:spawn', { mapId: map.id, kind: 'pc', refId: caster.id, x: 430, y: 640 });
    for (const [name, x] of [['Target', 650], ['Neighbor', 690]] as const) {
      socket.emit('monster:create', { name, creatureType: 'humanoid', maxHp: 200, armorClass: 1, stats: { DEX: 10 } });
      const monster = (await snapshot()).monsterTemplates.find((m: any) => m.name === name);
      socket.emit('token:spawn', { mapId: map.id, kind: 'monster', refId: monster.id, x, y: 450 });
    }
    await snapshot();
    await page.goto(`/join?code=${code}`);
    await page.getByRole('button', { name: 'Join', exact: true }).click();
    await page.locator('.claim-row').filter({ hasText: 'Varis' }).click();
    await expect(page.locator('.compact-player-combat')).toBeVisible();
    // The ordinary first roll should reuse the background-compiled material.
    if (!cold) await page.waitForTimeout(6000);
    if (spell === 'Hail of Thorns') {
      if (scenario.mark) {
        await page.locator('.compact-player-combat').getByRole('button', { name: /Hunter.s Mark/ }).click();
        await expect.poll(async () => (await snapshot()).characters.find((c: any) => c.id === caster.id).sheetAbilities.some((a: any) => a.mark?.refId)).toBe(true);
      }
      for (let attempt = 0; attempt < 5; attempt++) {
        await page.locator('.compact-player-combat').getByRole('button', { name: /Timing bow/ }).click();
        await expect(page.locator('[data-live-dice="true"]')).toBeVisible();
        await expect(page.locator('.physics-dice-tray')).toHaveAttribute('data-dice-preloaded', 'true');
        await expect(page.locator('[data-live-dice="true"]')).toHaveCount(0, { timeout: 45000 });
        await page.keyboard.press('Escape');
        if (await page.locator('.damage-prompt-btn').isVisible()) break;
      }
      await page.locator('.damage-prompt').getByRole('button', { name: 'Hail of Thorns', exact: true }).click();
    }
    await page.evaluate(() => {
      const samples: any[] = [];
      (window as any).__impactSamples = samples;
      (window as any).__impactSampling = true;
      const sample = () => {
        const cards = [...document.querySelectorAll('.roll-reveal')];
        const fx = ((window as any).Konva?.stages ?? []).flatMap((stage: any) => stage.find('.hp-floater-number')).filter((n:any)=>n.getAbsoluteOpacity()>.01);
        const tray = document.querySelector('.physics-dice-tray');
        const boxes = [...document.querySelectorAll('.tray-die-result')];
        samples.push({ time: performance.now(), wall:Date.now(), fx: fx.length,
          title:document.querySelector('.roll-reveal-title')?.textContent,
          adjustment:!!document.querySelector('.rr-adjustment'),
          calculation:document.querySelector('.rr-equation')?.textContent,
          numbers: fx.map((node: any) => ({ text: node.text(), total:node.hasName('hp-floater-total'),color: node.fill(), opacity: node.getParent().opacity(), x: node.getAttr('targetMapX'), y: node.getAbsolutePosition().y, matrix:node.getAbsoluteTransform().getMatrix().slice(0,4) })),
          live: !!document.querySelector('[data-live-dice="true"]'),
          settled: tray?.getAttribute('data-status') === 'settled',
          filled: boxes.length > 0 && boxes.every(e => e.getAttribute('data-filled') === 'true'),
          renderTime: Number(document.querySelector('.dice-tray-canvas')?.getAttribute('data-render-time') ?? 0),
          large: cards.some(e => e.getBoundingClientRect().height > 180) });
        if ((window as any).__impactSampling) requestAnimationFrame(sample);
      };
      sample();
    });
    if (spell === 'Cure Wounds') {
      await page.locator('.compact-player-combat').getByRole('button', { name: /Cure Wounds/ }).click();
      await expect(page.locator('[data-live-dice="true"]')).toBeVisible();
      await page.evaluate(()=>{(window as any).__healingTrayCanvas=document.querySelector('.dice-tray-canvas');});
      if (!cold) await expect(page.locator('.physics-dice-tray')).toHaveAttribute('data-dice-preloaded', 'true');
    } else await page.locator('.damage-prompt').getByRole('button', { name: scenario.mark ? 'L2' : 'L1', exact: true }).click();
    if (scenario.skip) {
      if(spell==='Hail of Thorns')await expect(page.locator('[data-live-dice="true"]')).toBeVisible();
      if (scenario.skip === 'escape') {
        // Exercise the added reading pause after every number has arrived.
        await expect(page.locator('.tray-die-result[data-filled="false"]')).toHaveCount(0, {timeout: 30000});
        await page.keyboard.press('Escape');
      } else if (scenario.skip === 'button') {
        // Skip during the actual toss; it still resolves real physics server-side.
        await expect.poll(() => frames.some(frame => frame.elapsed > 0), {timeout: 15000}).toBe(true);
        await page.getByRole('button', {name: 'Skip roll animation'}).click();
      } else await page.getByRole('status', {name: 'Live dice roll', exact: true}).click();
      await expect(page.locator('[data-live-dice="true"]')).toHaveCount(0, {timeout: 700});
    }
    if(spell==='Cure Wounds'&&!scenario.skip){
      const result=page.locator('[data-dice-presentation="result"]');
      await expect(result.getByLabel('Damage or dice calculation').locator('.rr-adjustment')).toContainText([/\+4\s*WIS modifier/],{timeout:35000});
      expect(await page.evaluate(()=>document.querySelector('.dice-tray-canvas')===(window as any).__healingTrayCanvas)).toBe(true);
      await expect(result.locator('.physics-dice-tray')).toBeVisible();
      expect(await result.getByLabel('Damage or dice calculation').evaluate(el=>{
        const equation=el.getBoundingClientRect(),card=el.closest('.roll-reveal')!.getBoundingClientRect();
        return equation.top>=card.top&&equation.bottom<=card.bottom&&equation.bottom<=innerHeight;
      }),'The full modifier equation is readable without scrolling the tray').toBe(true);
      await page.screenshot({path:test.info().outputPath('healing-modifiers-in-tray.png')});
    }
    await expect.poll(() => page.evaluate(() => (window as any).__impactSamples.some((s: any) => s.fx > 0)),
      { timeout: 90000 }).toBe(true);
    if (scenario.mark) {
      await page.waitForTimeout(350);
      await page.screenshot({path: test.info().outputPath('bow-mark-thorns-damage.png')});
      await page.waitForTimeout(7400);
    } else await page.waitForTimeout(1000);
    const samples = await page.evaluate(() => {
      (window as any).__impactSampling = false;
      return (window as any).__impactSamples;
    });
    expect(samples.some((s: any) => s.live)).toBe(true);
    expect(samples.filter((s: any) => s.fx && (s.live || s.large)).slice(0, 5),
      'Map effects must not play beneath the live tray or a full result card').toEqual([]);
    if (scenario.mark&&!scenario.skip) {
      const firstSave=frames.find(f=>f.label.includes('DEX Saving Throws'))!.at;
      const bowCalculation=samples.filter((s:any)=>s.title?.includes('Timing bow')&&s.adjustment);
      expect(bowCalculation.length,'Bow modifiers are shown during the damage phase').toBeGreaterThan(0);
      expect(bowCalculation.every((s:any)=>s.wall<firstSave),'Bow arithmetic finishes before the first save frame').toBe(true);
      expect(frames.filter(f=>f.calculation)).toHaveLength(1);
      const dexFrame=frames.find(f=>f.mods.some(m=>m.label==='DEX'))!;
      expect(dexFrame.sides,'DEX belongs to the bow d10, never the mark d6').toEqual([10]);
      // Compare presentations in the same browser, not a second socket's earlier delivery time.
      const firstMark=samples.find((s:any)=>s.live&&/Hunter.s Mark/.test(s.title))!.wall;
      expect(bowCalculation.every((s:any)=>s.wall<firstMark),'Bow arithmetic finishes before Hunter’s Mark rolls').toBe(true);
      expect(frames.filter(f=>f.sides.includes(6)).every(f=>!f.mods.some(m=>m.label==='DEX'))).toBe(true);
      const mainSamples=samples.map((s:any)=>({...s,numbers:s.numbers.filter((n:any)=>n.x===650)}));
      expect(await page.locator('[data-testid="hp-number-canvas"]').evaluate(el=>getComputedStyle(el).transform)).toBe('none');
      expect(samples.every((s:any)=>s.numbers.every((n:any)=>JSON.stringify(n.matrix)==='[1,0,0,1]')),
        'Visible floating text faces the screen even on the tilted map').toBe(true);
      expect(mainSamples.every((s:any)=>s.numbers.filter((n:any)=>!n.total).length<=1),'Only one colored component appears beside the hovering total').toBe(true);
      expect(mainSamples.every((s:any)=>s.numbers.filter((n:any)=>n.total).length<=1),'Only one running total per creature').toBe(true);
      const seen=new Map<string,any>();
      mainSamples.forEach((s:any)=>s.numbers.forEach((n:any)=>{if(!seen.has(n.color))seen.set(n.color,{...n,time:s.time});}));
      const components=[...seen.values()].filter((n:any)=>!n.total);
      const amount=(n:any)=>Number(n.text.replace(/[^0-9]/g,''));
      const totals=mainSamples.flatMap((s:any)=>s.numbers.filter((n:any)=>n.total).map((n:any)=>({...n,time:s.time})));
      const total=totals.reduce((best:any,n:any)=>!best||amount(n)>amount(best)?n:best,undefined);
      expect(components).toHaveLength(3);
      expect(total.color).toBe('#ff5a60');
      expect(total.time).toBeGreaterThan(Math.max(...components.map((n:any)=>n.time)));
      expect(new Set(totals.map((n:any)=>n.text)).size,'The total counts up as components arrive').toBeGreaterThan(2);
      expect(totals.every((n:any,i:number)=>i===0||amount(n)>=amount(totals[i-1]))).toBe(true);
      expect(amount(total)).toBe(components.reduce((sum:number,n:any)=>sum+amount(n),0));
      const after=await snapshot();
      const main=after.tokens.find((t:any)=>t.kind==='monster'&&t.x===650);
      expect(amount(total)).toBe(200-after.monsters.find((m:any)=>m.id===main.refId).curHp);
      const splash=samples.flatMap((s:any)=>s.numbers.filter((n:any)=>n.x===690));
      expect(splash.some((n:any)=>!n.total&&n.color==='#b4f47e'),'Splash victims also get a colored AoE component').toBe(true);
      const neighbor=after.tokens.find((t:any)=>t.kind==='monster'&&t.x===690);
      expect(Math.max(...splash.filter((n:any)=>n.total).map(amount))).toBe(200-after.monsters.find((m:any)=>m.id===neighbor.refId).curHp);
      const mainThorns=mainSamples.find((s:any)=>s.numbers.some((n:any)=>!n.total&&n.color==='#b4f47e'))!.time;
      const splashThorns=samples.find((s:any)=>s.numbers.some((n:any)=>n.x===690&&!n.total&&n.color==='#b4f47e'))!.time;
      expect(Math.abs(mainThorns-splashThorns),'Shared AoE numbers appear on the same frame across victims').toBeLessThan(40);
      expect(samples.every((s:any)=>s.numbers.every((n:any)=>n.x===650||n.x===690)),
        'Every number rises from its own token center').toBe(true);
      expect(await page.evaluate(() => ((window as any).Konva?.stages??[]).flatMap((stage:any)=>stage.find('.hp-floater-label')).length)).toBe(0);
      expect(mainSamples.find((s:any)=>s.time>=total.time+2100)?.numbers.some((n:any)=>n.total&&n.opacity>.95)).toBe(true);
      expect(mainSamples.find((s:any)=>s.time>=total.time+3000)?.numbers.some((n:any)=>n.total&&n.opacity>.2&&n.opacity<.95)).toBe(true);
    }
    if (scenario.skip) {
      await expect(page.locator('.roll-reveal')).toHaveCount(0);
      if(spell==='Cure Wounds')expect((await snapshot()).characters.find((c: any) => c.id === caster.id).curHp).toBeGreaterThan(10);
      else expect((await snapshot()).monsters.some((m:any)=>m.curHp<200)).toBe(true);
    } else if (spell === 'Cure Wounds') {
      const filling = samples.filter((s: any) => s.live && s.settled && !s.filled && s.renderTime);
      expect(filling.at(-1).renderTime - filling[0].renderTime,
        'Dice material animations must continue during number flights').toBeGreaterThan(400);
      // Reading continues in the same physical tray while its calculation is
      // displayed; it is no longer an extra server-held pause before bonuses.
      const reading = samples.filter((s: any) => s.large && s.settled && s.filled && s.renderTime);
      expect(reading.at(-1).renderTime - reading[0].renderTime,
        'Filled results remain readable with animated dice for at least 1.7 seconds').toBeGreaterThan(1700);
    }
    if (cold && !scenario.skip) {
      expect(textureReleasedAt).toBeGreaterThan(0);
      expect(frames.find(frame => frame.elapsed > 0)!.at).toBeGreaterThanOrEqual(textureReleasedAt);
    }
    expect(errors).toEqual([]);
  } finally { socket.disconnect(); }
});
