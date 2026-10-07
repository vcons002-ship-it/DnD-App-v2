import * as THREE from 'three';
import {diceTrailFade} from './diceTrailTiming';

type VinePoint={x:number;y:number;time:number;distance:number};
/** Lit bark on an actual rounded root, with occasional light inside narrow cracks. */
export function createTrailVineMaterial(bark?:THREE.Texture|null){
 const time={value:0};
 const material=new THREE.MeshStandardMaterial({color:'#51432e',roughness:.90,metalness:0,envMapIntensity:.12,bumpMap:bark??null,bumpScale:.023,transparent:true,depthWrite:false});
 material.onBeforeCompile=shader=>{
  shader.uniforms.vineTime=time;
  shader.vertexShader='attribute float vineFade; varying float rootFade; varying vec2 rootUv;\n'+shader.vertexShader;
  shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nrootFade=vineFade;rootUv=uv;');
  shader.fragmentShader='uniform float vineTime; varying float rootFade; varying vec2 rootUv;\n'+shader.fragmentShader;
  shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
   diffuseColor.a*=rootFade;
   float grain=sin(rootUv.y*47.+sin(rootUv.x*2.7)*1.4)*sin(rootUv.x*29.+rootUv.y*7.);
   diffuseColor.rgb*=.78+grain*.13;
  `);
  shader.fragmentShader=shader.fragmentShader.replace('#include <emissivemap_fragment>',`#include <emissivemap_fragment>
   float split=abs(sin(rootUv.y*6.283185+sin(rootUv.x*3.1)*.4));
   float seam=1.-smoothstep(.025,.10,split);
   float pocket=smoothstep(.50,.86,sin(rootUv.x*7.3+sin(rootUv.x*2.1)*1.8));
   float pulse=pow(max(0.,sin(rootUv.x*4.-vineTime*2.8)),6.);
   totalEmissiveRadiance+=vec3(.045,.32,.095)*seam*pocket*(.2+pulse*.8)*rootFade;
  `);
 };
 material.customProgramCacheKey=()=> 'varis-physical-root-v1';
 return {material,time};
}
/** Fixed dynamic buffers keep long and crowded trails inexpensive to update. */
export function createTrailVine(capacity:number,radius:number){
 const radial=8,vertices=capacity*radial;
 const position=new Float32Array(vertices*3),normal=new Float32Array(vertices*3),uv=new Float32Array(vertices*2),fade=new Float32Array(vertices);
 const indices:number[]=[];
 for(let j=0;j<capacity-1;j++)for(let k=0;k<radial;k++){
  const a=j*radial+k,b=j*radial+(k+1)%radial,c=a+radial,d=b+radial;indices.push(a,b,c,b,d,c);
 }
 const geometry=new THREE.BufferGeometry();
 geometry.setAttribute('position',new THREE.BufferAttribute(position,3).setUsage(THREE.DynamicDrawUsage));
 geometry.setAttribute('normal',new THREE.BufferAttribute(normal,3).setUsage(THREE.DynamicDrawUsage));
 geometry.setAttribute('uv',new THREE.BufferAttribute(uv,2).setUsage(THREE.DynamicDrawUsage));
 geometry.setAttribute('vineFade',new THREE.BufferAttribute(fade,1).setUsage(THREE.DynamicDrawUsage));
 geometry.setIndex(indices);geometry.setDrawRange(0,0);
 return {geometry,
  update(points:readonly VinePoint[],now:number,lifetime:number){
   for(let j=0;j<points.length;j++){
    const p=points[j],before=points[Math.max(0,j-1)],after=points[Math.min(points.length-1,j+1)];
    const length=Math.max(.001,Math.hypot(after.x-before.x,after.y-before.y)),nx=-(after.y-before.y)/length,ny=(after.x-before.x)/length;
    const ageFade=diceTrailFade((now-p.time)/lifetime),along=p.distance/radius;
    const curl=(Math.sin(along*2.2)*.07+Math.sin(along*4.7)*.025)*radius;
    const width=radius*.085*(.83+.13*Math.sin(along*3.3)+.06*Math.sin(along*8.1))*(.88+.12*ageFade);
    for(let k=0;k<radial;k++){
     const index=j*radial+k,angle=k/radial*Math.PI*2,c=Math.cos(angle),s=Math.sin(angle);
     position.set([p.x+nx*(curl+c*width),p.y+ny*(curl+c*width),radius*.085+s*width*.82],index*3);
     const inverseLength=1/Math.hypot(c,s/.82);normal.set([nx*c*inverseLength,ny*c*inverseLength,s/.82*inverseLength],index*3);
     uv.set([along,k/radial],index*2);fade[index]=ageFade;
    }
   }
   geometry.setDrawRange(0,Math.max(0,points.length-1)*radial*6);
   for(const attribute of Object.values(geometry.attributes))attribute.needsUpdate=true;
  }
 };
}
