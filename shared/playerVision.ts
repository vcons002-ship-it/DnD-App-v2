import {lightIrradiance,lightColorCoverage} from './lightFalloff.js';
import type {MapState,Token} from './types.js';
export type VisionPoint={id:string;x:number;y:number};
export type VisionLight=VisionPoint&{radius:number;height:number;strength:number};
/** Same ground irradiance and coverage as battlefieldLighting torch-field shader. */
export function lightCoverage(distance:number,light:Pick<VisionLight,'radius'|'height'|'strength'>){
 return lightColorCoverage(lightIrradiance(Math.hypot(distance,light.height),light.radius,light.strength));
}
export type PlayerVision={rangeFt:60;radius:number;heavy:boolean;origins:VisionPoint[];lights:VisionLight[]};
/** Campaign rule: both dungeon darkness levels have a hard personal 60-foot horizon. */
export function usesDarknessVision(map:Pick<MapState,'environment'>|null|undefined){
 const e=map?.environment;return !!e?.enabled&&(e.lighting==='dungeon'||e.lighting==='night');
}
export function visionContains(vision:PlayerVision|undefined|null,x:number,y:number):boolean{
 return !vision||vision.origins.some(o=>Math.hypot(x-o.x,y-o.y)<=vision.radius+1e-6);
}
export function visionLit(vision:PlayerVision|undefined|null,x:number,y:number):boolean{
 return !vision||vision.lights.some(l=>lightCoverage(Math.hypot(x-l.x,y-l.y),l)>.10);
}
export function createPlayerVision(map:MapState|null|undefined,tokens:Token[],owned:Set<string>):PlayerVision|undefined{
 if(!usesDarknessVision(map))return undefined;
 const px=map!.gridSizePx/Math.max(.001,map!.feetPerSquare);
 const origins=tokens.filter(t=>t.kind==='pc'&&owned.has(t.refId)&&!t.isHidden).map(t=>({id:t.id,x:t.x,y:t.y}));
 const vision:PlayerVision={rangeFt:60,radius:60*px,heavy:!!map!.environment!.heavyDarkness,origins,lights:[]};
 const fog=map!.mapFogEnabled?new Set(map!.mapFogRevealed):null;
 const permitted=(x:number,y:number)=>visionContains(vision,x,y)&&(!fog||fog.has(`${Math.floor(x/map!.gridSizePx)},${Math.floor(y/map!.gridSizePx)}`));
 vision.lights=[...map!.environment!.lights.filter(l=>permitted(l.x,l.y)).map(l=>({id:l.id,x:l.x,y:l.y,radius:l.radiusFt*px,height:l.heightFt*px,strength:l.intensity})),
 ...tokens.filter(t=>t.carriedLantern&&!t.isHidden&&permitted(t.x,t.y)).map(t=>({id:t.id,x:t.x,y:t.y,radius:20*px,height:2.8*px,strength:.85}))];
 return vision;
}
