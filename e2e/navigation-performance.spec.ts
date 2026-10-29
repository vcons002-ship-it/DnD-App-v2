/** Opt-in before/after browser CPU evidence, with actual models and no trace/video. */
import {test,expect,chromium,type Page} from '@playwright/test';
import {io} from 'socket.io-client';
import sharp from 'sharp';
import fs from 'node:fs/promises';
import path from 'node:path';
import {projectGround} from '../client/src/canvas/miniatureProjection';
import {DM_SECRET,PORT} from './playwright.config';

test.use({trace:'off',video:'off'});
async function point(page:Page,x:number,y:number,tilt:number){
 const p=await page.evaluate(({x,y})=>{
  const stage=(window as any).Konva.stages.find((s:any)=>s.find('.token').length),layer=stage.getLayers()[0],p=layer.getAbsoluteTransform().point({x,y}),r=stage.getContent().getBoundingClientRect();return {...p,left:r.left,top:r.top,width:stage.width(),height:stage.height()};
 },{x,y});
 const q=projectGround(p.x,p.y,p.width,p.height,tilt,0);return {x:p.left+q.x,y:p.top+q.y};
}

test('player idle/navigation and DM fog CPU',async({request})=>{
 test.skip(!process.env.NAVIGATION_OUTPUT,'Set NAVIGATION_OUTPUT to collect performance evidence.');test.setTimeout(420000);
 const output=path.resolve(process.env.NAVIGATION_OUTPUT!);await fs.mkdir(output,{recursive:true});
 const report:any={at:new Date().toISOString(),clientDist:process.env.E2E_CLIENT_DIST,method:'Sequential fresh contexts, real Chrome RTX WebGL, unrestricted disposable server. 48 goblins, one PC, 12 static lights, mist enabled, 2000x1400 image, DPR1, 1440x960. Player Low/Balanced at 1x/6x CPU. CDP main-thread task milliseconds, no profiler/trace/video. DM Legacy fog covers 28,000 grid cells. Same current backend for both client builds. Samples are individual observations, not hardware-independent speed guarantees.',players:[],fog:[],errors:[]};
 const headers={'x-dm-passphrase':DM_SECRET};
 const {code}=await(await request.post('/api/sessions',{headers,data:{name:'Disposable navigation benchmark'}})).json();
 const image=await sharp({create:{width:2000,height:1400,channels:3,background:'#75634d'}}).png().toBuffer();
 const map=await(await request.post(`/api/sessions/${code}/maps`,{headers,multipart:{name:'Large room',image:{name:'large.png',mimeType:'image/png',buffer:image}}})).json();
 const admin=io(`http://localhost:${PORT}`,{transports:['websocket']});
 const state=async()=>(await admin.timeout(15000).emitWithAck('join',{sessionCode:code,role:'dm',dmPassphrase:DM_SECRET})).snapshot;
 const browser=await chromium.launch({executablePath:process.env.PW_CHROMIUM});
 const save=()=>fs.writeFile(path.join(output,'results.json'),JSON.stringify(report,null,2));
 try{
  const initial=await state(),pc=initial.characters.find((c:any)=>c.name==='Vanec');
  admin.emit('map:setActive',{mapId:map.id});admin.emit('map:setGrid',{mapId:map.id,gridSizePx:10,feetPerSquare:5,widthFt:1000,locked:true});
  for(const layer of ['map','tokens']){admin.emit('fog:setLayer',{mapId:map.id,layer,enabled:false});admin.emit('fog:setVision',{mapId:map.id,layer,enabled:false});}
  admin.emit('character:update',{characterId:pc.id,className:'Sorcerer',curHp:12,maxHp:20});admin.emit('token:spawn',{mapId:map.id,kind:'pc',refId:pc.id,x:500,y:350});
  admin.emit('monster:create',{name:'Navigation goblin',modelType:'goblin',maxHp:20,disposition:'enemy'});
  const template=(await state()).monsterTemplates.find((m:any)=>m.name==='Navigation goblin');
  for(let i=0;i<48;i++)admin.emit('token:spawn',{mapId:map.id,kind:'monster',refId:template.id,x:200+i%8*190,y:160+Math.floor(i/8)*180});
  admin.emit('map:setEnvironment',{mapId:map.id,settings:{enabled:true,lighting:'day',heavyDarkness:false,shadows:false,mist:true,weather:'none',particles:'none',lights:Array.from({length:12},(_,i)=>({id:`lamp-${i}`,x:200+i%4*500,y:200+Math.floor(i/4)*450,radiusFt:60,heightFt:8,intensity:1,color:'warm',flicker:false,visibleTorch:true}))}});await state();
  for(const quality of ['low','balanced'])for(const rate of [1,6]){
   const context=await browser.newContext({viewport:{width:1440,height:960},deviceScaleFactor:1});
   try{
    const page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));
    await page.addInitScript(quality=>{sessionStorage.setItem('dnd.rendering-started','1');localStorage.setItem('dnd.playerId','navigation-bench');localStorage.setItem('dnd-environment-quality',quality);localStorage.setItem('dnd.tokenView:navigation-bench','3d');localStorage.setItem('dnd.monsterTokenView:navigation-bench','3d');localStorage.setItem('dnd.battlefieldView:navigation-bench','tilted');},quality);
    const cdp=await context.newCDPSession(page);await cdp.send('Emulation.setCPUThrottlingRate',{rate});await cdp.send('Performance.enable');
    await page.goto(`http://localhost:${PORT}/join?code=${code}`);await page.getByRole('button',{name:'Join',exact:true}).click();
    const claim=page.locator('.claim-row').filter({hasText:'Vanec'});
    await expect(claim.or(page.getByTestId('player-hud')).first()).toBeVisible({timeout:30000});if(await claim.count())await claim.click();
    await expect(page.getByTestId('player-hud')).toBeVisible({timeout:30000});const models=page.getByTestId('miniature-layer');
    await expect(models).toHaveAttribute('data-miniature-count','49',{timeout:90000});
    await expect.poll(()=>page.evaluate(()=>document.documentElement.dataset.dicePreloadedThemes??''),{timeout:60000}).toContain('sorcerer');await page.waitForTimeout(4000);
    const metrics=async()=>Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((m:any)=>[m.name,m.value]));
    const run:any={quality,rate,samples:[],orb:await page.locator('.liquid-orb').first().getAttribute('data-liquid-motion')};
    run.gpu=await models.evaluate(el=>{const gl=el.querySelector('canvas')!.getContext('webgl2')!,ext=gl.getExtension('WEBGL_debug_renderer_info');return ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER);});
    for(const phase of ['idle','navigation']){
     const frames=Number(await models.getAttribute('data-render-count')),before=await metrics();
     if(phase==='navigation'){
      const p=await point(page,1750,1250,45);
      for(let i=0;i<4;i++){await page.mouse.move(p.x,p.y);await page.mouse.down();await page.mouse.move(p.x+(i%2?-70:70),p.y+35,{steps:16});await page.mouse.up();}
      await page.locator('.hud-actions').getByRole('button',{name:'Character',exact:true}).click();await expect(page.locator('.character-window')).toBeVisible();await page.keyboard.press('Escape');await expect(page.locator('.character-window')).toBeHidden();
     }else await page.waitForTimeout(4000);
     const after=await metrics();run.samples.push({phase,elapsedMs:(after.Timestamp-before.Timestamp)*1000,taskMs:(after.TaskDuration-before.TaskDuration)*1000,scriptMs:(after.ScriptDuration-before.ScriptDuration)*1000,renders:Number(await models.getAttribute('data-render-count'))-frames});
    }
    report.players.push(run);await save();console.log(JSON.stringify(run));
   }finally{await context.close();}
  }
  // The fog phase isolates the manual cover from all 3D atmospheric work.
  admin.emit('map:setEnvironment',{mapId:map.id,settings:{enabled:false,mist:false,lighting:'day'}});admin.emit('fog:setLayer',{mapId:map.id,layer:'map',enabled:true});await state();
  for(const rate of [1,6]){
   admin.emit('fog:cover',{mapId:map.id,layer:'map'});await state();
   const context=await browser.newContext({viewport:{width:1440,height:960},deviceScaleFactor:1});
   try{
    const page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));
    await page.addInitScript(()=>{sessionStorage.setItem('dnd.rendering-started','1');localStorage.setItem('dnd-environment-quality','legacy');});
    const cdp=await context.newCDPSession(page);await cdp.send('Emulation.setCPUThrottlingRate',{rate});await cdp.send('Performance.enable');
    await page.goto(`http://localhost:${PORT}/dm?code=${code}`);await page.locator('input[type=password]').fill(DM_SECRET);await page.getByRole('button',{name:'Rejoin as DM',exact:true}).click();await expect(page.locator('.stage-wrap')).toBeVisible();await page.waitForTimeout(1500);
    const repaint=await page.evaluate(()=>{const layer=(window as any).Konva.stages.find((s:any)=>s.find('.token').length).getLayers()[0],start=performance.now();for(let i=0;i<100;i++)layer.draw();return performance.now()-start;});
    await page.getByTitle('Fog of war',{exact:true}).click();await page.getByRole('button',{name:'Reveal',exact:true}).click();await page.keyboard.press('Escape');
    const p=await point(page,800,1200,0);let snapshots=0;const count=()=>snapshots++;admin.on('state:snapshot',count);
    const before=Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((m:any)=>[m.name,m.value]));
    await page.mouse.move(p.x,p.y);await page.mouse.down();await page.mouse.move(p.x+250,p.y,{steps:120});await page.mouse.up();await page.waitForTimeout(500);
    const after=Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((m:any)=>[m.name,m.value]));admin.off('state:snapshot',count);
    const run={rate,repaint100Ms:repaint,brushElapsedMs:(after.Timestamp-before.Timestamp)*1000,brushTaskMs:(after.TaskDuration-before.TaskDuration)*1000,snapshots,revealed:(await state()).map.mapFogRevealed.length};report.fog.push(run);await save();console.log(JSON.stringify(run));
   }finally{await context.close();}
  }
  expect(report.errors).toEqual([]);await save();
 }finally{admin.disconnect();await browser.close();}
});
