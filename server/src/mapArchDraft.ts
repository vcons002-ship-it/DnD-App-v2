import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {config} from './config.js';
import {geometrySource} from './mapGeometryDraft.js';
import {generateMapRegionMask} from './mapRegionMask.js';
import {gateMapFeature} from './mapFeatureGate.js';
import {reportAi} from './ai/status.js';
import {ARCH_MASK_PROMPT,archesFromMask} from './archMask.js';
import {parseMapAnalysisRegions} from '../../shared/mapAnalysisRegions.js';
import {analysisMarker,insideAnalysis} from '../../shared/mapGeometryDraft.js';
import {sanitizeWalls,type MapWall} from '../../shared/mapWalls.js';
import {fitArch,type MapArchDraft} from '../../shared/mapArchDraft.js';

export async function suggestMapArches(mapId:string,rawRegions?:unknown,automatic=false):Promise<MapArchDraft>{
 const {map,image,source}=await geometrySource(mapId),regions=parseMapAnalysisRegions(rawRegions);
 if(!config.geminiApiKey)throw Error('Configure the image API in Settings before suggesting arches.');
 const qwenChecks=automatic?[await gateMapFeature(image,'arches')]:[];
 if(qwenChecks.some(c=>!c.allowed))return {version:1,id:randomUUID(),source,qwenChecks,maskImagePath:source.previewImagePath??map.imagePath!,arches:[],uncertain:[]};
 reportAi('Marking arches and overpasses in a separate image API request. Ambiguous spans remain review-only.');
 // Full maps use the same ratio padding as selected regions, including tiled maps.
 const result=await generateMapRegionMask(ARCH_MASK_PROMPT,image,source.width,source.height,regions??[{ax:0,ay:0,bx:1,by:1}]);
 if('error' in result)throw Error(result.error);
 const masks=await archesFromMask(await fs.readFile(path.join(config.uploadsDir,path.basename(result.path))),image,source.width,source.height,source.gridSizePx);
 return {version:1,id:randomUUID(),source,qwenChecks,maskImagePath:result.path,arches:masks.arches.map(w=>analysisMarker(w,source)),uncertain:masks.uncertain.map(w=>analysisMarker(w,source))};
}
export function prepareArchDraft(raw:unknown,selection:unknown,source:MapArchDraft['source'],walls:readonly MapWall[]):MapWall[]{
 const d=raw as MapArchDraft;
 if(d?.version!==1||typeof d.id!=='string'||!/^[\w-]{1,40}$/.test(d.id)||!Array.isArray(d.arches)||d.arches.length>120||sanitizeWalls(d.arches).length!==d.arches.length||d.arches.some(w=>!/^ai-arch-\d+$/.test(w.id)||w.door||w.window||w.arch||!insideAnalysis({x:w.ax,y:w.ay},source)||!insideAnalysis({x:w.bx,y:w.by},source))||new Set(d.arches.map(w=>w.id)).size!==d.arches.length)throw Error('Invalid arch draft.');
 if(JSON.stringify(d.source)!==JSON.stringify(source))throw Error('The map or walls changed. Generate a new arch draft.');
 if(!Array.isArray(selection)||!selection.length||new Set(selection).size!==selection.length||selection.some(id=>!d.arches.some(w=>w.id===id)))throw Error('Select arches from this draft.');
 const added:MapWall[]=[];
 for(const marker of d.arches.filter(w=>selection.includes(w.id))){
  const {wall,issue}=fitArch(marker,[...walls,...added]);if(!wall)throw Error(`${marker.id}: ${issue}`);
  added.push({...wall,id:`arch-${d.id}-${marker.id}`});
 }
 return added;
}
