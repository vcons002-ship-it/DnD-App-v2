import {PointLight,Vector4,Scene,Mesh,PlaneGeometry,MeshBasicMaterial,OrthographicCamera,WebGLRenderTarget,WebGLCubeRenderTarget,CubeDepthTexture,LinearFilter,LessEqualCompare,type Group,type Camera,type Texture,type DepthTexture,type WebGLRenderer} from 'three';
import type {MapWall} from '../../../shared/mapWalls';
import {LIGHT_SPILL_MULTIPLIER} from '../../../shared/lightFalloff';
import {selectShadowLights,castsLocalShadow,localShadowContactBias,localShadowDepthGlsl,type ShadowCaster} from '../../../shared/localLightShadows';
import {shadowRefreshDue} from '../../../shared/shadowRefresh';
import {createLightSightCache} from '../../../shared/lightSightCache';
import {graphicsBudget} from '../../../shared/graphicsQuality';
import type {TorchLight} from './miniatureTorchLighting';
import {creatureShadowStyle} from './creatureShadowStyle';
import {createEnvironmentalLocalShadows,environmentalLocalShadowGlsl} from './environmentalLocalShadows';
import {createShadowProxies} from './shadowProxies';

export const localShadowGlsl=`
 uniform vec4 localShadowOrigins[4];
 uniform vec4 localShadowParams[4];
 ${localShadowDepthGlsl}
 ${environmentalLocalShadowGlsl}
 ${Array.from({length:4},(_,i)=>`uniform samplerCubeShadow localShadowMap${i};`).join('\n')}
 float sampleLocalShadow(samplerCubeShadow depthMap,vec3 delta,vec4 params,float strength){
   float z=max(max(abs(delta.x),abs(delta.y)),abs(delta.z));
   if(z<=params.x||z>=params.y)return 1.;
   float depth=localShadowDepth(z,params);
   vec3 direction=normalize(delta),axis=abs(direction.y)<.9?vec3(0.,1.,0.):vec3(1.,0.,0.);
   vec3 tangent=normalize(cross(direction,axis))*params.z,bitangent=normalize(cross(direction,tangent))*params.z;
   float visibility=(texture(depthMap,vec4(direction,depth))+
     texture(depthMap,vec4(direction+tangent,depth))+texture(depthMap,vec4(direction-tangent,depth))+
     texture(depthMap,vec4(direction+bitangent,depth))+texture(depthMap,vec4(direction-bitangent,depth)))*.2;
   return 1.-(1.-visibility)*strength;
 }
 float localLightVisibility(float slot,vec3 point,float strength){
   ${Array.from({length:4},(_,i)=>`if(slot>${i-.5}&&slot<${i+.5}&&localShadowOrigins[${i}].w>.5){if(localShadowOrigins[${i}].w>1.5)return samplePlanarShadow(localPlanarMap${i},localPlanarBounds[${i}],point,strength);return sampleLocalShadow(localShadowMap${i},point-localShadowOrigins[${i}].xyz,localShadowParams[${i}],strength);}`).join('\n')}
   return 1.;
 }
`;
function depthCube(size:number){
 const target=new WebGLCubeRenderTarget(size),depth=new CubeDepthTexture(size);
 depth.compareFunction=LessEqualCompare;depth.minFilter=depth.magFilter=LinearFilter;target.depthTexture=depth as unknown as DepthTexture;return target;
}
type Caster=ShadowCaster&{id:string;root:Group;diameter:number;animated?:boolean};
type Prepared={caster:Caster;meshes:Mesh[];key:string;structural:string;dynamic:boolean};
const transformKeys=new WeakMap<readonly number[],{values:Float64Array;key:string}>();
const transformKey=(values:readonly number[])=>{
 const previous=transformKeys.get(values);
 if(previous&&values.every((v,i)=>v===previous.values[i]))return previous.key;
 const key=values.map(v=>Math.round(v*500)).join(',');
 if(previous){previous.values.set(values);previous.key=key;}
 else transformKeys.set(values,{values:new Float64Array(values),key});
 return key;
};

