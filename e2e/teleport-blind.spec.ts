import {test,expect} from '@playwright/test';
import {io} from 'socket.io-client';
import sharp from 'sharp';
import {DM_SECRET,PORT} from './playwright.config';
import {openToolbarGroup} from './helpers/mobileToolbar';
import {xy} from './helpers/movementProbe';

for(const mode of ['legacy','2d'])for(const assist of [false,true]){
 test(`DM teleport and blind exploration: ${mode}, assist ${assist}`,async({browser,request},info)=>{
  test.setTimeout(90000);
  const context=await browser.newContext({baseURL:`http://localhost:${PORT}`,viewport:{width:1400,height:900},hasTouch:assist});
  const page=await context.newPage(),headers={'x-dm-passphrase':DM_SECRET};
  const {code}=await(await request.post('/api/sessions',{headers,data:{name:'Teleport and blindness'}})).json();
  const map=await(await request.post(`/api/sessions/${code}/maps`,{headers,multipart:{name:'Corridor',image:{name:'corridor.png',mimeType:'image/png',buffer:await sharp({create:{width:5200,height:1400,channels:3,background:'#bb472e'}}).png().toBuffer()}}})).json();
  const dm=io(`http://localhost:${PORT}`,{transports:['websocket']});
  const state=async()=>(await dm.timeout(15000).emitWithAck('join',{sessionCode:code,role:'dm',dmPassphrase:DM_SECRET})).snapshot;
  try{
   const pc=(await state()).characters.find((c:any)=>c.name==='Druk');
   dm.emit('map:setActive',{mapId:map.id});dm.emit('map:setGrid',{mapId:map.id,gridSizePx:50,feetPerSquare:5,widthFt:520,locked:true});
   for(const layer of ['map','tokens'])dm.emit('fog:setLayer',{mapId:map.id,layer,enabled:false});
   dm.emit('fog:setPartyVision',{mapId:map.id,enabled:false});
   dm.emit('map:setEnvironment',{mapId:map.id,settings:{enabled:true,heavyDarkness:true,lighting:'dungeon',shadows:false,mist:false,lights:[]}});
   dm.emit('token:spawn',{mapId:map.id,kind:'pc',refId:pc.id,x:600,y:700});
   const token=(await state()).tokens.find((t:any)=>t.refId===pc.id);
   await page.addInitScript(({mode,assist})=>{sessionStorage.setItem('dnd.rendering-started','1');localStorage.setItem('dnd-environment-quality',mode==='legacy'?'legacy':'low');localStorage.setItem('dnd-server-rendering',assist?'on':'off');localStorage.setItem('dnd.playerId','teleport-test');localStorage.setItem('dnd.battlefieldView:teleport-test','overhead');localStorage.setItem('dnd.tokenView:teleport-test','2d');}, {mode,assist});
   await page.goto(`/dm?code=${code}`);await page.locator('input[type=password]').fill(DM_SECRET);await page.getByRole('button',{name:'Rejoin as DM',exact:true}).click();
   await openToolbarGroup(page,'View');await page.getByLabel('Battlefield visibility',{exact:true}).selectOption('player');await page.keyboard.press('Escape');
   const vision=page.getByTestId(mode==='legacy'?'legacy-vision':'player-vision');await expect(vision).toHaveAttribute('data-origin-count','1');
   const tokenX=()=>page.evaluate(id=>(window as any).Konva?.stages.flatMap((s:any)=>s.find('.token')).find((n:any)=>n.getAttr('tokenId')===id)?.x(),token.id);
   await expect.poll(tokenX).toBe(600);
   const pixel=async(x:number)=>{const p=await xy(page,token.id,x,453);return (await sharp(await page.screenshot()).extract({left:Math.round(p.x),top:Math.round(p.y),width:1,height:1}).removeAlpha().raw().toBuffer())[0];};
   await expect.poll(()=>pixel(900)).toBeGreaterThan(25);await expect.poll(()=>pixel(1600)).toBeLessThan(12);
   const point=await xy(page,token.id);
   if(assist){const touch=await context.newCDPSession(page);await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...point,id:1}]});await page.waitForTimeout(650);await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});}
   else await page.mouse.click(point.x,point.y,{button:'right'});
   await page.getByRole('button',{name:'Teleport token',exact:true}).click();await expect(page.getByRole('button',{name:'Cancel teleport'})).toBeVisible();
   const dest=await xy(page,token.id,2600,700);if(assist)await page.touchscreen.tap(dest.x,dest.y);else await page.mouse.click(dest.x,dest.y);
   await expect.poll(tokenX).toBeCloseTo(2600,0);expect((await state()).tokens.find((t:any)=>t.id===token.id).teleportedAt).toBeDefined();
   await expect.poll(()=>pixel(1600)).toBeLessThan(12);
   dm.emit('condition:set',{kind:'pc',refId:pc.id,condition:{label:'Blinded',aura:'red',isConcentration:false}});
   await expect(vision).toHaveAttribute('data-origin-count','0');
   await dm.timeout(20000).emitWithAck('token:move',{tokenId:token.id,x:4600,y:700});await expect.poll(tokenX).toBe(4600);
   await expect.poll(()=>pixel(4600)).toBeLessThan(12);
   await dm.timeout(20000).emitWithAck('token:move',{tokenId:token.id,x:600,y:700});await expect.poll(tokenX).toBe(600);
   const condition=(await state()).characters.find((c:any)=>c.id===pc.id).conditions.find((c:any)=>c.label==='Blinded');
   dm.emit('condition:clear',{kind:'pc',refId:pc.id,conditionId:condition.id});await expect(vision).toHaveAttribute('data-origin-count','1');
   await expect.poll(()=>pixel(900)).toBeGreaterThan(25);expect(await pixel(1600)).toBeLessThan(12);expect(await pixel(4600)).toBeLessThan(12);
   await expect.poll(()=>pixel(2600)).toBeGreaterThan(12);
   await page.screenshot({path:info.outputPath('teleport-and-blind-memory.png')});
  }finally{dm.disconnect();await context.close();}
 });
}

