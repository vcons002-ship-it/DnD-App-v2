/** Paired old-client benchmark. Opt-in and always uses the disposable E2E server. */
import {test,expect} from './helpers/test';
import {probe,xy} from './helpers/movementProbe';
import {io} from 'socket.io-client';
import sharp from 'sharp';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {DM_SECRET,PORT} from './playwright.config';
test.use({trace:process.env.SERVER_OFFLOAD_PLAYWRIGHT_TRACE==='1'?'retain-on-failure':'off',skipRenderingChoice:false,launchOptions:{executablePath:process.env.PW_CHROMIUM,args:['--disable-gpu','--disable-accelerated-2d-canvas','--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows']}});
const median=(a:number[])=>{const s=[...a].sort((a,b)=>a-b);return Math.round((s[Math.floor((s.length-1)/2)]+s[Math.ceil((s.length-1)/2)])/2);};
test('unthrottled server serves two throttled Legacy players in a heavy room',async({browser,request})=>{
 test.skip(!process.env.SERVER_OFFLOAD_OUTPUT,'Set SERVER_OFFLOAD_OUTPUT to measure.');test.setTimeout(1200000);
 const output=path.resolve(process.env.SERVER_OFFLOAD_OUTPUT!);await fs.mkdir(output,{recursive:true});
 const compatibility=process.env.SERVER_OFFLOAD_COMPAT==='1';
 const timing=process.env.SERVER_OFFLOAD_TIMING==='1';
 const paired=process.env.SERVER_OFFLOAD_OBSERVERS==='1';
 const headers={'x-dm-passphrase':DM_SECRET},rates=(process.env.SERVER_OFFLOAD_RATES??'12,20').split(',').map(Number);
 const {code}=await(await request.post('/api/sessions',{headers,data:{name:'Two old players / unrestricted server'}})).json();
 const walls=[{id:'north',kind:'rectangle',ax:80,ay:80,bx:3760,by:140},{id:'south',kind:'rectangle',ax:80,ay:2420,bx:3760,by:2480},...Array.from({length:26},(_,i)=>({id:`pillar-${i}`,kind:'rectangle',ax:480+i%6*560,ay:480+Math.floor(i/6)*440,bx:552+i%6*560,by:552+Math.floor(i/6)*440}))];
 const lights=Array.from({length:48},(_,i)=>({id:`lamp-${i}`,x:240+i%8*480,y:220+Math.floor(i/8)*420,radiusFt:25,heightFt:8,color:'warm',intensity:1,flicker:true,visibleTorch:true}));
 const art=Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="3840" height="2560"><defs><pattern id="grid" width="80" height="80" patternUnits="userSpaceOnUse"><rect width="80" height="80" fill="#514b40"/><path d="M80 0H0V80" fill="none" stroke="#696355"/></pattern></defs><rect width="100%" height="100%" fill="url(#grid)"/>${walls.map(w=>`<rect x="${w.ax}" y="${w.ay}" width="${w.bx-w.ax}" height="${w.by-w.ay}" fill="#202830"/>`).join('')}${lights.map(l=>`<circle cx="${l.x}" cy="${l.y}" r="16" fill="#f1bc56"/>`).join('')}<text x="1920" y="210" text-anchor="middle" fill="#eee0bf" font-size="60">TWO LEGACY PLAYERS / SERVER OFFLOAD</text></svg>`);
 const image=await sharp(art).png().toBuffer();const map=await(await request.post(`/api/sessions/${code}/maps`,{headers,multipart:{name:'Grand Hall 240 x 160 ft',image:{name:'hall.png',mimeType:'image/png',buffer:image}}})).json();
 const admin=io(`http://localhost:${PORT}`,{transports:['websocket']});let latest:any;admin.on('state:snapshot',s=>latest=s);
 const join=async()=>{const r=await admin.timeout(20000).emitWithAck('join',{sessionCode:code,role:'dm',dmPassphrase:DM_SECRET});expect(r.ok).toBe(true);latest=r.snapshot;return latest;};
 const report:any={at:new Date().toISOString(),host:{cpu:os.cpus()[0].model,logicalCpus:os.cpus().length,memoryGiB:Math.round(os.totalmem()/2**30),browser:browser.version()},fixture:{tokens:143,lights:48,walls:28,wallEdges:112,roomFeet:[240,160]},method:'Two independent player contexts claim Varis and Druk. Both browser CPUs throttled before initial campaign load and throughout six alternating real drags (three per player). GPU/accelerated Canvas2D disabled, WebGL blocked. Node server unrestricted on same host. No network delay or RAM cap. Event-driven draw/SVG probes, two RAF paint opportunities; captures pointer-release to local committed token and sight update. Wire bytes from CDP websocket frames (no browser instrumentation loop). Recording adds overhead. CPU totals from Node process.cpuUsage include worker threads.',runs:[]};
 const save=()=>fs.writeFile(path.join(output,'results.json'),JSON.stringify(report,null,2));
 try{
  const initial=await join();admin.emit('map:setActive',{mapId:map.id});admin.emit('map:setGrid',{mapId:map.id,gridSizePx:80,feetPerSquare:5,widthFt:240,locked:true});
  for(const w of walls)admin.emit('map:editWalls',{mapId:map.id,add:w});admin.emit('map:setEnvironment',{mapId:map.id,settings:{enabled:true,lighting:'dungeon',heavyDarkness:true,lights}});
  admin.emit('monster:create',{name:'Bench Goblin',modelType:'goblin',icon:'G',maxHp:20,armorClass:13,disposition:'enemy'});await join();const monster=latest.monsterTemplates.find((m:any)=>m.name==='Bench Goblin');
  for(let i=0;i<140;i++)admin.emit('token:spawn',{mapId:map.id,kind:'monster',refId:monster.id,x:280+i%12*280,y:360+Math.floor(i/12)*175});
  for(const [i,name] of ['Varis','Druk','Vanec'].entries())admin.emit('token:spawn',{mapId:map.id,kind:'pc',refId:initial.characters.find((c:any)=>c.name===name).id,x:1920-i*160,y:1280});
  await join();const tokens=['Varis','Druk'].map(name=>latest.tokens.find((t:any)=>t.kind==='pc'&&initial.characters.find((c:any)=>c.id===t.refId)?.name===name));
  const cases=rates.flatMap(rate=>(process.env.SERVER_OFFLOAD_ABLATIONS==='1'?['normal','hide-mask','hide-token-art']:['normal']).map(diagnostic=>({rate,diagnostic})));
  for(const {rate,diagnostic} of cases){
   const runOutput=diagnostic==='normal'?output:path.join(output,diagnostic);await fs.mkdir(runOutput,{recursive:true});
   const run:any={rate,compatibility,legacyMotion:process.env.SERVER_OFFLOAD_MOTION==='1',serverManaged:process.env.SERVER_OFFLOAD_LOCAL!=='1',bothViewsSettled:paired,diagnostic,status:'running',loads:[],samples:[],wire:[{bytes:0,events:{}},{bytes:0,events:{}}]};report.runs.push(run);await save();
   run.instrumentation={playwrightTrace:process.env.SERVER_OFFLOAD_PLAYWRIGHT_TRACE==='1',video:process.env.SERVER_OFFLOAD_NO_VIDEO!=='1',cpuProfile:process.env.SERVER_OFFLOAD_PROFILE==='1'};
   run.instrumentation.phaseTiming=timing;if(timing)run.networkFrames=[];
   const contexts=await Promise.all([0,1].map(()=>browser.newContext({baseURL:`http://localhost:${PORT}`,viewport:{width:1440,height:900},deviceScaleFactor:1,...(process.env.SERVER_OFFLOAD_NO_VIDEO==='1'?{}:{recordVideo:{dir:path.join(output,'raw'),size:{width:1440,height:900}}})})));
   const pages=await Promise.all(contexts.map(c=>c.newPage())),videos=pages.map(p=>p.video()),errors:string[][]=[[],[]],requests:string[][]=[[],[]];let measuring=false;
   if(process.env.SERVER_OFFLOAD_LOCAL==='1')await Promise.all(pages.map(p=>p.addInitScript(()=>localStorage.setItem('dnd-server-rendering','off'))));
   if(process.env.SERVER_OFFLOAD_MOTION==='1')await Promise.all(pages.map(p=>p.addInitScript(()=>localStorage.setItem('dnd-legacy-movement','smooth'))));
   else if(paired)await Promise.all(pages.map(p=>p.addInitScript(()=>localStorage.setItem('dnd-legacy-movement','snap'))));
   if(paired)await Promise.all(pages.map(p=>p.addInitScript(smooth=>{
    // Snap is a benchmark control, not a user preference. The application
    // always requests animation; withhold that capability only in snap trials.
    const send=WebSocket.prototype.send;WebSocket.prototype.send=function(data){if(typeof data==='string'&&data.startsWith('42')){const at=data.indexOf('[');if(at>=0){try{const packet=JSON.parse(data.slice(at));if(packet[0]==='join'){packet[1].legacyMotion=smooth;data=data.slice(0,at)+JSON.stringify(packet);}}catch{}}}return send.call(this,data);};
   },run.legacyMotion)));
   if(process.env.SERVER_OFFLOAD_RETAINED_OFF==='1')await Promise.all(pages.map(p=>p.addInitScript(()=>localStorage.setItem('dnd-retained-rendering','off'))));
   if(compatibility)await Promise.all(pages.map(p=>p.addInitScript(()=>{
    // Exercise the old-server compatibility path in the exact same final bundle.
    // No game data or authorization is changed; omit only the transport capability.
    const send=WebSocket.prototype.send;WebSocket.prototype.send=function(data){
     if(typeof data==='string'&&data.startsWith('42')){const at=data.indexOf('[');if(at>=0){try{const packet=JSON.parse(data.slice(at));if(packet[0]==='join'){delete packet[1].stateProtocol;delete packet[1].legacyRendering;data=data.slice(0,at)+JSON.stringify(packet);}}catch{}}}
     return send.call(this,data);
    };
   })));
   const rasterRequests=[new Set<string>(),new Set<string>()];run.rasterHttp=[{bytes:0,requests:0},{bytes:0,requests:0}];
   const cds=await Promise.all(pages.map(async(p,i)=>{await probe(p,'Player',rate,timing,true,paired);p.on('pageerror',e=>errors[i].push(e.message));p.on('request',r=>requests[i].push(r.url()));const cd=await p.context().newCDPSession(p);await cd.send('Performance.enable');await cd.send('Network.enable');let epoch=0;cd.on('Network.requestWillBeSent',e=>{if(timing&&!epoch)epoch=(e.wallTime-e.timestamp)*1000;});cd.on('Network.responseReceived',e=>{if(measuring&&e.response.url.includes('/api/render/'))rasterRequests[i].add(e.requestId);});cd.on('Network.loadingFinished',e=>{if(rasterRequests[i].delete(e.requestId)){run.rasterHttp[i].bytes+=e.encodedDataLength;run.rasterHttp[i].requests++;}});await cd.send('Emulation.setCPUThrottlingRate',{rate});cd.on('Network.webSocketFrameReceived',({response,timestamp})=>{if(!measuring)return;const data=response.payloadData;if(data.startsWith('42')){try{const [event,payload]=JSON.parse(data.slice(2));run.wire[i].bytes+=Buffer.byteLength(data);run.wire[i].events[event]=(run.wire[i].events[event]??0)+1;if(timing&&event==='state:frame'&&payload.timing)run.networkFrames.push({player:i+1,id:payload.timing.id,revision:payload.revision,receivedAt:epoch+timestamp*1000,bytes:Buffer.byteLength(data)});}catch{}}});return cd;}));
   try{
    for(const [i,p] of pages.entries()){
     const started=Date.now();await p.goto(`/join?code=${code}`);await p.getByRole('button',{name:'Start in legacy mode',exact:true}).click();await p.getByRole('button',{name:'Join',exact:true}).click();await p.locator('.claim-row').filter({hasText:i?'Druk':'Varis'}).click();await expect(p.getByTestId('player-hud')).toBeVisible({timeout:180000});await expect(p.getByTestId('legacy-vision')).toHaveAttribute('data-origin-count','1',{timeout:180000});await expect.poll(()=>p.evaluate(id=>(window as any).Konva.stages.some((s:any)=>s.find('.token').some((n:any)=>n.getAttr('tokenId')===id&&n.draggable())),tokens[i].id),{timeout:90000}).toBe(true);run.loads.push({player:i+1,loadToUsableMs:Date.now()-started});await p.evaluate(({rate,i})=>{const m=(window as any).__move;m.throttled=true;m.label(`Player ${i+1} / CPU ${rate}x / ready`);},{rate,i});
    }
    if(paired)for(const p of pages){await expect(p.getByRole('checkbox',{name:'Server managed rendering',exact:true})).toBeChecked({checked:run.serverManaged});await expect(p.getByRole('checkbox',{name:'Animate Legacy movement',exact:true})).toHaveCount(0);await expect(p.getByTestId('legacy-vision')).toHaveAttribute('data-geometry-source',run.serverManaged?'server':'client');}
    await save();console.log(`[server-offload] ${rate}x usable loads: ${run.loads.map((l:any)=>l.loadToUsableMs).join(', ')}ms`);
    if(diagnostic==='hide-mask')await Promise.all(pages.map(p=>p.addStyleTag({content:'[data-testid="legacy-vision"]{visibility:hidden!important}'})));
    if(diagnostic==='hide-token-art')await Promise.all(pages.map(p=>p.evaluate(()=>{
     const group=(window as any).Konva.Group.prototype,draw=group.drawScene;
     group.drawScene=function(...args:any[]){return this.hasName('token-art')?this:draw.apply(this,args);};
     (window as any).Konva.stages.forEach((s:any)=>s.draw());
    })));
    await pages[0].waitForTimeout(1500);run.retainedBefore=await Promise.all(pages.map(p=>p.evaluate(()=>(window as any).Konva.stages.flatMap((s:any)=>s.getLayers().map((l:any)=>l.getAttr('retainedStats')).filter(Boolean)))));const metrics=(r:any,key:string)=>r.metrics.find((m:any)=>m.name===key)?.value??0;
    const profiling=process.env.SERVER_OFFLOAD_PROFILE==='1';
    if(profiling){
     run.profileFrames=await Promise.all(cds.map(async c=>(await c.send('Page.getFrameTree')).frameTree.frame.id));
     await cds[0].send('Tracing.start',{categories:'devtools.timeline,disabled-by-default-devtools.timeline,blink.user_timing,v8',transferMode:'ReturnAsStream'});
     for(const c of cds){await c.send('Profiler.enable');await c.send('Profiler.setSamplingInterval',{interval:1000});await c.send('Profiler.start');}
    }
    const before=await Promise.all(cds.map(c=>c.send('Performance.getMetrics'))),serverBefore=await(await request.get('/api/performance-metrics',{headers})).json();const start=Date.now();measuring=true;
    for(let seq=0;seq<6;seq++){
     const i=seq%2,p=pages[i],token=tokens[i],step=Math.floor(seq/2);const x=(i?1760:1920)+[80,80,0][step],y=1280+[80,160,0][step];
     const arm=(q:typeof p,observe=false)=>q.evaluate(data=>{const m=(window as any).__move;m.label(`Player ${data.player} / CPU ${data.rate}x / move ${data.seq}/6`);m.start();m.arm(data);},{id:token.id,x,y,seq:seq+1,player:i+1,rate,performanceId:`move-${rate}-${seq+1}`,observe});
     if(paired)await Promise.all(pages.map((q,j)=>arm(q,j!==i)));else await arm(p);
     const from=await xy(p,token.id),to=await xy(p,token.id,x,y);await p.mouse.move(from.x,from.y);await p.mouse.down();await p.mouse.move(to.x,to.y,{steps:6});await p.mouse.up();await p.mouse.move(1370,110);
     const observedPages=paired?pages:[p];
     await Promise.all(observedPages.map(q=>q.waitForFunction(()=>{const a=(window as any).__move.active;return a.tokenPaintAt&&(a.observe?(a.sightPaintAt||a.visionPaintAt):a.sightPaintAt);},undefined,{timeout:90000})));
     if(run.legacyMotion){await p.waitForFunction(()=>document.querySelector('.stage-wrap')?.getAttribute('data-motion-stage')==='2',undefined,{timeout:30000});await p.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));}
     if(paired)await Promise.all(pages.map(async q=>{await q.waitForFunction(()=>document.querySelector('.stage-wrap')?.getAttribute('data-motion-stage')==='2');await q.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));}));
     const a=await p.evaluate(()=>(window as any).__move.active);expect(a.releasedAt).toBeGreaterThan(0);const accepted=latest.tokens.find((t:any)=>t.id===token.id);expect(Math.abs(accepted.x-x)).toBeLessThan(4);expect(Math.abs(accepted.y-y)).toBeLessThan(4);
     const views=paired?await Promise.all(pages.map(async(q,j)=>{const v=await q.evaluate(()=>(window as any).__move.active);expect(v.firstMotionAt).toBeGreaterThan(a.releasedAt);return{player:j+1,moving:j===i,firstMotionMs:v.firstMotionAt-a.releasedAt,sightMs:v.sightPaintAt?v.sightPaintAt-a.releasedAt:null,tokenMs:v.tokenPaintAt-a.releasedAt,finalSightMs:(v.latestMaskPaintAt??v.sightPaintAt??v.visionPaintAt)-a.releasedAt,completeMs:Math.max(v.tokenPaintAt,v.latestMaskPaintAt??v.sightPaintAt??v.visionPaintAt)-a.releasedAt,maskPoses:v.maskPoses};})):undefined;
     if(paired&&run.legacyMotion&&rate===1)expect(views![i].maskPoses.some((p:any)=>p.index>0&&p.index<12),'the moving player must actually receive intermediate sight poses').toBe(true);
     run.samples.push({player:i+1,seq:seq+1,tokenMs:Math.round(a.tokenPaintAt-a.releasedAt),sightMs:Math.round(a.sightPaintAt-a.releasedAt),finalSightMs:Math.round((a.latestMaskPaintAt??a.sightPaintAt)-a.releasedAt),...(views?{views}:{}),...(timing?{timing:a}:{})});console.log(`[server-offload] ${rate}x player ${i+1}: ${run.samples.at(-1).sightMs}ms sight`);await Promise.all(observedPages.map(q=>q.evaluate(()=>(window as any).__move.stop())));
    }
    measuring=false;run.observedMs=Date.now()-start;const after=await Promise.all(cds.map(c=>c.send('Performance.getMetrics'))),serverAfter=await(await request.get('/api/performance-metrics',{headers})).json();
    if(profiling){
     for(const [i,c] of cds.entries()){const {profile}=await c.send('Profiler.stop');await fs.writeFile(path.join(output,`player-${i+1}-${rate}x.cpuprofile`),JSON.stringify(profile));}
     const completed=new Promise<string>(resolve=>cds[0].once('Tracing.tracingComplete',event=>resolve(event.stream!)));
     await cds[0].send('Tracing.end');const stream=await completed;const file=await fs.open(path.join(output,`browser-${rate}x.trace.json`),'w');
     try{for(;;){const part=await cds[0].send('IO.read',{handle:stream});await file.write(part.base64Encoded?Buffer.from(part.data,'base64'):part.data);if(part.eof)break;}}finally{await file.close();await cds[0].send('IO.close',{handle:stream});}
    }
    run.server={cpuMs:(serverAfter.cpu.user+serverAfter.cpu.system-serverBefore.cpu.user-serverBefore.cpu.system)/1000,rssMiB:Math.round(serverAfter.memory.rss/2**20),details:serverAfter};
    run.tokenCaches=await Promise.all(pages.map(p=>p.evaluate(()=>{const nodes=(window as any).Konva.stages.flatMap((s:any)=>s.find('.token-art')),bodies=(window as any).Konva.stages.flatMap((s:any)=>s.find('.token-body'));return{art:nodes.length,cachedArt:nodes.filter((n:any)=>n.isCached()).length,filteredBodies:bodies.filter((n:any)=>n.filters()?.length).length};})));
    if(timing){
     run.clientTiming=await Promise.all(pages.map(p=>p.evaluate(()=>({frames:(window as any).__move.frames,resources:(window as any).__move.resources,longTasks:(window as any).__move.longTasks}))));
     for(const sample of run.samples){const a=sample.timing,f=run.clientTiming[sample.player-1].frames.find((f:any)=>f.id===a.performanceId&&f.maskKey===a.sightFrameKey);
      expect(a.moveSentAt).toBeGreaterThan(a.releasedAt);expect(f?.server.emittedAt).toBeGreaterThan(f?.server.receivedAt);expect(f?.imagesReadyAt).toBeGreaterThan(f?.imagesStartAt);expect(f?.maskCommitAt).toBeGreaterThan(f?.imagesReadyAt);
      expect(run.networkFrames.some((n:any)=>n.player===sample.player&&n.id===f.id&&n.revision===f.revision)).toBe(true);
     }
    }
    run.retainedAfter=await Promise.all(pages.map(p=>p.evaluate(()=>(window as any).Konva.stages.flatMap((s:any)=>s.getLayers().map((l:any)=>l.getAttr('retainedStats')).filter(Boolean)))));run.maskTiles=await Promise.all(pages.map(p=>p.getByTestId('legacy-vision').getAttribute('data-mask-tiles')));
    run.clients=await Promise.all(pages.map(async(p,i)=>({player:i+1,mainThreadBusyMs:Math.round((metrics(after[i],'TaskDuration')-metrics(before[i],'TaskDuration'))*1000),scriptMs:Math.round((metrics(after[i],'ScriptDuration')-metrics(before[i],'ScriptDuration'))*1000),medianTokenMs:median(run.samples.filter((s:any)=>s.player===i+1).map((s:any)=>s.tokenMs)),medianSightMs:median(run.samples.filter((s:any)=>s.player===i+1).map((s:any)=>s.sightMs)),webglAttempts:await p.evaluate(()=>(window as any).__move.webgl),geometrySource:await p.getByTestId('legacy-vision').getAttribute('data-geometry-source'),renderSource:await p.getByTestId('legacy-vision').getAttribute('data-render-source'),serverTokenLayers:await p.evaluate(()=>(window as any).Konva.stages.flatMap((s:any)=>s.find('.server-token-layer')).length),serverTokenImages:await p.evaluate(()=>(window as any).Konva.stages.flatMap((s:any)=>s.find('.server-token-body')).length),errors:errors[i],graphicsRequests:requests[i].filter(u=>/\.glb(?:\?|$)|\/(MiniatureLayer|materialDice|diceTrayRenderer)-/.test(u))})));
    for(const [i,p] of pages.entries()){expect(run.clients[i].webglAttempts).toBe(0);expect(errors[i]).toEqual([]);expect(run.clients[i].graphicsRequests).toEqual([]);if(compatibility)expect(run.clients[i].geometrySource).toBe('client');else if(process.env.SERVER_OFFLOAD_EXPECT_SERVER==='1')expect(run.clients[i].geometrySource).toBe('server');await p.screenshot({path:path.join(runOutput,`player-${i+1}-${rate}x.png`)});const markup=await p.getByTestId('legacy-vision').evaluate(el=>({svg:el.tagName.toLowerCase()==='svg',html:el.outerHTML}));await fs.writeFile(path.join(runOutput,`mask-${i+1}-${rate}x.${markup.svg?'svg':'html'}`),markup.svg?markup.html.replace('<svg ','<svg xmlns="http://www.w3.org/2000/svg" '):markup.html);}run.status='passed';
   }catch(e){run.status='failed';run.error=String(e);run.failureViews=await Promise.all(pages.map(p=>p.evaluate(()=>({active:(window as any).__move?.active,vision:document.querySelector('[data-testid=legacy-vision]')?.outerHTML,tokens:(window as any).Konva?.stages.flatMap((s:any)=>s.find('.token').map((n:any)=>({id:n.getAttr('tokenId'),x:n.x(),y:n.y()})))})).catch(error=>({error:String(error)}))));throw e;}
   finally{await Promise.all(contexts.map(c=>c.close()));for(const [i,v] of videos.entries())if(v)await v.saveAs(path.join(runOutput,`player-${i+1}-${rate}x.webm`));await save();}
   for(const [i,t] of tokens.entries())admin.emit('token:move',{tokenId:t.id,x:1920-i*160,y:1280});await join();
  }
 }finally{admin.disconnect();await save();}
});
