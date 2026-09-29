import {PointLight,Vector4,WebGLCubeRenderTarget,WebGLRenderTarget,CubeDepthTexture,LessEqualCompare,Scene,Mesh,PlaneGeometry,MeshBasicMaterial,OrthographicCamera,type DepthTexture,type Camera,type Texture,type WebGLRenderer} from 'three';
import {hasLineOfSight,type MapWall} from '../../../shared/mapWalls';
import {LIGHT_SPILL_MULTIPLIER} from '../../../shared/lightFalloff';
import type {TorchLight} from './miniatureTorchLighting';
import {selectShadowLights,type ShadowCaster} from '../../../shared/localLightShadows';

// A bounded set of cached cube maps keeps moving lanterns affordable. Sources
// are chosen by their contribution at visible figures, never by array order.
// Three's current point shadow maps store perspective depth in a depth cube.
// Share the same sampler between ground illumination and miniature materials.
export const localShadowGlsl=`
 uniform vec4 localShadowOrigins[4];
 uniform vec4 localShadowParams[4];
 ${Array.from({length:4},(_,i)=>`uniform samplerCubeShadow localShadowMap${i};`).join('\n')}
 float sampleLocalShadow(samplerCubeShadow depthMap,vec3 delta,vec4 params){
   float z=max(max(abs(delta.x),abs(delta.y)),abs(delta.z));
   if(z<=params.x||z>=params.y)return 1.;
   float depth=params.y*(z-params.x)/(z*(params.y-params.x))-.00025;
   vec3 direction=normalize(delta);
   vec3 axis=abs(direction.y)<.9?vec3(0.,1.,0.):vec3(1.,0.,0.);
   vec3 tangent=normalize(cross(direction,axis))*params.z;
   vec3 bitangent=normalize(cross(direction,tangent))*params.z;
   return (texture(depthMap,vec4(direction,depth))+
     texture(depthMap,vec4(direction+tangent,depth))+texture(depthMap,vec4(direction-tangent,depth))+
     texture(depthMap,vec4(direction+bitangent,depth))+texture(depthMap,vec4(direction-bitangent,depth)))*.2;
 }
 float localLightVisibility(float slot,vec3 point){
   ${Array.from({length:4},(_,i)=>`if(slot>${i-.5}&&slot<${i+.5}&&localShadowOrigins[${i}].w>.5)return sampleLocalShadow(localShadowMap${i},point-localShadowOrigins[${i}].xyz,localShadowParams[${i}]);`).join('\n')}
   return 1.;
 }
`;

