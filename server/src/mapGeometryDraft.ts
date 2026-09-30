import {detectLocalWalls,localWallOptions} from './localWallDraft.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import sharp from 'sharp';
import {config} from './config.js';
import {db} from './db.js';
import {getMap} from './sessions.js';
import {generateApiImage} from './ai/imageGateway.js';
import {wallsFromYellowMask} from './wallMask.js';
import {reportAi} from './ai/status.js';
import {parseGeometrySuggestions,draftWallShape,type MapGeometryDraft} from '../../shared/mapGeometryDraft.js';
import {MAX_MAP_WALLS,wallEdgeCount,sanitizeWalls} from '../../shared/mapWalls.js';

export const YELLOW_WALL_PROMPT='Return the supplied map with ONLY a bright yellow (#FFFF00) paint annotation over the narrow TOP CAPS of its structural stone walls. Trace each visible wall cap precisely at its existing width and location, including curved and angled walls. For caves, draw one continuous opaque yellow line, about 10 pixels wide, along the OUTER edge of the rock rim where it meets the surrounding solid rock or black background. Keep the entire rock rim inside this outline so its artwork remains visible. Join this line seamlessly to the adjacent yellow wall mask. Do not break the line at cracks, shadows or texture. For structural pillars, paint their whole top surface. Leave doors and open passages unpainted. Do not include vertical wall faces, wall shadows, furniture, stairs or water edges. All original floor, objects, lighting, and background pixels must remain visible and unchanged. Do not black out the map. Do not produce a standalone segmentation diagram or black-background mask. Do not broaden or smooth the architecture. Preserve the entire source composition and framing. No labels, icons or symbols.';

const hash=(data:string|Buffer)=>createHash('sha256').update(data).digest('hex');
export async function geometrySource(mapId:string) {
  const map=getMap(mapId);
  if(!map?.imagePath?.startsWith('/uploads/'))throw new Error('Upload a map image before suggesting walls.');
  const root=path.resolve(config.uploadsDir),file=path.resolve(root,map.imagePath.slice('/uploads/'.length));
  if(!file.startsWith(root+path.sep))throw new Error('Invalid map image path.');
  if((await fs.stat(file)).size>40_000_000)throw new Error('Use a map image smaller than 40 MB for analysis.');
  const image=await fs.readFile(file),metadata=await sharp(image,{limitInputPixels:80_000_000}).metadata();
  if(!metadata.width||!metadata.height)throw new Error('Cannot read map dimensions.');
  return {map,image,source:{mapId,imageHash:hash(image),width:(metadata.orientation??0)>=5?metadata.height:metadata.width,height:(metadata.orientation??0)>=5?metadata.width:metadata.height,
    gridSizePx:map.gridSizePx,feetPerSquare:map.feetPerSquare,gridOffsetX:map.gridOffsetX,gridOffsetY:map.gridOffsetY,
    wallsHash:hash(JSON.stringify(map.walls??[]))}};
}

