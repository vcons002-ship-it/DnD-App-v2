import * as THREE from 'three';
import {lavaNoise,lavaSurface} from './diceLavaMaterial';

/** Small bounded visual fluid release: a draining interior, connected viscous
 * necks and ballistic drops. The pool receives their volume on contact. */
export function createDiceLavaRelease(parent:THREE.Group,uniforms:{time:{value:number};seed:{value:number}}){
 const material=new THREE.ShaderMaterial({uniforms,vertexShader:`
 uniform float time;varying vec3 liquidPos;varying vec3 liquidNormal;varying vec3 liquidView;
 uniform float seed;
 #ifdef USE_INSTANCING
 attribute vec4 liquidShape;
 #endif
 vec3 lobe(vec3 p,vec4 shape){
  float bulge=1.+shape.y*sin(p.z*3.8+shape.x)+shape.z*cos(p.x*3.3+p.y*2.2+shape.x*1.7);
  p.xy*=bulge*(1.-shape.w*p.z);
  float middle=max(0.,1.-p.z*p.z);
  p.x+=.24*sin(p.z*2.4+shape.x)*middle;
  p.y+=.18*cos(p.z*3.1+shape.x*1.3)*middle;
  p.z+=.12*sin(p.x*2.8+p.y*2.1+shape.x)*middle;
  return p;
 }
 void main(){vec3 p=position;vec3 n=normal;
 #ifndef LAVA_STREAM
  vec4 shape=vec4(seed,.17,.11,.18);
  #ifdef USE_INSTANCING
   shape=liquidShape;
  #endif
  vec3 u=normalize(cross(n,abs(n.z)<.9?vec3(0,0,1):vec3(0,1,0))),v=cross(n,u);
  p=lobe(position,shape);
  n=normalize(cross(lobe(position+u*.005,shape)-p,lobe(position+v*.005,shape)-p));
 #endif
 liquidPos=p*.8;
 #ifdef USE_INSTANCING
  mat3 m=mat3(instanceMatrix);
  n=normalize(m*vec3(normal.x/dot(m[0],m[0]),normal.y/dot(m[1],m[1]),normal.z/dot(m[2],m[2])));
  p=(instanceMatrix*vec4(p,1.)).xyz;
  liquidPos.xy+=instanceMatrix[3].xy*2.;
 #endif
 liquidNormal=normalize(normalMatrix*n);
 vec4 view=modelViewMatrix*vec4(p,1.);liquidView=view.xyz;
 gl_Position=projectionMatrix*view;}`,fragmentShader:`
 uniform float time,seed;varying vec3 liquidPos;varying vec3 liquidNormal;varying vec3 liquidView;
 `+lavaNoise+lavaSurface+`
 void main(){float flow;
 vec3 color=moltenSurface(liquidPos.xy+liquidPos.z*.35,time,seed,.84,flow);
 vec3 n=normalize(liquidNormal),v=normalize(-liquidView),l=normalize(vec3(-.4,.6,1.));
 // Wet specular relief complements the same bright channels and cooling crust
 // as the pool, instead of a rippling low-detail orange particle material.
 color*=.82+.18*max(0.,dot(n,l));
 color+=vec3(.8,.23,.035)*pow(max(0.,dot(n,normalize(l+v))),48.)*.24;
 gl_FragColor=vec4(color,1.);
 #include <tonemapping_fragment>
 #include <colorspace_fragment>
 }`});
 const sphere=new THREE.SphereGeometry(1,32,24),core=new THREE.Mesh(sphere,material);
 const dropGeometry=sphere.clone(),shape=new THREE.InstancedBufferAttribute(new Float32Array(8*4),4);
 dropGeometry.setAttribute('liquidShape',shape);
 const drops=new THREE.InstancedMesh(dropGeometry,material,8);drops.instanceMatrix.setUsage(THREE.DynamicDrawUsage);drops.frustumCulled=false;drops.count=0;
 const count=4,rings=10,sides=16,positions=new Float32Array(count*rings*sides*3),normals=new Float32Array(positions.length),indices:number[]=[];
 for(let k=0;k<count;k++)for(let r=0;r<rings-1;r++)for(let j=0;j<sides;j++){
  const a=(k*rings+r)*sides+j,b=(k*rings+r)*sides+(j+1)%sides,c=a+sides,d=b+sides;indices.push(a,b,c,b,d,c);
 }
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(positions,3).setUsage(THREE.DynamicDrawUsage));geometry.setAttribute('normal',new THREE.BufferAttribute(normals,3));geometry.setIndex(indices);
 const streamMaterial=material.clone();streamMaterial.uniforms=uniforms;streamMaterial.defines={LAVA_STREAM:1};
 const streams=new THREE.Mesh(geometry,streamMaterial);streams.frustumCulled=false;
 const group=new THREE.Group();group.visible=false;group.add(core,drops,streams);parent.add(group);
 const transform=new THREE.Object3D(),source=new THREE.Vector3(),head=new THREE.Vector3();
 let height=.5,seed=0,firstImpact=.3,lastImpact=.5;
 const random=(i:number)=>{const n=Math.sin(i*127.1+seed*13.7)*43758.5453;return n-Math.floor(n);};
 return {
  start(releaseHeight:number,value:number){height=releaseHeight;seed=value;
   firstImpact=Infinity;lastImpact=0;
   for(let i=0;i<8;i++){const g=9+random(i+2)*4,delay=i<4?random(i+31)*.035:.06+random(i)*.08;
    const impact=delay+Math.sqrt(2*Math.max(.05,height-.09)/g);firstImpact=Math.min(firstImpact,impact);lastImpact=Math.max(lastImpact,impact+.10);}
   for(let i=0;i<8;i++)shape.setXYZW(i,random(i+41)*6.28,.10+random(i+42)*.2,.06+random(i+43)*.13,.12+random(i+44)*.2);
   shape.needsUpdate=true;
  },
  impact(){return firstImpact;},end(){return lastImpact;},
  prewarm(enabled:boolean){group.visible=enabled;material.colorWrite=streamMaterial.colorWrite=!enabled;core.visible=true;streams.visible=true;drops.count=8;},
  active(){return group.visible;},
  update(age:number,visible:boolean){
   group.visible=visible&&age<lastImpact+.12;if(!group.visible)return;
   const coreZ=Math.max(.06,height-3.8*age*age),drain=THREE.MathUtils.smoothstep(age,.05,Math.min(.38,lastImpact));
   source.set(0,0,coreZ);core.position.copy(source);core.visible=drain<.98;
   core.scale.set(.34*(1-drain*.8),.23*(1-drain*.8),.30*(1-drain*.65));
   let dropCount=0;
   for(let i=0;i<8;i++){
    const delay=i<4?random(i+31)*.035:.06+random(i)*.08,t=age-delay,g=9+random(i+2)*4,angle=random(i+21)*Math.PI*2;
    const speed=i===0?.3:.55+random(i+5)*1.1,x=Math.cos(angle)*(.025+Math.max(0,t)*speed),y=Math.sin(angle)*(.025+Math.max(0,t)*speed);
    const z=height-.5*g*Math.max(0,t)*Math.max(0,t),size=(i===0?.19:i<4?.07+random(i+7)*.07:.025+random(i+8)*.045);
    if(t>=0&&z>-.035){
     const squash=THREE.MathUtils.smoothstep(z,-.035,.10);
     transform.position.set(x,y,Math.max(.025,z));transform.rotation.set(.4*Math.sin(angle),.55*Math.cos(angle),angle);
     transform.scale.set(size*(.75+random(i+11)*.55)*(1.65-squash*.65),size*(.6+random(i+12)*.6)*(1.65-squash*.65),size*(.22+squash*(1.1+random(i+13)*1.2+Math.max(0,t)*1.8)));
     transform.updateMatrix();drops.setMatrixAt(dropCount++,transform.matrix);
    }
    if(i>=count)continue;
    head.set(x,y,Math.max(.02,z));
    const neck=t>=0?(1-THREE.MathUtils.smoothstep(t,.14,.32))*.085:0;
    for(let r=0;r<rings;r++){
     const u=r/(rings-1),width=neck*(.65+.35*u)*Math.pow(Math.max(.01,Math.sin(u*Math.PI)),.25);
     for(let j=0;j<sides;j++){
      const a=j/sides*Math.PI*2,at=((i*rings+r)*sides+j)*3;
      positions[at]=source.x+(head.x-source.x)*u+Math.cos(a)*width;
      positions[at+1]=source.y+(head.y-source.y)*u+Math.sin(a)*width;
      positions[at+2]=source.z+(head.z-source.z)*u-.035*Math.sin(u*Math.PI);
      normals[at]=Math.cos(a);normals[at+1]=Math.sin(a);normals[at+2]=0;
     }
    }
   }
   drops.count=dropCount;drops.instanceMatrix.needsUpdate=true;streams.visible=age<.36;
   geometry.attributes.position.needsUpdate=true;geometry.attributes.normal.needsUpdate=true;
  },
  clear(){group.visible=false;drops.count=0;},
  dispose(){parent.remove(group);drops.dispose();sphere.dispose();dropGeometry.dispose();geometry.dispose();material.dispose();streamMaterial.dispose();},
 };
}
