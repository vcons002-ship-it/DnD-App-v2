import * as THREE from 'three';
import type {Body} from 'cannon-es';
import {fractureDie,type FracturePlane} from './diceFracture';
import {createShatterWorld,type ShatterWorld} from './diceShatterPhysics';
import {DRUK_EXPLOSION_DELAY} from './diceRollPower';

type SurfaceVertex={p:THREE.Vector3;n:THREE.Vector3;uv:THREE.Vector2};
function clipSurface(vertices:SurfaceVertex[],plane:FracturePlane){
 const result:SurfaceVertex[]=[];
 for(let i=0;i<vertices.length;i++){
  const a=vertices[i],b=vertices[(i+1)%vertices.length],da=plane.normal.dot(a.p)-plane.distance,db=plane.normal.dot(b.p)-plane.distance;
  if(da<=1e-6)result.push(a);
  if((da< -1e-6&&db>1e-6)||(da>1e-6&&db< -1e-6)){
   const t=da/(da-db);result.push({p:a.p.clone().lerp(b.p,t),n:a.n.clone().lerp(b.n,t).normalize(),uv:a.uv.clone().lerp(b.uv,t)});
  }
 }
 return result;
}

/** Exact textured exterior pieces, new molten fracture surfaces, and shared
 * rigid bodies. This cosmetic world starts only after a confirmed maximum. */
