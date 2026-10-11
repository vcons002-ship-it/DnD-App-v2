import {test,expect} from '@playwright/test';
import {build} from 'esbuild';

test('Experimental ground-only spells exclude direct spell lights, directional mode restores them, and Low avoids source sight checks',async({page})=>{
 const bundle=await build({write:false,bundle:true,format:'iife',platform:'browser',define:{'import.meta.env':'{}'},stdin:{resolveDir:process.cwd(),contents:`
 import {DataTexture,Group,PerspectiveCamera,Vector3,Vector4} from 'three';
 import {createMiniatureTorchLighting} from './client/src/canvas/miniatureTorchLighting';
 const lighting=createMiniatureTorchLighting({uniforms:{}}),root=new Group(),camera=new PerspectiveCamera();root.position.set(20,0,30);
 const lamp={id:'lantern',x:20,y:30,height:90,radius:200,strength:1,color:new Vector3(1,.3,.1),visibleTorch:true},flash={...lamp,id:'spell',transient:true,color:new Vector3(.2,.1,1)};
 const field={torchField:{value:new DataTexture(new Uint8Array(4),1,1)},torchBounds:{value:new Vector4(0,0,400,400)}};
 lighting.update([lamp,flash],root,camera,false,[],'spells-ground');
 const balanced={count:lighting.uniforms.torchCount.value,color:lighting.uniforms.torchColors.value[0].toArray(),ground:lighting.uniforms.torchGroundEnabled.value};
 lighting.update([lamp,flash],root,camera,false,[],'directional');const high={count:lighting.uniforms.torchCount.value,slots:[...lighting.uniforms.torchShadowSlots.value]};
 const before={...lighting.cacheState};lighting.update([lamp,flash],root,camera,true,[],'ground',field);
 const low={count:lighting.uniforms.torchCount.value,ground:lighting.uniforms.torchGroundEnabled.value,point:lighting.uniforms.torchGroundPoint.value.toArray(),sameField:lighting.uniforms.torchGroundField.value===field.torchField.value,sight:{...lighting.cacheState}};
 root.position.set(60,0,70);lighting.update([lamp,flash],root,camera,true,[],'ground',field);const moved=lighting.uniforms.torchGroundPoint.value.toArray();
 lighting.update([],root,camera,true,[],'ground',field);
 window.modeResult={balanced,high,before,low,moved,emptyGround:lighting.uniforms.torchGroundEnabled.value,darkvision:lighting.uniforms.darkvisionDetail.value};
 `}});
 await page.goto('about:blank');await page.addScriptTag({content:bundle.outputFiles[0].text});
 const r=await page.evaluate(()=>(window as any).modeResult);
 expect(r.balanced).toEqual({count:1,color:[1,.3,.1],ground:0});expect(r.high.count).toBe(2);expect(r.high.slots).toContain(-2);
 expect(r.low).toEqual({count:0,ground:1,point:[20,30],sameField:true,sight:r.before});
 expect(r.moved).toEqual([60,70]);expect(r.emptyGround).toBe(0);expect(r.darkvision).toBe(1);
});

