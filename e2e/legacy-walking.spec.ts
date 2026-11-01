import {openToolbarGroup} from './helpers/mobileToolbar';
import {test,expect} from './helpers/test';
import {io} from 'socket.io-client';
import sharp from 'sharp';
import {DM_SECRET,PORT} from './playwright.config';
test.use({trace:'off'});
for(const role of ['player','dm'] as const)test(`Legacy ${role} animates by default with prepared darkness and handles assistance being disabled`,async({page,request,browser})=>{
 test.setTimeout(120000);const headers={'x-dm-passphrase':DM_SECRET};
 const {code}=await(await request.post('/api/sessions',{headers,data:{name:'Disposable Legacy walking test'}})).json();
 const buffer=await sharp({create:{width:3000,height:1600,channels:3,background:'#69705d'}}).png().toBuffer();
 const map=await(await request.post(`/api/sessions/${code}/maps`,{headers,multipart:{name:'Dark walk',image:{name:'map.png',mimeType:'image/png',buffer}}})).json();
 const admin=io(`http://localhost:${PORT}`,{transports:['websocket']});
 const snapshot=async()=>(await admin.timeout(15000).emitWithAck('join',{sessionCode:code,role:'dm',dmPassphrase:DM_SECRET})).snapshot;
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));let companion:Awaited<ReturnType<typeof browser.newContext>>|undefined;
 try{
  const s=await snapshot(),pc=s.characters.find((c:any)=>c.name==='Druk');admin.emit('map:setActive',{mapId:map.id});admin.emit('character:update',{characterId:pc.id,icon:'P'});
  for(const layer of ['map','tokens'])admin.emit('fog:setLayer',{mapId:map.id,layer,enabled:false});
  // This torch enters the walker's sight around a short wall. Its per-viewer
  // visibleTorch flag must not make a valid walk fall back to snap movement.
  admin.emit('map:editWalls',{mapId:map.id,add:{id:'torch-corner',ax:850,ay:600,bx:850,by:720}});
  admin.emit('map:setEnvironment',{mapId:map.id,settings:{enabled:true,heavyDarkness:true,lighting:'dungeon',mist:false,lights:[{id:'corner-lamp',x:1050,y:600,radiusFt:8,heightFt:6,color:'warm',intensity:1,flicker:false,visibleTorch:true}]}});
  admin.emit('token:spawn',{mapId:map.id,kind:'pc',refId:pc.id,x:400,y:800});const token=(await snapshot()).tokens[0];
  admin.emit('monster:create',{name:'Midpoint Goblin',modelType:'goblin',icon:'G',maxHp:20,armorClass:13,disposition:'enemy'});
  const template=(await snapshot()).monsterTemplates.find((m:any)=>m.name==='Midpoint Goblin');admin.emit('token:spawn',{mapId:map.id,kind:'monster',refId:template.id,x:1050,y:800});const enemy=(await snapshot()).tokens.find((t:any)=>t.kind==='monster');
  // A stale saved snap preference must not disable the automatic animation.
  await page.addInitScript(()=>{localStorage.setItem('dnd-environment-quality','legacy');localStorage.setItem('dnd-legacy-movement','snap');});
  await page.setViewportSize({width:1400,height:900});
  if(role==='player'){await page.goto(`/join?code=${code}`);await page.getByRole('button',{name:'Join',exact:true}).click();await page.locator('.claim-row').filter({hasText:'Druk'}).click();}
  else{
   companion=await browser.newContext();await companion.addInitScript(()=>localStorage.setItem('dnd-environment-quality','legacy'));const player=await companion.newPage();await player.goto(`/join?code=${code}`);await player.getByRole('button',{name:'Join',exact:true}).click();await player.locator('.claim-row').filter({hasText:'Druk'}).click();
   await page.goto(`/dm?code=${code}`);await page.locator('input[type=password]').fill(DM_SECRET);await page.getByRole('button',{name:'Rejoin as DM',exact:true}).click();await openToolbarGroup(page,'View');await page.getByLabel('Battlefield visibility',{exact:true}).selectOption('player');
  }
  await expect(page.getByRole('checkbox',{name:'Animate Legacy movement',exact:true})).toHaveCount(0);
  await expect(page.getByTestId('legacy-vision')).toHaveAttribute('data-geometry-source','server');
  const x=()=>page.evaluate(id=>(window as any).Konva.stages.flatMap((s:any)=>s.find('.token')).find((n:any)=>n.getAttr('tokenId')===id)?.x(),token.id);
  await expect.poll(x).toBe(400);await page.waitForTimeout(700);
  await page.evaluate(({id,enemy})=>{const w=window as any;w.__walkSamples=[];w.__walkUntil=performance.now()+15000;const record=()=>{const nodes=w.Konva.stages.flatMap((s:any)=>s.find('.token')),n=nodes.find((n:any)=>n.getAttr('tokenId')===id);w.__walkSamples.push({at:performance.now(),x:n?.x(),enemy:nodes.some((n:any)=>n.getAttr('tokenId')===enemy&&n.isVisible()&&n.opacity()>.01),mask:document.querySelector<SVGPathElement>('[data-legacy-paths=near] path')?.getAttribute('d')});if(performance.now()<w.__walkUntil)requestAnimationFrame(record);};record();},{id:token.id,enemy:enemy.id});
  admin.emit('token:move',{tokenId:token.id,x:1700,y:800});await expect.poll(x,{timeout:20000}).toBe(1700);
  await expect(page.getByTestId('legacy-motion-mask')).toHaveCount(0);await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
  const samples=await page.evaluate(()=>(window as any).__walkSamples);expect(samples.some((p:any)=>p.x>400&&p.x<1700)).toBe(true);expect(new Set(samples.map((p:any)=>p.mask)).size).toBeGreaterThanOrEqual(3);
  expect(samples[0].enemy).toBe(false);expect(samples.some((p:any)=>p.enemy)).toBe(true);expect(samples.at(-1).enemy).toBe(false);
  // Legacy must retain real ground marks without waking its map/token layers.
  await expect(page.getByTestId('legacy-footsteps')).toBeVisible();
  const footprints=await page.evaluate(()=>(window as any).Konva.stages.flatMap((s:any)=>s.find('.footstep')).map((n:any)=>({x:n.x(),y:n.y(),layer:n.getLayer().name(),listening:n.listening()})));
  expect(footprints.length).toBeGreaterThan(0);expect(footprints.length).toBeLessThanOrEqual(96);
  expect(footprints.every((p:any)=>p.layer==='legacy-footsteps'&&!p.listening)).toBe(true);
  await page.evaluate(()=>{const w=window as any;w.__footstepDraws={marks:0,map:0};const stage=w.Konva.stages.find((s:any)=>s.find('.token').length);stage.findOne('.legacy-footsteps').on('draw.footstepTest',()=>w.__footstepDraws.marks++);stage.getLayers()[0].on('draw.footstepTest',()=>w.__footstepDraws.map++);});
  await page.waitForTimeout(350);
  // Held marks are static; once fading starts only their own layer redraws.
  expect(await page.evaluate(()=>(window as any).__footstepDraws)).toEqual({marks:0,map:0});
  await expect.poll(()=>page.evaluate(()=>(window as any).Konva.stages.flatMap((s:any)=>s.find('.footstep')).some((n:any)=>n.opacity()>0&&n.opacity()<.90)),{timeout:6000}).toBe(true);
  const draws=await page.evaluate(()=>(window as any).__footstepDraws);expect(draws.marks).toBeGreaterThan(0);expect(draws.map).toBe(0);
  await page.getByRole('checkbox',{name:'Server managed rendering',exact:true}).uncheck();await expect(page.getByTestId('legacy-vision')).toHaveAttribute('data-geometry-source','client');await page.waitForTimeout(700);
  // Unassisted Legacy must interpolate using local sight, without a server
  // atlas. Sample the actual SVG and Konva pose together on each browser frame.
  // Let the previous walk's tracks expire: old tracks can re-enter personal
  // sight while returning, and must not be mistaken for new forward footfalls.
  await expect.poll(()=>page.evaluate(()=>(window as any).Konva.stages.flatMap((s:any)=>s.find('.footstep')).length),{timeout:15000}).toBe(0);
  await page.evaluate(id=>{const w=window as any;w.__localWalk=[];w.__localUntil=performance.now()+5000;const oldMarks=new Set(w.Konva.stages.flatMap((s:any)=>s.find('.footstep')).map((n:any)=>n._id));const record=()=>{
   const n=w.Konva.stages.flatMap((s:any)=>s.find('.token')).find((n:any)=>n.getAttr('tokenId')===id),path=document.querySelector<SVGPathElement>('[data-legacy-paths=near] path');
   const marks=w.Konva.stages.flatMap((s:any)=>s.find('.footstep')).filter((n:any)=>!oldMarks.has(n._id)).map((n:any)=>n.x());
   w.__localWalk.push({x:n?.x(),path:path?.getAttribute('d'),inside:path?.isPointInFill(new DOMPoint(n?.x(),n?.y())),marks});
   if(performance.now()<w.__localUntil)requestAnimationFrame(record);
  };record();},token.id);
  admin.emit('token:move',{tokenId:token.id,x:400,y:800});await expect.poll(x,{timeout:20000}).toBe(400);
  const local=await page.evaluate(()=>{const w=window as any;w.__localUntil=0;return w.__localWalk;});
  const moving=local.filter((p:any)=>p.x>400&&p.x<1700);
  expect(moving.length).toBeGreaterThanOrEqual(3);expect(new Set(moving.map((p:any)=>p.path)).size).toBeGreaterThanOrEqual(3);
  expect(moving.every((p:any)=>p.inside)).toBe(true);
  expect(moving.some((p:any)=>p.marks.length)).toBe(true);
  expect(moving.every((p:any)=>p.marks.every((mark:number)=>mark>=p.x))).toBe(true);
  await expect(page.getByTestId('legacy-vision')).toHaveAttribute('data-geometry-source','client');
  await expect(page.getByTestId('legacy-motion-mask')).toHaveCount(0);
  await expect(page.getByRole('checkbox',{name:'Server managed rendering',exact:true})).not.toBeChecked();
  expect(errors).toEqual([]);
 }finally{admin.disconnect();await companion?.close();}
});
