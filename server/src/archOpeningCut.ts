import clipping from 'polygon-clipping';
import type {MapWall} from '../../shared/mapWalls.js';
import {wallContours} from '../../shared/wallGeometry.js';
import {cutPolygonDoor,polygonWall} from './wallPolygonDoor.js';

/** Keep the outer 15% at either end of the accepted arch footprint out of the
 * normal doorway cut. The full footprint still supplies the artwork overlay. */
export function cutArchOpening(walls:readonly MapWall[],arch:MapWall):MapWall[] {
 const horizontal=arch.bx-arch.ax>=arch.by-arch.ay;
 const length=horizontal?arch.bx-arch.ax:arch.by-arch.ay,inset=length*.15;
 const bounds={ax:arch.ax+(horizontal?inset:0),ay:arch.ay+(horizontal?0:inset),bx:arch.bx-(horizontal?inset:0),by:arch.by-(horizontal?0:inset)};
 const footprint=wallContours(arch).map(r=>r.map(p=>[p.x,p.y] as [number,number]));
 const band:clipping.Polygon=[[[bounds.ax,bounds.ay],[bounds.bx,bounds.ay],[bounds.bx,bounds.by],[bounds.ax,bounds.by]]];
 const cut=clipping.intersection(footprint,band);
 const cx=(arch.ax+arch.bx)/2,cy=(arch.ay+arch.by)/2;
 return walls.flatMap(w=>{
  if(w.door)return [w];
  const source=wallContours(w).map(r=>r.map(p=>[p.x,p.y] as [number,number]));
  if(!cut.length||!clipping.intersection(source,cut).length)return [w];
  const split=cutPolygonDoor(w,{wallId:w.id,id:arch.id+'-'+w.id,ax:horizontal?bounds.ax:cx,ay:horizontal?cy:bounds.ay,bx:horizontal?bounds.bx:cx,by:horizontal?cy:bounds.by});
  if(split)return split.filter(p=>!p.door);
  return clipping.difference(source,...cut).map((poly,i)=>polygonWall(i?w.id+'-arch-part-'+i:w.id,poly.map(r=>r.slice(0,-1).map(([x,y])=>({x,y})))));
 });
}
