import sharp from 'sharp';
import path from 'node:path';
import type {StateSnapshot} from '../../shared/types.js';
import {needsVisibilityLayer,usesMapVision} from '../../shared/playerVision.js';
import {legacyMaskSvg} from '../../shared/legacyMaskSvg.js';
import {config} from './config.js';
import {grantSnapshotAssets,rasterAsset,renderAssetFor} from './renderAssets.js';
import {tokenSprites} from './tokenSprites.js';
import {mirrorImageCount,MIRROR_IMAGE_SPREAD} from '../../shared/linkedSpells.js';
import {resolveToken} from '../../shared/tokenDisplay.js';
import {productionFamily} from '../../shared/assetProduction.js';
import {MONSTER_MODEL_TYPES} from '../../shared/monsterAppearance.js';
import {visionTiles as prepareVisionTiles} from './visionTiles.js';
import type {MovementFrameTiming} from '../../shared/movementTiming.js';
import {timingClock} from './movementTiming.js';
import {hasTerrainSources,legacyTerrainFrames} from './legacyTerrain.js';
const dimensions=new Map<string,Promise<{width:number;height:number}>>();
const layerCache=new Map<string,Promise<StateSnapshot>>();
export function clearRenderedLayerCache(){layerCache.clear();}
async function mapDimensions(image:string|null){
 if(!image||!/^\/uploads\/[a-zA-Z0-9_.-]+$/.test(image))return {width:1600,height:1200};
 let value=dimensions.get(image);if(!value){value=sharp(path.join(config.uploadsDir,image.slice(9))).metadata().then(m=>({width:m.width??1600,height:m.height??1200})).catch(()=>({width:1600,height:1200}));if(dimensions.size>=64)dimensions.delete(dimensions.keys().next().value!);dimensions.set(image,value);}return value;
}
const bundledMonsters=new Set<string>(MONSTER_MODEL_TYPES);
function needs2dSprite(t:StateSnapshot['tokens'][number],s:StateSnapshot,sprites2d?:{pc:boolean;monster:boolean}):boolean{
 if(!sprites2d)return true;
 if(t.kind==='pc'){if(sprites2d.pc)return true;const c=s.characters.find(x=>x.id===t.refId);return !(resolveToken(s,t).dead||c?.modelType||['druk','varis','vanec'].includes((c?.name??'').trim().toLowerCase()));}
 if(sprites2d.monster)return true;
 const m=s.monsters.find(x=>x.id===t.refId),display=resolveToken(s,t);
 if(display.dead)return false;
 if(m?.objectKind)return m.objectKind!=='chest'&&m.objectKind!=='trap'&&!m.modelType;
 return !bundledMonsters.has(productionFamily({...m,name:display.name}));
}
async function renderLayer(id:string,s:StateSnapshot,legacy:boolean,composite:boolean,tiled:boolean,timing?:MovementFrameTiming,preShade=false,sprites2d?:{pc:boolean;monster:boolean}):Promise<StateSnapshot>{
 if(!s.map)return s;
 const coalesceKey=JSON.stringify([renderingLayerKey(s),legacy,composite,tiled,preShade,legacy?null:sprites2d??null]);
 const existing=layerCache.get(coalesceKey);
 if(existing){
  const shared=await existing;
  if(grantSnapshotAssets(id,shared)){
   layerCache.delete(coalesceKey);layerCache.set(coalesceKey,existing);
   if(timing){const now=timingClock();timing.spritesStartAt=now;timing.spritesEndAt=now;timing.maskStartAt=now;timing.maskEndAt=now;}
   return reuseRenderedSnapshot(s,shared);
  }
  layerCache.delete(coalesceKey);
 }
 const work=(async()=>{
  const map=s.map!,visibilityLayer=needsVisibilityLayer(map,s.playerVision),hasVisionLayers=process.env.SERVER_RASTER_VISION==='1'&&legacy&&visibilityLayer&&!!s.playerVision&&!!s.legacyGeometry;
  const tokenLayerIds:string[]=[];
  const spritesPromise=(async()=>{
   if(timing)timing.spritesStartAt=timingClock();
   const tokensForSprites=legacy||!sprites2d?s.tokens:s.tokens.filter(t=>needs2dSprite(t,s,sprites2d));
   const tokenImages=tokensForSprites.length?await tokenSprites(id,tokensForSprites.length===s.tokens.length?s:{...s,tokens:tokensForSprites},preShade):{};
   if(timing)timing.spritesEndAt=timingClock();
   let tokenLayerRaster:StateSnapshot['tokenLayerRaster'];
   if(legacy&&composite){
    const doors=new Set((map.walls??[]).filter(w=>w.door&&w.tokenId).map(w=>w.tokenId));
    const size=await mapDimensions(map.imagePath),tokens=s.tokens.filter(t=>!t.sharedSightOnly&&!doors.has(t.id)&&tokenImages[t.id]);
    if(tokens.length){
     const left=Math.min(0,...tokens.map(t=>t.x+Math.min(tokenImages[t.id].body.x,tokenImages[t.id].hud.x)))-8;
     const top=Math.min(0,...tokens.map(t=>t.y+Math.min(tokenImages[t.id].body.y,tokenImages[t.id].hud.y)))-8;
     const right=Math.max(size.width,...tokens.map(t=>t.x+tokenImages[t.id].hud.x+tokenImages[t.id].hud.width))+8;
     const bottom=Math.max(size.height,...tokens.map(t=>t.y+tokenImages[t.id].hud.y+tokenImages[t.id].hud.height))+8;
     const scale=Math.min(1,3072/Math.max(right-left,bottom-top)),width=Math.ceil((right-left)*scale),height=Math.ceil((bottom-top)*scale);
     const art=tokens.map(t=>{
      const pair=tokenImages[t.id];tokenLayerIds.push(t.id);
      const image=(a:typeof pair.body)=>`<image xlink:href="data:image/png;base64,${renderAssetFor(id,a.key)!.toString('base64')}" x="${a.x}" y="${a.y}" width="${a.width/a.scale}" height="${a.height/a.scale}"/>`;
      const r=t.widthFt*map.gridSizePx/map.feetPerSquare/2;
      const mirrors=Array.from({length:mirrorImageCount(resolveToken(s,t).conditions)},(_,i)=>`<g opacity=".35" transform="translate(${Math.cos(i*Math.PI*2/3)*r*2*MIRROR_IMAGE_SPREAD} ${Math.sin(i*Math.PI*2/3)*r*2*MIRROR_IMAGE_SPREAD})">${image(pair.body)}</g>`).join('');
      return `<g transform="translate(${t.x} ${t.y})" opacity="${t.isHidden?.45:1}">${mirrors}${image(pair.body)}${image(pair.hud)}</g>`;
     }).join('');
     const svg=`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${width}" height="${height}" viewBox="${left} ${top} ${width/scale} ${height/scale}">${art}</svg>`;
     tokenLayerRaster=await rasterAsset(id,svg,{width,height,x:left,y:top,scale});
    }
   }
   return {tokenImages,tokenLayerRaster};
  })();
  const buildMask=async(graded:boolean)=>{
   if(timing)timing.maskStartAt=timingClock();
   const size=await mapDimensions(map.imagePath),v=s.playerVision!;
   const visionTiles=tiled?await prepareVisionTiles(id,s,size,timing,graded):undefined;
   let visionRaster:StateSnapshot['visionRaster'];
   if(!visionTiles){
    const x=Math.min(0,...v.origins.map(o=>o.x-v.radius))-32,y=Math.min(0,...v.origins.map(o=>o.y-v.radius))-32;
    const right=Math.max(size.width,...v.origins.map(o=>o.x+v.radius))+32,bottom=Math.max(size.height,...v.origins.map(o=>o.y+v.radius))+32;
    const scale=Math.min(1,2048/Math.max(right-x,bottom-y)),width=Math.max(1,Math.ceil((right-x)*scale)),height=Math.max(1,Math.ceil((bottom-y)*scale));
    const options={width,height,x,y,scale,heavy:v.heavy,daylight:!!v.daylight,wallFog:usesMapVision(map),keepRevealed:map.explorationMode==='revealed',graded};
    visionRaster=await rasterAsset(id,legacyMaskSvg(s.legacyGeometry!,options),{width,height,x,y,scale});
   }
   if(timing)timing.maskEndAt=timingClock();
   return {visionTiles,visionRaster,graded};
  };
  const terrainPromise=hasVisionLayers?legacyTerrainFrames(id,[s],false,timing).catch(()=>undefined):Promise.resolve(undefined);
  const maskPromise=hasVisionLayers?hasTerrainSources(s).then(graded=>buildMask(graded)):Promise.resolve(undefined);
  const [{tokenImages,tokenLayerRaster},terrain,initialMask]=await Promise.all([spritesPromise,terrainPromise,maskPromise]);
  const terrainRaster=terrain?.terrain;
  const mask=initialMask&&initialMask.graded!==!!terrainRaster?await buildMask(!!terrainRaster):initialMask;
  const visionRaster=mask?.visionRaster,visionTiles=mask?.visionTiles;
  const legacyGeometry=(visionRaster||visionTiles)&&s.legacyGeometry?{sight:[],near:[],lights:[],memory:[],affinity:s.legacyGeometry.affinity}:s.legacyGeometry;
  return {...s,legacyGeometry,tokenSprites:tokenImages,tokenLayerRaster,tokenLayerIds,visionRaster,visionTiles,terrainRaster};
 })();
 if(layerCache.size>=16)layerCache.delete(layerCache.keys().next().value!);
 layerCache.set(coalesceKey,work);
 work.catch(()=>{if(layerCache.get(coalesceKey)===work)layerCache.delete(coalesceKey);});
 return work;
}
export async function renderedSnapshot(id:string,s:StateSnapshot,legacy:boolean,composite=process.env.SERVER_TOKEN_COMPOSITE==='1',tiled=false,timing?:MovementFrameTiming,preShade=false,sprites2d?:{pc:boolean;monster:boolean}):Promise<StateSnapshot>{
 if(!s.map)return s;
 const [main,party]=await Promise.all([
  renderLayer(id,{...s,partyView:undefined},legacy,composite,tiled,timing,preShade,sprites2d),
  s.partyView?renderLayer(id,{...s,...s.partyView,partyView:undefined,role:'player'},legacy,composite,tiled,undefined,preShade,sprites2d):Promise.resolve(undefined),
 ]);
 return {...main,...(party?{partyView:{...s.partyView!,legacyGeometry:party.legacyGeometry,tokenSprites:party.tokenSprites,visionRaster:party.visionRaster,visionTiles:party.visionTiles,terrainRaster:party.terrainRaster,tokenLayerRaster:party.tokenLayerRaster,tokenLayerIds:party.tokenLayerIds}}:{})};
}
export function renderingLayerKey(view:StateSnapshot,index?:{characters:Map<string,any>;monsters:Map<string,any>}){
 const idx=index??{characters:new Map(view.characters.map(c=>[c.id,c])),monsters:new Map(view.monsters.map(m=>[m.id,m]))};
 return [view.map,view.tokens,view.playerVision,view.exploredTerrain,view.mapImages,view.serverRendering?.enabled,view.tokens.map(t=>resolveToken(view,t,idx))];
}
/** Only inputs that affect artwork or visibility; chat/roll/panel updates reuse it. */
export function renderingInputKey(s:StateSnapshot){
 const index={characters:new Map(s.characters.map(c=>[c.id,c])),monsters:new Map(s.monsters.map(m=>[m.id,m]))};
 return JSON.stringify([renderingLayerKey(s,index),s.partyView?renderingLayerKey({...s,...s.partyView,partyView:undefined,role:'player'},{characters:index.characters,monsters:new Map(s.partyView.monsters.map(m=>[m.id,m]))}):null]);
}
export function reuseRenderedSnapshot(next:StateSnapshot,ready:StateSnapshot):StateSnapshot{
 const fields=(s:StateSnapshot)=>({legacyGeometry:s.legacyGeometry,tokenSprites:s.tokenSprites,tokenLayerRaster:s.tokenLayerRaster,tokenLayerIds:s.tokenLayerIds,visionRaster:s.visionRaster,visionTiles:s.visionTiles,terrainRaster:s.terrainRaster});
 return {...next,...fields(ready),...(next.partyView&&ready.partyView?{partyView:{...next.partyView,...fields(ready.partyView as StateSnapshot)}}:{})};
}
