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
import {NATURAL_BOUNDARY_PROMPT,mergeNaturalBoundaryMask} from './naturalBoundaryMask.js';
import {reportAi} from './ai/status.js';
import {gateMapFeature} from './mapFeatureGate.js';
import {parseMapAnalysisRegions} from '../../shared/mapAnalysisRegions.js';
import {generateMapRegionMask} from './mapRegionMask.js';
import {parseGeometrySuggestions,draftWallShape,type MapGeometryDraft} from '../../shared/mapGeometryDraft.js';
import {wallEdgeCount,sanitizeWalls} from '../../shared/mapWalls.js';
import {mapAnalysisImage} from './mapAnalysisImage.js';

export const YELLOW_WALL_PROMPT='Paint the entire TOP CAPS of the structural stone walls solid opaque bright yellow (#FFFF00), edge to edge at their exact existing width and location. Cover the stone texture and mortar seams with continuous filled yellow bands. Do not draw outlines, border strokes or centerlines. Leave doors and open passages unpainted. Do not include vertical wall faces, wall shadows, furniture or stairs. Preserve all other map pixels, the full composition and exact framing. Do not broaden the walls, black out the map or make a standalone segmentation diagram. No labels.';

const hash=(data:string|Buffer)=>createHash('sha256').update(data).digest('hex');
export async function geometrySource(mapId:string) {
  const map=getMap(mapId);
  if(!map)throw Error('Map not found.');
  const {image,...imageSource}=await mapAnalysisImage(map);
  return {map,image,source:{mapId,...imageSource,
    gridSizePx:map.gridSizePx,feetPerSquare:map.feetPerSquare,gridOffsetX:map.gridOffsetX,gridOffsetY:map.gridOffsetY,
    wallsHash:hash(JSON.stringify(map.walls??[]))}};
}

