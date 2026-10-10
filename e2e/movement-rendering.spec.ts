import {test,expect} from '@playwright/test';
import {build} from 'esbuild';

test('moving a lantern updates only its wall geometry and preserves independent colored lights',async({page})=>{
 const bundle=await build({write:false,bundle:true,format:'iife',platform:'browser',define:{'import.meta.env':'{}'},stdin:{resolveDir:process.cwd(),contents:`
 import * as T from 'three';
 import {createBattlefieldLighting} from './client/src/canvas/battlefieldLighting';
 import {createEnvironmentVisibility} from './client/src/canvas/environmentVisibility';
 import {createLocalLightShadows} from './client/src/canvas/localLightShadows';
 const renderer=new T.WebGLRenderer(),scene=new T.Scene(),sun=new T.DirectionalLight(),ambient=new T.HemisphereLight();scene.add(sun,ambient);
 const visibility=createEnvironmentVisibility();visibility.update({mapWidth:300,mapHeight:160});
 const depth=new T.DataTexture(new Uint8Array([255,255,255,255]),1,1);depth.needsUpdate=true;
 const shadows=createLocalLightShadows(renderer),lighting=createBattlefieldLighting(scene,sun,ambient,visibility.uniforms,{texture:depth,resolution:new T.Vector2(300,160)},shadows.uniforms);
 const walls=[{id:'partition',kind:'rectangle',ax:145,ay:0,bx:155,by:110}];
 const settings={enabled:true,mapWidth:300,mapHeight:160,pixelsPerFoot:10,lighting:'dungeon',heavyDarkness:true,walls,lights:[
  {id:'red',x:50,y:60,radiusFt:12,heightFt:6,intensity:.3,color:'#ff0000',flicker:true},
  {id:'blue',x:240,y:60,radiusFt:12,heightFt:6,intensity:.3,color:'#0000ff',flicker:true}]};
 const carry=x=>lighting.setCarried([{id:'pc',x,y:140,height:90,fixtureHeight:30,facing:0}]);
 carry(100);lighting.update(settings);const start={...lighting.state};
 for(let i=1;i<=10;i++){carry(100+i);lighting.tick(i/60);lighting.renderField(renderer);}
 const moved={...lighting.state};
 for(let i=11;i<=20;i++){lighting.tick(i/60);lighting.renderField(renderer);}
 const flicker={...lighting.state};
 const uniforms={...lighting.fieldUniforms,uv:{value:new T.Vector2()}},readScene=new T.Scene();
 const material=new T.ShaderMaterial({uniforms,vertexShader:'void main(){gl_Position=vec4(position.xy,0.,1.);}',fragmentShader:'uniform sampler2D torchField;uniform vec2 uv;void main(){gl_FragColor=vec4(texture2D(torchField,uv).rgb,1.);}'});
 readScene.add(new T.Mesh(new T.PlaneGeometry(2,2),material));
 const target=new T.WebGLRenderTarget(1,1),camera=new T.OrthographicCamera(-1,1,1,-1,.1,2);camera.position.z=1;
 const sample=(x,y)=>{uniforms.uv.value.set(x/300,y/160);renderer.setRenderTarget(target);renderer.render(readScene,camera);const pixels=new Uint8Array(4);renderer.readRenderTargetPixels(target,0,0,1,1,pixels);renderer.setRenderTarget(null);return [...pixels];};
 const colors=[sample(50,60),sample(240,60)];
 lighting.update({...settings,walls:[{...walls[0],open:true,door:true}]});const opened={...lighting.state};
 window.lightMovement={start,moved,flicker,opened,colors};
 lighting.dispose();shadows.dispose();visibility.dispose();renderer.dispose();
 `}});
 await page.goto('about:blank');await page.addScriptTag({content:bundle.outputFiles[0].text});
 const data=await page.evaluate(()=>(window as any).lightMovement);
 expect(data.start.wallLightMeshes).toBe(3);
 expect(data.moved.wallLightGeometryUpdates-data.start.wallLightGeometryUpdates).toBe(10);
 expect(data.flicker.wallLightGeometryUpdates).toBe(data.moved.wallLightGeometryUpdates);
 expect(data.opened.wallLightGeometryUpdates-data.flicker.wallLightGeometryUpdates).toBe(3);
 expect(data.colors[0][0]).toBeGreaterThan(data.colors[0][2]+20);
 expect(data.colors[1][2]).toBeGreaterThan(data.colors[1][0]+20);
});

