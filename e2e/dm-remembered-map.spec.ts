import {test,expect} from '@playwright/test';
import {io} from 'socket.io-client';
import sharp from 'sharp';
import {DM_SECRET,PORT} from './playwright.config';
import {openToolbarGroup} from './helpers/mobileToolbar';
import {xy} from './helpers/movementProbe';

for(const mode of ['legacy','2d'])for(const assist of [false,true])for(const shared of [false,true]){
 test(`DM remembered map survives walking and reload: ${mode}, assist ${assist}, shared ${shared}`,async({page,request},info)=>{
  test.setTimeout(120000);await page.setViewportSize({width:1600,height:1000});
  const headers={'x-dm-passphrase':DM_SECRET};
  const {code}=await(await request.post('/api/sessions',{headers,data:{name:'DM memory regression'}})).json();
  const map=await(await request.post(`/api/sessions/${code}/maps`,{headers,multipart:{name:'Colored corridor',image:{name:'corridor.png',mimeType:'image/png',buffer:await sharp({create:{width:3600,height:1400,channels:3,background:'#bb472e'}}).png().toBuffer()}}})).json();
  // Deliberately no player connection: the DM is the only live viewer.
  const admin=io(`http://localhost:${PORT}`,{transports:['websocket']});
  const state=async()=>(await admin.timeout(15000).emitWithAck('join',{sessionCode:code,role:'dm',dmPassphrase:DM_SECRET})).snapshot;
  try{
   const pc=(await state()).characters.find((c:any)=>c.name==='Druk');
   admin.emit('map:setActive',{mapId:map.id});admin.emit('map:setGrid',{mapId:map.id,gridSizePx:50,feetPerSquare:5,widthFt:360,locked:true});
   for(const layer of ['map','tokens'])admin.emit('fog:setLayer',{mapId:map.id,layer,enabled:false});
   admin.emit('fog:setPartyVision',{mapId:map.id,enabled:shared});
   admin.emit('map:setEnvironment',{mapId:map.id,settings:{enabled:true,heavyDarkness:true,lighting:'dungeon',shadows:false,mist:false,lights:[]}});
   admin.emit('token:spawn',{mapId:map.id,kind:'pc',refId:pc.id,x:600,y:700});
   const token=(await state()).tokens.find((t:any)=>t.refId===pc.id);
   await page.addInitScript(({mode,assist})=>{sessionStorage.setItem('dnd.rendering-started','1');localStorage.setItem('dnd-environment-quality',mode==='legacy'?'legacy':'low');localStorage.setItem('dnd-server-rendering',assist?'on':'off');localStorage.setItem('dnd.playerId','dm-memory-preview');localStorage.setItem('dnd.battlefieldView:dm-memory-preview','overhead');localStorage.setItem('dnd.tokenView:dm-memory-preview','2d');localStorage.setItem('dnd.monsterTokenView:dm-memory-preview','2d');}, {mode,assist});
   const enter=async(reload=false)=>{
    await page.goto(`/dm?code=${code}`);
    if(!reload){await page.locator('input[type=password]').fill(DM_SECRET);await page.getByRole('button',{name:'Rejoin as DM',exact:true}).click();}
    await openToolbarGroup(page,'View');await page.getByLabel('Battlefield visibility',{exact:true}).selectOption('player');await page.keyboard.press('Escape');
    await expect(page.getByTestId(mode==='legacy'?'legacy-vision':'player-vision')).toBeVisible();
    await expect.poll(()=>page.evaluate(id=>!!(window as any).Konva?.stages.flatMap((s:any)=>s.find('.token')).find((n:any)=>n.getAttr('tokenId')===id),token.id)).toBe(true);
   };
   await enter();
   const pixel=async(x:number,y:number)=>{const p=await xy(page,token.id,x,y);return [...await sharp(await page.screenshot()).extract({left:Math.round(p.x),top:Math.round(p.y),width:1,height:1}).removeAlpha().raw().toBuffer()];};
   await expect.poll(async()=>(await pixel(900,450))[0]).toBeGreaterThan(25);
   expect((await pixel(1800,450))[0]).toBeLessThan(12);
   const move=async(x:number)=>{await admin.timeout(20000).emitWithAck('token:move',{tokenId:token.id,x,y:700});await expect.poll(()=>page.evaluate(id=>(window as any).Konva.stages.flatMap((s:any)=>s.find('.token')).find((n:any)=>n.getAttr('tokenId')===id)?.x(),token.id)).toBeCloseTo(x,0);};
   await move(3000);await move(600);
   // Mid-route sight is beyond both endpoint vision circles; it must be saved.
   await expect.poll(async()=>(await pixel(1800,450))[0]).toBeGreaterThan(12);
   const remembered=await pixel(3000,450),current=await pixel(900,450);
   expect(remembered[0]).toBeGreaterThan(12);expect(remembered[0]).toBeLessThan(current[0]*.7);
   await enter(true);
   await expect.poll(async()=>(await pixel(1800,450))[0]).toBeGreaterThan(12);
   await expect.poll(async()=>(await pixel(3000,450))[0]).toBeGreaterThan(12);
   await page.screenshot({path:info.outputPath('dm-remembered-after-reload.png')});
  }finally{admin.disconnect();}
 });
}
