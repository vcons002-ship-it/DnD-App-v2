/** Reproducible client stress measurement; uses only the disposable E2E server.
 * LEGACY_STRESS_OUTPUT=/absolute/path LEGACY_STRESS_RATES=1,6,12,20
 * Not an FPS benchmark or a hardware-equivalence claim. */
import {test,expect,type Page} from './helpers/test';
import {io} from 'socket.io-client';
import sharp from 'sharp';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {DM_SECRET,PORT} from './playwright.config';

test.use({trace:'off',skipRenderingChoice:false,launchOptions:{executablePath:process.env.PW_CHROMIUM,args:['--disable-gpu','--disable-accelerated-2d-canvas']}});
const rates=(process.env.LEGACY_STRESS_RATES??'1,6,12,20').split(',').map(Number);
const output=path.resolve(process.env.LEGACY_STRESS_OUTPUT??`artifacts/legacy-stress-${Date.now()}`);
const W=3840,H=2560,MONSTERS=120,ADDITIONS=20;
const quantiles=(values:number[])=>{const a=[...values].sort((a,b)=>a-b);return{samples:a.length,medianMs:Math.round(a[Math.floor(a.length/2)]??0),p95Ms:Math.round(a[Math.max(0,Math.ceil(a.length*.95)-1)]??0),maxMs:Math.round(a.at(-1)??0)};};

async function installProbe(page:Page,rate:number){
 await page.addInitScript(({rate,expected})=>{
  const win=window as any;
  win.__stress={rate,phase:'Startup',webgl:[],longTasks:[],spawn:[],pendingSpawn:null,joinStart:null,joinPaintMs:null,previewStart:null,previewPaintMs:null};
  const original=HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext=function(this:HTMLCanvasElement,kind:string,...args:unknown[]){
   if(kind.includes('webgl')){win.__stress.webgl.push(kind);return null;}
   return (original as any).call(this,kind,...args);
  } as any;
  if(typeof OffscreenCanvas!=='undefined'){
   const get=OffscreenCanvas.prototype.getContext;
   OffscreenCanvas.prototype.getContext=function(this:OffscreenCanvas,kind:string,...args:unknown[]){
    if(kind.includes('webgl')){win.__stress.webgl.push(kind);return null;}
    return (get as any).call(this,kind,...args);
   } as any;
  }
  try{new PerformanceObserver(list=>{for(const entry of list.getEntries())win.__stress.longTasks.push({start:entry.startTime,ms:entry.duration,phase:win.__stress.phase});}).observe({entryTypes:['longtask']});}catch{}
  const count=()=>win.Konva?.stages.find((s:any)=>s.find('.token').length)?.find('.token').length??0;
  win.__stress.tokenCount=count;
  const stageReady=()=>win.Konva?.stages.some((s:any)=>s.find('.token').length>=expected&&s.find('Image').some((n:any)=>n.image()?.naturalWidth>=3840));
  const waitPaint=(ready:()=>boolean,done:()=>void)=>{
   const started=performance.now();const tick=()=>{if(ready())requestAnimationFrame(()=>requestAnimationFrame(done));else if(performance.now()-started<90000)requestAnimationFrame(tick);};requestAnimationFrame(tick);
  };
  document.addEventListener('pointerdown',event=>{
   const target=event.target as HTMLElement;
   if(target.closest('button')?.textContent?.trim()==='Rejoin as DM'){
    win.__stress.joinStart=performance.now();waitPaint(stageReady,()=>win.__stress.joinPaintMs=performance.now()-win.__stress.joinStart);
   }
   if(win.__stress.phase==='Adding creatures'&&target.closest('.konvajs-content')){
    const start=performance.now(),before=count();
    waitPaint(()=>count()>before,()=>win.__stress.spawn.push({ms:performance.now()-start,count:count()}));
   }
  },true);
  document.addEventListener('change',event=>{
   const target=event.target as HTMLSelectElement;
   if(target.getAttribute('aria-label')==='Battlefield visibility'&&target.value==='player'){
    win.__stress.previewStart=performance.now();win.__stress.previewPaintMs=null;
    waitPaint(()=>document.querySelector('[data-testid="legacy-vision"]')?.getAttribute('data-origin-count')==='3',()=>win.__stress.previewPaintMs=performance.now()-win.__stress.previewStart);
   }
  },true);
  document.addEventListener('DOMContentLoaded',()=>{
   const label=document.createElement('div');label.id='stress-label';label.style.cssText='position:fixed;left:16px;bottom:12px;z-index:10000;padding:9px 12px;border:1px solid #e8bc69;border-radius:5px;background:#111c;color:#ffe1a3;font:13px system-ui;pointer-events:none;';document.body.append(label);
   win.__stress.label=(phase:string)=>{win.__stress.phase=phase;label.textContent=`CPU ${rate}× slowdown · GPU disabled · Legacy · 120 monsters + 3 PCs · 48 lights | ${phase}`;};win.__stress.label('Startup');
  });
 },{rate,expected:MONSTERS+3});
}

