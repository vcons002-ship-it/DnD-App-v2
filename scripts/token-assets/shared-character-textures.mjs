/** Share encoded images without re-encoding a vertex, texture or animation.
 * The receipt can reconstruct the source GLB byte for byte, including JSON. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
export const sha256=b=>createHash('sha256').update(b).digest('hex');
export function parseGlb(bytes){assert.equal(bytes.toString('ascii',0,4),'glTF');assert.equal(bytes.readUInt32LE(8),bytes.length);const size=bytes.readUInt32LE(12);return{json:JSON.parse(bytes.toString('utf8',20,20+size)),jsonBytes:bytes.subarray(20,20+size),bin:bytes.subarray(28+size)}}
function pack(jsonBytes,bin){const out=Buffer.alloc(28+jsonBytes.length+bin.length);out.write('glTF');out.writeUInt32LE(2,4);out.writeUInt32LE(out.length,8);out.writeUInt32LE(jsonBytes.length,12);out.writeUInt32LE(0x4e4f534a,16);jsonBytes.copy(out,20);out.writeUInt32LE(bin.length,20+jsonBytes.length);out.writeUInt32LE(0x004e4942,24+jsonBytes.length);bin.copy(out,28+jsonBytes.length);return out}
export function shareGlbTextures(bytes){
 const {json,jsonBytes,bin}=parseGlb(bytes),images=[],ranges=[];
 for(const [index,image]of(json.images??[]).entries()){
  assert.equal(image.uri,undefined);const view=json.bufferViews[image.bufferView];assert.equal(view.buffer,0);assert(!view.extensions);const start=view.byteOffset??0,end=start+Math.ceil(view.byteLength/4)*4;
  assert(bin.subarray(start+view.byteLength,end).every(b=>b===0),'Nonzero texture alignment padding');
  const payload=Buffer.from(bin.subarray(start,start+view.byteLength)),sha=sha256(payload),extension=({'image/webp':'webp','image/png':'png','image/jpeg':'jpg'})[image.mimeType];assert(extension);
  const uri=`textures/${sha}.${extension}`;images.push({index,uri,sha256:sha,bytes:payload.length,payload});ranges.push({start,end,index,view:image.bufferView});image.uri=uri;delete image.bufferView;
 }
 ranges.sort((a,b)=>a.start-b.start);for(let i=1;i<ranges.length;i++)assert(ranges[i].start>=ranges[i-1].end,'Overlapping image buffer views');
 // Preserve buffer-view indices. Unused former image views occupy a four-byte
 // placeholder, so accessor/extension indices never change.
 const offset=x=>{let shift=0;for(const r of ranges){if(x>=r.end)shift+=r.end-r.start-4;else{assert(x<=r.start,'A geometry range overlaps texture storage');break}}return x-shift};
 const imageViews=new Set(ranges.map(r=>r.view));
 for(const[index,v]of json.bufferViews.entries()){
  if(imageViews.has(index)){v.byteOffset=offset(v.byteOffset??0);v.byteLength=4;continue}
  if(v.buffer===0)v.byteOffset=offset(v.byteOffset??0);
  const e=v.extensions?.EXT_meshopt_compression;if(e?.buffer===0)e.byteOffset=offset(e.byteOffset??0);
 }
 let at=0;const chunks=[];for(const r of ranges){chunks.push(bin.subarray(at,r.start),Buffer.alloc(4));at=r.end}chunks.push(bin.subarray(at));const nextBin=Buffer.concat(chunks);json.buffers[0].byteLength=nextBin.length;
 const text=Buffer.from(JSON.stringify(json));const padded=Buffer.alloc(Math.ceil(text.length/4)*4,32);text.copy(padded);const output=pack(padded,nextBin);
 const receipt={schemaVersion:1,sourceSha256:sha256(bytes),sourceBytes:bytes.length,sourceJsonBase64:jsonBytes.toString('base64'),sourceBinLength:bin.length,ranges,textures:images.map(({payload,...i})=>i),sha256:sha256(output),bytes:output.length,verified:{sourceGlbReconstructedByteExact:true}};
 assert.equal(sha256(restoreSharedGlb(output,receipt,uri=>images.find(i=>i.uri===uri).payload)),receipt.sourceSha256);
 return{bytes:output,images,receipt};
}
export function restoreSharedGlb(bytes,receipt,read){
 assert.equal(sha256(bytes),receipt.sha256);assert.equal(bytes.length,receipt.bytes);const{bin,json}=parseGlb(bytes);let sourceAt=0,targetAt=0;const chunks=[];
 for(const r of receipt.ranges){const length=r.start-sourceAt;chunks.push(bin.subarray(targetAt,targetAt+length));targetAt+=length;assert(bin.subarray(targetAt,targetAt+4).every(b=>b===0));targetAt+=4;
  const image=receipt.textures[r.index];assert.equal(json.images[r.index].uri,image.uri);assert.equal(json.images[r.index].bufferView,undefined);const payload=read(image.uri);assert.equal(payload.length,image.bytes);assert.equal(sha256(payload),image.sha256);chunks.push(payload,Buffer.alloc(r.end-r.start-payload.length));sourceAt=r.end;
 }
 chunks.push(bin.subarray(targetAt));const originalBin=Buffer.concat(chunks);assert.equal(originalBin.length,receipt.sourceBinLength);const result=pack(Buffer.from(receipt.sourceJsonBase64,'base64'),originalBin);assert.equal(sha256(result),receipt.sourceSha256,'Shared delivery must reconstruct every original byte');return result;
}
export function verifySharedDelivery(model,root=process.cwd()){
 if(!model.sharedTextureReceipt)return model;
 const receiptBytes=fs.readFileSync(path.join(root,model.sharedTextureReceipt));assert.equal(sha256(receiptBytes),model.sharedTextureReceiptSha256);const receipt=JSON.parse(receiptBytes);
 assert.equal(receipt.sha256,model.sha256);assert.equal(receipt.bytes,model.bytes);
 restoreSharedGlb(fs.readFileSync(path.join(root,'client/public',model.url)),receipt,uri=>{assert.match(uri,/^textures\/[a-f0-9]{64}\.(webp|png|jpg)$/);return fs.readFileSync(path.join(root,'client/public/miniatures',uri))});
 return {...model,url:receipt.sourceUrl,sha256:receipt.sourceSha256,bytes:receipt.sourceBytes};
}
export function imagePayload(bytes,index,modelUrl,root=process.cwd()){
 const{json,bin}=parseGlb(bytes),image=json.images[index];if(image.uri){assert.match(image.uri,/^textures\/[a-f0-9]{64}\.(webp|png|jpg)$/);return fs.readFileSync(path.join(root,'client/public',path.dirname(modelUrl),image.uri))}const view=json.bufferViews[image.bufferView];return bin.subarray(view.byteOffset??0,(view.byteOffset??0)+view.byteLength);
}
