/** Opt-in paired-client movement benchmark. Never uses a live campaign. */
import {test,expect,type Page} from './helpers/test';
import {io} from 'socket.io-client';
import sharp from 'sharp';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {DM_SECRET,PORT} from './playwright.config';

test.use({trace:'off',skipRenderingChoice:false,launchOptions:{executablePath:process.env.PW_CHROMIUM,args:['--disable-gpu','--disable-accelerated-2d-canvas','--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows']}});
const output=path.resolve(process.env.LEGACY_MOVEMENT_OUTPUT??'artifacts/legacy-movement');
const rates=(process.env.LEGACY_MOVEMENT_RATES??'1,6,12,20').split(',').map(Number);
const MOVES=Number(process.env.LEGACY_MOVEMENT_MOVES??12);
const summary=(v:number[])=>{const a=[...v].sort((a,b)=>a-b);return{samples:a.length,medianMs:Math.round((a[Math.floor((a.length-1)/2)]+a[Math.ceil((a.length-1)/2)])/2),p95Ms:Math.round(a[Math.ceil(a.length*.95)-1]),maxMs:Math.round(a.at(-1)!)};};

import {probe,xy} from './helpers/movementProbe';

test('record and measure real player movement observed by a legacy DM in party visibility',async({browser,request})=>{
 test.skip(!process.env.LEGACY_MOVEMENT_OUTPUT,'Set LEGACY_MOVEMENT_OUTPUT to run this recorded benchmark.');test.setTimeout(1200000);
 await fs.mkdir(output,{recursive:true});const headers={'x-dm-passphrase':DM_SECRET};
 const {code}=await(await request.post('/api/sessions',{headers,data:{name:'Disposable paired legacy movement'}})).json();
 const pillars=Array.from({length:24},(_,i)=>({id:`pillar-${i}`,kind:'rectangle',ax:480+i%6*560,ay:480+Math.floor(i/6)*520,bx:552+i%6*560,by:552+Math.floor(i/6)*520}));
 const walls=[{id:'north',kind:'rectangle',ax:80,ay:80,bx:3760,by:140},{id:'south',kind:'rectangle',ax:80,ay:2420,bx:3760,by:2480},{id:'west',kind:'rectangle',ax:80,ay:80,bx:140,by:2480},{id:'east',kind:'rectangle',ax:3700,ay:80,bx:3760,by:2480},...pillars];
 const lights=Array.from({length:48},(_,i)=>({id:`lamp-${i}`,x:240+i%8*480,y:220+Math.floor(i/8)*420,radiusFt:25,heightFt:8,color:i%3?'warm':'cool',intensity:1,flicker:true,visibleTorch:true,fixture:i%2?'lantern':'torch'}));
 const art=Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="3840" height="2560"><defs><pattern id="floor" width="80" height="80" patternUnits="userSpaceOnUse"><rect width="80" height="80" fill="#514b40"/><path d="M80 0H0V80" fill="none" stroke="#615b4c" stroke-width="2"/></pattern></defs><rect width="100%" height="100%" fill="#171c21"/><rect x="100" y="100" width="3640" height="2360" fill="url(#floor)"/>${walls.map(w=>`<rect x="${w.ax}" y="${w.ay}" width="${w.bx-w.ax}" height="${w.by-w.ay}" fill="#292f35" stroke="#8a8678" stroke-width="8"/>`).join('')}${lights.map(l=>`<circle cx="${l.x}" cy="${l.y}" r="42" fill="#cc9d3f" opacity=".15"/><circle cx="${l.x}" cy="${l.y}" r="13" fill="${l.color==='cool'?'#a7ccff':'#ffca6b'}"/>`).join('')}<text x="1920" y="215" text-anchor="middle" fill="#d6c9a4" font-size="56">GRAND HALL · PAIRED MOVEMENT TEST</text></svg>`);
 const image=await sharp(art).png().toBuffer();await fs.writeFile(path.join(output,'hall.png'),image);
 const map=await(await request.post(`/api/sessions/${code}/maps`,{headers,multipart:{name:'Grand Hall · 240 × 160 ft',image:{name:'hall.png',mimeType:'image/png',buffer:image}}})).json();
 const admin=io(`http://localhost:${PORT}`,{transports:['websocket']});let latest:any;
 admin.on('state:snapshot',s=>latest=s);
 const join=async()=>{const r=await admin.timeout(20000).emitWithAck('join',{sessionCode:code,role:'dm',dmPassphrase:DM_SECRET});expect(r.ok).toBe(true);latest=r.snapshot;return latest;};
 const report:any={at:new Date().toISOString(),probeVersion:3,movesPerRate:MOVES,host:{cpu:os.cpus()[0]?.model,browser:browser.version(),logicalCpus:os.cpus().length,memoryGiB:Math.round(os.totalmem()/2**30)},buildIndexSha256:createHash('sha256').update(await fs.readFile('client/dist/index.html')).digest('hex'),fixture:{roomFeet:[240,160],mapPixels:[3840,2560],monsters:140,pcs:3,tokens:143,lights:48,walls:28,wallEdges:112},method:'Two independent Legacy browser contexts. Initial join/setup unthrottled; clients throttled per run.cpuSlowdown (DM) and run.playerCpuSlowdown (Player, defaults to DM rate) before DM enables Player view and during movement. Software Canvas2D, WebGL blocked throughout. Server unthrottled on same host; no network delay/RAM cap. Epoch timestamps on same host; release-to-token/sight latency includes server communication plus two RAF paint opportunities. Event-driven cached token layer draw handler and SVG MutationObserver; no polling or continuous RAF probe. Separate idle-with-instrumentation baseline. Recording and probes add overhead. Both documents kept visible. Private drag previews do not move the DM view until a committed drop.',runs:[]};
 const save=()=>fs.writeFile(path.join(output,'results.json'),JSON.stringify(report,null,2));
 try{
  const initial=await join();admin.emit('map:setActive',{mapId:map.id});admin.emit('map:setGrid',{mapId:map.id,gridSizePx:80,feetPerSquare:5,widthFt:240,locked:true});
  for(const w of walls)admin.emit('map:editWalls',{mapId:map.id,add:w});admin.emit('map:setEnvironment',{mapId:map.id,settings:{enabled:true,lighting:'dungeon',heavyDarkness:true,lights}});
  const species=[['Goblin','goblin','👺'],['Skeleton','skeleton','💀'],['Wolf','wolf','🐺'],['Guard','bandit','🛡️']];
  for(const [name,modelType,icon] of species)admin.emit('monster:create',{name:`Bench ${name}`,modelType,icon,maxHp:20,armorClass:13,disposition:'enemy'});await join();
  const templates=species.map(([name])=>latest.monsterTemplates.find((m:any)=>m.name===`Bench ${name}`));
  for(let i=0;i<140;i++)admin.emit('token:spawn',{mapId:map.id,kind:'monster',refId:templates[i<120?i%4:0].id,x:i<120?280+i%12*280:1400+(i-120)*100,y:i<120?360+Math.floor(i/12)*210:2360});
  for(const [i,name] of ['Druk','Varis','Vanec'].entries())admin.emit('token:spawn',{mapId:map.id,kind:'pc',refId:initial.characters.find((c:any)=>c.name===name).id,x:640+i*1280,y:1280});
  await join();expect(latest.tokens).toHaveLength(143);const token=latest.tokens.find((t:any)=>t.kind==='pc'&&initial.characters.find((c:any)=>c.id===t.refId)?.name==='Varis');
  for(const rate of rates){
   const playerRate=Number(process.env.LEGACY_MOVEMENT_PLAYER_RATE??rate);
   const run:any={cpuSlowdown:rate,playerCpuSlowdown:playerRate,status:'running',samples:[]};report.runs.push(run);await save();
   const contexts=await Promise.all(['dm','player'].map(()=>browser.newContext({baseURL:`http://localhost:${PORT}`,viewport:{width:1440,height:900},deviceScaleFactor:1,serviceWorkers:'block',recordVideo:{dir:path.join(output,'raw'),size:{width:1440,height:900}}})));
   const pages=await Promise.all(contexts.map(c=>c.newPage())),[dm,player]=pages,videos=pages.map(p=>p.video());
   const requests:string[][]=[[],[]],errors:string[][]=[[],[]];
   const cds=await Promise.all(pages.map(async(p,i)=>{p.on('request',r=>requests[i].push(r.url()));p.on('pageerror',e=>errors[i].push(e.message));await probe(p,i?'Player':'DM',i?playerRate:rate);const c=await p.context().newCDPSession(p);await c.send('Performance.enable');return c;}));
   try{
    console.log(`[legacy-movement] ${rate}x: joining independent DM and player clients`);
    await dm.goto(`/dm?code=${code}`);await dm.getByRole('button',{name:'Start in legacy mode',exact:true}).click();await dm.locator('input[type=password]').fill(DM_SECRET);await dm.getByRole('button',{name:'Rejoin as DM',exact:true}).click();await expect(dm.getByLabel('Battlefield visibility')).toBeVisible({timeout:90000});
    await player.goto(`/join?code=${code}`);await player.getByRole('button',{name:'Start in legacy mode',exact:true}).click();await player.getByRole('button',{name:'Join',exact:true}).click();await player.locator('.claim-row').filter({hasText:'Varis'}).click();await expect(player.getByTestId('player-hud')).toBeVisible({timeout:90000});
    await expect.poll(()=>latest.characters.find((c:any)=>c.id===token.refId)?.claimedBy,{timeout:30000}).toBeTruthy();
    await Promise.all(cds.map((c,i)=>c.send('Emulation.setCPUThrottlingRate',{rate:i?playerRate:rate})));
    await Promise.all(pages.map(p=>p.evaluate(()=>{const p=(window as any).__move;p.throttled=true;p.label('Ready for measured movement');})));
    await dm.evaluate(()=>(window as any).__move.label('DM turns on Player view · player controls Varis'));
    run.enablePlayerViewPageMs=await dm.evaluate(()=>performance.now());await dm.getByLabel('Battlefield visibility').selectOption('player');await expect(dm.getByTestId('legacy-vision')).toHaveAttribute('data-origin-count','3',{timeout:90000});
    await expect.poll(()=>player.evaluate(id=>(window as any).Konva.stages.some((s:any)=>s.find('.token').some((n:any)=>n.getAttr('tokenId')===id&&n.draggable())),token.id),{timeout:30000}).toBe(true);
    await dm.screenshot({path:path.join(output,`dm-${rate}x-player-view.png`)});await player.mouse.move(1370,110);await player.waitForTimeout(1500);
    const metric=(r:any,key:string)=>r.metrics.find((m:any)=>m.name===key)?.value??0;
    await Promise.all(pages.map(p=>p.evaluate(()=>(window as any).__move.start())));
    const idleBefore=await Promise.all(cds.map(c=>c.send('Performance.getMetrics'))),idleStarted=Date.now();await player.waitForTimeout(2000);
    const idleAfter=await Promise.all(cds.map(c=>c.send('Performance.getMetrics'))),idleObserved=Date.now()-idleStarted;
    run.probeIdle=idleAfter.map((r,i)=>({role:i?'Player':'DM',observedMs:idleObserved,mainThreadBusyMs:Math.round((metric(r,'TaskDuration')-metric(idleBefore[i],'TaskDuration'))*1000)}));
    await Promise.all(pages.map(p=>p.evaluate(()=>(window as any).__move.stop())));
    const before=await Promise.all(cds.map(c=>c.send('Performance.getMetrics')));run.movementStartEpochMs=Date.now();run.movementStartPageMs=await dm.evaluate(()=>performance.now());
    await Promise.all(pages.map(p=>p.evaluate(()=>(window as any).__move.start())));
    const route=[[1840,1360],[1840,1440],[2080,1440],[2080,1280],[2000,1280],[1920,1280]];
    for(let i=0;i<MOVES;i++){
     const [x,y]=route[i%route.length],arm={id:token.id,x,y,seq:i+1};
     await Promise.all(pages.map(p=>p.evaluate(data=>{const m=(window as any).__move;m.label(`Move ${data.seq}/${data.total} · player drags Varis · DM keeps Player view`);m.arm(data);},{...arm,total:MOVES})));
     const from=await xy(player,token.id),to=await xy(player,token.id,x,y);await player.mouse.move(from.x,from.y);await player.mouse.down();
     await player.mouse.move(to.x,to.y,{steps:6});await player.mouse.up();await player.mouse.move(1370,110);
     await Promise.all(pages.map(p=>p.waitForFunction(()=>{const a=(window as any).__move.active;return a.tokenPaintAt&&a.sightPaintAt;},undefined,{timeout:45000})));
     const [d,p]=await Promise.all(pages.map(p=>p.evaluate(()=>(window as any).__move.active)));
     expect(p.releasedAt).toBeGreaterThan(0);const accepted=latest.tokens.find((t:any)=>t.id===token.id);expect(Math.abs(accepted.x-x)).toBeLessThan(4);expect(Math.abs(accepted.y-y)).toBeLessThan(4);
     const sample={seq:i+1,x,y,releasedAt:p.releasedAt,playerTokenMs:p.tokenPaintAt-p.releasedAt,playerSightMs:p.sightPaintAt-p.releasedAt,dmTokenMs:d.tokenPaintAt-p.releasedAt,dmSightMs:d.sightPaintAt-p.releasedAt};run.samples.push(sample);await save();
     console.log(`[legacy-movement] ${rate}x move ${i+1}: DM token ${Math.round(sample.dmTokenMs)}ms / sight ${Math.round(sample.dmSightMs)}ms`);
     await player.waitForTimeout(450);
    }
    await Promise.all(pages.map(p=>p.evaluate(()=>(window as any).__move.stop())));run.movementEndEpochMs=Date.now();
    const after=await Promise.all(cds.map(c=>c.send('Performance.getMetrics'))),probes=await Promise.all(pages.map(p=>p.evaluate(()=>(window as any).__move)));
    run.latency=Object.fromEntries(['playerTokenMs','playerSightMs','dmTokenMs','dmSightMs'].map(k=>[k,summary(run.samples.map((s:any)=>s[k]))]));
    run.clients=probes.map((p:any,i:number)=>{const tasks=p.longTasks.filter((t:any)=>t.at>=run.movementStartEpochMs&&t.at<=run.movementEndEpochMs);return{role:i?'Player':'DM',documentHidden:null,observedMs:run.movementEndEpochMs-run.movementStartEpochMs,mainThreadBusyMs:Math.round((metric(after[i],'TaskDuration')-metric(before[i],'TaskDuration'))*1000),scriptMs:Math.round((metric(after[i],'ScriptDuration')-metric(before[i],'ScriptDuration'))*1000),jsHeapMiB:Math.round(metric(after[i],'JSHeapUsedSize')/2**20),longTasks:{count:tasks.length,totalMs:Math.round(tasks.reduce((s:number,t:any)=>s+t.ms,0)),maxMs:Math.round(Math.max(0,...tasks.map((t:any)=>t.ms)))},webglAttempts:p.webgl,graphicsRequests:requests[i].filter(u=>/\.glb(?:\?|$)|\/(?:MiniatureLayer|materialDice|diceTrayRenderer)-/.test(u)),errors:errors[i]};});
    for(const [i,p] of pages.entries()){
     run.clients[i].canvases=await p.evaluate(()=>{const stage=(window as any).Konva.stages.find((s:any)=>s.find('.token').length);const layers=stage.getLayers().map((l:any)=>({scene:[l.getCanvas()._canvas.width,l.getCanvas()._canvas.height],hit:[l.getHitCanvas()._canvas.width,l.getHitCanvas()._canvas.height]}));return{viewport:[stage.width(),stage.height()],layers,sceneAndHitPixels:layers.reduce((n:number,l:any)=>n+l.scene[0]*l.scene[1]+l.hit[0]*l.hit[1],0)};});
     run.clients[i].documentHidden=await p.evaluate(()=>document.hidden);expect(run.clients[i].documentHidden).toBe(false);expect(run.clients[i].webglAttempts).toBe(0);expect(run.clients[i].graphicsRequests).toEqual([]);expect(errors[i]).toEqual([]);await p.screenshot({path:path.join(output,`${i?'player':'dm'}-${i?playerRate:rate}x-complete.png`)});
    }
    await expect(dm.getByLabel('Battlefield visibility')).toHaveValue('player');run.status='passed';console.log(`[legacy-movement] ${rate}x passed: ${JSON.stringify(run.latency)}`);
   }catch(e){run.status='failed';run.error=String(e);await Promise.all(pages.map((p,i)=>p.screenshot({path:path.join(output,`${i?'player':'dm'}-${i?playerRate:rate}x-failure.png`),timeout:15000}).catch(()=>{})));console.log(`[legacy-movement] ${rate}x FAILED: ${e}`);}
   finally{await Promise.all(contexts.map(c=>c.close()));for(const [i,v] of videos.entries())if(v)await v.saveAs(path.join(output,`${i?'player':'dm'}-${i?playerRate:rate}x.webm`));await save();}
   admin.emit('token:move',{tokenId:token.id,x:1920,y:1280});await join();
  }
  expect(report.runs.every((r:any)=>r.status==='passed')).toBe(true);
 }finally{admin.disconnect();await save();}
});
