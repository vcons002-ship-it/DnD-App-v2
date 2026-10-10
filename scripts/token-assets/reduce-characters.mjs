/** Create review candidates only; originals, texture pixels and runtime catalog remain untouched. */
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {NodeIO,PropertyType} from '@gltf-transform/core';
import {ALL_EXTENSIONS,EXTMeshoptCompression} from '@gltf-transform/extensions';
import {weld,simplifyPrimitive,reorder,prune} from '@gltf-transform/functions';
import {MeshoptDecoder,MeshoptEncoder,MeshoptSimplifier} from 'meshoptimizer';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const out=path.resolve(process.argv[2]??path.join(root,'artifacts/character-reduction'));
const manifest=JSON.parse(await fs.readFile(path.join(root,'client/public/miniatures/manifest.json'),'utf8'));
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
await Promise.all([MeshoptDecoder.ready,MeshoptEncoder.ready,MeshoptSimplifier.ready]);
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.decoder':MeshoptDecoder,'meshopt.encoder':MeshoptEncoder});
const profiles=[{id:'balanced',bodyRatio:.22,detailRatio:.45,error:.001},{id:'light',bodyRatio:.08,detailRatio:.25,error:.002}];
const accessor=a=>({type:a.getType(),normalized:a.getNormalized(),array:hash(Buffer.from(a.getArray().buffer,a.getArray().byteOffset,a.getArray().byteLength))});
const animations=d=>d.getRoot().listAnimations().map(a=>({name:a.getName(),channels:a.listChannels().map(c=>({node:c.getTargetNode().getName(),path:c.getTargetPath(),interpolation:c.getSampler().getInterpolation(),input:accessor(c.getSampler().getInput()),output:accessor(c.getSampler().getOutput())}))}));
const scene=d=>d.getRoot().listNodes().map(n=>({name:n.getName(),translation:n.getTranslation(),rotation:n.getRotation(),scale:n.getScale(),children:n.listChildren().map(x=>x.getName()),mesh:d.getRoot().listMeshes().indexOf(n.getMesh())}));
const materials=d=>d.getRoot().listMaterials().map(m=>({name:m.getName(),color:m.getBaseColorFactor(),metallic:m.getMetallicFactor(),roughness:m.getRoughnessFactor(),emissive:m.getEmissiveFactor(),alpha:m.getAlphaMode(),cutoff:m.getAlphaCutoff(),doubleSided:m.getDoubleSided()}));
function geometryBytes(d){const accessors=new Set();for(const m of d.getRoot().listMeshes())for(const p of m.listPrimitives()){accessors.add(p.getIndices());for(const a of p.listAttributes())accessors.add(a);}return [...accessors].reduce((n,a)=>n+a.getArray().byteLength,0);}
function audit(d){
 let triangles=0;
 for(const m of d.getRoot().listMeshes())for(const p of m.listPrimitives()){
  assert.equal(p.getMode(),4);assert(p.getIndices());assert.equal(p.listTargets().length,0);
  const pos=p.getAttribute('POSITION');assert.equal(pos.getArray().constructor,Float32Array);
  for(const v of pos.getArray())assert(Number.isFinite(v));
  for(const i of p.getIndices().getArray())assert(i<pos.getCount());
  for(const a of p.listAttributes())assert.equal(a.getCount(),pos.getCount());
  triangles+=p.getIndices().getCount()/3;
 }return triangles;
}
await fs.mkdir(out,{recursive:true});
const reports=[];
for(const model of manifest.models){
 const source=path.join(root,'client/public',model.url),sourceBytes=await fs.readFile(source);
 assert.equal(hash(sourceBytes),model.sha256);
 for(const policy of profiles){
  const start=performance.now(),doc=await io.readBinary(sourceBytes);
  assert.equal(doc.getRoot().listSkins().length,0);
  const beforeTriangles=audit(doc),sourceGeometryBytes=geometryBytes(doc),beforeScene=scene(doc),beforeMaterials=materials(doc),beforeAnimations=animations(doc),beforeJSON=(await io.writeJSON(doc)).json;
  const textures=doc.getRoot().listTextures().map(t=>({name:t.getName(),mime:t.getMimeType(),sha256:hash(t.getImage()),bytes:t.getImage().length}));
  await doc.transform(weld({overwrite:false}));
  const primitives=[];
  for(const mesh of doc.getRoot().listMeshes())for(const p of mesh.listPrimitives()){
   const nodes=doc.getRoot().listNodes().filter(n=>n.getMesh()===mesh).map(n=>n.getName());
   const label=[...nodes,p.getMaterial()?.getName()].join(' '),before=p.getIndices().getCount()/3;
   const detail=/head|face|hand(?!axe)|wrist|neck/i.test(label);
   const preserve=before<2000||/lightning|glow|repair|closure|transition|eye/i.test(label);
   let actualError=0;
   if(!preserve){
    // Retain existing vertex attributes. Weight normals, UVs and vertex color in
    // edge collapse selection, not just shape; never regenerate a texture atlas.
    const semantics=['NORMAL','TEXCOORD_0','COLOR_0'].filter(s=>p.getAttribute(s));
    const attrs=semantics.map(s=>p.getAttribute(s)),stride=attrs.reduce((n,a)=>n+a.getElementSize(),0);
    const packed=new Float32Array(p.getAttribute('POSITION').getCount()*stride),weights=[];
    for(const [ai,a] of attrs.entries()){
     assert.equal(a.getArray().constructor,Float32Array);
     for(let k=0;k<a.getElementSize();k++)weights.push(semantics[ai]==='NORMAL'?.05:.1);
    }
    for(let v=0;v<p.getAttribute('POSITION').getCount();v++){
     let offset=v*stride;for(const a of attrs)for(let k=0;k<a.getElementSize();k++)packed[offset++]=a.getArray()[v*a.getElementSize()+k];
    }
    const simplifier={simplify(indices,positions,posStride,target,error,flags){
     const result=MeshoptSimplifier.simplifyWithAttributes(indices,positions,posStride,packed,stride,weights,null,target,error,flags);
     actualError=result[1];return result;
    }};
    simplifyPrimitive(p,{simplifier,ratio:detail?policy.detailRatio:policy.bodyRatio,error:policy.error,lockBorder:true});
   }
   primitives.push({nodes,material:p.getMaterial()?.getName(),before,after:p.getIndices().getCount()/3,detail,preserved:preserve,actualError});
  }
  doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({method:EXTMeshoptCompression.EncoderMethod.QUANTIZE});
  await doc.transform(reorder({encoder:MeshoptEncoder,target:'size'}),prune({propertyTypes:[PropertyType.ACCESSOR],keepAttributes:true,keepIndices:true}));
  const bytes=Buffer.from(await io.writeBinary(doc)),check=await io.readBinary(bytes),triangles=audit(check);
  assert(triangles<beforeTriangles);
  assert.deepEqual(scene(check),beforeScene);assert.deepEqual(materials(check),beforeMaterials);assert.deepEqual(animations(check),beforeAnimations);
  const afterJSON=(await io.writeJSON(check)).json;
  for(const field of ['materials','nodes','scenes','scene','skins','cameras'])assert.deepEqual(afterJSON[field],beforeJSON[field],field+' preserved');
  assert.deepEqual(check.getRoot().listTextures().map(t=>({name:t.getName(),mime:t.getMimeType(),sha256:hash(t.getImage()),bytes:t.getImage().length})),textures);
  assert.equal(hash(await fs.readFile(source)),model.sha256);
  const sha256=hash(bytes),filename=`${model.id}-${policy.id}-${sha256.slice(0,12)}.glb`;
  await fs.writeFile(path.join(out,filename),bytes);
  const receipt={id:model.id,profile:policy.id,policy,sourceUrl:model.url,sourceSha256:model.sha256,sourceBytes:sourceBytes.length,sourceTriangles:beforeTriangles,sourceGeometryBytes,geometryBytes:geometryBytes(check),filename,sha256,bytes:bytes.length,triangles,baseCenter:model.baseCenter,baseDiameter:model.baseDiameter,fxUrl:model.fxUrl,baseTextureUrl:model.baseTextureUrl,textureBytes:textures.reduce((n,t)=>n+t.bytes,0),textures,primitives,elapsedMs:performance.now()-start,verified:{texturesByteExact:true,materialsPreserved:true,nodeTransformsPreserved:true,animationChannelsExact:true,validIndicesAndFinitePositions:true,sourceUnchanged:true},geometryLossless:false};
  await fs.writeFile(path.join(out,`${model.id}-${policy.id}.json`),JSON.stringify(receipt,null,2)+'\n');reports.push(receipt);
  console.log(`${model.id} ${policy.id}: ${beforeTriangles} -> ${triangles} triangles; ${(bytes.length/1e6).toFixed(2)} MB`);
 }
}
await fs.writeFile(path.join(out,'comparison.json'),JSON.stringify(reports,null,2)+'\n');
