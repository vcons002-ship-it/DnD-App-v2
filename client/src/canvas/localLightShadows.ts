import {PointLight,Vector4,Box3,WebGLCubeRenderTarget,WebGLRenderTarget,CubeDepthTexture,LinearFilter,LessEqualCompare,Scene,Mesh,PlaneGeometry,MeshBasicMaterial,OrthographicCamera,type Group,type Object3D,type DepthTexture,type Camera,type Texture,type WebGLRenderer} from 'three';
import {hasLineOfSight,type MapWall} from '../../../shared/mapWalls';
import {LIGHT_SPILL_MULTIPLIER} from '../../../shared/lightFalloff';
import type {TorchLight} from './miniatureTorchLighting';
import {selectShadowLights,castsLocalShadow,compactShadowHeightScale,localShadowContactBias,localShadowDepthGlsl,type ShadowCaster} from '../../../shared/localLightShadows';
import {creatureShadowStyle} from './creatureShadowStyle';
import {createEnvironmentalLocalShadows,environmentalLocalShadowGlsl} from './environmentalLocalShadows';

// A bounded set of cached cube maps keeps moving lanterns affordable. Sources
// are chosen by their contribution at visible figures, never by array order.
// Full silhouettes are compacted in the shadow pass, never clipped by distance.
// Walls use separate visibility polygons and stay opaque.
export const localShadowGlsl=`
 uniform vec4 localShadowOrigins[4];
 uniform vec4 localShadowParams[4];
 ${localShadowDepthGlsl}
 ${creatureShadowStyle==='map'?environmentalLocalShadowGlsl:''}
 ${Array.from({length:4},(_,i)=>`uniform samplerCubeShadow localShadowMap${i};`).join('\n')}
 float sampleLocalShadow(samplerCubeShadow depthMap,vec3 delta,vec4 params,float strength){
   float z=max(max(abs(delta.x),abs(delta.y)),abs(delta.z));
   if(z<=params.x||z>=params.y)return 1.;
   float depth=localShadowDepth(z,params);
   vec3 direction=normalize(delta);
   vec3 axis=abs(direction.y)<.9?vec3(0.,1.,0.):vec3(1.,0.,0.);
   vec3 tangent=normalize(cross(direction,axis))*params.z;
   vec3 bitangent=normalize(cross(direction,tangent))*params.z;
   float visibility=(texture(depthMap,vec4(direction,depth))+
     texture(depthMap,vec4(direction+tangent,depth))+texture(depthMap,vec4(direction-tangent,depth))+
     texture(depthMap,vec4(direction+bitangent,depth))+texture(depthMap,vec4(direction-bitangent,depth)))*.2;
   return 1.-(1.-visibility)*strength;
 }
 float localLightVisibility(float slot,vec3 point,float strength){
   ${Array.from({length:4},(_,i)=>`if(slot>${i-.5}&&slot<${i+.5}&&localShadowOrigins[${i}].w>.5)return ${creatureShadowStyle==='map'?`samplePlanarShadow(localPlanarMap${i},localPlanarBounds[${i}],point,strength)`:`sampleLocalShadow(localShadowMap${i},point-localShadowOrigins[${i}].xyz,localShadowParams[${i}],strength)`};`).join('\n')}
   return 1.;
 }
`;

function depthCube(size:number){
 const target=new WebGLCubeRenderTarget(size),depth=new CubeDepthTexture(size);
 depth.compareFunction=LessEqualCompare;depth.minFilter=depth.magFilter=LinearFilter;
 // Three supports cube depth attachments; its target type still narrows this to 2D.
 target.depthTexture=depth as unknown as DepthTexture;
 return target;
}

