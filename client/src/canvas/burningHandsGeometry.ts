import {BufferGeometry,DoubleSide,Float32BufferAttribute,Group,InstancedMesh,Mesh,MeshBasicMaterial,Object3D,SphereGeometry,Vector3} from 'three';
import type {SpellImpactStyle} from '../../../shared/spellImpact';

/** Shared folded flame front and embers. Unit +X is the confirmed 15-foot
 * cone; its far edge is 15 feet wide. No per-victim effects or shadows. */
export function createBurningHandsGeometry(){
 const sheet=new BufferGeometry(),vertices:number[]=[],uvs:number[]=[],indices:number[]=[];
 const rows=32,columns=20;
 for(let i=0;i<=rows;i++)for(let j=0;j<=columns;j++){
  const x=i/rows,v=j/columns,z=(v-.5)*x;
  vertices.push(x,.007+(1-x)*.16+Math.sin(v*Math.PI)*(.07+.13*x),z);uvs.push(x,v);
 }
 for(let i=0;i<rows;i++)for(let j=0;j<columns;j++){
  const a=i*(columns+1)+j,b=a+columns+1;indices.push(a,b,a+1,b,b+1,a+1);
 }
 sheet.setAttribute('position',new Float32BufferAttribute(vertices,3));sheet.setAttribute('uv',new Float32BufferAttribute(uvs,2));sheet.setIndex(indices);sheet.computeVertexNormals();
 // Vertex folds can rise beyond the undeformed mesh's bounding sphere.
 const emberGeometry=new SphereGeometry(1,5,4);
 function build(style:SpellImpactStyle,body:MeshBasicMaterial,bright:MeshBasicMaterial,_white:MeshBasicMaterial){
  const root=new Group(),clock={value:0},reach={value:0},quality={value:1},pose=new Object3D();
  const materials=[0,1].map(layer=>{
   const material=body.clone();material.side=DoubleSide;material.forceSinglePass=true;material.userData.opacityScale=layer?.56:.92;
   material.customProgramCacheKey=()=>`burning-hands-folded-cone-${layer}`;
   material.onBeforeCompile=shader=>{
    shader.uniforms.flameClock=clock;shader.uniforms.flameReach=reach;shader.uniforms.flameQuality=quality;
    shader.vertexShader=shader.vertexShader.replace('#include <common>',`#include <common>
     varying vec2 flamePoint;uniform float flameClock;
    `).replace('#include <begin_vertex>',`#include <begin_vertex>
     flamePoint=uv;
     transformed.y+=uv.x*.032*sin(uv.x*28.-flameClock*14.+uv.y*19.);
    `);
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
     varying vec2 flamePoint;uniform float flameClock;uniform float flameReach;uniform float flameQuality;
     float flameHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
     float flameNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(flameHash(i),flameHash(i+vec2(1.,0.)),f.x),mix(flameHash(i+vec2(0.,1.)),flameHash(i+1.),f.x),f.y);}
    `).replace('#include <color_fragment>',`#include <color_fragment>
     vec2 p=flamePoint;float side=abs(p.y-.5)*2.;
     vec2 flow=vec2(p.x*9.-flameClock*5.,p.y*7.);
     float warp=flameNoise(flow*.7+${layer}.7);
     float n=flameNoise(flow+vec2(warp*1.5,warp*.8));
     if(flameQuality>.5)n=n*.76+flameNoise(flow*2.7)*.24;
     float tips=flameReach-.075+warp*.075;
     float mask=(1.-smoothstep(tips,tips+.025,p.x))*(1.-smoothstep(.82,.99,side));
     float tongues=smoothstep(.16,.78,n)*(.65+.35*(1.-side));
     float heat=clamp(n*.95+(1.-p.x)*.3,0.,1.);
     vec3 fire=mix(vec3(.58,.025,.001),vec3(1.,.23,.007),smoothstep(.15,.62,heat));
     fire=mix(fire,vec3(1.,.81,.23),smoothstep(.62,.94,heat));
     diffuseColor.rgb=fire;diffuseColor.a*=mask*(.2+.8*tongues);
    `);
   };
   return material;
  });
  const fronts=materials.map((m,i)=>{const mesh=new Mesh(sheet,m);mesh.name=i?'burning-hands-upper-flame':'burning-hands-cone';mesh.frustumCulled=false;mesh.position.y=i*.015;mesh.scale.y=i?1.35:.5;root.add(mesh);return mesh;});
  const emberMaterial=bright.clone();emberMaterial.color.set('#ffd27b');materials.push(emberMaterial);
  const embers=new InstancedMesh(emberGeometry,emberMaterial,72);embers.name='burning-hands-embers';embers.frustumCulled=false;root.add(embers);
  const seeds=Array.from({length:72},(_,i)=>({u:(i+.5)/72,v:((i*.61803398875)%1)-.5,phase:(i*.41421356237)%1}));
  const emitterPoints=[new Vector3(.18,.17,0),new Vector3(.55,.13,-.13),new Vector3(.8,.15,.23)];
  fronts[0].userData.emitterPoint=emitterPoints[0];fronts[1].userData.emitterPoint=emitterPoints[1];embers.userData.emitterPoint=emitterPoints[2];
  return {root,parts:[...fronts,embers],materials,update(t:number,_persistent:boolean,reduced:boolean,_areaScale:number,end?:Vector3){
   const seconds=t*style.duration/1000;clock.value=seconds;quality.value=reduced?0:1;
   reach.value=Math.min(1,seconds/.26);
   const length=end?Math.hypot(end.x,end.z):1;
   root.rotation.y=end?-Math.atan2(end.z,end.x):0;root.scale.set(length,length,length);
   // Ignite at hand level, spreading down to the floor through the cone.
   root.position.y=0;
   embers.count=reduced?24:72;
   for(let i=0;i<embers.count;i++){
    const s=seeds[reduced?i*3:i],u=(seconds*1.8+s.phase)%1,x=u*reach.value;
    const scale=t<.8?.0035*(1-u):0;
    pose.position.set(x,.025+Math.sin(u*Math.PI)*(.1+s.u*.1),s.v*x*.95);
    pose.scale.set(scale,scale*.7,scale);pose.updateMatrix();embers.setMatrixAt(i,pose.matrix);
   }
   embers.instanceMatrix.needsUpdate=true;
  }};
 }
 return {build,dispose(){sheet.dispose();emberGeometry.dispose();}};
}
