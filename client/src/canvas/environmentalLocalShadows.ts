import {Box3,Color,DoubleSide,LinearFilter,Matrix4,Mesh,MeshBasicMaterial,OrthographicCamera,Scene,Vector4,WebGLRenderTarget,type Group,type WebGLRenderer} from 'three';
import {castsLocalShadow,environmentalShadowSlope,type ShadowCaster} from '../../../shared/localLightShadows';
import {hasLineOfSight,type MapWall} from '../../../shared/mapWalls';
import type {TorchLight} from './miniatureTorchLighting';

/** The existing environmental silhouette uses parallel projection. Apply that
 * projection per caster, away from each local lamp, without point-light stretch.
 * Proxies share geometry; the visible figures and their transforms never change. */
export const environmentalLocalShadowGlsl=`
 uniform vec4 localPlanarBounds[4];
 ${Array.from({length:4},(_,i)=>`uniform sampler2D localPlanarMap${i};`).join('\n')}
 float samplePlanarShadow(sampler2D mask,vec4 bounds,vec3 point,float strength){
   if(point.y>1.)return 1.; // Environmental silhouettes belong to the ground.
   vec2 uv=(point.xz-bounds.xy)/bounds.zw;uv.y=1.-uv.y;
   if(any(lessThan(uv,vec2(0.)))||any(greaterThan(uv,vec2(1.))))return 1.;
   vec2 pixel=vec2(1.5/1024.);
   float blocked=(texture2D(mask,uv).r+texture2D(mask,uv+vec2(pixel.x,0.)).r+
     texture2D(mask,uv-vec2(pixel.x,0.)).r+texture2D(mask,uv+vec2(0.,pixel.y)).r+
     texture2D(mask,uv-vec2(0.,pixel.y)).r)*.2;
   return 1.-blocked*strength;
 }
`;

export function createEnvironmentalLocalShadows(){
 const targets=Array.from({length:4},()=>new WebGLRenderTarget(1024,1024,{minFilter:LinearFilter,magFilter:LinearFilter,depthBuffer:false,stencilBuffer:false}));
 const bounds=Array.from({length:4},()=>new Vector4(0,0,1,1));
 const uniforms={localPlanarBounds:{value:bounds},...Object.fromEntries(targets.map((target,i)=>['localPlanarMap'+i,{value:target.texture}]))};
 const scene=new Scene(),camera=new OrthographicCamera(),material=new MeshBasicMaterial({color:0xffffff,side:DoubleSide,depthTest:false,depthWrite:false,toneMapped:false});
 const proxies=new WeakMap<Mesh,Mesh>(),projection=new Matrix4(),box=new Box3(),partBounds=new Box3(),clearColor=new Color();
 camera.up.set(0,0,-1);
 return {uniforms,
  render(renderer:WebGLRenderer,slot:number,source:TorchLight,casters:readonly (ShadowCaster&{id:string;root:Group})[],walls:readonly MapWall[],length:number){
   scene.clear();box.makeEmpty();const ids:string[]=[];
   for(const caster of casters){
    if(!castsLocalShadow(source,caster)||!hasLineOfSight(source,caster,walls))continue;
    const slope=environmentalShadowSlope(source,caster,length),floor=caster.root.position.y;
    projection.set(1,slope.x,0,-slope.x*floor, 0,0,0,.05, 0,slope.y,1,-slope.y*floor, 0,0,0,1);
    let added=false;
    caster.root.traverseVisible(node=>{
     if(!(node instanceof Mesh)||!node.castShadow)return;
     let proxy=proxies.get(node);
     if(!proxy){proxy=node.clone(false);proxy.material=material;proxy.matrixAutoUpdate=false;proxy.frustumCulled=false;proxy.castShadow=false;proxy.receiveShadow=false;proxies.set(node,proxy);}
     proxy.matrix.multiplyMatrices(projection,node.matrixWorld);proxy.matrixWorld.copy(proxy.matrix);
     proxy.morphTargetInfluences=node.morphTargetInfluences;
     scene.add(proxy);if(!node.geometry.boundingBox)node.geometry.computeBoundingBox();
     partBounds.copy(node.geometry.boundingBox!).applyMatrix4(proxy.matrix);box.union(partBounds);added=true;
    });
    if(added)ids.push(caster.id);
   }
   if(box.isEmpty())box.setFromArray([0,0,0,1,0,1]);
   const pad=4,width=Math.max(1,box.max.x-box.min.x)+pad*2,height=Math.max(1,box.max.z-box.min.z)+pad*2;
   bounds[slot].set(box.min.x-pad,box.min.z-pad,width,height);
   camera.left=-width/2;camera.right=width/2;camera.top=height/2;camera.bottom=-height/2;camera.near=1;camera.far=2000;
   camera.position.set(box.min.x-pad+width/2,1000,box.min.z-pad+height/2);camera.lookAt(camera.position.x,0,camera.position.z);camera.updateProjectionMatrix();
   const previous=renderer.getRenderTarget(),alpha=renderer.getClearAlpha(),pending=renderer.shadowMap.needsUpdate;
   renderer.getClearColor(clearColor);
   try{renderer.shadowMap.needsUpdate=false;renderer.setClearColor(0,0);renderer.setRenderTarget(targets[slot]);renderer.clear();renderer.render(scene,camera);}
   finally{renderer.setRenderTarget(previous);renderer.setClearColor(clearColor,alpha);renderer.shadowMap.needsUpdate=pending;}
   return ids;
  },dispose(){scene.clear();material.dispose();targets.forEach(target=>target.dispose());}
 };
}
