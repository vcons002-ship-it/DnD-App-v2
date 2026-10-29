import {createHash} from 'node:crypto';
import type {StateSnapshot} from '../../shared/types.js';
import type {RasterTiles} from '../../shared/serverRendering.js';
import {usesMapVision} from '../../shared/playerVision.js';
import {legacyMaskSvg} from '../../shared/legacyMaskSvg.js';
import {visibilityWorkers} from './visibilityWorkers.js';
import {grantRenderTile} from './renderAssets.js';
import type {MovementFrameTiming} from '../../shared/movementTiming.js';
/** Fixed map resolution/grid keeps existing tile coordinates stable while sight moves. */
export async function visionTiles(id:string,s:StateSnapshot,size:{width:number;height:number},timing?:MovementFrameTiming,graded=false):Promise<RasterTiles|undefined>{
 const v=s.playerVision,g=s.legacyGeometry;if(!s.map||!v||!g)return;
 const scale=Math.min(1,2048/Math.max(size.width,size.height)),tileSize=512,worldTile=tileSize/scale;
 const images=s.mapImages??[];
 const left=Math.min(0,...images.map(i=>i.x),...v.origins.map(o=>o.x-v.radius)),top=Math.min(0,...images.map(i=>i.y),...v.origins.map(o=>o.y-v.radius));
 const right=Math.max(size.width,...images.map(i=>i.x+i.w),...v.origins.map(o=>o.x+v.radius)),bottom=Math.max(size.height,...images.map(i=>i.y+i.h),...v.origins.map(o=>o.y+v.radius));
 const col=Math.floor(left/worldTile),row=Math.floor(top/worldTile),x=col*worldTile,y=row*worldTile;
 const width=Math.max(tileSize,(Math.ceil(right/worldTile)-col)*tileSize),height=Math.max(tileSize,(Math.ceil(bottom/worldTile)-row)*tileSize);
 // Sparse or enormous off-map extents retain the bounded single-mask fallback.
 if(width*height>8_000_000)return;
 const options={width,height,x,y,scale,heavy:v.heavy,daylight:!!v.daylight,wallFog:usesMapVision(s.map),keepRevealed:s.map.explorationMode==='revealed',graded};
 const result=await visibilityWorkers.run({maskTiles:{svg:legacyMaskSvg(g,options),width,height,tileSize}},timing?span=>timing.workers.push(span):undefined);
 const tiles:RasterTiles['tiles']={};
 for(const t of result.tiles){
  grantRenderTile(id,t.key,t.buffer);
  tiles[`${col+t.x/tileSize}:${row+t.y/tileSize}`]={key:t.key,x:x+t.x/scale,y:y+t.y/scale,width:t.width,height:t.height,scale};
 }
 const bounds={width,height,x,y,scale},key=createHash('sha256').update(JSON.stringify([bounds,Object.entries(tiles).map(([id,t])=>[id,t.key])])).digest('hex');
 return {key,bounds,tiles};
}
