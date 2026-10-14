import {Router,type Request} from 'express';
import multer from 'multer';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {NodeIO,type Document,type Node} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {getBounds,simplify,weld} from '@gltf-transform/functions';
import {MeshoptDecoder,MeshoptEncoder,MeshoptSimplifier} from 'meshoptimizer';
import sharp from 'sharp';
import {config} from '../config.js';
import {db} from '../db.js';
import {getCharacter,getMonster} from '../sessions.js';
import {chatMediaConnection,getConn,mediaSocketId,broadcastSnapshots,type IOServer} from '../connections.js';
import type {ProducedMiniature} from '../../../shared/assetProduction.js';
import type {AssetQueue} from './queue.js';

export const MODEL_UPLOAD_BYTES=25*1024*1024;
export type ModelUploadOptions={upAxis:'y'|'z';hasBase:boolean};
/** Validate the container before decoding. No remote buffers, images or URLs. */
export function inspectUploadContainer(data:Uint8Array){
  const b=Buffer.from(data.buffer,data.byteOffset,data.byteLength);
  if(b.length<20||b.length>MODEL_UPLOAD_BYTES||b.toString('ascii',0,4)!=='glTF'||b.readUInt32LE(4)!==2||b.readUInt32LE(8)!==b.length)throw new Error('Choose a valid GLB 2.0 file, smaller than 25 MB.');
  const size=b.readUInt32LE(12);
  if(b.readUInt32LE(16)!==0x4e4f534a||size>2*1024*1024||size+20>b.length)throw new Error('The GLB metadata could not be read.');
  let json:any;try{json=JSON.parse(b.toString('utf8',20,20+size));}catch{throw new Error('The GLB metadata could not be read.');}
  if(json.asset?.version!=='2.0')throw new Error('Export your model as GLB 2.0.');
  if([...json.buffers??[],...json.images??[]].some((v:any)=>v.uri))throw new Error('Embed all meshes and textures in one GLB file; external files are not supported.');
  if(json.animations?.length||json.skins?.length)throw new Error('Export a static miniature without animation or a skeleton.');
  if(json.extensionsUsed?.includes('KHR_draco_mesh_compression'))throw new Error('Export without Draco compression. Meshopt GLB files are supported.');
  if((json.nodes?.length??0)>2000||(json.accessors??[]).some((a:any)=>!Number.isSafeInteger(a.count)||a.count<0||a.count>2_000_000))throw new Error('This model is too complex for a tabletop token.');
  return json;
}
function addBase(doc:Document){
  const positions:number[]=[],normals:number[]=[],indices:number[]=[];
  const vertex=(x:number,y:number,z:number,nx:number,ny:number,nz:number)=>{const i=positions.length/3;positions.push(x,y,z);normals.push(nx,ny,nz);return i;};
  for(let i=0;i<64;i++){
    const a=i*Math.PI/32,b=(i+1)*Math.PI/32,x=Math.cos(a)*.5,z=Math.sin(a)*.5,u=Math.cos(b)*.5,v=Math.sin(b)*.5;
    const side=[vertex(x,0,z,x*2,0,z*2),vertex(x,.055,z,x*2,0,z*2),vertex(u,.055,v,u*2,0,v*2),vertex(u,0,v,u*2,0,v*2)];
    indices.push(side[0],side[1],side[2],side[0],side[2],side[3]);
    const top=[vertex(0,.055,0,0,1,0),vertex(x,.055,z,0,1,0),vertex(u,.055,v,0,1,0)];indices.push(top[0],top[2],top[1]);
    const bottom=[vertex(0,0,0,0,-1,0),vertex(x,0,z,0,-1,0),vertex(u,0,v,0,-1,0)];indices.push(...bottom);
  }
  const buffer=doc.getRoot().listBuffers()[0]??doc.createBuffer();
  const material=doc.createMaterial('Dark pewter base').setBaseColorFactor([.10,.11,.12,1]).setMetallicFactor(.85).setRoughnessFactor(.35);
  const primitive=doc.createPrimitive().setAttribute('POSITION',doc.createAccessor().setType('VEC3').setArray(new Float32Array(positions)).setBuffer(buffer)).setAttribute('NORMAL',doc.createAccessor().setType('VEC3').setArray(new Float32Array(normals)).setBuffer(buffer)).setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint16Array(indices)).setBuffer(buffer)).setMaterial(material);
  doc.getRoot().getDefaultScene()!.addChild(doc.createNode('uploaded_round_base').setMesh(doc.createMesh().addPrimitive(primitive)));
}
/** Normalize upright orientation, floor contact and a measured base. Images
 * retain their resolution; large meshes use the existing 20k/.01 policy. */
