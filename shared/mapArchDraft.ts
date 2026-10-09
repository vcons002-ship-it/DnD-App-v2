import type {MapFeatureCheck} from './mapFeatureGate.js';
import type {MapGeometryDraft} from './mapGeometryDraft.js';
import type {MapWall} from './mapWalls.js';
import {cutArchOpening} from './archGeometry.js';
import {wallContours} from './wallGeometry.js';

export type MapArchDraft={version:1;id:string;source:MapGeometryDraft['source'];maskImagePath:string;qwenChecks?:MapFeatureCheck[];arches:MapWall[];uncertain?:MapWall[]};
export function fitArch(marker:MapWall,walls:readonly MapWall[]):{wall?:MapWall;issue?:string}{
 if(walls.some(w=>w.arch&&Math.hypot((w.ax+w.bx-marker.ax-marker.bx)/2,(w.ay+w.by-marker.ay-marker.by)/2)<Math.min(marker.bx-marker.ax,marker.by-marker.ay)))return {issue:'An arch already exists here.'};
 const solids=walls.filter(w=>!w.door&&!w.window&&!w.arch);
 try{
  const cut=cutArchOpening(solids,marker);
  if(JSON.stringify(cut.map(w=>wallContours(w)))===JSON.stringify(solids.map(w=>wallContours(w))))return {issue:'No wall crosses this arch. Add or adjust the walls first.'};
  return {wall:{...marker,arch:true}};
 }catch{return {issue:'This arch could not be fitted safely. Adjust the footprint or walls.'};}
}
