import {test,expect} from '@playwright/test';
import {io} from 'socket.io-client';
import {readFileSync,writeFileSync} from 'node:fs';
import {build} from 'esbuild';
import {DM_SECRET,PORT} from './playwright.config';
test.use({serviceWorkers:'block'});

test('crowded real board batches monsters, changes model tiers without a 2D flash and retains independent base selection',async({browser,request},info)=>{
 test.setTimeout(180000);
 const headers={'x-dm-passphrase':DM_SECRET};
 const {code}=await(await request.post('/api/sessions',{headers,data:{name:'Adaptive rendering test'}})).json();
 const map=await(await request.post(`/api/sessions/${code}/maps`,{headers,multipart:{name:'Courtyard',image:{name:'courtyard.png',mimeType:'image/png',buffer:readFileSync('assets/environment-preview/courtyard.png')}}})).json();
 const socket=io(`http://localhost:${PORT}`,{transports:['websocket']});
 const snap=async()=>{const reply=await socket.timeout(5000).emitWithAck('join',{sessionCode:code,role:'dm',dmPassphrase:DM_SECRET});expect(reply.ok).toBe(true);return reply.snapshot;};
 const context=await browser.newContext({baseURL:`http://localhost:${PORT}`,viewport:{width:1440,height:900},deviceScaleFactor:2,serviceWorkers:'block'});
 const errors:string[]=[];
 try{
  const initial=await snap();socket.emit('map:setActive',{mapId:map.id});
  socket.emit('map:setGrid',{mapId:map.id,gridSizePx:64,feetPerSquare:5,widthFt:95,locked:false});
  for(const layer of ['map','tokens'])socket.emit('fog:setLayer',{mapId:map.id,layer,enabled:false});
  for(const [i,name] of ['Druk','Varis','Vanec'].entries())socket.emit('token:spawn',{mapId:map.id,kind:'pc',refId:initial.characters.find((c:any)=>c.name===name).id,x:440+i*120,y:600});
  socket.emit('monster:create',{name:'Goblin',modelType:'goblin',maxHp:12,armorClass:12,disposition:'enemy'});
  const goblin=(await snap()).monsterTemplates.find((m:any)=>m.name==='Goblin');
  for(let i=0;i<24;i++)socket.emit('token:spawn',{mapId:map.id,kind:'monster',refId:goblin.id,x:200+i%8*100,y:200+Math.floor(i/8)*100});
  socket.emit('map:setEnvironment',{mapId:map.id,settings:{enabled:true,lighting:'dungeon',mist:true,mistHeightFt:6,mistOpacity:.5,weather:'rain',weatherIntensity:1,particles:'embers',particleIntensity:1,lights:[
   {id:'left',x:400,y:450,radiusFt:30,heightFt:9,intensity:1,color:'warm',flicker:true},
   {id:'right',x:700,y:450,radiusFt:30,heightFt:9,intensity:1,color:'cool',flicker:true},
  ]}});
  await snap();
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&/THREE|WebGL|shader/i.test(m.text()))errors.push(m.text());});
  const enter=async(batch:boolean)=>{
   await page.goto(`/dm?code=${code}&benchmark=1${batch?'':'&batching=off'}`);
   await page.waitForTimeout(500);
   if(await page.locator('input[type=password]').isVisible()){await page.locator('input[type=password]').fill(DM_SECRET,{timeout:3000});await page.getByRole('button',{name:'Rejoin as DM',exact:true}).click({timeout:3000});}
   await expect(page.getByTestId('miniature-layer')).toHaveAttribute('data-miniature-count','27',{timeout:60000});
   await page.getByRole('button',{name:'Tilted battlefield view',exact:true}).click();
  };
  const layer=page.getByTestId('miniature-layer');
  const results=[];
  for(const batch of [false,true]){
   await enter(batch);await page.waitForTimeout(5000);
   const data=await layer.evaluate(e=>({...((e as HTMLElement).dataset)}));results.push({batch,data});
   expect(data.localShadowMethod).toBe('floor');
   expect(Number(data.shadowProxyJobs)).toBe(0);
   expect(Number(data.shadowProxyTriangles)).toBeLessThan(Number(data.shadowOriginalTriangles)*.75);
   if(batch){expect(Number(data.miniatureBatches)).toBeGreaterThan(0);expect(Number(data.batchedMeshInstances)).toBeGreaterThanOrEqual(48);}
   else {expect(Number(data.miniatureBatches)).toBe(0);expect(Number(data.batchedMeshInstances)).toBe(0);}
   await page.screenshot({path:info.outputPath(batch?'batched.png':'individual.png')});
  }
  expect(Number(results[1].data.colorDrawCalls)).toBeLessThan(Number(results[0].data.colorDrawCalls)-35);
  await page.getByRole('button',{name:'Maps',exact:true}).click();await page.locator('.map-environment-controls > summary').click();
  const select=page.getByLabel('Graphics quality',{exact:true});
  await page.evaluate(()=>{
   (window as any).qualityFrames=[];
   (window as any).qualityObserver=new MutationObserver(()=>{(window as any).qualityFrames.push(document.querySelector('[data-testid="miniature-layer"]')?.getAttribute('data-miniature-count'));});
   (window as any).qualityObserver.observe(document.querySelector('[data-testid="miniature-layer"]'),{attributes:true,attributeFilter:['data-miniature-count']});
  });
  for(const quality of ['auto','high','auto','balanced','low','high']){
   await select.selectOption(quality);await expect(layer).toHaveAttribute('data-graphics-quality',quality==='auto'?'high':quality);
   await expect(layer).toHaveAttribute('data-local-shadow-method',quality==='auto'||quality==='high'?'cube':'floor');
   if(quality==='auto')await expect(layer).toHaveAttribute('data-model-quality','original');
   await expect.poll(async()=>layer.evaluate(e=>JSON.parse((e as HTMLElement).dataset.modelUrls??'[]').filter((u:string)=>u.includes('balanced')||u.includes('light')||u.includes('sharpened-weapons')).length)).toBe(quality==='high'||quality==='auto'?0:3);
   await expect.poll(async()=>layer.evaluate(e=>JSON.parse((e as HTMLElement).dataset.activeModelUrls??'[]').filter((u:string)=>u.includes('balanced')||u.includes('light')||u.includes('sharpened-weapons')).length),{timeout:60000}).toBe(quality==='high'||quality==='auto'?0:3);
   await expect(layer).toHaveAttribute('data-miniature-count','27');
  }
  const frames=await page.evaluate(()=>{(window as any).qualityObserver.disconnect();return (window as any).qualityFrames;});
  expect(frames.every((n:string)=>n==='27')).toBe(true);
  await page.getByRole('button',{name:'Maps',exact:true}).click();
  const state=await snap(),token=state.tokens.find((t:any)=>t.kind==='monster');
  const point=await page.evaluate(id=>{const stage=(window as any).Konva.stages.find((s:any)=>s.find('.token').some((n:any)=>n.getAttr('tokenId')===id)),node=stage.find('.token').find((n:any)=>n.getAttr('tokenId')===id);const p=node.getAbsolutePosition(),r=stage.container().getBoundingClientRect(),w=stage.width(),h=stage.height(),matrix=new DOMMatrix(getComputedStyle(node.getLayer().getNativeCanvasElement()).transform),projected=new DOMPoint(p.x-w/2,p.y-h/2).matrixTransform(matrix);return {x:r.left+w/2+projected.x/projected.w,y:r.top+h/2+projected.y/projected.w};},token.id);
  await page.mouse.click(point.x,point.y);
  await expect(page.getByRole('region',{name:'Token info',exact:true})).toBeVisible();
  expect(errors).toEqual([]);
  writeFileSync(info.outputPath('performance.json'),JSON.stringify({note:'27 real tokens, desktop RTX 5090, DPR 2; identical models and environment in both modes.',results},null,2));
 }finally{socket.disconnect();await context.close();}
});

