import {test,expect,type Page,type Locator} from '@playwright/test';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {io,type Socket} from 'socket.io-client';
import type {SheetAbility,StateSnapshot} from '../shared/types';
import {DM_SECRET,PORT} from './playwright.config';
import {startAv1Capture} from './directAv1Recorder';
import {expectUnclipped} from './helpers/rollVisibility';

test('a player area spell hands hidden grouped creature saves to the DM before resolving damage',async({page:dm,browser,request})=>{
 test.setTimeout(240000);
 const output=process.env.CAPTURE_HIDDEN_AREA;
 if(output)mkdirSync(output,{recursive:true});
 const {code}=await(await request.post('/api/sessions',{headers:{'x-dm-passphrase':DM_SECRET},data:{name:'Fireball - private creature saves'}})).json();
 const sockets:Socket[]=[],admin=io(`http://localhost:${PORT}`,{transports:['websocket'],forceNew:true});sockets.push(admin);
 const snapshot=async():Promise<StateSnapshot>=>(await admin.timeout(5000).emitWithAck('join',{sessionCode:code,role:'dm',dmPassphrase:DM_SECRET})).snapshot;
 const playerContext=await browser.newContext({viewport:{width:1600,height:1000},deviceScaleFactor:1}),player=await playerContext.newPage();
 const captures:Awaited<ReturnType<typeof startAv1Capture>>[]=[],chapters:{time:number;title:string}[]=[];let start=0;
 const chapter=async(title:string)=>{console.log(title);chapters.push({time:(Date.now()-start)/1000,title});if(output)await dm.waitForTimeout(1800);};
 const spellShapes=(view:Page,state:'aiming'|'resolving')=>view.evaluate(state=>(window as any).Konva.stages.flatMap((s:any)=>s.find('.spell-area-shape')).filter((g:any)=>g.id()===state).map((g:any)=>{const circle=g.findOne('Circle');return {x:circle?.x(),y:circle?.y(),radius:circle?.radius()};}),state);
 const click=async(view:Page,button:Locator)=>{const b=await button.boundingBox();expect(b).toBeTruthy();await view.mouse.move(b!.x+b!.width/2,b!.y+b!.height/2,{steps:18});await view.waitForTimeout(250);await button.click();};
 try{
 const vanec=(await snapshot()).characters.find(c=>c.name==='Vanec')!;
 const catalog=(await(await request.get('/api/spells/all')).json()).results as SheetAbility[];
 const fireball={...catalog.find(a=>a.name==='Fireball')!,id:'private-fireball',source:'srd' as const};
 admin.emit('character:update',{characterId:vanec.id,className:'Sorcerer',level:5,stats:{STR:10,DEX:14,CON:14,INT:10,WIS:10,CHA:18},sheetAbilities:[fireball],spellSlots:{L3:{max:2,used:0}},maxHp:40,curHp:40});
 const map=await(await request.post(`/api/sessions/${code}/maps`,{headers:{'x-dm-passphrase':DM_SECRET},multipart:{name:'Castle courtyard',image:{name:'courtyard.png',mimeType:'image/png',buffer:readFileSync('assets/environment-preview/courtyard.png')}}})).json();
 admin.emit('map:setActive',{mapId:map.id});admin.emit('map:setGrid',{mapId:map.id,gridSizePx:64,feetPerSquare:5,widthFt:100,locked:false});
 for(const layer of ['map','tokens'])admin.emit('fog:setLayer',{mapId:map.id,layer,enabled:false});
 admin.emit('token:spawn',{mapId:map.id,kind:'pc',refId:vanec.id,x:420,y:700});
 admin.emit('monster:create',{name:'Goblin',modelType:'goblin',disposition:'enemy',creatureType:'humanoid',maxHp:120,armorClass:13,stats:{STR:10,DEX:14,CON:10,INT:8,WIS:10,CHA:8}});
 const template=(await snapshot()).monsterTemplates.find(m=>m.name==='Goblin')!;
 for(const [x,y] of [[700,500],[800,500],[750,600]])admin.emit('token:spawn',{mapId:map.id,kind:'monster',refId:template.id,x,y});
 const ready=await snapshot(),enemies=ready.tokens.filter(t=>t.kind==='monster');
 const observer=io(`http://localhost:${PORT}`,{transports:['websocket'],forceNew:true});sockets.push(observer);
 const frames:any[]=[],reviews:any[]=[],hp:any[]=[];
 observer.on('dice:frame',f=>frames.push(f));observer.on('dice:hiddenReview',r=>reviews.push(r));observer.on('fx:hp',f=>hp.push(...f.events));
 const playerSnapshot=async():Promise<StateSnapshot>=>(await observer.timeout(5000).emitWithAck('join',{sessionCode:code,role:'player'})).snapshot;
 await playerSnapshot();
 await player.goto(`/join?code=${code}`);await player.getByRole('button',{name:'Join',exact:true}).click();await player.locator('.claim-row').filter({hasText:'Vanec'}).click();
 await dm.setViewportSize({width:1600,height:1000});await dm.goto(`/dm?code=${code}`);await dm.locator('input[type=password]').fill(DM_SECRET);await dm.getByRole('button',{name:'Rejoin as DM',exact:true}).click();
 await dm.getByRole('button',{name:'Chat & dice',exact:true}).click();await dm.locator('.chat-dice-options > summary').click();await dm.getByRole('button',{name:/DM rolls shown/}).click();await dm.getByRole('button',{name:'Close DM panel',exact:true}).click();
 for(const view of [dm,player]){
  await expect(view.getByTestId('miniature-layer')).toHaveAttribute('data-miniature-count','4',{timeout:60000});
  await view.getByRole('button',{name:'Tilted battlefield view',exact:true}).click();
 }
 await player.waitForFunction(()=>JSON.parse(document.documentElement.dataset.dicePreloadedThemes??'[]').includes('sorcerer'),{},{timeout:45000});
 await dm.waitForFunction(()=>JSON.parse(document.documentElement.dataset.dicePreloadedThemes??'[]').some((id:string)=>id.startsWith('dm-')),{},{timeout:45000});
 if(output){
  for(const [view,title] of [[dm,'Private Fireball DM AV1'],[player,'Private Fireball Player AV1']] as const){
   await view.evaluate(title=>{document.title=title;const cursor=document.createElement('div');cursor.style.cssText='position:fixed;width:26px;height:26px;border:2px solid #ffe4a0;border-radius:50%;pointer-events:none;z-index:2147483647;transform:translate(-50%,-50%);box-shadow:0 0 8px #000';document.body.append(cursor);document.addEventListener('pointermove',e=>{cursor.style.left=e.clientX+'px';cursor.style.top=e.clientY+'px';});document.addEventListener('pointerdown',()=>cursor.animate([{background:'#ffe4a099',scale:1.4},{background:'transparent',scale:1}],{duration:500}));},title);
  }
  await dm.bringToFront();captures.push(await startAv1Capture(dm,output+'/dm-av1.mp4',{title:'Private Fireball DM AV1',width:1600,height:1080}));
  captures.push(await startAv1Capture(player,output+'/player-av1.mp4',{title:'Private Fireball Player AV1',width:1600,height:1080}));start=Date.now();
  writeFileSync(output+'/sync.json',JSON.stringify({dmOffset:(start-captures[0].startedAt)/1000,playerOffset:(start-captures[1].startedAt)/1000}));
 }
 await chapter('Player: choose Fireball and place its area over three goblins');
 const combat=player.locator('.compact-player-combat');await combat.getByRole('combobox').last().selectOption('3');
 await click(player,combat.getByRole('button',{name:/Fireball/}));
 const area=player.getByRole('region',{name:'Place spell area'});await expect(area).toBeVisible();
 const p=await player.evaluate(id=>{
  const s=(window as any).Konva.stages.find((s:any)=>s.find('.token').some((n:any)=>n.getAttr('tokenId')===id)),n=s.find('.token').find((n:any)=>n.getAttr('tokenId')===id),q=n.getAbsolutePosition(),r=s.container().getBoundingClientRect();
  const v=new DOMPoint(q.x-s.width()/2,q.y-s.height()/2).matrixTransform(new DOMMatrix(getComputedStyle(n.getLayer().getNativeCanvasElement()).transform));
  return{x:r.left+s.width()/2+v.x/v.w,y:r.top+s.height()/2+v.y/v.w};
 },enemies[1].id);
 await player.mouse.move(p.x-35,p.y-20,{steps:22});
 await expect.poll(async()=>(await spellShapes(dm,'aiming')).length).toBe(1);
 const firstArea=(await spellShapes(dm,'aiming'))[0];expect(firstArea.radius).toBe(256);
 await click(player,area.getByRole('button',{name:'Cancel (Esc)',exact:true}));
 await expect.poll(async()=>(await spellShapes(dm,'aiming')).length).toBe(0);
 await click(player,combat.getByRole('button',{name:/Fireball/}));
 await player.mouse.move(p.x-35,p.y-20,{steps:22});
 await expect.poll(async()=>(await spellShapes(dm,'aiming')).length).toBe(1);
 await player.mouse.move(p.x,p.y,{steps:22});
 await expect.poll(async()=>(await spellShapes(dm,'aiming'))[0]?.x).not.toBe(firstArea.x);
 await player.mouse.click(p.x,p.y);if(output)await player.waitForTimeout(2200);
 await click(player,area.getByRole('button',{name:/Confirm area/}));
 await expect(player.locator('[data-live-dice=true] .tray-die-result')).toHaveCount(8,{timeout:30000});
 await chapter('Player: roll Fireball damage once; creature saves stay private');
 const prompt=dm.getByRole('region',{name:'Saving throw needed'});
 await expect(prompt).toBeVisible({timeout:45000});
 for(const view of [dm,player])await expect.poll(async()=>(await spellShapes(view,'resolving')).length).toBe(1);await expect(prompt).toContainText('Fireball');await expect(prompt).toContainText('DEX');
 await expect(player.locator('.roll-reveal-backdrop')).toHaveCount(0,{timeout:10000});
 expect((await snapshot()).monsters.filter(m=>enemies.some(t=>t.refId===m.id)).every(m=>m.curHp===120)).toBe(true);
 expect(hp).toHaveLength(0);expect((await playerSnapshot()).rollLog).toHaveLength(0);
 await chapter('DM: automatic prompt names all three creatures and their DEX saves');
 await click(dm,prompt.getByRole('button',{name:'Roll saving throw',exact:true}));
 const review=dm.getByRole('region',{name:'Approve hidden result'});
 await expect(dm.locator('[data-live-dice=true] .tray-die-result')).toHaveCount(3,{timeout:30000});
 await expect(review).toBeVisible({timeout:45000});
 expect(await review.locator('.hidden-roll-results>section').count()).toBe(3);
 const resultBounds=await review.locator('.hidden-roll-results').boundingBox();
 for(const verdict of await review.locator('.hidden-roll-verdict').all()){
  const box=await verdict.boundingBox();expect(box!.y).toBeGreaterThanOrEqual(resultBounds!.y);expect(box!.y+box!.height).toBeLessThanOrEqual(resultBounds!.y+resultBounds!.height);
 }
 await chapter('DM: grouped saves roll together with each goblin labeled');
 expect(hp).toHaveLength(0);expect(frames.every(f=>!f.saveDice&&f.sides.every((s:number)=>s===6))).toBe(true);expect(reviews).toEqual([]);
 for(const view of [dm,player])expect(await spellShapes(view,'resolving')).toHaveLength(1);
 const reviewId=await review.getAttribute('data-review-id');await click(dm,review.getByRole('button',{name:'Reject & reroll',exact:true}));
 await expect(review).not.toHaveAttribute('data-review-id',reviewId!,{timeout:45000});
 await chapter('DM: reroll the grouped saves without rerolling Fireball damage');
 // All grouped fields must be visible, rather than merely present in the DOM.
 await click(dm,review.getByRole('button',{name:'Enter result',exact:true}));
 const values=review.locator('input[type=number]');expect(await values.count()).toBe(3);
 for(let i=0;i<3;i++){
  await expectUnclipped(values.nth(i));
  await expect(review.getByLabel(`Goblin ${i+1} · d20`,{exact:true})).toHaveCount(1);
 }
 const originals=await values.evaluateAll(inputs=>inputs.map(el=>Number((el as HTMLInputElement).value)));
 // Edit only G1 and prove G2/G3 keep their original faces and calculated totals.
 const changed=originals[0]===4?5:4;
 await values.first().fill(String(changed));
 await chapter('DM: change only G1; G2 and G3 retain their original rolls');
 await click(dm,review.getByRole('button',{name:'Review entered result',exact:true}));
 const totals=review.locator('.hidden-roll-verdict b');
 await expect(totals.nth(0)).toHaveText(`Total ${changed+2}`);
 await expect(totals.nth(1)).toHaveText(`Total ${originals[1]+2}`);
 await expect(totals.nth(2)).toHaveText(`Total ${originals[2]+2}`);
 await click(dm,review.getByRole('button',{name:'Enter result',exact:true}));
 await expect(values.nth(1)).toHaveValue(String(originals[1]));await expect(values.nth(2)).toHaveValue(String(originals[2]));
 if(!output){
  await dm.setViewportSize({width:412,height:915});
  for(const field of await values.all())await expectUnclipped(field);
  await expectUnclipped(review.getByRole('button',{name:'Review entered result',exact:true}));
  await dm.setViewportSize({width:1600,height:1000});
 }else await dm.waitForTimeout(2800);
 // Enter contrasting outcomes explicitly so the video explains full/half damage.
 for(let i=0;i<3;i++)await values.nth(i).fill(String([4,12,18][i]));
 if(output)await dm.waitForTimeout(2000);await click(dm,review.getByRole('button',{name:'Review entered result',exact:true}));
 await expect(review).toContainText('DM-entered result');await expect(review).toContainText('Save failed');await expect(review).toContainText('Save passed');
 expect(hp).toHaveLength(0);expect((await playerSnapshot()).rollLog).toHaveLength(0);
 for(const view of [dm,player])expect(await spellShapes(view,'resolving')).toHaveLength(1);
 await chapter('DM: review failed and passed saves; nothing applies until accepted');
 await click(dm,review.getByRole('button',{name:'Apply result',exact:true}));await expect(review).toHaveCount(0);
 for(const view of [dm,player])await expect.poll(async()=>(await spellShapes(view,'resolving')).length).toBe(0);
 await expect.poll(()=>hp.length,{timeout:15000}).toBeGreaterThanOrEqual(3);
 const resolved=await snapshot(),visible=await playerSnapshot();
 const cast=resolved.rollLog.find(r=>r.label==='Fireball')!,saves=resolved.rollLog.filter(r=>r.label==='DEX save');
 expect(saves).toHaveLength(3);expect(saves.every(s=>s.dmOnly)).toBe(true);
 const damage=cast.total;expect(damage).toBeGreaterThan(0);
 const losses=enemies.map(t=>120-resolved.monsters.find(m=>m.id===t.refId)!.curHp);
 expect(losses.sort((a,b)=>a-b)).toEqual([Math.floor(damage/2),damage,damage].sort((a,b)=>a-b));
 const summaries=visible.rollLog.filter(r=>r.label==='DEX save');expect(summaries).toHaveLength(3);
 expect(summaries.every(r=>r.outcomeOnly&&!r.reveal&&!r.expr&&r.hideTotal)).toBe(true);
 expect(summaries.every(r=>/fire damage/.test(r.detail)&&!/(?:d20|DC|modifier|\+|DEX\s*[+-])/.test(r.detail))).toBe(true);
 expect(frames.every(f=>!f.saveDice&&f.sides.every((s:number)=>s===6))).toBe(true);
 await chapter('Player: accepted outcomes and synchronized Fireball damage appear');
 if(output)await player.waitForTimeout(5500);
 await click(player,player.getByRole('button',{name:'Open chat and roll log',exact:true}));
 await player.locator('.roll-log').evaluate(el=>{el.scrollTop=el.scrollHeight;});
 await chapter('Player: log shows pass or fail and damage, with no creature dice or bonuses');
 if(output)await player.waitForTimeout(5500);
 const evidence={playerDamageDice:frames.filter(f=>f.done).at(-1)?.values,hiddenSaveFramesToPlayer:frames.filter(f=>f.saveDice).length,privateReviewsToPlayer:reviews.length,damage,losses,saves,playerLog:visible.rollLog};
 await test.info().attach('hidden-area-evidence',{body:JSON.stringify(evidence,null,2),contentType:'application/json'});
 if(output){writeFileSync(output+'/chapters.json',JSON.stringify(chapters,null,2));writeFileSync(output+'/evidence.json',JSON.stringify(evidence,null,2));}
 }finally{for(const capture of captures)console.log(await capture.stop());sockets.forEach(s=>s.disconnect());await playerContext.close();}
});
