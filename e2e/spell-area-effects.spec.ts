import {test,expect} from '@playwright/test';
import {build} from 'esbuild';

test('Burning Hands renders a caster-origin full cone in overhead, tilted and reduced views',async({page})=>{
 const errors:string[]=[];page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.on('pageerror',e=>errors.push(e.message));
 const bundle=await build({write:false,bundle:true,format:'iife',platform:'browser',stdin:{resolveDir:process.cwd(),contents:`
 import {Scene,PerspectiveCamera,WebGLRenderer,Vector3,Matrix4} from 'three';import {createSpellImpactEffects} from './client/src/canvas/spellImpactEffects';
 const scene=new Scene(),effects=createSpellImpactEffects(scene),event={id:1,tokenId:'area',x:0,y:0,diameter:15,event:{kind:'pc',refId:'mage',delta:0,effect:'spell-area',spell:'Burning Hands',areaPosition:{mapId:'map',x:0,y:0,radiusFt:7.5,end:{x:0,y:15}}}};
 effects.sync([event],0);const renderer=new WebGLRenderer({alpha:true,preserveDrawingBuffer:true});renderer.setSize(512,512);document.body.append(renderer.domElement);const camera=new PerspectiveCamera(45,1,.1,300);camera.layers.set(7);
 const results=[];
 for(const [px,top,reduced] of [[1,false,false],[2,true,false],[1,false,true]]){
  event.event.areaPosition.end.y=15*px;event.diameter=15*px;effects.sync([event],0);
  const lights=effects.tick(450,px,reduced,()=>({x:0,y:0,visible:true,height:6*px}));camera.position.set(top?0:20*px,top?35*px:22*px,top?7.51*px:30*px);camera.lookAt(0,0,7.5*px);renderer.render(scene,camera);
  const front=scene.getObjectByName('burning-hands-cone'),embers=scene.getObjectByName('burning-hands-embers');front.updateMatrixWorld(true);
  const tip=front.localToWorld(new Vector3(1,0,0)),edge=front.localToWorld(new Vector3(1,0,.5)),positions=[],matrix=new Matrix4();
  for(let i=0;i<embers.count;i++){embers.getMatrixAt(i,matrix);const p=new Vector3().setFromMatrixPosition(matrix);positions.push({x:p.x,z:p.z});}
  const gl=renderer.getContext(),pixels=new Uint8Array(512*512*4);gl.readPixels(0,0,512,512,gl.RGBA,gl.UNSIGNED_BYTE,pixels);let colored=0;for(let i=0;i<pixels.length;i+=4)if(pixels[i+3]>10)colored++;
  results.push({tip:tip.toArray(),edge:edge.toArray(),count:embers.count,positions,calls:renderer.info.render.calls,lights:lights.length,colored,error:gl.getError(),px});
 }
 window.result=results;effects.tick(1800,1,false,()=>({x:0,y:0,visible:true}));window.expired=!effects.active;effects.dispose();renderer.dispose();
 `}});
 await page.goto('about:blank');await page.addScriptTag({content:bundle.outputFiles[0].text});const r=await page.evaluate(()=>(window as any).result);
 expect(errors).toEqual([]);expect(await page.evaluate(()=>(window as any).expired)).toBe(true);expect(r.map((v:any)=>v.count)).toEqual([72,72,24]);
 for(const view of r){
  expect(view.tip[0]).toBeCloseTo(0);expect(view.tip[2]/view.px).toBeCloseTo(15);expect(Math.abs(view.edge[0])/view.px).toBeCloseTo(7.5);
  expect(view.calls).toBe(3);expect(view.colored).toBeGreaterThan(1500);expect(view.error).toBe(0);
  for(const p of view.positions){expect(p.x).toBeGreaterThanOrEqual(0);expect(p.x).toBeLessThanOrEqual(1);expect(Math.abs(p.z)).toBeLessThanOrEqual(p.x/2+.00001);}
 }
 expect(r.map((v:any)=>v.lights)).toEqual([3,3,0]);
});