const point=(page:Page,x:number,y:number)=>page.evaluate(({x,y})=>{
 const stage=(window as any).Konva.stages.find((s:any)=>s.find('.token').length),node=stage.find('.token')[0],p=node.getParent().getAbsoluteTransform().point({x,y}),r=stage.getContent().getBoundingClientRect();return{x:r.left+p.x,y:r.top+p.y};
},{x,y});

test('record severe CPU restrictions on a large lit legacy DM room, including startup and real creature placement',async({browser,request})=>{
 test.skip(!process.env.LEGACY_STRESS_OUTPUT,'Opt-in recording: set LEGACY_STRESS_OUTPUT to a report directory.');
 test.setTimeout(900000);await fs.mkdir(output,{recursive:true});
 const headers={'x-dm-passphrase':DM_SECRET};
 const {code}=await(await request.post('/api/sessions',{headers,data:{name:'Disposable legacy stress hall'}})).json();
 const pillars=Array.from({length:24},(_,i)=>({id:`pillar-${i}`,kind:'rectangle',ax:480+i%6*560,ay:480+Math.floor(i/6)*520,bx:552+i%6*560,by:552+Math.floor(i/6)*520}));
 const walls=[{id:'north',kind:'rectangle',ax:80,ay:80,bx:3760,by:140},{id:'south',kind:'rectangle',ax:80,ay:2420,bx:3760,by:2480},{id:'west',kind:'rectangle',ax:80,ay:80,bx:140,by:2480},{id:'east',kind:'rectangle',ax:3700,ay:80,bx:3760,by:2480},...pillars];
 const lights=Array.from({length:48},(_,i)=>({id:`lamp-${i}`,x:240+i%8*480,y:220+Math.floor(i/8)*420,radiusFt:25,heightFt:8,color:i%3?'warm':'cool',intensity:1,flicker:true,visibleTorch:true,fixture:i%2?'lantern':'torch'}));
 const art=Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><defs><pattern id="floor" width="80" height="80" patternUnits="userSpaceOnUse"><rect width="80" height="80" fill="#514b40"/><path d="M80 0H0V80" fill="none" stroke="#615b4c" stroke-width="2"/></pattern></defs><rect width="100%" height="100%" fill="#171c21"/><rect x="100" y="100" width="3640" height="2360" fill="url(#floor)"/>${walls.map(w=>`<rect x="${w.ax}" y="${w.ay}" width="${w.bx-w.ax}" height="${w.by-w.ay}" fill="#292f35" stroke="#8a8678" stroke-width="8"/>`).join('')}${lights.map(l=>`<circle cx="${l.x}" cy="${l.y}" r="42" fill="#cc9d3f" opacity=".15"/><circle cx="${l.x}" cy="${l.y}" r="13" fill="${l.color==='cool'?'#a7ccff':'#ffca6b'}"/>`).join('')}<text x="1920" y="215" text-anchor="middle" fill="#d6c9a4" font-size="56" font-family="serif">GRAND HALL · LEGACY STRESS TEST</text></svg>`);
 await fs.writeFile(path.join(output,'hall.svg'),art);const image=await sharp(art).png().toBuffer();await fs.writeFile(path.join(output,'hall.png'),image);
 const map=await(await request.post(`/api/sessions/${code}/maps`,{headers,multipart:{name:'Grand Hall · 240 × 160 ft',image:{name:'hall.png',mimeType:'image/png',buffer:image}}})).json();
 const dm=io(`http://localhost:${PORT}`,{transports:['websocket']});
 let latest:any;dm.on('state:snapshot',s=>{latest=s;});
 const join=async()=>{const r=await dm.timeout(15000).emitWithAck('join',{sessionCode:code,role:'dm',dmPassphrase:DM_SECRET});expect(r.ok).toBe(true);latest=r.snapshot;return latest;};
 const report:any={measuredAt:new Date().toISOString(),host:{cpu:os.cpus()[0]?.model,logicalCpus:os.cpus().length,memoryGiB:Math.round(os.totalmem()/2**30),browser:browser.version()},
   method:'One fresh browser context/cold HTTP cache per throttle. CDP main-thread CPU slowdown, software Canvas2D, WebGL blocked, local unthrottled disposable server, 1440×900 viewport. Video recording enabled. Times are observed wall-clock/client input-to-painted-frame, not hardware equivalence or FPS. No network latency or RAM cap emulation.',
   fixture:{mapPixels:[W,H],roomFeet:[240,160],initialMonsters:MONSTERS,partyMembers:3,lights:lights.length,wallPieces:walls.length,wallEdges:walls.length*4,addedViaRealUi:ADDITIONS,imageBytes:image.length},
   buildIndexSha256:createHash('sha256').update(await fs.readFile('client/dist/index.html')).digest('hex'),runs:[]};
 const save=async()=>fs.writeFile(path.join(output,'results.json'),JSON.stringify(report,null,2));
 try{
  const initial=await join();dm.emit('map:setActive',{mapId:map.id});dm.emit('map:setGrid',{mapId:map.id,gridSizePx:80,feetPerSquare:5,widthFt:240,locked:true});
  for(const w of walls)dm.emit('map:editWalls',{mapId:map.id,add:w});
  dm.emit('map:setEnvironment',{mapId:map.id,settings:{enabled:true,lighting:'dungeon',heavyDarkness:true,lights}});
  const species=[['Goblin','goblin','👺'],['Skeleton','skeleton','💀'],['Wolf','wolf','🐺'],['Guard','bandit','🛡️']];
  for(const [name,modelType,icon] of species)dm.emit('monster:create',{name:`Bench ${name}`,modelType,icon,maxHp:20,armorClass:13,disposition:'enemy'});
  await join();const templates=species.map(([name])=>latest.monsterTemplates.find((m:any)=>m.name===`Bench ${name}`));
  for(let i=0;i<MONSTERS;i++)dm.emit('token:spawn',{mapId:map.id,kind:'monster',refId:templates[i%4].id,x:280+i%12*280,y:360+Math.floor(i/12)*210});
  for(const [i,name] of ['Druk','Varis','Vanec'].entries())dm.emit('token:spawn',{mapId:map.id,kind:'pc',refId:initial.characters.find((c:any)=>c.name===name).id,x:640+i*1280,y:1280});
  await join();expect(latest.tokens).toHaveLength(MONSTERS+3);const baseline=new Set(latest.tokens.map((t:any)=>t.id));
  await save();
  for(const rate of rates){
   const run:any={cpuSlowdown:rate,status:'running'};report.runs.push(run);await save();
   const context=await browser.newContext({baseURL:`http://localhost:${PORT}`,viewport:{width:1440,height:900},deviceScaleFactor:1,serviceWorkers:'block',recordVideo:{dir:path.join(output,'raw-videos'),size:{width:1440,height:900}}});
   const page=await context.newPage(),video=page.video(),requests:string[]=[],errors:string[]=[];page.on('request',r=>requests.push(r.url()));page.on('pageerror',e=>errors.push(e.message));
   const cdp=await context.newCDPSession(page);await cdp.send('Emulation.setCPUThrottlingRate',{rate});await cdp.send('Network.enable');await cdp.send('Network.setCacheDisabled',{cacheDisabled:true});await cdp.send('Performance.enable');
   try{
    await installProbe(page,rate);console.log(`[legacy-stress] ${rate}x: cold startup`);
    await page.goto(`/dm?code=${code}`,{waitUntil:'domcontentloaded',timeout:90000});await page.getByRole('button',{name:'Start in legacy mode',exact:true}).waitFor({timeout:90000});
    run.startupScreenMs=Math.round(await page.evaluate(()=>performance.now()));
    run.graphicsRequestsBeforeChoice=requests.filter(u=>/\.glb(?:\?|$)|\/(?:MiniatureLayer|materialDice|diceTrayRenderer|DmRoute|PlayerRoute)-/.test(u)).length;
    await page.evaluate(()=>(window as any).__stress.label('Loading campaign code'));
    const choiceAt=await page.evaluate(()=>performance.now());await page.getByRole('button',{name:'Start in legacy mode',exact:true}).click();await page.locator('input[type=password]').waitFor({timeout:90000});
    run.choiceToLoginMs=Math.round(await page.evaluate(()=>performance.now())-choiceAt);
    await page.locator('input[type=password]').fill(DM_SECRET);await page.evaluate(()=>(window as any).__stress.label('Initial map / token load'));
    await page.getByRole('button',{name:'Rejoin as DM',exact:true}).click();
    await page.waitForFunction(()=>(window as any).__stress.joinPaintMs!==null,undefined,{timeout:90000});
    run.joinToPaintedMapMs=Math.round(await page.evaluate(()=>(window as any).__stress.joinPaintMs));run.renderedDmTokens=await page.evaluate(()=>(window as any).__stress.tokenCount());
    await expect(page.locator('.stage-wrap')).toHaveAttribute('data-render-mode','legacy');
    await page.screenshot({path:path.join(output,`cpu-${rate}x-initial.png`)});
    console.log(`[legacy-stress] ${rate}x: player sight with 48 lights`);
    await page.evaluate(()=>(window as any).__stress.label('Player visibility · 48 lights'));await page.getByLabel('Battlefield visibility').selectOption('player');
    await page.waitForFunction(()=>(window as any).__stress.previewPaintMs!==null,undefined,{timeout:90000});
    run.playerPreviewMs=Math.round(await page.evaluate(()=>(window as any).__stress.previewPaintMs));run.renderedPreviewTokens=await page.evaluate(()=>(window as any).__stress.tokenCount());
    await page.screenshot({path:path.join(output,`cpu-${rate}x-player-visibility.png`)});
    await page.waitForTimeout(800);await page.evaluate(()=>(window as any).__stress.label('Idle player visibility'));
    const before=await cdp.send('Performance.getMetrics'),idleStart=Date.now(),drawsBefore=Number(await page.getByTestId('legacy-vision').getAttribute('data-draw-count'));
    await page.waitForTimeout(5000);const after=await cdp.send('Performance.getMetrics'),idleMs=Date.now()-idleStart;
    const metric=(r:any,key:string)=>r.metrics.find((m:any)=>m.name===key)?.value??0;
    run.idle={observedMs:idleMs,mainThreadBusyMs:Math.round((metric(after,'TaskDuration')-metric(before,'TaskDuration'))*1000),scriptMs:Math.round((metric(after,'ScriptDuration')-metric(before,'ScriptDuration'))*1000),visibilityRedraws:Number(await page.getByTestId('legacy-vision').getAttribute('data-draw-count'))-drawsBefore,jsHeapMiB:Math.round(metric(after,'JSHeapUsedSize')/2**20)};
    await page.getByLabel('Battlefield visibility').selectOption('dm');await page.getByRole('button',{name:'Creatures',exact:true}).click();
    const spawn=page.locator('#dm-panel-spawn').getByRole('button',{name:/Bench Goblin.*20 hp/});await spawn.click();
    console.log(`[legacy-stress] ${rate}x: adding ${ADDITIONS} creatures via UI`);await page.evaluate(()=>(window as any).__stress.label('Adding creatures'));
    const addStarted=Date.now();
    for(let i=0;i<ADDITIONS;i++){
     const p=await point(page,1400+i*100,2360);await page.mouse.click(p.x,p.y);
     await page.waitForFunction(n=>(window as any).__stress.spawn.length>=n,i+1,{timeout:30000});
     if((i+1)%5===0)console.log(`[legacy-stress] ${rate}x: placed ${i+1}/${ADDITIONS}`);
    }
    run.addTwentyWallMs=Date.now()-addStarted;const spawnSamples=await page.evaluate(()=>(window as any).__stress.spawn.map((s:any)=>s.ms));run.placement=quantiles(spawnSamples);run.placementSamplesMs=spawnSamples.map(Math.round);
    await page.keyboard.press('Escape');await page.locator('#dm-panel-spawn').getByRole('button',{name:'Close DM panel',exact:true}).click();
    await page.evaluate(()=>(window as any).__stress.label('140 monsters + 3 PCs · complete'));
    run.finalDmTokens=await page.evaluate(()=>(window as any).__stress.tokenCount());await page.screenshot({path:path.join(output,`cpu-${rate}x-after-adding.png`)});
    await page.getByLabel('Battlefield visibility').selectOption('player');await page.waitForFunction(()=>(window as any).__stress.previewPaintMs!==null,undefined,{timeout:90000});
    run.postAdditionPreviewMs=Math.round(await page.evaluate(()=>(window as any).__stress.previewPaintMs));await page.screenshot({path:path.join(output,`cpu-${rate}x-final-player-visibility.png`)});
    if(process.env.LEGACY_STRESS_EDITING==='1'){
     const editStart=await page.evaluate(()=>performance.now());
     run.editing={startPageMs:Math.round(editStart),movements:[],initialLights:lights.length,initialWalls:walls.length};
     const label=async(text:string)=>page.evaluate(text=>(window as any).__stress.label(text),text);
     const vision=page.getByTestId('legacy-vision');
     await label('DM editing with Player view active · move → lights → wall');await page.waitForTimeout(2000);
     const viewer=latest.tokens.find((t:any)=>t.kind==='pc'&&latest.characters.find((c:any)=>c.id===t.refId)?.name==='Varis');
     const paths=()=>vision.locator('clipPath path').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('d')).join('|'));
     const drag=async(x:number,y:number)=>{
      const before=await paths(),current=latest.tokens.find((t:any)=>t.id===viewer.id),from=await point(page,current.x,current.y),to=await point(page,x,y),started=Date.now();
      await page.mouse.move(from.x,from.y);await page.mouse.down();
      for(let i=1;i<=12;i++){await page.mouse.move(from.x+(to.x-from.x)*i/12,from.y+(to.y-from.y)*i/12);await page.waitForTimeout(80);}
      await page.mouse.up();await page.mouse.move(1360,110);
      await expect.poll(()=>latest.tokens.find((t:any)=>t.id===viewer.id)?.y,{timeout:30000}).toBeGreaterThan(y-80);
      await expect.poll(paths,{timeout:30000}).not.toBe(before);
      run.editing.movements.push({x,y,interactionAndVisibilityMs:Date.now()-started});
      await expect(page.getByLabel('Battlefield visibility')).toHaveValue('player');await page.waitForTimeout(1800);
     };
     await label('1 / 4 · Move Varis south · sight updates after drop');await drag(1920,1900);
     await page.screenshot({path:path.join(output,`cpu-${rate}x-player-token-moved.png`)});
     await label('2 / 4 · Add two lights without leaving Player view');
     await page.getByRole('button',{name:'Map features',exact:true}).click();await page.getByRole('button',{name:'Lights',exact:true}).click();
     await page.getByRole('slider',{name:'New light lit radius',exact:true}).focus();await page.keyboard.press('Home');await page.keyboard.press('ArrowRight');await page.keyboard.press('ArrowRight');
     await expect.poll(()=>latest.map.environment.newLightDefaults.radiusFt,{timeout:30000}).toBe(5);
     await page.getByRole('button',{name:'Place light on map',exact:true}).click();
     for(const [i,x,y] of [[1,1800,1850],[2,2040,1950]]){const p=await point(page,x,y);await page.mouse.move(p.x,p.y);await page.waitForTimeout(350);await page.mouse.click(p.x,p.y);await expect.poll(()=>latest.map.environment.lights.length,{timeout:30000}).toBe(lights.length+i);await page.waitForTimeout(1800);}
     await page.keyboard.press('Escape');await expect(vision).toHaveAttribute('data-origin-count','3');
     run.editing.finalLights=latest.map.environment.lights.length;run.editing.newLightRadii=latest.map.environment.lights.slice(-2).map((l:any)=>l.radiusFt);
     await page.screenshot({path:path.join(output,`cpu-${rate}x-player-lights-added.png`)});
     await label('3 / 4 · Draw a wall · basic shadow boundary updates');
     await page.getByRole('button',{name:'Map features',exact:true}).click();await page.getByRole('button',{name:'Add features',exact:true}).click();await page.getByRole('button',{name:'Draw wall rectangles',exact:true}).click();
     const a=await point(page,1760,1780),b=await point(page,2120,1810);await page.mouse.move(a.x,a.y);await page.mouse.down();
     for(let i=1;i<=12;i++){await page.mouse.move(a.x+(b.x-a.x)*i/12,a.y+(b.y-a.y)*i/12);await page.waitForTimeout(80);}await page.mouse.up();
     await expect.poll(()=>latest.map.walls.length,{timeout:30000}).toBe(walls.length+1);await expect(vision).toHaveAttribute('data-wall-count',String(walls.length+1),{timeout:30000});
     run.editing.finalWalls=latest.map.walls.length;await page.waitForTimeout(2000);await page.keyboard.press('Escape');
     await page.screenshot({path:path.join(output,`cpu-${rate}x-player-wall-added.png`)});
     await label('4 / 4 · Move Varis again · Player view stays active');await drag(1760,2060);
     await page.screenshot({path:path.join(output,`cpu-${rate}x-player-editing-complete.png`)});
     await expect(page.getByLabel('Battlefield visibility')).toHaveValue('player');run.editing.completedPlayerView=true;
     await page.waitForTimeout(2500);run.editing.durationMs=Math.round(await page.evaluate(()=>performance.now())-editStart);
     // Return to the full DM token count for the common benchmark assertion.
     await page.getByLabel('Battlefield visibility').selectOption('dm');await expect.poll(()=>page.evaluate(()=>(window as any).__stress.tokenCount())).toBe(MONSTERS+3+ADDITIONS);
    }
    const probe=await page.evaluate(()=>(window as any).__stress);run.webglAttempts=probe.webgl.length;run.longTasks={count:probe.longTasks.length,maxMs:Math.round(Math.max(0,...probe.longTasks.map((t:any)=>t.ms))),totalMs:Math.round(probe.longTasks.reduce((s:number,t:any)=>s+t.ms,0))};run.longTaskSamples=probe.longTasks.map((t:any)=>({...t,ms:Math.round(t.ms)}));
    run.graphicsRequests=requests.filter(u=>/\.glb(?:\?|$)|\/(?:MiniatureLayer|materialDice|diceTrayRenderer)-/.test(u));run.pageErrors=errors;
    expect(run.graphicsRequestsBeforeChoice).toBe(0);expect(run.graphicsRequests).toEqual([]);expect(run.webglAttempts).toBe(0);expect(run.finalDmTokens).toBe(MONSTERS+3+ADDITIONS);expect(errors).toEqual([]);
    run.status='passed';console.log(`[legacy-stress] ${rate}x: ${JSON.stringify({startupMs:run.startupScreenMs,mapMs:run.joinToPaintedMapMs,previewMs:run.playerPreviewMs,placement:run.placement,idle:run.idle})}`);
   }catch(error){run.status='failed';run.error=String(error);await page.screenshot({path:path.join(output,`cpu-${rate}x-failure.png`),timeout:15000}).catch(()=>{});console.log(`[legacy-stress] ${rate}x FAILED: ${error}`);}
   finally{
    await context.close();if(video)await video.saveAs(path.join(output,`cpu-${rate}x.webm`));await save();
    await join();for(const t of latest.tokens.filter((t:any)=>!baseline.has(t.id)))dm.emit('monster:delete',{monsterId:t.refId});await join();expect(latest.tokens).toHaveLength(MONSTERS+3);
   }
  }
  await save();console.log(`[legacy-stress] Report: ${path.join(output,'results.json')}`);expect(report.runs.every((r:any)=>r.status==='passed')).toBe(true);
 }finally{dm.disconnect();}
});