test('independent room lights remain lit through an open door and closed doors invalidate cached geometry',async({page},info)=>{
 const bundle=await build({write:false,bundle:true,format:'iife',platform:'browser',define:{'import.meta.env':'{}'},stdin:{resolveDir:process.cwd(),contents:`
 import * as T from 'three';
 import {createBattlefieldLighting} from './client/src/canvas/battlefieldLighting';
 import {createEnvironmentVisibility} from './client/src/canvas/environmentVisibility';
 import {createLocalLightShadows} from './client/src/canvas/localLightShadows';
 window.checkDoorLight=()=>{
  const renderer=new T.WebGLRenderer({preserveDrawingBuffer:true});renderer.setSize(300,160);
  const scene=new T.Scene(),key=new T.DirectionalLight(),ambient=new T.HemisphereLight();scene.add(key,ambient);
  const visibility=createEnvironmentVisibility();visibility.update({mapWidth:300,mapHeight:160});
  const depth=new T.DataTexture(new Uint8Array([255,255,255,255]),1,1);depth.needsUpdate=true;
  const shadows=createLocalLightShadows(renderer);
  const lighting=createBattlefieldLighting(scene,key,ambient,visibility.uniforms,{texture:depth,resolution:new T.Vector2(300,160)},shadows.uniforms);
  const floor=new T.Mesh(new T.PlaneGeometry(300,160),new T.MeshBasicMaterial({color:0xffffff}));floor.rotation.x=-Math.PI/2;floor.position.set(150,0,80);scene.add(floor);
  const camera=new T.OrthographicCamera(-150,150,80,-80,.1,1000);camera.position.set(150,500,80);camera.up.set(0,0,-1);camera.lookAt(150,0,80);
  const wall={id:'door',kind:'rectangle',door:true,open:false,ax:145,ay:0,bx:155,by:160};
  const lamps=[{id:'outside',x:60,y:80,radiusFt:16,heightFt:6,intensity:1,color:'warm',flicker:false},{id:'inside',x:240,y:80,radiusFt:10,heightFt:6,intensity:1,color:'warm',flicker:false}];
  const samples=[];
  for(const [open,inside] of [[true,true],[false,true],[true,false],[false,false]]){
   lighting.update({enabled:true,mapWidth:300,mapHeight:160,pixelsPerFoot:10,lighting:'dungeon',heavyDarkness:true,walls:[{...wall,open}],lights:inside?lamps:lamps.slice(0,1)});
   lighting.tick(1);lighting.renderField(renderer);renderer.render(scene,camera);
   const gl=renderer.getContext(),pixels=new Uint8Array(4);gl.readPixels(230,80,1,1,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
   samples.push({open,inside,pixel:[...pixels]});
  }
  document.body.append(renderer.domElement);lighting.dispose();shadows.dispose();visibility.dispose();depth.dispose();renderer.dispose();return samples;
 };`}});
 await page.goto('/');await page.addScriptTag({content:bundle.outputFiles[0].text});
 const samples=await page.evaluate(()=>(window as any).checkDoorLight());
 expect(samples[0].pixel[0]).toBeGreaterThan(100);expect(samples[1].pixel[0]).toBeGreaterThan(100);
 expect(samples[2].pixel[0]).toBeGreaterThan(samples[3].pixel[0]+20);
 writeFileSync(info.outputPath('door-light-samples.json'),JSON.stringify(samples,null,2));
});
