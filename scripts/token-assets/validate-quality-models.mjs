import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {verifySharedDelivery,imagePayload} from './shared-character-textures.mjs';
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const manifest=JSON.parse(await fs.readFile('client/public/miniatures/quality-manifest.json','utf8'));
const original=JSON.parse(await fs.readFile('client/public/miniatures/manifest.json','utf8'));
const seen=new Set();
for(const model of manifest.models){
  assert(['balanced','low'].includes(model.profile));
  const sourceDelivery=verifySharedDelivery(model);
  assert(original.models.some(m=>m.id===model.id&&verifySharedDelivery(m).url===model.sourceUrl));
  assert(!seen.has(`${model.id}:${model.profile}`));seen.add(`${model.id}:${model.profile}`);
  const receipt=JSON.parse(await fs.readFile(model.receipt,'utf8'));
  assert.equal(receipt.sourceSha256,model.sourceSha256);
  assert.equal(receipt.triangles,model.triangles);assert(receipt.triangles<receipt.sourceTriangles);
  if(model.refinementReceipt){
    const refinement=JSON.parse(await fs.readFile(model.refinementReceipt,'utf8'));
    assert.equal(refinement.sourceSha256,receipt.sha256);assert.equal(refinement.sha256,sourceDelivery.sha256);
    for(const value of Object.values(refinement.verified))assert.equal(value,true);
  }else assert.equal(receipt.sha256,sourceDelivery.sha256);
  const bytes=await fs.readFile('client/public'+model.url);
  assert.equal(bytes.length,model.bytes);assert.equal(hash(bytes),model.sha256);
  assert.equal(bytes.toString('ascii',0,4),'glTF');
  const size=bytes.readUInt32LE(12),json=JSON.parse(bytes.toString('utf8',20,20+size));
  const textures=(json.images??[]).map((image,index)=>hash(imagePayload(bytes,index,model.url))).sort();
  assert.deepEqual(textures,receipt.textures.map(t=>t.sha256).sort(),'Texture payloads must remain byte-exact');
  console.log(`${model.id} ${model.profile}: ${(model.bytes/1e6).toFixed(2)} MB, ${model.triangles.toLocaleString()} triangles; textures verified`);
}
assert.equal(seen.size,6);