export function createLocalLightShadows(renderer:WebGLRenderer){
 const empty=new WebGLCubeRenderTarget(1),emptyDepth=new CubeDepthTexture(1);emptyDepth.compareFunction=LessEqualCompare;
 // Three supports cube depth attachments; the render-target declaration still
 // narrows this property to the 2D image-data generic.
 empty.depthTexture=emptyDepth as unknown as DepthTexture;
 const previous=renderer.getRenderTarget();for(let i=0;i<6;i++){renderer.setRenderTarget(empty,i);renderer.clear();}renderer.setRenderTarget(previous);
 // Shadow rendering needs an active Three render state. A one-pixel pass runs
 // it before the light field, without redrawing the battlefield's color pass.
 const pass=new Scene(),passCamera=new OrthographicCamera(-1,1,1,-1,0,2),passTarget=new WebGLRenderTarget(1,1);
 const marker=new Mesh(new PlaneGeometry(2,2),new MeshBasicMaterial());marker.position.z=-1;pass.add(marker);
 const origins=Array.from({length:4},()=>new Vector4()),params=Array.from({length:4},()=>new Vector4());
 const maps=Array.from({length:4},()=>({value:empty.depthTexture as Texture}));
 const uniforms={localShadowOrigins:{value:origins},localShadowParams:{value:params},
  ...Object.fromEntries(maps.map((uniform,i)=>['localShadowMap'+i,uniform]))};
 const pool=Array.from({length:4},()=>{
  const light=new PointLight(0xffffff,0);light.castShadow=true;light.shadow.autoUpdate=false;
  light.shadow.mapSize.set(512,512);light.shadow.camera.near=.5;
  return {light,id:'',key:''};
 });
 let updates=0;
 return {uniforms,
  render(renderer:WebGLRenderer,scene:Scene,camera:Camera,lights:TorchLight[],casters:readonly (ShadowCaster&{animated?:boolean})[],walls:readonly MapWall[],enabled:boolean){
   for(const light of lights)light.shadowSlot=-1;
   const selected=enabled?selectShadowLights(lights,casters,walls):[];
   // Keep slots stable as flicker changes the relative strength of two torches.
   for(const entry of pool)if(!selected.some(l=>l.id===entry.id)){entry.id='';entry.key='';}
   if(!selected.length){origins.forEach(o=>o.w=0);return;}
   const transforms:{x:number;y:number;key:string}[]=[];
   scene.updateMatrixWorld(true);
   scene.traverseVisible(node=>{if((node as import('three').Mesh).castShadow)transforms.push({x:node.matrixWorld.elements[12],y:node.matrixWorld.elements[14],key:node.uuid+':'+node.matrixWorld.elements.join(',')});});
   for(const source of selected){
    const entry=pool.find(e=>e.id===source.id)??pool.find(e=>!e.id)!;entry.id=source.id;
    const slot=pool.indexOf(entry),light=entry.light;
    // Radius flicker changes brightness, not occluder geometry or cube coverage.
    const far=Math.max(entry.key?light.distance:0,Math.ceil(source.radius*LIGHT_SPILL_MULTIPLIER/100+1)*100);
    const reaches=(p:{x:number;y:number})=>Math.hypot(p.x-source.x,p.y-source.y)<far&&hasLineOfSight(source,p,walls);
    const key=[source.x,source.y,source.height,far,...transforms.filter(reaches).map(t=>t.key)].join(',');
    const animated=casters.some(c=>c.visible&&c.animated&&reaches(c));
    light.position.set(source.x,source.height,source.y);light.distance=far;light.updateMatrixWorld();
    light.shadow.camera.far=far;light.shadow.camera.updateProjectionMatrix();
    light.shadow.needsUpdate=animated||entry.key!==key||!light.shadow.map;entry.key=key;
    source.shadowSlot=slot;
    origins[slot].set(source.x,source.height,source.y,1);params[slot].set(.5,far,1.5/512,0);
   }
   pool.forEach((entry,i)=>{if(!entry.id)origins[i].w=0;});
   const dirty=pool.filter(e=>e.id&&e.light.shadow.needsUpdate).map(e=>e.light);
   if(dirty.length){
    const pending=renderer.shadowMap.needsUpdate,target=renderer.getRenderTarget();renderer.shadowMap.needsUpdate=false;
    marker.onBeforeRender=()=>{renderer.shadowMap.needsUpdate=true;renderer.shadowMap.render(dirty,scene,camera);};
    renderer.setRenderTarget(passTarget);renderer.render(pass,passCamera);renderer.setRenderTarget(target);
    renderer.shadowMap.needsUpdate=pending;
    updates+=dirty.length;
   }
   pool.forEach((entry,i)=>{maps[i].value=entry.light.shadow.map?.depthTexture??empty.depthTexture!;});
  },get state(){return {localShadowLights:pool.filter(e=>e.id).length,localShadowUpdates:updates,localShadowSourceIds:pool.filter(e=>e.id).map(e=>e.id).join(',')};},
  dispose(){empty.dispose();passTarget.dispose();marker.geometry.dispose();marker.material.dispose();for(const entry of pool){entry.light.shadow.map?.dispose();entry.light.shadow.mapPass?.dispose();}}
 };
}