for(const assist of [false,true])test(`Blind player in daylight with automatic fog off (assist ${assist})`,async({page,request},info)=>{
 test.setTimeout(90000);await page.setViewportSize({width:1400,height:900});
 const headers={'x-dm-passphrase':DM_SECRET};
 const {code}=await(await request.post('/api/sessions',{headers,data:{name:'Blind daylight'}})).json();
 const map=await(await request.post(`/api/sessions/${code}/maps`,{headers,multipart:{name:'Daylight',image:{name:'day.png',mimeType:'image/png',buffer:await sharp({create:{width:3000,height:1400,channels:3,background:'#bb472e'}}).png().toBuffer()}}})).json();
 const dm=io(`http://localhost:${PORT}`,{transports:['websocket']});
 const state=async()=>(await dm.timeout(15000).emitWithAck('join',{sessionCode:code,role:'dm',dmPassphrase:DM_SECRET})).snapshot;
 try{
  const pc=(await state()).characters.find((c:any)=>c.name==='Druk');dm.emit('map:setActive',{mapId:map.id});
  for(const layer of ['map','tokens']){dm.emit('fog:setLayer',{mapId:map.id,layer,enabled:false});dm.emit('fog:setVision',{mapId:map.id,layer,enabled:false});}
  dm.emit('fog:setPartyVision',{mapId:map.id,enabled:false});dm.emit('condition:set',{kind:'pc',refId:pc.id,condition:{label:'Blinded',aura:'red',isConcentration:false}});
  dm.emit('token:spawn',{mapId:map.id,kind:'pc',refId:pc.id,x:600,y:700});const token=(await state()).tokens.find((t:any)=>t.refId===pc.id);
  await page.addInitScript(assist=>{sessionStorage.setItem('dnd.rendering-started','1');localStorage.setItem('dnd-environment-quality',assist?'legacy':'low');localStorage.setItem('dnd-server-rendering',assist?'on':'off');localStorage.setItem('dnd.playerId','blind-player');localStorage.setItem('dnd.battlefieldView:blind-player','overhead');localStorage.setItem('dnd.tokenView:blind-player','2d');},assist);
  await page.goto(`/join?code=${code}`);await page.getByRole('button',{name:'Join',exact:true}).click();await page.locator('.claim-row').filter({hasText:'Druk'}).click();
  const collapse=page.getByRole('button',{name:'Collapse combat',exact:true});if(await collapse.isVisible())await collapse.click();
  const vision=page.getByTestId(assist?'legacy-vision':'player-vision');await expect(vision).toHaveAttribute('data-origin-count','0');
  await expect.poll(()=>page.evaluate(id=>!!(window as any).Konva?.stages.flatMap((s:any)=>s.find('.token')).find((n:any)=>n.getAttr('tokenId')===id),token.id)).toBe(true);
  const pixel=async()=>{const p=await xy(page,token.id,900,453);return (await sharp(await page.screenshot()).extract({left:Math.round(p.x),top:Math.round(p.y),width:1,height:1}).removeAlpha().raw().toBuffer())[0];};
  await expect.poll(pixel).toBeLessThan(12);
  const from=await xy(page,token.id),to=await xy(page,token.id,1000,700);
  const marker=await sharp(await page.screenshot()).extract({left:Math.round(from.x),top:Math.round(from.y),width:1,height:1}).removeAlpha().raw().toBuffer();
  expect(Math.max(...marker)).toBeGreaterThan(20);
  await page.mouse.move(from.x,from.y);await page.mouse.down();await page.mouse.move(to.x,to.y,{steps:8});await page.mouse.up();
  await expect.poll(async()=>Math.abs((await state()).tokens.find((t:any)=>t.id===token.id).x-1000)).toBeLessThan(5);
  await expect.poll(pixel).toBeLessThan(12);await page.screenshot({path:info.outputPath('blind-daylight.png')});
  const condition=(await state()).characters.find((c:any)=>c.id===pc.id).conditions.find((c:any)=>c.label==='Blinded');
  dm.emit('condition:clear',{kind:'pc',refId:pc.id,conditionId:condition.id});await expect.poll(pixel).toBeGreaterThan(80);
 }finally{dm.disconnect();}
});
