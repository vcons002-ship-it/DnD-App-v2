import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {weld,simplify} from '@gltf-transform/functions';
import {MeshoptSimplifier} from 'meshoptimizer';
import sharp from 'sharp';
import {enhanceCreases,uvCoverage,CREASE_POLICY} from './crease_detail.mjs';

const [input,output,...flags]=process.argv.slice(2);
if(!input||!output||flags.some(f=>f!=='--crease-detail'))throw Error('INPUT.glb OUTPUT.glb [--crease-detail] required');
const detail=flags.includes('--crease-detail');await MeshoptSimplifier.ready;
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS),doc=await io.read(input);
if(detail&&doc.getRoot().getExtras().dndCreaseDetail)throw Error('Crease detail already applied; use the original painted mesh');
const triangles=d=>d.getRoot().listMeshes().reduce((n,m)=>n+m.listPrimitives().reduce((a,p)=>a+p.getIndices().getCount()/3,0),0);
const before=triangles(doc),textures=[];
for(const [index,t] of doc.getRoot().listTextures().entries()){
  const raw=Buffer.from(t.getImage()),original=await sharp(raw).metadata(),materials=doc.getRoot().listMaterials();
  const data=materials.some(m=>[m.getMetallicRoughnessTexture(),m.getNormalTexture(),m.getOcclusionTexture()].includes(t));
  const sharedEmission=materials.some(m=>m.getEmissiveTexture()===t);
  const colorMaterials=materials.filter(m=>m.getBaseColorTexture()===t);let detailStats;
  let image=sharp(raw).resize({width:2048,height:2048,fit:'inside',withoutEnlargement:true});
  if(detail&&!data&&!sharedEmission&&colorMaterials.length){
    const primitives=[];let unsupported=false;
    for(const m of colorMaterials){
      const info=m.getBaseColorTextureInfo();
      if(info.listExtensions().length){unsupported=true;break;}
      for(const mesh of doc.getRoot().listMeshes())for(const p of mesh.listPrimitives())if(p.getMaterial()===m){
        const uv=p.getAttribute('TEXCOORD_'+info.getTexCoord()),indices=p.getIndices();
        if(!uv||!indices){unsupported=true;break;}
        primitives.push({uvs:uv.getArray(),indices:indices.getArray()});
      }
    }
    if(!unsupported&&primitives.length){
      const {data:rgba,info}=await image.ensureAlpha().raw().toBuffer({resolveWithObject:true});
      const coverage=uvCoverage(primitives,info.width,info.height);
      const enhanced=await enhanceCreases(rgba,info.width,info.height,coverage);detailStats=enhanced.stats;
      image=sharp(enhanced.data,{raw:{width:info.width,height:info.height,channels:4}});
    }else detailStats={skipped:'Unsupported or missing UV mapping; left unchanged'};
  }
  const bytes=await(data?image.png({compressionLevel:9}):image.jpeg({quality:95,chromaSubsampling:'4:4:4',mozjpeg:true})).toBuffer();
  t.setImage(bytes).setMimeType(data?'image/png':'image/jpeg');
  textures.push({index,data,originalWidth:original.width,originalHeight:original.height,width:(await sharp(bytes).metadata()).width,bytes:bytes.length,...(detailStats?{detail:detailStats}:{})});
}
if(detail)doc.getRoot().setExtras({...doc.getRoot().getExtras(),dndCreaseDetail:CREASE_POLICY.id});
if(before>60000)await doc.transform(weld(),simplify({simplifier:MeshoptSimplifier,ratio:60000/before,error:.002}));
await io.write(output,doc);const check=await io.read(output);
for(const mesh of check.getRoot().listMeshes())for(const p of mesh.listPrimitives()){
  const positions=p.getAttribute('POSITION');for(const v of positions.getArray())if(!Number.isFinite(v))throw Error('Nonfinite position');
  for(const idx of p.getIndices().getArray())if(idx>=positions.getCount())throw Error('Index out of range');
}
const bytes=await fs.readFile(output),receipt={source:input,output,originalTriangles:before,triangles:triangles(check),bytes:bytes.length,textures,geometryErrorLimit:.002,textureResampled:true,...(detail?{detailPolicy:CREASE_POLICY}:{}),sha256:createHash('sha256').update(bytes).digest('hex')};
await fs.writeFile(output+'.receipt.json',JSON.stringify(receipt,null,2));console.log(JSON.stringify(receipt,null,2));
