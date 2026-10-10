import {test,expect} from '@playwright/test';
import {build} from 'esbuild';

test('GPU names skip duplicate Konva paint without losing textures, tags or fallback names',async({page})=>{
 const bundle=await build({write:false,bundle:true,format:'iife',platform:'browser',stdin:{resolveDir:process.cwd(),contents:`
 import Konva from 'konva';
 import {createMiniatureNameReader,setMiniatureNamesRendered} from './client/src/canvas/miniatureNameLabels';
 const host=document.createElement('div');document.body.append(host);
 const stage=new Konva.Stage({container:host,width:400,height:300}),layer=new Konva.Layer();stage.add(layer);
 const token=new Konva.Group({name:'token',tokenId:'goblin',x:100,y:100}),hud=new Konva.Group({name:'token-upright-hud'});
 token.add(hud);layer.add(token);
 hud.add(new Konva.Text({name:'token-label',text:'Goblin',fill:'white',stroke:'black',strokeWidth:3,fontSize:18,fillAfterStrokeEnabled:true}));
 const tag=new Konva.Group({name:'token-tracking-tag',x:70});tag.add(new Konva.Text({text:'G2',fill:'white',stroke:'black',strokeWidth:3,fontSize:18}));hud.add(tag);
 const reader=createMiniatureNameReader(),before=reader(layer,()=>false)[0],pixels=c=>[...c.getContext('2d').getImageData(0,0,c.width,c.height).data];
 const beforePixels=pixels(before.canvas),paints={count:0};
 for(const text of hud.find('Text')){const original=text._sceneFunc;text._sceneFunc=function(...args){paints.count++;return original.apply(this,args);};}
 setMiniatureNamesRendered(layer,new Set(['goblin']));layer.drawScene();const hiddenPaints=paints.count;
 const after=reader(layer,()=>false)[0];token.x(130);const moved=reader(layer,()=>true)[0];
 // Typography changes must replace the GPU texture even while Konva paint is hidden.
 hud.findOne('.token-label').text('Goblin scout');const updated=reader(layer,()=>false)[0];
 setMiniatureNamesRendered(layer,new Set());layer.drawScene();
 window.namePaint={hiddenPaints,fallbackPaints:paints.count,sameCanvas:before.canvas===after.canvas,
  samePixels:JSON.stringify(beforePixels)===JSON.stringify(pixels(after.canvas)),alpha:beforePixels.some((v,i)=>i%4===3&&v>0),
  moveX:moved.points[0].x-before.points[0].x,emphasized:moved.emphasized,updated:updated.canvas!==after.canvas,
  fallbackVisible:hud.find('.token-label, .token-tracking-tag').every(n=>n.visible())};stage.destroy();
 `}});
 await page.goto('about:blank');await page.addScriptTag({content:bundle.outputFiles[0].text});
 const result=await page.evaluate(()=>(window as any).namePaint);
 expect(result.hiddenPaints).toBe(0);expect(result.fallbackPaints).toBeGreaterThanOrEqual(2);
 expect(result.sameCanvas).toBe(true);expect(result.samePixels).toBe(true);expect(result.alpha).toBe(true);
 expect(result.moveX).toBe(30);expect(result.emphasized).toBe(true);expect(result.updated).toBe(true);expect(result.fallbackVisible).toBe(true);
});

test('stationary batches keep their GPU matrices and depth mask at fractional map coordinates',async({page})=>{
 const bundle=await build({write:false,bundle:true,format:'iife',platform:'browser',stdin:{resolveDir:process.cwd(),contents:`
 import * as T from 'three';
 import {createMiniatureBatches} from './client/src/canvas/miniatureBatches';
 import {createMiniatureMaskCache} from './client/src/canvas/miniatureMaskCache';
 const scene=new T.Scene(),geometry=new T.BoxGeometry(),camera=new T.OrthographicCamera(),target=new T.WebGLRenderTarget(16,16),cache=createMiniatureMaskCache();
 const uniforms={torchCount:{value:0},darkvisionDetail:{value:0},torchShadowSlots:{value:Array(8).fill(-1)},torchPositions:{value:Array.from({length:8},()=>new T.Vector4())},torchColors:{value:Array.from({length:8},()=>new T.Vector3())}};
 const figures=Array.from({length:3},(_,i)=>{const root=new T.Group(),model=new T.Group(),material=new T.MeshBasicMaterial(),mesh=new T.Mesh(geometry,material);
  material.userData.batchSource='shared';mesh.layers.enable(1);model.add(mesh);root.add(model);root.position.set(120.1234567+i*42.654321,0,90.9876543);root.rotation.y=.37;root.scale.setScalar(31.123456);scene.add(root);
  return {root,lighting:{signature:'same',uniforms},eligible:true};});
 const batches=createMiniatureBatches(scene);batches.update(figures);cache.needsRender(target,scene,camera);
 const batch=scene.getObjectByName('batched-miniatures'),version=batch.instanceMatrix.version,extra=[];
 for(let i=0;i<20;i++){batches.restore();batches.update(figures);extra.push(cache.needsRender(target,scene,camera));}
 const idleVersion=batch.instanceMatrix.version;
 batch.instanceMatrix.needsUpdate=true;const redundantUploadDirty=cache.needsRender(target,scene,camera);
 figures[0].root.position.x+=1;batches.update(figures);const moved=cache.needsRender(target,scene,camera);
 window.batchPaint={version,idleVersion,idleDirty:extra.some(Boolean),redundantUploadDirty,moved,newVersion:batch.instanceMatrix.version};
 batches.dispose();target.dispose();geometry.dispose();
 `}});
 await page.goto('about:blank');await page.addScriptTag({content:bundle.outputFiles[0].text});
 const data=await page.evaluate(()=>(window as any).batchPaint);
 expect(data.idleVersion).toBe(data.version);expect(data.idleDirty).toBe(false);expect(data.redundantUploadDirty).toBe(false);expect(data.moved).toBe(true);expect(data.newVersion).toBeGreaterThan(data.version);
});

