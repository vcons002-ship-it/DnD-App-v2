import {test,expect} from './helpers/test';
import {io} from 'socket.io-client';
import sharp from 'sharp';
import {DM_SECRET,PORT} from './playwright.config';
import {openToolbarGroup} from './helpers/mobileToolbar';

test.use({hasTouch:true,isMobile:true,viewport:{width:900,height:700},serviceWorkers:'block'});
for(const visibility of ['dm','player'] as const) test(`DM can tap and approach a door in ${visibility} visibility on mobile`,async({page,request})=>{
 test.setTimeout(45000);
 const headers={'x-dm-passphrase':DM_SECRET};
 const {code}=await(await request.post('/api/sessions',{headers,data:{name:'DM mobile door'}})).json();
 const image=await sharp({create:{width:800,height:600,channels:3,background:'#777'}}).png().toBuffer();
 const map=await(await request.post(`/api/sessions/${code}/maps`,{headers,multipart:{name:'Room',image:{name:'room.png',mimeType:'image/png',buffer:image}}})).json();
 const socket=io(`http://localhost:${PORT}`,{transports:['websocket']});
 const state=async()=>{const r=await socket.timeout(10000).emitWithAck('join',{sessionCode:code,role:'dm',dmPassphrase:DM_SECRET});expect(r.ok).toBe(true);return r.snapshot;};
 try{
  const s=await state();socket.emit('map:setActive',{mapId:map.id});
  socket.emit('map:editWalls',{mapId:map.id,add:{id:'wall',kind:'rectangle',ax:100,ay:290,bx:700,by:310}});
  await expect.poll(async()=> (await state()).map?.walls?.some((w:any)=>w.id==='wall')).toBe(true);
  socket.emit('map:editWalls',{mapId:map.id,door:{id:'door',wallId:'wall',ax:350,ay:300,bx:450,by:300}});
  socket.emit('token:spawn',{mapId:map.id,kind:'pc',refId:s.characters.find((c:any)=>c.name==='Druk').id,x:400,y:470});
  await expect.poll(async()=> (await state()).map?.walls?.some((w:any)=>w.id==='door'&&w.tokenId)).toBe(true);
  const initial=await state(),token=initial.tokens.find((t:any)=>t.kind==='pc');
  await page.goto(`/dm?code=${code}`);await page.locator('input[type=password]').fill(DM_SECRET);await page.getByRole('button',{name:'Rejoin as DM',exact:true}).click();
  await openToolbarGroup(page,'View');
  await page.getByLabel('Battlefield visibility').selectOption(visibility);
  await page.getByRole('button',{name:'View',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>!!(window as any).Konva?.stages?.some((s:any)=>s.find('.wall-door-face').length))).toBe(true);
  const pos=async(x:number,y:number)=>page.evaluate(({x,y})=>{const stage=(window as any).Konva.stages.find((s:any)=>s.find('.wall-door-face').length),layer=stage.findOne('.wall-door-face').getParent().getParent(),p=layer.getAbsoluteTransform().point({x,y}),r=stage.getContent().getBoundingClientRect();return{x:r.left+p.x,y:r.top+p.y};},{x,y});
  const tokenPoint=await pos(token.x,token.y);await page.mouse.click(tokenPoint.x,tokenPoint.y,{button:'right'});
  const actions=page.getByRole('dialog',{name:'Token actions'});
  await expect(actions.getByRole('button',{name:/Duplicate token/})).toBeVisible();
  await expect(actions.getByRole('button',{name:/Hide from players/})).toBeVisible();await page.keyboard.press('Escape');
  const door=await pos(400,288);await page.touchscreen.tap(door.x,door.y);
  const controls=page.getByTestId('door-controls');await expect(controls).toBeVisible();await expect(controls.getByText('Lock DC')).toBeVisible();
  await controls.getByTitle('Open it').click();await expect.poll(async()=> (await state()).map.walls.find((w:any)=>w.id==='door').open).toBe(true);
  await controls.getByTitle('Close it').click();await expect.poll(async()=> (await state()).map.walls.find((w:any)=>w.id==='door').open).toBe(false);
  await controls.getByRole('button',{name:'Close door controls'}).click();await expect(controls).toBeHidden();
  // Drag on the touch screen and wait for the accepted server position.
  const start=await pos(token.x,token.y),end=await pos(400,355);
  const cdp=await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:start.x,y:start.y}]});
  for(let i=1;i<=8;i++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:start.x+(end.x-start.x)*i/8,y:start.y+(end.y-start.y)*i/8}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await expect.poll(async()=>{const t=(await state()).tokens.find((t:any)=>t.id===token.id);return Math.round(t.y);}).toBeLessThan(400);
  await expect(controls).toBeVisible();await expect(controls.getByText('Lock DC')).toBeVisible();
 }finally{socket.disconnect();}
});