test('Lightning Bolt follows the full aimed line at waist height, renders in both views and expires',async({page})=>{
 const errors:string[]=[];page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.on('pageerror',e=>errors.push(e.message));
 const bundle=await build({write:false,bundle:true,format:'iife',platform:'browser',stdin:{resolveDir:process.cwd(),contents:`
 import {Scene,Vector3,PerspectiveCamera,WebGLRenderer} from 'three';import {createSpellImpactEffects} from './client/src/canvas/spellImpactEffects';
 const scene=new Scene(),effects=createSpellImpactEffects(scene),event={id:1,tokenId:'area',x:10,y:20,diameter:5,event:{kind:'pc',refId:'mage',delta:0,effect:'spell-area',spell:'Lightning Bolt',areaPosition:{mapId:'map',x:10,y:20,radiusFt:2.5,end:{x:10,y:120}}}};
 effects.sync([event],0);const lights=effects.tick(200,1,false,()=>({x:10,y:20,visible:true,height:6}));
 const root=scene.children[0],shape=root.children[1];root.updateMatrixWorld(true);
 const start=shape.localToWorld(new Vector3(0,0,0)).toArray(),end=shape.localToWorld(new Vector3(1,0,0)).toArray();
 const scales=[1,2,10].map(px=>{const lights=effects.tick(200,px,false,()=>({x:10,y:20,visible:true,height:6}));root.updateMatrixWorld(true);return {px,height:shape.localToWorld(new Vector3()).y,lightHeights:lights.map(l=>l.height)};});
 const camera=new PerspectiveCamera(45,1,.1,300),renderer=new WebGLRenderer({alpha:true,preserveDrawingBuffer:true});renderer.setSize(256,256);document.body.append(renderer.domElement);camera.layers.set(7);
 const views=[];
 for(const [x,y,z,reduced] of [[10,145,70,false],[100,110,70,false],[10,145,70,true]]){
  camera.position.set(x,y,z);camera.lookAt(10,4,70);effects.tick(440,1,reduced,()=>({x:10,y:20,visible:true,height:6}));renderer.render(scene,camera);
  const gl=renderer.getContext(),pixels=new Uint8Array(256*256*4);gl.readPixels(0,0,256,256,gl.RGBA,gl.UNSIGNED_BYTE,pixels);let colored=0;
  for(let i=0;i<pixels.length;i+=4)if(pixels[i+3]>20)colored++;views.push({colored,error:gl.getError()});
 }
 effects.tick(1400,1,false,()=>({x:10,y:20,visible:true,height:6}));window.result={start,end,scales,lights:lights.map(l=>({x:l.x,y:l.y,height:l.height})),parts:shape.children.length,views,expired:!effects.active};effects.dispose();renderer.dispose();
 `}});
 await page.goto('about:blank');await page.addScriptTag({content:bundle.outputFiles[0].text});const r=await page.evaluate(()=>(window as any).result);
 expect(errors).toEqual([]);expect(r.start[0]).toBeCloseTo(10);expect(r.start[1]).toBeCloseTo(2.5);expect(r.start[2]).toBeCloseTo(20);
 expect(r.end[0]).toBeCloseTo(10);expect(r.end[1]).toBeCloseTo(2.5);expect(r.end[2]).toBeCloseTo(120);expect(r.parts).toBe(3);expect(r.expired).toBe(true);
 expect(r.lights).toHaveLength(3);expect(r.lights.map((l:any)=>l.y)).toEqual([35,70,105]);
 for(const light of r.lights)expect(light.height).toBeCloseTo(2.5);
 for(const scale of r.scales){expect(scale.height/scale.px).toBeCloseTo(2.5);for(const height of scale.lightHeights)expect(height/scale.px).toBeCloseTo(2.5);}
 for(const view of r.views){expect(view.error).toBe(0);expect(view.colored).toBeGreaterThan(20);}
});

