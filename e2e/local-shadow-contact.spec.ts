import {test,expect} from '@playwright/test';
import {build} from 'esbuild';

test('local shadows touch grounded bases at near and far distances and different map scales',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  const bundle=await build({write:false,bundle:true,format:'iife',platform:'browser',
    define:{'import.meta.env.VITE_SHADOW_COMPARISON':'"full"'},stdin:{resolveDir:process.cwd(),contents:`
    import * as THREE from 'three';
    import {createLocalLightShadows,localShadowGlsl} from './client/src/canvas/localLightShadows';
    import {graphicsBudget} from './shared/graphicsQuality';
    const renderer=new THREE.WebGLRenderer();renderer.shadowMap.enabled=true;
    renderer.shadowMap.type=THREE.PCFShadowMap;renderer.shadowMap.autoUpdate=false;
    const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(50,1,.5,10000);
    const shadows=createLocalLightShadows(renderer);
    const samplePoint={value:new THREE.Vector3()};
    const material=new THREE.ShaderMaterial({uniforms:{...shadows.uniforms,samplePoint},
      vertexShader:'void main(){gl_Position=vec4(position.xy,0.,1.);}',
      fragmentShader:localShadowGlsl+'uniform vec3 samplePoint;void main(){float v=localLightVisibility(0.,samplePoint,1.);gl_FragColor=vec4(v,v,v,1.);}'});
    const sampleScene=new THREE.Scene();sampleScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2,2),material));
    const sampleCamera=new THREE.OrthographicCamera(-1,1,1,-1,.1,2);sampleCamera.position.z=1;
    const target=new THREE.WebGLRenderTarget(1,1),pixel=new Uint8Array(4);
    function sample(x,y){samplePoint.value.set(x,.1,y);renderer.setRenderTarget(target);renderer.render(sampleScene,sampleCamera);renderer.readRenderTargetPixels(target,0,0,1,1,pixel);renderer.setRenderTarget(null);return pixel[0]/255;}
    const results=[];
    for(const quality of ['high','balanced','low'])for(const scale of [.5,1,2,10])for(const height of [60,126]){
      const casters=[180,500].map((x,i)=>{const root=new THREE.Group();root.position.set(x*scale,0,100*scale);
        const base=new THREE.Mesh(new THREE.BoxGeometry(40*scale,20*scale,40*scale),new THREE.MeshBasicMaterial());
        base.position.y=10*scale;base.castShadow=true;root.add(base);scene.add(root);
        return {id:String(i),root,x:x*scale,y:100*scale,diameter:40*scale,visible:true};});
      const light={id:'torch',x:60*scale,y:100*scale,height:height*scale,radius:700*scale,strength:1,color:new THREE.Vector3(1,1,1),visibleTorch:false};
      const walls=[];
      shadows.render(renderer,scene,camera,[light],casters,walls,true,1,graphicsBudget(quality));
      const updates=shadows.state.localShadowUpdates;
      shadows.render(renderer,scene,camera,[{...light,strength:.8}],casters,walls,true,1,graphicsBudget(quality));
      results.push({quality,scale,height,near:sample(202*scale,100*scale),far:sample(522*scale,100*scale),clear:sample(100*scale,100*scale),updates,idleUpdates:shadows.state.localShadowUpdates});
      for(const c of casters){scene.remove(c.root);c.root.children[0].geometry.dispose();c.root.children[0].material.dispose();}
    }
    window.shadowContacts=results;
    shadows.dispose();target.dispose();material.dispose();sampleScene.children[0].geometry.dispose();renderer.dispose();
  `}});
  await page.goto('about:blank');await page.addScriptTag({content:bundle.outputFiles[0].text});
  const results=await page.evaluate(()=>(window as any).shadowContacts);
  expect(errors).toEqual([]);expect(results).toHaveLength(24);
  for(const result of results){
    expect(result.near,JSON.stringify(result)).toBeLessThan(.4);
    expect(result.far,JSON.stringify(result)).toBeLessThan(.4);
    expect(result.clear,JSON.stringify(result)).toBeGreaterThan(.98);
    expect(result.idleUpdates).toBe(result.updates);
  }
  expect(errors).toEqual([]);
});

