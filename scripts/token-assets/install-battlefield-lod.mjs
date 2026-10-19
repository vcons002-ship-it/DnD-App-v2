/** Install verified review candidates; never overwrite detailed source models. */
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
const input=path.resolve(process.argv[2]??'artifacts/battlefield-lod-seam-safe');
const models=[];
await fs.mkdir('assets/miniatures/battlefield-lod',{recursive:true});
for(const id of ['druk','varis','vanec']){
  const receipt=JSON.parse(await fs.readFile(path.join(input,`${id}-battlefield.json`),'utf8'));
  const bytes=await fs.readFile(path.join(input,receipt.filename));
  assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),receipt.sha256);
  assert.equal(receipt.profile,'battlefield');
  assert(receipt.triangles<receipt.sourceTriangles);
  assert(Object.values(receipt.verified).every(Boolean));
  const receiptPath=`assets/miniatures/battlefield-lod/${id}.json`;
  await fs.writeFile(`client/public/miniatures/${receipt.filename}`,bytes);
  await fs.writeFile(receiptPath,JSON.stringify(receipt,null,2)+'\n');
  const {baseCenter,baseDiameter,fxUrl,baseTextureUrl,triangles,sha256}=receipt;
  models.push({id,url:`/miniatures/${receipt.filename}`,sha256,bytes:bytes.length,triangles,baseCenter,baseDiameter,fxUrl,baseTextureUrl,receipt:receiptPath});
}
await fs.writeFile('client/public/miniatures/battlefield-manifest.json',JSON.stringify({schemaVersion:1,models},null,2)+'\n');
