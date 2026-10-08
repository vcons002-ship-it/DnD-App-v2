import * as THREE from 'three';

/** Small bounded visual fluid release: a draining interior, connected viscous
 * necks and ballistic drops. The pool receives their volume on contact. */
export function createDiceLavaRelease(parent:THREE.Group,uniforms:{time:{value:number};seed:{value:number}}){
 const material=new THREE.ShaderMaterial({uniforms,vertexShader:`
 uniform float time;varying vec3 liquidPos;varying vec3 liquidNormal;
 void main(){vec3 p=position*(1.+.10*sin(position.y*7.+position.z*4.+time*9.)+.055*sin(position.x*11.-time*7.));
 liquidNormal=normal;liquidPos=p;
 #ifdef USE_INSTANCING
  p=(instanceMatrix*vec4(p,1.)).xyz;
 #endif
 gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);}`,fragmentShader:`
 uniform float time,seed;varying vec3 liquidPos;varying vec3 liquidNormal;
 float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
 float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
 void main(){vec2 q=liquidPos.xy*3.+liquidPos.z+seed+vec2(time*.16,-time*.25);
 float flow=noise(q)*.65+noise(q*2.1)*.35;
 float vein=1.-smoothstep(.018,.12,abs(flow-.51));
 vec3 color=mix(vec3(.38,.003,.0002),vec3(3.1,.26,.006),.2+flow*.48+vein*.28);
 color*=.65+.35*abs(normalize(liquidNormal).z);
 gl_FragColor=vec4(color,1.);
 #include <tonemapping_fragment>
 #include <colorspace_fragment>
 }`});
 const sphere=new THREE.SphereGeometry(1,16,12),core=new THREE.Mesh(sphere,material);
 const drops=new THREE.InstancedMesh(sphere,material,12);drops.instanceMatrix.setUsage(THREE.DynamicDrawUsage);drops.frustumCulled=false;drops.count=0;
 const count=6,rings=7,sides=8,positions=new Float32Array(count*rings*sides*3),normals=new Float32Array(positions.length),indices:number[]=[];
 for(let k=0;k<count;k++)for(let r=0;r<rings-1;r++)for(let j=0;j<sides;j++){
  const a=(k*rings+r)*sides+j,b=(k*rings+r)*sides+(j+1)%sides,c=a+sides,d=b+sides;indices.push(a,b,c,b,d,c);
 }
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(positions,3).setUsage(THREE.DynamicDrawUsage));geometry.setAttribute('normal',new THREE.BufferAttribute(normals,3));geometry.setIndex(indices);
 const streams=new THREE.Mesh(geometry,material);streams.frustumCulled=false;
 const group=new THREE.Group();group.visible=false;group.add(core,drops,streams);parent.add(group);
 const transform=new THREE.Object3D(),source=new THREE.Vector3(),head=new THREE.Vector3();
 let height=.5,seed=0,firstImpact=.3,lastImpact=.5;
 const random=(i:number)=>{const n=Math.sin(i*127.1+seed*13.7)*43758.5453;return n-Math.floor(n);};
 return {
  start(releaseHeight:number,value:number){height=releaseHeight;seed=value;
   firstImpact=Infinity;lastImpact=0;
   for(let i=0;i<12;i++){const g=9+random(i+2)*4,delay=i<6?i*.007:.055+random(i)*.055;
    const impact=delay+Math.sqrt(2*Math.max(.05,height-.09)/g);firstImpact=Math.min(firstImpact,impact);lastImpact=Math.max(lastImpact,impact+.10);}
  },
  impact(){return firstImpact;},end(){return lastImpact;},
  prewarm(enabled:boolean){group.visible=enabled;material.colorWrite=!enabled;core.visible=true;streams.visible=true;drops.count=12;},
  active(){return group.visible;},
  update(age:number,visible:boolean){
   group.visible=visible&&age<lastImpact+.12;if(!group.visible)return;
   const coreZ=Math.max(.06,height-3.8*age*age),drain=THREE.MathUtils.smoothstep(age,.05,Math.min(.38,lastImpact));
   source.set(0,0,coreZ);core.position.copy(source);core.visible=drain<.98;
   core.scale.set(.29*(1-drain*.8),.26*(1-drain*.8),.28*(1-drain*.65));
   let dropCount=0;
   for(let i=0;i<12;i++){
    const delay=i<6?i*.007:.055+random(i)*.055,t=age-delay,g=9+random(i+2)*4,angle=i*2.399963+seed;
    const speed=.8+random(i+5)*.65,x=Math.cos(angle)*(.04+Math.max(0,t)*speed),y=Math.sin(angle)*(.04+Math.max(0,t)*speed);
    const z=height-.5*g*Math.max(0,t)*Math.max(0,t),size=i<6?.105+random(i+7)*.045:.035+random(i+8)*.035;
    if(t>=0&&z>-.035){
     const squash=THREE.MathUtils.smoothstep(z,-.035,.10);
     transform.position.set(x,y,Math.max(.025,z));transform.rotation.set(.1*Math.sin(angle),.15*Math.cos(angle),angle);
     transform.scale.set(size*(1.65-squash*.65),size*(1.65-squash*.65),size*(.22+squash*(1+Math.max(0,t)*1.8)));
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
  dispose(){parent.remove(group);drops.dispose();sphere.dispose();geometry.dispose();material.dispose();},
 };
}
