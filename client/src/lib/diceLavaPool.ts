import * as THREE from 'three';

const vertex=`varying vec2 poolUV;
void main(){poolUV=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`;
const noise=`
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
 return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
float fbm(vec2 p){return noise(p)*.57+noise(p*2.03)*.28+noise(p*4.07)*.15;}
float boundary(vec2 p){return length(p)-(.77+(fbm(p*4.+seed)-.5)*.22);}
`;
/** One persistent, die-sized molten puddle per confirmed maximum. No simulation,
 * particles, lights, or extra render passes; glow stays on the tray floor. */
export function createDiceLavaPool(parent:THREE.Group){
 const uniforms={time:{value:0},alpha:{value:0},spread:{value:0},seed:{value:0}};
 const declarations='varying vec2 poolUV;uniform float time,alpha,spread,seed;';
 const material=new THREE.ShaderMaterial({uniforms,vertexShader:vertex,fragmentShader:declarations+noise+`
 void main(){
  vec2 p=(poolUV*2.-1.)/max(.01,spread);
  float edge=boundary(p);if(edge>.025)discard;
  vec2 drift=vec2(time*.055,-time*.035);
  vec2 warp=vec2(fbm(p*3.+drift+seed),fbm(p*3.-drift+seed+13.))-.5;
  vec2 q=p*5.+warp*1.15+drift;
  // Irregular cooling plates float over the hot moving liquid beneath them.
  vec2 cell=floor(q),f=fract(q);float nearest=8.,second=8.;
  for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){
   vec2 g=vec2(float(x),float(y)),o=vec2(hash(cell+g+seed),hash(cell+g+seed+41.));
   vec2 d=g+o-f;float r=dot(d,d);
   if(r<nearest){second=nearest;nearest=r;}else second=min(second,r);
  }
  float seam=1.-smoothstep(.025,.19,second-nearest);
  float flow=fbm(p*6.+warp*2.+drift*1.7+seed);
  float plate=smoothstep(.47,.64,flow)*(1.-seam);
  float rim=smoothstep(-.15,-.015,edge);
  float hot=clamp(.30+flow*.70+seam*.30,0.,1.);
  vec3 lava=mix(vec3(.85,.015,.0008),vec3(3.8,.78,.035),hot);
  lava*=.93+.07*sin(time*1.8+flow*8.);
  vec3 crust=vec3(.008,.004,.003)+vec3(.035,.012,.004)*flow;
  vec3 color=mix(lava,crust,plate*.84);
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
 const dropGeometry=new THREE.SphereGeometry(1,20,14);
 const dropMaterial=new THREE.ShaderMaterial({uniforms,vertexShader:`uniform float time;varying vec3 liquidPos;
 void main(){liquidPos=position;vec3 p=position*(1.+.055*sin(position.y*7.+time*13.));gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);}`,fragmentShader:'uniform float time,seed;'+noise+`
 varying vec3 liquidPos;
 void main(){float flow=fbm(liquidPos.xy*4.+liquidPos.z+seed+vec2(time*.3,-time*.2));
 vec3 color=mix(vec3(1.8,.065,.001),vec3(4.,1.2,.06),flow);
 color*=.8+.2*abs(liquidPos.z);gl_FragColor=vec4(color,1.);
 #include <tonemapping_fragment>
 #include <colorspace_fragment>
 }`});
 const drop=new THREE.Mesh(dropGeometry,dropMaterial);drop.visible=false;
 const group=new THREE.Group();group.visible=false;group.userData.dicePowerArt=true;group.add(glow,surface,drop);parent.add(group);
 let releaseHeight=0;
 surface.position.z=.018;surface.renderOrder=2;glow.position.z=.012;glow.scale.setScalar(2.4);glow.renderOrder=1;
 return {
  start(origin:THREE.Vector3,radius:number,floor:number,seed:number){group.position.set(origin.x,origin.y,floor);group.scale.setScalar(radius*1.5);uniforms.seed.value=seed;releaseHeight=Math.max(.35,(origin.z-floor)/(radius*1.5));},
  prewarm(enabled:boolean){group.visible=enabled;drop.visible=enabled;dropMaterial.colorWrite=!enabled;uniforms.alpha.value=0;},
  visible(){return group.visible&&uniforms.alpha.value>0;},
  dropping(){return group.visible&&drop.visible;},
  update(now:number,age:number,visible:boolean){
   group.visible=visible;uniforms.time.value=now/1000;
   const fall=THREE.MathUtils.clamp(age/.22,0,1);
   drop.visible=visible&&fall<1;drop.position.z=releaseHeight*(1-fall*fall);
   drop.scale.set(.30*(1-fall*.15),.30*(1-fall*.15),.30*(1+fall*.8));
   uniforms.alpha.value=visible?THREE.MathUtils.smoothstep(age,.18,.32):0;
   uniforms.spread.value=THREE.MathUtils.lerp(.20,1,THREE.MathUtils.smoothstep(age,.18,.65));
  },
  clear(){group.visible=false;drop.visible=false;uniforms.alpha.value=0;},
  dispose(){parent.remove(group);geometry.dispose();dropGeometry.dispose();material.dispose();glowMaterial.dispose();dropMaterial.dispose();},
 };
}
