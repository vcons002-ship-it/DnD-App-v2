import sharp from 'sharp';
import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {config} from './config.js';
import {listOllamaModels,ollamaChat} from './ai/ollama.js';
import {reportAi} from './ai/status.js';
import type {MapAnalysisRegion} from '../../shared/mapAnalysisRegions.js';

export type MapFeature='walls'|'caves'|'doors'|'arches'|'windows'|'lights';
const questions:Record<MapFeature,string>={walls:'Are there structural walls visible',caves:'Are there cave walls or enclosing natural interior boundaries visible',doors:'Is there a door or gate visible',arches:'Is there an arch or overpass with a walkable passage beneath it visible',windows:'Is there a window or viewing slit visible',lights:'Is there a light source visible'};
export const WINDOW_QUADRANTS:MapAnalysisRegion[]=[{ax:0,ay:0,bx:.5,by:.5},{ax:.5,ay:0,bx:1,by:.5},{ax:0,ay:.5,bx:.5,by:1},{ax:.5,ay:.5,bx:1,by:1}];
const quadrantNames=['NW','NE','SW','SE'];
let modelCache:{until:number;model?:string}|undefined;
async function qwenModel(){
 if(modelCache&&modelCache.until>Date.now())return modelCache.model;
 const names=(await listOllamaModels()).filter(n=>/^qwen/i.test(n)).sort((a,b)=>b.localeCompare(a,undefined,{numeric:true}));
 const model=names.includes(config.ollamaModel)&&/^qwen/i.test(config.ollamaModel)?config.ollamaModel:names[0];
 modelCache={until:Date.now()+30_000,model};return model;
}
export function resetMapGateModelCache(){modelCache=undefined;}
export async function gateMapFeature(image:Buffer,feature:MapFeature,scope='full map'){
 const started=Date.now();
 reportAi(`Qwen checking ${feature} (${scope}).`);
 const model=await qwenModel();
 const reference=await sharp(image).rotate().resize({width:1536,height:1536,fit:'inside',withoutEnlargement:true}).png().toBuffer();
 const prompt=`${questions[feature]} in this overhead/isometric battle map${scope==='full map'?'':' quadrant'}? Answer yes or no.`;
 const answer=model?await ollamaChat('Inspect the supplied battle map image. Answer the question with yes or no.',prompt,{model,images:[reference.toString('base64')],temperature:0,think:false,numPredict:40,numCtx:8192,timeoutMs:120_000}):null;
 const match=answer?.trim().match(/^(yes|no)\b[.!]?\s*$/i);
 const decision=match?match[1].toLowerCase():'fallback';
 const allowed=decision!=='no';
 const result={feature,scope,model:model??null,prompt,answer,decision,allowed,seconds:(Date.now()-started)/1000,imageHash:createHash('sha256').update(image).digest('hex')};
 await fs.mkdir(config.uploadsDir,{recursive:true});
 await fs.writeFile(path.join(config.uploadsDir,`qwen-filter-${randomUUID()}.json`),JSON.stringify(result,null,2));
 reportAi(decision==='no'?`Qwen found no ${feature} (${scope}); skipping that image-API pass.`:decision==='yes'?`Qwen found ${feature} (${scope}); proceeding to masking.`:`Qwen ${model?'did not return a clear answer':'is unavailable'} for ${feature}; using the image API instead.`);
 return result;
}
export async function gateWindowRegions(image:Buffer,width:number,height:number,selected?:readonly MapAnalysisRegion[]){
 const normalized=await sharp(image).rotate().resize(width,height,{fit:'fill'}).png().toBuffer();
 const regions:MapAnalysisRegion[]=[],checks=[];
 for(let i=0;i<WINDOW_QUADRANTS.length;i++){
  const q=WINDOW_QUADRANTS[i];
  const portions=(selected??[q]).map(r=>({ax:Math.max(q.ax,r.ax),ay:Math.max(q.ay,r.ay),bx:Math.min(q.bx,r.bx),by:Math.min(q.by,r.by)})).filter(r=>r.bx>r.ax&&r.by>r.ay);
  if(!portions.length)continue;
  // Context overlap prevents windows at a quadrant seam being cut in the local check.
  const left=Math.floor(Math.max(0,q.ax-.04)*width),top=Math.floor(Math.max(0,q.ay-.04)*height);
  const right=Math.ceil(Math.min(1,q.bx+.04)*width),bottom=Math.ceil(Math.min(1,q.by+.04)*height);
  const check=await gateMapFeature(await sharp(normalized).extract({left,top,width:right-left,height:bottom-top}).png().toBuffer(),'windows',quadrantNames[i]);
  checks.push(check);if(check.allowed)regions.push(...portions);
 }
 return {regions,checks};
}
