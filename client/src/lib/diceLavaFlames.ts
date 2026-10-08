import * as THREE from 'three';
import {lavaNoise} from './diceLavaMaterial';

/** Four low tongues of fire, attached to the small pool in 3D, no dynamic lights. */
export function createDiceLavaFlames(parent:THREE.Group){
 const uniforms={time:{value:0},strength:{value:0},seed:{value:0}};
 const material=new THREE.ShaderMaterial({uniforms,vertexShader:`varying vec2 p;
 void main(){p=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
 fragmentShader:`varying vec2 p;uniform float time,strength,seed;${lavaNoise}
 void main(){float y=p.y,x=(p.x-.5)*2.;
 float bend=(noise(vec2(y*3.-time*2.8,seed))-.5)*y*.8;
 float taper=(1.-y)*.55+.04,body=1.-smoothstep(taper*.25,taper,abs(x-bend));
 float flicker=fbm(vec2(x*4.+seed,y*6.-time*4.));
 float alpha=body*smoothstep(0.,.1,y)*(1.-smoothstep(.65,1.,y+flicker*.22))*strength;
 vec3 color=mix(vec3(3.5,.22,.005),vec3(5.,2.1,.20),pow(1.-y,3.));
 gl_FragColor=vec4(color,alpha*.72);
 #include <tonemapping_fragment>
 #include <colorspace_fragment>
 }`,transparent:true,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending});
 const geometry=new THREE.PlaneGeometry(.45,.65),group=new THREE.Group();parent.add(group);group.visible=false;
 for(let i=0;i<4;i++){const mesh=new THREE.Mesh(geometry,material);mesh.position.set(Math.cos(i*2.4)*.28,Math.sin(i*2.4)*.23,.30);mesh.rotation.set(Math.PI/2,0,i*1.2);group.add(mesh);}
 return {prewarm(enabled:boolean){group.visible=enabled;},update(now:number,age:number,visible:boolean,seed:number){group.visible=visible;uniforms.time.value=now/1000;uniforms.seed.value=seed;uniforms.strength.value=visible?THREE.MathUtils.smoothstep(age,.12,.4)*(.72+.14*Math.sin(now*.006+seed)):0;},dispose(){parent.remove(group);geometry.dispose();material.dispose();}};
}
