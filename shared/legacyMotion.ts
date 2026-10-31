import type {LegacyGeometry} from './legacyVision.js';
import type {RasterAsset,RasterTiles} from './serverRendering.js';
import type {StateSnapshot} from './types.js';
export type MotionPoint={x:number;y:number};
export type LegacyMotionAtlas={mask:RasterAsset;standardMask?:RasterAsset;colorBase?:RasterAsset;lightMask?:RasterAsset;terrain?:RasterAsset;base?:RasterAsset;terrainBounds?:Omit<RasterAsset,'key'>;columns:number;frameWidth:number;frameHeight:number;bounds:Omit<RasterAsset,'key'>;count:number};
export const LEGACY_MOTION_FPS=30;
export const LEGACY_MOTION_STEPS=12;
export const legacyMotionIndex=(now:number,start:number,duration:number,count:number)=>Math.max(0,Math.min(count-1,Math.floor(Math.max(0,now-start)/duration*(count-1))));
export type LegacyMotionFrame={at:number;tokenIds:string[];tokens?:StateSnapshot['tokens'];monsters?:StateSnapshot['monsters'];tokenSprites?:StateSnapshot['tokenSprites'];legacyGeometry?:LegacyGeometry|null;visionRaster?:RasterAsset|null;visionTiles?:RasterTiles};
/** All images are decoded before playback. The final snapshot is the implicit
 * frame at 1. Intermediate creature data is shaped by the normal server
 * visibility boundary, including figures absent at both endpoints. */
export type LegacyMotion={id:string;durationMs:number;moves:Record<string,{from:MotionPoint;to:MotionPoint}>;frames:LegacyMotionFrame[];atlas?:LegacyMotionAtlas};
export type LegacyPlayback={id:string;start:number;durationMs:number;moves:LegacyMotion['moves'];atlas?:LegacyMotionAtlas};
