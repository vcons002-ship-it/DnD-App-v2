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
 if(model.id==='vanec'){
  const head=receipt.primitives.filter(p=>p.nodes.some(n=>/head|face/i.test(n)));
  assert(head.length>0);assert(head.every(p=>p.preserved&&p.before===p.after),'Vanec head remains intact');
 }else assert(triangles<source.triangles*.5);
 assert.deepEqual(doc.getRoot().listTextures().map(t=>hash(t.getImage())),receipt.textures.map(t=>t.sha256));
 assert(Object.values(receipt.verified).every(Boolean));
 console.log(`${model.id}: ${triangles.toLocaleString()} triangles; textures, bases and source hashes verified`);
}
