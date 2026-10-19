/** Final delivery encoding, after Blender has fitted the base. Never resizes
 * textures, simplifies the mesh, quantizes attributes, or changes materials. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {NodeIO,PropertyType} from '@gltf-transform/core';
import {ALL_EXTENSIONS,EXTMeshoptCompression,EXTTextureWebP} from '@gltf-transform/extensions';
import {weld,reorder,prune} from '@gltf-transform/functions';
import {MeshoptEncoder,MeshoptDecoder} from 'meshoptimizer';
import sharp from 'sharp';

export const DELIVERY_POLICY='lossless-delivery-v1';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
export async function createDeliveryIO(){
  await Promise.all([MeshoptEncoder.ready,MeshoptDecoder.ready]);
  return new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
    'meshopt.encoder':MeshoptEncoder,'meshopt.decoder':MeshoptDecoder,
  });
}
export async function texturePixels(bytes){
  const {data,info}=await sharp(bytes).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  return {width:info.width,height:info.height,channels:info.channels,sha256:hash(data)};
}

/** Exact attributes at each triangle corner, including winding. Reordering
 * triangles/vertices and merging byte-identical vertices are lossless. */
export function geometryFingerprint(doc){
  return doc.getRoot().listMeshes().flatMap(mesh=>mesh.listPrimitives().map(primitive=>{
    assert.equal(primitive.listTargets().length,0,'Morph targets are not supported by static token finishing');
    assert.equal(primitive.getMode(),4,'Indexed triangles required');
    const attributes=primitive.listSemantics().sort().map(semantic=>{
      const accessor=primitive.getAttribute(semantic),array=accessor.getArray();
      return {semantic,type:accessor.getType(),component:accessor.getComponentType(),normalized:accessor.getNormalized(),
        stride:accessor.getElementSize()*array.BYTES_PER_ELEMENT,bytes:Buffer.from(array.buffer,array.byteOffset,array.byteLength)};
    });
    const vertices=[];
    for(let i=0;i<primitive.getAttribute('POSITION').getCount();i++){
      const h=createHash('sha256');
      for(const attribute of attributes)h.update(attribute.bytes.subarray(i*attribute.stride,(i+1)*attribute.stride));
      vertices.push(h.digest('hex'));
    }
    const indices=primitive.getIndices()?.getArray();assert(indices,'Indexed triangles required');
    const triangles=[];
    for(let i=0;i<indices.length;i+=3){
      const a=vertices[indices[i]],b=vertices[indices[i+1]],c=vertices[indices[i+2]];
      assert(a&&b&&c,'Triangle index out of range');
      triangles.push([a+b+c,b+c+a,c+a+b].sort()[0]);
    }
    triangles.sort();const h=createHash('sha256');for(const triangle of triangles)h.update(triangle);
    return {mesh:mesh.getName(),extras:mesh.getExtras(),primitiveExtras:primitive.getExtras(),
      material:doc.getRoot().listMaterials().indexOf(primitive.getMaterial()),mode:primitive.getMode(),
      attributes:attributes.map(({bytes,stride,...attribute})=>attribute),triangles:indices.length/3,sha256:h.digest('hex')};
  }));
}

export async function optimizeDelivery(doc,io){
  assert.equal(doc.getRoot().listAnimations().length,0,'Static model required');
  assert.equal(doc.getRoot().listSkins().length,0,'Static model required');
  const source=Buffer.from(await io.writeBinary(doc)),beforeJSON=(await io.writeJSON(doc)).json;
  const geometry=geometryFingerprint(doc),textures=[];
  for(const [index,texture] of doc.getRoot().listTextures().entries()){
    const original=Buffer.from(texture.getImage()),mime=texture.getMimeType(),metadata=await sharp(original).metadata();
    const pixels=await texturePixels(original);let selected=original,selectedMime=mime,method='preserved';
    // Do not introduce profile conversions or another lossy JPEG generation.
    if(mime==='image/png'&&!metadata.icc&&metadata.depth==='uchar'){
      for(const candidate of [
        {method:'lossless PNG',mime:'image/png',bytes:await sharp(original).png({compressionLevel:9,adaptiveFiltering:true,effort:10}).toBuffer()},
        {method:'lossless WebP',mime:'image/webp',bytes:await sharp(original).webp({lossless:true,effort:6}).toBuffer()},
      ]){
        if(candidate.bytes.length>=selected.length)continue;
        // Some encoders/profile paths alter transparent RGB or other values.
        // Accept only a smaller file with identical decoded RGBA pixels.
        if(JSON.stringify(await texturePixels(candidate.bytes))!==JSON.stringify(pixels))continue;
        selected=candidate.bytes;selectedMime=candidate.mime;method=candidate.method;
      }
    }
    texture.setImage(selected).setMimeType(selectedMime);
    textures.push({index,sourceBytes:original.length,sourceSha256:hash(original),sourceMime:mime,
      bytes:selected.length,sha256:hash(selected),mime:selectedMime,method,decodedRgba:pixels});
  }
  if(textures.some(texture=>texture.mime==='image/webp'))doc.createExtension(EXTTextureWebP).setRequired(true);
  // QUANTIZE selects Meshopt's no-filter codec path. There is deliberately no
  // quantize(), simplify(), or meshopt() transform that could lose precision.
  doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({method:EXTMeshoptCompression.EncoderMethod.QUANTIZE});
  await doc.transform(weld({overwrite:true}),reorder({encoder:MeshoptEncoder,target:'size'}),
    prune({propertyTypes:[PropertyType.ACCESSOR],keepAttributes:true,keepIndices:true}));
  const compressed=Buffer.from(await io.writeBinary(doc)),check=await io.readBinary(compressed);
  assert.deepEqual(geometryFingerprint(check),geometry,'Triangle-corner attributes changed');
  const afterJSON=(await io.writeJSON(check)).json;
  for(const field of ['materials','nodes','scenes','scene','skins','cameras','animations'])assert.deepEqual(afterJSON[field],beforeJSON[field],field+' changed');
  assert.equal(check.getRoot().listTextures().length,textures.length,'Texture count changed');
  for(const [index,texture] of check.getRoot().listTextures().entries()){
    assert.equal(hash(texture.getImage()),textures[index].sha256,'Encoded texture changed on export');
    assert.deepEqual(await texturePixels(texture.getImage()),textures[index].decodedRgba,'Decoded texture pixels changed');
  }
  const gltf=JSON.parse(compressed.toString('utf8',20,20+compressed.readUInt32LE(12)));
  for(const view of gltf.bufferViews??[]){const extension=view.extensions?.EXT_meshopt_compression;assert(!extension?.filter||extension.filter==='NONE','Lossy attribute filter');}
  // Tiny/synthetic models can be smaller without the extension overhead.
  const applied=compressed.length<source.length,bytes=applied?compressed:source;
  return {bytes,receipt:{policy:DELIVERY_POLICY,applied,sourceBytes:source.length,bytes:bytes.length,
    bytesSaved:source.length-bytes.length,savingPercent:100*(1-bytes.length/source.length),sha256:hash(bytes),
    textures:applied?textures:textures.map(texture=>({...texture,bytes:texture.sourceBytes,sha256:texture.sourceSha256,mime:texture.sourceMime,method:'preserved'})),
    geometry,verified:{triangleCornerAttributesExact:true,decodedTexturePixelsExact:true,sceneAndMaterialsExact:true,
      noQuantization:true,noSimplification:true,noTextureResizing:true}}};
}
