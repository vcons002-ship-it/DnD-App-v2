import {test,expect} from '@playwright/test';
import {build} from 'esbuild';
import {io} from 'socket.io-client';
import {readFileSync} from 'node:fs';
import {DM_SECRET,PORT} from './playwright.config';

test('silhouette borders preserve body visibility, reject thin blades and never paint over front bodies',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 const bundle=await build({write:false,bundle:true,format:'iife',platform:'browser',stdin:{resolveDir:process.cwd(),contents:`
 import * as T from 'three';
 import {createMiniatureVisibilityMaterial} from './client/src/canvas/miniatureVisionLift';
 import {createMiniatureSilhouetteOutline} from './client/src/canvas/miniatureSilhouetteOutline';
 const r=new T.WebGLRenderer({preserveDrawingBuffer:true});r.setSize(200,200);r.setClearColor(0,0);document.body.append(r.domElement);
 const s=new T.Scene(),c=new T.OrthographicCamera(-100,100,100,-100,.1,100);c.position.z=10;c.updateMatrixWorld();
 const mask=new T.WebGLRenderTarget(200,200);mask.texture.minFilter=mask.texture.magFilter=T.NearestFilter;mask.depthTexture=new T.DepthTexture(200,200);
 const outline=createMiniatureSilhouetteOutline(mask.texture,mask.depthTexture,{value:c.projectionMatrixInverse});
 function body(x,y,width,height,z,color,border){const m=new T.Mesh(new T.PlaneGeometry(width,height),new T.MeshBasicMaterial({color}));m.position.set(x,y,z);m.userData.outlineId=outline.slot(border);m.layers.enable(1);s.add(m);return m;}
 body(-40,0,32,32,0,'#333333','#ff0000');body(10,0,32,32,0,'#333333','#0000ff');
 body(12,0,20,24,1,'#555555',undefined);body(60,0,1,40,0,'#333333','#00ff00');
 const batchGeometry=new T.PlaneGeometry(16,16);batchGeometry.setAttribute('instanceOutline',new T.InstancedBufferAttribute(new Float32Array(['#ff0000','#00ff00','#0000ff'].map(color=>outline.slot(color))),1));
 const batch=new T.InstancedMesh(batchGeometry,new T.MeshBasicMaterial({color:'#333333'}),3);batch.layers.enable(1);
 [-40,0,40].forEach((x,i)=>batch.setMatrixAt(i,new T.Matrix4().makeTranslation(x,60,0)));s.add(batch);
 const material=createMiniatureVisibilityMaterial();s.overrideMaterial=material;c.layers.set(1);r.setRenderTarget(mask);r.clear();r.render(s,c);s.overrideMaterial=null;c.layers.set(0);
 const output=new T.WebGLRenderTarget(200,200);r.setRenderTarget(output);r.render(s,c);outline.render(r);
 const pixels=new Uint8Array(200*200*4);r.readRenderTargetPixels(output,0,0,200,200,pixels);
 const pixel=(x,y)=>Array.from(pixels.slice((y*200+x)*4,(y*200+x)*4+4));
 const maskPixels=new Uint8Array(200*200*4);r.readRenderTargetPixels(mask,0,0,200,200,maskPixels);
 window.result={batch:[pixel(51,160),pixel(91,160),pixel(131,160)],red:pixel(43,100),blue:pixel(93,100),front:pixel(112,100),thin:pixel(158,100),body:Array.from(maskPixels.slice((100*200+60)*4,(100*200+60)*4+4))};
 outline.dispose();material.dispose();mask.dispose();output.dispose();r.dispose();
 `}});
 await page.goto('about:blank');await page.addScriptTag({content:bundle.outputFiles[0].text});
 const result=await page.evaluate(()=>(window as any).result);
 expect(errors).toEqual([]);
 expect(result.red[0]).toBeGreaterThan(240);expect(result.red[1]).toBeLessThan(5);
 expect(result.blue[2]).toBeGreaterThan(240);
 expect(Math.max(...result.front.slice(0,3))-Math.min(...result.front.slice(0,3))).toBeLessThan(3);
 expect(result.thin[3]).toBe(0);
 expect(result.batch[0][0]).toBeGreaterThan(240);expect(result.batch[1][1]).toBeGreaterThan(240);expect(result.batch[2][2]).toBeGreaterThan(240);
 expect(result.body[0]).toBe(255);expect(result.body[3]).toBe(255);
});

