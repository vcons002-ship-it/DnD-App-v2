import {CurvePath,LineCurve3,TubeGeometry,Group,Mesh,Vector3,type MeshBasicMaterial} from 'three';
import type {SpellImpactStyle} from '../../../shared/spellImpact';

// Waist-level channel reads through humanoid bodies in the tilted view,
// including the shorter goblins; this never changes the combat footprint.
export const LINEAR_LIGHTNING_HEIGHT_FT=2.5;

/** Shared narrow, jagged channel with a traveling white return-stroke and blue
 * corona. No per-frame geometry allocations or dynamic shadows. */
export function createLinearLightningGeometry(){
 const path=new CurvePath<Vector3>();
 const points=Array.from({length:49},(_,i)=>new Vector3(i/48,i===0||i===48?0:Math.sin(i*2.13)*.035,i===0||i===48?0:Math.sin(i*4.71)*.09));
 for(let i=1;i<points.length;i++)path.add(new LineCurve3(points[i-1],points[i]));
 const geometries=[.072,.025,.009].map(radius=>new TubeGeometry(path,144,radius,5,false));
 function build(_style:SpellImpactStyle,body:MeshBasicMaterial,bright:MeshBasicMaterial,white:MeshBasicMaterial){
  const root=new Group(),parts:Mesh[]=[],front={value:0},pulse={value:1};
  const materials=[body,bright,white].map((source,i)=>{
   const material=source.clone();material.userData.opacityScale=i===0?.18:1;
   material.customProgramCacheKey=()=>`linear-lightning-${i}`;
   material.onBeforeCompile=shader=>{
    shader.uniforms.boltFront=front;shader.uniforms.boltPulse=pulse;
    shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying float boltX;')
     .replace('#include <begin_vertex>','#include <begin_vertex>\nboltX=position.x;');
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying float boltX;uniform float boltFront;uniform float boltPulse;')
     .replace('#include <color_fragment>','#include <color_fragment>\nif(boltX>boltFront)discard;diffuseColor.a*=boltPulse;');
   };return material;
  });
  geometries.forEach((geometry,i)=>{const mesh=new Mesh(geometry,materials[i]);mesh.name=['lightning-bolt-corona','lightning-bolt-channel','lightning-bolt-core'][i];mesh.userData.emitterPoint=new Vector3([.15,.5,.85][i],0,0);root.add(mesh);parts.push(mesh);});
  return {root,parts,materials,update(t:number,_persistent:boolean,reduced:boolean,_areaScale:number,end?:Vector3){
   const length=end?Math.hypot(end.x,end.z):0;
   root.visible=length>0;if(!root.visible)return;
   root.position.set(0,end!.y,0);root.rotation.y=Math.atan2(-end!.z,end!.x);root.scale.set(length,1,1);
   front.value=reduced?1:Math.min(1,t/.20);
   // Short irregular strikes keep this electrical rather than a steady laser.
   pulse.value=reduced?.55:t<.23?1:t<.31?.15:t<.38?.85:t<.49?.12:t<.57?.7:.24;
  }};
 }
 return {build,dispose(){geometries.forEach(g=>g.dispose());}};
}
