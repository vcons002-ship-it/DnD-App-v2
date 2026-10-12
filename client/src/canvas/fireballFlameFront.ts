import {BufferGeometry,DoubleSide,Float32BufferAttribute,Mesh,MeshBasicMaterial,type Data3DTexture} from 'three';

/** A folded flame crest at the dome's leading edge. Shares its volume noise
 * and clock, so this is one advancing blast rather than a second pulse. */
export function createFireballFlameFront(){
 const geometry=new BufferGeometry(),positions:number[]=[],uvs:number[]=[],indices:number[]=[],segments=128,rows=16;
 for(let row=0;row<=rows;row++)for(let i=0;i<=segments;i++){
  const angle=i/segments*Math.PI*2,v=row/rows,r=.72+.28*v;
  positions.push(Math.cos(angle)*r,0,Math.sin(angle)*r);uvs.push(i/segments,v);
 }
 for(let row=0;row<rows;row++)for(let i=0;i<segments;i++){
  const a=row*(segments+1)+i,b=a+segments+1;indices.push(a,b,a+1,b,b+1,a+1);
 }
 geometry.setAttribute('position',new Float32BufferAttribute(positions,3));geometry.setAttribute('uv',new Float32BufferAttribute(uvs,2));
 geometry.setIndex(indices);geometry.computeVertexNormals();
 const field=`precision highp sampler3D;uniform sampler3D fireNoise;uniform float fireClock;
 float fireField(vec3 p){return texture(fireNoise,p*.115).r*.67+texture(fireNoise,p*.253+vec3(.19,.37,.51)).r*.33;}`;
 return {build(body:MeshBasicMaterial,noise:Data3DTexture,clock:{value:number}){
  const material=body.clone();material.side=DoubleSide;material.forceSinglePass=true;material.userData.opacityScale=1;
  material.customProgramCacheKey=()=> 'fireball-combined-flame-front-v1';
  material.onBeforeCompile=shader=>{
   shader.uniforms.fireNoise={value:noise};shader.uniforms.fireClock=clock;
   shader.vertexShader=shader.vertexShader.replace('#include <common>',`#include <common>\nvarying vec3 fireLocal;varying vec2 fireUv;${field}`)
    .replace('#include <begin_vertex>',`#include <begin_vertex>
     fireUv=uv;vec3 radial=normalize(vec3(position.x,0.,position.z));
     float n=fireField(radial*6.+vec3(0.,-fireClock*2.2,0.));
     transformed.xz*=1.-.035*(1.-n)*pow(uv.y,4.);
     transformed.y=.008+pow(max(0.,sin(uv.y*3.14159265)),1.2)*(.065+.21*n);
     fireLocal=transformed;
    `);
   shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>\nvarying vec3 fireLocal;varying vec2 fireUv;${field}`)
    .replace('#include <color_fragment>',`#include <color_fragment>
     vec3 p=vec3(fireLocal.x*11.,fireUv.y*3.-fireClock*3.4,fireLocal.z*11.);
     float n=clamp((fireField(p+fireField(p*.55)*1.1)-.25)*1.8,0.,1.);
     float heat=smoothstep(.15,.85,n)*(.65+.35*fireUv.y);
     vec3 fire=mix(vec3(.30,.012,.001),vec3(1.,.18,.003),smoothstep(.04,.44,heat));
     fire=mix(fire,vec3(1.,.67,.04),smoothstep(.34,.77,heat));
     diffuseColor.rgb=mix(fire,vec3(1.,.96,.56),smoothstep(.75,.98,heat));
     diffuseColor.a*=smoothstep(0.,.15,fireUv.y)*(1.-smoothstep(.86,1.,fireUv.y))*smoothstep(.05,.46,n);
    `);
  };
  const mesh=new Mesh(geometry,material);mesh.name='fireball-flame-crest';mesh.frustumCulled=false;
  return {mesh,material};
 },dispose(){geometry.dispose();}};
}
