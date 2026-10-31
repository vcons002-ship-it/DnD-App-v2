import {test,expect} from './helpers/test';
import {io} from 'socket.io-client';
import sharp from 'sharp';
import fs from 'node:fs/promises';
import {DM_SECRET,PORT} from './playwright.config';

test('measure unassisted Legacy navigation with many walls and lights',async({page,context,request})=>{
 test.skip(!process.env.LEGACY_COLOR_PERF_OUTPUT,'Opt-in performance measurement');test.setTimeout(180000);
 const headers={'x-dm-passphrase':DM_SECRET};
 const {code}=await(await request.post('/api/sessions',{headers,data:{name:'Disposable color performance'}})).json();
 const image=await sharp({create:{width:1800,height:1200,channels:3,background:'#ad753a'}}).png().toBuffer();
 const map=await(await request.post(`/api/sessions/${code}/maps`,{headers,multipart:{name:'Room',image:{name:'map.png',mimeType:'image/png',buffer:image}}})).json();
 const dm=io(`http://localhost:${PORT}`,{transports:['websocket']});
 const state=async()=>(await dm.timeout(15000).emitWithAck('join',{sessionCode:code,role:'dm',dmPassphrase:DM_SECRET})).snapshot;
 try{
  const initial=await state(),pc=initial.characters.find((c:any)=>c.name==='Druk');
  dm.emit('map:setActive',{mapId:map.id});dm.emit('map:setGrid',{mapId:map.id,gridSizePx:40,feetPerSquare:5,widthFt:225,locked:true});
  for(const layer of ['map','tokens'])dm.emit('fog:setLayer',{mapId:map.id,layer,enabled:false});
  for(let i=0;i<28;i++){const x=700+(i%7)*140,y=80+Math.floor(i/7)*220;dm.emit('map:editWalls',{mapId:map.id,add:{id:`wall-${i}`,ax:x,ay:y,bx:x+80,by:y+15}});}
  const lights=Array.from({length:48},(_,i)=>({id:`lamp-${i}`,x:100+(i%8)*200,y:120+Math.floor(i/8)*180,radiusFt:15,heightFt:5,color:'warm',intensity:1,flicker:false,visibleTorch:true}));
  dm.emit('map:setEnvironment',{mapId:map.id,settings:{enabled:true,lighting:'dungeon',heavyDarkness:true,mist:false,lights}});
  dm.emit('token:spawn',{mapId:map.id,kind:'pc',refId:pc.id,x:300,y:350});const token=(await state()).tokens.find((t:any)=>t.refId===pc.id);
  await page.addInitScript(()=>{localStorage.setItem('dnd-environment-quality','legacy');localStorage.setItem('dnd-server-rendering','off');localStorage.setItem('dnd-dice-rendering','2d');});
  await page.setViewportSize({width:1440,height:960});await page.goto(`/join?code=${code}`);
  await page.getByRole('button',{name:'Join',exact:true}).click();await page.locator('.claim-row').filter({hasText:'Druk'}).click();
  await expect(page.getByTestId('legacy-vision')).toHaveAttribute('data-geometry-source','client');await page.waitForTimeout(1500);
  const cdp=await context.newCDPSession(page);await cdp.send('Emulation.setCPUThrottlingRate',{rate:6});await cdp.send('Performance.enable');
  const metrics=async()=>Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((m:any)=>[m.name,m.value]));
  const position=()=>page.evaluate(()=>{const stage=(window as any).Konva.stages.find((s:any)=>s.find('.token').length),layer=stage.getLayers().find((l:any)=>l.draggable());return layer.position() as {x:number;y:number};});
  const movements=[];
  for(let sample=0;sample<2;sample++){
   const start=(await state()).tokens.find((t:any)=>t.id===token.id);
   const point=await page.evaluate(()=>{const stage=(window as any).Konva.stages.find((s:any)=>s.find('.token').length),n=stage.find('.token')[0],p=n.getAbsolutePosition(),r=stage.getContent().getBoundingClientRect();return {x:r.left+p.x,y:r.top+p.y};});
   const before=await metrics();await page.mouse.move(point.x,point.y);await page.mouse.down();await page.mouse.move(point.x+(sample===0?50:-50),point.y,{steps:12});await page.mouse.up();
   await expect.poll(async()=> (await state()).tokens.find((t:any)=>t.id===token.id)?.x,{timeout:30000}).not.toBe(start.x);
   await page.waitForTimeout(600);const after=await metrics();
   movements.push({elapsedMs:(after.Timestamp-before.Timestamp)*1000,taskMs:(after.TaskDuration-before.TaskDuration)*1000,scriptMs:(after.ScriptDuration-before.ScriptDuration)*1000});
  }
  const box=(await page.locator('.stage-wrap').boundingBox())!,x=box.x+box.width*.55,y=box.y+box.height*.22;
  const samples=[];
  for(let sample=0;sample<3;sample++){
   const positionBefore=await position(),before=await metrics();
   for(let drag=0;drag<4;drag++){
    await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+(drag%2?-60:60),y+35,{steps:12});await page.mouse.up();
   }
   const after=await metrics(),positionAfter=await position();
   expect(Math.hypot(positionAfter.x-positionBefore.x,positionAfter.y-positionBefore.y)).toBeGreaterThan(20);
   samples.push({elapsedMs:(after.Timestamp-before.Timestamp)*1000,taskMs:(after.TaskDuration-before.TaskDuration)*1000,scriptMs:(after.ScriptDuration-before.ScriptDuration)*1000,positionBefore,positionAfter});
  }
  const result={label:process.env.LEGACY_COLOR_PERF_LABEL,samples,movements,method:'Unassisted Legacy, one player, 28 walls, 48 lights, 1800x1200 image, 1440x960 viewport, 6x browser CPU throttling, unrestricted same-host server; 2 token drags followed by 3 samples of 4 automated pan drags; CDP main-thread and script time. Each token sample includes a 600ms wait. No trace/video, network throttling, RAM limit, or old-GPU emulation.'};
  await fs.writeFile(process.env.LEGACY_COLOR_PERF_OUTPUT!,JSON.stringify(result,null,2));console.log('LEGACY_COLOR_PERF',JSON.stringify(result));
 }finally{dm.disconnect();}
});