test('batched creature shadows remain continuous across movement and stationary cache transfers',async({page})=>{
 const bundle=await build({write:false,bundle:true,format:'iife',platform:'browser',define:{'import.meta.env.VITE_SHADOW_COMPARISON':'"full"'},stdin:{resolveDir:process.cwd(),contents:`
 import * as T from 'three';
 import {createLocalLightShadows,localShadowGlsl} from './client/src/canvas/localLightShadows';
 import {createMiniatureBatches} from './client/src/canvas/miniatureBatches';
 import {graphicsBudget} from './shared/graphicsQuality';
 let now=0;Object.defineProperty(performance,'now',{value:()=>now,configurable:true});
 const renderer=new T.WebGLRenderer();renderer.shadowMap.enabled=true;renderer.shadowMap.autoUpdate=false;
 const scene=new T.Scene(),camera=new T.PerspectiveCamera(),shadows=createLocalLightShadows(renderer),batches=createMiniatureBatches(scene);
 const lights=[{id:'left',x:40,y:100},{id:'right',x:600,y:100},{id:'lantern',x:420,y:180,carried:true}].map(l=>({...l,height:126,radius:500,strength:1,color:new T.Vector3(1,1,1),visibleTorch:false}));
 const geometry=new T.BoxGeometry(40,60,40),bodyMaterial=new T.MeshBasicMaterial();bodyMaterial.userData.batchSource='shared';
 const casters=[220,360,500].map((x,i)=>{const root=new T.Group(),body=new T.Group(),mesh=new T.Mesh(geometry,bodyMaterial);mesh.position.y=30;mesh.castShadow=true;body.add(mesh);root.add(body);root.position.set(x,0,100);scene.add(root);return {id:String(i),root,x,y:100,diameter:40,visible:true};});
 const lighting={signature:'same',uniforms:{torchCount:{value:0},darkvisionDetail:{value:0},torchShadowSlots:{value:Array(8).fill(-1)},torchPositions:{value:Array.from({length:8},()=>new T.Vector4())},torchColors:{value:Array.from({length:8},()=>new T.Vector3())}}};
 const samplePoint={value:new T.Vector3()},sampleSlot={value:0};
 const material=new T.ShaderMaterial({uniforms:{...shadows.uniforms,samplePoint,sampleSlot},vertexShader:'void main(){gl_Position=vec4(position.xy,0.,1.);}',fragmentShader:localShadowGlsl+'uniform vec3 samplePoint;uniform float sampleSlot;void main(){float v=localLightVisibility(sampleSlot,samplePoint,1.);gl_FragColor=vec4(v,v,v,1.);}'});
 const sampleScene=new T.Scene();sampleScene.add(new T.Mesh(new T.PlaneGeometry(2,2),material));
 const sampleCamera=new T.OrthographicCamera(-1,1,1,-1,.1,2);sampleCamera.position.z=1;
 const target=new T.WebGLRenderTarget(1,1),pixel=new Uint8Array(4),failures=[];
 let maxBatches=0;
 for(const quality of ['balanced','high','low'])for(now=0;now<1800;now+=16){
  casters[1].x=now<480?360+now*.1:now<1000?408:408-(Math.min(now-1000,480))*.1;
  casters[1].root.position.x=casters[1].x;
  lights[2].x=casters[1].x+60;
  // Snapshot/placement work occasionally restores source layers. Normal frames
  // keep them on layer 7 while the visible instanced replacement uses layer 0.
  if(now%336===0)batches.restore();
  shadows.render(renderer,scene,camera,lights,casters,[],true,1,graphicsBudget(quality));
  maxBatches=Math.max(maxBatches,batches.update(casters.map(c=>({root:c.root,eligible:true,lighting}))).batches);
  for(const light of lights.filter(l=>l.shadowSlot>=0))for(const caster of casters){
   samplePoint.value.set(caster.x+(caster.x-light.x)*.4,.1,caster.y+(caster.y-light.y)*.4);sampleSlot.value=light.shadowSlot;
   renderer.setRenderTarget(target);renderer.render(sampleScene,sampleCamera);renderer.readRenderTargetPixels(target,0,0,1,1,pixel);renderer.setRenderTarget(null);
   if(pixel[0]>100)failures.push({quality,now,light:light.id,caster:caster.id,value:pixel[0],slot:light.shadowSlot});
  }
 }
 window.shadowContinuity={failures,maxBatches};batches.dispose();shadows.dispose();renderer.dispose();
 `}});
 await page.goto('about:blank');await page.addScriptTag({content:bundle.outputFiles[0].text});
 const data=await page.evaluate(()=>(window as any).shadowContinuity);
 expect(data.maxBatches).toBeGreaterThan(0);expect(data.failures).toEqual([]);
});

