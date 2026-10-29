/** Opt-in real WebGL comparison. Keep the fixture and measurement code identical before/after. */
import {test,expect,chromium} from '@playwright/test';
import {io} from 'socket.io-client';
import sharp from 'sharp';
import fs from 'node:fs/promises';
import path from 'node:path';
import {DM_SECRET,PORT} from './playwright.config';
test.use({trace:'off'});
test('standard rendering CPU and retained resources',async({request})=>{
 test.skip(!process.env.STANDARD_RENDER_OUTPUT,'Set STANDARD_RENDER_OUTPUT to run the benchmark.');test.setTimeout(420000);
 const output=path.resolve(process.env.STANDARD_RENDER_OUTPUT!);await fs.mkdir(output,{recursive:true});
 const headers={'x-dm-passphrase':DM_SECRET};
 const {code}=await(await request.post('/api/sessions',{headers,data:{name:'Disposable standard rendering benchmark'}})).json();
 const buffer=await sharp({create:{width:1800,height:1200,channels:3,background:'#645846'}}).png().toBuffer();
 const map=await(await request.post(`/api/sessions/${code}/maps`,{headers,multipart:{name:'Standard room',image:{name:'room.png',mimeType:'image/png',buffer}}})).json();
 const admin=io(`http://localhost:${PORT}`,{transports:['websocket']});
 const state=async()=>(await admin.timeout(15000).emitWithAck('join',{sessionCode:code,role:'dm',dmPassphrase:DM_SECRET})).snapshot;
 const report:any={at:new Date().toISOString(),method:'Installed Chrome with real WebGL, DPR1, 1440x960, balanced, assisted DM. 48 goblins, 12 placed lights, 4 walls. Fresh context per flat/3D and 1x/6x CPU. 5s warmup; 4s static, 4s selected ring, 8 accepted moves at 500ms cadence, 4s flicker. CDP TaskDuration and ScriptDuration are browser main-thread CPU, not elapsed latency. Server is unrestricted. No video or tracing.',runs:[]};
 try{
  await state();admin.emit('map:setActive',{mapId:map.id});
  for(const layer of ['map','tokens'])admin.emit('fog:setLayer',{mapId:map.id,layer,enabled:false});
  admin.emit('monster:create',{name:'Benchmark Goblin',modelType:'goblin',icon:'G',maxHp:20,armorClass:13,disposition:'enemy'});
  let s=await state();const monster=s.monsterTemplates.find((m:any)=>m.name==='Benchmark Goblin');
  for(let i=0;i<48;i++)admin.emit('token:spawn',{mapId:map.id,kind:'monster',refId:monster.id,x:200+i%8*195,y:180+Math.floor(i/8)*170});
  for(let i=0;i<4;i++)admin.emit('map:editWalls',{mapId:map.id,add:{id:`pillar-${i}`,kind:'rectangle',ax:340+i*350,ay:440,bx:365+i*350,by:465}});
  const environment=(flicker:boolean)=>({enabled:true,lighting:'dungeon',shadows:true,lights:Array.from({length:12},(_,i)=>({id:`l${i}`,x:160+i%4*490,y:140+Math.floor(i/4)*470,radiusFt:30,heightFt:8,color:'warm',intensity:1,flicker,visibleTorch:true}))});
  s=await state();const token=s.tokens[0];
  const browser=await chromium.launch({executablePath:process.env.PW_CHROMIUM});
  try{for(const mode of ['2d','3d'])for(const rate of [1,6]){
   admin.emit('map:setEnvironment',{mapId:map.id,settings:environment(false)});admin.emit('token:move',{tokenId:token.id,x:200,y:180});await state();
   const context=await browser.newContext({viewport:{width:1440,height:960},deviceScaleFactor:1});
   try{
    const page=await context.newPage(),errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
    await page.addInitScript(mode=>{sessionStorage.setItem('dnd.rendering-started','1');localStorage.setItem('dnd-environment-quality','balanced');localStorage.setItem('dnd.playerId','standard-bench');localStorage.setItem('dnd.battlefieldView:standard-bench','tilted');localStorage.setItem('dnd.tokenView:standard-bench','2d');localStorage.setItem('dnd.monsterTokenView:standard-bench',mode);},mode);
    const cdp=await context.newCDPSession(page);await cdp.send('Emulation.setCPUThrottlingRate',{rate});await cdp.send('Performance.enable');
    const start=Date.now();await page.goto(`http://localhost:${PORT}/dm?code=${code}`);await page.locator('input[type=password]').fill(DM_SECRET);await page.getByRole('button',{name:'Rejoin as DM',exact:true}).click();
    const models=page.getByTestId('miniature-layer');await expect(models).toHaveAttribute('data-miniature-status','ready',{timeout:90000});
    await expect(models).toHaveAttribute('data-tilt-degrees','45');
    if(mode==='3d')await expect(models).toHaveAttribute('data-miniature-count','48',{timeout:90000});
    await expect.poll(()=>page.evaluate(()=>(window as any).Konva.stages.flatMap((s:any)=>s.find('.token')).length),{timeout:30000}).toBe(48);
    const run:any={mode,rate,loadMs:Date.now()-start,browser:browser.version(),samples:[],errors};
    run.gpu=await models.evaluate(el=>{const canvas=el.querySelector('canvas')!,gl=canvas.getContext('webgl2')!,ext=gl.getExtension('WEBGL_debug_renderer_info');return ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER);});
    const metrics=async()=>Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((m:any)=>[m.name,m.value]));
    const counters=()=>models.evaluate(el=>({...((el as HTMLElement).dataset),retainedStats:JSON.stringify((window as any).Konva.stages.flatMap((s:any)=>s.getLayers().filter((l:any)=>l.getAttr('retainedStats')).map((l:any)=>({name:l.name(),...l.getAttr('retainedStats')}))))}));
    await page.waitForTimeout(5000);
    for(const phase of ['static','selected','movement','flicker']){
     if(phase==='selected')await page.evaluate(id=>{const n=(window as any).Konva.stages.flatMap((s:any)=>s.find('.token')).find((n:any)=>n.getAttr('tokenId')===id);n.fire('click',{evt:{button:0}},true);},token.id);
     if(phase==='flicker'){admin.emit('map:setEnvironment',{mapId:map.id,settings:environment(true)});await state();await page.waitForTimeout(1000);}
     const before=await metrics(),countsBefore=await counters(),at=Date.now();
     if(phase==='movement')for(let i=0;i<8;i++){admin.emit('token:move',{tokenId:token.id,x:200+(i%2)*75,y:180});await page.waitForTimeout(500);}else await page.waitForTimeout(4000);
     const after=await metrics();run.samples.push({phase,elapsedMs:Date.now()-at,taskMs:(after.TaskDuration-before.TaskDuration)*1000,scriptMs:(after.ScriptDuration-before.ScriptDuration)*1000,before:countsBefore,after:await counters()});
    }
    await page.screenshot({path:path.join(output,`${mode}-${rate}x.png`)});expect(errors).toEqual([]);report.runs.push(run);await fs.writeFile(path.join(output,'results.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({mode,rate,loadMs:run.loadMs,gpu:run.gpu,samples:run.samples.map(({phase,taskMs,scriptMs}:any)=>({phase,taskMs,scriptMs}))}));
   }finally{await context.close();}
  }}finally{await browser.close();}
 }finally{admin.disconnect();}
});
