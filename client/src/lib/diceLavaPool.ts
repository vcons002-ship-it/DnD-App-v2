import * as THREE from 'three';
import {createDiceLavaRelease} from './diceLavaRelease';
import {lavaNoise,lavaSurface} from './diceLavaMaterial';

const vertex=`varying vec2 poolUV;
void main(){poolUV=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`;
const noise=lavaNoise+`
float boundary(vec2 p){return length(p)-(.77+(fbm(p*4.+seed)-.5)*.22);}
`;
/** One persistent, die-sized molten puddle per confirmed maximum. Its bounded
 * visual release needs no fluid solver or lights; glow stays on the tray floor. */
export function createDiceLavaPool(parent:THREE.Group){
 const uniforms={time:{value:0},alpha:{value:0},spread:{value:0},seed:{value:0}};
 const declarations='varying vec2 poolUV;uniform float time,alpha,spread,seed;';
 const material=new THREE.ShaderMaterial({uniforms,vertexShader:vertex,fragmentShader:declarations+noise+lavaSurface+`
 void main(){
  vec2 p=(poolUV*2.-1.)/max(.01,spread);
  float edge=boundary(p);if(edge>.025)discard;
  float flow;vec3 color=moltenSurface(p,time,seed,.84,flow);
  float rim=smoothstep(-.15,-.015,edge);
  vec3 crust=vec3(.008,.004,.003)+vec3(.035,.012,.004)*flow;
  color=mix(color,crust,rim*.94);
  // A glassy rolled edge and small highlights give the surface its wet relief.
  float h=flow*.07+rim*.08;
  vec3 n=normalize(vec3(-dFdx(h)*110.,-dFdy(h)*110.,1.));
  color+=vec3(.8,.23,.035)*pow(max(0.,dot(n,normalize(vec3(-.4,.6,1.)))),34.)*.24;
  gl_FragColor=vec4(color,alpha*(1.-smoothstep(0.,.025,edge)));
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
 }`,transparent:true,depthWrite:false,side:THREE.DoubleSide});
 const glowMaterial=new THREE.ShaderMaterial({uniforms,vertexShader:vertex,fragmentShader:declarations+noise+`
 void main(){vec2 p=(poolUV*2.-1.)*2.4;
  float r=length(p),halo=exp(-r*r*2.1)*(1.-smoothstep(1.45,2.2,r));
  halo*=.94+.06*sin(time*1.8+seed);
  gl_FragColor=vec4(vec3(1.,.18,.009)*halo,alpha*spread*.50);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
 }`,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide});
 const geometry=new THREE.PlaneGeometry(2,2),surface=new THREE.Mesh(geometry,material),glow=new THREE.Mesh(geometry,glowMaterial);
 const group=new THREE.Group();group.visible=false;group.userData.dicePowerArt=true;group.add(glow,surface);parent.add(group);
 const release=createDiceLavaRelease(group,uniforms);
 surface.position.z=.018;surface.renderOrder=2;glow.position.z=.012;glow.scale.setScalar(2.4);glow.renderOrder=1;
 return {
  start(origin:THREE.Vector3,radius:number,floor:number,seed:number){group.position.set(origin.x,origin.y,floor);group.scale.setScalar(radius*1.5);uniforms.seed.value=seed;release.start(Math.max(.35,(origin.z-floor)/(radius*1.5)),seed);},
  prewarm(enabled:boolean){group.visible=enabled;release.prewarm(enabled);uniforms.alpha.value=0;},
  visible(){return group.visible&&uniforms.alpha.value>0;},
  dropping(){return group.visible&&release.active();},
  update(now:number,age:number,visible:boolean){
   group.visible=visible;uniforms.time.value=now/1000;
   release.update(age,visible);
   uniforms.alpha.value=visible?THREE.MathUtils.smoothstep(age,release.impact(),release.impact()+.18):0;
   uniforms.spread.value=THREE.MathUtils.lerp(.20,1,THREE.MathUtils.smoothstep(age,release.impact(),release.end()+.25));
  },
  clear(){group.visible=false;release.clear();uniforms.alpha.value=0;},
  dispose(){release.dispose();parent.remove(group);geometry.dispose();material.dispose();glowMaterial.dispose();},
 };
}
