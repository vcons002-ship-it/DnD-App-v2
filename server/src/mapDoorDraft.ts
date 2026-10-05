import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import sharp from 'sharp';
import {geometrySource} from './mapGeometryDraft.js';
import {config} from './config.js';
import {db} from './db.js';
import {generateApiImage} from './ai/imageGateway.js';
import {generateMapRegionMask} from './mapRegionMask.js';
import {parseMapAnalysisRegions} from '../../shared/mapAnalysisRegions.js';
import {reportAi} from './ai/status.js';
import {gateMapFeature} from './mapFeatureGate.js';
import {DOOR_MASK_PROMPT,doorsFromMask} from './doorMask.js';
import {fitDoorMarker} from '../../shared/doorMaskFit.js';
import {getMap,createWallDoorObject} from './sessions.js';
import {sanitizeWalls} from '../../shared/mapWalls.js';
import type {MapDoorDraft} from '../../shared/mapDoorDraft.js';
import type {MapWall} from '../../shared/mapWalls.js';

export async function suggestMapDoors(mapId:string,rawRegions?:unknown,automatic=false):Promise<MapDoorDraft> {
  const {map,image,source}=await geometrySource(mapId);
  const regions=parseMapAnalysisRegions(rawRegions);
  if(!config.geminiApiKey)throw new Error('Configure the image API in Settings before suggesting doors.');
  const qwenChecks=automatic?[await gateMapFeature(image,'doors')]:[];
  if(qwenChecks.some(check=>!check.allowed))return {version:1,id:randomUUID(),source,qwenChecks,maskImagePath:map.imagePath!,doors:[]};
  reportAi('Marking visible doors with the image API. This is a separate request from walls and lights.');
  const preview=await sharp(image).rotate().png().toBuffer();
  const result=regions?await generateMapRegionMask(DOOR_MASK_PROMPT,image,source.width,source.height,regions):await generateApiImage(DOOR_MASK_PROMPT,{width:2048,height:Math.round(2048*source.height/source.width)},[{mimeType:'image/png',data:preview.toString('base64')}]);
  if('error' in result)throw new Error(result.error);
  const root=path.resolve(config.uploadsDir),file=path.resolve(root,result.path.slice('/uploads/'.length));
  if(!result.path.startsWith('/uploads/')||!file.startsWith(root+path.sep))throw new Error('Invalid door mask path.');
  const markers=await doorsFromMask(await fs.readFile(file),image,source.width,source.height);
  const doors=markers.map(marker=>({...marker,...fitDoorMarker(marker,map.walls??[],source.gridSizePx)}));
  reportAi(`Door draft ready: ${doors.length} suggestions. Check that each marker represents a door, not an open passage.`);
  return {version:1,id:randomUUID(),source,qwenChecks,maskImagePath:result.path,doors};
}

/** Fit selected markers to the final reviewed walls, including newly drafted walls. */
export function prepareDoorDraft(raw:unknown,selection:unknown,source:MapDoorDraft['source'],existing:readonly MapWall[]):MapWall[] {
  const draft=raw as MapDoorDraft;
  if(draft?.version!==1||typeof draft.id!=='string'||!/^[\w-]{1,40}$/.test(draft.id)||!Array.isArray(draft.doors)||draft.doors.length>64||draft.doors.some(d=>!d||typeof d.id!=='string'||!/^ai-door-\d{1,2}$/.test(d.id))||new Set(draft.doors.map(d=>d.id)).size!==draft.doors.length)throw new Error('Invalid door draft.');
  if(!Array.isArray(selection)||!selection.length||selection.some(id=>typeof id!=='string'||!draft.doors.some(d=>d.id===id))||new Set(selection).size!==selection.length)throw new Error('Select doors from this draft.');
  if(JSON.stringify(draft.source)!==JSON.stringify(source))throw new Error('The map image, grid or walls changed. Generate a new door draft.');
  const chosen=draft.doors.filter(d=>selection.includes(d.id));
  if(chosen.some(d=>![d.ax,d.ay,d.bx,d.by,d.thickness].every(v=>typeof v==='number'&&Number.isFinite(v))||d.ax<0||d.bx<0||d.ay<0||d.by<0||d.ax>source.width||d.bx>source.width||d.ay>source.height||d.by>source.height||d.thickness<=0||d.thickness>source.width*.04))throw new Error('Invalid door positions.');
  if(chosen.some(d=>d.footprint!==undefined&&(!Array.isArray(d.footprint)||d.footprint.length<3||d.footprint.length>32||d.footprint.some(p=>!p||!Number.isFinite(p.x)||!Number.isFinite(p.y)||p.x<0||p.y<0||p.x>source.width||p.y>source.height))))throw new Error('Invalid door footprint.');
  const walls=[...existing],added:MapWall[]=[];
  for(const marker of chosen){
    const {wall,extensions,issue}=fitDoorMarker(marker,walls,source.gridSizePx);
    if(!wall)throw new Error(`${marker.id}: ${issue}`);
    const door={...wall,id:`door-${draft.id}-${marker.id}`};
    const connections=(extensions??[]).map((w,i)=>({...w,id:`jamb-${draft.id}-${marker.id}-${i+1}`}));
    walls.push(...connections);added.push(...connections);
    walls.push(door);added.push(door);
  }
  return added;
}

/** Append linked doors as one transaction. Geometry and lock defaults are server-owned. */
export async function applyDoorDraft(mapId:string,raw:unknown,selection:unknown):Promise<number> {
  const {source}=await geometrySource(mapId);
  return db.transaction(()=>{
    const map=getMap(mapId);
    if(!map||createHash('sha256').update(JSON.stringify(map.walls??[])).digest('hex')!==source.wallsHash)throw new Error('Walls changed during review. Generate a new door draft.');
    const added=prepareDoorDraft(raw,selection,source,map.walls??[]),walls=[...(map.walls??[]),...added];
    if(sanitizeWalls(walls).length!==walls.length)throw new Error('These doors could not be fitted safely. Review the selected door geometry.');
    for(const door of added.filter(w=>w.door)){
      const token=createWallDoorObject(map.sessionId,mapId,(door.ax+door.bx)/2,(door.ay+door.by)/2);
      door.tokenId=token.id;
    }
    db.prepare('UPDATE maps SET walls=? WHERE id=?').run(JSON.stringify(walls),mapId);
    return added.filter(w=>w.door).length;
  })();
}
