import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import { io, type Socket } from 'socket.io-client';
import type { SheetAbility, StateSnapshot } from '../shared/types';
import { DM_SECRET, PORT } from './playwright.config';
import { completedDice, dismissCommittedRoll, LIVE_COMBAT_TIMEOUT, observeCombatDice, waitForCombatRoll } from './helpers/combatLive';
import { dieResultLabel, dieResultTier } from '../shared/diceTrayTypes';
import { liveDieResult } from '../shared/liveDieResult';
import { settledLiveDice } from './helpers/diceLive';

// Every write is to Playwright's throwaway database. No installed/preview saves.
const connections: Socket[] = [];
test.afterEach(() => connections.splice(0).forEach((socket) => socket.disconnect()));

async function fixture(request: APIRequestContext, page: Page, className = 'Ranger', spawnEnemies = true) {
  const response = await request.post('/api/sessions', {
    headers: { 'x-dm-passphrase': DM_SECRET }, data: { name: 'Spell workflow regression' },
  });
  expect(response.ok()).toBeTruthy();
  const { code } = await response.json();
  const socket = io(`http://localhost:${PORT}`, { transports: ['websocket'], forceNew: true });
  connections.push(socket);
  const frames = observeCombatDice(socket);
  const snapshot = async (): Promise<StateSnapshot> => {
    const joined = await socket.timeout(5000).emitWithAck('join', { sessionCode: code, role: 'dm', dmPassphrase: DM_SECRET });
    expect(joined.ok).toBe(true);
    return joined.snapshot;
  };
  const initial = await snapshot();
  const characterId = initial.characters.find((character) => character.name === 'Varis')!.id;
  const abilities: SheetAbility[] = [
    {id:'hm',name:"Hunter's Mark",type:'spell',level:1,tags:['concentration'],description:'Choose a target. Extra Force damage on each hit.',roll:{kind:'damage',dice:'1d6',baseLevel:1}},
  ];
  socket.emit('character:update', { characterId, className, level: 6,
    stats: { STR: 10, DEX: 18, CON: 10, INT: 20, WIS: 10, CHA: 16 },
    sheetAbilities: abilities, weapons: [{name:'Longbow',kind:'ranged',damage:'1d8',damageType:'piercing',attackBonus:50,range:'150/600'}],
    spellSlots: { L1: { max: 8, used: 0 }, L2: { max: 4, used: 0 }, L3: { max: 8, used: 0 } },
  });
  // Generate a plain, local fixture PNG in a browser canvas, not external art.
  const png = await page.evaluate(() => {
    const canvas = document.createElement('canvas'); canvas.width = 1000; canvas.height = 600;
    const ctx = canvas.getContext('2d')!; ctx.fillStyle = '#273128'; ctx.fillRect(0, 0, 1000, 600);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  const mapResponse = await request.post(`/api/sessions/${code}/maps`, {
    headers: { 'x-dm-passphrase': DM_SECRET }, multipart: { name: 'Spell test map',
      image: { name: 'fixture.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') } },
  });
  expect(mapResponse.ok()).toBeTruthy();
  const map = await mapResponse.json();
  socket.emit('map:setActive', { mapId: map.id });
  socket.emit('fog:setLayer', { mapId: map.id, layer: 'map', enabled: false });
  socket.emit('fog:setLayer', { mapId: map.id, layer: 'tokens', enabled: false });
  socket.emit('token:spawn', { mapId: map.id, kind: 'pc', refId: characterId, x: 300, y: 300 });
  if (spawnEnemies) {
    socket.emit('monster:create', { name: 'Goblin', maxHp: 6, armorClass: 1,
      stats: { STR: 10, DEX: 18, CON: 10, INT: 10, WIS: 10, CHA: 10 }, disposition: 'enemy' });
    const template = (await snapshot()).monsterTemplates.find((monster) => monster.name === 'Goblin')!;
    for (const [x,y] of [[500,200],[650,250],[550,400]]) socket.emit('token:spawn', { mapId: map.id, kind: 'monster', refId: template.id, x, y });
  }
  const ready = await snapshot();
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(`/join?code=${code}`);
  await page.getByRole('button', { name: 'Join', exact: true }).click();
  await page.locator('.claim-row').filter({ hasText: 'Varis' }).click();
  const combat = page.getByRole('region', { name: 'Combat panel', exact: true });
  await expect(combat).toBeVisible();
  const row = (name: string) => combat.locator('.combat-ability-row').filter({ hasText: name });
  const dismissReveal = async (expectedRollId?: string) => {
    // A DM-socket snapshot confirms server completion, not that this player's
    // socket has rendered the same roll yet. Wait for the known result before
    // dismissing it, otherwise a late reveal can intercept the next map click.
    if (expectedRollId) return dismissCommittedRoll(page, expectedRollId);
    await expect(page.locator('[data-live-dice="true"]')).toHaveCount(0, { timeout: LIVE_COMBAT_TIMEOUT });
    if (await page.locator('.roll-reveal').count()) {
      await page.keyboard.press('Escape');
      await expect(page.locator('.roll-reveal')).toHaveCount(0);
    }
  };
  // Konva exposes this read-only scene geometry; still click through the real
  // browser hit-test, never call an app event handler or forge a client store.
  const clickToken = async (id: string, button: 'left' | 'right' = 'left') => {
    const point = await page.evaluate((tokenId) => {
      const stages = (window as unknown as { Konva: { stages: any[] } }).Konva.stages;
      const stage = stages.find((candidate) => candidate.find('.token-hit-region').length);
      const shape = stage.find('.token-hit-region').find((node: any) => node.getAttr('tokenId') === tokenId);
      const position = shape.getAbsolutePosition(), bounds = stage.container().getBoundingClientRect();
      return { x: bounds.left + position.x, y: bounds.top + position.y };
    }, id);
    await page.mouse.click(point.x, point.y, {button});
  };
  return { code, socket, snapshot, ready, characterId, abilities, combat, row, dismissReveal, clickToken, frames };
}


for (const className of ['Fighter', 'Ranger', 'Sorcerer']) test(`Hunter mark cast, automatic hit damage, and no-slot transfer through player UI (${className})`, async ({page,request}, testInfo) => {
  test.setTimeout(150000);
  const f = await fixture(request,page,className);
  f.socket.emit('session:setManualDamage',{manual:true});
  await f.snapshot();
  const targets=f.ready.tokens.filter(t=>t.kind==='monster');
  // Adjacent paralyzed targets make these real hits critical, without changing RNG.
  for (const [i,t] of targets.slice(0,2).entries()) {
    f.socket.emit('token:move',{tokenId:t.id,x:i===0?350:300,y:i===0?300:350});
    f.socket.emit('condition:set',{kind:'monster',refId:t.refId,condition:{label:'Paralyzed',aura:'red',isConcentration:false}});
  }
  await f.snapshot();

  // Allow the remote token movement animation and initial map fit to settle.
  await page.waitForTimeout(1500);
  await f.clickToken(targets[0].id,'right');
  const menu=page.getByRole('dialog',{name:'Token actions'});
  await expect(menu).toBeVisible();
  await menu.getByRole('button',{name:/Hunter.s Mark/}).click();
  await expect.poll(async()=> (await f.snapshot()).characters.find(c=>c.id===f.characterId)!.sheetAbilities[0].mark?.refId).toBe(targets[0].refId);
  expect((await f.snapshot()).characters.find(c=>c.id===f.characterId)!.spellSlots.L1.used).toBe(1);
  const attack=async(target:string)=>{
    for(let attempt=0;attempt<5;attempt++) {
      await f.dismissReveal();
      await f.clickToken(target,'right');
      await expect(menu).toBeVisible();
      await menu.getByRole('button',{name:'Adv',exact:true}).click();
      const previous = new Set((await f.snapshot()).rollLog.map(r => r.id));
      await menu.getByRole('button',{name:/Longbow/}).click();
      const roll=await waitForCombatRoll(f.snapshot, previous, r => r.reveal?.kind === 'attack');
      if(roll.pending) {
        expect(roll.pending.crit).toBe(true);
        expect(roll.pending.dice).toEqual([]);
        await f.dismissReveal(roll.id);
        await expect(page.locator('.player-damage-dock .damage-prompt-btn')).toBeVisible({timeout:20000});
        const start = f.frames.length;
        const damagePrevious = new Set((await f.snapshot()).rollLog.map(r => r.id));
        const observedDice: {sides:number;critical:boolean;theme:string}[][] = [];
        await page.evaluate(() => {
          (window as any).__markDice=[];
          let last='';
          const collect=()=>{
            const tray=document.querySelector('[data-live-dice="true"] .physics-dice-tray');
            const dice=Array.from(tray?.querySelectorAll('.tray-die-result')??[]).map(d=>({sides:Number(d.getAttribute('data-sides')),critical:d.getAttribute('data-critical')==='true',theme:d.getAttribute('data-theme')??''}));
            const signature=JSON.stringify(dice);
            if(dice.length&&signature!==last){last=signature;(window as any).__markDice.push(dice);}
            if(!(window as any).__markDone)requestAnimationFrame(collect);
          };
          (window as any).__markDone=false;requestAnimationFrame(collect);
        });
        await page.locator('.player-damage-dock .damage-prompt-btn').click();
        const damage=await waitForCombatRoll(f.snapshot, damagePrevious, r => r.label === 'Damage');
        const stages=completedDice(f.frames.slice(start));
        // Weapon and mark roll separately; each source rolls its normal and
        // critical dice together. The final damage preserves both actual pools.
        expect(stages.map(stage=>stage.sides)).toEqual([[8,8],[6,6]]);
        expect(stages.map(stage=>stage.critical)).toEqual([[false,true],[false,true]]);
        expect(stages[0].label).toMatch(/Longbow/);
        expect(stages[1].label).toMatch(/Hunter.s Mark/);
        expect(damage.reveal?.damageDice?.flatMap(d=>d.faces??[])).toEqual(stages.flatMap(stage=>stage.values));
        expect(damage.reveal?.damageDice?.filter(d=>/Hunter.s Mark/.test(d.label))).toHaveLength(2);
        await expect(page.locator('.roll-reveal')).toHaveAttribute('data-roll-id',damage.id);
        await expect(page.locator('.rr-arrow')).toContainText(`Goblin G${targets.findIndex(t=>t.id===target)+1}`);
        observedDice.push(...await page.evaluate(() => {(window as any).__markDone=true;return (window as any).__markDice;}));
        expect(observedDice).toEqual([
          [{sides:8,critical:false,theme:className.toLowerCase()},{sides:8,critical:true,theme:className.toLowerCase()}],
          [{sides:6,critical:false,theme:className.toLowerCase()},{sides:6,critical:true,theme:className.toLowerCase()}],
        ]);
        await page.locator('.roll-reveal').screenshot({path: testInfo.outputPath('ranger-dice.png')});
        await expect.poll(async()=>Number((await page.locator('.rr-dmg-num').innerText()).match(/^\d+/)?.[0])).toBe(damage.total);
        await expect.poll(async()=>page.evaluate(()=> (window as any).Konva.stages.flatMap((stage:any)=>stage.find('.hp-floater-total').map((node:any)=>Number(node.text().replace(/[^0-9]/g,'')))).reduce((sum:number,n:number)=>sum+n,0))).toBe(damage.total);
        const feedback=await page.evaluate(()=> (window as any).Konva.stages.flatMap((stage:any)=>stage.find('.hp-floater-component').map((node:any)=>({color:node.fill(),x:node.getParent().getParent().x(),matrix:node.getAbsoluteTransform().getMatrix().slice(0,4)}))));
        expect(feedback).toHaveLength(2);
        expect(new Set(feedback.map((n:any)=>n.color)).size).toBe(2);
        expect(feedback[0].x).toBe(feedback[1].x); // sequential numbers share one token anchor
        expect(feedback.every((n:any)=>JSON.stringify(n.matrix)===JSON.stringify([1,0,0,1]))).toBe(true);
        expect((await f.snapshot()).rollLog.find(r=>r.id===roll.id)?.pending?.amount).toBe(damage.total);
        await f.dismissReveal(damage.id);
        return;
      }
    }
    throw new Error('No hit after retries');
  };
  await attack(targets[0].id);
  const prompt=page.getByRole('region',{name:'Move mark',exact:true});
  await expect(prompt).toBeVisible({timeout:20000});
  await prompt.getByRole('button',{name:'Move mark',exact:true}).click();
  await f.clickToken(targets[1].id);
  await expect(prompt.getByRole('button',{name:'Confirm mark'})).toBeVisible();
  await prompt.getByRole('button',{name:'Confirm mark'}).click();
  await expect.poll(async()=> (await f.snapshot()).characters.find(c=>c.id===f.characterId)!.sheetAbilities[0].mark?.refId).toBe(targets[1].refId);
  await expect(prompt).toHaveCount(0);
  await attack(targets[1].id);
  const final=await f.snapshot();
  expect(final.characters.find(c=>c.id===f.characterId)!.spellSlots.L1.used).toBe(1);
});


for (const [className, material] of [['Sorcerer','volumetric-glass'],['Fighter','obsidian-gold'],['Ranger','forest-resin']]) test(`${className} material covers all dice without a loading flash`, async ({page,request}) => {
  test.setTimeout(180000);
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/materialDice-*.js', async route => { await gate; await route.continue(); });
  const f = await fixture(request,page,className,false);
  const picker = page.locator('.player-dice-picker');
  for (const sides of [4,6,8,10,12,20,100]) {
    const previous=new Set((await f.snapshot()).rollLog.map(r=>r.id));
    const start=f.frames.length;
    await picker.getByRole('button',{name:'More dice',exact:true}).click();
    await picker.getByRole('group',{name:'Choose a die'}).getByRole('button',{name:`d${sides}`,exact:true}).click();
    await expect(page.locator('.physics-dice-tray')).toHaveAttribute('data-entry-side','bottom');
    const dice = page.locator('.roll-reveal .tray-die-result');
    await expect(dice).toHaveCount(sides===100?2:1);
    const settled=settledLiveDice(page,sides===100?2:1);
    if (sides===4) {
      await expect(page.locator('.physics-dice-tray')).toHaveAttribute('data-material','loading');
      // No painted legacy face exists, even with the module download held open.
      expect(await page.locator('.dice-tray-canvas').evaluate((node: HTMLCanvasElement) => {
        const pixels=node.getContext('2d')!.getImageData(0,0,node.width,node.height).data;
        return pixels.some((v,i)=>i%4===3 && v!==0);
      })).toBe(false);
      release();
    }
    await expect(page.locator('.physics-dice-tray')).toHaveAttribute('data-material',material);
    const visible=await settled;
    expect(visible.every(die=>die.theme===className.toLowerCase())).toBe(true);
    expect(visible.map(die=>die.sides)).toEqual(Array(sides===100?2:1).fill(sides===100?10:sides));
    const roll=await waitForCombatRoll(f.snapshot,previous,r=>r.expr===`1d${sides}`);
    expect(visible.map(die=>die.value)).toEqual(completedDice(f.frames.slice(start))[0].values);
    expect(roll.reveal?.physical).toBe(true);
    await f.dismissReveal(roll.id);
  }
});


test('physics tray supports DM, mobile, compared rolls, reduced motion and unsupported-die errors',async({page,request},testInfo)=>{
 test.setTimeout(180000);
 const f=await fixture(request,page,'Ranger',false);
 await page.setViewportSize({width:390,height:844});
 let previous=new Set((await f.snapshot()).rollLog.map(r=>r.id));
 f.socket.emit('dice:roll',{expr:'2d6+1d8',advantage:'adv',label:'Tray comparison'});
 const live=page.locator('[data-live-dice="true"]');
 await expect(live.locator('.physics-dice-tray')).toHaveAttribute('data-status','settled',{timeout:LIVE_COMBAT_TIMEOUT});
 await expect(live.locator('.tray-die-result')).toHaveCount(6);
 await expect(live.locator('.tray-die-result[data-result="kept"]')).toHaveCount(3);
 await expect(live.locator('.tray-die-result[data-result="discarded"]')).toHaveCount(3);
 await expect(live.locator('.tray-die-result[data-result="kept"]').first()).toHaveCSS('border-top-color','rgb(57, 239, 135)');
 await expect(live.locator('.tray-die-result[data-result="discarded"]').first()).toHaveCSS('border-top-color','rgb(255, 83, 101)');
 const bounds=await page.locator('.dice-tray-canvas').boundingBox();expect(bounds!.width).toBeGreaterThan(200);expect(bounds!.x+bounds!.width).toBeLessThanOrEqual(391);
 await page.locator('.roll-reveal').screenshot({path:testInfo.outputPath('phone-tray.png')});
 const compared=await waitForCombatRoll(f.snapshot,previous,r=>r.label==='Tray comparison');
 const comparison=completedDice(f.frames).at(-1)!;
 const setTotals=[0,1].map(set=>comparison.values.reduce((sum,value,i)=>sum+(comparison.sets[i]===set?value!:0),0));
 expect(setTotals[comparison.kept!]).toBe(Math.max(...setTotals));
 expect(compared.total).toBe(setTotals[comparison.kept!]);
 await f.dismissReveal(compared.id);
 await page.emulateMedia({reducedMotion:'reduce'});
 previous=new Set((await f.snapshot()).rollLog.map(r=>r.id));
 f.socket.emit('dice:roll',{expr:'1d20',label:'Reduced motion'});
 await expect(live.locator('.dice-tray-status')).toHaveText('Live roll in progress');
 const reduced=await waitForCombatRoll(f.snapshot,previous,r=>r.label==='Reduced motion');
 expect(reduced.total).toBeGreaterThanOrEqual(1);expect(reduced.total).toBeLessThanOrEqual(20);
 await expect(page.locator('[data-live-dice="true"]')).toHaveCount(0);
 await f.dismissReveal(reduced.id);await page.emulateMedia({reducedMotion:'no-preference'});
 previous=new Set((await f.snapshot()).rollLog.map(r=>r.id));
 const errors:string[]=[];
 f.socket.on('error',payload=>errors.push(payload.message));
 f.socket.emit('dice:roll',{expr:'1d3',label:'Custom die'});
 await expect.poll(()=>errors.join('\n')).toContain('Live rolls support d4, d6, d8, d10, d12, d20 and d100');
 expect((await f.snapshot()).rollLog.map(r=>r.id)).toEqual([...previous]);
 await expect(page.locator('[data-live-dice="true"]')).toHaveCount(0);
 const dm=await page.context().newPage();await dm.goto(`/dm?code=${f.code}`);
 await dm.getByPlaceholder(/DM secret/).fill(DM_SECRET);await dm.getByRole('button',{name:'Rejoin as DM',exact:true}).click();
 await expect(dm.getByRole('button',{name:'Rejoin as DM',exact:true})).toHaveCount(0);
 previous=new Set((await f.snapshot()).rollLog.map(r=>r.id));
 f.socket.emit('dice:roll',{expr:'1d20',label:'DM physics toss'});
 await expect(dm.locator('.physics-dice-tray')).toHaveAttribute('data-status','settled',{timeout:LIVE_COMBAT_TIMEOUT});
 await expect(dm.locator('.physics-dice-tray')).toHaveAttribute('data-entry-side','bottom');
 await expect(page.locator('.physics-dice-tray')).toHaveAttribute('data-entry-side',/^(left|top|right)$/);
 await dm.locator('.roll-reveal').screenshot({path:testInfo.outputPath('dm-tray.png')});
 await waitForCombatRoll(f.snapshot,previous,r=>r.label==='DM physics toss');
 await dm.close();
});


test('dice calculation shows readable values and sequential labeled bonuses and penalties',async({page,request},testInfo)=>{
 test.setTimeout(90000);
 const f=await fixture(request,page,'Ranger',false);
 const previous=new Set((await f.snapshot()).rollLog.map(r=>r.id));
 await page.setViewportSize({width:900,height:1000});
 f.socket.emit('dice:roll',{expr:'1d8+3-2',label:'Readable roll calculation'});
 const equation=page.locator('.rr-equation');
 await expect(page.locator('.physics-dice-tray')).toHaveAttribute('data-status','rolling',{timeout:15000});
 await expect(equation.locator('.rr-adjustment')).toHaveCount(0);
 const roll=await waitForCombatRoll(f.snapshot,previous,r=>r.expr==='1d8+3-2');
 const mods=roll.reveal?.damageMods??[];
 expect(mods.length).toBeGreaterThan(0);
 await expect(equation.locator('.rr-adjustment')).toHaveCount(mods.length);
 for(let i=0;i<mods.length;i++){
  await expect(equation.locator('.rr-adjustment').nth(i).locator('small')).toHaveText(mods[i].label);
  await expect(equation.locator('.rr-adjustment').nth(i).locator('strong')).toHaveText(`${mods[i].value<0?'-':'+'}${Math.abs(mods[i].value)}`);
 }
 await expect(page.locator('.rr-roll-num')).toHaveText(String(roll.total));
 expect(roll.total).toBe(roll.reveal!.damageDice!.flatMap(d=>d.faces??[]).reduce((a,b)=>a+b,0)+mods.reduce((a,b)=>a+b.value,0));
 await page.locator('.roll-reveal').screenshot({path:testInfo.outputPath('readable-calculation.png')});
});


test('settled dice flash and fill their own result boxes, including percentile and comparison dice',async({page,request})=>{
 test.setTimeout(90000);
 const f=await fixture(request,page,'Sorcerer',false);
 await page.evaluate(()=>{
   const original=Element.prototype.animate;
   (window as any).__flightStarts=[];
   Element.prototype.animate=function(...args){
     const animation=original.apply(this,args);
     if(this.classList.contains('tray-flying-number'))(window as any).__flightStarts.push({id:Number((this as HTMLElement).dataset.dieId),time:performance.now(),running:animation.playState==='running',filter:getComputedStyle(this).filter});
     return animation;
   };
 });
 const previous=new Set((await f.snapshot()).rollLog.map(r=>r.id));
 const start=f.frames.length;
 f.socket.emit('dice:roll',{expr:'1d100+1d8+1d6',advantage:'adv',label:'Flying results'});
 const tray=page.locator('.physics-dice-tray');
 await expect(tray).toHaveAttribute('data-status','rolling',{timeout:15000});
 // These are streamed server poses, rather than the old prerecorded worker
 // simulation. The physical clock advances continuously before faces are read.
 await expect.poll(()=>f.frames.slice(start).some(frame=>frame.elapsed>0)).toBe(true);
 await page.evaluate(()=>{
   const descriptor=Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype,'width')!;
   (window as any).__redundantCanvasResizes=0;
   Object.defineProperty(HTMLCanvasElement.prototype,'width',{...descriptor,set(value:number){
     if(this.width===value)(window as any).__redundantCanvasResizes++;
     descriptor.set!.call(this,value);
   }});
 });
 await expect(tray.locator('.tray-flying-number')).toHaveCount(8);
 await expect.poll(()=>page.evaluate(()=>(window as any).__flightStarts.length),
   {timeout:LIVE_COMBAT_TIMEOUT}).toBe(8);
 await expect(tray).toHaveAttribute('data-status','settled',{timeout:LIVE_COMBAT_TIMEOUT});
 await expect.poll(()=>tray.locator('.tray-die-result[data-filled="true"]').count(),
   {timeout:LIVE_COMBAT_TIMEOUT,intervals:[20,50]}).toBe(8);
 // Capture the completed live UI together: after presentation finishes the
 // compact result replaces this tray, so per-element network calls can race it.
 const presented=await tray.evaluate(node=>Array.from(node.querySelectorAll('.tray-flying-number')).map(flight=>{
   const id=flight.getAttribute('data-die-id')!,result=node.querySelector(`.tray-die-result[data-die-id="${id}"]`)!;
   const label=result.querySelector('.tray-max-label') as HTMLElement;
   return {id:Number(id),text:flight.textContent,value:result.querySelector('strong')!.textContent,
     set:result.getAttribute('data-set'),flightSet:flight.getAttribute('data-set'),
     opacity:getComputedStyle(flight).opacity,strength:result.getAttribute('data-strength'),flightStrength:flight.getAttribute('data-strength'),
     label:label.textContent,labelVisible:getComputedStyle(label).visibility==='visible'};
 }));
 expect(await page.evaluate(()=>(window as any).__redundantCanvasResizes)).toBe(0);
 const starts=await page.evaluate(()=>(window as any).__flightStarts as {id:number;time:number;running:boolean;filter:string}[]);
 expect(starts.map(s=>s.id)).toEqual([0,1,2,3,4,5,6,7]);
 expect(starts.every(s=>s.running&&s.filter==='none')).toBe(true);
 for(let i=1;i<starts.length;i++){
   expect(starts[i].time).toBeGreaterThan(starts[i-1].time);
   expect(starts[i].time-starts[i-1].time).toBeLessThan(250);
 }
 for(const result of presented){
   expect(result.value).toBe(result.text);
   expect(result.set).toBe(result.flightSet);
   expect(Number(result.opacity)).toBeLessThanOrEqual(.01);
   expect(result.strength).toBe(result.flightStrength);
   const frame=completedDice(f.frames.slice(start))[0];
   const die=liveDieResult(frame,result.id);
   expect(result.strength).toBe(dieResultTier(die));
   expect(result.labelVisible).toBe(!!dieResultLabel(die));
   expect(result.label).toBe(dieResultLabel(die));
 }
 const roll=await waitForCombatRoll(f.snapshot,previous,r=>r.label==='Flying results');
 expect(roll.reveal?.physical).toBe(true);
});