test('Ice Storm fills its chosen disk with bounded instanced hail and frost in tilted, overhead and reduced views',async({page})=>{
 const errors:string[]=[];page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.on('pageerror',e=>errors.push(e.message));
 const bundle=await build({write:false,bundle:true,format:'iife',platform:'browser',stdin:{resolveDir:process.cwd(),contents:`
 import {Scene,PerspectiveCamera,WebGLRenderer,Matrix4,Vector3} from 'three';import {createSpellImpactEffects} from './client/src/canvas/spellImpactEffects';
 const scene=new Scene(),effects=createSpellImpactEffects(scene),event={id:1,tokenId:'area',x:100,y:100,diameter:40,event:{kind:'pc',refId:'mage',delta:0,effect:'spell-area',spell:'Ice Storm',areaPosition:{mapId:'map',x:100,y:100,radiusFt:20}}};
 effects.sync([event],0);const camera=new PerspectiveCamera(45,1,.1,300),renderer=new WebGLRenderer({alpha:true,preserveDrawingBuffer:true});renderer.setSize(256,256);document.body.append(renderer.domElement);camera.layers.set(7);
 const views=[];
 for(const [y,z,reduced] of [[55,135,false],[65,100.01,false],[55,135,true]]){
  camera.position.set(100,y,z);camera.lookAt(100,0,100);const lights=effects.tick(650,1,reduced,()=>({x:100,y:100,visible:true,height:6}));renderer.render(scene,camera);
  const hail=scene.getObjectByName('ice-storm-hail'),chips=scene.getObjectByName('ice-storm-splinters'),frost=scene.getObjectByName('ice-storm-frost'),matrix=new Matrix4(),point=new Vector3(),positions=[];
  hail.updateMatrixWorld(true);for(let i=0;i<hail.count;i++){hail.getMatrixAt(i,matrix);point.setFromMatrixPosition(matrix).applyMatrix4(hail.matrixWorld);positions.push({r:Math.hypot(point.x-100,point.z-100),x:point.x,z:point.z,y:point.y});}
  const gl=renderer.getContext(),pixels=new Uint8Array(256*256*4);gl.readPixels(0,0,256,256,gl.RGBA,gl.UNSIGNED_BYTE,pixels);let colored=0;
  for(let i=0;i<pixels.length;i+=4)if(pixels[i+3]>10)colored++;
  views.push({colored,error:gl.getError(),count:hail.count,chips:chips.count,calls:renderer.info.render.calls,positions,floorScale:frost.getWorldScale(new Vector3()).x,lights:lights.length});
 }
 effects.tick(2500,1,false,()=>({x:100,y:100,visible:true}));window.result={views,expired:!effects.active};effects.dispose();renderer.dispose();
 `}});
 await page.goto('about:blank');await page.addScriptTag({content:bundle.outputFiles[0].text});const r=await page.evaluate(()=>(window as any).result);
 expect(errors).toEqual([]);expect(r.expired).toBe(true);
 expect(r.views.map((v:any)=>v.count)).toEqual([96,96,32]);expect(r.views.map((v:any)=>v.chips)).toEqual([384,384,128]);
 for(const v of r.views){
  expect(v.error).toBe(0);expect(v.colored).toBeGreaterThan(1000);expect(v.calls).toBeLessThanOrEqual(4);expect(v.floorScale).toBeCloseTo(40);
  expect(v.positions.some((p:any)=>p.x<90)).toBe(true);expect(v.positions.some((p:any)=>p.x>110)).toBe(true);
  expect(v.positions.some((p:any)=>p.z<90)).toBe(true);expect(v.positions.some((p:any)=>p.z>110)).toBe(true);
  for(const p of v.positions)expect(p.r).toBeLessThan(20);
 }
 expect(r.views[0].lights).toBe(3);expect(r.views[2].lights).toBe(0);
});