export async function suggestMapGeometry(mapId:string,method:'ai'|'local'='ai',options?:unknown):Promise<MapGeometryDraft> {
  const {image,source}=await geometrySource(mapId);
  if(method==='local')return {version:1,method,id:randomUUID(),source,items:await detectLocalWalls(image,source.width,source.gridSizePx,localWallOptions(options))};
  if(!config.geminiApiKey)throw new Error('Configure the image API in Settings before generating a yellow wall mask.');
  const preview=await sharp(image).rotate().resize({width:2048,height:2048,fit:'inside',withoutEnlargement:true}).png().toBuffer();
  reportAi('Generating a yellow wall annotation with the image API. The original map will remain unchanged.');
  for(let attempt=0;attempt<2;attempt++){
  const prompt=YELLOW_WALL_PROMPT+(attempt?' Use solid opaque yellow bands across masonry wall caps and a continuous opaque outline along the outer cave rim. Connect their joins and keep real doorway gaps clear.':'');
  const result=await generateApiImage(prompt,{width:2048,height:Math.round(2048*source.height/source.width)},[{mimeType:'image/png',data:preview.toString('base64')}]);
  if('error' in result)throw new Error(result.error);
  const root=path.resolve(config.uploadsDir),file=path.resolve(root,result.path.slice('/uploads/'.length));
  if(!result.path.startsWith('/uploads/')||!file.startsWith(root+path.sep))throw new Error('Invalid generated mask path.');
  const mask=await fs.readFile(file),metadata=await sharp(mask).metadata();
  if(!metadata.width||!metadata.height||Math.abs(Math.log((metadata.width/metadata.height)/(source.width/source.height)))>.04)
    throw new Error('The generated mask changed the map framing. Try again; no walls were applied.');
  reportAi('Converting yellow wall regions into an editable draft.');
  let converted;
  try {converted=await wallsFromYellowMask(mask,source.width,source.height,source.gridSizePx,image);}
  catch(error){if(attempt===1)throw error;reportAi('The first yellow mask could not be converted cleanly. Retrying once with filled wall bands; no walls have been applied.');continue;}
  const normalize=(p:{x:number;y:number})=>({x:p.x/source.width,y:p.y/source.height});
  const items=parseGeometrySuggestions({items:converted.walls.map((wall,index)=>({kind:'wall',label:`Wall ${index+1}`,ax:wall.ax/source.width,ay:wall.ay/source.height,bx:wall.bx/source.width,by:wall.by/source.height,heightFt:10,confidence:1,
    ...(wall.kind==='polygon'?{shape:'polygon',points:wall.points!.map(normalize),holes:wall.holes?.map(r=>r.map(normalize))}:{})}))});
  reportAi(`Yellow-mask draft ready: ${items.length} walls. Review alignment and doorway gaps before applying.`);
  return {version:1,method:'ai',id:randomUUID(),source,items,maskImagePath:result.path,maskCoverage:converted.coverage,
    maskGeometry:converted.walls.every(w=>w.kind==='polygon')?'outlines':'rectangles'};
  }
  throw new Error('Could not produce a usable wall mask. No walls were applied.');
}

/** Validate against the source being reviewed without changing the map. */
export function prepareWallDraft(raw:unknown,selected:unknown,source:MapGeometryDraft['source']) {
  const draft=raw as MapGeometryDraft;
  if(draft?.version!==1||typeof draft.id!=='string'||!/^[\w-]{1,60}$/.test(draft.id))throw new Error('Invalid draft version or id.');
  const items=parseGeometrySuggestions(draft);
  if(JSON.stringify(draft.source)!==JSON.stringify(source))throw new Error('The map image, grid or walls changed. Generate a new draft before applying.');
  if(!Array.isArray(selected)||selected.some(id=>typeof id!=='string'||!items.some(i=>i.id===id&&i.kind==='wall')))throw new Error('Select wall suggestions from this draft.');
  const additions=items.filter(i=>selected.includes(i.id)).map(item=>({...draftWallShape(item,source),id:`draft-${draft.id}-${item.id}`}));
  if(!additions.length)throw new Error('Select at least one wall.');
  if(sanitizeWalls(additions).length!==additions.length)throw new Error('Some walls are too small or exceed the wall limit.');
  return additions;
}

/** One atomic append; image/grid/wall changes invalidate an old review. No existing wall is replaced. */
export async function applyGeometryDraft(mapId:string,raw:unknown,selected:unknown) {
  const {source}=await geometrySource(mapId),additions=prepareWallDraft(raw,selected,source);
  db.transaction(()=>{
    const map=getMap(mapId);
    if(!map||hash(JSON.stringify(map.walls??[]))!==source.wallsHash)throw new Error('Walls changed during review. Generate a new draft.');
    const walls=[...(map.walls??[]),...additions];
    if(wallEdgeCount(walls)>MAX_MAP_WALLS)throw new Error('This draft exceeds the map wall limit. Select fewer walls.');
    db.prepare('UPDATE maps SET walls=? WHERE id=?').run(JSON.stringify(walls),mapId);
  })();
  return additions.length;
}
