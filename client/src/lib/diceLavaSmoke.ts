import * as THREE from 'three';
import {lavaNoise,lavaRenderOrder} from './diceLavaMaterial';

/** A small, continuous column of soft smoke above each ruptured die. Eight
 * camera-facing wisps share one draw; neither scene lights nor textures needed. */
export function createDiceLavaSmoke(parent:THREE.Group){
 const count=8,uniforms={time:{value:0},strength:{value:0},seed:{value:0}};
 const geometry=new THREE.PlaneGeometry(2,2);
 const opacity=new THREE.InstancedBufferAttribute(new Float32Array(count),1);
 geometry.setAttribute('smokeOpacity',opacity);
 const material=new THREE.ShaderMaterial({uniforms,vertexShader:`
 attribute float smokeOpacity;varying vec2 p;varying float floorHeight,fade;
 void main(){
  p=uv*2.-1.;fade=smokeOpacity;
  vec4 center=modelMatrix*instanceMatrix*vec4(0.,0.,0.,1.);
  mat4 transform=modelMatrix*instanceMatrix;
  vec2 size=vec2(length(transform[0].xyz),length(transform[1].xyz));
  vec3 right=vec3(viewMatrix[0][0],viewMatrix[1][0],viewMatrix[2][0]);
  vec3 up=vec3(viewMatrix[0][1],viewMatrix[1][1],viewMatrix[2][1]);
  vec3 world=center.xyz+right*position.x*size.x+up*position.y*size.y;
  floorHeight=(world.z-(modelMatrix*vec4(0.,0.,0.,1.)).z)/length(modelMatrix[2].xyz);
  gl_Position=projectionMatrix*viewMatrix*vec4(world,1.);
 }`,fragmentShader:`
 varying vec2 p;varying float floorHeight,fade;uniform float time,strength,seed;
 ${lavaNoise}
 void main(){
  vec2 flow=p*2.5+vec2(time*.13,-time*.28)+seed;
  vec2 curl=vec2(fbm(flow),fbm(flow+17.))-.5;
  vec2 q=p+curl*.40;
  float shape=1.-smoothstep(.22,1.,dot(q,q));
  float billow=fbm(flow+curl*1.3);
  float density=shape*smoothstep(.22,.72,billow);
  float alpha=density*strength*fade*smoothstep(.02,.12,floorHeight);
  if(alpha<.002)discard;
  // Warm at the source, turning to a soft charcoal-gray as the wisps rise.
  vec3 smoke=mix(vec3(.34,.12,.055),vec3(.29,.30,.32),smoothstep(.12,.75,floorHeight));
  smoke*=.78+billow*.48;
  gl_FragColor=vec4(smoke,alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
 }`,transparent:true,depthWrite:false,depthTest:true,side:THREE.DoubleSide});
 const wisps=new THREE.InstancedMesh(geometry,material,count);wisps.name='lava-smoke';
 wisps.renderOrder=lavaRenderOrder.smoke;wisps.frustumCulled=false;
 wisps.instanceMatrix.setUsage(THREE.DynamicDrawUsage);parent.add(wisps);wisps.visible=false;
 const transform=new THREE.Object3D();
 const duration=2.8;
 return {
  prewarm(enabled:boolean){wisps.visible=enabled;uniforms.strength.value=0;},
  update(now:number,age:number,visible:boolean,seed:number){
   wisps.visible=visible;uniforms.time.value=now/1000;uniforms.seed.value=seed;
   uniforms.strength.value=visible?THREE.MathUtils.smoothstep(age,.18,.6)*.42:0;
   for(let i=0;i<count;i++){
    const clock=Math.max(0,age-.18)-i*duration/count;
    const t=((clock%duration)+duration)%duration/duration;
    const phase=seed*1.7+i*2.399963;
    const curl=t*t;
    transform.position.set(Math.sin(phase)*.16+Math.sin(t*4.5+phase)*curl*.22,
     Math.cos(phase)*.12+Math.cos(t*3.8+phase)*curl*.18,.12+t*1.32);
    const width=.16+t*.32,height=.20+t*.38;
    // Expand while fading away; never shrink back into a round bubble.
    const envelope=clock<0?0:THREE.MathUtils.smoothstep(t,0,.13)*(1-THREE.MathUtils.smoothstep(t,.65,1));
    opacity.setX(i,envelope);transform.scale.set(width,height,1);transform.updateMatrix();
    wisps.setMatrixAt(i,transform.matrix);
   }
   wisps.instanceMatrix.needsUpdate=true;opacity.needsUpdate=true;
  },
  visible(){return wisps.visible&&uniforms.strength.value>0;},
  dispose(){parent.remove(wisps);wisps.dispose();geometry.dispose();material.dispose();},
 };
}