test('Fireball travels from its caster before one full-radius explosion; Call Lightning strikes stay inside the selected radius',async({page})=>{
 const bundle=await build({write:false,bundle:true,format:'iife',platform:'browser',stdin:{resolveDir:process.cwd(),contents:`
 import {Scene,Vector3,Box3} from 'three';import {createSpellImpactEffects} from './client/src/canvas/spellImpactEffects';
 const scene=new Scene(),effects=createSpellImpactEffects(scene),event={id:1,tokenId:'area',x:100,y:100,diameter:40,event:{kind:'pc',refId:'mage',delta:0,spell:'Fireball',areaPosition:{mapId:'map',x:100,y:100,radiusFt:20},sourcePosition:{mapId:'map',x:0,y:100}}};
 const position=()=>({x:100,y:100,visible:true,height:6});effects.sync([event],0);
 const read=()=>{const root=scene.children[0],shape=root.children[1],front=shape.getObjectByName('fireball-continuous-front'),crest=shape.getObjectByName('fireball-flame-crest');root.updateMatrixWorld(true);return {orb:shape.children[0].visible,orbX:shape.children[0].getWorldPosition(new Vector3()).x,explosion:front.visible,frontRadius:front.scale.x*root.scale.x,crest:crest.visible,crestRadius:crest.scale.x*root.scale.x,fronts:shape.children.filter(m=>m.name==='fireball-continuous-front').length,parts:shape.children.length};};
 const lights=effects.tick(120,1,false,position),early=read();effects.tick(480,1,false,position);const late=read();effects.tick(980,1,false,position);const expanding=read();const explosionLights=effects.tick(1280,1,false,position);const exploded=read();effects.tick(2200,1,false,position);const expired=!effects.active;
 effects.sync([{...event,id:2,event:{kind:'pc',refId:'mage',delta:0,spell:'Call Lightning',areaPosition:{mapId:'map',x:100,y:100,radiusFt:5}},diameter:10}],2300);effects.tick(2500,1,false,position);
 const lightning=scene.children[0],shape=lightning.children[1];lightning.updateMatrixWorld(true);
 const positions=shape.children.map(m=>m.getWorldPosition(new Vector3())).map(p=>Math.hypot(p.x-100,p.z-100));
 window.result={early,late,expanding,exploded,expired,lights:lights.length,explosionLights:explosionLights.map(l=>Math.hypot(l.x-100,l.y-100)),maxRadius:Math.max(...positions),minRadius:Math.min(...positions),count:positions.length};effects.dispose();
 `}});
 await page.goto('about:blank');await page.addScriptTag({content:bundle.outputFiles[0].text});
 const r=await page.evaluate(()=>(window as any).result);
 expect(r.early.orb).toBe(true);expect(r.early.orbX).toBeCloseTo(20);expect(r.early.explosion).toBe(false);
 expect(r.late.orbX).toBeCloseTo(80);expect(r.exploded.orb).toBe(false);expect(r.exploded.explosion).toBe(true);
 expect(r.exploded.frontRadius).toBeCloseTo(20);expect(r.expired).toBe(true);expect(r.lights).toBeGreaterThan(0);
 expect(r.expanding.frontRadius).toBeGreaterThan(10);expect(r.expanding.frontRadius).toBeLessThan(20);
 expect(r.exploded.fronts).toBe(1);expect(r.exploded.parts).toBe(17);
 expect(r.early.crest).toBe(false);expect(r.expanding.crest).toBe(true);
 expect(r.expanding.crestRadius).toBe(r.expanding.frontRadius);expect(r.exploded.crestRadius).toBe(r.exploded.frontRadius);
 expect(r.explosionLights).toHaveLength(3);for(const radius of r.explosionLights)expect(radius).toBeCloseTo(13);
 expect(r.count).toBe(14);expect(r.minRadius).toBe(0);expect(r.maxRadius).toBeGreaterThan(4);expect(r.maxRadius).toBeLessThan(5);
});

test('Fireball renders a filled dome from overhead and oblique views without shader errors',async({page})=>{
 const errors:string[]=[];page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.on('pageerror',e=>errors.push(e.message));
 const bundle=await build({write:false,bundle:true,format:'iife',platform:'browser',stdin:{resolveDir:process.cwd(),contents:`
 import {Scene,PerspectiveCamera,WebGLRenderer} from 'three';import {createSpellImpactEffects} from './client/src/canvas/spellImpactEffects';
 const scene=new Scene(),camera=new PerspectiveCamera(45,1,.1,100),renderer=new WebGLRenderer({alpha:true,preserveDrawingBuffer:true});renderer.setSize(128,128);document.body.append(renderer.domElement);camera.layers.set(7);
 const effects=createSpellImpactEffects(scene),event={id:1,tokenId:'area',x:0,y:0,diameter:10,event:{kind:'pc',refId:'mage',delta:0,spell:'Fireball',areaPosition:{mapId:'map',x:0,y:0,radiusFt:5}}};effects.sync([event],0);
 const results=[];
 for(const [x,y,z,reduced] of [[0,16,.01,false],[0,12,12,false],[0,16,.01,true]]){
  camera.position.set(x,y,z);camera.lookAt(0,0,0);effects.tick(1120,1,reduced,()=>({x:0,y:0,visible:true,height:5}));renderer.render(scene,camera);
  const gl=renderer.getContext(),pixel=new Uint8Array(4);gl.readPixels(64,64,1,1,gl.RGBA,gl.UNSIGNED_BYTE,pixel);results.push({pixel:[...pixel],error:gl.getError()});
 }
 window.result=results;effects.dispose();renderer.dispose();
 `}});
 await page.goto('about:blank');await page.addScriptTag({content:bundle.outputFiles[0].text});
 const r=await page.evaluate(()=>(window as any).result);expect(errors).toEqual([]);
 for(const view of r){expect(view.error).toBe(0);expect(view.pixel[3]).toBeGreaterThan(30);expect(view.pixel[0]).toBeGreaterThan(view.pixel[2]);}
});
