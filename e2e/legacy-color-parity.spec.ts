import {test,expect} from './helpers/test';
import {io} from 'socket.io-client';
import sharp from 'sharp';
import {DM_SECRET,PORT} from './playwright.config';

test.use({trace:'off'});
for(const role of ['player','dm'] as const)test(`Legacy ${role} darkness colors agree when server rendering is toggled`,async({page,request,browser},info)=>{
 test.setTimeout(90000);
 const headers={'x-dm-passphrase':DM_SECRET};
 const {code}=await(await request.post('/api/sessions',{headers,data:{name:'Legacy color parity'}})).json();
 const swatches=Buffer.from('<svg width="900" height="600" xmlns="http://www.w3.org/2000/svg"><rect x="340" y="340" width="20" height="20" fill="#e52f3b"/><rect x="360" y="340" width="20" height="20" fill="#28c853"/><rect x="380" y="340" width="20" height="20" fill="#296ce8"/></svg>');
 const image=await sharp({create:{width:900,height:600,channels:3,background:'#d47425'}}).composite([{input:swatches}]).png().toBuffer();
 const map=await(await request.post(`/api/sessions/${code}/maps`,{headers,multipart:{name:'Color room',image:{name:'map.png',mimeType:'image/png',buffer:image}}})).json();
 const dm=io(`http://localhost:${PORT}`,{transports:['websocket']});
 const state=async()=>(await dm.timeout(15000).emitWithAck('join',{sessionCode:code,role:'dm',dmPassphrase:DM_SECRET})).snapshot;
 let companion:Awaited<ReturnType<typeof browser.newContext>>|undefined;
 try{
  const initial=await state(),pc=initial.characters.find((c:any)=>c.name==='Druk');
  dm.emit('map:setActive',{mapId:map.id});dm.emit('map:setGrid',{mapId:map.id,gridSizePx:20,feetPerSquare:5,widthFt:225,locked:true});
  for(const layer of ['map','tokens'])dm.emit('fog:setLayer',{mapId:map.id,layer,enabled:false});
  dm.emit('map:editWalls',{mapId:map.id,add:{id:'wall',ax:750,ay:0,bx:750,by:600}});
  dm.emit('map:setEnvironment',{mapId:map.id,settings:{enabled:true,lighting:'dungeon',heavyDarkness:true,mist:false,lights:[{id:'lamp',x:600,y:300,radiusFt:15,heightFt:5,color:'warm',intensity:1,flicker:false,visibleTorch:true},{id:'hidden-lamp',x:820,y:320,radiusFt:15,heightFt:5,color:'warm',intensity:1,flicker:false,visibleTorch:true}]}});
  dm.emit('token:spawn',{mapId:map.id,kind:'pc',refId:pc.id,x:250,y:300});await state();
  await page.addInitScript(()=>{localStorage.setItem('dnd-environment-quality','legacy');localStorage.setItem('dnd-server-rendering','on');});
  await page.setViewportSize({width:1500,height:1000});
  if(role==='player'){
   await page.goto(`/join?code=${code}`);await page.getByRole('button',{name:'Join',exact:true}).click();await page.locator('.claim-row').filter({hasText:'Druk'}).click();
  }else{
   companion=await browser.newContext();await companion.addInitScript(()=>{sessionStorage.setItem('dnd.rendering-started','1');localStorage.setItem('dnd-environment-quality','legacy');});
   const p=await companion.newPage();await p.goto(`/join?code=${code}`);await p.getByRole('button',{name:'Join',exact:true}).click();await p.locator('.claim-row').filter({hasText:'Druk'}).click();
   await page.goto(`/dm?code=${code}`);await page.locator('input[type=password]').fill(DM_SECRET);await page.getByRole('button',{name:'Rejoin as DM',exact:true}).click();await page.getByLabel('Battlefield visibility').selectOption('player');
  }
  const vision=page.getByTestId('legacy-vision');await expect(vision).toHaveAttribute('data-render-source','server-raster');
  const capture=async(name:string)=>{
   await page.waitForTimeout(750);
   const coords=await page.evaluate(()=>{const stage=(window as any).Konva.stages.find((s:any)=>s.find('.token').length),layer=stage.getLayers().find((l:any)=>l.draggable()),base=document.querySelector('.stage-wrap')!.getBoundingClientRect(),r=stage.getContent().getBoundingClientRect();return [[327,347],[603,323],[823,323],[507,347],[250,300],[320,340],[347,347],[367,347],[387,347]].map(([x,y])=>{const p=layer.getAbsoluteTransform().point({x,y});return {x:Math.round(r.left+p.x-base.left),y:Math.round(r.top+p.y-base.top)};});});
   const buffer=await page.locator('.stage-wrap').screenshot({path:info.outputPath(`${name}.png`)}),{data,info:raw}=await sharp(buffer).removeAlpha().raw().toBuffer({resolveWithObject:true});
   return coords.map(({x,y})=>Array.from(data.subarray((y*raw.width+x)*3,(y*raw.width+x)*3+3)));
  };
  const assisted=await capture('assisted');
  await page.getByRole('checkbox',{name:'Server managed rendering',exact:true}).uncheck();
  await expect(vision).toHaveAttribute('data-geometry-source','client');const local=await capture('local');
  console.log('Legacy colors (darkvision, light, unseen, memory, token)',JSON.stringify({assisted,local}));
  for(let i=0;i<3;i++)for(let c=0;c<3;c++)expect(Math.abs(assisted[i][c]-local[i][c])).toBeLessThan(15);
  for(let c=0;c<3;c++)expect(Math.abs(assisted[5][c]-local[5][c])).toBeLessThan(15);
  for(let i=6;i<9;i++)for(let c=0;c<3;c++)expect(Math.abs(assisted[i][c]-local[i][c])).toBeLessThan(15);
  expect(assisted[4][2]).toBeGreaterThan(assisted[4][0]+20);expect(local[4][2]).toBeGreaterThan(local[4][0]+20);
  // Force the camera beyond its retained clipping window and back. The new
  // sight/light masks must still align and keep the lamp behind the wall hidden.
  await page.evaluate(()=>{
   const stage=(window as any).Konva.stages.find((s:any)=>s.find('.token').length),layer=stage.getLayers().find((l:any)=>l.draggable()),start=layer.position();
   for(const offset of [-4000,0]){layer.position({x:start.x+offset,y:start.y});layer.fire('dragmove',{target:layer,evt:new MouseEvent('mousemove')},true);}
  });
  const afterLargePan=await capture('local-after-large-pan');
  for(let i=0;i<3;i++)for(let c=0;c<3;c++)expect(Math.abs(local[i][c]-afterLargePan[i][c])).toBeLessThan(15);
  // Painted fog must stay above the locally graded map and remain concealed.
  const cells=Array.from({length:45*30},(_,i)=>`${i%45},${Math.floor(i/45)}`).filter(cell=>cell!=='16,17');
  dm.emit('fog:setLayer',{mapId:map.id,layer:'map',enabled:true});dm.emit('fog:paint',{mapId:map.id,layer:'map',cells,reveal:true});
  await expect.poll(async()=> (await state()).map.mapFogRevealed.length).toBe(cells.length);
  const coveredLocal=await capture('local-manual-fog');expect(Math.max(...coveredLocal[0])).toBeLessThan(30);
  await page.getByRole('checkbox',{name:'Server managed rendering',exact:true}).check();await expect(vision).toHaveAttribute('data-render-source','server-raster');
  const coveredAssisted=await capture('assisted-manual-fog');expect(Math.max(...coveredAssisted[0])).toBeLessThan(30);
  for(let c=0;c<3;c++)expect(Math.abs(coveredAssisted[0][c]-coveredLocal[0][c])).toBeLessThan(10);
  dm.emit('fog:setLayer',{mapId:map.id,layer:'map',enabled:false});await expect.poll(async()=> (await state()).map.mapFogEnabled).toBe(false);
  await page.getByRole('checkbox',{name:'Server managed rendering',exact:true}).uncheck();await expect(vision).toHaveAttribute('data-geometry-source','client');
  const token=(await state()).tokens.find((t:any)=>t.refId===pc.id);
  for(const x of [350,250]){dm.emit('token:move',{tokenId:token.id,x,y:300});await expect.poll(async()=> (await state()).tokens.find((t:any)=>t.id===token.id)?.x).toBe(x);}
  await page.waitForTimeout(1500);
  const rememberedLocal=await capture('local-remembered');
  await page.getByRole('checkbox',{name:'Server managed rendering',exact:true}).check();
  await expect(vision).toHaveAttribute('data-render-source','server-raster');
  const rememberedAssisted=await capture('assisted-remembered');
  console.log('Remembered colors',JSON.stringify({rememberedLocal,rememberedAssisted}));
  for(let c=0;c<3;c++)expect(Math.abs(rememberedAssisted[3][c]-rememberedLocal[3][c])).toBeLessThan(15);
  expect(rememberedLocal[3][0]).toBeGreaterThan(8);expect(rememberedLocal[3][0]).toBeLessThan(rememberedLocal[0][0]);
  dm.emit('map:setEnvironment',{mapId:map.id,settings:{heavyDarkness:false}});
  await expect(vision).toHaveAttribute('data-heavy','false');
  const dimAssisted=await capture('assisted-dim');
  await page.getByRole('checkbox',{name:'Server managed rendering',exact:true}).uncheck();
  await expect(vision).toHaveAttribute('data-geometry-source','client');
  const dimLocal=await capture('local-dim');
  console.log('Dim-light colors',JSON.stringify({dimAssisted,dimLocal}));
  for(let i=0;i<3;i++)for(let c=0;c<3;c++)expect(Math.abs(dimAssisted[i][c]-dimLocal[i][c])).toBeLessThan(15);
  dm.emit('fog:setVision',{mapId:map.id,layer:'map',enabled:false});
  await expect.poll(async()=> (await state()).map.mapVisionEnabled).toBe(false);
  await page.waitForTimeout(500);const noWallLocal=await capture('local-wall-vision-off');
  await page.getByRole('checkbox',{name:'Server managed rendering',exact:true}).check();
  await expect(vision).toHaveAttribute('data-render-source','server-raster');
  const noWallAssisted=await capture('assisted-wall-vision-off');
  console.log('Wall vision disabled',JSON.stringify({noWallAssisted,noWallLocal}));
  for(let i=0;i<3;i++)for(let c=0;c<3;c++)expect(Math.abs(noWallAssisted[i][c]-noWallLocal[i][c])).toBeLessThan(15);
 }finally{dm.disconnect();await companion?.close();}
});
