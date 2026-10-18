import {it,expect,vi,afterEach}from'vitest';
import fs from'node:fs/promises';import os from'node:os';import path from'node:path';
import{createHash}from'node:crypto';
import{runHybridPipeline,hybridCacheKey,validateHybridStage}from'./assets/hybrid.js';
import * as transport from './assets/workerTransport.js';
afterEach(()=>{vi.unstubAllGlobals();vi.restoreAllMocks();});
it('rejects single-view geometry, missing paint references and escaped outputs',()=>{
 expect(hybridCacheKey('a')).not.toBe(hybridCacheKey('b'));
 expect(()=>validateHybridStage('shape',{checkpoint:'2.1',conditioningShape:[1,1,3,512,512]},'/safe')).toThrow();
 expect(()=>validateHybridStage('paint',{encodedReferenceCount:1},'/safe')).toThrow();
 expect(()=>validateHybridStage('align',{policy:'hybrid-alignment-v1',views:{front:{output:'/elsewhere'}}},'/safe')).toThrow();
 const paint={encodedReferenceCount:4,actualOutputViewCount:6,nativeTriangles:1466052,triangles:119999,textureSizes:{a:[4096,4096],m:[4096,4096],r:[4096,4096]},output:'/safe/paint/model.glb'};
 expect(()=>validateHybridStage('paint',paint,'/safe')).not.toThrow();
 expect(()=>validateHybridStage('paint',{...paint,triangles:40000},'/safe')).toThrow();
});
it('retries a failed paint using saved alignment and geometry, and rebuilds corrupted outputs',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'hybrid-cache-'));const calls:string[]=[];let failPaint=true;
 const mock=vi.fn(async(url:string,options?:RequestInit)=>{
  if(url.endsWith('/health'))return Response.json({protocol:'dnd-hybrid-v1',running:false});
  const name=url.split('/').at(-1)!;calls.push(name);const input=JSON.parse(options!.body as string);await fs.mkdir(input.output_dir,{recursive:true});
  if(name==='align'){
   const views:Record<string,unknown>={};for(const v of['front','back','left','right']){const output=path.join(input.output_dir,v+'.png');await fs.writeFile(output,v);views[v]={output,figureHeightPx:870};}
   return Response.json({policy:'hybrid-alignment-v1',views});
  }
  const output=path.join(input.output_dir,'model.glb');await fs.writeFile(output,name);
  if(name==='shape')return Response.json({checkpoint:'tencent/Hunyuan3D-2mv/hunyuan3d-dit-v2-mv',conditioningShape:[1,4,3,512,512],settings:input,output});
  if(failPaint){failPaint=false;return new Response('Failed',{status:500});}
  const references=await Promise.all(input.reference_paths.map(async(p:string)=>({path:p,sha256:createHash('sha256').update(await fs.readFile(p)).digest('hex')})));
  const receipt={encodedReferenceCount:4,actualOutputViewCount:6,triangles:120000,textureSizes:{a:[4096,4096],m:[4096,4096],r:[4096,4096]},output,settings:input,references,geometrySourceSha256:createHash('sha256').update(await fs.readFile(input.mesh_path)).digest('hex')};
  await fs.writeFile(path.join(input.output_dir,'receipt.json'),JSON.stringify(receipt));return Response.json(receipt);
 });vi.stubGlobal('fetch',mock);
 vi.spyOn(transport,'postWorkerJSON').mockImplementation(async(url,input)=>{const response=await mock(url,{body:JSON.stringify(input)});if(!response.ok)throw Error('Worker failed');return response.json() as Promise<Record<string,any>>;});
 try{
  const run=()=>runHybridPipeline('/references',root,'same-art',()=>{},undefined,{shape:'http://shape',paint:'http://paint'});
  await expect(run()).rejects.toThrow('paint');const result=await run();expect(calls).toEqual(['align','shape','trial','trial']);
  await run();expect(calls).toHaveLength(4);
  await fs.unlink(path.join(result.cacheRoot,'paint.json'));await run();expect(calls).toHaveLength(4);
  await fs.writeFile(result.shape.output,'corrupt');await run();expect(calls.slice(4)).toEqual(['shape','trial']);
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
