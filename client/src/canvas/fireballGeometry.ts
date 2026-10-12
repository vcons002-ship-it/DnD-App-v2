import {Data3DTexture,Group,LinearFilter,Mesh,MeshBasicMaterial,RedFormat,RepeatWrapping,SphereGeometry,Vector3} from 'three';
import {FIREBALL_FLIGHT_MS,spellLightEnvelope,type SpellImpactStyle} from '../../../shared/spellImpact';
import {createFireballFlameFront} from './fireballFlameFront';

/** One expanding hemisphere filled with fire, not separate puffs or a hollow
 * ring. Its folded leading crest shares the expansion and 3D noise. */
export function createFireballGeometry(){
 const sphere=new SphereGeometry(1,24,16),dome=new SphereGeometry(1,64,32,0,Math.PI*2,0,Math.PI/2);
 const width=32,data=new Uint8Array(width**3);let seed=721347;
 for(let i=0;i<data.length;i++){seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;data[i]=seed>>>24;}
 const noise=new Data3DTexture(data,width,width,width);noise.format=RedFormat;
 noise.minFilter=noise.magFilter=LinearFilter;noise.wrapS=noise.wrapT=noise.wrapR=RepeatWrapping;
 noise.unpackAlignment=1;noise.needsUpdate=true;
 const flameFront=createFireballFlameFront();
 function build(style:SpellImpactStyle,body:MeshBasicMaterial,bright:MeshBasicMaterial,white:MeshBasicMaterial){
  const root=new Group(),parts:Mesh[]=[],materials:MeshBasicMaterial[]=[];
  const hot=white.clone();hot.color.set('#fff3b1');materials.push(hot);
  const flame=body.clone();flame.color.set('#f46b16');flame.userData.opacityScale=.6;materials.push(flame);
  const surface=body.clone();surface.userData.opacityScale=1;surface.forceSinglePass=true;materials.push(surface);
  const clock={value:0},quality={value:32},eye={value:new Vector3()};
  surface.customProgramCacheKey=()=> 'fireball-volume-dome-v1';
  surface.onBeforeCompile=shader=>{
   shader.uniforms.fireClock=clock;shader.uniforms.fireEye=eye;
   shader.uniforms.fireNoise={value:noise};shader.uniforms.fireSteps=quality;
   shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 fireLocal;')
    .replace('#include <begin_vertex>','#include <begin_vertex>\ntransformed.y*=.78;fireLocal=transformed;');
   shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
    varying vec3 fireLocal;uniform vec3 fireEye;uniform float fireClock;uniform float fireSteps;
    precision highp sampler3D;uniform sampler3D fireNoise;
    float fireField(vec3 p){return texture(fireNoise,p*.115).r*.67+texture(fireNoise,p*.253+vec3(.19,.37,.51)).r*.33;}
   `).replace('#include <color_fragment>',`#include <color_fragment>
    vec3 ray=normalize(fireLocal-fireEye),o=fireEye/vec3(1.,.78,1.),d=ray/vec3(1.,.78,1.);
    float aa=dot(d,d),bb=dot(o,d),cc=dot(o,o)-1.;
    float disc=max(0.,bb*bb-aa*cc);
    float entry=max(0.,(-bb-sqrt(disc))/aa),exitAt=(-bb+sqrt(disc))/aa;
    // Only the hemisphere above the map burns; there is no ring-shaped hole.
    if(ray.y<-.0001)exitAt=min(exitAt,-fireEye.y/ray.y);
    float stride=max(0.,exitAt-entry)/fireSteps;
    vec3 accumulated=vec3(0.);float opacity=0.;
    for(int stepIndex=0;stepIndex<32;stepIndex++){
     if(float(stepIndex)>=fireSteps||opacity>.985)break;
     vec3 p=fireEye+ray*(entry+(float(stepIndex)+.5)*stride);
     float radius=length(p/vec3(1.,.78,1.));
    vec3 advect=vec3(p.x*6.,p.y*3.2-fireClock*2.2,p.z*6.);
    float turn=p.y*1.8+fireClock*.6;
    advect.xz=mat2(cos(turn),-sin(turn),sin(turn),cos(turn))*advect.xz;
     // Advected, warped layers form continuous rolling folds throughout the
     // volume. Fine ripples belong to the fire, not a painted dome surface.
     float warp=fireField(advect*.54+vec3(0.,fireClock*.32,0.));
     float n=clamp((fireField(advect+vec3(warp*1.4,0.,warp*.8))-.38)*2.7,0.,1.);
     float edge=1.-smoothstep(.81+.10*n,.99,radius);
     float density=(.07+.93*smoothstep(.18,.73,n))*edge;
     density*=smoothstep(0.,.04,p.y);
     float heat=clamp(.13+n*.82+(1.-radius)*.05,0.,1.);
     vec3 fire=mix(vec3(.10,.006,.001),vec3(.85,.052,.002),smoothstep(.12,.45,heat));
     fire=mix(fire,vec3(1.,.34,.008),smoothstep(.39,.73,heat));
     fire=mix(fire,vec3(1.,.78,.16),smoothstep(.73,.93,heat));
     fire=mix(fire,vec3(1.,.97,.62),smoothstep(.93,1.,heat));
     float a=1.-exp(-density*stride*6.2);
     accumulated+=(1.-opacity)*fire*a;opacity+=(1.-opacity)*a;
    }
    diffuseColor.rgb=accumulated/max(.001,opacity)*vec3(1.,.64,.38);
    diffuseColor.a*=opacity;
   `);
  };
  const add=(material:MeshBasicMaterial)=>{const mesh=new Mesh(sphere,material);root.add(mesh);parts.push(mesh);return mesh;};
  const orb=add(flame),core=add(hot),shell=add(bright),trail=Array.from({length:12},()=>add(bright));
  const front=new Mesh(dome,surface);front.name='fireball-continuous-front';front.frustumCulled=false;root.add(front);parts.push(front);
  front.onBeforeRender=(_renderer,_scene,camera)=>{camera.getWorldPosition(eye.value);front.worldToLocal(eye.value);};
  front.userData.emitterPoints=Array.from({length:3},(_,i)=>new Vector3(Math.cos(i*Math.PI*2/3)*.65,.43,Math.sin(i*Math.PI*2/3)*.65));
  const crestSurface=flameFront.build(body,noise,clock);root.add(crestSurface.mesh);parts.push(crestSurface.mesh);materials.push(crestSurface.material);
  const origin=new Vector3(),at=new Vector3(),target=new Vector3(0,.025,0),arc=new Vector3();
  const path=(u:number)=>at.lerpVectors(origin,target,u).add(arc.set(0,Math.sin(u*Math.PI)*.045,0));
  return {root,parts,materials,update(t:number,_persistent:boolean,reduced:boolean,_areaScale:number,source?:Vector3){
   const age=t*style.duration,flight=age<FIREBALL_FLIGHT_MS;
   clock.value=reduced?0:age/1000;quality.value=reduced?16:32;origin.copy(source??target);
   const u=Math.min(1,age/FIREBALL_FLIGHT_MS),q=Math.max(0,(age-FIREBALL_FLIGHT_MS)/(style.duration-FIREBALL_FLIGHT_MS));
   const crest=spellLightEnvelope(age-FIREBALL_FLIGHT_MS,style.duration-FIREBALL_FLIGHT_MS);
   for(const mesh of [orb,core,shell]){mesh.visible=flight;mesh.position.copy(path(u));}
   orb.scale.setScalar(.026*(1+.08*Math.sin(age*.05)));core.scale.setScalar(.015);shell.scale.setScalar(.039);
   trail.forEach((m,i)=>{const v=u-(i+1)*.018;m.visible=flight&&v>=0;m.position.copy(path(Math.max(0,v)));m.scale.setScalar(.018*(1-i/13));});
   const growth=1-Math.pow(1-Math.min(1,q/.42),2);
   front.visible=!flight;front.scale.setScalar(.5*Math.max(.015,growth));front.position.y=.012;
   crestSurface.mesh.visible=!flight;crestSurface.mesh.scale.copy(front.scale);crestSurface.mesh.position.y=.016;
   flame.opacity=flight?.8:0;hot.opacity=flight?1:0;surface.opacity=crest*.82;crestSurface.material.opacity=crest*.94;
  }};
 }
 return {build,dispose(){sphere.dispose();dome.dispose();flameFront.dispose();noise.dispose();}};
}
