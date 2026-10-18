import fs from 'node:fs';
import path from 'node:path';
import type {Request,Response,NextFunction} from 'express';

/** Git LFS stores a small text pointer where a checked-out binary should be. */
export const LFS_POINTER_PREFIX='version https://git-lfs.github.com/spec/v1';
export function isLfsPointer(file:string):boolean{
 try{
  const fd=fs.openSync(file,'r');
  try{const head=Buffer.alloc(LFS_POINTER_PREFIX.length);const read=fs.readSync(fd,head,0,head.length,0);return head.subarray(0,read).toString('utf8')===LFS_POINTER_PREFIX;}
  finally{fs.closeSync(fd);}
 }catch{return false;}
}

/** A stand-in miniature for checkouts without the Git LFS model files (CI, the
 * browser tests): a round base of diameter 1 with a simple figure on it, as a
 * self-contained GLB. Only served when PLACEHOLDER_MODELS=1; a real install
 * never gets one, so a missing `git lfs pull` stays visible there. */
export function placeholderModelGlb():Buffer{
 const positions:number[]=[],normals:number[]=[],indices:number[]=[];
 const quad=(a:number[],b:number[],c:number[],d:number[],n:number[])=>{
  const start=positions.length/3;positions.push(...a,...b,...c,...d);for(let i=0;i<4;i++)normals.push(...n);
  indices.push(start,start+1,start+2,start,start+2,start+3);
 };
 const box=(x0:number,y0:number,z0:number,x1:number,y1:number,z1:number)=>{
  quad([x0,y0,z1],[x1,y0,z1],[x1,y1,z1],[x0,y1,z1],[0,0,1]);quad([x1,y0,z0],[x0,y0,z0],[x0,y1,z0],[x1,y1,z0],[0,0,-1]);
  quad([x1,y0,z1],[x1,y0,z0],[x1,y1,z0],[x1,y1,z1],[1,0,0]);quad([x0,y0,z0],[x0,y0,z1],[x0,y1,z1],[x0,y1,z0],[-1,0,0]);
  quad([x0,y1,z1],[x1,y1,z1],[x1,y1,z0],[x0,y1,z0],[0,1,0]);quad([x0,y0,z0],[x1,y0,z0],[x1,y0,z1],[x0,y0,z1],[0,-1,0]);
 };
 // Figure: legs, torso, head and a shield arm, roughly 1.7 base diameters tall.
 box(-.16,.05,-.12,-.03,.75,.12);box(.03,.05,-.12,.16,.75,.12);
 box(-.26,.75,-.16,.26,1.35,.16);box(-.17,1.35,-.17,.17,1.7,.17);
 box(-.42,.85,-.04,-.26,1.3,.04);box(.26,.6,-.22,.34,1.3,.22);
 const figureEnd=indices.length;
 // Base: a 32-sided cylinder, named so the client swaps in its pewter base.
 const segments=32,radius=.5,top=.05,baseStart=positions.length/3;
 for(let i=0;i<segments;i++){const a=i/segments*Math.PI*2,x=Math.cos(a)*radius,z=Math.sin(a)*radius;positions.push(x,0,z,x,top,z);normals.push(x/radius,0,z/radius,x/radius,0,z/radius);}
 for(let i=0;i<segments;i++){const a=baseStart+i*2,b=baseStart+((i+1)%segments)*2;indices.push(a,b,b+1,a,b+1,a+1);}
 const topCenter=positions.length/3;positions.push(0,top,0);normals.push(0,1,0);
 for(let i=0;i<segments;i++){const a=i/segments*Math.PI*2,b=(i+1)/segments*Math.PI*2;positions.push(Math.cos(a)*radius,top,Math.sin(a)*radius,Math.cos(b)*radius,top,Math.sin(b)*radius);normals.push(0,1,0,0,1,0);indices.push(topCenter,topCenter+2+i*2,topCenter+1+i*2);}
 const vertexCount=positions.length/3;
 const pos=Buffer.from(new Float32Array(positions).buffer),nrm=Buffer.from(new Float32Array(normals).buffer),idx=Buffer.from(new Uint32Array(indices).buffer);
 const bin=Buffer.concat([pos,nrm,idx]);
 const min=[0,1,2].map(k=>Math.min(...positions.filter((_,i)=>i%3===k))),max=[0,1,2].map(k=>Math.max(...positions.filter((_,i)=>i%3===k)));
 const json={
  asset:{version:'2.0',generator:'dnd-app placeholder',extras:{placeholder:'git-lfs-pointer'}},
  scene:0,scenes:[{nodes:[0,1]}],
  nodes:[{name:'placeholder_figure',mesh:0},{name:'placeholder_round_base',mesh:1}],
  meshes:[{name:'placeholder_figure',primitives:[{attributes:{POSITION:0,NORMAL:1},indices:2,material:0}]},
   {name:'placeholder_round_base',primitives:[{attributes:{POSITION:0,NORMAL:1},indices:3,material:1}]}],
  materials:[{name:'placeholder-figure',pbrMetallicRoughness:{baseColorFactor:[.55,.57,.62,1],metallicFactor:.1,roughnessFactor:.8}},
   {name:'placeholder-base',pbrMetallicRoughness:{baseColorFactor:[.2,.21,.24,1],metallicFactor:.3,roughnessFactor:.7}}],
  buffers:[{byteLength:bin.length}],
  bufferViews:[{buffer:0,byteOffset:0,byteLength:pos.length,target:34962},{buffer:0,byteOffset:pos.length,byteLength:nrm.length,target:34962},
   {buffer:0,byteOffset:pos.length+nrm.length,byteLength:idx.length,target:34963}],
  accessors:[{bufferView:0,componentType:5126,count:vertexCount,type:'VEC3',min,max},{bufferView:1,componentType:5126,count:vertexCount,type:'VEC3'},
   {bufferView:2,byteOffset:0,componentType:5125,count:figureEnd,type:'SCALAR'},
   {bufferView:2,byteOffset:figureEnd*4,componentType:5125,count:indices.length-figureEnd,type:'SCALAR'}],
 };
 const pad=(b:Buffer,fill:number)=>b.length%4?Buffer.concat([b,Buffer.alloc(4-b.length%4,fill)]):b;
 const jsonChunk=pad(Buffer.from(JSON.stringify(json),'utf8'),0x20),binChunk=pad(bin,0);
 const header=Buffer.alloc(12),jsonHeader=Buffer.alloc(8),binHeader=Buffer.alloc(8);
 const total=12+8+jsonChunk.length+8+binChunk.length;
 header.write('glTF',0,'ascii');header.writeUInt32LE(2,4);header.writeUInt32LE(total,8);
 jsonHeader.writeUInt32LE(jsonChunk.length,0);jsonHeader.writeUInt32LE(0x4e4f534a,4);
 binHeader.writeUInt32LE(binChunk.length,0);binHeader.writeUInt32LE(0x004e4942,4);
 return Buffer.concat([header,jsonHeader,jsonChunk,binHeader,binChunk]);
}

/** Serves the placeholder for any `.glb` under the given roots whose file is an
 * LFS pointer. Real files and unknown paths fall through to the static route. */
export function placeholderModelMiddleware(roots:readonly string[]){
 let glb:Buffer|undefined;
 return (req:Request,res:Response,next:NextFunction)=>{
  if(req.method!=='GET'||!/\.glb$/i.test(req.path))return next();
  const relative=path.normalize(decodeURIComponent(req.path)).replace(/^(\.\.[/\\])+/,'');
  const file=roots.map(root=>path.join(root,relative)).find(candidate=>roots.some(root=>candidate.startsWith(root+path.sep))&&fs.existsSync(candidate));
  if(!file||!isLfsPointer(file))return next();
  glb??=placeholderModelGlb();
  res.setHeader('Content-Type','model/gltf-binary');res.setHeader('Cache-Control','no-store');res.setHeader('X-Placeholder-Model','git-lfs-pointer');
  res.send(glb);
 };
}
