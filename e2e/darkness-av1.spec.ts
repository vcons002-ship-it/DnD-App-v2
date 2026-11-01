import {openToolbarGroup} from './helpers/mobileToolbar';
import {test,expect,chromium} from '@playwright/test';
import {io} from 'socket.io-client';
import {spawn,execFileSync} from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import {DM_SECRET,PORT} from './playwright.config';
import {xy} from './helpers/movementProbe';
import {captureAv1} from './helpers/av1Capture';
import {projectGround} from '../client/src/canvas/miniatureProjection';
test.use({trace:'off'});
for(const mode of ['legacy','3d'])test(`AV1 60 fps real courtyard darkness / ${mode}`,async({request})=>{
 test.skip(!process.env.DARKNESS_AV1_OUTPUT,'Set DARKNESS_AV1_OUTPUT to capture the test window directly with NVENC AV1.');test.setTimeout(300000);
 const output=path.resolve(process.env.DARKNESS_AV1_OUTPUT!);await fs.mkdir(output,{recursive:true});
 const headers={'x-dm-passphrase':DM_SECRET},image=await fs.readFile('assets/maps/experiments/courtyard-relief-20261002/original.png');
 const {code}=await(await request.post('/api/sessions',{headers,data:{name:`Disposable courtyard AV1 / ${mode}`}})).json();
 const map=await(await request.post(`/api/sessions/${code}/maps`,{headers,multipart:{name:'Textured ruined courtyard',image:{name:'courtyard.png',mimeType:'image/png',buffer:image}}})).json();
 const admin=io(`http://localhost:${PORT}`,{transports:['websocket']});
 const state=async()=>(await admin.timeout(20000).emitWithAck('join',{sessionCode:code,role:'dm',dmPassphrase:DM_SECRET})).snapshot;
 const observer=await chromium.launch({executablePath:process.env.PW_CHROMIUM,headless:true,args:['--force-device-scale-factor=1','--window-position=0,0','--window-size=1640,1100','--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows']});
 const controls=await chromium.launch({executablePath:process.env.PW_CHROMIUM,headless:true,args:['--disable-background-timer-throttling','--disable-renderer-backgrounding']});
 const dragCapture=process.env.DARKNESS_DRAG_CAPTURE==='1';let playerCapture:Awaited<ReturnType<typeof captureAv1>>|undefined;
 let recorder:ReturnType<typeof spawn>|undefined,recordExit:Promise<number|null>|undefined,recordLog='',captureTimer:ReturnType<typeof setInterval>|undefined,captureSession:Awaited<ReturnType<import('@playwright/test').BrowserContext['newCDPSession']>>|undefined;
 const report:any={mode,codec:'av1',encoder:'av1_nvenc',capture:'Chrome CDP JPEG frames go directly into NVENC AV1 at 60 fps. No Playwright/VP8 video intermediate, slow motion or motion interpolation. Unchanged frame holds are duplicated to preserve wall-clock timing.',map:'assets/maps/experiments/courtyard-relief-20261002/original.png',phases:[],errors:[]};
 const stop=async()=>{if(!recorder)return;if(captureTimer)clearInterval(captureTimer);await captureSession?.send('Page.stopScreencast');recorder.stdin?.end();const result=await Promise.race([recordExit,new Promise<null>(resolve=>setTimeout(()=>resolve(null),15000))]);if(result===null&&recorder.exitCode===null)recorder.kill();recorder=undefined;await fs.writeFile(path.join(output,`${mode}-ffmpeg.log`),recordLog);expect(result).toBe(0);};
 try{
  const first=await state(),pc=first.characters.find((c:any)=>c.name==='Druk');admin.emit('map:setActive',{mapId:map.id});admin.emit('map:setGrid',{mapId:map.id,gridSizePx:16,feetPerSquare:5,widthFt:380,locked:true});
  for(const layer of ['map','tokens'])admin.emit('fog:setLayer',{mapId:map.id,layer,enabled:false});
  admin.emit('fog:setExploration',{mapId:map.id,mode:'remembered'});
  // The central east-west road is open. Short walls frame the visible map art.
  for(const wall of [{id:'north-west',ax:24,ay:330,bx:255,by:330},{id:'south-west',ax:24,ay:535,bx:260,by:535},{id:'north-east',ax:955,ay:335,bx:1190,by:335},{id:'south-east',ax:950,ay:535,bx:1190,by:535}])admin.emit('map:editWalls',{mapId:map.id,add:wall});
  const settings=(dark:boolean)=>({enabled:true,heavyDarkness:dark,lighting:dark?'dungeon':'day',shadows:true,mist:false,lights:[]});
  admin.emit('map:setEnvironment',{mapId:map.id,settings:settings(false)});admin.emit('token:spawn',{mapId:map.id,kind:'pc',refId:pc.id,x:150,y:440});
  admin.emit('monster:create',{name:'Courtyard Guard',modelType:'goblin',icon:'G',maxHp:20,armorClass:13,disposition:'enemy'});
  const template=(await state()).monsterTemplates.find((m:any)=>m.name==='Courtyard Guard');for(const x of [450,820])admin.emit('token:spawn',{mapId:map.id,kind:'monster',refId:template.id,x,y:400});
  const all=await state(),token=all.tokens.find((t:any)=>t.kind==='pc'),enemies=all.tokens.filter((t:any)=>t.kind==='monster');
  admin.emit('token:setLantern',{tokenId:token.id,enabled:true});await state();
  const controller=await controls.newContext({baseURL:`http://localhost:${PORT}`,viewport:{width:1600,height:1000}});await controller.addInitScript(({mode,dragCapture})=>{sessionStorage.setItem('dnd.rendering-started','1');localStorage.setItem('dnd-environment-quality',dragCapture&&mode==='3d'?'low':'legacy');localStorage.setItem('dnd-legacy-movement','smooth');if(dragCapture){localStorage.setItem('dnd.playerId',`drag-${mode}`);localStorage.setItem(`dnd.battlefieldView:drag-${mode}`,mode==='legacy'?'overhead':'tilted');localStorage.setItem(`dnd.tokenView:drag-${mode}`,'3d');localStorage.setItem(`dnd.monsterTokenView:drag-${mode}`,'3d');}},{mode,dragCapture});
  const player=await controller.newPage();await player.goto(`/join?code=${code}`);await player.getByRole('button',{name:'Join',exact:true}).click();await player.locator('.claim-row').filter({hasText:'Druk'}).click();
  if(dragCapture){
   if(mode==='3d')await expect(player.getByTestId('miniature-layer')).toHaveAttribute('data-miniature-status','ready',{timeout:90000});
   await player.evaluate(mode=>{
    const w=window as any;w.__dragCapture={events:[],footprints:[]};
    const label=document.createElement('div');label.style.cssText='position:fixed;bottom:12px;left:12px;z-index:99999;background:#111e;color:#fff0b8;border:1px solid #a9905d;border-radius:6px;padding:12px;font:16px system-ui;pointer-events:none;white-space:pre-line';document.body.append(label);
    w.__dragCapture.label=(text:string)=>label.textContent=`PLAYER / ${mode==='legacy'?'Legacy':'3D Low'} / real click and drag\n${text}`;
    const cursor=document.createElement('div');cursor.style.cssText='position:fixed;left:0;top:0;width:30px;height:30px;border:3px solid #ffe66b;border-radius:50%;background:#ffdb4020;box-shadow:0 0 0 2px #000;pointer-events:none;z-index:100000;transform:translate(-100px,-100px)';document.body.append(cursor);
    for(const type of ['pointermove','pointerdown','pointerup'])document.addEventListener(type,e=>{cursor.style.transform=`translate(${e.clientX-15}px,${e.clientY-15}px)`;cursor.style.background=e.buttons?'#ff573088':'#ffdb4020';cursor.style.borderColor=e.buttons?'#ff866c':'#ffe66b';if(type!=='pointermove')w.__dragCapture.events.push({type,x:e.clientX,y:e.clientY,at:performance.now()});},true);
    setInterval(()=>{const nodes=w.Konva?.stages.flatMap((s:any)=>s.find('.footstep'))??[];w.__dragCapture.footprints.push({at:performance.now(),count:nodes.length});},100);
    w.__dragCapture.label('Yellow cursor: released. Red cursor: mouse button held.');
   },mode);
  }
  const context=await observer.newContext({baseURL:`http://localhost:${PORT}`,viewport:{width:1600,height:1000},deviceScaleFactor:1});
  await context.addInitScript(mode=>{sessionStorage.setItem('dnd.rendering-started','1');localStorage.setItem('dnd-environment-quality',mode==='legacy'?'legacy':'low');localStorage.setItem('dnd-legacy-movement','smooth');localStorage.setItem('dnd.playerId',`av1-${mode}`);localStorage.setItem(`dnd.battlefieldView:av1-${mode}`,mode==='legacy'?'overhead':'tilted');localStorage.setItem(`dnd.tokenView:av1-${mode}`,'3d');localStorage.setItem(`dnd.monsterTokenView:av1-${mode}`,'3d');},mode);
  if(process.env.DARKNESS_PROFILE==='1')await context.addInitScript(()=>{const w=window as any;w.__shaderWaits=[];const proto=WebGL2RenderingContext.prototype;for(const name of ['getProgramInfoLog','getShaderInfoLog','getProgramParameter','getUniformLocation'] as const){const original=proto[name] as Function;(proto as any)[name]=function(...args:any[]){const start=performance.now(),result=original.apply(this,args),ms=performance.now()-start;if(ms>50){const sources=name==='getShaderInfoLog'?[this.getShaderSource(args[0])]:this.getAttachedShaders(args[0])?.map((s:WebGLShader)=>this.getShaderSource(s));w.__shaderWaits.push({name,ms,at:start,sources});}return result;};}});
  const page=await context.newPage();const profileSession=process.env.DARKNESS_PROFILE==='1'?await context.newCDPSession(page):undefined;if(profileSession){await profileSession.send('Profiler.enable');await profileSession.send('Profiler.start');}page.on('pageerror',e=>report.errors.push(e.message));await page.goto(`/dm?code=${code}`);await page.locator('input[type=password]').fill(DM_SECRET);await page.getByRole('button',{name:'Rejoin as DM',exact:true}).click();await openToolbarGroup(page,'View');await page.getByLabel('Battlefield visibility',{exact:true}).selectOption('player');
  if(mode==='legacy')await expect(page.getByTestId('legacy-terrain')).toHaveAttribute('data-grading','server');
  else{await expect(page.getByTestId('miniature-layer')).toHaveAttribute('data-miniature-status','ready',{timeout:90000});await expect(page.getByTestId('miniature-layer')).toHaveAttribute('data-miniature-count','3');report.gpu=await page.getByTestId('miniature-layer').evaluate(el=>{const gl=el.querySelector('canvas')!.getContext('webgl2')!,ext=gl.getExtension('WEBGL_debug_renderer_info');return ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER);});}
  if(mode==='legacy'){
   report.layers=await page.evaluate(()=>{const img=document.querySelector('[data-testid=legacy-terrain] img') as HTMLImageElement,c=document.createElement('canvas');c.width=img.naturalWidth;c.height=img.naturalHeight;const ctx=c.getContext('2d')!;ctx.drawImage(img,0,0);return {image:{src:img.src,rect:img.getBoundingClientRect().toJSON(),size:[img.naturalWidth,img.naturalHeight],pixel:[...ctx.getImageData(Math.floor(c.width/2),Math.floor(c.height/2),1,1).data]},ancestors:[img,img.parentElement!,img.parentElement!.parentElement!,img.closest('[data-testid=legacy-terrain]')!].map(e=>({tag:e.tagName,style:(e as HTMLElement).style.cssText,rect:e.getBoundingClientRect().toJSON()})),canvases:(window as any).Konva.stages.flatMap((s:any)=>s.getLayers().map((l:any)=>({name:l.name(),z:l.getNativeCanvasElement().style.zIndex,pixel:[...l.getNativeCanvasElement().getContext('2d').getImageData(800,600,1,1).data]})))};});
   await fs.writeFile(path.join(output,'legacy-layers.json'),JSON.stringify(report.layers,null,2));await fs.writeFile(path.join(output,'legacy-terrain-debug.png'),await(await request.get(report.layers.image.src)).body());
   if(process.env.DARKNESS_AV1_DEBUG==='1'){await page.screenshot({path:path.join(output,'legacy-debug.png')});return;}
  }
  await page.evaluate(({mode,pc,enemies})=>{
   document.title=`DnD Darkness AV1 ${mode}`;const w=window as any;w.__av1={samples:[],moves:[],atlasSources:[],active:false};
   const el=document.createElement('div');el.id='av1-caption';el.style.cssText='position:fixed;bottom:12px;left:16px;z-index:99999;background:#111e;color:#ffedbd;border:1px solid #a9905d;padding:12px 18px;border-radius:6px;font:16px system-ui;pointer-events:none;white-space:pre-line';document.body.append(el);
   w.__av1.label=(text:string)=>el.textContent=`${mode==='legacy'?'LEGACY / synchronized 30 fps sight and tokens':'3D / Low / tilted board'} / direct AV1 capture, 60 fps\nDM in Player view / server assist ON\n${text}`;
   let last=performance.now();const frame=()=>{const now=performance.now();if(w.__av1.active){const art=document.querySelector('[data-testid=legacy-terrain] img') as HTMLImageElement;if(art&&art.naturalWidth>2048&&!w.__av1.atlasSources.some((a:any)=>a.src===art.src))w.__av1.atlasSources.push({src:art.src,rect:art.getBoundingClientRect().toJSON(),style:art.style.cssText,size:[art.naturalWidth,art.naturalHeight]});const nodes=w.Konva.stages.flatMap((s:any)=>s.find('.token')),token=nodes.find((n:any)=>n.getAttr('tokenId')===pc);w.__av1.samples.push({at:now,dt:now-last,x:token?.x(),move:w.__av1.moves.length-1,maskFrame:document.querySelector('[data-testid=legacy-motion-mask] img')?.getAttribute('data-frame'),stage:document.querySelector('.stage-wrap')?.getAttribute('data-motion-stage'),shown:enemies.filter((id:string)=>nodes.some((n:any)=>n.getAttr('tokenId')===id&&n.isVisible()&&n.opacity()>.01))});}last=now;requestAnimationFrame(frame);};frame();
  },{mode,pc:token.id,enemies:enemies.map((e:any)=>e.id)});
  const playerLabel=async(text:string)=>{if(dragCapture)await player.evaluate(text=>(window as any).__dragCapture.label(text),text);};
  const caption=async(text:string)=>{report.phases.push({text,at:Date.now()});await page.evaluate(text=>(window as any).__av1.label(text),text);await playerLabel(text);};
  await caption('Normal vision in daylight: full-color map and creatures.');await page.bringToFront();await page.waitForTimeout(1000);
  const file=path.join(output,`${mode}-courtyard-av1.mp4`);report.file=file;
  recorder=spawn('ffmpeg',['-hide_banner','-y','-f','image2pipe','-vcodec','mjpeg','-framerate','60','-i','pipe:0','-an','-c:v','av1_nvenc','-preset','p4','-cq','18','-pix_fmt','yuv420p','-fps_mode','cfr','-movflags','+faststart','-progress','pipe:1',file],{windowsHide:true,stdio:['pipe','pipe','pipe']});
  let recordedFrames=0;recorder.stdout!.on('data',b=>{for(const m of b.toString().matchAll(/frame=(\d+)/g))recordedFrames=Number(m[1]);});recorder.stderr!.on('data',b=>recordLog+=b.toString());recordExit=new Promise(resolve=>recorder!.once('exit',resolve));
  captureSession=await context.newCDPSession(page);let latest:Buffer|undefined,startCapture=0,written=0,blocked=false;
  report.captureFrames=[];
  captureSession.on('Page.screencastFrame',event=>{latest=Buffer.from(event.data,'base64');report.captureFrames.push({receivedAt:Date.now(),timestamp:event.metadata.timestamp});void captureSession!.send('Page.screencastFrameAck',{sessionId:event.sessionId});});
  await captureSession.send('Page.startScreencast',{format:'jpeg',quality:95,maxWidth:1600,maxHeight:1000,everyNthFrame:1});
  captureTimer=setInterval(()=>{if(!latest||blocked||!recorder)return;if(!startCapture)startCapture=performance.now();const due=Math.floor((performance.now()-startCapture)/1000*60)+1;while(written<due&&!blocked){written++;if(!recorder.stdin!.write(latest)){blocked=true;recorder.stdin!.once('drain',()=>blocked=false);}}},4);
  await expect.poll(()=>recordedFrames,{timeout:20000}).toBeGreaterThan(30);
  if(dragCapture)playerCapture=await captureAv1(player,path.join(output,`${mode}-player-drag-av1.mp4`));
  report.captureStartedAt=Date.now();await page.evaluate(()=>(window as any).__av1.active=true);await page.waitForTimeout(2500);await page.screenshot({path:path.join(output,`${mode}-daylight.png`)});
  admin.emit('map:setEnvironment',{mapId:map.id,settings:settings(true)});await state();admin.emit('fog:resetExploration',{mapId:map.id});await state();
  await expect(mode==='legacy'?page.getByTestId('legacy-vision'):page.getByTestId('player-vision')).toHaveAttribute('data-heavy','true');await page.waitForTimeout(1200);
  await caption('Lantern: full color nearby. Darkvision: gray beyond it. Unseen ground: black.');await page.waitForTimeout(2000);
  const walk=async(dest:number)=>{
   await page.evaluate(({id,dest})=>{const n=(window as any).Konva.stages.flatMap((s:any)=>s.find('.token')).find((n:any)=>n.getAttr('tokenId')===id);(window as any).__av1.moves.push({at:performance.now(),from:n.x(),to:dest});},{id:token.id,dest});
   let from=await xy(player,token.id),to=await xy(player,token.id,dest,440);
   if(dragCapture&&mode==='3d'){
    const stage=await player.evaluate(()=>{const s=(window as any).Konva.stages.find((s:any)=>s.find('.token').length),r=s.getContent().getBoundingClientRect();return {width:s.width(),height:s.height(),x:r.left,y:r.top};});
    const project=(p:{x:number;y:number})=>{const v=projectGround(p.x-stage.x,p.y-stage.y,stage.width,stage.height,45);return {x:v.x+stage.x,y:v.y+stage.y};};from=project(from);to=project(to);
   }
   await playerLabel('Click and hold the token. Red cursor = mouse button held.');
   await player.mouse.move(from.x,from.y);await player.mouse.down();
   if(dragCapture){await player.waitForTimeout(450);await playerLabel('HOLDING + DRAGGING — destination preview before release.');for(let step=1;step<=30;step++){await player.mouse.move(from.x+(to.x-from.x)*step/30,from.y+(to.y-from.y)*step/30);await player.waitForTimeout(30);}await player.waitForTimeout(350);}
   else await player.mouse.move(to.x,to.y,{steps:8});
   await player.mouse.up();await playerLabel('RELEASED — accepted movement leaves footsteps.');await player.mouse.move(1500,200);
   await expect.poll(async()=>Math.abs(await page.evaluate(id=>(window as any).Konva.stages.flatMap((s:any)=>s.find('.token')).find((n:any)=>n.getAttr('tokenId')===id)?.x(),token.id)-dest),{timeout:30000}).toBeLessThan(3);
   await page.evaluate(id=>{const w=window as any,n=w.Konva.stages.flatMap((s:any)=>s.find('.token')).find((n:any)=>n.getAttr('tokenId')===id);w.__av1.moves.at(-1).accepted=n.x();},token.id);
   if(mode==='legacy'){await page.waitForFunction(()=>document.querySelector('.stage-wrap')?.getAttribute('data-motion-stage')==='2');expect(await page.getByTestId('legacy-terrain').locator('img').evaluate(el=>(el as HTMLImageElement).style.transform)).toBe('translate(0px, 0px)');await expect.poll(()=>page.evaluate(()=>(window as any).Konva.stages.flatMap((s:any)=>s.find('.footstep')).length)).toBeGreaterThan(0);}
   if(dragCapture)await player.waitForTimeout(1100);else await page.waitForTimeout(250);
  };
  for(const dest of [350,550,750,1060]){await caption('Walking east. Guards appear in sight and disappear behind. Each drop is a separate move.');await walk(dest);}
  await caption('At the far end: guards hidden again. Remembered ground is dim gray; current sight stays brighter.');await page.waitForTimeout(2000);await page.screenshot({path:path.join(output,`${mode}-memory.png`)});
  for(const dest of [750,550,350,150]){await caption('Returning: guards reappear, then return to darkness.');await walk(dest);}
  const litTerrain=mode==='legacy'?await page.getByTestId('legacy-terrain').locator('img').getAttribute('src'):undefined;
  admin.emit('token:setLantern',{tokenId:token.id,enabled:false});await state();
  if(mode==='legacy')await expect.poll(()=>page.getByTestId('legacy-terrain').locator('img').getAttribute('src'),{timeout:30000}).not.toBe(litTerrain);
  else await expect(page.getByTestId('miniature-layer')).toHaveAttribute('data-carried-lantern-count','0');
  await caption('Lantern off: current darkvision is gray; remembered ground remains darker.');await page.waitForTimeout(2200);await page.screenshot({path:path.join(output,`${mode}-darkvision.png`)});
  await page.evaluate(()=>(window as any).__av1.active=false);report.samples=await page.evaluate(()=>(window as any).__av1.samples);report.moves=await page.evaluate(()=>(window as any).__av1.moves);report.atlases=await page.evaluate(()=>(window as any).__av1.atlasSources);
  if(playerCapture){report.player=await playerCapture.stop();report.player.interaction=await player.evaluate(()=>(window as any).__dragCapture);expect(report.player.interaction.events.filter((e:any)=>e.type==='pointerdown')).toHaveLength(8);if(mode==='legacy')expect(Math.max(...report.player.interaction.footprints.map((s:any)=>s.count))).toBeGreaterThan(0);}
  await stop();if(mode==='legacy'&&report.atlases.length)await fs.writeFile(path.join(output,'legacy-atlas-debug.png'),await(await request.get(report.atlases[0].src)).body());
  report.probe=JSON.parse(execFileSync('ffprobe',['-v','error','-show_entries','stream=codec_name,width,height,r_frame_rate,nb_frames:format=duration,size','-of','json',file],{encoding:'utf8'}));expect(report.probe.streams[0].codec_name).toBe('av1');expect(report.probe.streams[0].r_frame_rate).toBe('60/1');expect(report.errors).toEqual([]);
  const darkStart=report.phases.find((p:any)=>p.text.startsWith('Lantern:')).at-report.captureStartedAt;
  const samples=report.samples.filter((s:any)=>s.at-report.samples[0].at>darkStart);
  for(const e of enemies){expect(samples.some((s:any)=>s.shown.includes(e.id))).toBe(true);expect(samples.at(-1).shown).not.toContain(e.id);}
  if(mode==='legacy'){
   const errors=report.samples.filter((s:any)=>s.stage==='playing'&&s.maskFrame!==null&&Number(s.maskFrame)<12&&s.move>=0).map((s:any)=>{const m=report.moves[s.move],t=Number(s.maskFrame)/12,p=t*t*(3-2*t);return Math.abs(s.x-(m.from+(m.accepted-m.from)*p));});
   report.alignment={samples:errors.length,maxMapPixels:Math.max(...errors)};expect(errors.length).toBeGreaterThan(50);expect(report.alignment.maxMapPixels).toBeLessThan(.1);
  }
  if(profileSession){const {profile}=await profileSession.send('Profiler.stop');await fs.writeFile(path.join(output,`${mode}-lighting.cpuprofile`),JSON.stringify(profile));await fs.writeFile(path.join(output,`${mode}-shader-waits.json`),JSON.stringify(await page.evaluate(()=>(window as any).__shaderWaits),null,2));}
  report.status='passed';
 }finally{await playerCapture?.stop();await stop();admin.disconnect();await observer.close();await controls.close();await fs.writeFile(path.join(output,`${mode}-results.json`),JSON.stringify(report,null,2));}
});
