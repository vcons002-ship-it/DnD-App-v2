import {test,expect,type Page,type APIRequestContext} from '@playwright/test';
import {io} from 'socket.io-client';
import sharp from 'sharp';
import {DM_SECRET,PORT} from './playwright.config';
import {openToolbarGroup} from './helpers/mobileToolbar';
import {xy} from './helpers/movementProbe';

async function fixture(request:APIRequestContext){
 const headers={'x-dm-passphrase':DM_SECRET};
 const {code}=await(await request.post('/api/sessions',{headers,data:{name:'Vision controls test'}})).json();
 const image=await sharp({create:{width:2200,height:1200,channels:3,background:'#bb472e'}}).png().toBuffer();
 const map=await(await request.post(`/api/sessions/${code}/maps`,{headers,multipart:{name:'Colored room',image:{name:'room.png',mimeType:'image/png',buffer:image}}})).json();
 const admin=io(`http://localhost:${PORT}`,{transports:['websocket']});
 const state=async()=>(await admin.timeout(15000).emitWithAck('join',{sessionCode:code,role:'dm',dmPassphrase:DM_SECRET})).snapshot;
 const pc=(await state()).characters.find((c:any)=>c.name==='Druk');
 admin.emit('map:setActive',{mapId:map.id});admin.emit('map:setGrid',{mapId:map.id,gridSizePx:50,feetPerSquare:5,widthFt:220,locked:true});
 for(const layer of ['map','tokens'])admin.emit('fog:setLayer',{mapId:map.id,layer,enabled:false});
 admin.emit('map:setEnvironment',{mapId:map.id,settings:{enabled:true,heavyDarkness:true,lighting:'dungeon',shadows:false,mist:false,lights:[]}});
 await state();return {code,map,pc,admin,state};
}
async function join(page:Page,code:string,assist:boolean){
 await page.addInitScript(assist=>{sessionStorage.setItem('dnd.rendering-started','1');localStorage.setItem('dnd-environment-quality','legacy');localStorage.setItem('dnd-server-rendering',assist?'on':'off');},assist);
 await page.goto(`/join?code=${code}`);await page.getByRole('button',{name:'Join',exact:true}).click();await page.locator('.claim-row').filter({hasText:'Druk'}).click();
 await expect(page.getByTestId('player-hud')).toBeVisible();
 const collapse=page.getByRole('button',{name:'Collapse combat',exact:true});if(await collapse.isVisible())await collapse.click();
}

for(const mobile of [false,true])test(`vision controls and orb actions ${mobile?'mobile':'desktop'}`,async({browser,request},info)=>{
 const f=await fixture(request),context=await browser.newContext({baseURL:`http://localhost:${PORT}`,viewport:mobile?{width:390,height:844}:{width:1280,height:900},hasTouch:mobile});
 try{
  const player=await context.newPage();await join(player,f.code,false);
  const place=player.getByRole('button',{name:'Place token',exact:true});await expect(place).toBeVisible();
  const box=(await place.boundingBox())!;expect(box.height).toBeGreaterThanOrEqual(47);expect(box.width).toBeGreaterThan(100);
  await player.screenshot({path:info.outputPath('place-token.png')});
  await place.click();await expect(player.getByRole('button',{name:/Tap map to place/,exact:true})).toHaveAttribute('aria-pressed','true');
  const board=(await player.locator('.stage-wrap').boundingBox())!;await player.mouse.click(board.x+board.width*.55,board.y+board.height*.4);
  const lamp=player.getByRole('button',{name:'Carried lantern',exact:true});await expect(lamp).toBeVisible();
  const lampBox=(await lamp.boundingBox())!;expect(lampBox.width).toBeGreaterThanOrEqual(43);expect(lampBox.height).toBeGreaterThanOrEqual(47);
  await lamp.click();await expect(lamp).toHaveAttribute('aria-pressed','true');
  expect((await f.state()).tokens.find((t:any)=>t.refId===f.pc.id)?.carriedLantern).toBe(true);
  await lamp.click();await expect(lamp).toHaveAttribute('aria-pressed','false');
  await player.screenshot({path:info.outputPath('orb-controls.png')});
  const dm=await context.newPage();await dm.addInitScript(()=>sessionStorage.setItem('dnd.rendering-started','1'));await dm.goto(`/dm?code=${f.code}`);await dm.locator('input[type=password]').fill(DM_SECRET);await dm.getByRole('button',{name:'Rejoin as DM',exact:true}).click();
  await openToolbarGroup(dm,'View');await dm.getByLabel('Battlefield visibility',{exact:true}).selectOption('player');await dm.keyboard.press('Escape');
  await openToolbarGroup(dm,'Map tools');await dm.getByRole('button',{name:/Fog/}).click();
  const shared=dm.getByRole('button',{name:'Shared party vision on',exact:true});await expect(shared).toHaveAttribute('aria-pressed','true');await shared.click();
  await expect(dm.getByRole('button',{name:'Shared party vision off',exact:true})).toHaveAttribute('aria-pressed','false');
  expect((await f.state()).map.sharedPartyVision).toBe(false);
  const outsider=io(`http://localhost:${PORT}`,{transports:['websocket']});try{
   await outsider.timeout(10000).emitWithAck('join',{sessionCode:f.code,role:'player'});outsider.emit('fog:setPartyVision',{mapId:f.map.id,enabled:true});await outsider.timeout(10000).emitWithAck('join',{sessionCode:f.code,role:'player'});
   expect((await f.state()).map.sharedPartyVision).toBe(false);
  }finally{outsider.disconnect();}
  await dm.getByRole('button',{name:'Reset player remembered map',exact:true}).click();await expect(dm.getByRole('button',{name:'Confirm reset remembered map',exact:true})).toBeVisible();
  await dm.screenshot({path:info.outputPath('fog-controls.png')});
 }finally{f.admin.disconnect();await context.close();}
});

