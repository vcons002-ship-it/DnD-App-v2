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

/** Exact textured exterior pieces, solid fracture surfaces, and shared
 * rigid bodies. This cosmetic world starts only after a confirmed maximum. */
export function createDiceShatterArt(root:THREE.Group,faces:THREE.Vector3[][],_critical:boolean){
 const original=root.children.filter((c):c is THREE.Mesh=>c instanceof THREE.Mesh&&!c.userData.dicePowerArt);
 const cells=fractureDie(faces),group=new THREE.Group();group.matrixAutoUpdate=false;group.userData.dicePowerArt=true;root.add(group);
 const geometries:THREE.BufferGeometry[]=[],materials:THREE.Material[]=[],outerMaterials:THREE.ShaderMaterial[]=[];
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
   material.uniforms={...(source.material as THREE.ShaderMaterial).uniforms,eye:{value:new THREE.Vector3()},rotation:{value:new THREE.Matrix3()},shardOrigin:{value:cell.center},shatterFade:{value:0},rollPower:{value:1},eruptionPulse:{value:0},moltenWarning:{value:0}};
   material.vertexShader='uniform vec3 shardOrigin;\n'+material.vertexShader.replace('pos=position;','pos=position+shardOrigin;');
   material.fragmentShader='uniform float shatterFade;\n'+material.fragmentShader.replace('#include <tonemapping_fragment>','gl_FragColor.a*=shatterFade;\n#include <tonemapping_fragment>');
   material.transparent=true;materials.push(material);outerMaterials.push(material);
   const mesh=new THREE.Mesh(geometry,material);mesh.userData.dicePowerArt=true;mesh.userData.shatterChunk=true;mesh.frustumCulled=false;object.add(mesh);preserved++;
  }
  const cut:number[]=[];
  for(const f of cell.faces.filter(f=>f.source<0))for(let j=1;j<f.points.length-1;j++)for(const p of [f.points[0],f.points[j],f.points[j+1]])cut.push(...p.clone().sub(cell.center).toArray());
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(cut,3));geometry.computeVertexNormals();geometries.push(geometry);
  // Use the exterior's actual obsidian shader for the exposed core as well.
  // Fresh fracture faces have no gold trim, numerals or molten warning layer.
  const fractureMaterial=(original[0].material as THREE.ShaderMaterial).clone();
  fractureMaterial.uniforms={...(original[0].material as THREE.ShaderMaterial).uniforms,eye:{value:new THREE.Vector3()},rotation:{value:new THREE.Matrix3()},shardOrigin:{value:cell.center},shatterFade:{value:0},engraved:{value:false},metalEdge:{value:false},critical:{value:0},moltenCracks:{value:0},eruptionPulse:{value:0},moltenWarning:{value:0}};
  fractureMaterial.vertexShader='uniform vec3 shardOrigin;\n'+fractureMaterial.vertexShader.replace('pos=position;','pos=position+shardOrigin;');
  fractureMaterial.fragmentShader='uniform float shatterFade;\n'+fractureMaterial.fragmentShader.replace('#include <tonemapping_fragment>','gl_FragColor.a*=shatterFade;\n#include <tonemapping_fragment>');
  fractureMaterial.transparent=true;materials.push(fractureMaterial);outerMaterials.push(fractureMaterial);
  const inner=new THREE.Mesh(geometry,fractureMaterial);inner.userData.dicePowerArt=true;inner.userData.shatterChunk=true;object.add(inner);
  return {object,cell,preserved,body:undefined as Body|undefined,frozen:false};
 });
 const origin=new THREE.Vector3(),scale=new THREE.Vector3(),rotation=new THREE.Quaternion(),inverseWorld=new THREE.Matrix4(),worldRotation=new THREE.Matrix4();
 let physics:ShatterWorld|undefined,owned=false,broken=false,active=false,erupted=false,revision=0;
 const random=(i:number)=>{const n=Math.sin(i*127.1+revision*47.7+311.7)*43758.5453;return n-Math.floor(n);};
 const clear=()=>{
  for(const f of fragments){if(f.body)physics?.remove(f.body);f.body=undefined;f.frozen=false;f.object.visible=false;}
  active=false;erupted=false;
 };
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
  active=true;erupted=true;
 };
 return {
  setWorld(world:ShatterWorld){clear();if(owned)physics?.dispose();physics=world;owned=false;},
  prewarm(enabled:boolean){for(const f of fragments)f.object.visible=enabled;for(const material of outerMaterials)material.uniforms.shatterFade.value=0;},
  state(){return {broken,fragments:active?cells.length:0,frozenFragments:fragments.filter(f=>f.frozen).length,lava:0,pools:0,melting:0,preservedSurfaces:fragments.reduce((n,f)=>n+f.preserved,0),physics:physics?.stats()};},
  update(now:number,maximum:boolean,age:number,reduced:boolean,camera:THREE.Camera){
   broken=maximum&&!reduced&&age>=DRUK_EXPLOSION_DELAY;for(const object of original)object.visible=!broken;
   if(!broken&&erupted)clear();
   if(broken&&!erupted)start();
   if(owned)physics?.advance(now);
   root.updateMatrixWorld(true);group.matrix.copy(root.matrixWorld).invert();group.matrixWorldNeedsUpdate=true;group.updateMatrixWorld(true);
   const t=age-DRUK_EXPLOSION_DELAY,floor=owned?-1:0,heat=Math.exp(-Math.max(0,t)*.85),fade=broken?1-THREE.MathUtils.smoothstep(t,1.8,2.6):0;
   for(const material of outerMaterials){material.uniforms.shatterFade.value=fade;material.uniforms.rollPower.value=heat;}
   for(const f of fragments){
    f.object.visible=active&&fade>0;if(!f.body)continue;
    // End the tumble before the fade; later collisions cannot wake the shard.
    if(!f.frozen&&t>.65&&(f.body.aabb.lowerBound.z<=floor+.07||t>=1.45)){
     physics!.remove(f.body);f.body.velocity.setZero();f.body.angularVelocity.setZero();f.frozen=true;
    }
    f.object.position.set(f.body.position.x,f.body.position.y,f.body.position.z);f.object.quaternion.set(f.body.quaternion.x,f.body.quaternion.y,f.body.quaternion.z,f.body.quaternion.w);f.object.scale.copy(scale);f.object.updateMatrixWorld(true);
    const eye=camera.position.clone().applyMatrix4(inverseWorld.copy(f.object.matrixWorld).invert()).add(f.cell.center),rot=new THREE.Matrix3().setFromMatrix4(worldRotation.makeRotationFromQuaternion(f.object.quaternion));
    f.object.traverse(c=>{if(c instanceof THREE.Mesh&&c.material instanceof THREE.ShaderMaterial){c.material.uniforms.eye.value.copy(eye);c.material.uniforms.rotation.value.copy(rot);}});
   }
   if(active&&t>=2.6){for(const f of fragments)if(f.body)physics!.remove(f.body);active=false;}
  },
  dispose(){clear();if(owned)physics?.dispose();for(const object of original)object.visible=true;geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());root.remove(group);},
 };
}
