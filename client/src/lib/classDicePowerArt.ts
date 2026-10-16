import * as THREE from 'three';
import type {ClassDiceArt} from '../../../shared/classDiceArt';
/** One bounded instanced draw per die, active only after a strong result is
 * known. These are luminous particles, never scene lights or shadow casters. */
export function createClassDicePowerArt(root:THREE.Group,spec:ClassDiceArt,radius:number){
 const count=24,geometry=new THREE.PlaneGeometry(1,1),seeds=new Float32Array(count);
 for(let i=0;i<count;i++)seeds[i]=(i*.61803398875)%1;
 geometry.setAttribute('sparkSeed',new THREE.InstancedBufferAttribute(seeds,1));
 const uniforms={tint:{value:new THREE.Color(spec.energy)},power:{value:0},kind:{value:spec.id},maximum:{value:0}};
 const material=new THREE.ShaderMaterial({uniforms,transparent:true,depthWrite:false,depthTest:true,blending:spec.effect==='shadow'?THREE.NormalBlending:THREE.AdditiveBlending,
 vertexShader:`attribute float sparkSeed;varying vec2 vUv;varying float seed;void main(){vUv=uv;seed=sparkSeed;gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.);}`,
 fragmentShader:`uniform vec3 tint;uniform float power;uniform float kind;uniform float maximum;varying vec2 vUv;varying float seed;
 void main(){vec2 p=(vUv-.5)*2.;float r=length(p);float cloud=exp(-r*r*4.5);float core=exp(-r*r*38.);float rays=exp(-abs(p.x)*35.)*exp(-abs(p.y)*4.)+exp(-abs(p.y)*35.)*exp(-abs(p.x)*4.);
 vec3 color=tint;float alpha=(cloud*.4+core*.7+rays*.2)*power;
 if(kind==2.)color=mix(tint,vec3(.24,.75,1.),seed);
 if(kind==7.){color=mix(vec3(.025,.018,.045),tint,core);alpha=cloud*power*.5;}
 if(kind==1.||kind==10.){color=mix(tint,vec3(1.,.35,.04),step(.65,seed));alpha=(core+cloud*.3)*power;}
 if(kind==3.||kind==6.)alpha=(cloud*.25+rays*.48+core*.6)*power;
 gl_FragColor=vec4(color*(1.+maximum*.6),min(.85,alpha));
 #include <tonemapping_fragment>
 #include <colorspace_fragment>
 }`});
 const mesh=new THREE.InstancedMesh(geometry,material,count);mesh.name=`${spec.name.toLowerCase()}-maximum-art`;mesh.frustumCulled=false;mesh.userData.dicePowerArt=true;mesh.visible=false;root.add(mesh);
 const matrix=new THREE.Matrix4(),rotation=new THREE.Quaternion(),scale=new THREE.Vector3(),position=new THREE.Vector3(),worldRotation=new THREE.Quaternion();
 const timeOffset=Math.random()*100;
 let active=0;
 return {update(now:number,known:boolean,strength:number,maximum:boolean,reduced:boolean,camera:THREE.Camera){
  const glow=known&&!reduced?THREE.MathUtils.smoothstep(strength,.45,1):0;
  mesh.visible=glow>0;active=mesh.visible?(maximum?count:6):0;mesh.count=active;if(!mesh.visible)return;
  uniforms.power.value=glow*(maximum?1:.22);uniforms.maximum.value=maximum?1:0;
  root.getWorldQuaternion(worldRotation);rotation.copy(worldRotation).invert().multiply(camera.quaternion);
  const time=now*.001+timeOffset;
  for(let i=0;i<active;i++){
   const seed=seeds[i],angle=i*2.399963+time*(spec.id===5?.35:.6),phase=(time*(spec.id===1||spec.id===10?.9:.27)+seed)%1;
   let r=radius*(1.05+phase*.75),z=(seed-.5)*radius*1.9;
   if(spec.effect==='embers'||spec.effect==='sparks'){r=radius*(.65+phase*.95);z=radius*(phase*2.-.3);}
   if(spec.effect==='harmony'||spec.effect==='qi'||spec.effect==='stars'){
    r=radius*(1.3+Math.sin(time*.7+seed*5.)*.12);z=Math.sin(angle*(i%3===0?1:2))*radius*.9;
   }
   if(spec.effect==='sun'||spec.effect==='radiance'){r=radius*(1.05+phase*.8);z=Math.sin(i*1.7+time*.4)*radius;}
   if(spec.effect==='shadow'||spec.effect==='eldritch'){r=radius*(.95+phase*.85);z=Math.sin(angle*2.+phase*5.)*radius*.65;}
   position.set(Math.cos(angle)*r,Math.sin(angle)*r,z);
   let size=radius*(.12+Math.sin(Math.PI*phase)*.22)*(maximum?1:.65);
   if(spec.effect==='shadow'||spec.effect==='eldritch')size*=2.4;
   scale.set(size,size*(spec.effect==='embers'||spec.effect==='sparks'?1.8:1),1);
   matrix.compose(position,rotation,scale);mesh.setMatrixAt(i,matrix);
  }
  mesh.instanceMatrix.needsUpdate=true;
 },count:()=>active,dispose(){root.remove(mesh);geometry.dispose();material.dispose();}};
}
