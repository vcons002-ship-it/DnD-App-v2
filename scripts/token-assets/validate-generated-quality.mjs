/** Verify reviewed generated-model close-ups without network or source masters. */
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {createDeliveryIO} from '../../server/tools/asset-production/lossless_delivery.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const directory=path.join(root,'client/public/miniatures');
const manifest=JSON.parse(await fs.readFile(path.join(directory,'generated-quality-manifest.json'),'utf8'));
assert.equal(manifest.schemaVersion,1);
assert.equal(manifest.policy,'generated-character-tiers-creature-high-v1');
const io=await createDeliveryIO();
for(const model of manifest.models){
  assert.match(model.baseSha256,/^[a-f0-9]{64}$/);
  assert(model.highDetail);
  for(const detail of [model.highDetail,model.balancedDetail].filter(Boolean)){
    assert.match(detail.url,/^\/miniatures\/generated-(high|balanced)-[a-z0-9-]+\.glb$/);
    const bytes=await fs.readFile(path.join(directory,path.basename(detail.url)));
    assert.equal(bytes.length,detail.bytes);assert(bytes.length<=12*1024*1024);
    assert.equal(createHash('sha256').update(bytes).digest('hex'),detail.sha256);
    const gltf=JSON.parse(bytes.toString('utf8',20,20+bytes.readUInt32LE(12)));
    assert(gltf.buffers.every(b=>!b.uri));assert(gltf.images.every(i=>i.bufferView!==undefined));
    assert.equal(gltf.skins?.length??0,0);
    const doc=await io.readBinary(bytes);let triangles=0;
    for(const mesh of doc.getRoot().listMeshes())for(const p of mesh.listPrimitives()){
      assert.equal(p.getMode(),4);triangles+=p.getIndices().getCount()/3;
      assert(p.getAttribute('POSITION').getArray().every(Number.isFinite));
    }
    assert.equal(triangles,detail.triangles);assert(triangles>20000&&triangles<=200000);
    console.log(`${model.id}: ${triangles} triangles, ${(bytes.length/1e6).toFixed(2)} MB; generated detail verified`);
  }
}
