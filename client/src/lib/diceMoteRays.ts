import * as THREE from 'three';

/** Soft escaping light, aligned with the shafts rendered inside the resin. */
export function createDiceMoteRays(root:THREE.Group,planes:THREE.Vector4[],room:number){
 const count=8,positions:number[]=[],uv:number[]=[],indices:number[]=[];
 const rings=12,segments=10;
 for(let j=0;j<=rings;j++)for(let k=0;k<=segments;k++){
  const t=j/rings,a=k/segments*Math.PI*2,r=.045+t*.13;
  positions.push(Math.cos(a)*r,t-.5,Math.sin(a)*r);uv.push(k/segments,t);
 }
 for(let j=0;j<rings;j++)for(let k=0;k<segments;k++){
  const a=j*(segments+1)+k,b=a+segments+1;indices.push(a,a+1,b,a+1,b+1,b);
 }
 const geometry=new THREE.BufferGeometry();
 geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
 geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geometry.setIndex(indices);geometry.computeVertexNormals();
 const material=new THREE.ShaderMaterial({
  uniforms:{strength:{value:0}},transparent:true,depthWrite:false,depthTest:true,
  blending:THREE.AdditiveBlending,side:THREE.DoubleSide,
  vertexShader:`varying vec2 tex;varying vec3 facet;varying vec3 viewPoint;
  void main(){tex=uv;mat3 m=mat3(instanceMatrix);
   facet=normalize(normalMatrix*m*vec3(normal.x/dot(m[0],m[0]),normal.y/dot(m[1],m[1]),normal.z/dot(m[2],m[2])));
   vec4 point=modelViewMatrix*instanceMatrix*vec4(position,1.);viewPoint=point.xyz;gl_Position=projectionMatrix*point;}`,
  fragmentShader:`uniform float strength;varying vec2 tex;varying vec3 facet;varying vec3 viewPoint;
  void main(){
   float edge=smoothstep(.08,.75,abs(dot(normalize(facet),normalize(-viewPoint))));
   float fade=pow(1.-smoothstep(0.,1.,tex.y),2.);
   gl_FragColor=vec4(.65,1.,.36,edge*fade*strength);
   #include <tonemapping_fragment>
   #include <colorspace_fragment>
  }`,
 });
 const mesh=new THREE.InstancedMesh(geometry,material,count);mesh.count=0;
 mesh.frustumCulled=false;mesh.userData.dicePowerArt=true;
 mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);root.add(mesh);
 const transform=new THREE.Object3D(),direction=new THREE.Vector3(),axis=new THREE.Vector3(0,1,0);
 return {
  count(){return mesh.count;},
  update(now:number,maximum:boolean,age:number,mote:THREE.Vector3,reduced:boolean){
   mesh.count=maximum&&!reduced?count:0;if(!mesh.count)return;
   const time=now/1000,tilt=time*.23,cs=Math.cos(tilt),sn=Math.sin(tilt);
   material.uniforms.strength.value=THREE.MathUtils.smoothstep(age,.45,.85)*.22;
   for(let i=0;i<count;i++){
    const z=1-2*(i+.5)/count,angle=i*2.399963+time*.31,radius=Math.sqrt(1-z*z);
    const y=Math.sin(angle)*radius;direction.set(Math.cos(angle)*radius,cs*y-sn*z,sn*y+cs*z);
    let escape=Infinity;
    for(const p of planes){
     const dot=p.x*direction.x+p.y*direction.y+p.z*direction.z;
     if(dot>.00001)escape=Math.min(escape,(p.w-p.x*mote.x-p.y*mote.y-p.z*mote.z)/dot);
    }
    if(!Number.isFinite(escape))escape=room;
    const length=room*(1.6+.35*Math.sin(i*1.7));
    transform.position.copy(mote).addScaledVector(direction,escape+length*.5-.02);
    transform.quaternion.setFromUnitVectors(axis,direction);transform.scale.set(room,length,room);
    transform.updateMatrix();mesh.setMatrixAt(i,transform.matrix);
   }
   mesh.instanceMatrix.needsUpdate=true;
  },
  dispose(){root.remove(mesh);geometry.dispose();material.dispose();},
 };
}
