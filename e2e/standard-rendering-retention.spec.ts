import {test,expect,webglDisabled} from './helpers/test';
import {io} from 'socket.io-client';
import sharp from 'sharp';
import {DM_SECRET,PORT} from './playwright.config';
import {projectGround} from '../client/src/canvas/miniatureProjection';
test.use({trace:'off'});

for(const mode of ['2d','3d'])test(`standard ${mode} retains static artwork while movement, camera, HP and lighting remain live`,async({page,request},info)=>{
 test.skip(webglDisabled,'This regression verifies actual WebGL rendering.');test.setTimeout(120000);
 const headers={'x-dm-passphrase':DM_SECRET},errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 const {code}=await(await request.post('/api/sessions',{headers,data:{name:'Standard retained rendering regression'}})).json();
 const buffer=await sharp({create:{width:1400,height:1000,channels:3,background:'#5a594d'}}).png().toBuffer();
 const map=await(await request.post(`/api/sessions/${code}/maps`,{headers,multipart:{name:'Room',image:{name:'room.png',mimeType:'image/png',buffer}}})).json();
 const admin=io(`http://localhost:${PORT}`,{transports:['websocket']});
 const state=async()=>(await admin.timeout(10000).emitWithAck('join',{sessionCode:code,role:'dm',dmPassphrase:DM_SECRET})).snapshot;
 try{
  await state();admin.emit('map:setActive',{mapId:map.id});
  for(const layer of ['map','tokens'])admin.emit('fog:setLayer',{mapId:map.id,layer,enabled:false});
  admin.emit('monster:create',{name:'Retention Goblin',modelType:'goblin',icon:'G',maxHp:20,armorClass:13,disposition:'enemy'});
  let s=await state();const template=s.monsterTemplates.find((m:any)=>m.name==='Retention Goblin');
  for(let i=0;i<8;i++)admin.emit('token:spawn',{mapId:map.id,kind:'monster',refId:template.id,x:260+i%4*250,y:300+Math.floor(i/4)*300});
  const environment={enabled:true,lighting:'dungeon',shadows:true,mist:false,weather:'none',particles:'none',lights:[{id:'lamp',x:350,y:400,radiusFt:40,heightFt:8,color:'warm',intensity:1,flicker:false,visibleTorch:true}]};
  admin.emit('map:setEnvironment',{mapId:map.id,settings:environment});s=await state();const token=s.tokens[0];
  await page.addInitScript(mode=>{localStorage.setItem('dnd.playerId','retention');localStorage.setItem('dnd-environment-quality','balanced');localStorage.setItem('dnd.monsterTokenView:retention',mode);localStorage.setItem('dnd.battlefieldView:retention','tilted');},mode);
  await page.setViewportSize({width:1500,height:1000});await page.goto(`/dm?code=${code}`);await page.locator('input[type=password]').fill(DM_SECRET);await page.getByRole('button',{name:'Rejoin as DM',exact:true}).click();
  const models=page.getByTestId('miniature-layer');await expect(models).toHaveAttribute('data-miniature-status','ready',{timeout:60000});
  await expect(models).toHaveAttribute('data-miniature-count',mode==='3d'?'8':'0',{timeout:60000});
  const node=()=>page.evaluate(id=>{const n=(window as any).Konva.stages.flatMap((s:any)=>s.find('.token')).find((n:any)=>n.getAttr('tokenId')===id);return n?{x:n.x(),y:n.y(),cached:n.findOne('.token-art').isCached(),body:n.findOne('.server-token-body')?.image()?.src,hud:n.findOne('.server-token-hud')?.image()?.src,health:n.findOne('.token-health')?.getChildren()[1]?.width(),label:n.findOne('.token-label')?.text(),hiddenLabel:n.findOne('.token-label')?.visible()===false}:null;},token.id);
  const count=async(name:string)=>Number(await models.getAttribute(`data-${name}`));
  const pixels=async()=>{await expect.poll(()=>page.evaluate(()=>{
   return (window as any).Konva.stages.flatMap((s:any)=>s.getLayers().filter((l:any)=>l.getAttr('retainedStats')).map((l:any)=>{
    l.draw();const native=l.getNativeCanvasElement(),dpr=l.getCanvas().pixelRatio,offset=l.getAttr('retainedCanvasOrigin')??{x:0,y:0};
    const copy=l.toCanvas({x:-offset.x,y:-offset.y,width:native.width/dpr,height:native.height/dpr,pixelRatio:dpr});
    const a=native.getContext('2d').getImageData(0,0,native.width,native.height).data,b=copy.getContext('2d').getImageData(0,0,copy.width,copy.height).data;
    let wrong=0;for(let i=0;i<a.length;i+=4){let delta=0;for(let c=0;c<4;c++)delta=Math.max(delta,Math.abs(a[i+c]-b[i+c]));if(delta>8)wrong++;}return wrong;
   })).reduce((sum:number,n:number)=>sum+n,0);
  }),{timeout:10000}).toBe(0);};
  if(mode==='2d')await expect.poll(()=>node().then(n=>!!n?.body&&!!n?.hud)).toBe(true);
  else await expect(models).toHaveAttribute('data-name-count','8');
  await page.waitForTimeout(1200);expect((await node())!.cached).toBe(false);
  await pixels();
  // A completely static scene sleeps after settling. The selected ring must
  // keep animating while static illumination/name pixels remain retained.
  const idle=await count('render-count');await page.waitForTimeout(600);expect(await count('render-count')).toBe(idle);
  await page.evaluate(id=>{const n=(window as any).Konva.stages.flatMap((s:any)=>s.find('.token')).find((n:any)=>n.getAttr('tokenId')===id);n.fire('click',{evt:{button:0}},true);},token.id);
  await page.waitForTimeout(500);const field=await count('light-field-updates'),glyphs=await count('name-texture-updates'),body=await count('body-appearance-updates'),frames=await count('render-count');
  await page.waitForTimeout(700);expect(await count('light-field-updates')).toBe(field);
  if(mode==='3d'){expect(await count('name-texture-updates')).toBe(glyphs);expect(await count('render-count')).toBeGreaterThan(frames);expect((await node())!.hiddenLabel).toBe(true);}
  admin.emit('token:move',{tokenId:token.id,x:335,y:300});const moved=(await state()).tokens.find((t:any)=>t.id===token.id);
  await expect.poll(()=>node().then(n=>Math.round(n!.x))).toBe(Math.round(moved.x));await page.waitForTimeout(600);
  if(mode==='3d'){expect(await count('body-appearance-updates')).toBe(body);expect(await count('name-texture-updates')).toBe(glyphs);expect(await count('light-field-updates')).toBeGreaterThan(field);}
  await pixels();
  expect(await page.evaluate(()=>(window as any).Konva.stages.flatMap((s:any)=>s.getLayers().map((l:any)=>l.getAttr('retainedStats'))).filter(Boolean).reduce((n:number,s:any)=>n+s.partialScene,0))).toBeGreaterThan(0);
  const positions=await count('name-position-updates');await page.getByRole('button',{name:'Rotate map right',exact:true}).click();await expect(models).toHaveAttribute('data-camera-rotation','15');
  if(mode==='3d')expect(await count('name-position-updates')).toBeGreaterThan(positions);
  await pixels();
  // Use real pointer input after a rotated projection; only the token base owns it.
  const point=await page.evaluate(id=>{const stage=(window as any).Konva.stages.find((s:any)=>s.find('.token').length),n=stage.find('.token').find((n:any)=>n.getAttr('tokenId')===id),p=n.getAbsolutePosition(),r=stage.getContent().getBoundingClientRect();return{x:p.x,y:p.y,left:r.left,top:r.top,width:stage.width(),height:stage.height()};},token.id);
  const projected=projectGround(point.x,point.y,point.width,point.height,45,15);
  await page.mouse.click(point.left+projected.x,point.top+projected.y,{button:'right'});await expect(page.getByRole('dialog',{name:'Token actions',exact:true})).toBeVisible();await page.getByRole('button',{name:'Close token actions',exact:true}).click();
  const destination=await page.evaluate(id=>{const n=(window as any).Konva.stages.flatMap((s:any)=>s.find('.token')).find((n:any)=>n.getAttr('tokenId')===id);return n.getParent().getAbsoluteTransform().point({x:n.x()+60,y:n.y()+50});},token.id);
  const target=projectGround(destination.x,destination.y,point.width,point.height,45,15);
  await page.mouse.move(point.left+projected.x,point.top+projected.y);await page.mouse.down();await page.mouse.move(point.left+target.x,point.top+target.y,{steps:6});await page.mouse.up();
  await expect.poll(async()=>(await state()).tokens.find((t:any)=>t.id===token.id).x).not.toBe(moved.x);await page.waitForTimeout(600);await pixels();
  const beforeHp=await node();admin.emit('monster:update',{monsterId:token.refId,curHp:15});await state();
  if(mode==='2d')await expect.poll(()=>node().then(n=>n?.hud!==beforeHp?.hud)).toBe(true);else await expect.poll(()=>node().then(n=>n!.health!<beforeHp!.health!)).toBe(true);
  admin.emit('monster:update',{monsterId:token.refId,name:'Renamed Goblin'});await state();
  if(mode==='3d')await expect.poll(()=>node().then(n=>n?.label)).toBe('Renamed Goblin');
  if(mode==='3d')for(const quality of ['low','high']){
   await page.evaluate(quality=>{localStorage.setItem('dnd-environment-quality',quality);window.dispatchEvent(new Event('dnd-environment-quality-change'));},quality);
   await expect(models).toHaveAttribute('data-graphics-quality',quality);await expect(models).toHaveAttribute('data-miniature-count','8');
   await expect(models).toHaveAttribute('data-local-shadow-method',quality==='high'?'cube':'floor');
  }
  await pixels();
  admin.emit('measure:add',{kind:'ruler',origin:{x:500,y:500},target:{x:750,y:650}});await state();await page.waitForTimeout(150);await pixels();
  expect(await page.evaluate(()=>(window as any).Konva.stages.flatMap((s:any)=>s.getLayers().map((l:any)=>l.getAttr('retainedStats'))).filter(Boolean).reduce((n:number,s:any)=>n+s.toolFrames,0))).toBeGreaterThan(0);
  admin.emit('measure:clear',{mapId:map.id});await state();await page.waitForTimeout(150);await pixels();
  const lightBefore=await count('light-field-updates');admin.emit('map:setEnvironment',{mapId:map.id,settings:{...environment,lights:[{...environment.lights[0],x:600,color:'cool'}]}});await state();await expect.poll(()=>count('light-field-updates')).toBeGreaterThan(lightBefore);
  // Overscan contains tokens beyond the unprojected viewport. Camera rotation
  // must be able to bring those retained pixels back into view without trails.
  admin.emit('token:move',{tokenId:token.id,x:-30,y:120});await state();await page.waitForTimeout(600);await pixels();
  await page.setViewportSize({width:1300,height:900});await pixels();
  admin.emit('token:delete',{tokenId:token.id});await state();await expect.poll(node).toBeNull();
  await page.screenshot({path:info.outputPath(`${mode}-retention.png`)});expect(errors).toEqual([]);
 }finally{admin.disconnect();}
});