test('real character models change detail on zoom without losing tokens, bases or visibility',async({page,request},info)=>{
 test.setTimeout(150000);const errors:string[]=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&/THREE|WebGL|shader/i.test(m.text()))errors.push(m.text());});
 const headers={'x-dm-passphrase':DM_SECRET};
 const {code}=await(await request.post('/api/sessions',{headers,data:{name:'Distance detail regression'}})).json();
 const map=await(await request.post(`/api/sessions/${code}/maps`,{headers,multipart:{name:'Courtyard',image:{name:'courtyard.png',mimeType:'image/png',buffer:readFileSync('assets/environment-preview/courtyard.png')}}})).json();
 const socket=io(`http://localhost:${PORT}`,{transports:['websocket']});
 const snap=async()=>{const r=await socket.timeout(10000).emitWithAck('join',{sessionCode:code,role:'dm',dmPassphrase:DM_SECRET});expect(r.ok).toBe(true);return r.snapshot;};
 try{
  const initial=await snap();socket.emit('map:setActive',{mapId:map.id});socket.emit('map:setGrid',{mapId:map.id,gridSizePx:64,feetPerSquare:5,widthFt:95,locked:false});
  for(const layer of ['map','tokens'])socket.emit('fog:setLayer',{mapId:map.id,layer,enabled:false});
  for(const [i,name] of ['Druk','Varis','Vanec'].entries())socket.emit('token:spawn',{mapId:map.id,kind:'pc',refId:initial.characters.find((c:any)=>c.name===name).id,x:550+i*110,y:500});
  await snap();await page.setViewportSize({width:1440,height:900});
  await page.addInitScript(()=>localStorage.setItem('dnd-environment-quality','high'));
  await page.goto(`/dm?code=${code}`);await page.locator('input[type=password]').fill(DM_SECRET);await page.getByRole('button',{name:'Rejoin as DM',exact:true}).click();
  const layer=page.getByTestId('miniature-layer');await expect(layer).toHaveAttribute('data-miniature-count','3',{timeout:60000});
  await expect(layer).toHaveAttribute('data-outline-method','silhouette');
  await expect.poll(async()=>JSON.parse((await layer.getAttribute('data-model-urls'))!).filter((u:string)=>u.includes('battlefield')).length).toBe(3);
  await page.screenshot({path:info.outputPath('battlefield-overhead.png')});
  await page.getByRole('button',{name:'Tilted battlefield view',exact:true}).click();
  await page.waitForTimeout(800);
  await page.screenshot({path:info.outputPath('battlefield-tilted.png')});
  await layer.evaluate(e=>{(window as any).lodCounts=[];new MutationObserver(()=>{(window as any).lodCounts.push(Number((e as HTMLElement).dataset.miniatureCount));}).observe(e,{attributes:true,attributeFilter:['data-miniature-count']});});
  for(let i=0;i<11;i++)await page.getByTitle('Zoom in',{exact:true}).click();
  await expect.poll(async()=>Object.values(JSON.parse((await layer.getAttribute('data-model-lods'))!)).some(l=>l==='high'),{timeout:60000}).toBe(true);
  await expect(layer).toHaveAttribute('data-miniature-count','3');
  await expect.poll(async()=>{const d=await layer.evaluate(e=>({...((e as HTMLElement).dataset)}));return d.loadedModelUrls===JSON.stringify(JSON.parse(d.modelUrls!).sort());},{timeout:60000}).toBe(true);
  await page.waitForTimeout(300);await page.screenshot({path:info.outputPath('inspection.png')});
  await page.getByTitle('Fit to window',{exact:true}).click();
  await expect.poll(async()=>JSON.parse((await layer.getAttribute('data-model-urls'))!).filter((u:string)=>u.includes('battlefield')).length).toBe(3);
  await expect(layer).toHaveAttribute('data-miniature-count','3');
  expect(await page.evaluate(()=>(window as any).lodCounts.every((n:number)=>n===3))).toBe(true);
  expect(errors).toEqual([]);
 }finally{socket.disconnect();}
});