test('Low ground lighting keeps independent colors in a batch, responds to doors and movement, and stays off for shared sight',async({page},info)=>{
 const errors:string[]=[];page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.on('pageerror',e=>errors.push(e.message));
 const bundle=await build({write:false,bundle:true,format:'iife',platform:'browser',define:{'import.meta.env':'{}'},stdin:{resolveDir:process.cwd(),contents:`
 import * as T from 'three';
 import {createBattlefieldLighting} from './client/src/canvas/battlefieldLighting';
 import {createEnvironmentVisibility} from './client/src/canvas/environmentVisibility';
 import {createLocalLightShadows} from './client/src/canvas/localLightShadows';
 import {createMiniatureTorchLighting} from './client/src/canvas/miniatureTorchLighting';
 import {createMiniatureBatches} from './client/src/canvas/miniatureBatches';
 const renderer=new T.WebGLRenderer({preserveDrawingBuffer:true});renderer.setSize(600,400);document.body.append(renderer.domElement);
 const scene=new T.Scene(),groundScene=new T.Scene(),sun=new T.DirectionalLight(),ambient=new T.HemisphereLight();
 const visibility=createEnvironmentVisibility();visibility.update({mapWidth:300,mapHeight:160});
 const depth=new T.DataTexture(new Uint8Array([255,255,255,255]),1,1);depth.needsUpdate=true;
 const shadows=createLocalLightShadows(renderer),lighting=createBattlefieldLighting(groundScene,sun,ambient,visibility.uniforms,{texture:depth,resolution:new T.Vector2(600,400)},shadows.uniforms);
 const walls=[{id:'partition',kind:'rectangle',ax:145,ay:0,bx:155,by:160}];
 const lights=[{id:'red',x:50,y:60,radiusFt:18,heightFt:6,intensity:.5,color:'#ff0000',flicker:true},{id:'blue',x:240,y:60,radiusFt:18,heightFt:6,intensity:.5,color:'#0000ff',flicker:true}];
 const settings={enabled:true,mapWidth:300,mapHeight:160,pixelsPerFoot:10,lighting:'dungeon',heavyDarkness:true,walls,lights};
 const camera=new T.OrthographicCamera(-160,160,105,-105,.1,1000);camera.position.set(150,400,310);camera.lookAt(150,0,80);camera.updateMatrixWorld();
 const geometry=new T.BoxGeometry(20,30,20),figures=[50,100,200,240].map(x=>{
  const root=new T.Group(),center=new T.Group(),material=new T.MeshStandardMaterial({color:'white',roughness:1});material.userData.batchSource='ground-probe';
  const mesh=new T.Mesh(geometry,material);mesh.position.y=15;center.add(mesh);root.add(center);root.position.set(x,0,60);scene.add(root);
  const torch=createMiniatureTorchLighting(shadows.uniforms);torch.attach(material);return {root,lighting:torch,eligible:true};
 });
 const batches=createMiniatureBatches(scene),target=new T.WebGLRenderTarget(600,400);
 const draw=()=>{lighting.renderField(renderer);scene.updateMatrixWorld(true);
  for(const f of figures)f.lighting.update(lighting.lights,f.root,camera,false,walls,'ground',lighting.fieldUniforms);
  const stats=batches.update(figures,true,true,false);renderer.setRenderTarget(target);renderer.clear();renderer.render(scene,camera);
  const pixels=figures.map(f=>{const p=new T.Vector3(f.root.position.x,15,60).project(camera),data=new Uint8Array(4);renderer.readRenderTargetPixels(target,Math.round((p.x+1)*300),Math.round((p.y+1)*200),1,1,data);return [...data];});
  renderer.setRenderTarget(null);renderer.render(scene,camera);return {stats,pixels};};
 lighting.update(settings);const colored=draw();
 lighting.update({...settings,lights:[lights[0]]});const closed=draw();
 lighting.update({...settings,lights:[lights[0]],walls:[{...walls[0],door:true,open:true}]});const opened=draw();
 figures[0].root.position.x=210;const moved=draw();
 // Shared-party sight must not inherit personal ground illumination.
 for(const f of figures)f.lighting.update([],f.root,camera,true,[]);
 const shared=figures.map(f=>f.lighting.uniforms.torchGroundEnabled.value);
 window.groundResult={colored,closed,opened,moved,shared};
 `}});
 await page.goto('about:blank');await page.addScriptTag({content:bundle.outputFiles[0].text});
 const result=await page.evaluate(()=>(window as any).groundResult);
 expect(errors).toEqual([]);expect(result.colored.stats).toEqual({batches:1,instances:4});
 for(const i of [0,1])expect(result.colored.pixels[i][0]).toBeGreaterThan(result.colored.pixels[i][2]+30);
 for(const i of [2,3])expect(result.colored.pixels[i][2]).toBeGreaterThan(result.colored.pixels[i][0]+30);
 expect(result.closed.pixels[2][0]).toBeLessThan(5);
 expect(result.opened.pixels[2][0]).toBeGreaterThan(30);
 expect(result.moved.pixels[0][0]).toBeGreaterThan(30);
 expect(result.shared).toEqual([0,0,0,0]);
 await page.screenshot({path:info.outputPath('low-ground-lighting.png')});
});
