import type {LegacyGeometry} from './legacyVision.js';
import type {RasterAsset,RasterTiles} from './serverRendering.js';
import type {StateSnapshot} from './types.js';
export type MotionPoint={x:number;y:number};
export type LegacyMotionAtlas={mask:RasterAsset;terrain?:RasterAsset;base?:RasterAsset;terrainBounds?:Omit<RasterAsset,'key'>;columns:number;frameWidth:number;frameHeight:number;bounds:Omit<RasterAsset,'key'>;count:number};
export const LEGACY_MOTION_FPS=30;
export const LEGACY_MOTION_STEPS=12;
export const legacyMotionIndex=(now:number,start:number,duration:number,count:number)=>Math.max(0,Math.min(count-1,Math.floor(Math.max(0,now-start)/duration*(count-1))));
export type LegacyMotionFrame={at:number;tokenIds:string[];tokens?:StateSnapshot['tokens'];monsters?:StateSnapshot['monsters'];tokenRefs?:number[];monsterRefs?:number[];tokenSprites?:StateSnapshot['tokenSprites'];legacyGeometry?:LegacyGeometry|null;visionRaster?:RasterAsset|null;visionTiles?:RasterTiles};
/** All images are decoded before playback. The final snapshot is the implicit
 * frame at 1. Intermediate creature data is shaped by the normal server
 * visibility boundary, including figures absent at both endpoints.
 * membershipOnly omits rendered geometry/images: clients keep smooth local
 * sight and body animation on the same clock as authorized membership. */
export type LegacyMotion={membershipOnly?:boolean;id:string;durationMs:number;moves:Record<string,{from:MotionPoint;to:MotionPoint}>;frames:LegacyMotionFrame[];entities?:{tokens:StateSnapshot['tokens'];monsters:StateSnapshot['monsters']};atlas?:LegacyMotionAtlas};
export type LegacyPlayback={id:string;start:number;durationMs:number;moves:LegacyMotion['moves'];atlas?:LegacyMotionAtlas;frames?:(LegacyGeometry|null|undefined)[]};

const compactPlans=new WeakMap<LegacyMotion,LegacyMotion>();
/** Only negotiated clients receive references. Intern complete authorized record
 * values, not IDs: the same creature can have different appearances along a walk.
 * Keep every frame's membership and timing unchanged. */
export function compactMotionEntities(plan:LegacyMotion):LegacyMotion{
 if(plan.entities)return plan;
 const cached=compactPlans.get(plan);if(cached)return cached;
 const entities:NonNullable<LegacyMotion['entities']>={tokens:[],monsters:[]};
 const tokenKeys=new Map<string,number>(),monsterKeys=new Map<string,number>();
 const intern=<T>(values:T[]|undefined,pool:T[],keys:Map<string,number>)=>values?.map(value=>{
  const key=JSON.stringify(value),existing=keys.get(key);if(existing!==undefined)return existing;
  const index=pool.length;pool.push(value);keys.set(key,index);return index;
 });
 const frames=plan.frames.map(({tokens,monsters,...frame})=>({...frame,
  tokenRefs:intern(tokens,entities.tokens,tokenKeys),monsterRefs:intern(monsters,entities.monsters,monsterKeys)}));
 const compact={...plan,frames,entities};compactPlans.set(plan,compact);return compact;
}
export const motionFrameTokens=(plan:LegacyMotion,frame:LegacyMotionFrame)=>frame.tokenRefs?.flatMap(i=>plan.entities?.tokens[i]?[plan.entities.tokens[i]]:[])??frame.tokens??[];
export const motionFrameMonsters=(plan:LegacyMotion,frame:LegacyMotionFrame)=>frame.monsterRefs?.flatMap(i=>plan.entities?.monsters[i]?[plan.entities.monsters[i]]:[])??frame.monsters??[];
