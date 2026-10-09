import clipping from 'polygon-clipping';
import type {MapWall} from './mapWalls.js';
import {wallContours} from './wallGeometry.js';
import {cutPolygonDoor,polygonWall} from './wallPolygonDoor.js';

/** Keep the outer 15% at either end of the accepted arch footprint out of the
 * normal doorway cut. The full footprint still supplies the artwork overlay. */
export function cutArchOpening(walls:readonly MapWall[],arch:MapWall):MapWall[] {
 const horizontal=arch.bx-arch.ax>=arch.by-arch.ay;
 const length=horizontal?arch.bx-arch.ax:arch.by-arch.ay,inset=length*.15;
 const bounds={ax:arch.ax+(horizontal?inset:0),ay:arch.ay+(horizontal?0:inset),bx:arch.bx-(horizontal?inset:0),by:arch.by-(horizontal?0:inset)};
 const footprint=wallContours(arch).map(r=>r.map(p=>[p.x,p.y] as [number,number]));
 const cx=(arch.ax+arch.bx)/2,cy=(arch.ay+arch.by)/2,angle=(arch.rotation??0)*Math.PI/180;
 const rotate=(x:number,y:number):[number,number]=>[cx+(x-cx)*Math.cos(angle)-(y-cy)*Math.sin(angle),cy+(x-cx)*Math.sin(angle)+(y-cy)*Math.cos(angle)];
 const band:clipping.Polygon=[[rotate(bounds.ax,bounds.ay),rotate(bounds.bx,bounds.ay),rotate(bounds.bx,bounds.by),rotate(bounds.ax,bounds.by)]];
 const cut=clipping.intersection(footprint,band);
 const a=rotate(horizontal?bounds.ax:cx,horizontal?cy:bounds.ay),b=rotate(horizontal?bounds.bx:cx,horizontal?cy:bounds.by);
 return walls.flatMap(w=>{
  if(w.door||w.window||w.arch)return [w];
  const source=wallContours(w).map(r=>r.map(p=>[p.x,p.y] as [number,number]));
  if(!cut.length||!clipping.intersection(source,cut).length)return [w];
  const split=cutPolygonDoor(w,{wallId:w.id,id:w.id.slice(0,42)+'-arch-'+arch.id.slice(-12),ax:a[0],ay:a[1],bx:b[0],by:b[1]});
  if(split)return split.filter(p=>!p.door);
  return clipping.difference(source,...cut).map((poly,i)=>polygonWall(i?w.id.slice(0,60)+'-arch-part-'+i:w.id,poly.map(r=>r.slice(0,-1).map(([x,y])=>({x,y})))));
 });
}

const cache=new WeakMap<readonly MapWall[],MapWall[]>();
/** Arch overlays keep the original walls editable. Removing an arch restores
 * blocking immediately; no destructive wall edits or door tokens are needed. */
export function passageWalls(walls:readonly MapWall[]):readonly MapWall[]{
 const arches=walls.filter(w=>w.arch);if(!arches.length)return walls;
 const previous=cache.get(walls);if(previous)return previous;
 let result=walls.filter(w=>!w.arch);
 for(const arch of arches)try{result=cutArchOpening(result,arch);}catch{/* Invalid cuts stay blocked. */}
 cache.set(walls,result);return result;
}
