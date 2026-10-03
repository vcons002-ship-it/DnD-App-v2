import {NodeIO} from '@gltf-transform/core';
import fs from 'node:fs/promises';
import sharp from 'sharp';
import {createHash} from 'node:crypto';
import {wallContours} from '../../../shared/wallGeometry.ts';
const out=process.argv[2];if(!out)throw new Error('Usage: node --import tsx validate_map_relief.mjs OUTPUT_DIRECTORY');const io=new NodeIO();
const source=await fs.readFile(out+'/original.png');const raw=await sharp(source).ensureAlpha().raw().toBuffer();
const flipped=await sharp(source).flip().ensureAlpha().raw().toBuffer();
const walls=JSON.parse(await fs.readFile(out+'/walls.json','utf8'));
const area=ring=>Math.abs(ring.reduce((sum,p,i)=>{const q=ring[(i+1)%ring.length];return sum+p.x*q.y-p.y*q.x;},0))/2;
const data=JSON.parse(await fs.readFile(out+'/relief.json','utf8'));
const expectedCapArea=walls.reduce((sum,w)=>{const r=wallContours(w);return sum+area(r[0])-r.slice(1).reduce((s,h)=>s+area(h),0);},0)*(3/data.width)**2;
const scenery=JSON.parse(await fs.readFile(out+'/scenery.json','utf8'));
const feetToWorld=3/(data.width/data.gridSizePx*data.feetPerSquare);
const models=[];
for(const name of ['walls','relief']){
 const bytes=await fs.readFile(out+'/'+name+'.glb'),doc=await io.readBinary(bytes);let triangles=0,capArea=0,finite=true;
 const wallNodes=doc.getRoot().listNodes().filter(n=>n.getName().startsWith('Mask_wall_'));
 if(wallNodes.length!==walls.length)throw new Error('Missing wall meshes');
 const itemNodes=doc.getRoot().listNodes().filter(n=>n.getName().startsWith('scenery-'));
 if(itemNodes.length!==(name==='relief'?scenery.length:0))throw new Error('Missing scenery meshes');
 for(const node of itemNodes){
  const item=scenery.find(s=>s.id===node.getName());let top=0,bottom=Infinity;
  for(const primitive of node.getMesh().listPrimitives()){const positions=primitive.getAttribute('POSITION');
   for(let i=0;i<positions.getCount();i++){const z=positions.getElement(i,[])[2];top=Math.max(top,z);bottom=Math.min(bottom,z);}
  }
  if(Math.abs(top-item.heightFt*feetToWorld)>1e-6||Math.abs(bottom)>1e-6)throw new Error('Wrong item elevation '+item.id);
 }
 const wallMeshes=new Set(doc.getRoot().listNodes().filter(n=>n.getName().startsWith('Mask_wall_')).map(n=>n.getMesh()));
 for(const mesh of doc.getRoot().listMeshes())for(const p of mesh.listPrimitives()){
  const position=p.getAttribute('POSITION'),indices=p.getIndices();triangles+=(indices?.getCount()??position.getCount())/3;
  for(const v of position.getArray())finite&&=Number.isFinite(v);
  if(wallMeshes.has(mesh))for(let t=0;t<(indices?.getCount()??position.getCount());t+=3){
   const a=position.getElement(indices?.getScalar(t)??t,[]),b=position.getElement(indices?.getScalar(t+1)??t+1,[]),c=position.getElement(indices?.getScalar(t+2)??t+2,[]);
   if(a[2]>0&&b[2]>0&&c[2]>0)capArea+=Math.abs((b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]))/2;
  }
 }
 let texturePreserved=false;for(const texture of doc.getRoot().listTextures()){
  const image=texture.getImage(),meta=await sharp(image).metadata();if(meta.width!==data.width||meta.height!==data.height)continue;
  const pixels=await sharp(image).ensureAlpha().raw().toBuffer();texturePreserved||=pixels.equals(raw)||pixels.equals(flipped);
 }
 const capAreaRelativeError=Math.abs(capArea-expectedCapArea)/expectedCapArea;
 if(!texturePreserved||!finite||capAreaRelativeError>1e-5)throw new Error('Model validation failed '+JSON.stringify({name,texturePreserved,finite,capArea,expectedCapArea,capAreaRelativeError}));
 models.push({file:name+'.glb',bytes:bytes.length,triangles,sha256:createHash('sha256').update(bytes).digest('hex'),originalTexturePixelsPreserved:texturePreserved,finite,capArea,expectedCapArea,capAreaRelativeError,sceneryMeshes:itemNodes.length,sceneryHeightsVerified:true});
}
await fs.writeFile(out+'/model-receipt.json',JSON.stringify({models,manualMaskEdits:false,manualElevationEdits:false},null,2));console.log(JSON.stringify(models));