export async function suggestMapGeometry(mapId:string,method:'ai'|'local'='ai',options?:unknown):Promise<MapGeometryDraft> {
  const {image,source}=await geometrySource(mapId);
  const regions=parseMapAnalysisRegions((options as {regions?:unknown}|undefined)?.regions);
  if(method==='local'&&regions)throw Error('Selected-region analysis uses the image API. Choose AI detection.');
  if(method==='local')return {version:1,method,id:randomUUID(),source,items:await detectLocalWalls(image,source.width,source.gridSizePx,localWallOptions(options))};
  if(!config.geminiApiKey)throw new Error('Configure the image API in Settings before generating a yellow wall mask.');
  const preview=await sharp(image).rotate().resize({width:2048,height:2048,fit:'inside',withoutEnlargement:true}).png().toBuffer();
  const includeNatural=(options as {naturalBoundaries?:boolean}|undefined)?.naturalBoundaries!==false;
  const automatic=(options as {automatic?:boolean}|undefined)?.automatic===true;
  const qwenChecks=automatic?[await gateMapFeature(image,'walls'),...(includeNatural?[await gateMapFeature(image,'caves')]:[])]:[];
  const structuralAllowed=qwenChecks[0]?.allowed!==false;
  const naturalAllowed=includeNatural&&qwenChecks[1]?.allowed!==false;
  if(!structuralAllowed&&!naturalAllowed)return {version:1,method:'ai',id:randomUUID(),source,qwenChecks,items:[],maskWarnings:['Qwen found no requested wall features; no image-API masks were requested.']};
  reportAi(structuralAllowed?'Generating the structural wall mask with the image API. The original map will remain unchanged.':'Structural wall mask skipped; proceeding with natural boundaries.');
  for(let attempt=0;attempt<2;attempt++){
  const prompt=YELLOW_WALL_PROMPT+(attempt?' Use solid opaque yellow bands across masonry wall caps. Connect their joins and keep real doorway gaps clear.':'');
  const originalPath=`/uploads/wall-source-${randomUUID()}.png`;
  if(!structuralAllowed)await fs.writeFile(path.join(config.uploadsDir,path.basename(originalPath)),await sharp(image).rotate().png().toBuffer());
  const result=!structuralAllowed?{path:originalPath}:regions?await generateMapRegionMask(prompt,image,source.width,source.height,regions):await generateApiImage(prompt,{width:2048,height:Math.round(2048*source.height/source.width)},[{mimeType:'image/png',data:preview.toString('base64')}]);
  if('error' in result)throw new Error(result.error);
  const root=path.resolve(config.uploadsDir),file=path.resolve(root,result.path.slice('/uploads/'.length));
  if(!result.path.startsWith('/uploads/')||!file.startsWith(root+path.sep))throw new Error('Invalid generated mask path.');
  const mask=await fs.readFile(file),metadata=await sharp(mask).metadata();
  if(!metadata.width||!metadata.height||Math.abs(Math.log((metadata.width/metadata.height)/(source.width/source.height)))>.04)
    throw new Error('The generated mask changed the map framing. Try again; no walls were applied.');
  let conversionMask:Buffer=mask,naturalImage:Buffer|undefined;
  let maskImagePath=result.path,naturalMaskImagePath:string|undefined;
  const maskWarnings:string[]=[];
  if(naturalAllowed){
    reportAi('Wall mask ready. Running a separate pass for caves and other natural interiors.');
    try{
      const reference=await sharp(mask).resize({width:2048,height:2048,fit:'inside',withoutEnlargement:true}).png().toBuffer();
      const natural=regions?await generateMapRegionMask(NATURAL_BOUNDARY_PROMPT,mask,source.width,source.height,regions):await generateApiImage(NATURAL_BOUNDARY_PROMPT,{width:2048,height:Math.round(2048*source.height/source.width)},[{mimeType:'image/png',data:reference.toString('base64')}]);
      if('error' in natural)throw new Error(natural.error);
      const naturalFile=path.resolve(root,natural.path.slice('/uploads/'.length));
      if(!natural.path.startsWith('/uploads/')||!naturalFile.startsWith(root+path.sep))throw new Error('Invalid natural-boundary mask path.');
      naturalMaskImagePath=natural.path;
      const merged=await mergeNaturalBoundaryMask(mask,await fs.readFile(naturalFile));
      naturalImage=merged.naturalImage;
      if(merged.ignoredWallComponents)maskWarnings.push('Ignored natural-pass markings that retraced existing walls. The first wall mask was kept.');
      if(merged.addedPixels){
        conversionMask=merged.image;maskImagePath=`/uploads/wall-union-${randomUUID()}.png`;
        await fs.writeFile(path.join(root,path.basename(maskImagePath)),conversionMask);
      }
    }catch(error){
      const reason=error instanceof Error?error.message:'Image analysis failed.';
      maskWarnings.push(`Natural-boundary pass failed: ${reason} Only the structural wall mask is available. Check natural interiors manually or analyze again.`);
      reportAi('Natural-boundary pass failed. Keeping the structural wall mask for review.');
    }
  }
  reportAi('Converting yellow wall regions into an editable draft.');
  if(!structuralAllowed&&!naturalImage)return {version:1,method:'ai',id:randomUUID(),source,qwenChecks,items:[],maskImagePath,naturalMaskImagePath,maskWarnings};
  let converted;
  const separateLayers=async()=>{
    if(!naturalImage)return undefined;
    const structural=await wallsFromYellowMask(mask,source.width,source.height,source.gridSizePx,image,true);
    const natural=await wallsFromYellowMask(naturalImage,source.width,source.height,source.gridSizePx,undefined,true,false,naturalImage);
    const walls=[...structural.walls,...natural.walls.map(w=>({...w,id:`natural-${w.id}`}))];
    if(walls.length<=120&&sanitizeWalls(walls).length===walls.length)return {...structural,walls,coverage:Math.min(structural.coverage,natural.coverage)};
  };
  try {converted=await wallsFromYellowMask(conversionMask,source.width,source.height,source.gridSizePx,image,false,true,naturalImage);}
  catch(error){
    if(conversionMask!==mask){
      if(naturalImage)try{
        // A pixel union can fragment otherwise simple touching outlines. Keep
        // the two accepted masks as separate wall pieces, trying all existing
        // safe tolerances instead of stopping at the first adequate candidate.
        converted=await separateLayers();
      }catch{/* If either component fails the same checks, keep structural only. */}
      if(!converted){
      try{
        converted=await wallsFromYellowMask(mask,source.width,source.height,source.gridSizePx,image);maskImagePath=result.path;
        maskWarnings.push('The combined boundary mask could not be converted safely. Keeping the structural walls only; review natural interiors manually.');
      }catch{/* Both masks failed: use the existing single filled-band retry. */}
      }
    }
    if(!converted){if(attempt===1)throw error;reportAi('The first yellow mask could not be converted cleanly. Retrying once with filled wall bands; no walls have been applied.');continue;}
  }
  // A pixel union can add slivers at touching masks;
  // separate outlines need no extra simplification or changed gap tolerances.
  if(naturalImage&&wallEdgeCount(converted.walls)>480)try{
    const separate=await separateLayers();
    if(separate&&wallEdgeCount(separate.walls)<wallEdgeCount(converted.walls))converted=separate;
  }catch{/* Retain the already validated union. */}
  const normalize=(p:{x:number;y:number})=>({x:p.x/source.width,y:p.y/source.height});
  const items=parseGeometrySuggestions({items:converted.walls.map((wall,index)=>({kind:'wall',label:`Wall ${index+1}`,ax:wall.ax/source.width,ay:wall.ay/source.height,bx:wall.bx/source.width,by:wall.by/source.height,heightFt:10,confidence:1,
    ...(wall.kind==='polygon'?{shape:'polygon',points:wall.points!.map(normalize),holes:wall.holes?.map(r=>r.map(normalize))}:{})}))});
  reportAi(`Yellow-mask draft ready: ${items.length} walls. Review alignment and doorway gaps before applying.`);
  return {version:1,method:'ai',id:randomUUID(),source,qwenChecks,items,maskImagePath,wallMaskImagePath:result.path,naturalMaskImagePath,maskWarnings,maskCoverage:converted.coverage,
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
  if(sanitizeWalls(additions).length!==additions.length)throw new Error('Some walls are too small or contain invalid geometry.');
  return additions;
}

/** One atomic append; image/grid/wall changes invalidate an old review. No existing wall is replaced. */
export async function applyGeometryDraft(mapId:string,raw:unknown,selected:unknown) {
  const {source}=await geometrySource(mapId),additions=prepareWallDraft(raw,selected,source);
  db.transaction(()=>{
    const map=getMap(mapId);
    if(!map||hash(JSON.stringify(map.walls??[]))!==source.wallsHash)throw new Error('Walls changed during review. Generate a new draft.');
    const walls=[...(map.walls??[]),...additions];
    db.prepare('UPDATE maps SET walls=? WHERE id=?').run(JSON.stringify(walls),mapId);
  })();
  return additions.length;
}
