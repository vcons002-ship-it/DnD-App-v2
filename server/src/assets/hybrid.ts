import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {ProductionError} from './queue.js';
import {postWorkerJSON} from './workerTransport.js';

export const HYBRID_POLICY={id:'hybrid-2mv-21-v1',alignment:'hybrid-alignment-v1',steps:75,guidance:5.5,seed:923300,resolution:512,num_chunks:10000,faces:120000,paintResolution:768,views:6,atlas:4096,paintSeed:0} as const;
export const HYBRID_VIEWS=['front','back','left','right'] as const;
type RecordValue=Record<string,any>;
export const hybridCacheKey=(hash:string)=>createHash('sha256').update(JSON.stringify(HYBRID_POLICY)+hash).digest('hex');

export function stageOutputInside(root:string,output:unknown):output is string {
  if(typeof output!=='string')return false;
  const relative=path.relative(path.resolve(root),path.resolve(output));return !!relative&&!relative.startsWith('..')&&!path.isAbsolute(relative);
}
export function validateHybridStage(stage:string,value:RecordValue,root:string){
  if(stage==='align'){
    if(value.policy!==HYBRID_POLICY.alignment||HYBRID_VIEWS.some(v=>!stageOutputInside(root,value.views?.[v]?.output)))throw Error('Invalid aligned views');
    const heights=HYBRID_VIEWS.map(v=>value.views[v].figureHeightPx);if(heights.some(h=>!Number.isFinite(h)||h<=0)||Math.max(...heights)-Math.min(...heights)>2)throw Error('Reference scales disagree');
  }else if(stage==='shape'){
    if(value.checkpoint!=='tencent/Hunyuan3D-2mv/hunyuan3d-dit-v2-mv'||JSON.stringify(value.conditioningShape)!=='[1,4,3,512,512]'||value.settings?.steps!==75||value.settings?.guidance!==5.5||value.settings?.seed!==923300||value.settings?.resolution!==512||!stageOutputInside(root,value.output))throw Error('Unverified multiview geometry');
  }else if(stage==='paint'){
    // Quadric simplification targets a budget; topology can leave one or a few
    // fewer triangles. Reject a substantially reduced mesh, not normal rounding.
    const expected=Math.min(HYBRID_POLICY.faces,value.nativeTriangles??HYBRID_POLICY.faces);
    if(value.encodedReferenceCount!==4||value.actualOutputViewCount!==6||!Number.isInteger(value.triangles)||value.triangles<expected*.99||value.triangles>expected||!stageOutputInside(root,value.output)||Object.values(value.textureSizes??{}).length!==3||Object.values(value.textureSizes).some(x=>JSON.stringify(x)!=='[4096,4096]'))throw Error('Unverified four-view PBR paint');
  }else throw Error('Unknown hybrid stage');
}

/** Persist and verify completed stages. Cancellation waits for a submitted GPU
 * request to finish before releasing the queue, preventing overlapping jobs. */
