import {test,expect,webglDisabled,type Page} from './helpers/test';
import {io,type Socket} from 'socket.io-client';
import sharp from 'sharp';
import {DM_SECRET,PORT} from './playwright.config';

test('Legacy player and DM keep d20, percentile and creature art for two 3D observers',async({browser,request},info)=>{
 test.skip(webglDisabled,'Verifies actual dice materials.');test.setTimeout(180000);
 const headers={'x-dm-passphrase':DM_SECRET},sockets:Socket[]=[],contexts:Awaited<ReturnType<typeof browser.newContext>>[]=[],errors:string[]=[];
 const {code}=await(await request.post('/api/sessions',{headers,data:{name:'Mixed Legacy dice appearance'}})).json();
 const connect=async(role:'dm'|'player')=>{
  const socket=io(`http://localhost:${PORT}`,{transports:['websocket'],forceNew:true});sockets.push(socket);
  const joined=await socket.timeout(10000).emitWithAck('join',{sessionCode:code,role,legacyRendering:true,dmPassphrase:role==='dm'?DM_SECRET:undefined});expect(joined.ok).toBe(true);
  socket.on('dice:frame',f=>socket.emit('dice:ready',{id:f.id}));return {socket,snapshot:joined.snapshot};
 };
 try{
  const {socket:dm,snapshot}=await connect('dm'),{socket:vanec}=await connect('player');
  const state=async()=>(await dm.timeout(10000).emitWithAck('join',{sessionCode:code,role:'dm',legacyRendering:true,dmPassphrase:DM_SECRET})).snapshot;
  const png=await sharp({create:{width:900,height:600,channels:3,background:'#77634b'}}).png().toBuffer();
  const map=await(await request.post(`/api/sessions/${code}/maps`,{headers,multipart:{name:'Dice room',image:{name:'room.png',mimeType:'image/png',buffer:png}}})).json();
  dm.emit('map:setActive',{mapId:map.id});
  for(const layer of ['map','tokens']){dm.emit('fog:setLayer',{mapId:map.id,layer,enabled:false});dm.emit('fog:setVision',{mapId:map.id,layer,enabled:false});}
  dm.emit('map:setEnvironment',{mapId:map.id,settings:{enabled:false,lighting:'day',heavyDarkness:false,mist:false}});
  const caster=snapshot.characters.find((c:any)=>c.name==='Vanec');
  dm.emit('character:update',{characterId:caster.id,className:'Sorcerer'});await state();
  const claimed=new Promise<void>(resolve=>{vanec.on('state:snapshot',s=>{if(s.characters.some((c:any)=>c.id===caster.id&&c.claimedBy===vanec.id))resolve();});});
  vanec.emit('character:claim',{characterId:caster.id});await claimed;
  dm.emit('monster:create',{name:'Dice goblin',modelType:'goblin',maxHp:20,stats:{DEX:14},disposition:'enemy'});
  const template=(await state()).monsterTemplates.find((m:any)=>m.name==='Dice goblin');dm.emit('token:spawn',{mapId:map.id,kind:'monster',refId:template.id,x:600,y:300});
  const creature=(await state()).tokens.find((t:any)=>t.kind==='monster');
  const viewers:Page[]=[];
  for(const name of ['Druk','Varis']){
   const context=await browser.newContext({viewport:{width:1440,height:960}});contexts.push(context);const page=await context.newPage();viewers.push(page);page.on('pageerror',e=>errors.push(e.message));
   await page.addInitScript(name=>{sessionStorage.setItem('dnd.rendering-started','1');localStorage.setItem('dnd.playerId',`dice-observer-${name}`);localStorage.setItem('dnd-environment-quality','low');localStorage.setItem(`dnd.tokenView:dice-observer-${name}`,'3d');localStorage.setItem(`dnd.monsterTokenView:dice-observer-${name}`,'3d');},name);
   await page.goto(`/join?code=${code}`);await page.getByRole('button',{name:'Join',exact:true}).click();await page.locator('.claim-row').filter({hasText:name}).click();await expect(page.getByTestId('player-hud')).toBeVisible();
   await expect(page.locator('[data-liquid-motion="static"][data-liquid-renderer="fallback"]')).toBeVisible();
  }
  // Both observers finish material preparation before the shared physics toss.
  // The initiating Legacy connection never imports a dice renderer itself.
  for(const page of viewers)await expect.poll(()=>page.evaluate(()=>document.documentElement.dataset.dicePreloadedThemes??''),{timeout:60000}).toContain('sorcerer');
  const frames:any[]=[];dm.on('dice:frame',f=>frames.push(f));
  for(const plan of [
   {owner:vanec,event:'dice:roll',payload:{expr:'1d20',label:'Vanec d20'},theme:'sorcerer',count:1},
   {owner:vanec,event:'dice:roll',payload:{expr:'1d100',label:'Vanec d100'},theme:'sorcerer',count:2},
   {owner:dm,event:'dice:roll',payload:{expr:'1d20',label:'Legacy DM d20'},theme:'dm-neutral-roll',count:1},
   {owner:dm,event:'dice:roll',payload:{expr:'1d100',label:'Legacy DM d100'},theme:'dm-neutral-roll',count:2},
   {owner:dm,event:'save:roll',payload:{kind:'monster',refId:creature.refId,ability:'DEX'},theme:'dm-neutral-roll',count:1},
  ]){
   const first=frames.length;plan.owner.emit(plan.event as any,plan.payload);
   await expect.poll(()=>frames.length).toBeGreaterThan(first);
   for(const [i,page] of viewers.entries()){
    const tray=page.locator('.physics-dice-tray');await expect(tray).toHaveAttribute('data-theme',plan.theme);
    await expect(tray).toHaveAttribute('data-material',plan.theme==='sorcerer'?'volumetric-glass':'purple-resin',{timeout:20000});
    await expect(tray.locator('.tray-die-result')).toHaveCount(plan.count);
    await expect(tray).toHaveAttribute('data-status','settled',{timeout:20000});
    await expect(tray.locator('.tray-die-result[data-filled="true"]')).toHaveCount(plan.count,{timeout:20000});
    await page.screenshot({path:info.outputPath(`${plan.theme}-${plan.count}-${first}-observer${i}.png`)});
   }
   expect(frames.slice(first).every(f=>plan.theme==='sorcerer'?f.className==='Sorcerer'&&!f.dmDice:f.dmDice===true)).toBe(true);
   await expect.poll(()=>frames.slice(first).some(f=>f.done),{timeout:20000}).toBe(true);
   for(const page of viewers)await expect(page.locator('[data-live-dice="true"]')).toHaveCount(0,{timeout:20000});
   for(const page of viewers){await page.keyboard.press('Escape');await expect(page.locator('.roll-reveal-backdrop')).toBeHidden({timeout:15000});}
  }
  expect(errors).toEqual([]);
 }finally{sockets.forEach(s=>s.disconnect());for(const context of contexts)await context.close();}
});
