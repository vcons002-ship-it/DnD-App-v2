import * as THREE from 'three';

/** Bounded cosmetic geometry attached to a die. No lights, extra simulations,
 * screen-space sprites, or changes to its physical body/numbered surfaces. */
export function createDicePowerArt(root:THREE.Group,kind:'fighter'|'ranger'){
 const group=new THREE.Group();root.add(group);
 const transform=new THREE.Object3D(),color=new THREE.Color(),up=new THREE.Vector3(0,0,1);
 const inverse=new THREE.Quaternion(),direction=new THREE.Vector3(),rayAxis=new THREE.Vector3(0,1,0);
 const count=kind==='fighter'?18:22;
 const geometry=kind==='fighter'?new THREE.IcosahedronGeometry(1,1):new THREE.BufferGeometry();
 if(kind==='ranger'){
  const positions:number[]=[],uv:number[]=[],faces:number[]=[];
  // Crossed tapered light volumes stay substantial when one ribbon is edge-on.
  for(let plane=0;plane<2;plane++)for(let j=0;j<=12;j++)for(const side of [-1,1]){
   const t=j/12,width=.12+Math.sin(t*Math.PI)*.48;
   positions.push(plane===0?side*width:0,t-.5,plane===1?side*width:0);uv.push((side+1)/2,t);
  }
  for(let plane=0;plane<2;plane++)for(let j=0;j<12;j++){const a=plane*26+j*2;faces.push(a,a+1,a+2,a+1,a+3,a+2);}
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geometry.setIndex(faces);geometry.computeVertexNormals();
 }
 const fade=new THREE.InstancedBufferAttribute(new Float32Array(count),1).setUsage(THREE.DynamicDrawUsage);
 geometry.setAttribute('powerFade',fade);
 const material=new THREE.ShaderMaterial({
  uniforms:{clock:{value:0}},transparent:true,depthWrite:false,depthTest:true,
  blending:kind==='ranger'?THREE.AdditiveBlending:THREE.NormalBlending,side:THREE.DoubleSide,
  vertexShader:`attribute float powerFade;varying float life;varying vec2 tex;varying vec3 glow;varying vec3 facet;void main(){life=powerFade;tex=uv;glow=instanceColor;facet=normal;gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.);}`,
  fragmentShader:kind==='fighter'?`varying float life;varying vec3 glow;varying vec3 facet;void main(){
   float crust=.50+.50*pow(max(0.,dot(normalize(facet),normalize(vec3(-.3,.4,1.)))),1.6);
   gl_FragColor=vec4(glow*crust,life);
   #include <tonemapping_fragment>
   #include <colorspace_fragment>
  }`:`uniform float clock;varying float life;varying vec2 tex;varying vec3 glow;void main(){
   float edge=pow(max(0.,1.-abs(tex.x-.5)*2.),2.);
   float end=smoothstep(0.,.16,tex.y)*(1.-smoothstep(.48,1.,tex.y));
   float streams=.55+.45*pow(sin(tex.y*15.-clock*2.5+tex.x*3.),2.);
   gl_FragColor=vec4(glow,edge*end*streams*life);
   #include <tonemapping_fragment>
   #include <colorspace_fragment>
  }`,
 });
 const mesh=new THREE.InstancedMesh(geometry,material,count);mesh.count=0;mesh.frustumCulled=false;mesh.userData.dicePowerArt=true;
 mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);group.add(mesh);
 // Include the instance-color program in the ordinary background shader preload.
 mesh.setColorAt(0,new THREE.Color(1,1,1));
 const glowCanvas=document.createElement('canvas');glowCanvas.width=glowCanvas.height=32;
 const gc=glowCanvas.getContext('2d')!,gradient=gc.createRadialGradient(16,16,0,16,16,16);
 gradient.addColorStop(0,'#ffffeeb0');gradient.addColorStop(.2,'#ffbc5c75');gradient.addColorStop(.5,'#ff510f20');gradient.addColorStop(1,'#ff240000');gc.fillStyle=gradient;gc.fillRect(0,0,32,32);
 const glowMap=new THREE.CanvasTexture(glowCanvas),glowGeometry=new THREE.BufferGeometry(),glowPositions=new Float32Array(count*3),glowColors=new Float32Array(count*3);
 glowGeometry.setAttribute('position',new THREE.BufferAttribute(glowPositions,3).setUsage(THREE.DynamicDrawUsage));glowGeometry.setAttribute('color',new THREE.BufferAttribute(glowColors,3).setUsage(THREE.DynamicDrawUsage));
 const glowMaterial=new THREE.PointsMaterial({map:glowMap,size:.38,vertexColors:true,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending});
 const glows=new THREE.Points(glowGeometry,glowMaterial);glows.frustumCulled=false;glowGeometry.setDrawRange(0,0);if(kind==='fighter')group.add(glows);
 const random=(i:number)=>{const n=Math.sin(i*127.1+311.7)*43758.5453;return n-Math.floor(n);};
 let visible=0;
 return {
  count(){return visible;},
  update(now:number,maximum:boolean,age:number,mote:THREE.Vector3,reduced:boolean){
   visible=0;material.uniforms.clock.value=now/1000;
   if(maximum&&!reduced){
    // Keep eruption gravity in world-up even when a polyhedron rests tilted.
    group.quaternion.copy(inverse.copy(root.quaternion).invert());
    for(let i=0;i<count;i++){
     if(kind==='fighter'){
      const t=age-.24-random(i+1)*.045,life=1.35+random(i+2)*.55;
      if(t<0||t>life)continue;
      const angle=i*2.399963+random(i+3)*.5,speed=2.6+random(i+4)*2.8;
      const x=Math.cos(angle)*(.55+speed*t),y=Math.sin(angle)*(.55+speed*t);
      const lift=4.8+random(i+5)*3.2,z=.08+lift*t-7.5*t*t;
      // Cool at the felt surface instead of falling through the tray.
      const floor=-root.position.z/Math.max(.001,root.scale.x)+.035;
      transform.position.set(x,y,Math.max(floor,z));
      direction.set(Math.cos(angle)*speed,Math.sin(angle)*speed,lift-15*t).normalize();transform.quaternion.setFromUnitVectors(up,direction);
      const size=(.035+random(i+6)*.035)*(1-t/life*.35);
      transform.scale.set(size*.8,size*.8,size*(1.5+Math.exp(-t*4)*1.5));
      color.setRGB(1.9*(1-t/life)+.09,.22*Math.pow(1-t/life,2)+.012,.008);
      fade.setX(visible,Math.min(1,(life-t)*3));
      glowPositions.set(transform.position.toArray(),visible*3);glowColors.set([1-t/life,(1-t/life)*.48,(1-t/life)*.10],visible*3);
     }else{
      // Fibonacci sphere: a luminous volume above, below and around the mote,
      // rather than a horizontal fan. Rays begin inside the resin at the mote.
      const angle=i*2.399963+Math.sin(now*.00023+i)*.12;
      const vertical=1-2*(i+.5)/count,radial=Math.sqrt(1-vertical*vertical);
      direction.set(Math.cos(angle)*radial,Math.sin(angle)*radial,vertical);
      const length=2.5+random(i+5)*1.25;
      transform.position.copy(mote).applyQuaternion(root.quaternion).addScaledVector(direction,length*.5);
      transform.quaternion.setFromUnitVectors(rayAxis,direction);
      // A crossed, tapered ribbon reads as a stream from overhead or any angle.
      transform.rotateY(i*.8);
      transform.scale.set(.34+random(i+6)*.22,length,.34+random(i+6)*.22);
      color.setRGB(.65,1.1,.28);
      fade.setX(visible,THREE.MathUtils.smoothstep(age,.45,.85)*(.20+.065*Math.sin(now*.0015+i)));
     }
     transform.updateMatrix();mesh.setMatrixAt(visible,transform.matrix);mesh.setColorAt(visible,color);visible++;
    }
   }
   mesh.count=visible;mesh.instanceMatrix.needsUpdate=true;fade.needsUpdate=true;if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;
   glowGeometry.setDrawRange(0,kind==='fighter'?visible:0);glowGeometry.attributes.position.needsUpdate=true;glowGeometry.attributes.color.needsUpdate=true;
  },
  dispose(){geometry.dispose();material.dispose();glowGeometry.dispose();glowMaterial.dispose();glowMap.dispose();root.remove(group);},
 };
}
