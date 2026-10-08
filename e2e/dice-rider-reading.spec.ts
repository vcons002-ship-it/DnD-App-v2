import {startAv1Capture} from './av1Recorder';
import { test, expect } from '@playwright/test';
import { io, type Socket } from 'socket.io-client';
import type { StateSnapshot } from '../shared/types';
import { DM_SECRET, PORT } from './playwright.config';
import { completedDice, LIVE_COMBAT_TIMEOUT, observeCombatDice, waitForCombatRoll } from './helpers/combatLive';

const connections: Socket[] = [];
test.afterEach(() => connections.splice(0).forEach((socket) => socket.disconnect()));

// Real physics in a player browser: an unmodified superiority roll must finish
// its reading phase and maximum-roll effects before the following save starts.
const manual=true;test('unmodified superiority dice retain reading time before the save and maximum effects finish', async ({ page, browser, request }) => {
  test.setTimeout(180_000);
  const created = await request.post('/api/sessions', {
    headers: { 'x-dm-passphrase': DM_SECRET }, data: { name: 'Prompt ownership' },
  });
  expect(created.ok()).toBeTruthy();
  const { code } = await created.json();
  const socket = io(`http://localhost:${PORT}`, { transports: ['websocket'], forceNew: true });
  connections.push(socket);
  const frames=observeCombatDice(socket);
  const snapshot = async (): Promise<StateSnapshot> => {
    const result = await socket.timeout(5000).emitWithAck('join', { sessionCode: code, role: 'dm', dmPassphrase: DM_SECRET });
    expect(result.ok).toBe(true);
    return result.snapshot;
  };
  const character = (await snapshot()).characters.find((c) => c.name === 'Druk')!;
  socket.emit('character:update', { characterId: character.id, className: 'Fighter', level: 3, armorClass: 1, maxHp: 200, curHp: 200,
    stats: { STR: 18, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 },
    weapons: [{ name: 'Owner greatsword', kind: 'melee', damage: '2d6', damageType: 'slashing', attackBonus: 100 }] });
  socket.emit('session:setManualDamage', { manual });
  const png = await page.evaluate(() => {
    const canvas = document.createElement('canvas'); canvas.width = 1000; canvas.height = 600;
    const ctx = canvas.getContext('2d')!; ctx.fillStyle = '#273128'; ctx.fillRect(0, 0, 1000, 600);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  const map = await (await request.post(`/api/sessions/${code}/maps`, {
    headers: { 'x-dm-passphrase': DM_SECRET }, multipart: { name: 'Ownership fixture',
      image: { name: 'fixture.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') } },
  })).json();
  socket.emit('map:setActive', { mapId: map.id });
  socket.emit('fog:setLayer', { mapId: map.id, layer: 'map', enabled: false });
  socket.emit('fog:setLayer', { mapId: map.id, layer: 'tokens', enabled: false });
  socket.emit('token:spawn', { mapId: map.id, kind: 'pc', refId: character.id, x: 300, y: 240 });
  socket.emit('monster:create', { name: 'Ownership target', disposition: 'enemy', maxHp: 200, armorClass: 1,
    weapons: [{ name: 'DM blade', kind: 'melee', damage: '1d6', damageType: 'slashing', attackBonus: 100 }] });
  const template = (await snapshot()).monsterTemplates.find((m) => m.name === 'Ownership target')!;
  socket.emit('token:spawn', { mapId: map.id, kind: 'monster', refId: template.id, x: 600, y: 240 });
  const ready = await snapshot();
  const pc = ready.tokens.find((t) => t.kind === 'pc')!;
  const enemy = ready.tokens.find((t) => t.kind === 'monster')!;

  socket.emit('ability:set', {kind:'pc', refId:character.id, ability: {
    id:'trip', name:'Trip Attack', type:'maneuver', description:'Knock the target prone.',
    maneuver:{active:false, addDieTo:'damage', save:{ability:'STR',onFail:'Prone'}}
  }});
  socket.emit('ability:set', {kind:'pc', refId:character.id, ability: {
    id:'parry', name:'Parry', type:'maneuver', description:'Reaction.',
    maneuver:{active:false, addDieTo:'none'}
  }});
  await snapshot();

  await page.setViewportSize({width:1366,height:900});
  await page.goto(`/join?code=${code}`);
  await page.getByRole('button',{name:'Join',exact:true}).click();
  await page.locator('.claim-row').filter({hasText:'Druk'}).click();
  await expect(page.locator('.compact-player-combat')).toBeVisible();
  const attack = async () => {
    for(let i=0;i<8;i++) {
      const previous=new Set((await snapshot()).rollLog.map(r=>r.id));
      await page.evaluate(()=>{
        const timing={outcomeAt:0,impactAt:0};(window as any).__attackRead=timing;
        const sample=()=>{
          const now=performance.now();
          if(!timing.outcomeAt&&document.querySelector('.tray-roll-result [data-phase="outcome"]'))timing.outcomeAt=now;
          if(timing.outcomeAt&&document.querySelector('.roll-reveal[data-impact-ready="true"]')){timing.impactAt=now;return;}
          requestAnimationFrame(sample);
        };requestAnimationFrame(sample);
      });
      await page.locator('.compact-player-combat').getByRole('button',{name:/Owner greatsword/}).click();
      const result=await waitForCombatRoll(snapshot,previous,r=>r.label==='Attack');
      await expect(page.locator('.rr-adjustment').first()).toBeVisible();
      await expect(page.locator('.tray-roll-result [data-phase="outcome"]')).toBeVisible({timeout:10000});
      await expect(page.locator('.roll-reveal[data-impact-ready="true"]')).toBeVisible({timeout:10000});
      const timing=await page.evaluate(()=>(window as any).__attackRead);
      expect(timing.impactAt-timing.outcomeAt).toBeGreaterThanOrEqual(1000);
      await test.info().attach('attack-reading-timing',{body:JSON.stringify(timing),contentType:'application/json'});
      // Do not skip the attack result for a damage-timing demonstration: the
      // server commits before the client finishes arithmetic and reading time.
      await expect(page.locator('.roll-reveal-backdrop')).toHaveAttribute('data-table-idle','true',{timeout:15000});
      if(result.pending&&!result.pending.done)return result;
      expect(result.reveal?.outcome).toBe('fumble');
    }
    throw new Error('No hit in eight attacks');
  };
  await page.waitForTimeout(4500);
  const capture=process.env.DICE_RIDER_VIDEO?await startAv1Capture(page,process.env.DICE_RIDER_VIDEO):undefined;
  const hit=await attack();
  const before=(await snapshot()).monsters.find(m=>m.id===enemy.refId)!.curHp;
  await page.locator('.dp-maneuver-toggle').click();
  await expect(page.locator('.dp-maneuver-btn')).toHaveText(['Trip Attack']);
  await page.screenshot({path:test.info().outputPath('maneuver-choices.png'),fullPage:true});
  const start=frames.length;
  await page.evaluate(()=>{
    const samples:any[]=[];(window as any).__riderSamples=samples;(window as any).__riderSampling=true;
    const cards=new WeakMap<Element,number>();let nextCard=0;
    const sample=()=>{
      const tray=document.querySelector('.roll-reveal-backdrop'),boxes=[...document.querySelectorAll('.tray-die-result')];
      const card=document.querySelector('.roll-reveal');if(card&&!cards.has(card))cards.set(card,++nextCard);
      samples.push({time:performance.now(),card:card?cards.get(card):null,handoff:document.querySelector('.dice-tray-transition')?.getAttribute('data-phase'),id:tray?.getAttribute('data-roll-id'),hold:tray?.getAttribute('data-result-hold-ms'),title:document.querySelector('.roll-reveal-title')?.textContent,filled:boxes.length>0&&boxes.every(b=>b.getAttribute('data-filled')==='true'),power:JSON.parse(document.querySelector('.dice-tray-canvas')?.getAttribute('data-roll-power')||'[]')});
      if((window as any).__riderSampling)requestAnimationFrame(sample);
    };sample();
  });
  await page.locator('.dp-maneuver-btn').click();
  await expect(page.locator('[data-result-hold-ms="2500"]')).toBeVisible({timeout:45000});
  await page.waitForTimeout(1900);
  await page.screenshot({path:test.info().outputPath('superiority-reading-and-effects.png')});
  await expect.poll(async()=> (await snapshot()).rollLog.find(r=>r.id===hit.id)!.pending!.done,
    {timeout:LIVE_COMBAT_TIMEOUT}).toBe(true);
  await page.waitForTimeout(1000);
  const samples=await page.evaluate(()=>{(window as any).__riderSampling=false;return (window as any).__riderSamples;});
  const held=samples.find((s:any)=>s.hold==='2500'&&s.title?.includes('Superiority'));
  expect(held).toBeTruthy();
  const next=samples.find((s:any)=>s.time>held.time&&s.id&&s.id!==held.id);
  const sequence=samples.filter((s:any)=>s.id&&s.time<=next.time+500);
  expect(new Set(sequence.map((s:any)=>s.card)).size).toBe(1);
  expect(next.time-held.time).toBeGreaterThanOrEqual(2300);
  expect(held.filled).toBe(true);
  if(held.power.some((p:any)=>p.maximum)){
    const exploded=samples.find((s:any)=>s.id===held.id&&s.power.some((p:any)=>p.maximum&&p.broken));
    expect(exploded).toBeTruthy();expect(exploded.time).toBeLessThan(next.time-500);
    expect(samples.some((s:any)=>s.id===held.id&&s.power.some((p:any)=>p.maximum&&p.pools>0))).toBe(true);
  }
  await test.info().attach('rider-reading-timing',{body:JSON.stringify({heldMs:next.time-held.time,maximum:held.power.some((p:any)=>p.maximum),samples}),contentType:'application/json'});
  if(capture)await capture.stop();
  const after=await snapshot();
  const stages=completedDice(frames.slice(start));
  expect(stages[0].sides).toEqual(Array(hit.pending!.crit?4:2).fill(6));
  expect(stages[0].label).toMatch(/Weapon.*Damage/);
  expect(stages[1].sides).toEqual(Array(hit.pending!.crit?2:1).fill(8));
  expect(stages[1].label).toMatch(/Trip Attack/);
  expect(stages.at(-1)!.sides.every(side=>side===20)).toBe(true);
  expect(after.rollLog.find(r=>r.id===hit.id)!.pending!.dice.flatMap(d=>d.faces??[])).toEqual(stages.slice(0,-1).flatMap(stage=>stage.values));
  expect(after.characters.find(c=>c.id===character.id)!.resources['Superiority Dice'].used).toBe(1);
  expect(before-after.monsters.find(m=>m.id===enemy.refId)!.curHp).toBe(after.rollLog.find(r=>r.id===hit.id)!.pending!.amount);
  socket.emit('combat:maneuver',{rollId:hit.id,abilityId:'trip'});
  expect((await snapshot()).characters.find(c=>c.id===character.id)!.resources['Superiority Dice'].used).toBe(1);
});