export function createLocalLightShadows(renderer:WebGLRenderer){
 const planar=creatureShadowStyle==='map'?createEnvironmentalLocalShadows():undefined;
 const empty=depthCube(1);
 const previous=renderer.getRenderTarget();for(let i=0;i<6;i++){renderer.setRenderTarget(empty,i);renderer.clear();}renderer.setRenderTarget(previous);
 // Shadow rendering needs an active Three render state. A one-pixel pass runs
 // it before the light field, without redrawing the battlefield's color pass.
 const pass=new Scene(),passCamera=new OrthographicCamera(-1,1,1,-1,0,2),passTarget=new WebGLRenderTarget(1,1);
 const marker=new Mesh(new PlaneGeometry(2,2),new MeshBasicMaterial());marker.position.z=-1;pass.add(marker);
 const origins=Array.from({length:4},()=>new Vector4()),params=Array.from({length:4},()=>new Vector4());
 const maps=Array.from({length:4},()=>({value:empty.depthTexture as Texture}));
 const uniforms={...planar?.uniforms,localShadowOrigins:{value:origins},localShadowParams:{value:params},
  ...Object.fromEntries(maps.map((uniform,i)=>['localShadowMap'+i,uniform]))};
 const pool=Array.from({length:4},()=>{
  const light=new PointLight(0xffffff,0);light.castShadow=true;light.shadow.autoUpdate=false;
  light.shadow.mapSize.set(512,512);light.shadow.camera.near=.5;
  return {light,id:'',key:'',carried:false,casterIds:[] as string[]};
 });
 let updates=0;
 const dimensions=new WeakMap<Group,{height:number;radius:number}>(),bounds=new Box3();
 return {uniforms,
  render(renderer:WebGLRenderer,scene:Scene,camera:Camera,lights:TorchLight[],casters:readonly (ShadowCaster&{id:string;root:Group;diameter:number;animated?:boolean})[],walls:readonly MapWall[],enabled:boolean,environmentalLength:number){
   for(const light of lights)light.shadowSlot=-1;
   const selected=enabled?selectShadowLights(lights,casters,walls):[];
   // Keep slots stable as flicker changes the relative strength of two torches.
   for(const entry of pool)if(!selected.some(l=>l.id===entry.id)){entry.id='';entry.key='';}
   if(!selected.length){origins.forEach(o=>o.w=0);return;}
   const transforms:{id:string;node:Object3D;x:number;y:number;key:string}[]=[];
   scene.updateMatrixWorld(true);
   for(const caster of casters)if(caster.visible&&!dimensions.has(caster.root)){
    bounds.setFromObject(caster.root.children[0]??caster.root);const scale=caster.root.scale.x;
    dimensions.set(caster.root,{height:Math.max(.1,bounds.max.y-caster.root.position.y)/scale,
     radius:Math.hypot(Math.max(Math.abs(bounds.min.x-caster.x),Math.abs(bounds.max.x-caster.x)),Math.max(Math.abs(bounds.min.z-caster.y),Math.abs(bounds.max.z-caster.y)))/scale});
   }
   for(const caster of casters)if(caster.visible)caster.root.traverseVisible(node=>{if(node.castShadow)transforms.push({id:caster.id,node,x:node.matrixWorld.elements[12],y:node.matrixWorld.elements[14],key:node.uuid+':'+node.matrixWorld.elements.join(',')});});
   for(const source of selected){
    const entry=pool.find(e=>e.id===source.id)??pool.find(e=>!e.id)!;entry.id=source.id;entry.carried=!!source.carried;
    const slot=pool.indexOf(entry),light=entry.light;
    // Radius flicker changes brightness, not occluder geometry or cube coverage.
    const far=Math.max(entry.key?light.distance:0,Math.ceil(source.radius*LIGHT_SPILL_MULTIPLIER/100+1)*100);
    const reaches=(p:{id?:string;x:number;y:number})=>castsLocalShadow(source,{...p,visible:true})&&Math.hypot(p.x-source.x,p.y-source.y)<far&&hasLineOfSight(source,p,walls);
    const key=[source.carried,source.x,source.y,source.height,far,planar?environmentalLength:0,...transforms.filter(reaches).map(t=>t.key)].join(',');
    const animated=casters.some(c=>c.visible&&c.animated&&reaches(c));
    light.position.set(source.x,source.height,source.y);light.distance=far;light.updateMatrixWorld();
    light.shadow.camera.far=far;light.shadow.camera.updateProjectionMatrix();
    light.shadow.needsUpdate=animated||entry.key!==key||(!planar&&!light.shadow.map);entry.key=key;
    source.shadowSlot=slot;
    origins[slot].set(source.x,source.height,source.y,1);params[slot].set(.5,far,2/512,localShadowContactBias(source.height));
   }
   pool.forEach((entry,i)=>{if(!entry.id)origins[i].w=0;});
   const dirty=pool.filter(e=>e.id&&e.light.shadow.needsUpdate);
   if(planar){
    for(const entry of dirty){entry.casterIds=planar.render(renderer,pool.indexOf(entry),selected.find(l=>l.id===entry.id)!,casters,walls,environmentalLength);entry.light.shadow.needsUpdate=false;}
    updates+=dirty.length;return;
   }
   if(dirty.length){
    const pending=renderer.shadowMap.needsUpdate,target=renderer.getRenderTarget();renderer.shadowMap.needsUpdate=false;
    marker.onBeforeRender=()=>{
     for(const entry of dirty){
      // Exclude only this source's carrier, including equipment and base. Restore
      // castShadow even on failure so sunlight and other lanterns remain correct.
      const excluded=transforms.filter(t=>entry.carried&&t.id===entry.id);
      for(const t of excluded)t.node.castShadow=false;
      const scaled=creatureShadowStyle==='compact'?casters.filter(c=>castsLocalShadow(entry,c)).map(c=>({caster:c,y:c.root.scale.y})):[];
      try{
       for(const {caster:c} of scaled){
        const d=dimensions.get(c.root)!;
        c.root.scale.y*=compactShadowHeightScale(entry.light.position.y,Math.hypot(c.x-entry.light.position.x,c.y-entry.light.position.z),d.height*c.root.scale.x,d.radius*c.root.scale.x,c.diameter);
        c.root.updateMatrixWorld(true);
       }
       entry.casterIds=[...new Set(transforms.filter(t=>t.node.castShadow).map(t=>t.id))];
       entry.light.shadow.map??=depthCube(512);
       renderer.shadowMap.needsUpdate=true;renderer.shadowMap.render([entry.light],scene,camera);
      }finally{
       for(const {caster,y} of scaled){caster.root.scale.y=y;caster.root.updateMatrixWorld(true);}
       for(const t of excluded)t.node.castShadow=true;
      }
     }
    };
    try{renderer.setRenderTarget(passTarget);renderer.render(pass,passCamera);}
    finally{renderer.setRenderTarget(target);renderer.shadowMap.needsUpdate=pending;}
    updates+=dirty.length;
   }
   pool.forEach((entry,i)=>{maps[i].value=entry.light.shadow.map?.depthTexture??empty.depthTexture!;});
  },get state(){return {localShadowLights:pool.filter(e=>e.id).length,localShadowUpdates:updates,localShadowSourceIds:pool.filter(e=>e.id).map(e=>e.id).join(','),localShadowCasters:JSON.stringify(Object.fromEntries(pool.filter(e=>e.id).map(e=>[e.id,e.casterIds])))};},
  dispose(){planar?.dispose();empty.dispose();passTarget.dispose();marker.geometry.dispose();marker.material.dispose();for(const entry of pool){entry.light.shadow.map?.dispose();entry.light.shadow.mapPass?.dispose();}}
 };
}
