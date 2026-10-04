import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import sharp from 'sharp';
import {geometrySource} from './mapGeometryDraft.js';
import {config} from './config.js';
import {generateApiImage} from './ai/imageGateway.js';
import {generateMapRegionMask} from './mapRegionMask.js';
import {parseMapAnalysisRegions} from '../../shared/mapAnalysisRegions.js';
import {reportAi} from './ai/status.js';
import {LIGHT_MASK_PROMPT,lightsFromMask} from './lightMask.js';
import {updateMapEnvironment} from './sessions.js';
import type {MapGeometryDraft} from '../../shared/mapGeometryDraft.js';
import type {MapEnvironmentLight} from '../../shared/mapEnvironment.js';
import type {MapLightDraft} from '../../shared/mapLightDraft.js';
const hash=(v:unknown)=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
export function lightDraftSource(source:MapGeometryDraft['source'],lights:readonly MapEnvironmentLight[]){const {wallsHash,...rest}=source;return {...rest,lightsHash:hash(lights)};}
async function lightSource(mapId:string){const {map,image,source}=await geometrySource(mapId);return {map,image,source:lightDraftSource(source,map.environment?.lights??[]) };}
export async function suggestMapLights(mapId:string,rawRegions?:unknown):Promise<MapLightDraft>{
 const {map,image,source}=await lightSource(mapId);
 const regions=parseMapAnalysisRegions(rawRegions);
 if(!config.geminiApiKey)throw new Error('Configure the image API in Settings before suggesting lights.');
 reportAi('Marking visible light emitters with the image API. This is separate from wall drafting.');
 const preview=await sharp(image).rotate().png().toBuffer();
 const result=regions?await generateMapRegionMask(LIGHT_MASK_PROMPT,image,source.width,source.height,regions):await generateApiImage(LIGHT_MASK_PROMPT,{width:2048,height:Math.round(2048*source.height/source.width)},[{mimeType:'image/png',data:preview.toString('base64')}]);
 if('error' in result)throw new Error(result.error);
 const root=path.resolve(config.uploadsDir),file=path.resolve(root,result.path.slice('/uploads/'.length));
 if(!result.path.startsWith('/uploads/')||!file.startsWith(root+path.sep))throw new Error('Invalid mask path.');
 const lights=(await lightsFromMask(await fs.readFile(file),image,source.width,source.height)).filter(l=>!(map.environment?.lights??[]).some(e=>Math.hypot(e.x-l.x,e.y-l.y)<source.gridSizePx/source.feetPerSquare));
 reportAi(`Light draft ready: ${lights.length} new sources. Review positions before applying.`);
 return {version:1,id:randomUUID(),source,maskImagePath:result.path,lights};
}
export function prepareLightDraft(raw:unknown,selection:unknown,source:MapLightDraft['source']){
 const d=raw as MapLightDraft;
 if(d?.version!==1||typeof d.id!=='string'||!/^[\w-]{1,50}$/.test(d.id)||!Array.isArray(d.lights)||d.lights.length>64||!Array.isArray(selection)||selection.some(id=>typeof id!=='string'||!d.lights.some(l=>l.id===id)))throw new Error('Invalid light draft selection.');
 if(JSON.stringify(d.source)!==JSON.stringify(source))throw new Error('The map, grid or placed lights changed. Generate a new light draft.');
 const chosen=d.lights.filter(l=>selection.includes(l.id));
 if(!chosen.length)throw new Error('Select at least one light.');
 if(chosen.some(l=>typeof l.id!=='string'||!/^ai-light-\d+$/.test(l.id)||!Number.isFinite(l.x)||!Number.isFinite(l.y)||l.x<0||l.y<0||l.x>source.width||l.y>source.height)||new Set(chosen.map(l=>l.id)).size!==chosen.length)throw new Error('Invalid light positions.');
 // Only positions are inferred. Server-owned defaults preserve the tested behavior.
 return chosen.map(l=>({id:`light-${d.id}-${l.id}`,x:l.x,y:l.y,radiusFt:20,heightFt:8,color:'warm' as const,intensity:1,flicker:true,visibleTorch:false}));
}
export async function applyLightDraft(mapId:string,raw:unknown,selection:unknown){
 const {map,source}=await lightSource(mapId),added=prepareLightDraft(raw,selection,source);
 // No awaits after the freshness check: preserve existing lights, walls and unrelated settings.
 updateMapEnvironment(map.sessionId,mapId,{enabled:true,lights:[...(map.environment?.lights??[]),...added]});
 return added.length;
}