export function createLocalLightShadows(renderer:WebGLRenderer,invalidate:()=>void=()=>{}){
 const planar=createEnvironmentalLocalShadows(),proxies=createShadowProxies(invalidate),empty=depthCube(1);
 const previous=renderer.getRenderTarget();for(let i=0;i<6;i++){renderer.setRenderTarget(empty,i);renderer.clear();}renderer.setRenderTarget(previous);
 const pass=new Scene(),passCamera=new OrthographicCamera(-1,1,1,-1,0,2),passTarget=new WebGLRenderTarget(1,1),cubeScene=new Scene();
 const marker=new Mesh(new PlaneGeometry(2,2),new MeshBasicMaterial());marker.position.z=-1;pass.add(marker);
 const origins=Array.from({length:4},()=>new Vector4()),params=Array.from({length:4},()=>new Vector4());
 const maps=Array.from({length:4},()=>({value:empty.depthTexture as Texture}));
 const uniforms={...planar.uniforms,localShadowOrigins:{value:origins},localShadowParams:{value:params},...Object.fromEntries(maps.map((uniform,i)=>['localShadowMap'+i,uniform]))};
 const pool=Array.from({length:4},()=>{
   const light=new PointLight(0xffffff,0);light.castShadow=true;light.shadow.autoUpdate=false;light.shadow.mapSize.set(512,512);light.shadow.camera.near=.5;
   return {light,id:'',key:'',structural:'',last:-Infinity,casterIds:[] as string[]};
 });
 const roots=new Map<string,{key:string;movingUntil:number}>(),nodes=new WeakMap<Group,Mesh[]>(),sight=createLightSightCache();
 let updates=0,shadowSize=512,method:'cube'|'floor'='cube',wallsRef:readonly MapWall[]|undefined,wallKey='',wallVersion=0,pending=false,originalTriangles=0,proxyTriangles=0;
 return {uniforms,
  render(renderer:WebGLRenderer,scene:Scene,camera:Camera,lights:TorchLight[],casters:readonly Caster[],walls:readonly MapWall[],enabled:boolean,_environmentalLength:number,budget=graphicsBudget('high')){
   const now=performance.now();pending=false;
   const nextMethod=creatureShadowStyle==='map'?'floor':budget.localShadowMethod;
   if(method!==nextMethod||shadowSize!==budget.localShadowSize){
     method=nextMethod;shadowSize=budget.localShadowSize;planar.invalidate();
     for(const entry of pool){entry.light.shadow.map?.dispose();entry.light.shadow.map=null;entry.light.shadow.mapSize.set(shadowSize,shadowSize);entry.key='';entry.structural='';entry.last=-Infinity;}
     maps.forEach(map=>map.value=empty.depthTexture!);
   }
   if(wallsRef!==walls){wallsRef=walls;const nextKey=JSON.stringify(walls);if(nextKey!==wallKey){wallKey=nextKey;wallVersion++;planar.invalidate();}}
   for(const light of lights)light.shadowSlot=-1;
   const selected=enabled?selectShadowLights(lights,casters,walls,(a,b,w)=>sight.visible(`${(a as {id?:string}).id??`${a.x},${a.y}`}:${(b as {id?:string}).id??`${b.x},${b.y}`}`,a,b,w??[])).slice(0,budget.localShadowLights):[];
   for(const entry of pool)if(!selected.some(l=>l.id===entry.id)){entry.id='';entry.key='';entry.structural='';}
   origins.forEach(o=>o.w=0);
   if(!selected.length)return;
   scene.updateMatrixWorld(true);
   const active=new Set(casters.map(c=>c.id));for(const id of roots.keys())if(!active.has(id))roots.delete(id);
   proxies.release(casters.map(c=>c.root));
   originalTriangles=0;proxyTriangles=0;
   const prepared:Prepared[]=[];
   for(const caster of casters){
     if(!caster.visible)continue;
     let list=nodes.get(caster.root);if(!list){list=[];caster.root.traverse(node=>{if(node instanceof Mesh&&node.castShadow)list!.push(node);});nodes.set(caster.root,list);}
     const rootKey=transformKey(caster.root.matrixWorld.elements),old=roots.get(caster.id);
     const movingUntil=old&&old.key!==rootKey?now+250:old?.movingUntil??0;
     roots.set(caster.id,{key:rootKey,movingUntil});
     const meshes:Mesh[]=[],keys:string[]=[],versions:string[]=[];
     for(const node of list){
       if(!node.visible||!node.castShadow)continue;
       const proxy=proxies.get(node);if(!proxy)continue;
       meshes.push(proxy.mesh);versions.push(node.uuid+':'+proxy.version);if(!caster.animated)keys.push(transformKey(node.matrixWorld.elements));
       originalTriangles+=proxy.originalTriangles;proxyTriangles+=proxy.triangles;
     }
     const structural=caster.id+':'+caster.root.uuid+':'+versions.join(';');
     const pose=caster.animated?Math.floor(now/(1000/budget.localShadowPoseFps)):0;
     const dynamic=movingUntil>now||!!caster.animated;
     prepared.push({caster,meshes,structural,key:structural+':'+rootKey+':'+keys.join(';')+':'+pose+':'+dynamic,dynamic});
     if(movingUntil>now)pending=true;
   }
   // Oldest masks go first so no source starves. Structural changes bypass the
   // per-frame budget; ordinary movement keeps each source's last valid mask.
   const ordered=selected.slice().sort((a,b)=>(pool.find(e=>e.id===a.id)?.last??-Infinity)-(pool.find(e=>e.id===b.id)?.last??-Infinity));
   let routineUpdates=0;
   for(const source of ordered){
     const entry=pool.find(e=>e.id===source.id)??pool.find(e=>!e.id)!;entry.id=source.id;
     const slot=pool.indexOf(entry),far=Math.max(entry.key?entry.light.distance:0,Math.ceil(source.radius*LIGHT_SPILL_MULTIPLIER/100+1)*100);
     const allowed=prepared.filter(p=>castsLocalShadow(source,p.caster)&&Math.hypot(p.caster.x-source.x,p.caster.y-source.y)<far&&sight.visible(`${source.id}:${p.caster.id}`,source,p.caster,walls));
     const structural=[method,wallVersion,budget.localShadowFloorSize,source.carried,source.height,far,...allowed.map(p=>p.structural)].join('|');
     const sourceKey=[source.x,source.y,source.height,far].join(','),key=structural+':'+sourceKey+':'+allowed.map(p=>p.key).join('|');
     const force=entry.structural!==structural,requested=shadowRefreshDue(now,entry.last,key,entry.key,force,budget.localShadowFps);
     const due=requested&&(force||routineUpdates<2);
     if(!due&&key!==entry.key)pending=true;
     source.shadowSlot=slot;
     if(!due&&entry.key){origins[slot].w=method==='floor'?2:1;continue;}
     entry.light.position.set(source.x,source.height,source.y);entry.light.distance=far;entry.light.updateMatrixWorld();entry.light.shadow.camera.far=far;entry.light.shadow.camera.updateProjectionMatrix();
     origins[slot].set(source.x,source.height,source.y,method==='floor'?2:1);params[slot].set(.5,far,2/shadowSize,localShadowContactBias(source.height));
     if(!due)continue;
     entry.casterIds=allowed.map(p=>p.caster.id);
     if(method==='floor'){
       const fixed=allowed.filter(p=>!source.carried&&!p.dynamic),moving=allowed.filter(p=>source.carried||p.dynamic);
       planar.render(renderer,slot,source,fixed.flatMap(p=>p.meshes),moving.flatMap(p=>p.meshes),sourceKey+':'+structural+':'+fixed.map(p=>p.key).join('|'),far,budget.localShadowFloorSize);
     }else{
       cubeScene.clear();for(const p of allowed)for(const mesh of p.meshes){proxies.restoreCubeMaterial(mesh);cubeScene.add(mesh);}cubeScene.updateMatrixWorld(true);
       const target=renderer.getRenderTarget(),shadowPending=renderer.shadowMap.needsUpdate;
       marker.onBeforeRender=()=>{entry.light.shadow.map??=depthCube(shadowSize);entry.light.shadow.needsUpdate=true;renderer.shadowMap.needsUpdate=true;renderer.shadowMap.render([entry.light],cubeScene,camera);};
       try{renderer.shadowMap.needsUpdate=false;renderer.setRenderTarget(passTarget);renderer.render(pass,passCamera);}
       finally{renderer.setRenderTarget(target);renderer.shadowMap.needsUpdate=shadowPending;}
       maps[slot].value=entry.light.shadow.map?.depthTexture??empty.depthTexture!;
     }
     entry.key=key;entry.structural=structural;entry.last=now;updates++;if(!force)routineUpdates++;
   }
  },
  get pending(){return pending;},
  get state(){return {localShadowMethod:method,localShadowSize:shadowSize,localShadowLights:pool.filter(e=>e.id).length,localShadowUpdates:updates,
    localShadowSourceIds:pool.filter(e=>e.id).map(e=>e.id).join(','),localShadowCasters:JSON.stringify(Object.fromEntries(pool.filter(e=>e.id).map(e=>[e.id,e.casterIds]))),
    shadowOriginalTriangles:originalTriangles,shadowProxyTriangles:proxyTriangles,...proxies.state,...planar.state};},
  dispose(){planar.dispose();proxies.dispose();empty.dispose();passTarget.dispose();marker.geometry.dispose();(marker.material as MeshBasicMaterial).dispose();for(const entry of pool){entry.light.shadow.map?.dispose();entry.light.shadow.mapPass?.dispose();}},
 };
}
