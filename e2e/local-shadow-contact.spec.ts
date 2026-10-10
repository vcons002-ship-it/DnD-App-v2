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