export function createDiceShatterArt(root:THREE.Group,faces:THREE.Vector3[][],_critical:boolean){
 const original=root.children.filter((c):c is THREE.Mesh=>c instanceof THREE.Mesh&&!c.userData.dicePowerArt);
 const cells=fractureDie(faces),group=new THREE.Group();group.matrixAutoUpdate=false;group.userData.dicePowerArt=true;root.add(group);
 const geometries:THREE.BufferGeometry[]=[],materials:THREE.Material[]=[],outerMaterials:THREE.ShaderMaterial[]=[];
 const heat={value:1},clock={value:0};
 const lavaMaterial=new THREE.MeshPhysicalMaterial({color:0x080302,roughness:.82,metalness:0,clearcoat:0,specularIntensity:.06,transparent:true,opacity:0,envMapIntensity:.06});materials.push(lavaMaterial);
 lavaMaterial.onBeforeCompile=shader=>{
  shader.uniforms.lavaHeat=heat;shader.uniforms.lavaClock=clock;
  shader.vertexShader='varying vec3 lavaPoint;\n'+shader.vertexShader;
  shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nlavaPoint=position;');
  const field=`uniform float lavaHeat,lavaClock;varying vec3 lavaPoint;
   float lavaHash(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}
   float lavaNoise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(mix(lavaHash(i),lavaHash(i+vec3(1,0,0)),f.x),mix(lavaHash(i+vec3(0,1,0)),lavaHash(i+vec3(1,1,0)),f.x),f.y),mix(mix(lavaHash(i+vec3(0,0,1)),lavaHash(i+vec3(1,0,1)),f.x),mix(lavaHash(i+vec3(0,1,1)),lavaHash(i+vec3(1,1,1)),f.x),f.y),f.z);}
   float lavaField(vec3 p){vec3 q=p*5.+vec3(lavaClock*.12,-lavaClock*.08,0.);return lavaNoise(q+lavaNoise(q*1.9)*1.6)*.57+lavaNoise(q*2.4)*.31+lavaNoise(q*6.1)*.12;}`;
  shader.fragmentShader=field+'\n'+shader.fragmentShader;
  shader.fragmentShader=shader.fragmentShader.replace('#include <emissivemap_fragment>',`#include <emissivemap_fragment>
   float molten=lavaField(lavaPoint),crust=smoothstep(.32+.29*(1.-lavaHeat),.56+.23*(1.-lavaHeat),molten);
   vec3 hot=mix(vec3(2.2,.08,.001),vec3(4.5,.5,.012),smoothstep(.55,.75,molten));
   roughnessFactor=mix(.9,.65,crust);
   totalEmissiveRadiance+=hot*crust*pow(lavaHeat,.8);`);
  shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_maps>','#include <normal_fragment_maps>\nfloat fractureGrain=lavaField(lavaPoint*2.3);normal=normalize(normal+vec3(dFdx(fractureGrain),dFdy(fractureGrain),0.)*.15);');
 };
 lavaMaterial.customProgramCacheKey=()=> 'fractured-lava-pbr-v1';
 const fragments=cells.map(cell=>{
  const object=new THREE.Group();object.visible=false;group.add(object);
  let preserved=0;
  for(const source of original){
   const geo=source.geometry,pos=geo.getAttribute('position'),normal=geo.getAttribute('normal'),uv=geo.getAttribute('uv');
   const positions:number[]=[],normals:number[]=[],tex:number[]=[];
   for(let k=0;k<pos.count;k+=3){
    let polygon=[0,1,2].map(j=>({p:new THREE.Vector3().fromBufferAttribute(pos,k+j),n:new THREE.Vector3().fromBufferAttribute(normal,k+j),uv:uv?new THREE.Vector2(uv.getX(k+j),uv.getY(k+j)):new THREE.Vector2()}));
    for(const plane of cell.planes){polygon=clipSurface(polygon,plane);if(polygon.length<3)break;}
    for(let j=1;j<polygon.length-1;j++)for(const p of [polygon[0],polygon[j],polygon[j+1]]){positions.push(...p.p.clone().sub(cell.center).toArray());normals.push(...p.n.toArray());tex.push(...p.uv.toArray());}
   }
   if(!positions.length)continue;
   const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(tex,2));geometries.push(geometry);
   const material=(source.material as THREE.ShaderMaterial).clone();
   material.uniforms={...(source.material as THREE.ShaderMaterial).uniforms,eye:{value:new THREE.Vector3()},rotation:{value:new THREE.Matrix3()},shardOrigin:{value:cell.center},shatterFade:{value:0},shatterMelt:{value:0},rollPower:{value:1},eruptionPulse:{value:0}};
   material.vertexShader='uniform vec3 shardOrigin;\n'+material.vertexShader.replace('pos=position;','pos=position+shardOrigin;');
   material.fragmentShader='uniform float shatterFade,shatterMelt;\n'+material.fragmentShader.replace('#include <tonemapping_fragment>',`float crust=fbm(pos*9.+vec3(time*.15));
    vec3 liquefied=mix(vec3(.035,.008,.002),vec3(3.5,.25,.008),smoothstep(.35,.64,crust));
    gl_FragColor.rgb=mix(gl_FragColor.rgb,liquefied,smoothstep(0.,.65,shatterMelt));
    gl_FragColor.a*=shatterFade;\n#include <tonemapping_fragment>`);
   material.transparent=true;materials.push(material);outerMaterials.push(material);
   const mesh=new THREE.Mesh(geometry,material);mesh.userData.dicePowerArt=true;mesh.userData.shatterChunk=true;mesh.frustumCulled=false;object.add(mesh);preserved++;
  }
  const cut:number[]=[];
  for(const f of cell.faces.filter(f=>f.source<0))for(let j=1;j<f.points.length-1;j++)for(const p of [f.points[0],f.points[j],f.points[j+1]])cut.push(...p.clone().sub(cell.center).toArray());
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(cut,3));geometry.computeVertexNormals();geometries.push(geometry);
  const inner=new THREE.Mesh(geometry,lavaMaterial);inner.userData.dicePowerArt=true;inner.userData.shatterChunk=true;object.add(inner);
  return {object,cell,preserved,body:undefined as Body|undefined,meltAt:undefined as number|undefined};
 });
 const globeGeometry=new THREE.IcosahedronGeometry(1,3);geometries.push(globeGeometry);
 const globs=new THREE.InstancedMesh(globeGeometry,lavaMaterial,8);globs.frustumCulled=false;globs.userData.dicePowerArt=true;globs.count=0;group.add(globs);
 const core=new THREE.Mesh(globeGeometry,lavaMaterial);core.userData.dicePowerArt=true;core.visible=false;group.add(core);
 const poolGeometry=new THREE.IcosahedronGeometry(1,3),poolVertices=poolGeometry.getAttribute('position');
 for(let i=0;i<poolVertices.count;i++){
  const p=new THREE.Vector3().fromBufferAttribute(poolVertices,i),angle=Math.atan2(p.y,p.x),edge=1+.12*Math.sin(angle*3+.6)+.07*Math.sin(angle*7-1.2);
  poolVertices.setXYZ(i,p.x*edge,p.y*edge,p.z);
 }
 poolGeometry.computeVertexNormals();geometries.push(poolGeometry);
 const pools=new THREE.InstancedMesh(poolGeometry,lavaMaterial,cells.length+1);pools.frustumCulled=false;pools.userData.dicePowerArt=true;pools.count=0;group.add(pools);
 const jetGeometry=new THREE.CylinderGeometry(.11,.20,1,9,5);geometries.push(jetGeometry);
 const jets=new THREE.InstancedMesh(jetGeometry,lavaMaterial,8);jets.frustumCulled=false;jets.userData.dicePowerArt=true;jets.count=0;group.add(jets);
 const glowCanvas=document.createElement('canvas');glowCanvas.width=glowCanvas.height=64;const ctx=glowCanvas.getContext('2d')!,gradient=ctx.createRadialGradient(32,32,0,32,32,32);
 gradient.addColorStop(0,'#fff3cc');gradient.addColorStop(.12,'#ffc054bc');gradient.addColorStop(.35,'#ff4b1248');gradient.addColorStop(1,'#ff240000');ctx.fillStyle=gradient;ctx.fillRect(0,0,64,64);
 const glowMap=new THREE.CanvasTexture(glowCanvas),glowGeometry=new THREE.BufferGeometry(),glowPositions=new Float32Array(cells.length*3+27),glowColors=new Float32Array(cells.length*3+27);geometries.push(glowGeometry);
 glowGeometry.setAttribute('position',new THREE.BufferAttribute(glowPositions,3));glowGeometry.setAttribute('color',new THREE.BufferAttribute(glowColors,3));
 const glowMaterial=new THREE.PointsMaterial({map:glowMap,size:1.15,vertexColors:true,transparent:true,opacity:0,depthWrite:false,blending:THREE.AdditiveBlending});materials.push(glowMaterial);
 const glow=new THREE.Points(glowGeometry,glowMaterial);glow.frustumCulled=false;glow.userData.dicePowerArt=true;group.add(glow);
 const pose=new THREE.Object3D(),origin=new THREE.Vector3(),scale=new THREE.Vector3(),rotation=new THREE.Quaternion(),inverseWorld=new THREE.Matrix4(),worldRotation=new THREE.Matrix4(),up=new THREE.Vector3(0,1,0),delta=new THREE.Vector3();
 const lightPositions=Array.from({length:8},()=>new THREE.Vector4());
 let physics:ShatterWorld|undefined,owned=false,broken=false,active=false,erupted=false,revision=0,lava:{body:Body;size:number;landed:boolean}[]=[];
 const random=(i:number)=>{const n=Math.sin(i*127.1+revision*47.7+311.7)*43758.5453;return n-Math.floor(n);};
 const clear=()=>{if(physics){for(const f of fragments)if(f.body){physics.remove(f.body);f.body=undefined;f.meltAt=undefined;}for(const drop of lava)physics.remove(drop.body);}lava=[];active=false;erupted=false;pools.count=0;};
 const start=()=>{
  if(!physics){physics=createShatterWorld(.85,1,-1);owned=true;}
  revision++;root.getWorldPosition(origin);root.getWorldScale(scale);root.getWorldQuaternion(rotation);
  for(const [i,f] of fragments.entries()){
   const size=scale.x,body=physics.addChunk(f.cell.vertices.map(v=>v.clone().multiplyScalar(size*.985).toArray()),f.cell.indices,f.cell.volume*Math.pow(size,3));f.body=body;
   const p=root.localToWorld(f.cell.center.clone());body.position.set(p.x,p.y,p.z);body.quaternion.set(rotation.x,rotation.y,rotation.z,rotation.w);
   const direction=f.cell.center.clone().applyQuaternion(rotation).normalize(),speed=(.48+random(i+2)*.38)/physics.metresPerUnit;
   body.velocity.set(direction.x*speed,direction.y*speed,(.33+random(i+3)*.40)/physics.metresPerUnit);
   body.angularVelocity.set((random(i+4)-.5)*55,(random(i+5)-.5)*55,(random(i+6)-.5)*55);
  }
  for(let i=0;i<8;i++){
   const size=scale.x*(.18+random(i+17)*.12),body=physics.addLava(size),angle=i*2.399963+random(i+22);
   body.position.set(origin.x+Math.cos(angle)*scale.x*.22,origin.y+Math.sin(angle)*scale.x*.22,origin.z);
   const speed=(.18+random(i+27)*.30)/physics.metresPerUnit;
   body.velocity.set(Math.cos(angle)*speed,Math.sin(angle)*speed,(.18+random(i+32)*.28)/physics.metresPerUnit);lava.push({body,size,landed:false});
  }
  active=true;erupted=true;
 };
 return {
  setWorld(world:ShatterWorld){clear();if(owned)physics?.dispose();physics=world;owned=false;},
  prewarm(enabled:boolean){for(const f of fragments)f.object.visible=enabled;lavaMaterial.opacity=0;globs.count=enabled?8:0;pools.count=enabled?cells.length+1:0;jets.count=enabled?8:0;core.visible=enabled;glowMaterial.opacity=0;},
  lights(){return lightPositions;},
  state(){return {broken,fragments:active?cells.length:0,lava:erupted?lava.length:0,pools:pools.count,melting:fragments.filter(f=>f.meltAt!==undefined).length,preservedSurfaces:fragments.reduce((n,f)=>n+f.preserved,0),physics:physics?.stats()};},
  update(now:number,maximum:boolean,age:number,reduced:boolean,camera:THREE.Camera){
   broken=maximum&&!reduced&&age>=DRUK_EXPLOSION_DELAY;for(const object of original)object.visible=!broken;
   if(!broken&&erupted)clear();
   if(broken&&!erupted)start();
   if(owned)physics?.advance(now);
   root.updateMatrixWorld(true);group.matrix.copy(root.matrixWorld).invert();group.matrixWorldNeedsUpdate=true;group.updateMatrixWorld(true);
   const t=age-DRUK_EXPLOSION_DELAY,floor=owned?-1:0;heat.value=broken?.68+.32*Math.exp(-Math.max(0,t)*.65):1;clock.value=now/1000;
   lavaMaterial.opacity=broken?1:0;glowMaterial.opacity=broken?.24*heat.value:0;glowMaterial.size=scale.x*1.4;globs.count=0;pools.count=0;jets.count=0;core.visible=false;
   for(const material of outerMaterials){material.uniforms.shatterFade.value=1;material.uniforms.rollPower.value=heat.value;}
   let g=0;lightPositions.forEach(p=>p.w=0);
   for(const f of fragments){
    f.object.visible=erupted;
    if(!f.body)continue;
    // Once a fragment reaches the felt it stops tumbling and liquefies there.
    // Remove its rigid body so later impacts cannot restart its rotation.
    if(f.meltAt===undefined&&t>.6&&(f.body.aabb.lowerBound.z<=floor+.07||t>=1.45)){
     f.meltAt=t;physics!.remove(f.body);f.body.velocity.setZero();f.body.angularVelocity.setZero();
    }
    const melt=f.meltAt===undefined?0:THREE.MathUtils.smoothstep(t-f.meltAt,0,.72);
    f.object.position.set(f.body.position.x,f.body.position.y,f.body.position.z);f.object.quaternion.set(f.body.quaternion.x,f.body.quaternion.y,f.body.quaternion.z,f.body.quaternion.w);f.object.scale.copy(scale);f.object.updateMatrixWorld(true);
    f.object.position.z=THREE.MathUtils.lerp(f.body.position.z,floor+.035,melt);
    f.object.scale.multiplyScalar(1-melt);f.object.scale.z*=1-melt;
    f.object.visible=erupted&&melt<.995;f.object.updateMatrixWorld(true);
    if(melt>0){
     pose.position.set(f.body.position.x,f.body.position.y,floor+.035);pose.quaternion.identity();
     const size=Math.cbrt(f.cell.volume)*scale.x;
     pose.scale.set(size*(.25+.8*melt),size*(.22+.72*melt),.055*scale.x*melt);pose.updateMatrix();pools.setMatrixAt(pools.count++,pose.matrix);
    }
    const eye=camera.position.clone().applyMatrix4(inverseWorld.copy(f.object.matrixWorld).invert()).add(f.cell.center),rot=new THREE.Matrix3().setFromMatrix4(worldRotation.makeRotationFromQuaternion(f.object.quaternion));
    f.object.traverse(c=>{if(c instanceof THREE.Mesh&&c.material instanceof THREE.ShaderMaterial){c.material.uniforms.eye.value.copy(eye);c.material.uniforms.rotation.value.copy(rot);c.material.uniforms.shatterMelt.value=melt;}});
    glowPositions.set(f.object.position.toArray(),g*3);glowColors.set([.5*heat.value,.15*heat.value,.018*heat.value],g*3);g++;
   }
   for(const [i,drop] of lava.entries()){
    // The fluid begins inside the shell: let it leave the fracture before it
    // becomes a separated glob, rather than solving an initial solid overlap.
    drop.body.collisionFilterMask=t<.12?1:11;
    const p=drop.body.position;pose.position.set(p.x,p.y,p.z);pose.quaternion.set(drop.body.quaternion.x,drop.body.quaternion.y,drop.body.quaternion.z,drop.body.quaternion.w);
    // Viscous impact: retain volume while spreading into a shallow hot pool.
    const onFloor=drop.landed||p.z<=drop.size+.045+floor||t>=1.5,spread=onFloor?1.95:1;
    if(onFloor&&!drop.landed){physics!.remove(drop.body);drop.landed=true;drop.body.velocity.setZero();drop.body.angularVelocity.setZero();}
    pose.scale.set(drop.size*spread,drop.size*spread,drop.size*(onFloor?.26:1));if(onFloor)pose.position.z=(owned?-1:0)+drop.size*.26;
    pose.updateMatrix();globs.setMatrixAt(i,pose.matrix);globs.count++;
    glowPositions.set(pose.position.toArray(),g*3);glowColors.set([heat.value,.33*heat.value,.025*heat.value],g*3);g++;
    lightPositions[i].set(pose.position.x,pose.position.y,pose.position.z,heat.value);
    if(t<.22){
     delta.copy(pose.position).sub(origin);pose.position.copy(origin).addScaledVector(delta,.5);pose.quaternion.setFromUnitVectors(up,delta.clone().normalize());pose.scale.set(scale.x*(1-t/.22),delta.length(),scale.x*(1-t/.22));pose.updateMatrix();jets.setMatrixAt(i,pose.matrix);jets.count++;
    }
   }
   // One lasting pool anchors each exploded die at its original landing point.
   if(erupted){
    const growth=THREE.MathUtils.smoothstep(t,0,1.35);
    pose.position.set(origin.x,origin.y,floor+.04);pose.quaternion.identity();pose.scale.set(scale.x*(.45+.8*growth),scale.x*(.38+.65*growth),scale.x*.065);pose.updateMatrix();pools.setMatrixAt(pools.count++,pose.matrix);
    glowPositions.set([origin.x,origin.y,floor+.08],g*3);glowColors.set([heat.value,.38*heat.value,.03*heat.value],g*3);g++;
    lightPositions[0].set(origin.x,origin.y,floor+.08,heat.value*1.3);
   }
   if(active&&t<.25){core.visible=true;core.position.copy(origin);core.scale.setScalar(scale.x*(.72+t*1.3)*(1-t/.25));}
   globs.instanceMatrix.needsUpdate=true;pools.instanceMatrix.needsUpdate=true;jets.instanceMatrix.needsUpdate=true;glowGeometry.setDrawRange(0,g);glowGeometry.attributes.position.needsUpdate=true;glowGeometry.attributes.color.needsUpdate=true;
   if(active&&t>=2.6){for(const f of fragments)if(f.body)physics!.remove(f.body);for(const drop of lava)physics!.remove(drop.body);active=false;}
  },
  dispose(){clear();if(owned)physics?.dispose();for(const object of original)object.visible=true;geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());glowMap.dispose();root.remove(group);},
 };
}
