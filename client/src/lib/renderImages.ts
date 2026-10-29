import type {StateSnapshot} from '../../../shared/types';
import {movementTiming} from './movementTiming';
const images=new Map<string,HTMLImageElement>(),loading=new Map<string,Promise<void>>();
export const renderImageUrl=(credential:string,key:string)=>`/api/render/${encodeURIComponent(credential)}/${encodeURIComponent(key)}`;
export const renderedImage=(key:string|undefined)=>key?images.get(key):undefined;
/** Decode before publishing the matching positions/mask revision. Camera motion
 * continues locally while the previous complete frame is displayed. */
export async function prepareRenderImages(s:StateSnapshot,credential:string|null,timing?:{id:string;revision:number}){
 if(!credential)return;
 const keys=new Set<string>();
 for(const layer of [s,s.partyView])if(layer){
  if(layer.visionRaster)keys.add(layer.visionRaster.key);
  if(layer.terrainRaster)keys.add(layer.terrainRaster.key);
  if(layer.legacyMotion?.atlas){keys.add(layer.legacyMotion.atlas.mask.key);if(layer.legacyMotion.atlas.terrain)keys.add(layer.legacyMotion.atlas.terrain.key);if(layer.legacyMotion.atlas.base)keys.add(layer.legacyMotion.atlas.base.key);}
  for(const tile of Object.values(layer.visionTiles?.tiles??{}))keys.add(tile.key);
  for(const frame of layer.legacyMotion?.frames??[]){if(frame.visionRaster)keys.add(frame.visionRaster.key);for(const tile of Object.values(frame.visionTiles?.tiles??{}))keys.add(tile.key);for(const pair of Object.values(frame.tokenSprites??{})){keys.add(pair.body.key);keys.add(pair.hud.key);}}
  if(layer.tokenLayerRaster)keys.add(layer.tokenLayerRaster.key);
  const painted=new Set(layer.tokenLayerIds??[]);
  for(const [id,pair] of Object.entries(layer.tokenSprites??{}))if(!painted.has(id)){keys.add(pair.body.key);keys.add(pair.hud.key);}
 }
 if(timing)movementTiming('imagesPlanned',{...timing,total:keys.size,cached:[...keys].filter(key=>images.has(key)).length,inflight:[...keys].filter(key=>!images.has(key)&&loading.has(key)).length});
 await Promise.all([...keys].map(key=>{
  const hit=images.get(key);if(hit){images.delete(key);images.set(key,hit);return;}
  let promise=loading.get(key);if(promise)return promise;
  promise=(async()=>{const image=new Image();if(timing)movementTiming('imageStart',{...timing,key});image.src=renderImageUrl(credential,key);await image.decode();if(timing)movementTiming('imageReady',{...timing,key});images.set(key,image);while(images.size>1536)images.delete(images.keys().next().value!);})().finally(()=>loading.delete(key));
  loading.set(key,promise);return promise;
 }));
}