test('vision masks reproject in the camera frame and keep live rotation through session updates',async({page})=>{
 const bundle=await build({write:false,bundle:true,format:'iife',platform:'browser',define:{'import.meta.env':'{}'},stdin:{resolveDir:process.cwd(),contents:`
 import React from 'react';import {createRoot} from 'react-dom/client';import {flushSync} from 'react-dom';
 import {PlayerVisionOverlay} from './client/src/canvas/PlayerVisionOverlay';
 const containers=[0,1].map(()=>{const div=document.createElement('div');div.style.cssText='position:relative;width:700px;height:500px';document.body.append(div);return div;});
 const roots=containers.map(c=>createRoot(c)),handles=[React.createRef(),React.createRef()];
 const vision={rangeFt:60,radius:160,heavy:true,origins:[{id:'pc',x:180,y:160}],lights:[{id:'light',x:240,y:150,height:60,radius:90,strength:1}],walls:[{id:'wall',kind:'rectangle',ax:300,ay:20,bx:312,by:220}]};
 const props={width:700,height:500,view:{x:160,y:100,scale:1},tilt:45,rotation:0,vision,mapFogOfWar:true,terrain:{tiles:[],bounds:{x:0,y:0,w:500,h:400},explored:[[[[0,0],[300,0],[300,300],[0,300],[0,0]]]]}};
 const render=(i,p)=>flushSync(()=>roots[i].render(React.createElement(PlayerVisionOverlay,{...p,ref:handles[i]})));
 render(0,props);render(1,props);
 const paths=i=>[...containers[i].querySelectorAll('svg path')].map(p=>p.getAttribute('d')).join('|');
 const memory=i=>containers[i].querySelector('[data-testid="explored-terrain-grade"]').style.transform;
 const failures=[];let currentVision=vision;
 for(let i=0;i<80;i++){
  const camera={rotation:Math.sin(i*.4)*170,tilt:i%2?45:25,view:{x:160+i,y:100-i,scale:1+i*.005}};
  handles[0].current.camera(camera);render(1,{...props,...camera,vision:currentVision});
  if(paths(0)!==paths(1)||memory(0)!==memory(1))failures.push({i,phase:'immediate camera'});
  // A new vision snapshot arrives before the camera gesture commits its props.
  const next={...vision,origins:[{id:'pc',x:180+i*.1,y:160}]};
  render(0,{...props,vision:next});render(1,{...props,...camera,vision:next});
  if(paths(0)!==paths(1)||memory(0)!==memory(1))failures.push({i,phase:'session snapshot'});currentVision=next;
 }
 window.maskMovement={failures};roots.forEach(r=>r.unmount());
 `}});
 await page.goto('about:blank');await page.addScriptTag({content:bundle.outputFiles[0].text});
 expect(await page.evaluate(()=>(window as any).maskMovement.failures)).toEqual([]);
});

test('routine shadow refreshes are staggered without delaying door invalidation',async({page})=>{
 const bundle=await build({write:false,bundle:true,format:'iife',platform:'browser',define:{'import.meta.env':'{}'},stdin:{resolveDir:process.cwd(),contents:`
 import * as T from 'three';
 import {createLocalLightShadows} from './client/src/canvas/localLightShadows';
 import {graphicsBudget} from './shared/graphicsQuality';
 let now=0;Object.defineProperty(performance,'now',{value:()=>now,configurable:true});
 const renderer=new T.WebGLRenderer();renderer.shadowMap.enabled=true;renderer.shadowMap.autoUpdate=false;
 const scene=new T.Scene(),camera=new T.PerspectiveCamera(),shadows=createLocalLightShadows(renderer);
 const root=new T.Group(),mesh=new T.Mesh(new T.BoxGeometry(30,60,30),new T.MeshBasicMaterial());
 mesh.position.y=30;mesh.castShadow=true;root.add(mesh);root.position.set(200,0,200);scene.add(root);
 const caster={id:'pc',root,x:200,y:200,diameter:30,visible:true};
 const lights=[[100,200],[300,200],[200,100],[200,300]].map(([x,y],i)=>({id:'light'+i,x,y,height:126,radius:500,strength:1,color:new T.Vector3(1,1,1),visibleTorch:false}));
 const budget={...graphicsBudget('balanced'),localShadowLights:4};
 const render=walls=>shadows.render(renderer,scene,camera,lights,[caster],walls,true,1,budget);
 render([]);const initial=shadows.state.localShadowUpdates,steps=[];
 for(now=40;now<=160;now+=40){caster.x++;root.position.x=caster.x;const before=shadows.state.localShadowUpdates;render([]);steps.push(shadows.state.localShadowUpdates-before);}
 const beforeDoor=shadows.state.localShadowUpdates;
 render([{id:'door',kind:'rectangle',ax:400,ay:400,bx:420,by:420,door:true,open:false}]);
 window.shadowSchedule={initial,steps,doorUpdates:shadows.state.localShadowUpdates-beforeDoor,slots:lights.map(l=>l.shadowSlot)};
 shadows.dispose();renderer.dispose();
 `}});
 await page.goto('about:blank');await page.addScriptTag({content:bundle.outputFiles[0].text});
 const data=await page.evaluate(()=>(window as any).shadowSchedule);
 expect(data.initial).toBe(4);expect(data.steps).toEqual([2,2,2,2]);
 expect(data.doorUpdates).toBe(4);expect(new Set(data.slots).size).toBe(4);
});
