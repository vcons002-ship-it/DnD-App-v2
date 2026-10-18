import {test} from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {Document} from '@gltf-transform/core';
import sharp from 'sharp';
import {createDeliveryIO,optimizeDelivery,texturePixels,geometryFingerprint,DELIVERY_POLICY} from './lossless_delivery.mjs';

const run=promisify(execFile);
async function fixture(){
  const doc=new Document(),buffer=doc.createBuffer();
  const position=doc.createAccessor().setType('VEC3').setArray(new Float32Array([
    -.12345679,0,0, 1.2345679,0,0, 0,1.456789,0, -.12345679,0,0, 0,1.456789,0, -1,0,0,
  ])).setBuffer(buffer);
  const normal=doc.createAccessor().setType('VEC3').setArray(new Float32Array([0,0,1,0,0,1,0,0,1,0,0,1,0,0,1,0,0,1])).setBuffer(buffer);
  const uv=doc.createAccessor().setType('VEC2').setArray(new Float32Array([.12345679,0,1,0,.5,1,.12345679,0,.5,1,0,0])).setBuffer(buffer);
  const index=doc.createAccessor().setType('SCALAR').setArray(new Uint16Array([0,1,2,3,4,5])).setBuffer(buffer);
  let seed=12345;const pixels=Buffer.alloc(256*256*3);for(let i=0;i<pixels.length;i+=3){seed=(Math.imul(seed,1664525)+1013904223)>>>0;pixels[i]=255;pixels[i+1]=seed>>>24;pixels[i+2]=seed>>>16;}
  const data=await sharp(pixels,{raw:{width:256,height:256,channels:3}}).png({compressionLevel:0}).toBuffer();
  const color=await sharp({create:{width:32,height:32,channels:3,background:'#9a7841'}}).jpeg({quality:95,chromaSubsampling:'4:4:4'}).toBuffer();
  const colorTexture=doc.createTexture('albedo').setImage(color).setMimeType('image/jpeg');
  const dataTexture=doc.createTexture('material').setImage(data).setMimeType('image/png');
  const material=doc.createMaterial('armor').setBaseColorTexture(colorTexture).setMetallicRoughnessTexture(dataTexture).setMetallicFactor(.83).setRoughnessFactor(.61);
  const primitive=doc.createPrimitive().setAttribute('POSITION',position).setAttribute('NORMAL',normal).setAttribute('TEXCOORD_0',uv).setIndices(index).setMaterial(material);
  const mesh=doc.createMesh('body').addPrimitive(primitive),node=doc.createNode('placed-body').setMesh(mesh).setTranslation([.12,.055,-.24]);
  doc.createScene('token').addChild(node);return {doc,color,data};
}

test('delivery compression preserves material channels, JPEG bytes, triangle corners and scene transforms',async()=>{
  const io=await createDeliveryIO(),{doc,color,data}=await fixture(),geometry=geometryFingerprint(doc),before=(await io.writeJSON(doc)).json;
  const {bytes,receipt}=await optimizeDelivery(doc,io),check=await io.readBinary(bytes),after=(await io.writeJSON(check)).json;
  assert.equal(receipt.applied,true);assert(bytes.length<receipt.sourceBytes);assert.equal(receipt.policy,DELIVERY_POLICY);
  assert.deepEqual(geometryFingerprint(check),geometry);
  assert.deepEqual(after.nodes,before.nodes);assert.deepEqual(after.materials,before.materials);
  assert.deepEqual(Buffer.from(check.getRoot().listTextures()[0].getImage()),color,'No new JPEG generation');
  assert.deepEqual(await texturePixels(check.getRoot().listTextures()[1].getImage()),await texturePixels(data));
  assert.equal(receipt.verified.noQuantization,true);assert.equal(receipt.verified.noTextureResizing,true);
  assert.equal(geometry.reduce((n,p)=>n+p.triangles,0),2);
  const p=check.getRoot().listMeshes()[0].listPrimitives()[0];
  assert(p.getAttribute('POSITION').getArray().includes(Math.fround(1.2345679)),'Float32 position precision retained');
  assert(p.getAttribute('TEXCOORD_0').getArray().includes(Math.fround(.12345679)),'Float32 UV precision retained');
  if(receipt.textures.some(t=>t.mime==='image/webp'))assert(after.extensionsRequired.includes('EXT_texture_webp'));
  assert(after.extensionsRequired.includes('EXT_meshopt_compression'));
});