test('body mask reuses identical pixels and immediately refreshes pose, camera, visibility and sharing',async({page})=>{
 const bundle=await build({write:false,bundle:true,format:'iife',platform:'browser',stdin:{resolveDir:process.cwd(),contents:`
 import * as T from 'three';
 import {createMiniatureMaskCache} from './client/src/canvas/miniatureMaskCache';
 import {createMiniatureVisibilityMaterial} from './client/src/canvas/miniatureVisionLift';
 const renderer=new T.WebGLRenderer(),scene=new T.Scene(),camera=new T.OrthographicCamera(-4,4,4,-4,.1,100);
 camera.position.z=10;camera.lookAt(0,0,0);camera.layers.set(1);
 const root=new T.Group(),model=new T.Group(),body=new T.Mesh(new T.BoxGeometry(2,2,2),new T.MeshBasicMaterial());
 body.layers.enable(1);model.add(body);root.add(model);scene.add(root);
 const target=new T.WebGLRenderTarget(16,16),mask=createMiniatureMaskCache(),material=createMiniatureVisibilityMaterial();scene.overrideMaterial=material;
 let rendered=0;
 const pixels=()=>{const p=new Uint8Array(16*16*4);renderer.readRenderTargetPixels(target,0,0,16,16,p);return [...p];};
 const refresh=()=>{if(mask.needsRender(target,scene,camera)){renderer.setRenderTarget(target);renderer.setClearColor(0,0);renderer.clear();renderer.render(scene,camera);rendered++;}return pixels();};
 const initial=refresh();for(let i=0;i<20;i++)refresh();const idle=rendered;
 root.position.x=2;const moved=refresh();const movedCount=rendered;
 camera.position.x=2;camera.lookAt(2,0,0);const cameraPixels=refresh();const cameraCount=rendered;
 root.visible=false;const hidden=refresh();const hiddenCount=rendered;root.visible=true;refresh();
 body.layers.enable(4);const shared=refresh();const sharedCount=rendered;
 const mirror=new T.Sprite(new T.SpriteMaterial());mirror.layers.set(6);root.add(mirror);
 const mirrorsDirty=mask.needsRender(target,scene,camera);if(mirrorsDirty)rendered++;const mirrorsCount=rendered;
 // Only visible body-pose animation matters; light/material animation does not.
 model.rotation.y=.3;refresh();model.rotation.y=.6;refresh();const animationCount=rendered;
 body.material.color.set('red');refresh();const materialCount=rendered;
 model.position.y=1;refresh();const modelCount=rendered;
 target.setSize(20,20);if(mask.needsRender(target,scene,camera))rendered++;const resizeCount=rendered;
 const replacement=new T.Group();root.remove(model);root.add(replacement);if(mask.needsRender(target,scene,camera))rendered++;
 window.maskPaint={idle,movedCount,cameraCount,hiddenCount,sharedCount,mirrorsCount,animationCount,materialCount,modelCount,resizeCount,replacementCount:rendered,
  moved:JSON.stringify(initial)!==JSON.stringify(moved),cameraChanged:JSON.stringify(moved)!==JSON.stringify(cameraPixels),
  hiddenEmpty:hidden.every(v=>v===0),sharedHasBody:shared.some((v,i)=>i%4===1&&v>0),sharedPersonalEmpty:shared.every((v,i)=>i%4!==0||v===0)};
 target.dispose();material.dispose();body.geometry.dispose();body.material.dispose();renderer.dispose();
 `}});
 await page.goto('about:blank');await page.addScriptTag({content:bundle.outputFiles[0].text});
 const data=await page.evaluate(()=>(window as any).maskPaint);
 expect(data).toMatchObject({idle:1,movedCount:2,cameraCount:3,hiddenCount:4,sharedCount:6,mirrorsCount:7,animationCount:9,materialCount:9,modelCount:10,resizeCount:11,replacementCount:12,
  moved:true,cameraChanged:true,hiddenEmpty:true,sharedHasBody:true,sharedPersonalEmpty:true});
});
