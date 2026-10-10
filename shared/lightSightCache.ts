import {hasLineOfSight,type MapWall,type WallPoint} from './mapWalls.js';
/** One entry per source/receiver, invalidated by motion or immutable wall/door edits. */
export function createLightSightCache(){
  let walls:readonly MapWall[]|undefined;
  const entries=new Map<string,{ax:number;ay:number;bx:number;by:number;visible:boolean}>();
  let hits=0,misses=0;
  return {
    visible(id:string,a:WallPoint,b:WallPoint,next:readonly MapWall[]){
      if(walls!==next){walls=next;entries.clear();}
      const previous=entries.get(id);
      if(previous&&previous.ax===a.x&&previous.ay===a.y&&previous.bx===b.x&&previous.by===b.y){hits++;return previous.visible;}
      const visible=hasLineOfSight(a,b,next);misses++;
      if(entries.size>4096)entries.clear();
      entries.set(id,{ax:a.x,ay:a.y,bx:b.x,by:b.y,visible});return visible;
    },
    get state(){return {hits,misses};},
  };
}
