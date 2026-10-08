import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import { io, type Socket } from 'socket.io-client';
import type { StateSnapshot } from '../shared/types';
import { DM_SECRET, PORT } from './playwright.config';
import {expectUnclipped} from './helpers/rollVisibility';

const connections: Socket[] = [];
test.afterEach(() => connections.splice(0).forEach((socket) => socket.disconnect()));
test.use({ video: process.env.DND_TIMING_VIDEO === '1' ? { mode: 'on', size: { width: 1366, height: 900 } } : 'off' });

async function fixture(request: APIRequestContext, page: Page) {
  const response = await request.post('/api/sessions', {
    headers: { 'x-dm-passphrase': DM_SECRET }, data: { name: 'Damage reveal timing' },
  });
  expect(response.ok()).toBeTruthy();
  const { code } = await response.json();
  const socket = io(`http://localhost:${PORT}`, { transports: ['websocket'], forceNew: true });
  connections.push(socket);
  const snapshot = async (): Promise<StateSnapshot> => {
    const result = await socket.timeout(5000).emitWithAck('join', { sessionCode: code, role: 'dm', dmPassphrase: DM_SECRET });
    expect(result.ok).toBe(true);
    return result.snapshot;
  };
  const initial = await snapshot();
  const character = initial.characters.find((candidate) => candidate.name === 'Druk')!;
  socket.emit('character:update', { characterId: character.id,
    weapons: [{ name: 'Timing greatsword', kind: 'melee', damage: '2d6', attackBonus: 100 }],
    stats: { STR: 18, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 },
    sheetAbilities: [{ id: 'timing-save', name: 'Timing flame', type: 'feat', description: 'Single-target save fixture',
      roll: { kind: 'save', dice: '2d6', save: 'DEX', saveDamage: 'half', targetMode: 'single', damageType: 'fire' } }],
  });
  socket.emit('session:setManualDamage', { manual: true });
  const png = await page.evaluate(() => {
    const canvas = document.createElement('canvas'); canvas.width = 1000; canvas.height = 600;
    const ctx = canvas.getContext('2d')!; ctx.fillStyle = '#273128'; ctx.fillRect(0, 0, 1000, 600);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  const mapResponse = await request.post(`/api/sessions/${code}/maps`, {
    headers: { 'x-dm-passphrase': DM_SECRET }, multipart: { name: 'Timing fixture',
      image: { name: 'fixture.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') } },
  });
  expect(mapResponse.ok()).toBeTruthy();
  const map = await mapResponse.json();
  socket.emit('map:setActive', { mapId: map.id });
  socket.emit('fog:setLayer', { mapId: map.id, layer: 'map', enabled: false });
  socket.emit('fog:setLayer', { mapId: map.id, layer: 'tokens', enabled: false });
  socket.emit('token:spawn', { mapId: map.id, kind: 'pc', refId: character.id, x: 300, y: 240 });
  socket.emit('monster:create', { name: 'Timing target', disposition: 'enemy', maxHp: 200, armorClass: 1 });
  const template = (await snapshot()).monsterTemplates.find((candidate) => candidate.name === 'Timing target')!;
  socket.emit('token:spawn', { mapId: map.id, kind: 'monster', refId: template.id, x: 600, y: 240 });
  const ready = await snapshot();
  const target = ready.monsters.find((monster) => monster.name.startsWith('Timing target'))!;
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.addInitScript(() => {
    const timeline = { samples: [] as any[], sounds: [] as any[], running: false };
    (window as any).__revealTiming = timeline;
    const create = AudioContext.prototype.createOscillator;
    AudioContext.prototype.createOscillator = function () {
      const oscillator = create.call(this);
      const start = oscillator.start.bind(oscillator);
      oscillator.start = (when?: number) => {
        timeline.sounds.push({ time: performance.now(), frequency: oscillator.frequency.value });
        return start(when);
      };
      return oscillator;
    };
  });
  await page.goto(`/join?code=${code}`);
  await page.getByRole('button', { name: 'Join', exact: true }).click();
  await page.locator('.claim-row').filter({ hasText: 'Druk' }).click();
  await expect(page.locator('.compact-player-combat')).toBeVisible();
  return { snapshot, character, target, socket };
}

// Physics is live: no damage exists until the server has read the resting faces.
// Await the physical phase explicitly instead of the old prerecorded timeline.
test.beforeEach(() => test.setTimeout(120_000));
async function armManualDamage(page: Page, f: Awaited<ReturnType<typeof fixture>>) {
  for (let attempt = 0; attempt < 5; attempt++) {
    await page.locator('.compact-player-combat').getByRole('button', { name: /Timing greatsword/ }).click();
    await expect(page.locator('[data-live-dice="true"]')).toBeVisible();
    await expect(page.locator('[data-live-dice="true"]')).toHaveCount(0, {timeout: 30_000});
    const pending = (await f.snapshot()).rollLog.findLast(entry => entry.pending && !entry.pending.done);
    await page.keyboard.press('Escape');
    if (pending) {
      await expect(page.locator('.damage-prompt-btn')).toBeVisible();
      return pending;
    }
  }
  throw new Error('Five consecutive misses');
}
async function floaters(page: Page) {
  return page.evaluate(() => ((window as any).Konva?.stages ?? []).flatMap((stage: any) => stage.find('.hp-floater-number')
    .map((node: any) => node.text())));
}
async function resolveDamage(page: Page, f: Awaited<ReturnType<typeof fixture>>, id: string) {
  await expect.poll(async () => (await f.snapshot()).rollLog.find(r => r.id === id)?.pending?.done,
    {timeout: 30_000}).toBe(true);
  return (await f.snapshot()).rollLog.findLast(r => r.label === 'Damage')!;
}

test('skill and attack modifiers count into the total inside the original live tray', async ({page,request}) => {
  const f=await fixture(request,page);
  for(const kind of ['skill','attack'] as const){
    if(kind==='skill'){
      await page.locator('.hud-actions').getByRole('button',{name:'Checks',exact:true}).click();
      await page.locator('.compact-checks').getByRole('button',{name:/^Roll Athletics check /}).click();
    }
    else await page.locator('.compact-player-combat').getByRole('button',{name:/Timing greatsword/}).click();
    const live=page.locator('[data-live-dice="true"]');
    await expect(live).toBeVisible();
    await page.evaluate(()=>{(window as any).__originalTrayCanvas=document.querySelector('.dice-tray-canvas');});
    const result=page.locator('[data-dice-presentation="result"]');
    const equation=result.getByLabel('Roll calculation');
    await expect(equation.locator('.rr-adjustment')).not.toHaveCount(0,{timeout:35000});
    expect(await page.evaluate(()=>document.querySelector('.dice-tray-canvas')===(window as any).__originalTrayCanvas),
      'The settled tray stays mounted while bonuses appear').toBe(true);
    await expect(result.locator('.physics-dice-tray')).toBeVisible();
    await expect(page.locator('.dice-tray-canvas')).toHaveCount(1);
    await expect(result.locator('.rr-dice-row,.die-3d,.die')).toHaveCount(0);
    await expect(equation).toContainText(kind==='skill'?'STR':'hit');
    const row=(await f.snapshot()).rollLog.findLast(r=>r.reveal?.kind===(kind==='skill'?'check':'attack'))!;
    await expect(equation.locator('.rr-total')).toHaveText(String(row.total));
    await expectUnclipped(equation.locator('.rr-equation-total'));
    for(const modifier of await equation.locator('.rr-adjustment').all())await expectUnclipped(modifier);
    expect(await equation.evaluate(el=>{
      const equation=el.getBoundingClientRect(),card=el.closest('.roll-reveal')!.getBoundingClientRect();
      return equation.top>=card.top&&equation.bottom<=card.bottom&&equation.bottom<=innerHeight;
    }),'Dice and modifiers fit together without scrolling').toBe(true);
    await page.screenshot({path:test.info().outputPath(`${kind}-modifiers-in-tray.png`)});
    const before=Number(await result.locator('.dice-tray-canvas').getAttribute('data-render-time'));
    await page.waitForTimeout(200);
    expect(Number(await result.locator('.dice-tray-canvas').getAttribute('data-render-time'))).toBeGreaterThan(before);
    if(kind==='attack'){
      const stamp=result.getByLabel('Roll result',{exact:true});
      await expect(stamp).toBeVisible();
      expect(await stamp.evaluate(el=>{
        const text=el.getBoundingClientRect(),card=el.closest('.roll-reveal')!.getBoundingClientRect(),style=getComputedStyle(el);
        return Math.abs(text.left+text.width/2-card.left-card.width/2)<3 && text.top>card.top && text.bottom<card.bottom &&
          style.position==='absolute' && style.backgroundColor==='rgba(0, 0, 0, 0)' && parseFloat(style.fontSize)>=32 && style.textShadow!=='none';
      }),'Outcome is large outlined text centered over the tray, without its own card').toBe(true);
      await page.screenshot({path:test.info().outputPath('attack-outcome-over-tray.png')});
    }
    await page.keyboard.press('Escape');
    await expect(page.locator('.roll-reveal')).toHaveCount(0);
  }
});

test('live damage stays out of HP and history until the dice settle, then exposes map impact', async ({page,request}) => {
  const f=await fixture(request,page), pending=await armManualDamage(page,f);
  const oldCount=(await f.snapshot()).rollLog.length;
  await page.locator('.damage-prompt-btn').click();
  const live=page.locator('[data-live-dice="true"]');
  await expect(live).toBeVisible();
  await expect(live.locator('.roll-reveal-title')).toContainText('Timing greatsword');
  await expect(live.locator('.roll-reveal-who')).toContainText('Timing target');
  await page.evaluate(()=>{(window as any).__damageTrayCanvas=document.querySelector('.dice-tray-canvas');});
  expect((await f.snapshot()).rollLog.length).toBe(oldCount);
  expect((await f.snapshot()).monsters.find(m=>m.id===f.target.id)!.curHp).toBe(200);
  expect(await floaters(page)).toEqual([]);
  // Record presentation state independently of server snapshots so a premature
  // floater or summary during rolling cannot slip between assertions.
  await page.evaluate(()=>{
    const samples:any[]=[];(window as any).__liveTiming=samples;
    const sample=()=>{
      const live=document.querySelector('[data-live-dice="true"]');
      const popup=document.querySelector('.roll-reveal');
      const fx=((window as any).Konva?.stages??[]).flatMap((s:any)=>s.find('.hp-floater-number'));
      samples.push({live:!!live,settled:live?.querySelector('.physics-dice-tray')?.getAttribute('data-status')==='settled',ready:popup?.getAttribute('data-impact-ready')==='true',fx:fx.length,impact:!!popup?.closest('.is-impact'),height:popup?.getBoundingClientRect().height??0});
      if(live||!fx.length)requestAnimationFrame(sample);
    };sample();
  });
  // Damage arithmetic now finishes before the server commits HP/history.
  const calculation=page.getByLabel('Damage or dice calculation');
  await expect(calculation.locator('.rr-adjustment')).toContainText([/\+4\s*STR/],{timeout:35000});
  expect(await page.evaluate(()=>document.querySelector('.dice-tray-canvas')===(window as any).__damageTrayCanvas)).toBe(true);
  await expect(page.locator('.physics-dice-tray')).toBeVisible();
  const result=await resolveDamage(page,f,pending.id);
  await expect.poll(()=>floaters(page)).toContain(`\u2212${result.total}`);
  await expect(live).toHaveCount(0);
  expect((await f.snapshot()).monsters.find(m=>m.id===f.target.id)!.curHp).toBe(200-result.total);
  const samples=await page.evaluate(()=>(window as any).__liveTiming);
  expect(samples.some((s:any)=>s.live&&!s.settled)).toBe(true);
  expect(samples.filter((s:any)=>s.live&&s.fx)).toHaveLength(0);
  expect(samples.filter((s:any)=>s.height>0&&!s.ready&&s.fx)).toHaveLength(0);
  expect(samples.some((s:any)=>s.fx&&(s.height===0||s.impact&&s.height<=180))).toBe(true);
  // Completed sequences now fade automatically; an obsolete tray cannot
  // remain over the map just to keep a result card alive.
  await expect(page.locator('.roll-reveal')).toHaveCount(0,{timeout:5000});
});

test('skipping the bonus reveal releases damage immediately', async ({page,request}) => {
  const f=await fixture(request,page), pending=await armManualDamage(page,f);
  await page.locator('.damage-prompt-btn').click();
  await expect(page.locator('[data-live-dice="true"]')).toBeVisible();
  await expect(page.locator('[data-live-dice="true"]')).toHaveCount(0,{timeout:30_000});
  await expect(page.locator('.roll-reveal')).toHaveAttribute('data-impact-ready','false');
  await expect(page.locator('[data-dice-presentation="result"] .physics-dice-tray')).toBeVisible();
  expect(await floaters(page)).toEqual([]);
  await page.keyboard.press('Escape');
  await expect(page.locator('.roll-reveal')).toHaveCount(0);
  const result=await resolveDamage(page,f,pending.id);
  await expect.poll(()=>floaters(page),{timeout:1500}).toContain(`\u2212${result.total}`);
});

test('queued direct damage applies once after live damage and reload does not replay floaters', async ({page,request}) => {
  const f=await fixture(request,page), pending=await armManualDamage(page,f);
  await page.locator('.damage-prompt-btn').click();
  await expect(page.locator('[data-live-dice="true"]')).toBeVisible();
  f.socket.emit('damage:apply',{kind:'monster',refId:f.target.id,amount:1});
  const result=await resolveDamage(page,f,pending.id);
  await expect.poll(async()=>(await f.snapshot()).monsters.find(m=>m.id===f.target.id)!.curHp).toBe(199-result.total);
  await expect.poll(()=>floaters(page)).toContain('\u22121');
  await expect.poll(()=>floaters(page)).toContain(`\u2212${result.total}`);
  await page.keyboard.press('Escape');
  await expect(page.locator('.roll-reveal')).toHaveCount(0);
  await page.reload();
  await expect(page.locator('.compact-player-combat')).toBeVisible();
  expect(await floaters(page)).toEqual([]);
  await expect(page.locator('.roll-reveal')).toHaveCount(0);
});

test('animations off still waits for authoritative physics and immediately presents committed damage',async({page,request})=>{
  await page.addInitScript(()=>localStorage.setItem('dnd.rollAnimOff','1'));
  const f=await fixture(request,page);
  let pending;
  for(let attempt=0;attempt<5;attempt++){
    const count=(await f.snapshot()).rollLog.length;
    await page.locator('.compact-player-combat').getByRole('button',{name:/Timing greatsword/}).click();
    await expect.poll(async()=>(await f.snapshot()).rollLog.length,{timeout:30_000}).toBeGreaterThan(count);
    pending=(await f.snapshot()).rollLog.findLast(r=>r.pending&&!r.pending.done);if(pending)break;
  }
  expect(pending).toBeTruthy();
  await page.locator('.damage-prompt-btn').click();
  const result=await resolveDamage(page,f,pending!.id);
  await expect.poll(()=>floaters(page)).toContain(`\u2212${result.total}`);
  await expect(page.locator('.roll-reveal')).toHaveCount(0);
});

test('a concentration reminder cannot suppress the completed damage reveal',async({page,request})=>{
  const f=await fixture(request,page);
  f.socket.emit('condition:set',{kind:'monster',refId:f.target.id,condition:{label:'Concentrating',aura:'blue',isConcentration:true}});
  await f.snapshot();const pending=await armManualDamage(page,f);
  await page.locator('.damage-prompt-btn').click();
  await expect(page.locator('[data-live-dice="true"]')).toBeVisible();
  await expect(page.getByLabel('Damage or dice calculation').locator('.rr-adjustment')).toContainText([/\+4\s*STR/],{timeout:35000});
  await expect(page.locator('.roll-reveal-title')).toContainText('Timing greatsword');
  const result=await resolveDamage(page,f,pending.id);
  expect((await f.snapshot()).rollLog.slice(-2).map(r=>r.label)).toEqual(['Concentration','Damage']);
  await expect.poll(()=>floaters(page)).toContain(`\u2212${result.total}`);
});

test('a targeted save preserves the damage impact without repeating the live saving throw',async({page,request})=>{
  const f=await fixture(request,page);
  await page.locator('.compact-player-combat').getByRole('button',{name:/Timing flame/}).click();
  await expect(page.locator('[data-live-dice="true"]')).toBeVisible();
  await expect(page.locator('[data-live-dice="true"] .roll-reveal-who')).toContainText('Timing target T1');
  await expect.poll(async()=>(await f.snapshot()).rollLog.at(-1)?.reveal?.kind,{timeout:45_000}).toBe('check');
  const rolls=(await f.snapshot()).rollLog, save=rolls.at(-1)!, damage=rolls.findLast(r=>r.reveal?.kind==='damage')!;
  // The saving throw is already presented in the live tray. A second popup
  // after damage would repeat it and cover the map impact.
  expect(save.reveal!.presentedLive).toBe(true);
  const damageCard=page.locator(`.roll-reveal[data-roll-id="${damage.id}"]`);
  await expect(damageCard).toBeVisible({timeout:15_000});
  await expect(damageCard.locator('.roll-reveal-who')).toContainText('Timing target T1');
  await expect(damageCard).toHaveAttribute('data-impact-ready','true');
  expect((await damageCard.boundingBox())!.height).toBeLessThanOrEqual(180);
  await expect.poll(()=>floaters(page)).not.toEqual([]);
  await damageCard.click();
  const saveCard=page.locator(`.roll-reveal[data-roll-id="${save.id}"]`);
  await page.waitForTimeout(500);
  await expect(saveCard).toHaveCount(0);
});

test('natural twenty check rendering announces the face and retains the total',async({page,request})=>{
  // Deterministic presentation fixture: alter only the received skill-check
  // reveal. Server randomness and authoritative outcomes are tested separately.
  await page.routeWebSocket(/socket\.io/,ws=>{
    const upstream=ws.connectToServer();
    upstream.onMessage(message=>{
      if(typeof message==='string'&&message.startsWith('42')){
        const packet=JSON.parse(message.slice(2));
        if(packet[0]==='state:snapshot'){
          for(const row of packet[1].rollLog??[])if(row.reveal?.kind==='check'){
            const delta=20-(row.reveal.d20??0);row.reveal.d20=20;
            row.total+=delta;row.reveal.attackTotal+=delta;
          }
          message='42'+JSON.stringify(packet);
        }
      }
      ws.send(message);
    });
  });
  await page.emulateMedia({reducedMotion:'reduce'});
  const f=await fixture(request,page);
  f.socket.emit('skill:roll',{characterId:f.character.id,skill:'Perception'});
  await expect(page.getByRole('status',{name:'Natural 20 celebration'})).toHaveText('Nat 20!',{timeout:30_000});
  await expect(page.locator('.roll-reveal-backdrop')).not.toHaveClass(/is-impact/);
});

// Deterministic presentation fixtures exercise every legacy result through the
// live-physics UI. Only received presentation data is changed; game math is not.
for(const outcome of ['hit','miss','crit','fumble','pass','fail'] as const){
 test(`live result prominently announces ${outcome} before compacting`,async({page,request})=>{
  await page.routeWebSocket(/socket\.io/,ws=>{
   const upstream=ws.connectToServer();upstream.onMessage(message=>{
    if(typeof message==='string'&&message.startsWith('42')){
     const packet=JSON.parse(message.slice(2));
     if(packet[0]==='state:snapshot'){
      for(const row of packet[1].rollLog??[])if(row.reveal?.kind==='check'){
       row.reveal={...row.reveal,kind:outcome==='pass'||outcome==='fail'?'check':'attack',
        d20:outcome==='fumble'?1:outcome==='crit'?20:12,toHit:[{label:'STR',value:3}],
        attackTotal:outcome==='fumble'?4:outcome==='crit'?23:15,outcome,physical:true,target:'Timing target T1'};
      }
      message='42'+JSON.stringify(packet);
     }
    }ws.send(message);
   });
  });
  const f=await fixture(request,page);
  await page.evaluate(()=>{const times:any={};(window as any).__stampTimes=times;const tick=()=>{const card=document.querySelector('.roll-reveal');if(card?.querySelector('[aria-label="Roll result"]')){times.stamp??=performance.now();if(card.getAttribute('data-impact-ready')==='true'){times.impact=performance.now();return;}}requestAnimationFrame(tick);};tick();});
  f.socket.emit('skill:roll',{characterId:f.character.id,skill:'Perception'});
  await expect(page.locator('[data-live-dice="true"]')).toBeVisible();
  await expect(page.locator('[data-live-dice="true"]')).toHaveCount(0,{timeout:30000});
  const result=page.getByRole('status',{name:'Roll result',exact:true});
  const labels={hit:'HIT',miss:'MISS',crit:'CRITICAL HIT!',fumble:'Fumble!',pass:'Success',fail:'Failed'};
  await expect(result).toContainText(labels[outcome]);
  await expect(page.locator('.roll-reveal-backdrop')).not.toHaveClass(/is-impact/);
  if(outcome==='fumble')await expect(result).toHaveText('Fumble!');
  if(outcome==='crit')await expect(page.getByLabel('Critical hit celebration')).toBeVisible();
  await expect(result).toBeVisible();
  await expect(page.locator('.roll-reveal')).toHaveAttribute('data-impact-ready','true');
  if(outcome==='pass'||outcome==='fail')await expect(result).toBeVisible();
  else await expect(result).toBeHidden(); // text-only stamp clears with the full tray
  const times=await page.evaluate(()=>(window as any).__stampTimes);
  expect(times.impact-times.stamp).toBeGreaterThanOrEqual(1000);
 });
}