export async function prepareUploadedModel(data:Uint8Array,options:ModelUploadOptions):Promise<{data:Uint8Array;triangles:number}>{
  inspectUploadContainer(data);
  await Promise.all([MeshoptDecoder.ready,MeshoptEncoder.ready,MeshoptSimplifier.ready]);
  const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.decoder':MeshoptDecoder,'meshopt.encoder':MeshoptEncoder});
  const doc=await io.readBinary(data),root=doc.getRoot();
  const scene=root.getDefaultScene()??root.listScenes()[0];
  if(!scene||root.listScenes().length!==1)throw new Error('Export one scene containing your miniature.');
  root.setDefaultScene(scene);
  // Uploaded cameras/lights must not alter battlefield lighting.
  for(const camera of root.listCameras())camera.dispose();
  for(const node of root.listNodes())node.setExtension('KHR_lights_punctual',null);
  let triangles=0;
  for(const mesh of root.listMeshes())for(const primitive of mesh.listPrimitives()){
    const pos=primitive.getAttribute('POSITION'),indices=primitive.getIndices();
    if(!pos||primitive.getMode()!==4||pos.getType()!=='VEC3')throw new Error('Export the model with triangle meshes.');
    const count=indices?.getCount()??pos.getCount();if(count%3)throw new Error('The model has invalid triangles.');triangles+=count/3;
    for(const v of pos.getArray()??[])if(!Number.isFinite(v))throw new Error('The model contains invalid coordinates.');
    for(const i of indices?.getArray()??[])if(!Number.isInteger(i)||i<0||i>=pos.getCount())throw new Error('The model has invalid triangles.');
  }
  const drawTriangles=()=>root.listNodes().reduce((sum,n)=>sum+(n.getMesh()?.listPrimitives()??[]).reduce((v,p)=>v+(p.getIndices()?.getCount()??p.getAttribute('POSITION')?.getCount()??0)/3,0),0);
  if(drawTriangles()>400000)throw new Error('Repeated meshes exceed the token geometry budget. Export a lighter model.');
  if(!triangles||triangles>400000)throw new Error('Use a model with 1–400,000 triangles.');
  for(const texture of root.listTextures()){
    const image=texture.getImage();if(!image)throw new Error('A model texture is missing.');
    if(!['image/png','image/jpeg','image/webp'].includes(texture.getMimeType()))throw new Error('Use embedded PNG, JPEG or WebP textures.');
    const metadata=await sharp(image,{limitInputPixels:40_000_000}).metadata();
    if(!metadata.width||!metadata.height||metadata.width>8192||metadata.height>8192)throw new Error('Textures must be no larger than 8192 pixels across.');
    await sharp(image,{limitInputPixels:40_000_000}).stats();
  }
  const oriented=doc.createNode('uploaded_orientation');
  if(options.upAxis==='z')oriented.setRotation([-Math.SQRT1_2,0,0,Math.SQRT1_2]);
  for(const child of [...scene.listChildren()])oriented.addChild(child);scene.addChild(oriented);
  const bounds=getBounds(scene),height=bounds.max[1]-bounds.min[1];
  if(!Number.isFinite(height)||height<=1e-7)throw new Error('The model has no usable height.');
  const feet:number[][]=[];
  scene.traverse((node:Node)=>{
    const m=node.getWorldMatrix();for(const primitive of node.getMesh()?.listPrimitives()??[]){const p=primitive.getAttribute('POSITION')!;
      for(let i=0;i<p.getCount();i++){
        const [x,y,z]=p.getElement(i,[0,0,0]);const v=[m[0]*x+m[4]*y+m[8]*z+m[12],m[1]*x+m[5]*y+m[9]*z+m[13],m[2]*x+m[6]*y+m[10]*z+m[14]];
        if(v.some(n=>!Number.isFinite(n)))throw new Error('The model has invalid transforms.');
        if(v[1]<=bounds.min[1]+height*.05)feet.push(v);
      }
    }
  });
  if(!feet.length)throw new Error('The model has no usable floor contact.');
  let minX=Infinity,maxX=-Infinity,minZ=Infinity,maxZ=-Infinity;
  for(const p of feet){minX=Math.min(minX,p[0]);maxX=Math.max(maxX,p[0]);minZ=Math.min(minZ,p[2]);maxZ=Math.max(maxZ,p[2]);}
  const cx=(minX+maxX)/2,cz=(minZ+maxZ)/2;
  let radius=0;for(const p of feet)radius=Math.max(radius,Math.hypot(p[0]-cx,p[2]-cz));
  if(radius<=1e-7)throw new Error('The model has no usable base footprint.');
  const scale=options.hasBase ? .5/radius:Math.min(1.7/height,.465/radius);
  const normalized=doc.createNode('uploaded_fit').setScale([scale,scale,scale]).setTranslation([-cx*scale,-bounds.min[1]*scale+(options.hasBase?0:.055),-cz*scale]);
  normalized.addChild(oriented);scene.addChild(normalized);
  if(triangles>60000){await doc.transform(weld(),simplify({simplifier:MeshoptSimplifier,ratio:20000/triangles,error:.01}));}
  if(!options.hasBase)addBase(doc);
  triangles=0;for(const mesh of root.listMeshes())for(const p of mesh.listPrimitives())triangles+=(p.getIndices()?.getCount()??p.getAttribute('POSITION')!.getCount())/3;
  if(triangles>60000||drawTriangles()>60000)throw new Error('This model could not fit the 60,000-triangle token budget. Export a lighter GLB.');
  const output=await io.writeBinary(doc);
  if(output.length>12*1024*1024)throw new Error('The prepared model exceeds 12 MB. Compress embedded textures before uploading.');
  return {data:output,triangles};
}
export function canUploadModel(req:Request,kind:string,id:string,isDm:(req:Request)=>boolean):boolean{
  const subject=kind==='character'?getCharacter(id):kind==='monster'?getMonster(id):null;
  if(!subject)return false;
  if(isDm(req))return true;
  const bearer=req.get('authorization')??'',token=bearer.startsWith('Bearer ')?bearer.slice(7):'';
  const conn=chatMediaConnection(token),socketId=mediaSocketId(token);
  return !!conn&&conn.sessionId===subject.sessionId&&(conn.role==='dm'||kind==='character'&&getCharacter(id)?.claimedBy===socketId&&!!socketId&&getConn(socketId)?.role==='player');
}
export function createModelUploadRouter(io:IOServer,queue:()=>AssetQueue,isDm:(req:Request)=>boolean):Router{
  const router=Router(),upload=multer({storage:multer.memoryStorage(),limits:{fileSize:MODEL_UPLOAD_BYTES,files:1,fields:2,fieldSize:40}}).single('model');
  let processing=false;
  router.post('/:kind/:id',(req,res)=>{
    const kind=String(req.params.kind),id=String(req.params.id);
    if(!canUploadModel(req,kind,id,isDm)){res.status(403).json({error:'Players may upload to their claimed character. Creature uploads are DM-only.'});return;}
    if(processing){res.status(409).json({error:'Another model is being prepared. Try again in a moment.'});return;}
    processing=true;
    upload(req,res,async(error:unknown)=>{
      let saved:string|undefined;
      try{
        if(error||!req.file)throw new Error(error instanceof multer.MulterError&&error.code==='LIMIT_FILE_SIZE'?'Choose a GLB smaller than 25 MB.':'Choose one GLB file.');
        if(path.extname(req.file.originalname).toLowerCase()!=='.glb')throw new Error('Choose a GLB file with embedded textures.');
        if(!['y','z'].includes(req.body.upAxis)||!['true','false'].includes(req.body.hasBase))throw new Error('Choose the model orientation and base option.');
        const prepared=await prepareUploadedModel(req.file.buffer,{upAxis:req.body.upAxis,hasBase:req.body.hasBase==='true'});
        if(!canUploadModel(req,kind,id,isDm)){res.status(403).json({error:'Your character selection changed. Select it and upload again.'});return;}
        const family=`uploaded-${randomUUID().slice(0,8)}`,sha256=createHash('sha256').update(prepared.data).digest('hex');
        const dir=path.join(config.uploadsDir,'miniatures');await fs.mkdir(dir,{recursive:true});
        const filename=`${family}-${sha256.slice(0,12)}.glb`;saved=path.join(dir,filename);await fs.writeFile(saved,prepared.data);
        if(!canUploadModel(req,kind,id,isDm))throw new Error('Your character selection changed. Select it and upload again.');
        const model:ProducedMiniature={id:family,url:`/uploads/miniatures/${filename}`,baseDiameter:1,baseCenter:[0,0,0],bytes:prepared.data.length,triangles:prepared.triangles,sha256};
        queue().publishImported(model);
        db.prepare(`UPDATE ${kind==='character'?'characters':'monsters'} SET model_type=? WHERE id=?`).run(family,id);
        const subject=kind==='character'?getCharacter(id)!:getMonster(id)!;
        broadcastSnapshots(io,subject.sessionId);saved=undefined;res.json({model});
      }catch(e){if(saved)await fs.unlink(saved).catch(()=>{});res.status(400).json({error:e instanceof Error&&!(e as any).code?e.message:'The model could not be prepared. Export a static GLB with embedded textures.'});}
      finally{processing=false;}
    });
  });
  return router;
}
