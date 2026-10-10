/** Refine the approved generated weapons, preserving grips and all other geometry. */
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {MeshoptDecoder,MeshoptEncoder} from 'meshoptimizer';
import {Matrix3,Vector3} from 'three';
await Promise.all([MeshoptDecoder.ready,MeshoptEncoder.ready]);
const source=path.resolve(process.argv[2]),out=path.resolve(process.argv[3]);
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.decoder':MeshoptDecoder,'meshopt.encoder':MeshoptEncoder});
const original=await fs.readFile(source),doc=await io.readBinary(original);
const nodes=doc.getRoot().listNodes().filter(n=>/VarisV5_(Right|Left)_Generated_Weapon/.test(n.getName()));
assert.equal(nodes.length,2);
const textures=doc.getRoot().listTextures().map(t=>hash(t.getImage()));
const scene=doc.getRoot().listNodes().map(n=>[n.getName(),n.getTranslation(),n.getRotation(),n.getScale()]);
const sourceTriangles=doc.getRoot().listMeshes().flatMap(m=>m.listPrimitives()).reduce((n,p)=>n+p.getIndices().getCount()/3,0);
const preservedGrips=[];
const unchanged=new Map(doc.getRoot().listMeshes().filter(m=>!nodes.some(n=>n.getMesh()===m)).flatMap(m=>m.listPrimitives().flatMap(p=>p.listAttributes().map(a=>[a,hash(Buffer.from(a.getArray().buffer,a.getArray().byteOffset,a.getArray().byteLength))]))));
const smooth=x=>{x=Math.max(0,Math.min(1,x));return x*x*(3-2*x);};
const changes=[];
for(const node of nodes){
 const knife=node.getName().includes('Left'),start=knife?.035:-.34,full=knife?.18:-.18,centerZ=knife?-.00214:-.001969;
 const positions=node.getMesh().listPrimitives().flatMap(p=>Array.from({length:p.getAttribute('POSITION').getCount()},(_,i)=>p.getAttribute('POSITION').getElement(i,[])));
 // Cross-sections retain the generated curved knife silhouette and texture mapping.
 const sections=Array.from({length:61},(_,i)=>{
  const y=start+(1-start)*i/60,a=positions.filter(p=>Math.abs(p[1]-y)<.04);
  const min=Math.min(...a.map(p=>p[0])),max=Math.max(...a.map(p=>p[0]));
  return {y,center:(min+max)/2,half:Math.max(.008,(max-min)/2)};
 });
 function section(y){const t=Math.max(0,Math.min(60,(y-start)/(1-start)*60)),i=Math.min(59,Math.floor(t)),f=t-i;return {center:sections[i].center*(1-f)+sections[i+1].center*f,half:sections[i].half*(1-f)+sections[i+1].half*f};}
 function shape(p){
  const [x,y,z]=p;if(y<=start)return p.slice();
  const w=smooth((y-start)/(full-start)),s=section(y),edge=Math.min(1,Math.abs(x-s.center)/s.half);
  const tip=smooth((y-.82)/(.995-.82));
  // Thin the cutting edge more than the central spine; converge to a crisp point.
  const thickness=(.58-.39*Math.pow(edge,2))*(1-.93*tip);
  return [s.center+(x-s.center)*(1-.82*tip),y+.022*tip,centerZ+(z-centerZ)*(1-w+w*thickness)];
 }
 const materialCache=new Map();let moved=0,preserved=0,steelFaces=0;
 for(const p of [...node.getMesh().listPrimitives()]){
  const pos=p.getAttribute('POSITION'),normal=p.getAttribute('NORMAL'),pa=pos.getArray().slice(),na=normal.getArray().slice(),oldPositions=pos.getArray();
  for(let i=0;i<pos.getCount();i++){
   const v=pos.getElement(i,[]),n=normal.getElement(i,[]),v2=shape(v);pa.set(v2,i*3);
   if(v[1]<=start){preserved++;continue;}moved++;
   // Inverse-transpose of the deformation derivative retains the original smooth shading.
   const epsilon=.0001,j=new Float32Array(9);
   for(let k=0;k<3;k++){const a=v.slice(),b=v.slice();a[k]+=epsilon;b[k]-=epsilon;const aa=shape(a),bb=shape(b);for(let r=0;r<3;r++)j[k*3+r]=(aa[r]-bb[r])/(2*epsilon);}
   const matrix=new Matrix3().fromArray(j);
   if(Math.abs(matrix.determinant())>1e-8){matrix.invert().transpose();na.set(new Vector3(...n).applyMatrix3(matrix).normalize().toArray(),i*3);}
  }
  pos.setArray(pa);normal.setArray(na);
  for(let i=0;i<pos.getCount();i++)if(oldPositions[i*3+1]<=start){assert.deepEqual(Array.from(pa.slice(i*3,i*3+3)),Array.from(oldPositions.slice(i*3,i*3+3)));}
  preservedGrips.push({positions:pos,indices:Array.from({length:pos.getCount()},(_,i)=>i).filter(i=>oldPositions[i*3+1]<=start),expected:oldPositions});
  const old=p.getIndices().getArray(),blade=[],other=[];
  for(let i=0;i<old.length;i+=3){const triangle=[old[i],old[i+1],old[i+2]],arr=triangle.every(v=>oldPositions[v*3+1]>start+.025)?blade:other;arr.push(...triangle);}
  if(blade.length){
   const originalMaterial=p.getMaterial();let steel=materialCache.get(originalMaterial);
   if(!steel){steel=originalMaterial.clone().setName(originalMaterial.getName()+'_Sharpened_Steel').setMetallicFactor(.72).setRoughnessFactor(.30);materialCache.set(originalMaterial,steel);}
   const b=p.clone().setMaterial(steel),idx=p.getIndices().clone().setArray(new old.constructor(blade));b.setIndices(idx);node.getMesh().addPrimitive(b);steelFaces+=blade.length/3;
   if(other.length)p.setIndices(p.getIndices().clone().setArray(new old.constructor(other)));else{node.getMesh().removePrimitive(p);p.dispose();}
  }
 }
 changes.push({node:node.getName(),bladeStart:start,changedVertices:moved,unchangedGripVertices:preserved,steelFaces});
}
for(const [a,h] of unchanged)assert.equal(hash(Buffer.from(a.getArray().buffer,a.getArray().byteOffset,a.getArray().byteLength)),h);
for(const g of preservedGrips)for(const i of g.indices)assert.deepEqual(g.positions.getElement(i,[]),Array.from(g.expected.slice(i*3,i*3+3)));
const bytes=Buffer.from(await io.writeBinary(doc)),check=await io.readBinary(bytes);
assert.deepEqual(check.getRoot().listNodes().map(n=>[n.getName(),n.getTranslation(),n.getRotation(),n.getScale()]),scene);
assert.deepEqual(check.getRoot().listTextures().map(t=>hash(t.getImage())),textures);
let triangles=0;
for(const m of check.getRoot().listMeshes())for(const p of m.listPrimitives()){
 const a=p.getAttribute('POSITION');for(const v of a.getArray())assert(Number.isFinite(v));for(const v of p.getAttribute('NORMAL').getArray())assert(Number.isFinite(v));
 for(const i of p.getIndices().getArray())assert(i<a.getCount());triangles+=p.getIndices().getCount()/3;
}
assert.equal(hash(await fs.readFile(source)),hash(original));
assert.equal(triangles,sourceTriangles);
await fs.mkdir(out,{recursive:true});
const sha256=hash(bytes),filename=`varis-sharpened-weapons-${sha256.slice(0,12)}.glb`;
await fs.writeFile(path.join(out,filename),bytes);
const receipt={source,sourceSha256:hash(original),filename,sha256,bytes:bytes.length,triangles,changes,verified:{texturesByteExact:true,unrelatedGeometryExact:true,gripVerticesExact:true,triangleCountUnchanged:true,nodeTransformsExact:true,sourceUnchanged:true,validGeometry:true},method:'Refined existing multi-view-generated blades; handles unchanged; blade-only steel materials.'};
await fs.writeFile(path.join(out,'weapon-refinement.json'),JSON.stringify(receipt,null,2));console.log(JSON.stringify(receipt,null,2));
