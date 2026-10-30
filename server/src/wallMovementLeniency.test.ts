import {describe,it,expect} from 'vitest';
import {resolveWallMovement,stopAtWalls,wallCollisionRadiusFt,hasLineOfSight,type MapWall,type WallPoint} from '../../shared/mapWalls.js';
import {movementPreview} from '../../shared/movementPreview.js';
import {createSession,createMap,createCharacter,createToken,getMap,moveToken,wallLimitedMove} from './sessions.js';
import {editMapWalls} from './mapWalls.js';

const jambs:MapWall[]=[{id:'top',ax:100,ay:-200,bx:100,by:-13},{id:'bottom',ax:100,ay:13,bx:100,by:200}];
const start={x:0,y:0},end={x:200,y:12};
const radius=wallCollisionRadiusFt(5)*10;
const rotate=(p:WallPoint,a:number)=>({x:p.x*Math.cos(a)-p.y*Math.sin(a),y:p.x*Math.sin(a)+p.y*Math.cos(a)});

describe('forgiving wall movement',()=>{
 it.each([0,.4,1.2,2.8])('corrects an off-center doorway drag without crossing its jambs, rotated %s radians',angle=>{
  const walls=jambs.map(w=>{const a=rotate({x:w.ax,y:w.ay},angle),b=rotate({x:w.bx,y:w.by},angle);return {...w,ax:a.x,ay:a.y,bx:b.x,by:b.y};});
  const from=rotate(start,angle),to=rotate(end,angle),strict=stopAtWalls(from,to,radius,walls),result=resolveWallMovement(from,to,radius,walls);
  expect(Math.hypot(strict.x-to.x,strict.y-to.y)).toBeGreaterThan(50);
  expect(Math.hypot(result.x-to.x,result.y-to.y)).toBeLessThanOrEqual(radius+.021);
  expect(stopAtWalls(from,result,radius,walls)).toEqual(result);
 });
 it('lets a slightly off-center pointer finish a narrow hallway',()=>{
  const walls:MapWall[]=[{id:'north',ax:-100,ay:-13,bx:500,by:-13},{id:'south',ax:-100,ay:13,bx:500,by:13}],to={x:300,y:9};
  const result=resolveWallMovement(start,to,radius,walls);
  expect(result.x).toBeGreaterThan(290);expect(Math.abs(result.y)).toBeLessThan(3);
  expect(stopAtWalls(start,result,radius,walls)).toEqual(result);
 });
 it('clears a grazing thick-wall corner with a small aim correction',()=>{
  const walls:MapWall[]=[{id:'corner',kind:'rectangle',ax:100,ay:100,bx:120,by:200}],from={x:0,y:50},to={x:200,y:120};
  expect(stopAtWalls(from,to,radius,walls).x).toBeLessThan(120);
  const result=resolveWallMovement(from,to,radius,walls);
  expect(result.x).toBeGreaterThan(190);expect(Math.hypot(result.x-to.x,result.y-to.y)).toBeLessThanOrEqual(radius+.021);
  expect(stopAtWalls(from,result,radius,walls)).toEqual(result);
 });
 it('preserves exact unobstructed destinations and does not squeeze larger bodies through small gaps',()=>{
  expect(resolveWallMovement(start,{x:200,y:0},radius,jambs)).toEqual({x:200,y:0});
  expect(resolveWallMovement(start,end,wallCollisionRadiusFt(10)*10,jambs).x).toBeLessThan(100);
 });
 it('lets a token placed in wall clearance move away, but not deeper into the wall or along an undersized corridor',()=>{
  const wall:MapWall={id:'wall',kind:'rectangle',ax:100,ay:-200,bx:120,by:200},from={x:95,y:0};
  expect(resolveWallMovement(from,{x:75,y:50},radius,[wall])).toEqual({x:75,y:50});
  expect(resolveWallMovement(from,{x:98,y:50},radius,[wall]).x).toBeLessThanOrEqual(from.x);
  const corridor:MapWall[]=[{id:'north',ax:-100,ay:-8,bx:500,by:-8},{id:'south',ax:-100,ay:8,bx:500,by:8}];
  expect(resolveWallMovement(start,{x:200,y:0},radius,corridor)).toEqual(start);
 });
 it.each([false,true])('keeps a real wall or closed door solid (door=%s), including short drags',door=>{
  const wall:MapWall={id:'closed',kind:'rectangle',ax:100,ay:-200,bx:120,by:200,door,open:false};
  for(const to of [{x:300,y:10},{x:105,y:0},{x:121,y:0}]){
   const result=resolveWallMovement(start,to,radius,[wall]);
   expect(result.x).toBeLessThan(100-radius);expect(result).toEqual(stopAtWalls(start,to,radius,[wall]));
  }
  expect(hasLineOfSight(start,{x:200,y:0},[wall])).toBe(false);
 });
 it('keeps door state authoritative and does not move a token out of a solid wall',()=>{
  const door:MapWall={id:'door',ax:100,ay:-13,bx:100,by:13,door:true,open:false};
  expect(resolveWallMovement(start,end,radius,[...jambs,door]).x).toBeLessThan(100);
  const open=[...jambs,{...door,open:true}],result=resolveWallMovement(start,end,radius,open);
  expect(result.x).toBeGreaterThan(190);expect(stopAtWalls(start,result,radius,open)).toEqual(result);
  const solid:MapWall={id:'solid',kind:'rectangle',ax:100,ay:-30,bx:120,by:30};
  expect(resolveWallMovement({x:110,y:0},end,radius,[solid])).toEqual({x:110,y:0});
 });
 it('uses the same safe correction for assisted previews and authoritative player commits; DM relocation stays exact',()=>{
  const session=createSession('Doorway leeway'),map=createMap(session.id,{name:'Narrow room'}),pc=createCharacter(session.id,{name:'Walker'});
  for(const wall of jambs)expect(editMapWalls(session.id,map.id,{add:wall})).toBeNull();
  const token=createToken({mapId:map.id,kind:'pc',refId:pc.id,...start}),savedMap=getMap(map.id)!;
  const preview=movementPreview({token,map:savedMap,vision:undefined,zones:[],...end,dm:false}),local=wallLimitedMove(token,end.x,end.y);
  expect({x:preview.x,y:preview.y}).toEqual(local);expect(local.x).toBeGreaterThan(190);
  const committed=moveToken(token.id,end.x,end.y,true)!;expect({x:committed.x,y:committed.y}).toEqual(local);
  expect(wallLimitedMove(token,local.x,local.y)).toEqual(local);
  const dm=movementPreview({token,map:savedMap,vision:undefined,zones:[],...end,dm:true});expect({x:dm.x,y:dm.y}).toEqual(end);
 });
});
