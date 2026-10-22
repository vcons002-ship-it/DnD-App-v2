import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {MeshoptDecoder} from 'meshoptimizer';
await MeshoptDecoder.ready;
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.decoder':MeshoptDecoder});
import {verifySharedDelivery} from './shared-character-textures.mjs';
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const manifest=JSON.parse(await fs.readFile('client/public/miniatures/battlefield-manifest.json','utf8'));
const quality=JSON.parse(await fs.readFile('client/public/miniatures/quality-manifest.json','utf8'));
assert.equal(manifest.models.length,3);
for(const model of manifest.models){
 const receipt=JSON.parse(await fs.readFile(model.receipt,'utf8'));
 const source=quality.models.find(m=>m.id===model.id&&m.profile==='low');
 verifySharedDelivery(model);const sourceDelivery=verifySharedDelivery(source);
 assert.equal(receipt.sourceUrl,sourceDelivery.url);assert.equal(receipt.sourceSha256,sourceDelivery.sha256);
 assert.deepEqual(model.baseCenter,source.baseCenter??JSON.parse(await fs.readFile('client/public/miniatures/manifest.json','utf8')).models.find(m=>m.id===model.id).baseCenter);
 const bytes=await fs.readFile('client/public'+model.url);assert.equal(bytes.length,model.bytes);assert.equal(hash(bytes),model.sha256);
 const doc=await io.read('client/public'+model.url);let triangles=0;
 for(const m of doc.getRoot().listMeshes())for(const p of m.listPrimitives()){
  const pos=p.getAttribute('POSITION');for(const v of pos.getArray())assert(Number.isFinite(v));
  for(const i of p.getIndices().getArray())assert(i<pos.getCount());triangles+=p.getIndices().getCount()/3;
 }
 assert.equal(triangles,model.triangles);assert(triangles<source.triangles);
 assert.equal(receipt.primitives.reduce((sum,p)=>sum+p.before,0),source.triangles,'Receipt source triangle accounting');
 assert.equal(receipt.primitives.reduce((sum,p)=>sum+p.after,0),triangles,'Receipt output triangle accounting');
 // Target ratios are best-effort under the error and seam constraints. Enforce
 // those quality bounds instead of forcing another part below its safe floor.
 for(const primitive of receipt.primitives){
  assert(primitive.after<=primitive.before,'Battlefield primitives never grow');
  assert(Number.isFinite(primitive.actualError)&&primitive.actualError>=0&&
   Number.isFinite(primitive.reduction.error)&&primitive.actualError<=primitive.reduction.error,
   'Battlefield primitives stay within their declared error bound');
  if(primitive.preserved)assert.equal(primitive.after,primitive.before,'Protected pieces remain intact');
 }
 if(triangles>source.triangles*.75)console.warn(
  `${model.id}: battlefield retains ${(triangles/source.triangles*100).toFixed(1)}% of Low triangles; review performance before using it for large crowds`);
 const body=receipt.primitives.filter(p=>p.nodes.some(n=>/body/i.test(n))&&!p.preserved);
 assert(body.length>0);
 assert(body.every(p=>p.seamSafeBody&&p.reduction.ratio===.2&&p.reduction.error===.002&&p.reduction.permissive===false),'Battlefield bodies use the accepted seam-safe reduction');
 if(receipt.policy.seamSafeHead){
  assert.deepEqual(receipt.policy.seamSafeHead,{ratio:.5,error:.0015,permissive:false});
  const head=receipt.primitives.filter(p=>p.nodes.some(n=>/head|face/i.test(n)));
  assert(head.length>0);
  assert(head.every(p=>p.seamSafeHead&&p.reduction.ratio===.5&&p.reduction.error===.0015&&p.reduction.permissive===false),
   'Battlefield heads use the declared seam-safe reduction');
  assert(head.every(p=>p.preserved?p.before===p.after:p.actualError<=.0015),
   'Preserved heads remain intact and reduced heads stay within the error bound');
 }
 if(model.id==='vanec'){
  const head=receipt.primitives.filter(p=>p.nodes.some(n=>/head|face/i.test(n)));
  assert(head.length>0);assert(head.every(p=>p.preserved&&p.before===p.after),'Vanec head remains intact');
 }
 // Druk's approved layered repairs and Vanec's robe/head require higher floors.
 // Retain the previous budget for characters without a reviewed exception.
 if(!['druk','vanec'].includes(model.id))assert(triangles<source.triangles*.5);
 assert.deepEqual(doc.getRoot().listTextures().map(t=>hash(t.getImage())),receipt.textures.map(t=>t.sha256));
 assert(Object.values(receipt.verified).every(Boolean));
 console.log(`${model.id}: ${triangles.toLocaleString()} triangles; textures, bases and source hashes verified`);
}
