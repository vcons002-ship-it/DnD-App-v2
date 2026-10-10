import {Color,DoubleSide,Mesh,MeshBasicMaterial,OrthographicCamera,PlaneGeometry,Scene,Vector2,Vector3,Vector4,WebGLRenderTarget,LinearFilter,type WebGLRenderer} from 'three';
import type {TorchLight} from './miniatureTorchLighting';

/** Point-source silhouettes on the flat map. Stationary geometry has its own
 * cached mask; moving figures are composited without redrawing that geometry. */
export const environmentalLocalShadowGlsl=`
 uniform vec4 localPlanarBounds[4];
 uniform vec2 localPlanarTexel;
 ${Array.from({length:4},(_,i)=>`uniform sampler2D localPlanarMap${i};`).join('\n')}
 float samplePlanarShadow(sampler2D mask,vec4 bounds,vec3 point,float strength){
   if(point.y>1.)return 1.;
   vec2 uv=(point.xz-bounds.xy)/bounds.zw;uv.y=1.-uv.y;
   if(any(lessThan(uv,vec2(0.)))||any(greaterThan(uv,vec2(1.))))return 1.;
   vec2 pixel=localPlanarTexel*1.5;
   float blocked=(texture2D(mask,uv).r+texture2D(mask,uv+vec2(pixel.x,0.)).r+
     texture2D(mask,uv-vec2(pixel.x,0.)).r+texture2D(mask,uv+vec2(0.,pixel.y)).r+
     texture2D(mask,uv-vec2(0.,pixel.y)).r)*.2;
   return 1.-blocked*strength;
 }
`;
export function createEnvironmentalLocalShadows(){
 const createTarget=()=>new WebGLRenderTarget(1,1,{minFilter:LinearFilter,magFilter:LinearFilter,depthBuffer:false,stencilBuffer:false});
 const targets=Array.from({length:4},createTarget),stationary=Array.from({length:4},createTarget),keys=Array(4).fill('');
 const bounds=Array.from({length:4},()=>new Vector4(0,0,1,1)),texel=new Vector2(1,1),sourcePosition=new Vector3();
 const uniforms={localPlanarTexel:{value:texel},localPlanarBounds:{value:bounds},...Object.fromEntries(targets.map((target,i)=>['localPlanarMap'+i,{value:target.texture}]))};
 const scene=new Scene(),camera=new OrthographicCamera(),material=new MeshBasicMaterial({color:0xffffff,side:DoubleSide,depthTest:false,depthWrite:false,toneMapped:false});
 material.onBeforeCompile=shader=>{
   shader.uniforms.floorShadowSource={value:sourcePosition};
   shader.vertexShader='uniform vec3 floorShadowSource;\n'+shader.vertexShader;
   shader.vertexShader=shader.vertexShader.replace('#include <project_vertex>',`
     vec4 shadowWorld=modelMatrix*vec4(transformed,1.);
     float separation=max(floorShadowSource.y*.08,floorShadowSource.y-shadowWorld.y);
     shadowWorld.xz+=(shadowWorld.xz-floorShadowSource.xz)*max(0.,shadowWorld.y)/separation;
     shadowWorld.y=.05;
     gl_Position=projectionMatrix*viewMatrix*shadowWorld;
   `);
 };
 material.customProgramCacheKey=()=> 'point-floor-shadow-v1';
 const copyScene=new Scene(),copyCamera=new OrthographicCamera(-1,1,1,-1,0,2),copyMaterial=new MeshBasicMaterial({depthTest:false,depthWrite:false,toneMapped:false});
 const copyGeometry=new PlaneGeometry(2,2),copy=new Mesh(copyGeometry,copyMaterial);copy.position.z=-1;copyScene.add(copy);
 const clearColor=new Color();camera.up.set(0,0,-1);
 let staticUpdates=0,dynamicUpdates=0,size=1;
 const fill=(meshes:readonly Mesh[])=>{scene.clear();for(const mesh of meshes){mesh.material=material;scene.add(mesh);}scene.updateMatrixWorld(true);};
 return {uniforms,
  render(renderer:WebGLRenderer,slot:number,source:TorchLight,staticMeshes:readonly Mesh[],dynamicMeshes:readonly Mesh[],staticKey:string,far:number,resolution:number){
   if(size!==resolution){size=resolution;for(const target of [...targets,...stationary])target.setSize(size,size);keys.fill('');texel.set(1/size,1/size);}
   bounds[slot].set(source.x-far,source.y-far,far*2,far*2);
   sourcePosition.set(source.x,Math.max(.001,source.height),source.y);
   camera.left=-far;camera.right=far;camera.top=far;camera.bottom=-far;camera.near=.1;camera.far=2000;
   camera.position.set(source.x,1000,source.y);camera.lookAt(source.x,0,source.y);camera.updateProjectionMatrix();
   const previous=renderer.getRenderTarget(),alpha=renderer.getClearAlpha(),autoClear=renderer.autoClear,pending=renderer.shadowMap.needsUpdate;
   renderer.getClearColor(clearColor);
   try{
    renderer.shadowMap.needsUpdate=false;renderer.setClearColor(0,0);
    if(keys[slot]!==staticKey){fill(staticMeshes);renderer.autoClear=true;renderer.setRenderTarget(stationary[slot]);renderer.clear();renderer.render(scene,camera);keys[slot]=staticKey;staticUpdates++;}
    copyMaterial.map=stationary[slot].texture;
    renderer.autoClear=true;renderer.setRenderTarget(targets[slot]);renderer.clear();renderer.render(copyScene,copyCamera);
    if(dynamicMeshes.length){fill(dynamicMeshes);renderer.autoClear=false;renderer.render(scene,camera);dynamicUpdates++;}
   }finally{renderer.setRenderTarget(previous);renderer.setClearColor(clearColor,alpha);renderer.autoClear=autoClear;renderer.shadowMap.needsUpdate=pending;}
  },
  invalidate(){keys.fill('');},
  get state(){return {localShadowStaticUpdates:staticUpdates,localShadowDynamicUpdates:dynamicUpdates,localShadowFloorSize:size};},
  dispose(){scene.clear();material.dispose();copyMaterial.dispose();copyGeometry.dispose();for(const target of [...targets,...stationary])target.dispose();},
 };
}
