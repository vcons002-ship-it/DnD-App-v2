import {test,expect} from '@playwright/test';
import {io} from 'socket.io-client';
import {readFileSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {DM_SECRET,PORT} from './playwright.config';
const directory=process.env.CHARACTER_REDUCTION_DIR;
test('compare character reduction candidates on the same crowded battlefield',async({browser,request},info)=>{
 test.skip(!directory,'Opt-in study: run reduce-characters.mjs and set CHARACTER_REDUCTION_DIR');
 test.setTimeout(240000);
 const reports=JSON.parse(readFileSync(path.join(directory!,'comparison.json'),'utf8'));
 const headers={'x-dm-passphrase':DM_SECRET};
 const {code}=await(await request.post('/api/sessions',{headers,data:{name:'Character mesh comparison'}})).json();
 const map=await(await request.post(`/api/sessions/${code}/maps`,{headers,multipart:{name:'Courtyard',image:{name:'courtyard.png',mimeType:'image/png',buffer:readFileSync('assets/environment-preview/courtyard.png')}}})).json();
 const socket=io(`http://localhost:${PORT}`,{transports:['websocket']});
 const snap=async()=>{const r=await socket.timeout(5000).emitWithAck('join',{sessionCode:code,role:'dm',dmPassphrase:DM_SECRET});expect(r.ok).toBe(true);return r.snapshot;};
 const context=await browser.newContext({baseURL:`http://localhost:${PORT}`,viewport:{width:1440,height:900},deviceScaleFactor:2,serviceWorkers:'block'});
 let profile='original';const replacements=new Set<string>();
 await context.addInitScript(()=>localStorage.setItem('dnd-environment-quality','high'));
 await context.addInitScript(()=>{
  const original=WebGL2RenderingContext.prototype.drawElements;
  let indices=0,calls=0;
  WebGL2RenderingContext.prototype.drawElements=function(...args:Parameters<WebGL2RenderingContext['drawElements']>){indices+=args[1];calls++;return original.apply(this,args);};
  (window as any).readGeometryWork=()=>({indices,calls});
 });
 await context.route(/\/miniatures\/(druk|varis|vanec)-[a-f0-9]+\.glb$/,async route=>{
  const id=path.basename(new URL(route.request().url()).pathname).split('-')[0];
  const report=reports.find((r:any)=>r.id===id&&r.profile===profile);
  if(report){replacements.add(id);await route.fulfill({contentType:'model/gltf-binary',body:readFileSync(path.join(directory!,report.filename))});}else await route.continue();
 });
 try{
  const initial=await snap();socket.emit('map:setActive',{mapId:map.id});socket.emit('map:setGrid',{mapId:map.id,gridSizePx:64,feetPerSquare:5,widthFt:95,locked:false});
  for(const layer of ['map','tokens'])socket.emit('fog:setLayer',{mapId:map.id,layer,enabled:false});
  for(const [i,name] of ['Druk','Varis','Vanec'].entries()){
   const c=initial.characters.find((c:any)=>c.name===name);socket.emit('token:spawn',{mapId:map.id,kind:'pc',refId:c.id,x:440+i*120,y:600});
  }
  socket.emit('monster:create',{name:'Goblin',modelType:'goblin',maxHp:12,armorClass:12,disposition:'enemy'});
  const goblin=(await snap()).monsterTemplates.find((m:any)=>m.name==='Goblin');
  for(let i=0;i<24;i++)socket.emit('token:spawn',{mapId:map.id,kind:'monster',refId:goblin.id,x:200+i%8*100,y:200+Math.floor(i/8)*100});
  socket.emit('map:setEnvironment',{mapId:map.id,settings:{enabled:true,lighting:'dungeon',mist:true,mistHeightFt:6,mistOpacity:.5,weather:'rain',weatherIntensity:1,particles:'embers',particleIntensity:1,lights:[
   {id:'left',x:400,y:450,radiusFt:30,heightFt:9,intensity:1,color:'warm',flicker:true},
   {id:'right',x:700,y:450,radiusFt:30,heightFt:9,intensity:1,color:'cool',flicker:true},
   {id:'north',x:500,y:300,radiusFt:30,heightFt:9,intensity:1,color:'warm',flicker:true},
  ]}});
  if(process.env.CHARACTER_REDUCTION_ENV==='plain')socket.emit('map:setEnvironment',{mapId:map.id,settings:{enabled:true,lighting:'day',shadows:false,mist:false,weather:'none',particles:'none',lights:[]}});
  await snap();
  const page=await context.newPage(),errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  const results=[];
  for(const [round,quality] of ['original','balanced','light','original'].entries()){
   profile=quality;replacements.clear();await page.goto(`/dm?code=${code}&benchmark=1`);
   if(round===0){await page.locator('input[type=password]').fill(DM_SECRET);await page.getByRole('button',{name:'Rejoin as DM',exact:true}).click();}
   await page.getByRole('button',{name:'Tilted battlefield view',exact:true}).click();
   const layer=page.getByTestId('miniature-layer');await expect(layer).toHaveAttribute('data-miniature-count','27',{timeout:60000});
   if(quality!=='original')expect([...replacements].sort()).toEqual(['druk','vanec','varis']);
   await page.waitForTimeout(5000);
   const workBefore=await page.evaluate(()=>(window as any).readGeometryWork()),framesBefore=Number(await layer.getAttribute('data-render-count'));
   await page.waitForTimeout(2500);
   const workAfter=await page.evaluate(()=>(window as any).readGeometryWork()),framesAfter=Number(await layer.getAttribute('data-render-count'));
   let gpuHardware='unavailable';try{gpuHardware=execFileSync('nvidia-smi',['--query-gpu=name,clocks.gr,power.draw,utilization.gpu','--format=csv,noheader,nounits'],{encoding:'utf8',timeout:3000,windowsHide:true}).trim();}catch{}
   results.push({round,quality,gpuHardware,indicesPerFrame:(workAfter.indices-workBefore.indices)/(framesAfter-framesBefore),data:await layer.evaluate(e=>({...((e as HTMLElement).dataset)}))});
   await page.screenshot({path:info.outputPath(`${round}-${quality}.png`)});
  }
  expect(errors).toEqual([]);
  expect(results[2].indicesPerFrame).toBeLessThan(results[0].indicesPerFrame*.5);
  writeFileSync(info.outputPath('performance-comparison.json'),JSON.stringify({note:'Desktop GPU comparison; not phone hardware. Only model response bytes changed; all settings, lights and creatures match.',results},null,2));
 }finally{socket.disconnect();await context.close();}
});
