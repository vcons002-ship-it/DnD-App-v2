/** Opt-in actual MapStage GPU preference experiment, fresh browser per sample. */
import {test,expect,chromium} from '@playwright/test';
import {io} from 'socket.io-client';
import sharp from 'sharp';
import fs from 'node:fs/promises';
import path from 'node:path';
import {DM_SECRET,PORT} from './playwright.config';
test.use({trace:'off'});

test('compare low-power and high-performance on the same real 3D scene',async({request})=>{
 test.skip(!process.env.GPU_PREFERENCE_OUTPUT,'Set GPU_PREFERENCE_OUTPUT for the hardware experiment.');test.setTimeout(300000);
 const output=path.resolve(process.env.GPU_PREFERENCE_OUTPUT!);await fs.mkdir(output,{recursive:true});
 const headers={'x-dm-passphrase':DM_SECRET};
 const {code}=await(await request.post('/api/sessions',{headers,data:{name:'Disposable GPU preference benchmark'}})).json();
 const image=await sharp({create:{width:1600,height:1000,channels:3,background:'#645846'}}).png().toBuffer();
 const map=await(await request.post(`/api/sessions/${code}/maps`,{headers,multipart:{name:'GPU room',image:{name:'room.png',mimeType:'image/png',buffer:image}}})).json();
 const admin=io(`http://localhost:${PORT}`,{transports:['websocket']});
 const snapshot=async()=>(await admin.timeout(10000).emitWithAck('join',{sessionCode:code,role:'dm',dmPassphrase:DM_SECRET})).snapshot;
 const report:any={at:new Date().toISOString(),method:'Fresh installed Chrome per sample; low/high/high/low order. Same 24 goblins, 8 lights, 4 walls, balanced quality, DPR1, 1440x960. 5s warmup after models ready, 7s stationary + 7s accepted token movement. Counts actual distinct painted miniature frames. getContext override only changes powerPreference and records original request, effective attributes and driver. No forced adapter, CPU throttle or recording.',runs:[]};
 try{
  await snapshot();admin.emit('map:setActive',{mapId:map.id});
  for(const layer of ['map','tokens'])admin.emit('fog:setLayer',{mapId:map.id,layer,enabled:false});
  admin.emit('monster:create',{name:'GPU Goblin',modelType:'goblin',icon:'G',maxHp:20,armorClass:13,disposition:'enemy'});
  let s=await snapshot();const monster=s.monsterTemplates.find((m:any)=>m.name==='GPU Goblin');
  for(let i=0;i<24;i++)admin.emit('token:spawn',{mapId:map.id,kind:'monster',refId:monster.id,x:250+i%6*210,y:220+Math.floor(i/6)*180});
  for(let i=0;i<4;i++)admin.emit('map:editWalls',{mapId:map.id,add:{id:`pillar-${i}`,kind:'rectangle',ax:350+i*270,ay:420,bx:380+i*270,by:450}});
  admin.emit('map:setEnvironment',{mapId:map.id,settings:{enabled:true,lighting:'dungeon',lights:Array.from({length:8},(_,i)=>({id:`l${i}`,x:200+i%4*380,y:160+Math.floor(i/4)*600,radiusFt:30,heightFt:8,color:'warm',intensity:1,flicker:true,visibleTorch:true}))}});
  s=await snapshot();const token=s.tokens[0];
  for(const preference of ['low-power','high-performance','high-performance','low-power']){
   const browser=await chromium.launch({executablePath:process.env.PW_CHROMIUM});
   try{
    const page=await browser.newPage({viewport:{width:1440,height:960},deviceScaleFactor:1});const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
    await page.addInitScript(preference=>{
     sessionStorage.setItem('dnd.rendering-started','1');localStorage.setItem('dnd-environment-quality','balanced');
     localStorage.setItem('dnd.playerId','gpu-experiment');localStorage.setItem('dnd.tokenView:gpu-experiment','2d');localStorage.setItem('dnd.monsterTokenView:gpu-experiment','3d');
     const w=window as any;w.__contexts=[];const original=HTMLCanvasElement.prototype.getContext;
     HTMLCanvasElement.prototype.getContext=function(this:HTMLCanvasElement,kind:string,options:any){
      if(!kind.includes('webgl'))return (original as any).call(this,kind,options);
      const gl=(original as any).call(this,kind,{...options,powerPreference:preference});
      if(gl){const ext=gl.getExtension('WEBGL_debug_renderer_info');w.__contexts.push({canvas:this,requested:options?.powerPreference,effective:gl.getContextAttributes().powerPreference,gpu:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER)});}return gl;
     } as any;
    },preference);
    await page.goto(`http://localhost:${PORT}/dm?code=${code}`);await page.locator('input[type=password]').fill(DM_SECRET);await page.getByRole('button',{name:'Rejoin as DM',exact:true}).click();
    const models=page.getByTestId('miniature-layer');await expect(models).toHaveAttribute('data-miniature-count','24',{timeout:90000});
    await expect.poll(async()=>Number(await models.getAttribute('data-color-triangles')),{timeout:30000}).toBeGreaterThan(100000);
    await page.waitForTimeout(5000);
    const run:any={preference,browser:browser.version(),errors,samples:[]};
    run.context=await models.evaluate(el=>(window as any).__contexts.filter((c:any)=>el.contains(c.canvas)).map(({canvas,...info}:any)=>info));
    expect(run.context.some((c:any)=>c.requested==='high-performance')).toBe(true);
    for(const moving of [false,true]){
     const before=await models.evaluate(el=>({at:performance.now(),frames:Number((el as HTMLElement).dataset.frameCount)}));
     if(moving){for(let i=0;i<28;i++){admin.emit('token:move',{tokenId:token.id,x:250+(i%2)*100,y:220});await page.waitForTimeout(250);}}else await page.waitForTimeout(7000);
     const after=await models.evaluate(el=>({at:performance.now(),frames:Number((el as HTMLElement).dataset.frameCount),triangles:(el as HTMLElement).dataset.colorTriangles,gpuMs:(el as HTMLElement).dataset.gpuMs}));
     run.samples.push({moving,elapsedMs:after.at-before.at,paintedFrames:after.frames-before.frames,fps:(after.frames-before.frames)*1000/(after.at-before.at),triangles:after.triangles,gpuMs:after.gpuMs});
    }
    expect(errors).toEqual([]);report.runs.push(run);await page.screenshot({path:path.join(output,`scene-${report.runs.length}-${preference}.png`)});await fs.writeFile(path.join(output,'results.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(run));
   }finally{await browser.close();}
  }
 }finally{admin.disconnect();}
});
