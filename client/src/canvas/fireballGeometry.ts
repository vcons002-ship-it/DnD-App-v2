import {Group,Mesh,MeshBasicMaterial,SphereGeometry,TorusGeometry,Vector3} from 'three';
import {FIREBALL_FLIGHT_MS,spellLightEnvelope,type SpellImpactStyle} from '../../../shared/spellImpact';

/** One orb, one area explosion. Coordinates are relative to the actual diameter,
 * so the outer fire front reaches the selected radius on every map scale. */
export function createFireballGeometry(){
 const sphere=new SphereGeometry(1,24,16),ring=new TorusGeometry(1,.015,6,48);
 function build(style:SpellImpactStyle,body:MeshBasicMaterial,bright:MeshBasicMaterial,white:MeshBasicMaterial){
  const root=new Group(),parts:Mesh[]=[],materials:MeshBasicMaterial[]=[];
  const hot=white.clone();hot.color.set('#fff3b1');materials.push(hot);
  const flame=body.clone();flame.color.set('#f46b16');flame.userData.opacityScale=.6;materials.push(flame);
  // Turbulent fire lives on the expanding lobes rather than reading as smooth
  // translucent orange balloons. Shared shader/material: no image downloads.
  const clock={value:0};
  flame.customProgramCacheKey=()=> 'fireball-turbulence-v1';
  flame.onBeforeCompile=shader=>{
   shader.uniforms.fireClock=clock;
   shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 fireLocal;').replace('#include <begin_vertex>','#include <begin_vertex>\nfireLocal=position;');
   shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
varying vec3 fireLocal;uniform float fireClock;
float fh(vec3 p){return fract(sin(dot(p,vec3(17.3,41.7,113.5)))*43758.5453);}
float fn(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
 return mix(mix(mix(fh(i),fh(i+vec3(1,0,0)),f.x),mix(fh(i+vec3(0,1,0)),fh(i+vec3(1,1,0)),f.x),f.y),
 mix(mix(fh(i+vec3(0,0,1)),fh(i+vec3(1,0,1)),f.x),mix(fh(i+vec3(0,1,1)),fh(i+vec3(1,1,1)),f.x),f.y),f.z);}
`).replace('#include <color_fragment>',`#include <color_fragment>
 vec3 fp=fireLocal*3.2+vec3(0.,-fireClock*1.8,fireClock*.2);
 float f=fn(fp)*.65+fn(fp*2.3)*.35;
 diffuseColor.rgb=mix(vec3(.65,.025,.003),vec3(1.,.78,.14),smoothstep(.24,.76,f));
 diffuseColor.rgb=mix(diffuseColor.rgb,vec3(1.,.96,.68),smoothstep(.73,.91,f));
 diffuseColor.a*=smoothstep(.13,.44,f)*.83;
`);
  };
  const add=(material:MeshBasicMaterial)=>{const mesh=new Mesh(sphere,material);root.add(mesh);parts.push(mesh);return mesh;};
  const orb=add(flame),core=add(hot),shell=add(bright),trail=Array.from({length:12},()=>add(bright));
  const clouds=Array.from({length:18},()=>add(flame));
  const front=new Mesh(ring,bright);front.rotation.x=-Math.PI/2;root.add(front);parts.push(front);
  const origin=new Vector3(),at=new Vector3(),target=new Vector3(0,.025,0);
  const path=(u:number)=>at.lerpVectors(origin,target,u).add(new Vector3(0,Math.sin(u*Math.PI)*.045,0));
  return {root,parts,materials,update(t:number,_persistent:boolean,_reduced:boolean,_areaScale:number,source?:Vector3){
   const age=t*style.duration,flight=age<FIREBALL_FLIGHT_MS;
   clock.value=age/1000;
   origin.copy(source??target);
   const u=Math.min(1,age/FIREBALL_FLIGHT_MS),q=Math.max(0,(age-FIREBALL_FLIGHT_MS)/(style.duration-FIREBALL_FLIGHT_MS));
   const crest=spellLightEnvelope(age-FIREBALL_FLIGHT_MS,style.duration-FIREBALL_FLIGHT_MS);
   for(const mesh of [orb,core,shell]){mesh.visible=flight;mesh.position.copy(path(u));}
   orb.scale.setScalar(.026*(1+.08*Math.sin(age*.05)));core.scale.setScalar(.015);shell.scale.setScalar(.039);
   trail.forEach((m,i)=>{const v=u-(i+1)*.018;m.visible=flight&&v>=0;m.position.copy(path(Math.max(0,v)));m.scale.setScalar(.018*(1-i/13));});
   clouds.forEach((m,i)=>{
    m.visible=!flight;
    const a=i*2.399963,z=1-2*(i+.5)/clouds.length,r=Math.sqrt(1-z*z);
    const growth=Math.min(1,q/.23),radius=.30*growth;
    m.position.set(Math.cos(a)*r*radius,.035+Math.abs(z)*radius*.65,Math.sin(a)*r*radius);
    const puff=(.13+.025*Math.sin(i*7.3+q*5))*growth*(.55+.45*crest);
    m.scale.set(puff*(1+.16*Math.sin(i)),puff*(1.2+.2*Math.cos(i)),puff);
    m.rotation.set(q*.8+i,i*.7,q*.3);
   });
   // A low expanding flame front makes the complete 20-foot footprint readable.
   front.visible=!flight;front.position.y=.022;front.scale.setScalar(.5*Math.min(1,q/.25));
   flame.opacity=flight?.8:crest*.65;hot.opacity=flight?1:crest*.8;
  }};
 }
 return {build,dispose(){sphere.dispose();ring.dispose();}};
}
