/** Install a fully verified three-character batch, with new immutable URLs. */
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
assert(process.argv[2],'Pass the directory produced by compress-characters.mjs');
const input=path.resolve(process.argv[2]),publicPath=path.join(root,'client/public/miniatures');
const manifestPath=path.join(publicPath,'manifest.json'),manifest=JSON.parse(await fs.readFile(manifestPath,'utf8'));
const hash=b=>createHash('sha256').update(b).digest('hex'),copies=[];
for(const model of manifest.models){
 if(model.deliveryOptimization==='lossless-textures-and-mesh'){
  assert.equal(hash(await fs.readFile(path.join(publicPath,path.basename(model.url)))),model.sha256);continue;
 }
 const receiptBytes=await fs.readFile(path.join(input,model.id+'.json')),receipt=JSON.parse(receiptBytes);
 if(model.sha256===receipt.sha256){
  assert.equal(hash(await fs.readFile(path.join(publicPath,path.basename(model.url)))),receipt.sha256);continue;
 }
 assert.equal(receipt.id,model.id);assert.equal(receipt.sourceSha256,model.sha256);
 assert.equal(receipt.triangles,model.triangles);
 for(const check of ['triangleCornerAttributesExact','decodedTexturePixelsExact','sceneAndMaterialsExact','animationDataExact','noQuantization','noSimplification','noTextureResizing'])assert.equal(receipt.verified[check],true,check);
 const bytes=await fs.readFile(path.join(input,path.basename(receipt.url)));
 assert.equal(hash(bytes),receipt.sha256);assert.equal(bytes.length,receipt.bytes);
 assert.deepEqual(receipt.textures.map(t=>t.sourceSha256),model.sourceImageHashes);
 const archive=`assets/miniatures/character-compression/${model.id}.json`;
 copies.push({file:path.join(publicPath,path.basename(receipt.url)),bytes},{file:path.join(root,archive),bytes:receiptBytes});
 Object.assign(model,{url:receipt.url,sha256:receipt.sha256,bytes:receipt.bytes,deliveryOptimization:'lossless-textures-and-mesh',
  runtimeImageHashes:receipt.textures.map(t=>t.sha256),optimizationReceipt:archive,optimizationReceiptSha256:hash(receiptBytes)});
}
if(!copies.length){console.log('All character delivery copies are already installed.');process.exit(0);}
for(const {file,bytes} of copies){await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,bytes);}
// The project already uses scoped regular-Git exceptions for new assets while
// LFS is out of quota. Apply the same policy only to these exact new URLs.
const attributePath=path.join(root,'.gitattributes');
await fs.appendFile(attributePath,'\n# Verified lossless character delivery copies and byte-stable receipts.\n'+manifest.models.map(m=>`client/public${m.url} -filter -diff -merge -text`).join('\n')+'\nassets/miniatures/character-compression/*.json -filter diff merge -text whitespace=cr-at-eol\n');
await fs.writeFile(manifestPath,JSON.stringify(manifest,null,2)+'\n');
console.log(manifest.models.map(m=>`${m.id}: ${m.url} (${m.bytes} bytes)`).join('\n'));