test('transparent RGB and alpha survive; encoders that alter them are rejected',async()=>{
  const io=await createDeliveryIO(),{doc}=await fixture(),rgba=Buffer.alloc(128*128*4);
  for(let i=0;i<rgba.length;i+=4)rgba.set([i%255,83,(i*7)%255,i%12===0?0:128],i);
  const png=await sharp(rgba,{raw:{width:128,height:128,channels:4}}).png({compressionLevel:0}).toBuffer();
  doc.getRoot().listTextures()[1].setImage(png);
  const {bytes}=await optimizeDelivery(doc,io),result=await io.readBinary(bytes);
  assert.deepEqual(await texturePixels(result.getRoot().listTextures()[1].getImage()),await texturePixels(png));
});

test('tagged PNG files retain their exact encoded image and color profile',async()=>{
  const io=await createDeliveryIO(),{doc}=await fixture();
  const tagged=await sharp({create:{width:128,height:128,channels:3,background:'#b48740'}}).withIccProfile('srgb').png({compressionLevel:0}).toBuffer();
  doc.getRoot().listTextures()[1].setImage(tagged);
  const {bytes,receipt}=await optimizeDelivery(doc,io),result=await io.readBinary(bytes);
  assert.deepEqual(Buffer.from(result.getRoot().listTextures()[1].getImage()),tagged);
  assert.equal(receipt.textures[1].method,'preserved');
});

test('tiny models fall back to their original encoding when extensions would make the file larger',async()=>{
  const io=await createDeliveryIO(),{doc}=await fixture();
  for(const material of doc.getRoot().listMaterials()){material.setBaseColorTexture(null);material.setMetallicRoughnessTexture(null);}
  for(const texture of doc.getRoot().listTextures())texture.dispose();
  const {bytes,receipt}=await optimizeDelivery(doc,io),result=await io.readBinary(bytes);
  assert(bytes.length<=receipt.sourceBytes);assert.equal(bytes.length,receipt.bytes);
  assert.equal(receipt.applied,false);assert.equal(receipt.bytesSaved,0);
  assert.equal(result.getRoot().listMeshes()[0].listPrimitives()[0].getIndices().getCount(),6);
});

test('final packaging invokes compression after restoring Blender texture bytes and writes verified size/hash metadata',async()=>{
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'dnd-delivery-test-'));
  try{
    const io=await createDeliveryIO(),{doc,data}=await fixture(),master=path.join(directory,'master.glb'),based=path.join(directory,'based.glb'),output=path.join(directory,'model.glb');
    await io.write(master,doc);
    doc.getRoot().listTextures()[1].setImage(await sharp({create:{width:256,height:256,channels:3,background:'#00ff00'}}).png().toBuffer());
    await io.write(based,doc);const sourceBytes=await fs.readFile(master),basedBytes=await fs.readFile(based);
    await run(process.execPath,[fileURLToPath(new URL('./package.mjs',import.meta.url)),master,based,output,'test-family']);
    const bytes=await fs.readFile(output),result=await io.readBinary(bytes),meta=JSON.parse(await fs.readFile(path.join(directory,'model.json'),'utf8')),receipt=JSON.parse(await fs.readFile(output+'.compression.json','utf8'));
    assert.equal(meta.deliveryPolicy,DELIVERY_POLICY);assert.equal(meta.bytes,bytes.length);assert.equal(meta.sha256,receipt.sha256);assert.equal(meta.triangles,2);assert(meta.deliveryBytesSaved>0);
    assert.deepEqual(await texturePixels(result.getRoot().listTextures()[1].getImage()),await texturePixels(data),'Uses restored master material texture');
    assert.deepEqual(await fs.readFile(master),sourceBytes);assert.deepEqual(await fs.readFile(based),basedBytes);
  }finally{await fs.rm(directory,{recursive:true,force:true});}
});