export async function runHybridPipeline(refs:string,work:string,referenceHash:string,progress:(text:string)=>void,signal?:AbortSignal,urls={shape:process.env.HUNYUAN_SHAPE_URL||'http://127.0.0.1:42005',paint:process.env.HUNYUAN_PAINT_URL||'http://127.0.0.1:42004'}){
  const root=path.join(work,'hybrid',hybridCacheKey(referenceHash));await fs.mkdir(root,{recursive:true});
  const paths=Object.fromEntries(HYBRID_VIEWS.map(v=>[v,path.join(refs,`${v}.png`)]));
  async function stage(name:string,base:string,route:string,input:RecordValue):Promise<RecordValue>{
    signal?.throwIfAborted();const cache=path.join(root,name+'.json');
    try{
      const stored=JSON.parse(await fs.readFile(cache,'utf8'));
      if(JSON.stringify(stored.input)!==JSON.stringify(input))throw Error('Changed stage input');
      validateHybridStage(name,stored.result,root);
      const expected=name==='align'?HYBRID_VIEWS.map(v=>stored.result.views[v].output):[stored.result.output];
      if(JSON.stringify(stored.assets?.map((a:RecordValue)=>a.path))!==JSON.stringify(expected))throw Error('Incomplete stage manifest');
      for(const asset of stored.assets){if(!stageOutputInside(root,asset.path)||createHash('sha256').update(await fs.readFile(asset.path)).digest('hex')!==asset.sha256)throw Error('Changed stage output');}
      progress(`Reusing completed ${name==='align'?'reference alignment':name==='shape'?'multiview geometry':'2.1 materials'}`);return stored.result;
    }catch{/* Missing or invalid cache is rebuilt into a new stage directory. */}
    // Recover a completed worker receipt if the app lost its HTTP response.
    // Only accept the exact request and unchanged inputs, never a nearby job.
    if(name!=='align')for(const entry of await fs.readdir(root,{withFileTypes:true})){
      if(!entry.isDirectory()||!entry.name.startsWith(name+'-'))continue;
      try{
        const result=JSON.parse(await fs.readFile(path.join(root,entry.name,'receipt.json'),'utf8'));
        if(Object.entries(input).some(([k,v])=>JSON.stringify(result.settings?.[k])!==JSON.stringify(v)))continue;
        validateHybridStage(name,result,root);
        const references=name==='shape'?Object.values(result.references??{}):result.references;
        if(!Array.isArray(references)||references.length!==4)continue;
        for(const ref of references as RecordValue[])if(createHash('sha256').update(await fs.readFile(ref.path)).digest('hex')!==ref.sha256)throw Error('Changed reference');
        if(name==='paint'&&createHash('sha256').update(await fs.readFile(input.mesh_path)).digest('hex')!==result.geometrySourceSha256)continue;
        const assets=[{path:result.output,sha256:createHash('sha256').update(await fs.readFile(result.output)).digest('hex')}];
        await fs.writeFile(cache+'.pending',JSON.stringify({policy:HYBRID_POLICY,input,result,assets},null,2));await fs.rename(cache+'.pending',cache);
        progress(`Recovered completed ${name==='shape'?'multiview geometry':'2.1 materials'} from worker receipt`);return result;
      }catch{/* Incomplete, incompatible or changed worker output cannot be resumed. */}
    }
    try{
      const health=await fetch(base.replace(/\/$/,'')+'/health',{signal:AbortSignal.timeout(8000)});
      const capabilities=await health.json() as RecordValue;if(!health.ok||capabilities.protocol!=='dnd-hybrid-v1')throw Error('Worker protocol mismatch');
      if(capabilities.running)throw Error('Worker busy');
    }catch{throw new ProductionError(`The hybrid ${name==='paint'?'2.1 paint':'multiview shape'} worker is unavailable or busy. Start the hybrid workers, then retry. Completed stages are kept.`,true);}
    const output_dir=path.join(root,name+'-'+randomUUID());
    let result:RecordValue;
    try{
      result=await postWorkerJSON(base.replace(/\/$/,'')+route,{...input,output_dir});validateHybridStage(name,result,root);
    }catch(error){await fs.writeFile(path.join(root,name+'-failure.json'),JSON.stringify({error:String(error),output_dir},null,2));throw new ProductionError(`Hybrid ${name} did not finish with a verified result. Completed stages are kept; check the worker and retry.`,true);}
    const outputs=name==='align'?HYBRID_VIEWS.map(v=>result.views[v].output):[result.output];const assets=[];
    for(const output of outputs)assets.push({path:output,sha256:createHash('sha256').update(await fs.readFile(output)).digest('hex')});
    await fs.writeFile(cache+'.pending',JSON.stringify({policy:HYBRID_POLICY,input,result,assets},null,2));await fs.rename(cache+'.pending',cache);
    signal?.throwIfAborted();return result;
  }
  progress('Removing backgrounds and aligning four reference views');
  const aligned=await stage('align',urls.shape,'/align',{reference_paths:paths});
  const alignedPaths=Object.fromEntries(HYBRID_VIEWS.map(v=>[v,aligned.views[v].output]));
  progress('Building multiview geometry · 75 steps');
  const shape=await stage('shape',urls.shape,'/shape',{reference_paths:alignedPaths,steps:75,guidance:5.5,seed:923300,resolution:512,num_chunks:10000});
  progress('Painting four-reference Hunyuan 2.1 materials');
  const paint=await stage('paint',urls.paint,'/trial',{mesh_path:shape.output,reference_paths:HYBRID_VIEWS.map(v=>alignedPaths[v]),faces:120000,resolution:768,views:6,atlas:4096});
  return {painted:paint.output as string,cacheRoot:root,alignment:aligned,shape,paint};
}
