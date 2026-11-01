import {test,expect} from '@playwright/test';
import {io} from 'socket.io-client';
import sharp from 'sharp';
import {DM_SECRET,PORT} from './playwright.config';
import {openToolbarGroup} from './helpers/mobileToolbar';

// Inspect actual rendered anchors throughout motion, not just endpoint state:
// the endpoint can legitimately omit a creature that is still beside the walker.
for(const mode of ['legacy','2d','3d'] as const)for(const assist of [false,true]){
 test(`${mode}, assist ${assist}: creatures follow walking sight for player and DM preview`,async({browser,request})=>{
  test.setTimeout(120000);
  const headers={'x-dm-passphrase':DM_SECRET};
  const {code}=await(await request.post('/api/sessions',{headers,data:{name:'Movement membership regression'}})).json();
  const image=await sharp({create:{width:3000,height:1400,channels:3,background:'#80745c'}}).png().toBuffer();
  const map=await(await request.post(`/api/sessions/${code}/maps`,{headers,multipart:{name:'Dark corridor',image:{name:'corridor.png',mimeType:'image/png',buffer:image}}})).json();
  const admin=io(`http://localhost:${PORT}`,{transports:['websocket']});
  const state=async()=>(await admin.timeout(15000).emitWithAck('join',{sessionCode:code,role:'dm',dmPassphrase:DM_SECRET})).snapshot;
  const contexts:Awaited<ReturnType<typeof browser.newContext>>[]=[];
  try{
   const initial=await state(),pc=initial.characters.find((c:any)=>c.name==='Druk');
   admin.emit('map:setActive',{mapId:map.id});
   admin.emit('map:setGrid',{mapId:map.id,gridSizePx:50,feetPerSquare:5,widthFt:300,locked:true});
   for(const layer of ['map','tokens'])admin.emit('fog:setLayer',{mapId:map.id,layer,enabled:false});
   admin.emit('map:setEnvironment',{mapId:map.id,settings:{enabled:true,heavyDarkness:true,lighting:'dungeon',shadows:true,mist:false,lights:[]}});
   admin.emit('token:spawn',{mapId:map.id,kind:'pc',refId:pc.id,x:300,y:900});
   admin.emit('monster:create',{name:'Passing guard',modelType:'goblin',icon:'G',maxHp:20,armorClass:13,disposition:'enemy'});
   const template=(await state()).monsterTemplates.find((m:any)=>m.name==='Passing guard');
   for(const x of [1100,1850])admin.emit('token:spawn',{mapId:map.id,kind:'monster',refId:template.id,x,y:750});
   const all=await state(),hero=all.tokens.find((t:any)=>t.kind==='pc'),guards=all.tokens.filter((t:any)=>t.kind==='monster');
   admin.emit('token:setLantern',{tokenId:hero.id,enabled:true});await state();
   const pages=[];
   for(const role of ['player','dm']){
    const context=await browser.newContext({baseURL:`http://localhost:${PORT}`,viewport:{width:1600,height:1000}});contexts.push(context);
    await context.addInitScript(({mode,assist,role})=>{
     sessionStorage.setItem('dnd.rendering-started','1');localStorage.setItem('dnd-environment-quality',mode==='legacy'?'legacy':'low');localStorage.setItem('dnd-server-rendering',assist?'on':'off');
     const id=`membership-${role}`;localStorage.setItem('dnd.playerId',id);localStorage.setItem(`dnd.battlefieldView:${id}`,mode==='3d'?'tilted':'overhead');localStorage.setItem(`dnd.tokenView:${id}`,mode==='2d'?'2d':'3d');localStorage.setItem(`dnd.monsterTokenView:${id}`,mode==='2d'?'2d':'3d');
    },{mode,assist,role});
    const page=await context.newPage();pages.push(page);
    if(role==='player'){
     await page.goto(`/join?code=${code}`);await page.getByRole('button',{name:'Join',exact:true}).click();await page.locator('.claim-row').filter({hasText:'Druk'}).click();
    }else{
     await page.goto(`/dm?code=${code}`);await page.locator('input[type=password]').fill(DM_SECRET);await page.getByRole('button',{name:'Rejoin as DM',exact:true}).click();
     await openToolbarGroup(page,'View');await page.getByLabel('Battlefield visibility',{exact:true}).selectOption('player');
    }
    await expect(page.locator('.stage-wrap')).toHaveAttribute('data-render-mode',mode==='legacy'?'legacy':'standard');
    if(mode==='3d')await expect(page.getByTestId('miniature-layer')).toHaveAttribute('data-miniature-status','ready',{timeout:60000});
    await page.waitForFunction(id=>(window as any).Konva?.stages.some((s:any)=>s.find('.token').some((n:any)=>n.getAttr('tokenId')===id)),hero.id);
    await page.evaluate(({hero,guards})=>{
     const w=window as any;w.__membership={samples:[],watch:false};
     const sample=()=>{if(w.__membership.watch){const nodes=w.Konva.stages.flatMap((s:any)=>s.find('.token')),actor=nodes.find((n:any)=>n.getAttr('tokenId')===hero);
      w.__membership.samples.push({x:actor?.x(),shown:guards.filter(id=>nodes.some((n:any)=>n.getAttr('tokenId')===id&&n.isVisible()&&n.opacity()>.01))});}requestAnimationFrame(sample);};sample();
    },{hero:hero.id,guards:guards.map((t:any)=>t.id)});
   }
   const move=async(x:number,relocate=false)=>{
    for(const page of pages)await page.evaluate(()=>{const p=(window as any).__membership;p.samples=[];p.watch=true;});
    await admin.timeout(15000).emitWithAck('token:move',{tokenId:hero.id,x,y:900,...(relocate?{movement:'relocate'}:{})});
    for(const page of pages)await expect.poll(()=>page.evaluate(id=>(window as any).Konva.stages.flatMap((s:any)=>s.find('.token')).find((n:any)=>n.getAttr('tokenId')===id)?.x(),hero.id),{timeout:15000}).toBeCloseTo(x,0);
    // Let the final membership frame paint before inspecting the captured route.
    await pages[0].waitForTimeout(100);
    return Promise.all(pages.map(page=>page.evaluate(()=>{const p=(window as any).__membership;p.watch=false;return p.samples as {x:number;shown:string[]}[];})));
   };
   // Both creatures are absent at both endpoints but must appear along the path.
   for(const samples of await move(2700))for(const guard of guards){
    const beside=samples.filter(s=>Math.abs(s.x-guard.x)<200);
    expect(beside.length,'sampled the interior of the visibility circle').toBeGreaterThan(0);
    expect(beside.every(s=>s.shown.includes(guard.id)),'creature stays visible beside the moving viewer').toBe(true);
    expect(samples.at(-1)!.shown).not.toContain(guard.id);
   }
   await move(1500,true);
   // Guard A is visible at the start, but not the endpoint. It must not disappear
   // at release while the viewer is still 40-50ft away (the original video bug).
   const first=guards.find((g:any)=>g.x===1100);
   for(const samples of await move(1900)){
    const beforeEdge=samples.filter(s=>s.x>1505&&s.x<1600);
    expect(beforeEdge.length).toBeGreaterThan(0);expect(beforeEdge.every(s=>s.shown.includes(first.id))).toBe(true);
    expect(samples.at(-1)!.shown).not.toContain(first.id);
   }
   // A relocation must not authorize intervening creatures.
   await move(2700,true);
   for(const samples of await move(300,true))expect(samples.every(s=>s.shown.length===0)).toBe(true);
   if(mode!=='legacy'){
    // Revoking a creature that only exists in the departure frame must cancel
    // the old plan, even though it was already absent from the destination list.
    await move(1500,true);
    admin.emit('token:move',{tokenId:hero.id,x:1900,y:900});
    await pages[0].waitForFunction(()=>document.querySelector('.stage-wrap')?.getAttribute('data-motion-stage')==='playing');
    admin.emit('token:setHidden',{tokenId:first.id,hidden:true});
    for(const page of pages){
     await page.waitForFunction(id=>!(window as any).Konva.stages.some((s:any)=>s.find('.token').some((n:any)=>n.getAttr('tokenId')===id)),first.id);
     await page.waitForTimeout(450);
     expect(await page.evaluate(id=>(window as any).Konva.stages.some((s:any)=>s.find('.token').some((n:any)=>n.getAttr('tokenId')===id)),first.id)).toBe(false);
    }
   }
  }finally{admin.disconnect();await Promise.all(contexts.map(c=>c.close()));}
 });
}
