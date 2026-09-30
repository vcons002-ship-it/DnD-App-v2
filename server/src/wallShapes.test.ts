import {it,expect} from 'vitest';
import sharp from 'sharp';
import {fileURLToPath} from 'node:url';
import {contourWallMask} from './wallMaskContours.js';
import {sanitizeWalls,hasLineOfSight,stopAtWalls,distanceToWall,wallVisibilityPolygon,wallEdgeCount,type MapWall} from '../../shared/mapWalls.js';
import {translateWall,wallCenter,rotateWallPoint} from '../../shared/wallGeometry.js';
import {wallsFromYellowMask} from './wallMask.js';
import {editMapWalls,setWallDoor} from './mapWalls.js';
import {createSession,createMap,getMap,getToken,getMonster,setCondition} from './sessions.js';
import {cutPolygonDoor} from './wallPolygonDoor.js';

const circle:MapWall={id:'round-room',kind:'circle',ax:100,ay:100,bx:300,by:300,thickness:16};
const angled:MapWall={id:'diagonal',ax:100,ay:100,bx:300,by:300,thickness:20};
it('blocks circles at their perimeter while leaving the room interior walkable',()=>{
 expect(sanitizeWalls([circle])).toEqual([circle]);
 expect(distanceToWall({x:200,y:200},circle)).toBeGreaterThan(90);
 expect(stopAtWalls({x:160,y:200},{x:240,y:200},10,[circle])).toEqual({x:240,y:200});
 expect(stopAtWalls({x:200,y:200},{x:400,y:200},10,[circle]).x).toBeLessThan(285);
 expect(hasLineOfSight({x:200,y:200},{x:400,y:200},[circle])).toBe(false);
 expect(wallVisibilityPolygon({x:200,y:200},[circle],1000).every(p=>Math.hypot(p.x-200,p.y-200)<93)).toBe(true);
});
it('uses actual angled thickness and transformed rectangle geometry for vision and collision',()=>{
 const rect:MapWall={id:'r',kind:'rectangle',ax:60,ay:190,bx:340,by:210,rotation:45};
 for(const wall of [angled,rect]){
  expect(hasLineOfSight({x:150,y:200},{x:250,y:200},[wall])).toBe(false);
  expect(stopAtWalls({x:150,y:200},{x:250,y:200},5,[wall]).x).toBeLessThan(190);
  expect(hasLineOfSight({x:100,y:200},{x:100,y:260},[wall])).toBe(true);
 }
 const moved=translateWall(rect,400,100);
 expect(hasLineOfSight({x:550,y:300},{x:650,y:300},[moved])).toBe(false);
 expect(wallCenter(moved)).toEqual({x:600,y:300});
});
it('keeps freehand paths as a single editable solid stroke',()=>{
 const path:MapWall={id:'free',kind:'path',ax:100,ay:100,bx:300,by:300,thickness:20,points:[{x:100,y:100},{x:200,y:100},{x:250,y:200},{x:300,y:300}]};
 expect(sanitizeWalls([path])).toEqual([path]);
 expect(hasLineOfSight({x:150,y:50},{x:150,y:150},[path])).toBe(false);
 expect(hasLineOfSight({x:200,y:200},{x:300,y:200},[path])).toBe(false);
 expect(stopAtWalls({x:200,y:200},{x:300,y:200},5,[path]).x).toBeLessThan(240);
 const moved={...translateWall(path,400,0),rotation:90};
 const a=rotateWallPoint({x:550,y:50},moved),b=rotateWallPoint({x:550,y:150},moved);
 expect(hasLineOfSight(a,b,[moved])).toBe(false);
});
it('cuts doors through circular and angled walls without cutting the opposite room wall',()=>{
 for(const [wall,d,a,b] of [
  [circle,{ax:180,ay:100,bx:220,by:100},{x:200,y:200},{x:200,y:50}],
  [angled,{ax:180,ay:180,bx:220,by:220},{x:150,y:250},{x:250,y:150}],
 ] as const){
  const parts=cutPolygonDoor(wall,{...d,id:'door',wallId:wall.id})!;
  expect(parts).toBeTruthy();expect(sanitizeWalls(parts)).toEqual(parts);
  expect(hasLineOfSight(a,b,parts)).toBe(false);
  const open=parts.map(w=>w.door?{...w,open:true}:w);
  expect(hasLineOfSight(a,b,open)).toBe(true);
  expect(stopAtWalls(a,b,8,open)).toEqual(b);
  if(wall.kind==='circle')expect(hasLineOfSight(a,{x:200,y:400},open)).toBe(false);
 }
});
it('saves edits per map, keeps door metadata and moves the linked door object',()=>{
 const session=createSession('Shape edits'),map=createMap(session.id,{name:'Round room'});
 expect(editMapWalls(session.id,map.id,{add:circle})).toBeNull();
 expect(editMapWalls(session.id,map.id,{door:{wallId:circle.id,id:'door',ax:180,ay:100,bx:220,by:100}})).toBeNull();
 const door=getMap(map.id)!.walls!.find(w=>w.door)!;
 const token=getToken(door.tokenId!)!;
 setCondition('monster',token.refId,{id:'lock',label:'Locked',aura:'red',isConcentration:false});
 const moved=translateWall(door,50,40);
 expect(editMapWalls(session.id,map.id,{update:{...moved,open:true,tokenId:'fake'}})).toBeNull();
 expect(getMap(map.id)!.walls!.find(w=>w.door)).toEqual({...moved,open:false});
 expect(getToken(token.id)).toMatchObject(wallCenter(moved));
 expect(getMonster(token.refId)!.conditions.some(c=>c.label==='Locked')).toBe(true);
 expect(setWallDoor(session.id,map.id,door.id,true)).toContain('locked');
 expect(editMapWalls(createSession('Other').id,map.id,{update:circle})).toContain('not found');
 expect(editMapWalls(session.id,map.id,{update:{...moved,rotation:NaN}})).toContain('Invalid');
});
it('traces angled and circular mask walls as editable contours, preserving room holes and a narrow entrance',async()=>{
 const svg=Buffer.from('<svg width="800" height="600"><rect width="800" height="600" fill="#222"/><g stroke="#ffff00" stroke-width="16" fill="none"><circle cx="210" cy="250" r="120"/><path d="M440 100 L670 330 L540 480"/></g><rect x="201" y="116" width="18" height="30" fill="#222"/></svg>');
 const {walls,coverage}=await wallsFromYellowMask(await sharp(svg).png().toBuffer(),800,600,50);
 expect(walls.length).toBeLessThanOrEqual(3);expect(walls.every(w=>w.kind==='polygon')).toBe(true);
 expect(wallEdgeCount(walls)).toBeLessThan(220);expect(coverage).toBeGreaterThan(.97);
 expect(stopAtWalls({x:160,y:250},{x:260,y:250},10,walls)).toEqual({x:260,y:250});
 expect(hasLineOfSight({x:210,y:250},{x:210,y:80},walls)).toBe(true);
 expect(stopAtWalls({x:210,y:250},{x:210,y:80},5,walls)).toEqual({x:210,y:80});
 expect(hasLineOfSight({x:210,y:250},{x:210,y:430},walls)).toBe(false);
 expect(hasLineOfSight({x:500,y:220},{x:580,y:180},walls)).toBe(false);
});
it.each(['complexWall','complexCave','complexNatural'])('fits the dense curved %s AI-mask regression without rectangle fallback or a larger edge budget',async name=>{
 // Sanitized binary masks from the live Twisted Vaults API test. No API call or
 // campaign data is needed to reproduce the former 609-edge conversion failure.
 const {data,info}=await sharp(fileURLToPath(new URL(`./testFixtures/${name}Mask.png`,import.meta.url))).greyscale().raw().toBuffer({resolveWithObject:true});
 const gaps=await sharp(fileURLToPath(new URL(`./testFixtures/${name}Gaps.png`,import.meta.url))).greyscale().raw().toBuffer();
 const result=await contourWallMask(Uint8Array.from(data,n=>n?1:0),Uint8Array.from(gaps,n=>n?1:0),info.width,info.height);
 expect(result).not.toBeNull();const walls=result!.walls;
 expect(walls).toHaveLength(name==='complexWall'?3:name==='complexCave'?9:6);expect(walls.every(w=>w.kind==='polygon')).toBe(true);
 expect(wallEdgeCount(walls)).toBeLessThanOrEqual(512);expect(result!.coverage).toBeGreaterThanOrEqual(.96);
 expect(sanitizeWalls(walls)).toHaveLength(walls.length);
 for(const [a,b] of [[{x:315,y:140},{x:480,y:140}],[{x:265,y:476},{x:305,y:476}],[{x:315,y:263},{x:435,y:352}]]){
  expect(hasLineOfSight(a,b,walls)).toBe(true);expect(stopAtWalls(a,b,3,walls)).toEqual(b);
 }
 expect(hasLineOfSight({x:160,y:0},{x:160,y:40},walls)).toBe(false);
});
