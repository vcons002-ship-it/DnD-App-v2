import type {MapGeometryDraft} from './mapGeometryDraft.js';
import type {MapWall,WallPoint} from './mapWalls.js';

export type DoorMarker = {id:string;ax:number;ay:number;bx:number;by:number;thickness:number;footprint?:WallPoint[]};
export type MapDoorDraft = {
  version:1;
  id:string;
  source:MapGeometryDraft['source'];
  maskImagePath:string;
  doors:(DoorMarker&{wall?:MapWall;extensions?:MapWall[];issue?:string})[];
};