test('floor masks reuse stationary geometry during movement and invalidate immediately for doors',async({page})=>{
 const bundle=await build({write:false,bundle:true,format:'iife',platform:'browser',define:{'import.meta.env.VITE_SHADOW_COMPARISON':'"full"'},stdin:{resolveDir:process.cwd(),contents:`
 import * as T from 'three';
 import {createLocalLightShadows} from './client/src/canvas/localLightShadows';
 import {graphicsBudget} from './shared/graphicsQuality';
 let now=0;Object.defineProperty(performance,'now',{value:()=>now,configurable:true});
 const renderer=new T.WebGLRenderer();renderer.shadowMap.enabled=true;renderer.shadowMap.autoUpdate=false;
 const scene=new T.Scene(),camera=new T.PerspectiveCamera(),shadows=createLocalLightShadows(renderer);
 const light={id:'torch',x:60,y:100,height:126,radius:500,strength:1,color:new T.Vector3(1,1,1),visibleTorch:false};
 const casters=[220,360].map((x,i)=>{const root=new T.Group(),mesh=new T.Mesh(new T.BoxGeometry(30,60,30),new T.MeshBasicMaterial());mesh.position.y=30;mesh.castShadow=true;root.add(mesh);root.position.set(x,0,100);scene.add(root);return {id:String(i),root,x,y:100,diameter:30,visible:true};});
 let walls=[];const render=()=>shadows.render(renderer,scene,camera,[light],casters,walls,true,1,graphicsBudget('balanced'));
 render();const initial={...shadows.state};
 for(now=16;now<=128;now+=16){casters[1].x+=2;casters[1].root.position.x=casters[1].x;render();}
 const moving={...shadows.state};
 now=400;render();const stopped={...shadows.state};
 now=416;camera.position.x+=20;light.strength=.8;walls=[];render();const idle={...shadows.state};
 // A newly closed door blocks the moving caster, even though 33 ms have not elapsed.
 now=417;walls=[{id:'door',kind:'rectangle',door:true,open:false,ax:300,ay:0,bx:310,by:250}];render();const door={...shadows.state};
 window.floorCache={initial,moving,stopped,idle,door};shadows.dispose();renderer.dispose();
 `}});
 await page.goto('about:blank');await page.addScriptTag({content:bundle.outputFiles[0].text});
 const data=await page.evaluate(()=>(window as any).floorCache);
 expect(data.initial.localShadowStaticUpdates).toBe(1);
 expect(data.moving.localShadowStaticUpdates).toBe(2);
 expect(data.moving.localShadowDynamicUpdates).toBeGreaterThan(1);
 expect(data.moving.localShadowUpdates).toBeLessThan(7);
 expect(data.stopped.localShadowStaticUpdates).toBe(3);
 expect(data.idle.localShadowUpdates).toBe(data.stopped.localShadowUpdates);
 expect(data.door.localShadowUpdates).toBe(data.idle.localShadowUpdates+1);
 expect(JSON.parse(data.door.localShadowCasters)).toEqual({torch:['0']});
});


test('directional shadows survive batching and repeated snapshot restores over the whole frame',async({page})=>{
 const bundle=await build({write:false,bundle:true,format:'iife',platform:'browser',stdin:{resolveDir:process.cwd(),contents:`
 import * as T from 'three';
 import {createMiniatureBatches} from './client/src/canvas/miniatureBatches';
 const renderer=new T.WebGLRenderer();renderer.setSize(200,200);renderer.shadowMap.enabled=true;renderer.shadowMap.autoUpdate=false;renderer.shadowMap.type=T.PCFShadowMap;
 const scene=new T.Scene();scene.background=new T.Color(0xffffff);
 const camera=new T.OrthographicCamera(-260,260,260,-260,1,2000);camera.position.set(0,650,350);camera.lookAt(0,0,0);
 const sun=new T.DirectionalLight(0xffffff,3);sun.position.set(-300,350,-300);sun.castShadow=true;sun.shadow.mapSize.set(512,512);
 Object.assign(sun.shadow.camera,{left:-500,right:500,top:500,bottom:-500,near:1,far:1500});sun.shadow.camera.updateProjectionMatrix();scene.add(sun,new T.AmbientLight(0xffffff,.25));
 const floor=new T.Mesh(new T.PlaneGeometry(1000,1000),new T.MeshStandardMaterial({color:0xffffff}));floor.rotation.x=-Math.PI/2;floor.receiveShadow=true;scene.add(floor);
 const geometry=new T.BoxGeometry(30,60,30),material=new T.MeshStandardMaterial({color:0xffffff});material.userData.batchSource='shared';
 const lighting={signature:'same',uniforms:{torchCount:{value:0},darkvisionDetail:{value:0},torchShadowSlots:{value:Array(8).fill(-1)},torchPositions:{value:Array.from({length:8},()=>new T.Vector4())},torchColors:{value:Array.from({length:8},()=>new T.Vector3())}}};
 const figures=[-120,0,120].map(x=>{const root=new T.Group(),body=new T.Group(),mesh=new T.Mesh(geometry,material);mesh.castShadow=true;mesh.position.y=30;body.add(mesh);root.add(body);root.position.x=x;scene.add(root);return {root,lighting,eligible:true};});
 const target=new T.WebGLRenderTarget(200,200),pixels=new Uint8Array(200*200*4);
 const frame=()=>{renderer.shadowMap.needsUpdate=true;renderer.setRenderTarget(target);renderer.render(scene,camera);renderer.readRenderTargetPixels(target,0,0,200,200,pixels);return pixels.slice();};
 const reference=frame(),batches=createMiniatureBatches(scene),failures=[];
 for(let i=0;i<45;i++){
  if(i%5===0)batches.restore();batches.update(figures);const actual=frame();let changed=0;
  for(let p=0;p<pixels.length;p+=4)if(Math.abs(actual[p]-reference[p])>6)changed++;
  if(changed>40)failures.push({i,changed});
 }
 window.directionalContinuity={failures};batches.dispose();renderer.dispose();
 `}});
 await page.goto('about:blank');await page.addScriptTag({content:bundle.outputFiles[0].text});
 expect(await page.evaluate(()=>(window as any).directionalContinuity.failures)).toEqual([]);
});
