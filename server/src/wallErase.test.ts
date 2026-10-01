import {it,expect} from 'vitest';
import {eraseWallArea} from './wallErase.js';
import {editMapWalls} from './mapWalls.js';
import {createSession,createMap,getMap} from './sessions.js';
import {hasLineOfSight,stopAtWalls,sanitizeWalls,type MapWall} from '../../shared/mapWalls.js';

it('cuts an opening through a shaped wall while preserving its other sections and room interior',()=>{
 const room:MapWall={id:'room',kind:'polygon',ax:100,ay:100,bx:300,by:300,points:[{x:100,y:100},{x:300,y:100},{x:300,y:300},{x:100,y:300}],holes:[[{x:120,y:120},{x:280,y:120},{x:280,y:280},{x:120,y:280}]]};
 const walls=eraseWallArea([room],{ax:180,ay:80,bx:220,by:130});
 expect(sanitizeWalls(walls)).toHaveLength(walls.length);
 expect(hasLineOfSight({x:200,y:200},{x:200,y:50},walls)).toBe(true);
 expect(stopAtWalls({x:200,y:200},{x:200,y:50},8,walls)).toEqual({x:200,y:50});
 expect(hasLineOfSight({x:200,y:200},{x:200,y:350},walls)).toBe(false);
 expect(hasLineOfSight({x:140,y:130},{x:140,y:70},walls)).toBe(false);
 expect(stopAtWalls({x:140,y:200},{x:260,y:200},8,walls)).toEqual({x:260,y:200});
 expect(eraseWallArea(walls,{ax:220,ay:130,bx:180,by:80})).toEqual(walls);
});

it('preserves holes in circular walls and cuts transformed wall geometry in map coordinates',()=>{
 const circle:MapWall={id:'circle',kind:'circle',ax:100,ay:100,bx:300,by:300,thickness:16};
 const punctured=eraseWallArea([circle],{ax:295,ay:197,bx:302,by:203});
 expect(punctured[0].holes).toHaveLength(2); // Original room plus a notch wholly inside its ring.
 expect(stopAtWalls({x:150,y:200},{x:250,y:200},8,punctured)).toEqual({x:250,y:200});
 const rect:MapWall={id:'rotated',kind:'rectangle',ax:100,ay:190,bx:300,by:210,rotation:45};
 const parts=eraseWallArea([rect],{ax:180,ay:180,bx:220,by:220});
 expect(parts).toHaveLength(2);expect(sanitizeWalls(parts)).toHaveLength(2);
 expect(hasLineOfSight({x:180,y:220},{x:220,y:180},parts)).toBe(true);
 expect(hasLineOfSight({x:130,y:170},{x:170,y:130},parts)).toBe(false);
});

it('cuts old zero-thickness lines, supports reverse drags, and keeps unaffected walls and doors',()=>{
 const line:MapWall={id:'line',ax:100,ay:0,bx:100,by:300};
 const untouched:MapWall={id:'far',kind:'rectangle',ax:600,ay:200,bx:620,by:300};
 const door:MapWall={id:'door',kind:'rectangle',ax:90,ay:140,bx:110,by:160,door:true,open:false,tokenId:'door-token'};
 const area={ax:120,ay:180,bx:80,by:120},parts=eraseWallArea([line,untouched,door],area);
 expect(parts).toHaveLength(4);expect(parts[2]).toBe(untouched);expect(parts[3]).toBe(door);
 expect(hasLineOfSight({x:50,y:125},{x:150,y:125},parts)).toBe(true);
 expect(hasLineOfSight({x:50,y:150},{x:150,y:150},parts)).toBe(false);
 expect(hasLineOfSight({x:50,y:50},{x:150,y:50},parts)).toBe(false);
 expect(eraseWallArea([line],{ax:0,ay:100,bx:80,by:150})).toEqual([line]);
});

it('persists partial erasing only in the owning campaign and leaves invalid edits untouched',()=>{
 const session=createSession('Erase sections'),map=createMap(session.id,{name:'Mask walls'});
 const wall:MapWall={id:'wall',kind:'rectangle',ax:100,ay:0,bx:120,by:300};
 expect(editMapWalls(session.id,map.id,{add:wall})).toBeNull();
 const area={ax:80,ay:100,bx:140,by:150};
 expect(editMapWalls(createSession('Other').id,map.id,{eraseArea:area})).toContain('not found');
 expect(editMapWalls(session.id,map.id,{eraseArea:{...area,ax:NaN}})).toContain('Invalid');
 expect(getMap(map.id)!.walls).toEqual([wall]);
 expect(editMapWalls(session.id,map.id,{eraseArea:area})).toBeNull();
 const next=getMap(map.id)!.walls!;expect(next).toHaveLength(2);
 expect(hasLineOfSight({x:50,y:125},{x:150,y:125},next)).toBe(true);
 expect(hasLineOfSight({x:50,y:250},{x:150,y:250},next)).toBe(false);
});

it('rejects a cut that exceeds the edge budget atomically',()=>{
 const session=createSession('Wall detail cap'),map=createMap(session.id,{name:'Many walls'});
 for(let i=0;i<128;i++)expect(editMapWalls(session.id,map.id,{add:{id:'r-'+i,kind:'rectangle',ax:i*100,ay:0,bx:i*100+20,by:100}})).toBeNull();
 const before=getMap(map.id)!.walls;
 expect(editMapWalls(session.id,map.id,{eraseArea:{ax:-10,ay:40,bx:30,by:60}})).toContain('too much boundary detail');
 expect(getMap(map.id)!.walls).toEqual(before);
});
