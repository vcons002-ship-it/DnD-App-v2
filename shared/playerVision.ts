import {CARRIED_LANTERN_LIGHT_HEIGHT_FT} from './lightFalloff.js';
import {lightIrradiance,lightColorCoverage,spellEmissionIrradiance} from './lightFalloff.js';
import {tokenVisibleAt} from './fog.js';
import {hasLineOfSight,type MapWall} from './mapWalls.js';
import type {MapState,Token} from './types.js';
export type VisionPoint={id:string;x:number;y:number};
export type VisionLight=VisionPoint&{radius:number;height:number;strength:number;transient?:boolean};
/** Same ground irradiance and coverage as battlefieldLighting torch-field shader. */
export function lightCoverage(distance:number,light:Pick<VisionLight,'radius'|'height'|'strength'|'transient'>){
 return lightColorCoverage((light.transient?spellEmissionIrradiance:lightIrradiance)(Math.hypot(distance,light.height),light.radius,light.strength));
}
export type PlayerVision={rangeFt:60;radius:number;heavy:boolean;origins:VisionPoint[];lights:VisionLight[];walls?:MapWall[];daylight?:boolean};
/** Map cover also conceals creatures on unseen terrain. Painted cover is separate. */
export const usesMapVision=(map:Pick<MapState,'mapVisionEnabled'>|null|undefined)=>map?.mapVisionEnabled!==false;
export const usesTokenVision=(map:Pick<MapState,'mapVisionEnabled'|'tokenVisionEnabled'>|null|undefined)=>usesMapVision(map)||map?.tokenVisionEnabled!==false;
/** Campaign rule: 60 feet reveals unlit darkness; unobscured illuminated areas remain visible at any distance. */
export function usesDarknessVision(map:Pick<MapState,'environment'>|null|undefined){
 const e=map?.environment;return !!e?.enabled&&(e.lighting==='dungeon'||e.lighting==='night');
}
export function visionContains(vision:PlayerVision|undefined|null,x:number,y:number):boolean{
 if(!vision)return true;
 const point={x,y};
 const visibleOrigins=vision.origins.filter(o=>hasLineOfSight(o,point,vision.walls));
 return visibleOrigins.length>0&&(!!vision.daylight||visibleOrigins.some(o=>Math.hypot(x-o.x,y-o.y)<=vision.radius+1e-6)||visionLit(vision,x,y));
}
export function visionLit(vision:PlayerVision|undefined|null,x:number,y:number):boolean{
 return !vision||!!vision.daylight||vision.lights.some(l=>lightCoverage(Math.hypot(x-l.x,y-l.y),l)>.10&&hasLineOfSight(l,{x,y},vision.walls));
}
export function createPlayerVision(map:MapState|null|undefined,tokens:Token[],owned:Set<string>,lightTokenAllowed?:(token:Token)=>boolean):PlayerVision|undefined{
 if(!map||(!usesDarknessVision(map)&&!map.walls?.length))return undefined;
 const px=map!.gridSizePx/Math.max(.001,map!.feetPerSquare);
 const origins=tokens.filter(t=>t.kind==='pc'&&owned.has(t.refId)&&!t.isHidden).map(t=>({id:t.id,x:t.x,y:t.y}));
 const darkness=usesDarknessVision(map);
 const vision:PlayerVision={rangeFt:60,radius:60*px,heavy:darkness&&!!map.environment?.heavyDarkness,origins,lights:[],walls:map.walls,daylight:!darkness};
 const fog=map!.mapFogEnabled?new Set(map!.mapFogRevealed):null;
 const permitted=(x:number,y:number)=>origins.length>0&&(!fog||fog.has(`${Math.floor(x/map!.gridSizePx)},${Math.floor(y/map!.gridSizePx)}`));
 const tokenFog=map!.tokenFogEnabled?new Set(map!.tokenFogRevealed):null;
 const sourceVisible=lightTokenAllowed??((t:Token)=>tokenVisibleAt({role:'player',hidden:t.isHidden,owned:t.kind==='pc'&&owned.has(t.refId),foe:t.kind==='monster',mapFog:fog,tokenFog,grid:map!.gridSizePx,x:t.x,y:t.y}));
 vision.lights=[...(map.environment?.enabled?map.environment.lights:[]).filter(l=>permitted(l.x,l.y)).map(l=>({id:l.id,x:l.x,y:l.y,radius:l.radiusFt*px,height:l.heightFt*px,strength:l.intensity})),
 ...tokens.filter(t=>t.carriedLantern&&!t.isHidden&&permitted(t.x,t.y)&&sourceVisible(t)&&origins.some(o=>hasLineOfSight(o,t,map.walls))).map(t=>({id:t.id,x:t.x,y:t.y,radius:20*px,height:CARRIED_LANTERN_LIGHT_HEIGHT_FT*px,strength:.85}))];
 return vision;
}
