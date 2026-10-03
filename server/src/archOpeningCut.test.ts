import {it,expect} from 'vitest';
import {cutArchOpening} from './archOpeningCut.js';
import {hasLineOfSight,stopAtWalls,sanitizeWalls,type MapWall} from '../../shared/mapWalls.js';
it.each([false,true])('opens the center and preserves both end supports, vertical=%s',vertical=>{
 const point=(x:number,y:number)=>vertical?{x:y,y:x}:{x,y};
 const wall:MapWall={id:'wall',kind:'rectangle',...{ax:vertical?100:50,ay:vertical?50:100,bx:vertical?135:350,by:vertical?350:135}};
 const arch:MapWall={id:'arch',kind:'rectangle',...{ax:100,ay:100,bx:vertical?135:180,by:vertical?180:135}};
 const walls=cutArchOpening([wall],arch);
 expect(sanitizeWalls(walls)).toHaveLength(walls.length);
 expect(hasLineOfSight(point(140,70),point(140,160),walls)).toBe(true);
 expect(stopAtWalls(point(140,70),point(140,160),11.2,walls)).toEqual(point(140,160));
 for(const x of [105,175]){
  expect(hasLineOfSight(point(x,70),point(x,160),walls)).toBe(false);
  expect(stopAtWalls(point(x,70),point(x,160),11.2,walls)).not.toEqual(point(x,160));
 }
 expect(hasLineOfSight(point(255,70),point(255,160),walls)).toBe(false);
 expect(walls.some(w=>w.door)).toBe(false);
});
it('does not alter other walls or the full arch artwork footprint',()=>{
 const wall:MapWall={id:'other',kind:'rectangle',ax:250,ay:100,bx:350,by:135};
 const arch:MapWall={id:'arch',kind:'rectangle',ax:100,ay:100,bx:180,by:135},copy={...arch};
 expect(cutArchOpening([wall],arch)).toEqual([wall]);expect(arch).toEqual(copy);
});
