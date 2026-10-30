/** Opt-in release-to-first-motion timing, with no video encoder overhead. */
import {test,expect} from '@playwright/test';
import {io} from 'socket.io-client';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {DM_SECRET,PORT} from './playwright.config';
import {probe,xy} from './helpers/movementProbe';
import {projectGround} from '../client/src/canvas/miniatureProjection';
const rates=(process.env.MOTION_LATENCY_RATES??'1,6,20').split(',').map(Number);
const modes=(process.env.MOTION_LATENCY_MODES??'legacy').split(',');
if(modes.some(m=>!['legacy','local-2d','local-3d'].includes(m)))throw Error('Unknown motion latency mode');
if(process.env.MOTION_LATENCY_ASSIST&&process.env.MOTION_LATENCY_ASSIST!=='on')throw Error('MOTION_LATENCY_ASSIST supports on; omit it for the original Legacy-only assistance comparison.');
const stats=(a:number[])=>{const v=a.slice().sort((a,b)=>a-b);return {mean:a.reduce((sum,n)=>sum+n,0)/a.length,median:v[Math.floor(v.length/2)],p95:v[Math.ceil(v.length*.95)-1],max:Math.max(...v)};};
test.use({trace:'off',launchOptions:{executablePath:process.env.PW_CHROMIUM,args:['--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows']}});
test('movement latency on independent player and DM clients',async({browser,request})=>{
 test.skip(!process.env.MOTION_LATENCY_OUTPUT,'Set MOTION_LATENCY_OUTPUT and E2E_PERFORMANCE_METRICS=1.');test.setTimeout(600000);
 const folder=path.resolve(process.env.MOTION_LATENCY_OUTPUT!);await fs.mkdir(folder,{recursive:true});
 const report:any={method:'Eight actual player drags per mode/rate, separate disposable courtyard for each condition. Player and DM both throttled after startup; server unthrottled on the same PC. Legacy: smooth, assisted, WebGL blocked. Local 2D: overhead, Low, assist off, flat tokens. Local 3D: 45-degree tilt, Low, assist off, real WebGL/models. No video recording or network/RAM/GPU limit. Epoch clocks share the host. First-motion and sight estimates include two RAF opportunities, not physical display scanout. CDP slowdown is not a complete emulation of old hardware. All modes still use authoritative server movement/filtering/exploration.',host:{cpu:os.cpus()[0].model,logicalCpus:os.cpus().length,browser:browser.version()},runs:[]};
 const save=()=>fs.writeFile(path.join(folder,'results.json'),JSON.stringify(report,null,2));
 report.method='Eight real player drags per graphics mode and CPU rate, separate disposable courtyard per condition; assist setting is recorded per run. Player and DM (in Player view) are throttled after startup; server is unrestricted on the same PC. Legacy blocks WebGL; 2D is overhead Low with flat tokens; 3D is tilted Low with real WebGL/models. No video, trace, network delay or RAM cap. Epoch clocks share a host; paint estimates include two RAF opportunities, not physical display scanout. Server stages may overlap and must not be added together. CPU slowdown is not an old-hardware emulator.';
 for(const mode of modes)for(const rate of rates){
  const legacy=mode==='legacy',assisted=legacy||process.env.MOTION_LATENCY_ASSIST==='on';
  report.assistance=process.env.MOTION_LATENCY_ASSIST??'Legacy only';
  const headers={'x-dm-passphrase':DM_SECRET},image=await fs.readFile('assets/maps/experiments/courtyard-relief-20261002/original.png');
  const {code}=await(await request.post('/api/sessions',{headers,data:{name:`Disposable smooth latency ${rate}x`}})).json();
  const map=await(await request.post(`/api/sessions/${code}/maps`,{headers,multipart:{name:'Courtyard latency',image:{name:'courtyard.png',mimeType:'image/png',buffer:image}}})).json();
  const admin=io(`http://localhost:${PORT}`,{transports:['websocket']});
  const state=async()=>(await admin.timeout(20000).emitWithAck('join',{sessionCode:code,role:'dm',dmPassphrase:DM_SECRET})).snapshot;
  const run:any={mode,cpuSlowdown:rate,assisted,samples:[],status:'running'};report.runs.push(run);await save();
  const contexts=await Promise.all(['Player','DM'].map(()=>browser.newContext({baseURL:`http://localhost:${PORT}`,viewport:{width:1600,height:1000},serviceWorkers:'block'})));
  try{
   const s=await state(),pc=s.characters.find((c:any)=>c.name==='Druk');admin.emit('map:setActive',{mapId:map.id});admin.emit('map:setGrid',{mapId:map.id,gridSizePx:16,feetPerSquare:5,widthFt:380,locked:true});
   for(const layer of ['map','tokens'])admin.emit('fog:setLayer',{mapId:map.id,layer,enabled:false});admin.emit('fog:setExploration',{mapId:map.id,mode:'remembered'});
   for(const w of [{id:'nw',ax:24,ay:330,bx:255,by:330},{id:'sw',ax:24,ay:535,bx:260,by:535},{id:'ne',ax:955,ay:335,bx:1190,by:335},{id:'se',ax:950,ay:535,bx:1190,by:535}])admin.emit('map:editWalls',{mapId:map.id,add:w});
   admin.emit('map:setEnvironment',{mapId:map.id,settings:{enabled:true,heavyDarkness:true,lighting:'dungeon',shadows:true,mist:false,lights:[]}});admin.emit('token:spawn',{mapId:map.id,kind:'pc',refId:pc.id,x:150,y:440});
   admin.emit('monster:create',{name:'Latency Guard',modelType:'goblin',icon:'G',maxHp:20,armorClass:13,disposition:'enemy'});
   const template=(await state()).monsterTemplates.find((m:any)=>m.name==='Latency Guard');for(const x of [450,820])admin.emit('token:spawn',{mapId:map.id,kind:'monster',refId:template.id,x,y:400});
   const token=(await state()).tokens.find((t:any)=>t.kind==='pc');admin.emit('token:setLantern',{tokenId:token.id,enabled:true});await state();
   const pages=await Promise.all(contexts.map(c=>c.newPage())),[player,dm]=pages,errors:string[]=[];
   for(const [i,p] of pages.entries()){
    p.on('pageerror',e=>errors.push(e.message));await probe(p,i?'DM':'Player',rate,true,legacy);
    await p.addInitScript(({mode,legacy,assisted,i})=>{sessionStorage.setItem('dnd.rendering-started','1');localStorage.setItem('dnd-environment-quality',legacy?'legacy':'low');localStorage.setItem('dnd-legacy-movement','smooth');localStorage.setItem('dnd-server-rendering',assisted?'on':'off');
     const playerId=`latency-${mode}-${i}`;localStorage.setItem('dnd.playerId',playerId);localStorage.setItem(`dnd.battlefieldView:${playerId}`,mode==='local-3d'?'tilted':'overhead');for(const key of ['tokenView','monsterTokenView'])localStorage.setItem(`dnd.${key}:${playerId}`,mode==='local-3d'?'3d':'2d');
     const w=window as any,stamp=()=>performance.timeOrigin+performance.now();
     w.__watchMotion=(data:any)=>{
      const n=w.Konva.stages.flatMap((s:any)=>s.find('.token')).find((n:any)=>n.getAttr('tokenId')===data.id),visualX=()=>n.x()+(n.findOne('.token-art')?.x()??0),from={x:visualX(),y:n.y()};
      // Atlas pose zero reproduces the previous sight. Changing image layout
      // alone must not be counted as a visibility update during movement.
      const sight=()=>legacy?document.querySelector('[data-testid=legacy-motion-mask] img')?.getAttribute('data-frame')??'0':[...document.querySelectorAll('[data-testid=player-vision] mask[id^="vision-cover-"] > g > path')].map(p=>p.getAttribute('d')).join('|');
      w.__move.arm(data);const a=w.__move.active;a.from=from;a.motionFrames=[];const deadline=performance.now()+25000;let lastX=from.x,stable=0,lastSight=sight(),sightVersion=0;
      const painted=(field:string)=>{const count=Number(document.querySelector('[data-testid=miniature-layer]')?.getAttribute('data-render-count'));requestAnimationFrame(()=>requestAnimationFrame(function check(){if(w.__move.active!==a)return;if(!legacy&&Number(document.querySelector('[data-testid=miniature-layer]')?.getAttribute('data-render-count'))<=count){requestAnimationFrame(check);return;}a[field]=stamp();}));};
      const frame=()=>{if(w.__move.active!==a)return;const at=stamp(),x=visualX(),stage=document.querySelector('.stage-wrap')?.getAttribute('data-motion-stage'),mask=document.querySelector('[data-testid=legacy-motion-mask] img')?.getAttribute('data-frame');
       if(w.__move.role==='DM'||a.releasedAt){
        const nextSight=sight();if(nextSight!==lastSight){lastSight=nextSight;sightVersion++;if(!a.sightChangedAt){a.sightChangedAt=at;painted('sightPaintAt');}}
        a.motionFrames.push({at,x,stage,mask,sightVersion,gpuDrawCount:document.querySelector('[data-testid=miniature-layer]')?.getAttribute('data-render-count'),layout:document.querySelector('[data-testid=legacy-terrain]')?.getAttribute('data-motion-layout')});
        if(!a.firstMotionAt&&Math.abs(x-from.x)>1){a.firstMotionAt=at;painted('firstMotionPaintAt');}
        stable=Math.abs(x-lastX)<.0001?stable+1:0;lastX=x;
        if(a.firstMotionAt&&Math.abs(x-data.x)<4&&stage==='2'&&(legacy||stable>=2)){a.doneAt=at;a.actualX=x;return;}
       }
       if(performance.now()<deadline)requestAnimationFrame(frame);
      };requestAnimationFrame(frame);
     };
    },{mode,legacy,assisted,i});
   }
   await player.goto(`/join?code=${code}`);await player.getByRole('button',{name:'Join',exact:true}).click();await player.locator('.claim-row').filter({hasText:'Druk'}).click();
   await dm.goto(`/dm?code=${code}`);await dm.locator('input[type=password]').fill(DM_SECRET);await dm.getByRole('button',{name:'Rejoin as DM',exact:true}).click();await dm.getByLabel('Battlefield visibility',{exact:true}).selectOption('player');
   for(const p of pages){
    await expect(p.getByRole('checkbox',{name:'Server managed rendering',exact:true})).toBeChecked({checked:assisted});
    if(legacy){await expect(p.getByTestId('legacy-terrain')).toHaveAttribute('data-grading','server');await expect(p.getByRole('checkbox',{name:'Animate Legacy movement',exact:true})).toHaveCount(0);}
    else{await expect(p.getByTestId('player-vision')).toHaveAttribute('data-wall-geometry-source',assisted?'server':'client');await expect(p.getByTestId('miniature-layer')).toHaveAttribute('data-miniature-status','ready',{timeout:90000});await expect(p.getByTestId('miniature-layer')).toHaveAttribute('data-tilt-degrees',mode==='local-3d'?'45':'0');}
    await p.evaluate(()=>document.getElementById('movement-caption')?.remove());
   }
   if(!legacy)run.gpu=await player.getByTestId('miniature-layer').evaluate(el=>{const gl=el.querySelector('canvas')!.getContext('webgl2')!,ext=gl.getExtension('WEBGL_debug_renderer_info');return ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER);});
   const cds=await Promise.all(pages.map(p=>p.context().newCDPSession(p)));for(const c of cds)await c.send('Emulation.setCPUThrottlingRate',{rate});
   await Promise.all(pages.map(p=>p.evaluate(()=>(window as any).__move.start())));await player.waitForTimeout(800);
   for(const [i,x] of [350,550,750,1060,750,550,350,150].entries()){
    const performanceId=`${mode}-${rate}-${i}`;
    await Promise.all(pages.map(p=>p.evaluate(data=>(window as any).__watchMotion(data),{id:token.id,x,y:440,seq:i,performanceId})));
    let from=await xy(player,token.id),to=await xy(player,token.id,x,440);
    if(mode==='local-3d'){const stage=await player.evaluate(()=>{const s=(window as any).Konva.stages.find((s:any)=>s.find('.token').length),r=s.getContent().getBoundingClientRect();return {width:s.width(),height:s.height(),x:r.left,y:r.top};});const project=(p:{x:number;y:number})=>{const v=projectGround(p.x-stage.x,p.y-stage.y,stage.width,stage.height,45);return{x:v.x+stage.x,y:v.y+stage.y};};from=project(from);to=project(to);}
    await player.mouse.move(from.x,from.y);await player.mouse.down();await player.mouse.move(to.x,to.y,{steps:8});await player.mouse.up();await player.mouse.move(1500,200);
    const healthStart=performance.now();const healthResponse=await request.get('/api/health');const healthMs=performance.now()-healthStart;expect(healthResponse.ok()).toBe(true);
    await Promise.all(pages.map(p=>p.waitForFunction(()=>(window as any).__move.active?.doneAt&&(window as any).__move.active?.sightPaintAt&&(window as any).__move.active?.firstMotionPaintAt,undefined,{timeout:30000})));
    const data=await Promise.all(pages.map(p=>p.evaluate(()=>{const w=window as any;return {active:w.__move.active,frames:w.__move.frames.filter((f:any)=>f.id===w.__move.active.performanceId),resources:w.__move.resources};})));
    const released=data[0].active.releasedAt;expect(released).toBeGreaterThan(0);
    const sample:any={seq:i,releasedAt:released,healthMs,views:[]};
    for(const [j,d] of data.entries()){
     const a=d.active,poses=a.motionFrames.filter((f:any)=>f.stage==='playing'&&f.mask!=null&&Number(f.mask)<12),errors=poses.map((f:any)=>{const t=Number(f.mask)/12,p=t*t*(3-2*t);return Math.abs(f.x-(a.from.x+(a.actualX-a.from.x)*p));});
     if(legacy&&rate<=6){expect(new Set(poses.map((f:any)=>f.mask)).size).toBeGreaterThanOrEqual(3);expect(poses.some((f:any)=>f.layout==='shared-base')).toBe(true);}if(errors.length)expect(Math.max(...errors)).toBeLessThan(.1);
     const frame=d.frames.find((f:any)=>legacy?f.server?.motionEndAt:f.server?.emittedAt);
     expect(frame,'server movement metrics are enabled').toBeTruthy();
     sample.views.push({role:j?'DM':'Player',firstPaintMs:a.firstMotionPaintAt-released,firstSightPaintMs:a.sightPaintAt-released,completeMs:a.doneAt-released,poseCount:legacy?new Set(poses.map((f:any)=>f.mask)).size:new Set(a.motionFrames.filter((f:any)=>Math.abs(f.x-a.from.x)>1&&Math.abs(f.x-a.actualX)>1).map((f:any)=>f.x)).size,sightUpdates:Math.max(...a.motionFrames.map((f:any)=>f.sightVersion)),maxAlignmentPixels:errors.length?Math.max(...errors):null,frame,resources:d.resources.filter((r:any)=>r.startAt>=released),motionFrames:a.motionFrames});
    }
    run.samples.push(sample);await save();await player.waitForTimeout(150);
   }
   run.summary=Object.fromEntries(['Player','DM'].map(role=>[role,stats(run.samples.map((s:any)=>s.views.find((v:any)=>v.role===role).firstPaintMs))]));
   run.phases=Object.fromEntries(['Player','DM'].map(role=>{
    const views=run.samples.map((s:any)=>s.views.find((v:any)=>v.role===role)),spans=views.map((v:any)=>{const s=v.frame.server;return {apply:s.appliedAt-s.receivedAt,pathAndSnapshot:s.queuedAt-s.appliedAt,deliveryWait:s.startedAt-s.queuedAt,geometry:s.geometryEndAt-s.geometryStartAt,render:s.renderEndAt-s.renderStartAt,motion:s.motionEndAt-s.motionStartAt,server:s.emittedAt-s.receivedAt,transport:v.frame.frameReceivedAt-s.emittedAt};});
    return [role,Object.fromEntries(Object.keys(spans[0]).map(key=>[key,stats(spans.map((s:any)=>s[key]).filter(Number.isFinite))]))];
   }));run.status='passed';expect(errors).toEqual([]);console.log(JSON.stringify({mode,rate,summary:run.summary,server:run.phases.Player.server}));
  }finally{admin.disconnect();await Promise.all(contexts.map(c=>c.close()));await save();}
 }
});
