import {test,expect} from '@playwright/test';
import {io} from 'socket.io-client';
import {spawnSync} from 'node:child_process';
import ffmpeg from 'ffmpeg-static';
import {readFileSync,mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {DM_SECRET,PORT} from './playwright.config';

test('animated map upload, fog, darkness, tiles, fallback and cached seeking work in the real app',async({request,page})=>{
 test.setTimeout(180000);
 const file=path.join(mkdtempSync(path.join(tmpdir(),'animated-map-e2e-')),'map.mp4');
 expect(spawnSync(ffmpeg!,['-v','error','-f','lavfi','-i','testsrc2=size=640x360:rate=30','-t','3','-c:v','libx264','-pix_fmt','yuv420p','-movflags','+faststart','-y',file],{windowsHide:true}).status).toBe(0);
 const headers={'x-dm-passphrase':DM_SECRET};
 const {code}=await(await request.post('/api/sessions',{headers,data:{name:'Animated map regression'}})).json();
 const bad=await request.post(`/api/sessions/${code}/maps`,{headers,multipart:{image:{name:'fake.mp4',mimeType:'video/mp4',buffer:Buffer.from('invalid')}}});expect(bad.status()).toBe(422);
 const response=await request.post(`/api/sessions/${code}/maps`,{headers,multipart:{name:'Moving scenery',image:{name:'map.mp4',mimeType:'video/mp4',buffer:readFileSync(file)}}});expect(response.status()).toBe(201);
 const map=await response.json();expect(map.videoPath).toMatch(/\.mp4$/);expect(map.imagePath).toMatch(/-poster\.jpg$/);
 expect((await request.get(map.videoPath,{headers:{Range:'bytes=0-99'}})).status()).toBe(206);
 const socket=io(`http://localhost:${PORT}`,{transports:['websocket']});
 const snap=async()=>{const r=await socket.timeout(5000).emitWithAck('join',{sessionCode:code,role:'dm',dmPassphrase:DM_SECRET});expect(r.ok).toBe(true);return r.snapshot;};
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 try{
  const initial=await snap(),druk=initial.characters.find((c:any)=>c.name==='Druk');
  socket.emit('map:setActive',{mapId:map.id});socket.emit('map:setGrid',{mapId:map.id,widthFt:100,gridSizePx:32,feetPerSquare:5,locked:false});
  socket.emit('token:spawn',{mapId:map.id,kind:'pc',refId:druk.id,x:150,y:180});
  socket.emit('monster:create',{name:'Beyond door',maxHp:40,modelType:'goblin'});const template=(await snap()).monsterTemplates.find((m:any)=>m.name==='Beyond door');
  socket.emit('token:spawn',{mapId:map.id,kind:'monster',refId:template.id,x:470,y:180});
  const wall={id:'barrier',ax:315,ay:0,bx:325,by:360,kind:'rectangle'};
  socket.emit('map:editWalls',{mapId:map.id,add:wall});await snap();
  await page.addInitScript(()=>localStorage.setItem('dnd-environment-quality','balanced'));
  await page.setViewportSize({width:1440,height:1000});await page.goto(`/join?code=${code}`);await page.getByRole('button',{name:'Join',exact:true}).click();await page.locator('.claim-row').filter({hasText:'Druk'}).click();
  const video=page.getByTestId('animated-map-video');await expect(video).toHaveCount(1);await expect.poll(()=>video.evaluate((v:HTMLVideoElement)=>v.readyState)).toBeGreaterThanOrEqual(2);
  await expect(page.getByTestId('player-vision')).toHaveAttribute('data-wall-count','1');
  await expect(page.getByTestId('miniature-layer')).toHaveAttribute('data-miniature-count','1',{timeout:60000});
  // Concealed creatures' art is ready before the passage opens, while their
  // figures/hit regions remain absent. All three public goblin variants warm
  // regardless of how many goblins are placed behind the wall.
  const layer=page.getByTestId('miniature-layer');
  await expect.poll(async()=>JSON.parse(await layer.getAttribute('data-preloaded-model-urls')??'[]').filter((url:string)=>/goblin/.test(url)).length,{timeout:60000}).toBe(3);
  await expect(layer).toHaveAttribute('data-miniature-count','1');
  const goblinRequests:string[]=[];page.on('request',r=>{if(/goblin.*\.glb/.test(r.url()))goblinRequests.push(r.url());});
  socket.emit('fog:setVision',{mapId:map.id,layer:'tokens',enabled:false});await snap();
  await expect(page.getByTestId('automatic-map-fog')).toBeVisible(); // Map concealment is independent of token concealment.
  socket.emit('fog:setVision',{mapId:map.id,layer:'tokens',enabled:true});await snap();

  for(const heavy of [false,true]){
   socket.emit('map:setEnvironment',{mapId:map.id,settings:{enabled:true,lighting:'dungeon',heavyDarkness:heavy,mist:false}});await snap();
   await expect(page.getByTestId('player-vision')).toHaveAttribute('data-heavy',String(heavy));
   await expect(video).toHaveCount(1); // One decoder shared by artwork and darkvision.
   await expect.poll(()=>video.evaluate((v:HTMLVideoElement)=>v.currentTime)).toBeGreaterThan(0);
  }
  socket.emit('map:editWalls',{mapId:map.id,removeId:'barrier'});await snap();
  await expect(page.getByTestId('player-vision')).toHaveAttribute('data-wall-count','0');
  await expect(layer).toHaveAttribute('data-miniature-count','2');
  expect(goblinRequests).toEqual([]); // Reveal needs no new model download.
  await expect.poll(async()=>Number(await page.getByTestId('player-vision').getAttribute('data-explored-regions'))).toBeGreaterThan(0);
  await page.getByRole('button',{name:'Toggle map animation'}).click();await expect(video).toHaveCount(0);
  await expect.poll(()=>page.evaluate(()=>(window as any).Konva.stages.flatMap((s:any)=>s.find('Image')).some((n:any)=>n.image()?.tagName==='VIDEO'))).toBe(false);
  await page.getByRole('button',{name:'Toggle map animation'}).click();await expect(video).toHaveCount(1);
  // Cached video stays readable for seeks while offline.
  await expect.poll(()=>page.evaluate(async url=>!!(await(await caches.open('dnd-visual-assets-v1')).match(url)),map.videoPath)).toBe(true);
  await page.context().setOffline(true);
  await video.evaluate(async(v:HTMLVideoElement)=>{v.pause();await new Promise<void>((resolve,reject)=>{v.addEventListener('loadeddata',()=>resolve(),{once:true});v.addEventListener('error',()=>reject(Error('Cached reload failed')),{once:true});v.load();});v.currentTime=1;await v.play();});await page.waitForTimeout(350);expect(await video.evaluate((v:HTMLVideoElement)=>v.error)).toBeNull();
  await page.context().setOffline(false);
  const tileResponse=await request.post('/api/map-media',{headers,multipart:{image:{name:'tile.mp4',mimeType:'video/mp4',buffer:readFileSync(file)}}});expect(tileResponse.status()).toBe(201);
  const tile=await tileResponse.json();socket.emit('mapImage:add',{mapId:map.id,...tile,x:640,y:0,w:640,h:360});await snap();
  await expect(video).toHaveCount(2);
  await page.getByRole('button',{name:'Tilted battlefield view',exact:true}).click();await expect(page.getByTestId('miniature-layer')).toHaveAttribute('data-tilt-degrees','45');
  socket.emit('mapImage:add',{mapId:map.id,imagePath:map.imagePath,videoPath:'/uploads/missing-video.mp4',x:1280,y:0,w:640,h:360});await snap();
  await expect(page.getByText('An animated tile could not play; its still image is being used.',{exact:true})).toBeVisible();
  expect(errors).toEqual([]);
 }finally{socket.disconnect();}
});

test('DM can upload an animated map from the Maps panel',async({page,request})=>{
 const file=path.join(mkdtempSync(path.join(tmpdir(),'animated-map-ui-')),'map.mp4');
 expect(spawnSync(ffmpeg!,['-v','error','-f','lavfi','-i','color=c=darkgreen:size=160x90:rate=10','-t','0.3','-c:v','libx264','-pix_fmt','yuv420p','-y',file],{windowsHide:true}).status).toBe(0);
 const {code}=await(await request.post('/api/sessions',{headers:{'x-dm-passphrase':DM_SECRET},data:{name:'Animated upload UI'}})).json();
 await page.goto(`/dm?code=${code}`);await page.locator('input[type=password]').fill(DM_SECRET);await page.getByRole('button',{name:'Rejoin as DM',exact:true}).click();
  // An empty campaign opens Maps on mount. Wait for that mount rather than
  // racing it with a toggle that can immediately close the new panel.
  await expect(page.getByPlaceholder('Map name (optional)',{exact:true})).toBeVisible();
 await page.getByPlaceholder('Map name (optional)',{exact:true}).fill('UI animated map');
 await page.locator('input[type=file][accept*="video/mp4"]').setInputFiles(file);
 await page.getByRole('button',{name:'Upload image or animated map',exact:true}).click();
 await expect(page.getByText('UI animated map',{exact:true})).toBeVisible();
 const socket=io(`http://localhost:${PORT}`,{transports:['websocket']});
 try{const r=await socket.timeout(5000).emitWithAck('join',{sessionCode:code,role:'dm',dmPassphrase:DM_SECRET});expect(r.snapshot.maps.find((m:any)=>m.name==='UI animated map').videoPath).toMatch(/\.mp4$/);}
 finally{socket.disconnect();}
});
