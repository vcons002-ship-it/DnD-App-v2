import {BoxGeometry,CircleGeometry,ConeGeometry,CylinderGeometry,DoubleSide,Group,InstancedMesh,Mesh,MeshBasicMaterial,Object3D,SphereGeometry,TorusGeometry,Vector3,type BufferGeometry} from 'three';
import type {SpellImpactStyle} from '../../../shared/spellImpact.js';

/** Diameter-normalized fields: a selected square, disk or cylinder belongs to
 * the spell, never to each victim. Shared meshes and instanced splinters keep
 * the cost bounded when several creatures are caught in one area. */
export function createAreaImpactGeometry(){
 const disk=new CircleGeometry(.5,64),ring=new TorusGeometry(.5,.013,6,64),
   cube=new BoxGeometry(1,1,1),column=new CylinderGeometry(.5,.5,1,48,20,true),
   crystal=new ConeGeometry(1,3,5),iceDome=new SphereGeometry(.5,32,12,0,Math.PI*2,0,Math.PI/2);
 function build(style:SpellImpactStyle,body:MeshBasicMaterial,bright:MeshBasicMaterial,white:MeshBasicMaterial){
  const root=new Group(),parts:Mesh[]=[],materials:MeshBasicMaterial[]=[],clock={value:0},phase={value:0};
  const add=(geometry:BufferGeometry,material:MeshBasicMaterial,name:string)=>{const m=new Mesh(geometry,material);m.name=name;m.frustumCulled=false;root.add(m);parts.push(m);return m;};
  const surface=body.clone();surface.side=DoubleSide;surface.forceSinglePass=true;materials.push(surface);
  const columnEffect=style.kind==='flame-column',square=style.kind==='thunder-cube',ice=style.kind==='ice-splash';
  surface.customProgramCacheKey=()=>`area-impact-${style.kind}-v2`;
  surface.onBeforeCompile=shader=>{
   shader.uniforms.areaClock=clock;shader.uniforms.areaPhase=phase;
   shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 areaPoint;')
    .replace('#include <begin_vertex>','#include <begin_vertex>\nareaPoint=position;');
   shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
    varying vec3 areaPoint;uniform float areaClock;uniform float areaPhase;
    float fieldHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
    float fieldNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(fieldHash(i),fieldHash(i+vec2(1.,0.)),f.x),mix(fieldHash(i+vec2(0.,1.)),fieldHash(i+1.),f.x),f.y);}
   `).replace('#include <color_fragment>',columnEffect?`#include <color_fragment>
    float angle=atan(areaPoint.z,areaPoint.x);
    vec2 p=vec2(angle*3.,areaPoint.y*7.-areaClock*3.);
    float n=fieldNoise(p+fieldNoise(p*.7)*1.2);
    float radiant=pow(max(0.,sin(angle*11.+areaPoint.y*2.-areaClock*.7)),12.);
    vec3 flame=mix(vec3(.65,.035,.002),vec3(1.,.48,.04),n);
    diffuseColor.rgb=mix(flame,vec3(1.,.94,.64),radiant*.8+smoothstep(.77,1.,n)*.3);
    diffuseColor.a*= (.25+.6*n+radiant*.15)*smoothstep(-.5,-.35,areaPoint.y)*(1.-smoothstep(.35,.5,areaPoint.y));
   `:ice?`#include <color_fragment>
    float r=length(areaPoint.xy)*2.;
    float frost=fieldNoise(areaPoint.xy*25.+fieldNoise(areaPoint.xy*9.)*2.);
    float fractures=pow(1.-abs(sin(areaPoint.x*46.+fieldNoise(areaPoint.xy*14.)*5.)),12.);
    float rim=1.-smoothstep(.02,.13,abs(r-.94));
    diffuseColor.rgb=mix(vec3(.12,.51,.76),vec3(.82,.96,1.),frost*.55+fractures*.3+rim*.25);
    diffuseColor.a*= (.2+frost*.3+fractures*.2+rim*.25)*(1.-smoothstep(.96,1.,r));
   `:`#include <color_fragment>
    float r=${square?'max(abs(areaPoint.x),abs(areaPoint.z))*2.':'length(areaPoint.xy)*2.'};
    float front=clamp(areaPhase/.55,0.,1.);
    float n=fieldNoise(areaPoint.${square?'xz':'xy'}*22.+areaClock*.8);
    float band=1.-smoothstep(.025,.12,abs(r-front)+(n-.5)*.025);
    float inner=(1.-smoothstep(front-.16,front,r))*.12;
    diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.92,.96,1.),band*.6);
    diffuseColor.a*= band*.8+inner;
   `);
  };
  const field=add(columnEffect?column:square?cube:disk,surface,`${style.kind}-field`);
  if(!columnEffect&&!square)field.rotation.x=-Math.PI/2;
  field.userData.emitterPoint=new Vector3(0,columnEffect?.1:0,0);
  const edge=add(ring,bright,`${style.kind}-front`);edge.rotation.x=-Math.PI/2;
  const coreMaterial=white.clone();coreMaterial.color.set(columnEffect?'#fff1b7':ice?'#e6faff':'#eadfff');coreMaterial.userData.opacityScale=.6;materials.push(coreMaterial);
  const core=add(columnEffect?column:disk,coreMaterial,`${style.kind}-core`);
  if(!columnEffect)core.rotation.x=-Math.PI/2;
  core.userData.emitterPoint=new Vector3(0,columnEffect?.3:0,0);
  const splinterMaterial=bright.clone();splinterMaterial.color.set(ice?'#c8f3ff':columnEffect?'#ffe292':'#d6c2ff');materials.push(splinterMaterial);
  const splinters=new InstancedMesh(crystal,splinterMaterial,64);splinters.name=`${style.kind}-splinters`;splinters.frustumCulled=false;root.add(splinters);parts.push(splinters);
  splinters.userData.emitterPoint=new Vector3(.26,.04,-.22);
  const domeMaterial=ice?bright.clone():undefined;
  if(domeMaterial){domeMaterial.side=DoubleSide;domeMaterial.forceSinglePass=true;domeMaterial.userData.opacityScale=.28;materials.push(domeMaterial);}
  const dome=domeMaterial?add(iceDome,domeMaterial,'ice-splash-dome'):undefined;
  if(dome)dome.userData.emitterPoint=new Vector3(0,.24,0);
  const pose=new Object3D();
  return {root,parts,materials,update(t:number,_persistent:boolean,reduced:boolean,_areaScale:number,end?:Vector3){
   const seconds=t*style.duration/1000;clock.value=seconds;phase.value=t;
   if(square)root.rotation.y=end?-Math.atan2(end.z,end.x):0;
   const growth=ice?1:Math.min(1,t/.55),fade=Math.max(0,1-t);
   field.position.y=columnEffect?1:.012;field.scale.set(1,columnEffect?2:square?.32:1,1);
   if(square)field.position.y=.16;
   edge.visible=!square;edge.scale.setScalar(Math.max(.01,growth));edge.position.y=.02;
   edge.material.opacity=fade*(ice?.9:.75);
   core.position.y=columnEffect?1:.02;core.scale.set(columnEffect?.10:growth,columnEffect?2:1,columnEffect?.10:growth);
   core.material.opacity=columnEffect?fade*.18:fade*.07;
   if(dome){dome.position.y=.015;dome.scale.set(1,.22+Math.sin(Math.min(1,t*3)*Math.PI)*.30,1);dome.visible=t<.5;dome.material.opacity=Math.max(0,1-t*2)*.23;}
   splinters.count=reduced?20:64;
   for(let i=0;i<splinters.count;i++){
    const index=reduced?i*3:i,a=index*2.399963,seed=(index*.41421356237)%1;
    const r=ice?Math.min(.49,.08+Math.sqrt(seed)*.34+t*.12):columnEffect?Math.sqrt(seed)*.45:Math.min(.49,t*.9)*(.65+seed*.35);
    const x=square?Math.cos(a)*r*.95:Math.cos(a)*r,z=square?Math.sin(a)*r*.95:Math.sin(a)*r;
    const y=columnEffect?.08+((seconds*.75+seed)%1)*1.85:ice?.04+Math.sin(Math.min(1,t*2.1+.16)*Math.PI)*(.12+.22*seed):.015+Math.sin(Math.min(1,t*1.6)*Math.PI)*(.09+.2*seed);
    pose.position.set(x,y,z);pose.rotation.set(a,seed*5,a+seconds*(ice?2:.4));
    const size=(ice?.025:columnEffect?.007:.009)*fade;
    pose.scale.set(size,size*(ice?1.6:1),size);pose.updateMatrix();splinters.setMatrixAt(i,pose.matrix);
   }
   splinters.instanceMatrix.needsUpdate=true;
  }};
 }
 return {build,dispose(){[disk,ring,cube,column,crystal,iceDome].forEach(g=>g.dispose());}};
}
