import * as THREE from 'three';
import {lavaNoise,lavaSurface} from './diceLavaMaterial';

/** A brief radial spray of small molten flecks, with flattened impact splats.
 * Cosmetic and bounded: it never changes the authoritative dice or their faces. */
export function createDiceLavaRelease(parent:THREE.Group,uniforms:{time:{value:number};seed:{value:number}}){
 const count=14,group=new THREE.Group();group.visible=false;parent.add(group);
 const geometry=new THREE.IcosahedronGeometry(1,1);
 const material=new THREE.ShaderMaterial({uniforms,vertexShader:`varying vec3 p;
 void main(){p=position;gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.);}`,
 fragmentShader:`varying vec3 p;uniform float time,seed;${lavaNoise}${lavaSurface}
 void main(){float flow;vec3 color=moltenSurface(p.xy+p.z*.27,time,seed,.32,flow);
 gl_FragColor=vec4(color,1.);
 #include <tonemapping_fragment>
 #include <colorspace_fragment>
 }`});
 const drops=new THREE.InstancedMesh(geometry,material,count);drops.frustumCulled=false;drops.instanceMatrix.setUsage(THREE.DynamicDrawUsage);group.add(drops);
 const splatGeometry=new THREE.PlaneGeometry(2,2);
 const splatMaterial=new THREE.ShaderMaterial({uniforms,vertexShader:`varying vec2 p;
 void main(){p=uv*2.-1.;gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.);}`,
 fragmentShader:`varying vec2 p;uniform float time,seed;${lavaNoise}${lavaSurface}
 void main(){float edge=length(p)-(.7+(noise(p*7.+seed)-.5)*.34);if(edge>0.)discard;
 float flow;vec3 color=moltenSurface(p,time,seed,.45,flow);
 gl_FragColor=vec4(color,1.-smoothstep(-.12,0.,edge));
 #include <tonemapping_fragment>
 #include <colorspace_fragment>
 }`,transparent:true,depthWrite:false});
 const splats=new THREE.InstancedMesh(splatGeometry,splatMaterial,count);splats.frustumCulled=false;splats.instanceMatrix.setUsage(THREE.DynamicDrawUsage);group.add(splats);
 const transform=new THREE.Object3D();
 let height=.5,seed=0,firstImpact=.25,lastImpact=.7;
 const random=(i:number)=>{const n=Math.sin(i*127.1+seed*13.7)*43758.5453;return n-Math.floor(n);};
 const flight=(i:number)=>{
  const angle=random(i+21)*Math.PI*2,speed=1.8+random(i+5)*2.8,vz=.65+random(i+3)*1.5,g=15;
  const impact=(vz+Math.sqrt(vz*vz+2*g*height))/g;
  return {angle,speed,vz,g,impact,size:.023+random(i+8)*.034};
 };
 return {
  start(releaseHeight:number,value:number){height=releaseHeight;seed=value;firstImpact=Infinity;lastImpact=0;
   for(let i=0;i<count;i++){const t=flight(i).impact;firstImpact=Math.min(firstImpact,t);lastImpact=Math.max(lastImpact,t);}
  },
  impact(){return firstImpact;},end(){return lastImpact;},
  prewarm(enabled:boolean){group.visible=enabled;material.colorWrite=splatMaterial.colorWrite=!enabled;drops.count=splats.count=count;},
  active(){return drops.count>0;},
  update(age:number,visible:boolean){
   group.visible=visible;drops.count=0;splats.count=0;if(!visible||age<0)return;
   for(let i=0;i<count;i++){
    const f=flight(i),t=Math.min(age,f.impact),x=Math.cos(f.angle)*t*f.speed,y=Math.sin(f.angle)*t*f.speed;
    if(age<f.impact){
     const z=height+f.vz*t-.5*f.g*t*t;
     transform.position.set(x,y,z);transform.rotation.set(0,0,f.angle);
     // Thin tapered flecks travel outward instead of heavy falling globes.
     transform.scale.set(f.size*(2.8+t*2),f.size*.7,f.size*(1.3+t));transform.updateMatrix();drops.setMatrixAt(drops.count++,transform.matrix);
    }else{
     transform.position.set(x,y,.023+i*.0001);transform.rotation.set(0,0,f.angle);
     transform.scale.set(f.size*(3.5+random(i+33)*2),f.size*(1.8+random(i+34)),1);transform.updateMatrix();splats.setMatrixAt(splats.count++,transform.matrix);
    }
   }
   drops.instanceMatrix.needsUpdate=true;splats.instanceMatrix.needsUpdate=true;
  },
  clear(){group.visible=false;drops.count=splats.count=0;},
  dispose(){parent.remove(group);drops.dispose();splats.dispose();geometry.dispose();splatGeometry.dispose();material.dispose();splatMaterial.dispose();},
 };
}
