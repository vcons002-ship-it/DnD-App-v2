import fs from 'node:fs/promises';import path from 'node:path';import {randomUUID} from 'node:crypto';
import {config} from './config.js';import {geometrySource} from './mapGeometryDraft.js';
import {reportAi} from './ai/status.js';
import {generateMapRegionMask} from './mapRegionMask.js';import {parseMapAnalysisRegions} from '../../shared/mapAnalysisRegions.js';
import {WINDOW_MASK_PROMPT,windowsFromMask} from './windowMask.js';
import {gateWindowRegions} from './mapFeatureGate.js';
import {fitWindow} from '../../shared/windowGeometry.js';
import {sanitizeWalls,type MapWall} from '../../shared/mapWalls.js';
import type {MapWindowDraft} from '../../shared/mapWindowDraft.js';
import {analysisMarker} from '../../shared/mapGeometryDraft.js';
export async function suggestMapWindows(mapId:string,rawRegions?:unknown,automatic=false):Promise<MapWindowDraft>{
 const {map,image,source}=await geometrySource(mapId);
 const regions=parseMapAnalysisRegions(rawRegions);
 if(!config.geminiApiKey)throw Error('Configure the image API in Settings before suggesting windows.');
 const filtered=await gateWindowRegions(image,source.width,source.height,regions,automatic);
 if(!filtered.regions.length)return {version:1,id:randomUUID(),source,qwenChecks:filtered.checks,maskImagePath:source.previewImagePath??map.imagePath!,windows:[]};
 reportAi('Marking windows with the simple image prompt. Review candidates before applying.');
 const r=await generateMapRegionMask(WINDOW_MASK_PROMPT,image,source.width,source.height,filtered.regions,{contextFraction:.04});
 if('error' in r)throw Error(r.error);
 const windows=(await windowsFromMask(await fs.readFile(path.join(config.uploadsDir,path.basename(r.path))),image,source.width,source.height,source.gridSizePx)).map(m=>analysisMarker(m,source));
 return {version:1,id:randomUUID(),source,qwenChecks:filtered.checks,maskImagePath:r.path,windows};
}
export function prepareWindowDraft(raw:unknown,selection:unknown,source:MapWindowDraft['source'],walls:readonly MapWall[]):MapWall[]{
 const d=raw as MapWindowDraft;
 if(d?.version!==1||typeof d.id!=='string'||!/^[\w-]{1,40}$/.test(d.id)||!Array.isArray(d.windows)||d.windows.length>120||sanitizeWalls(d.windows).length!==d.windows.length||d.windows.some(w=>!/^ai-window-\d+$/.test(w.id)||w.door||w.window)||new Set(d.windows.map(w=>w.id)).size!==d.windows.length)throw Error('Invalid window draft.');
 if(JSON.stringify(d.source)!==JSON.stringify(source))throw Error('The map or walls changed. Generate a new window draft.');
 if(!Array.isArray(selection)||!selection.length||new Set(selection).size!==selection.length||selection.some(id=>!d.windows.some(w=>w.id===id)))throw Error('Select windows from this draft.');
 const added:MapWall[]=[];
 for(const marker of d.windows.filter(w=>selection.includes(w.id))){
  const {wall,issue}=fitWindow(marker,[...walls,...added],source.gridSizePx);if(!wall)throw Error(`${marker.id}: ${issue}`);
  added.push({...wall,id:`window-${d.id}-${marker.id}`});
 }
 return added;
}
