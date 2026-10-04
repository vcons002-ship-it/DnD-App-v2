import fs from 'node:fs/promises';import path from 'node:path';import {randomUUID} from 'node:crypto';
import sharp from 'sharp';
import {config} from './config.js';import {geometrySource} from './mapGeometryDraft.js';
import {generateApiImage} from './ai/imageGateway.js';import {reportAi} from './ai/status.js';
import {WINDOW_MASK_PROMPT,windowsFromMask} from './windowMask.js';
import {fitWindow} from '../../shared/windowGeometry.js';
import {sanitizeWalls,type MapWall} from '../../shared/mapWalls.js';
import type {MapWindowDraft} from '../../shared/mapWindowDraft.js';
export async function suggestMapWindows(mapId:string):Promise<MapWindowDraft>{
 const {image,source}=await geometrySource(mapId);
 if(!config.geminiApiKey)throw Error('Configure the image API in Settings before suggesting windows.');
 reportAi('Marking windows with the simple image prompt. Review candidates before applying.');
 const reference=await sharp(image).rotate().png().toBuffer();
 const r=await generateApiImage(WINDOW_MASK_PROMPT,{width:2048,height:Math.round(2048*source.height/source.width)},[{mimeType:'image/png',data:reference.toString('base64')}]);
 if('error' in r)throw Error(r.error);
 const windows=await windowsFromMask(await fs.readFile(path.join(config.uploadsDir,path.basename(r.path))),image,source.width,source.height,source.gridSizePx);
 return {version:1,id:randomUUID(),source,maskImagePath:r.path,windows};
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
