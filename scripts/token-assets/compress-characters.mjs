/** Lossless character delivery copies. Never edits the input files or manifest. */
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {NodeIO,PropertyType} from '@gltf-transform/core';
import {ALL_EXTENSIONS,EXTMeshoptCompression,EXTTextureWebP} from '@gltf-transform/extensions';
import {weld,reorder,prune} from '@gltf-transform/functions';
import {MeshoptEncoder,MeshoptDecoder} from 'meshoptimizer';
import sharp from 'sharp';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const directory=path.join(root,'client/public/miniatures');
const out=path.resolve(process.argv[2]??path.join(root,'artifacts/character-lossless'));
const manifest=JSON.parse(await fs.readFile(path.join(directory,'manifest.json'),'utf8'));
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
await Promise.all([MeshoptEncoder.ready,MeshoptDecoder.ready]);
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.encoder':MeshoptEncoder,'meshopt.decoder':MeshoptDecoder});
const pixels=async b=>{const {data,info}=await sharp(b).ensureAlpha().raw().toBuffer({resolveWithObject:true});return {width:info.width,height:info.height,channels:info.channels,sha256:hash(data)};};
const accessor=a=>{const ar=a.getArray();return {type:a.getType(),component:a.getComponentType(),normalized:a.getNormalized(),count:a.getCount(),sha256:hash(Buffer.from(ar.buffer,ar.byteOffset,ar.byteLength))};};
const animations=d=>d.getRoot().listAnimations().map(a=>({name:a.getName(),extras:a.getExtras(),channels:a.listChannels().map(c=>{
 const sampler=c.getSampler();return {node:d.getRoot().listNodes().indexOf(c.getTargetNode()),path:c.getTargetPath(),interpolation:sampler.getInterpolation(),input:accessor(sampler.getInput()),output:accessor(sampler.getOutput())};
})}));
// Hash exact attribute bytes at every corner, retaining winding. Only cyclic
// triangle-index rotations and triangle ordering are allowed to differ.
function geometry(d){
 const result=[];
 for(const m of d.getRoot().listMeshes())for(const p of m.listPrimitives()){
  assert.equal(p.listTargets().length,0,'Morph targets require their own preservation check');
  const attrs=p.listSemantics().sort().map(s=>{const a=p.getAttribute(s),ar=a.getArray();return {semantic:s,type:a.getType(),component:a.getComponentType(),normalized:a.getNormalized(),stride:a.getElementSize()*ar.BYTES_PER_ELEMENT,bytes:Buffer.from(ar.buffer,ar.byteOffset,ar.byteLength)};});
  const vertices=[];
  for(let i=0;i<p.getAttribute('POSITION').getCount();i++){const h=crypto.createHash('sha256');for(const a of attrs)h.update(a.bytes.subarray(i*a.stride,(i+1)*a.stride));vertices.push(h.digest('hex'));}
  const ix=p.getIndices().getArray(),triangles=[];
  for(let i=0;i<ix.length;i+=3){const a=vertices[ix[i]],b=vertices[ix[i+1]],c=vertices[ix[i+2]];triangles.push([a+b+c,b+c+a,c+a+b].sort()[0]);}
  triangles.sort();const h=crypto.createHash('sha256');for(const t of triangles)h.update(t);
  result.push({mesh:m.getName(),material:p.getMaterial()?.getName(),mode:p.getMode(),attributes:attrs.map(({bytes,stride,...a})=>a),triangles:ix.length/3,triangleContentSha256:h.digest('hex')});
 }
 return result;
}
const vertexCount=d=>d.getRoot().listMeshes().reduce((sum,m)=>sum+m.listPrimitives().reduce((n,p)=>n+p.getAttribute('POSITION').getCount(),0),0);
await fs.mkdir(out,{recursive:true});
for(const model of manifest.models){
 if(model.deliveryOptimization==='lossless-textures-and-mesh'){
  console.log(model.id+': already optimized; validate-runtime.mjs verifies the installed receipt and pixels');continue;
 }
 const source=path.join(directory,path.basename(model.url)),input=await fs.readFile(source);
 assert.equal(hash(input),model.sha256,model.id+' source hash');
 console.log(model.id+': checking full-detail source');
 const doc=await io.read(source),baseline=geometry(doc),animationBefore=animations(doc);
 const originalJSON=(await io.writeJSON(doc)).json,verticesBefore=vertexCount(doc);
 const textures=[];
 for(const [i,t] of doc.getRoot().listTextures().entries()){
  const b=Buffer.from(t.getImage()),mime=t.getMimeType(),rgba=await pixels(b),meta=await sharp(b).metadata();
  let selected=b,selectedMime=mime,method='original';
  // Preserve tagged color profiles; the PNG/WebP conversion here targets the
  // ordinary untagged 8-bit atlases used by the approved character artwork.
  if(mime==='image/png'&&!meta.icc&&meta.depth==='uchar'){
   for(const [label,format,data] of [
    ['lossless PNG','image/png',await sharp(b).png({compressionLevel:9,adaptiveFiltering:true,palette:false,effort:10}).toBuffer()],
    ['lossless WebP','image/webp',await sharp(b).webp({lossless:true,effort:6}).toBuffer()],
   ])if(data.length<selected.length&&JSON.stringify(await pixels(data))===JSON.stringify(rgba)){selected=data;selectedMime=format;method=label;}
  }
  t.setImage(selected).setMimeType(selectedMime);
  textures.push({index:i,sourceBytes:b.length,sourceSha256:hash(b),sourceMime:mime,bytes:selected.length,sha256:hash(selected),mime:selectedMime,method,decodedRgba:rgba});
  console.log(`${model.id}: texture ${i+1} ${method}, ${b.length} -> ${selected.length}`);
 }
 if(textures.some(t=>t.mime==='image/webp'))doc.createExtension(EXTTextureWebP).setRequired(true);
 // QUANTIZE selects the no-filter codec path. Do NOT call quantize() or the
 // meshopt() transform: no attribute precision is reduced by this workflow.
 doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({method:EXTMeshoptCompression.EncoderMethod.QUANTIZE});
 await doc.transform(weld({overwrite:true}),reorder({encoder:MeshoptEncoder,target:'size'}),prune({propertyTypes:[PropertyType.ACCESSOR],keepAttributes:true,keepIndices:true}));
 const bytes=Buffer.from(await io.writeBinary(doc)),actual=await io.readBinary(bytes);
 assert.deepEqual(geometry(actual),baseline,model.id+' triangle-corner attributes');
 assert.deepEqual(animations(actual),animationBefore,model.id+' animation data');
 const actualJSON=(await io.writeJSON(actual)).json;
 for(const field of ['materials','nodes','scenes','scene','skins','cameras'])assert.deepEqual(actualJSON[field],originalJSON[field],model.id+' '+field);
 assert.deepEqual(await Promise.all(actual.getRoot().listTextures().map(t=>pixels(t.getImage()))),textures.map(t=>t.decodedRgba),model.id+' decoded pixels');
 const json=JSON.parse(bytes.toString('utf8',20,20+bytes.readUInt32LE(12)));
 for(const view of json.bufferViews){const ext=view.extensions?.EXT_meshopt_compression;assert(!ext?.filter||ext.filter==='NONE','Lossy mesh filter');}
 assert(bytes.length<input.length,model.id+' must get smaller');
 const sha256=hash(bytes),name=`${model.id}-${sha256.slice(0,12)}.glb`;
 await fs.writeFile(path.join(out,name),bytes,{flag:'wx'});
 const report={schemaVersion:1,id:model.id,sourceUrl:model.url,sourceSha256:model.sha256,sourceBytes:input.length,url:'/miniatures/'+name,sha256,bytes:bytes.length,triangles:baseline.reduce((n,p)=>n+p.triangles,0),verticesBefore,verticesAfter:vertexCount(actual),textures,geometry:baseline,animations:animationBefore,verified:{triangleCornerAttributesExact:true,decodedTexturePixelsExact:true,sceneAndMaterialsExact:true,animationDataExact:true,noQuantization:true,noSimplification:true,noTextureResizing:true}};
 await fs.writeFile(path.join(out,model.id+'.json'),JSON.stringify(report,null,2)+'\n');
 assert.equal(hash(await fs.readFile(source)),model.sha256,'Input must remain unchanged');
 console.log(`${model.id}: VERIFIED ${input.length} -> ${bytes.length} bytes (${((1-bytes.length/input.length)*100).toFixed(1)}% smaller)`);
}
