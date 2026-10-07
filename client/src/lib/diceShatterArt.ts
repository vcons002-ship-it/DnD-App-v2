import * as THREE from 'three';

/** A die is divided into solid tetrahedral wedges, not replaced by a particle
 * spray. Their assembled exterior exactly follows the source polyhedron. */
export function createDiceShatterArt(root:THREE.Group,faces:THREE.Vector3[][],critical:boolean){
 const group=new THREE.Group();group.userData.dicePowerArt=true;root.add(group);
 const centers:THREE.Vector3[]=[],vertices:THREE.Vector3[][]=[];
 for(const face of faces){
  for(let i=1;i<face.length-1;i++){
   const points=[face[0].clone(),face[i].clone(),face[i+1].clone(),new THREE.Vector3()];
   const center=points.reduce((sum,v)=>sum.add(v),new THREE.Vector3()).multiplyScalar(.25);
   centers.push(center);vertices.push(points.map(p=>p.sub(center)));
  }
 }
 const count=centers.length,geometry=new THREE.BufferGeometry();
 const corners=[0,1,2,0,3,1,1,3,2,2,3,0],bary:number[]=[],outside:number[]=[],ids:number[]=[],normalA:number[]=[],normalB:number[]=[],normalC:number[]=[];
 for(let i=0;i<12;i++){
  bary.push(i%3===0?1:0,i%3===1?1:0,i%3===2?1:0);outside.push(i<3?1:0);ids.push(corners[i]);
  const tri=Math.floor(i/3)*3;normalA.push(corners[tri]);normalB.push(corners[tri+1]);normalC.push(corners[tri+2]);
 }
 geometry.setAttribute('position',new THREE.Float32BufferAttribute(new Float32Array(36),3));
 // Pack triangle metadata to stay comfortably under mobile WebGL's 16 vertex
 // attribute slots (the instance matrix alone consumes four).
 geometry.setAttribute('corners',new THREE.Float32BufferAttribute(ids.flatMap((id,i)=>[id,normalA[i],normalB[i],normalC[i]]),4));
 geometry.setAttribute('baryShell',new THREE.Float32BufferAttribute(outside.flatMap((shell,i)=>[...bary.slice(i*3,i*3+3),shell]),4));
 for(let corner=0;corner<4;corner++)geometry.setAttribute('point'+corner,new THREE.InstancedBufferAttribute(new Float32Array(vertices.flatMap(v=>v[corner].toArray())),3));
 const material=new THREE.ShaderMaterial({
  uniforms:{heat:{value:1},opacity:{value:1},gold:{value:critical?1:0}},transparent:true,depthWrite:true,side:THREE.DoubleSide,
  vertexShader:`attribute vec4 corners,baryShell;attribute vec3 point0,point1,point2,point3;
   varying vec3 stonePosition,facet,viewDirection,edge;varying float shell;
   vec3 point(float id){return id<.5?point0:id<1.5?point1:id<2.5?point2:point3;}
   void main(){vec3 p=point(corners.x);stonePosition=p;edge=baryShell.xyz;shell=baryShell.w;
    vec3 n=normalize(cross(point(corners.z)-point(corners.y),point(corners.w)-point(corners.y)));
    facet=normalize(normalMatrix*mat3(instanceMatrix)*n);vec4 mv=modelViewMatrix*instanceMatrix*vec4(p,1.);viewDirection=-mv.xyz;
    gl_Position=projectionMatrix*mv;}`,
  fragmentShader:`uniform float heat,opacity,gold;varying vec3 stonePosition,facet,viewDirection,edge;varying float shell;
   float hash(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}
   void main(){vec3 n=normalize(facet)*(gl_FrontFacing?1.:-1.),v=normalize(viewDirection),l=normalize(vec3(-.4,.5,1.));
    float diffuse=.18+.82*abs(dot(n,l)),spec=pow(max(0.,dot(n,normalize(l+v))),75.);
    float grain=hash(floor(stonePosition*55.));vec3 black=vec3(.020,.023,.030)*diffuse*(.8+grain*.35)+spec*vec3(.7,.77,.83);
    float rim=1.-smoothstep(.008,.028,edge.z);vec3 metal=vec3(.85,.49,.08)*(.25+diffuse*.4)+spec*vec3(1.,.8,.3);
    vec3 exterior=mix(black,metal,max(gold,rim));
    float flow=.5+.5*sin(stonePosition.x*11.+sin(stonePosition.y*8.))*sin(stonePosition.z*13.+stonePosition.y*5.);
    float hot=smoothstep(.57,.83,flow),deep=1.-smoothstep(.12,.62,length(stonePosition));
    vec3 molten=black*.8+vec3(2.6,.19,.003)*(hot*.75+deep*.24)*heat;
    vec3 color=mix(molten,exterior,shell);
    gl_FragColor=vec4(color,opacity);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
   }`,
 });
 const chunks=new THREE.InstancedMesh(geometry,material,count);chunks.count=0;chunks.frustumCulled=false;chunks.userData.dicePowerArt=true;chunks.instanceMatrix.setUsage(THREE.DynamicDrawUsage);group.add(chunks);
 const coreGeometry=new THREE.IcosahedronGeometry(1,3),coreMaterial=new THREE.ShaderMaterial({
  uniforms:{clock:{value:0},fade:{value:0}},transparent:true,depthWrite:false,
  vertexShader:`varying vec3 p;void main(){p=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
  fragmentShader:`uniform float clock,fade;varying vec3 p;void main(){float churn=sin(p.x*17.+clock*7.)*sin(p.y*13.-clock*9.)*sin(p.z*11.+clock*5.);gl_FragColor=vec4(mix(vec3(1.5,.025,.001),vec3(3.,.5,.008),pow(.5+.5*churn,3.)),fade);
   #include <tonemapping_fragment>
   #include <colorspace_fragment>
  }`,
 });
 // Transparent at rest, but initially visible so the ordinary shader preload
 // compiles the core before the first maximum roll needs it.
 const core=new THREE.Mesh(coreGeometry,coreMaterial);core.userData.dicePowerArt=true;group.add(core);
 const ringGeometry=new THREE.RingGeometry(.72,1,64),ringMaterial=new THREE.ShaderMaterial({uniforms:{fade:{value:0}},transparent:true,side:THREE.DoubleSide,depthWrite:false,blending:THREE.AdditiveBlending,
  vertexShader:`varying vec3 p;void main(){p=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
  fragmentShader:`uniform float fade;varying vec3 p;void main(){float glow=exp(-pow((length(p.xy)-.9)/.055,2.));gl_FragColor=vec4(1.8,.16,.005,glow*fade);
   #include <tonemapping_fragment>
   #include <colorspace_fragment>
  }`});
 const ring=new THREE.Mesh(ringGeometry,ringMaterial);ring.userData.dicePowerArt=true;group.add(ring);
 const pose=new THREE.Object3D(),orientation=new THREE.Quaternion(),worldCenter=new THREE.Vector3(),velocity=new THREE.Vector3(),axis=new THREE.Vector3();
 const inverse=new THREE.Quaternion();const random=(i:number)=>{const n=Math.sin(i*127.1+311.7)*43758.5453;return n-Math.floor(n);};
 const original=root.children.filter(c=>c instanceof THREE.Mesh&&!c.userData.dicePowerArt);
 let broken=false;
 return {
  state(){return {broken,fragments:chunks.count};},
  update(now:number,maximum:boolean,age:number,reduced:boolean){
   broken=maximum&&!reduced&&age>=.24;
   for(const object of original)object.visible=!broken;
   chunks.count=0;core.visible=false;ring.visible=false;
   if(!broken)return;
   const t=age-.24,floor=-root.position.z/Math.max(.001,root.scale.x)+.06;
   group.quaternion.copy(inverse.copy(root.quaternion).invert());
   material.uniforms.heat.value=Math.exp(-t*1.2);material.uniforms.opacity.value=1-THREE.MathUtils.smoothstep(t,1.6,2.6);
   if(t<2.6){
    chunks.count=count;
    for(let i=0;i<count;i++){
     worldCenter.copy(centers[i]).applyQuaternion(root.quaternion);
     velocity.copy(worldCenter).normalize().multiplyScalar(3.4+random(i+8)*2.4);velocity.z=Math.max(.8,velocity.z)+2.3+random(i+9)*2.8;
     const height=worldCenter.z-floor,hit=(velocity.z+Math.sqrt(velocity.z*velocity.z+28*Math.max(0,height)))/14;
     const flight=Math.min(t,hit),after=Math.max(0,t-hit),travel=flight+(1-Math.exp(-after*3))*.22;
     pose.position.set(worldCenter.x+velocity.x*travel,worldCenter.y+velocity.y*travel,worldCenter.z+velocity.z*t-7*t*t);
     if(after>0)pose.position.z=floor+Math.max(0,velocity.z*.19*after-7*after*after);
     axis.set(random(i+2)-.5,random(i+3)-.5,random(i+4)-.5).normalize();orientation.setFromAxisAngle(axis,t*(4+random(i+5)*6));
     pose.quaternion.copy(orientation).multiply(root.quaternion);pose.scale.setScalar(1);pose.updateMatrix();chunks.setMatrixAt(i,pose.matrix);
    }
    chunks.instanceMatrix.needsUpdate=true;
   }
   if(t<.8){core.visible=true;core.scale.setScalar(.3+Math.sin(Math.min(1,t/.32)*Math.PI*.5)*1.05);coreMaterial.uniforms.clock.value=now/1000;coreMaterial.uniforms.fade.value=Math.exp(-t*5)*(1-Math.exp(-t*35));}
   if(t<.45){ring.visible=true;ring.position.z=floor;ring.scale.setScalar(.8+t*7);ringMaterial.uniforms.fade.value=(1-t/.45)*.55;}
  },
  dispose(){for(const object of original)object.visible=true;geometry.dispose();material.dispose();coreGeometry.dispose();coreMaterial.dispose();ringGeometry.dispose();ringMaterial.dispose();root.remove(group);},
 };
}
