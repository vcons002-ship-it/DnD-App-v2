/** Geometry tier preparation and offline comparison. No catalogs or campaign rows change.
 * INPUTS.json: {id:{master:"textured 120k GLB",current:"shipped based GLB"}}.
 * Match retained UV vertices to recover the existing figure's uniform fit,
 * retain its exact textures/materials/base, then reduce each tier from the master.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {copyToDocument,transformPrimitive,simplifyPrimitive,prune,unpartition} from '@gltf-transform/functions';
import {Matrix4,Vector3} from 'three';
import {MeshoptSimplifier} from 'meshoptimizer';
import {createDeliveryIO,optimizeDelivery} from '../../server/tools/asset-production/lossless_delivery.mjs';
const [input,outArg,...flags]=process.argv.slice(2);
assert(input&&outArg,'Usage: node trial-generated-quality.mjs INPUTS.json NEW_OUTPUT_DIR');
assert(flags.every(f=>['--high-only','--character-tiers'].includes(f))&&flags.length<=1,'Choose --high-only or --character-tiers');
const production=flags.length>0;
const targets=flags.includes('--high-only')?[120000]:flags.includes('--character-tiers')?[60000,120000]:[40000,60000,120000];
const out=path.resolve(outArg);await fs.mkdir(out,{recursive:false});
const specs=JSON.parse(await fs.readFile(input,'utf8')),io=await createDeliveryIO();await MeshoptSimplifier.ready;
const hash=b=>createHash('sha256').update(b).digest('hex');
const median=a=>a.sort((x,y)=>x-y)[Math.floor(a.length/2)];
const count=d=>d.getRoot().listMeshes().reduce((s,m)=>s+m.listPrimitives().reduce((n,p)=>n+p.getIndices().getCount()/3,0),0);
function body(d){
 const nodes=d.getRoot().listNodes().filter(n=>n.getMesh()?.listPrimitives().some(p=>p.getMaterial()?.getBaseColorTexture()));assert.equal(nodes.length,1,'Trial requires a single textured body node');
 const node=nodes[0],primitives=node.getMesh().listPrimitives().filter(p=>p.getMaterial()?.getBaseColorTexture());assert.equal(primitives.length,1);
 return {node,primitive:primitives[0]};
}
function points({node,primitive:p}){
 const pos=p.getAttribute('POSITION'),uv=p.getAttribute('TEXCOORD_0'),matrix=new Matrix4().fromArray(node.getWorldMatrix()),map=new Map();assert(uv);
 for(let i=0;i<pos.getCount();i++){
  const key=uv.getElement(i,[]).map(v=>v.toFixed(6)).join(','),v=new Vector3().fromArray(pos.getElement(i,[])).applyMatrix4(matrix).toArray();
  if(map.has(key)&&map.get(key)&&Math.hypot(...v.map((x,j)=>x-map.get(key)[j]))>1e-5)map.set(key,null);else if(!map.has(key))map.set(key,v);
 }return map;
}
function align(master,current){
 const a=points(master),b=points(current),pairs=[...a].filter(([k,v])=>v&&b.get(k)).map(([k,v])=>[v,b.get(k)]),slopes=[];assert(pairs.length>=100,'Insufficient retained UV landmarks; do not guess alignment');
 for(let i=0;i<Math.min(pairs.length,4000);i++){
  const[a,b]=pairs[i],[c,d]=pairs[(i+137)%pairs.length];for(let j=0;j<3;j++)if(Math.abs(a[j]-c[j])>.1)slopes.push((b[j]-d[j])/(a[j]-c[j]));
 }
 const scale=median(slopes),translation=[0,1,2].map(j=>median(pairs.map(([a,b])=>b[j]-a[j]*scale))),errors=pairs.map(([a,b])=>Math.hypot(...a.map((v,j)=>v*scale+translation[j]-b[j])));
 assert(scale>0&&Number.isFinite(scale));assert(errors.filter(e=>e<1e-4).length>=pairs.length*.99,'Source art/geometry mismatch; refusing to fit a different model');
 return {scale,translation,matchedLandmarks:pairs.length,maxLandmarkError:Math.max(...errors),medianLandmarkError:median(errors)};
}
const models=[];
for(const[id,spec]of Object.entries(specs)){
 const masterBytes=await fs.readFile(spec.master),currentBytes=await fs.readFile(spec.current),master=await io.read(spec.master),current=await io.read(spec.current),masterBody=body(master),currentBody=body(current),fit=align(masterBody,currentBody),textureHashes=current.getRoot().listTextures().map(t=>hash(t.getImage()));
 if(!production){
  const currentFile=`${id}-current.glb`;await fs.writeFile(path.join(out,currentFile),currentBytes);
  models.push({id,tier:'current',label:'Current / Battlefield',filename:currentFile,bytes:currentBytes.length,triangles:count(current),sha256:hash(currentBytes),textureHashes,alignment:fit});
 }
 for(const target of targets){
  const doc=await io.read(spec.current),old=body(doc),material=old.primitive.getMaterial(),p=copyToDocument(doc,master,[masterBody.primitive]).get(masterBody.primitive);p.setMaterial(material);
  const fitMatrix=new Matrix4().makeScale(fit.scale,fit.scale,fit.scale);fitMatrix.setPosition(...fit.translation);
  const transform=new Matrix4().fromArray(old.node.getWorldMatrix()).invert().multiply(fitMatrix).multiply(new Matrix4().fromArray(masterBody.node.getWorldMatrix()));
  transformPrimitive(p,transform.toArray());old.node.getMesh().removePrimitive(old.primitive).addPrimitive(p);
  const before=p.getIndices().getCount()/3,error=target===40000?.004:.002;
  if(target<before)simplifyPrimitive(p,{simplifier:MeshoptSimplifier,ratio:target/before,error,lockBorder:true});
  await doc.transform(prune(),unpartition());
  assert.deepEqual(doc.getRoot().listTextures().map(t=>hash(t.getImage())),textureHashes,'All tiers use the existing texture bytes before delivery encoding');
  const delivery=await optimizeDelivery(doc,io),check=await io.readBinary(delivery.bytes),filename=`${id}-${target}-${delivery.receipt.sha256.slice(0,12)}.glb`,triangles=count(check);
  await fs.writeFile(path.join(out,filename),delivery.bytes);
  const receipt={id,tier:String(target),label:`${Math.round(target/1000)}k target`,filename,sha256:delivery.receipt.sha256,bytes:delivery.bytes.length,triangles,bodyTriangles:p.getIndices().getCount()/3,sourceMaster:spec.master,sourceMasterSha256:hash(masterBytes),current:spec.current,currentSha256:hash(currentBytes),textureHashes,alignment:fit,reduction:{target,error,lockBorder:true,permissive:false,fromMaster:true},delivery:delivery.receipt};
  await fs.writeFile(path.join(out,`${id}-${target}.json`),JSON.stringify(receipt,null,2));models.push(receipt);console.log(`${id} ${target} target: ${triangles} triangles, ${(delivery.bytes.length/1e6).toFixed(2)} MB`);
 }
 assert.equal(hash(await fs.readFile(spec.master)),hash(masterBytes));assert.equal(hash(await fs.readFile(spec.current)),hash(currentBytes));
}
await fs.writeFile(path.join(out,'models.json'),JSON.stringify(models,null,2)+'\n');
