import {describe,expect,it} from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import type {AddressInfo} from 'node:net';
import {isLfsPointer,placeholderModelGlb,placeholderModelMiddleware,LFS_POINTER_PREFIX} from './assets/placeholderModel.js';

const parseGlb=(glb:Buffer)=>{
 expect(glb.toString('ascii',0,4)).toBe('glTF');expect(glb.readUInt32LE(4)).toBe(2);expect(glb.readUInt32LE(8)).toBe(glb.length);
 const jsonLength=glb.readUInt32LE(12);expect(glb.readUInt32LE(16)).toBe(0x4e4f534a);expect(jsonLength%4).toBe(0);
 const json=JSON.parse(glb.toString('utf8',20,20+jsonLength));
 const binStart=20+jsonLength,binLength=glb.readUInt32LE(binStart);expect(glb.readUInt32LE(binStart+4)).toBe(0x004e4942);
 expect(binStart+8+binLength).toBe(glb.length);
 return {json,binLength};
};

describe('placeholder miniature',()=>{
 it('is a valid self-contained GLB with a named round base',()=>{
  const glb=placeholderModelGlb(),{json,binLength}=parseGlb(glb);
  expect(glb.length).toBeGreaterThan(1000);
  expect(json.buffers).toEqual([{byteLength:expect.any(Number)}]);expect(json.buffers[0].byteLength).toBeLessThanOrEqual(binLength);
  expect(json.nodes.map((n:{name:string})=>n.name)).toContain('placeholder_round_base');
  for(const accessor of json.accessors){const view=json.bufferViews[accessor.bufferView];const size=accessor.type==='VEC3'?12:4;
   expect((accessor.byteOffset??0)+accessor.count*size).toBeLessThanOrEqual(view.byteLength);}
  const base=json.accessors[0];expect(base.min[1]).toBe(0);expect(base.max[1]).toBeCloseTo(1.7,5);expect(base.max[0]).toBeCloseTo(.5,5);
  expect(json.asset.extras.placeholder).toBe('git-lfs-pointer');
 });
 it('serves the stand-in only for LFS pointer files',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'placeholder-'));
  fs.mkdirSync(path.join(dir,'monsters'));
  fs.writeFileSync(path.join(dir,'monsters','pointer.glb'),`${LFS_POINTER_PREFIX}\noid sha256:abc\nsize 12\n`);
  fs.writeFileSync(path.join(dir,'monsters','real.glb'),Buffer.from('glTF-real'));
  expect(isLfsPointer(path.join(dir,'monsters','pointer.glb'))).toBe(true);
  expect(isLfsPointer(path.join(dir,'monsters','real.glb'))).toBe(false);
  expect(isLfsPointer(path.join(dir,'missing.glb'))).toBe(false);
  const app=express();app.use(placeholderModelMiddleware([dir]));app.use(express.static(dir));
  const server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));
  const base=`http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try{
   const pointer=await fetch(`${base}/monsters/pointer.glb`);
   expect(pointer.headers.get('x-placeholder-model')).toBe('git-lfs-pointer');
   parseGlb(Buffer.from(await pointer.arrayBuffer()));
   const real=await fetch(`${base}/monsters/real.glb`);
   expect(real.headers.get('x-placeholder-model')).toBeNull();expect(await real.text()).toBe('glTF-real');
   expect((await fetch(`${base}/monsters/none.glb`)).status).toBe(404);
   expect((await fetch(`${base}/..%2F..%2Fetc%2Fpasswd.glb`)).status).toBe(404);
  }finally{await new Promise<void>(r=>server.close(()=>r()));fs.rmSync(dir,{recursive:true,force:true});}
 });
});