for(const assist of [false,true])test(`Legacy darkvision, light color and memory (assist ${assist})`,async({page,request},info)=>{
 test.setTimeout(120000);await page.setViewportSize({width:1280,height:900});const f=await fixture(request);
 try{
  f.admin.emit('token:spawn',{mapId:f.map.id,kind:'pc',refId:f.pc.id,x:800,y:600});const token=(await f.state()).tokens.find((t:any)=>t.refId===f.pc.id);
  await join(page,f.code,assist);await expect(page.getByTestId('legacy-terrain')).toHaveAttribute('data-grading',assist?'server':'local');
  await page.waitForFunction(id=>(window as any).Konva.stages.some((s:any)=>s.find('.token').some((n:any)=>n.getAttr('tokenId')===id)),token.id);
  const pixel=async(x:number,y:number)=>{const p=await xy(page,token.id,x,y);const b=await page.screenshot();const {data}=await sharp(b).extract({left:Math.round(p.x),top:Math.round(p.y),width:1,height:1}).removeAlpha().raw().toBuffer({resolveWithObject:true});return [...data];};
  const gray=await pixel(900,450);expect(Math.max(...gray)-Math.min(...gray)).toBeLessThan(8);expect(gray[0]).toBeGreaterThan(20);
  const lamp=page.getByRole('button',{name:'Carried lantern',exact:true});await lamp.click();await expect(lamp).toHaveAttribute('aria-pressed','true');
  await expect.poll(async()=>{const c=await pixel(900,500);return c[0]-c[2];}).toBeGreaterThan(35);
  // Lighting must not expose terrain across a sight blocker.
  f.admin.emit('map:editWalls',{mapId:f.map.id,add:{id:'vision-wall',ax:850,ay:0,bx:850,by:1200}});
  f.admin.emit('fog:resetExploration',{mapId:f.map.id});await f.state();
  await expect.poll(async()=>(await pixel(900,500))[0]).toBeLessThan(15);
  f.admin.emit('map:editWalls',{mapId:f.map.id,removeId:'vision-wall'});await f.state();
  await expect.poll(async()=>{const c=await pixel(900,500);return c[0]-c[2];}).toBeGreaterThan(35);
  await lamp.click();await expect(lamp).toHaveAttribute('aria-pressed','false');
  await f.admin.timeout(15000).emitWithAck('token:move',{tokenId:token.id,x:1800,y:600,movement:'relocate'});await page.waitForTimeout(400);
  await f.admin.timeout(15000).emitWithAck('token:move',{tokenId:token.id,x:800,y:600,movement:'relocate'});await page.waitForTimeout(500);
  const remembered=await pixel(1800,400),visible=await pixel(900,450);
  expect(Math.max(...remembered)-Math.min(...remembered)).toBeLessThan(8);expect(remembered[0]).toBeLessThan(visible[0]*.6);expect(remembered[0]).toBeGreaterThan(8);
  await info.attach('pixel-values',{body:JSON.stringify({gray,remembered,visible}),contentType:'application/json'});
  await page.screenshot({path:info.outputPath('legacy-darkvision.png')});
 }finally{f.admin.disconnect();}
});
