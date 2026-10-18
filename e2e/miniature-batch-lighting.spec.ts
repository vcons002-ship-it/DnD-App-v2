import {test,expect} from './helpers/test';
import {build} from 'esbuild';

test('batched figures preserve different torch colors, occlusion selections, darkvision, tints and body-mask IDs',async({page})=>{
  const bundle=await build({write:false,bundle:true,format:'iife',platform:'browser',define:{'import.meta.env.VITE_SHADOW_COMPARISON':'undefined'},stdin:{resolveDir:process.cwd(),contents:`
  import * as T from 'three';
  import {createMiniatureBatches} from './client/src/canvas/miniatureBatches';
  import {createMiniatureTorchLighting} from './client/src/canvas/miniatureTorchLighting';
  import {createLocalLightShadows} from './client/src/canvas/localLightShadows';
  import {createMiniatureVisibilityMaterial} from './client/src/canvas/miniatureVisionLift';
  const renderer=new T.WebGLRenderer();renderer.setSize(160,80);renderer.setClearColor(0x151515,1);
  const scene=new T.Scene(),camera=new T.OrthographicCamera(-4,4,2,-2,.1,100),target=new T.WebGLRenderTarget(160,80);
  camera.position.set(0,4,10);camera.lookAt(0,0,0);camera.updateMatrixWorld();
  const shadows=createLocalLightShadows(renderer),geometry=new T.BoxGeometry(1.5,1.5,1.5);
  const figures=[-2,2,0].map((x,i)=>{const root=new T.Group(),model=new T.Group(),material=new T.MeshStandardMaterial({color:i?'#dce5f8':'#f2dbba',roughness:.8});
    material.userData.batchSource='shared';const lighting=createMiniatureTorchLighting(shadows.uniforms);lighting.attach(material);
    const mesh=new T.Mesh(geometry,material);mesh.layers.enable(1);mesh.userData.outlineId=i+1;model.add(mesh);root.add(model);root.position.x=x;scene.add(root);
    const light={id:'light'+i,x,height:3,y:3,radius:10,strength:1,color:new T.Vector3(i?.1:1,.2,i?1:.1),visibleTorch:false};
    lighting.update(i?[light]:[],root,camera,!i,[]);return{root,lighting,eligible:true};});
  const batches=createMiniatureBatches(scene),mask=createMiniatureVisibilityMaterial();
  const pixels=()=>{renderer.setRenderTarget(target);renderer.clear();renderer.render(scene,camera);const p=new Uint8Array(160*80*4);renderer.readRenderTargetPixels(target,0,0,160,80,p);return p;};
  const plain=pixels();batches.update(figures);const batched=pixels();
  const differences=Array.from(plain,(v,i)=>Math.abs(v-batched[i]));
  scene.overrideMaterial=mask;camera.layers.set(1);const batchMask=pixels();
  batches.update(figures,false);const plainMask=pixels();
  const originalPosition=figures[0].root.position.x;figures[0].root.position.x+=.5;camera.layers.set(0);scene.overrideMaterial=null;
  figures.forEach((f,i)=>f.lighting.update([{id:'shift',x:0,y:-1,height:2,radius:10,strength:.8,color:new T.Vector3(.1,1,.1),visibleTorch:false}],f.root,camera,!!i,[]));
  const movedPlain=pixels();batches.update(figures);const movedBatch=pixels();
  batches.update(figures,false);
  figures.forEach(f=>f.lighting.update([{id:'common',x:0,y:-1,height:2,radius:10,strength:.8,color:new T.Vector3(.1,1,.1),visibleTorch:false}],f.root,camera,false,[]));
  const sharedPlain=pixels();const sharedStats=batches.update(figures,true,false,false);const sharedBatch=pixels();
  window.batchResult={mean:differences.reduce((a,b)=>a+b,0)/differences.length,max:Math.max(...differences),maskEqual:plainMask.every((v,i)=>v===batchMask[i]),
    movedMean:Array.from(movedPlain,(v,i)=>Math.abs(v-movedBatch[i])).reduce((a,b)=>a+b,0)/movedPlain.length,
    sharedMean:Array.from(sharedPlain,(v,i)=>Math.abs(v-sharedBatch[i])).reduce((a,b)=>a+b,0)/sharedPlain.length,sharedBatches:sharedStats.batches,
    moved:figures[0].root.position.x!==originalPosition,colors:plain.some((v,i)=>i%4!==3&&v>30)};
  batches.dispose();shadows.dispose();mask.dispose();geometry.dispose();target.dispose();renderer.dispose();
  `}});
  await page.goto('about:blank');await page.addScriptTag({content:bundle.outputFiles[0].text});
  const result=await page.evaluate(()=>(window as any).batchResult);
  expect(result.colors).toBe(true);expect(result.mean).toBeLessThan(.2);expect(result.max).toBeLessThanOrEqual(3);
  expect(result.maskEqual).toBe(true);expect(result.moved).toBe(true);expect(result.movedMean).toBeLessThan(.2);
  expect(result.sharedBatches).toBe(1);expect(result.sharedMean).toBeLessThan(.2);
});
