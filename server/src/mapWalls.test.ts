import {captureTokenDelete,popUndo} from './undo.js';
import {describe,it,expect} from 'vitest';
import {cutDoor,wallCollisionRadiusFt,stopAtWalls,hasLineOfSight,sanitizeWalls,wallVisibilityPolygon,wallEdgeCount,distanceToWall,type MapWall} from '../../shared/mapWalls.js';
import {visionContains,visionLit} from '../../shared/playerVision.js';
import {editMapWalls,setWallDoor} from './mapWalls.js';
import {createSession,createMap,createCharacter,claimCharacter,createToken,createMonsterTemplate,instantiateMonster,setActiveMap,updateMapEnvironment,deleteToken,getToken,getMonster,setCondition,clearCondition,getMap,getSessionByCode,listMaps,moveToken,setTokenHidden,setFogLayer,setFogRevealed} from './sessions.js';
import {buildSnapshot} from './visibility.js';
import {exportSession,importSession} from './backup.js';
import {db} from './db.js';

const wall:MapWall={id:'partition',ax:700,ay:-1000,bx:700,by:2000};
function fixture(){
 const session=createSession('Wall test'),map=createMap(session.id,{name:'Two rooms'});
 const a=createCharacter(session.id,{name:'West'}),b=createCharacter(session.id,{name:'East'});
 claimCharacter(a.id,'west');claimCharacter(b.id,'east');
 const west=createToken({mapId:map.id,kind:'pc',refId:a.id,x:500,y:400});
 const east=createToken({mapId:map.id,kind:'pc',refId:b.id,x:900,y:400});
 const template=createMonsterTemplate(session.id,{name:'Goblin',maxHp:7});
 const enemy=createToken({mapId:map.id,kind:'monster',refId:instantiateMonster(template.id)!.id,x:850,y:500});
 editMapWalls(session.id,map.id,{add:wall});
 updateMapEnvironment(session.id,map.id,{enabled:true,lighting:'dungeon',heavyDarkness:true,mist:false});
 setActiveMap(session.id,map.id);
 return {session,map,west,east,enemy};
}
describe('wall geometry',()=>{
 it('blocks the complete thickness and all sides of a rectangle, including its interior',()=>{
  const rect:MapWall={id:'thick',kind:'rectangle',ax:100,ay:100,bx:140,by:300};
  expect(wallEdgeCount([rect])).toBe(4);
  for(const [a,b] of [[{x:50,y:200},{x:200,y:200}],[{x:200,y:200},{x:50,y:200}],[{x:120,y:50},{x:120,y:400}],[{x:110,y:200},{x:130,y:200}]])expect(hasLineOfSight(a,b,[rect])).toBe(false);
  expect(hasLineOfSight({x:50,y:50},{x:200,y:50},[rect])).toBe(true);
  expect(distanceToWall({x:120,y:200},rect)).toBe(0);
  expect(distanceToWall({x:80,y:200},rect)).toBe(20);
  expect(wallVisibilityPolygon({x:120,y:200},[rect],400).every(p=>p.x===120&&p.y===200)).toBe(true);
  expect(sanitizeWalls([{...rect,bx:100}])).toEqual([]);
 });
 it('retains reverse drags and treats rectangular walls as one saved undo/erase operation',()=>{
  const f=fixture(),rect:MapWall={id:'rectangle',kind:'rectangle',ax:700,ay:600,bx:650,by:100};
  expect(editMapWalls(f.session.id,f.map.id,{add:rect})).toBeNull();
  expect(getMap(f.map.id)!.walls).toEqual([wall,rect]);
  const restored=importSession(exportSession(f.session.code)!);
  expect(listMaps(getSessionByCode(restored.code)!.id)[0].walls).toEqual([wall,rect]);
  expect(hasLineOfSight({x:600,y:300},{x:800,y:300},[rect])).toBe(false);
  expect(editMapWalls(f.session.id,f.map.id,{removeId:rect.id})).toBeNull();
  expect(getMap(f.map.id)!.walls).toEqual([wall]);
 });
 it('blocks crossings and exact corners but leaves doorway rays and parallel rays open',()=>{
  expect(hasLineOfSight({x:500,y:400},{x:900,y:400},[wall])).toBe(false);
  expect(hasLineOfSight({x:500,y:400},{x:500,y:1000},[wall])).toBe(true);
  const door=[{...wall,by:350},{...wall,id:'lower',ay:450}];
  expect(hasLineOfSight({x:500,y:400},{x:900,y:400},door)).toBe(true);
  expect(hasLineOfSight({x:500,y:350},{x:900,y:350},door)).toBe(false);
  expect(hasLineOfSight({x:700,y:-1100},{x:700,y:400},[wall])).toBe(false);
 });
 it('clips the rendered polygon to the same opaque partition and preserves a narrow gap',()=>{
  const p=wallVisibilityPolygon({x:500,y:400},[wall],800);
  expect(p.every(v=>v.x<=700+1e-5)).toBe(true);
  const door=[{...wall,by:399},{...wall,id:'lower',ay:401}];
  const open=wallVisibilityPolygon({x:500,y:400},door,800);
  expect(open.some(p=>p.x>1200&&Math.abs(p.y-400)<1)).toBe(true);
 });
 it('rejects malformed, duplicate and unbounded segments',()=>{
  expect(sanitizeWalls([wall,wall,{...wall,id:'bad',ax:NaN},{...wall,id:'big',by:Infinity},{...wall,id:'zero',bx:wall.ax,by:wall.ay},null])).toEqual([wall]);
 });
 it('keeps the visible corner formed by crossing diagonal strokes',()=>{
  const crossing=[{id:'one',ax:100,ay:-60,bx:300,by:140},{id:'two',ax:100,ay:140,bx:300,by:-60}];
  const polygon=wallVisibilityPolygon({x:0,y:0},crossing,500);
  expect(polygon.some(p=>Math.hypot(p.x-200,p.y-40)<1e-5)).toBe(true);
 });
});
describe('saved personal wall visibility',()=>{
 it('persists idempotently per map and campaign, including backup/restore and old saves',()=>{
  const f=fixture(),other=createSession('Other'),second=createMap(f.session.id,{name:'Other map'});
  expect(editMapWalls(other.id,f.map.id,{removeId:wall.id})).toBeTruthy();
  expect(editMapWalls(f.session.id,f.map.id,{add:wall})).toBeNull();
  expect(getMap(f.map.id)!.walls).toEqual([wall]);expect(getMap(second.id)!.walls).toEqual([]);
  const bundle=exportSession(f.session.code)!;
  const restored=importSession(bundle);const imported=getSessionByCode(restored.code)!;
  expect(listMaps(imported.id).find(m=>m.name==='Two rooms')!.walls).toEqual([wall]);
  for(const map of bundle.maps)delete map.walls;
  const legacy=importSession(bundle);
  expect(listMaps(getSessionByCode(legacy.code)!.id).every(m=>m.walls?.length===0)).toBe(true);
 });
 it('uses personal sight in both darkness levels, daylight and with effects disabled',()=>{
  const f=fixture();
  for(const settings of [{heavyDarkness:true},{heavyDarkness:false},{lighting:'day' as const},{enabled:false}]){
   updateMapEnvironment(f.session.id,f.map.id,settings);
   const west=buildSnapshot(f.session.id,'player',null,'west')!,east=buildSnapshot(f.session.id,'player',null,'east')!;
   expect(west.tokens.some(t=>t.id===f.enemy.id)).toBe(false);
   expect(west.monsters.some(m=>m.id===f.enemy.refId)).toBe(false);
   expect(east.tokens.some(t=>t.id===f.enemy.id)).toBe(true);
   expect(visionContains(west.playerVision,850,500)).toBe(false);
   expect(buildSnapshot(f.session.id,'dm',f.map.id)!.tokens).toHaveLength(3);
  }
 });
 it('blocks torch illumination through a wall, even inside darkvision range',()=>{
  const f=fixture();
  updateMapEnvironment(f.session.id,f.map.id,{lights:[{id:'lamp',x:650,y:500,radiusFt:30,heightFt:4,intensity:1,color:'warm',flicker:false}]});
  const east=buildSnapshot(f.session.id,'player',null,'east')!;
  expect(visionContains(east.playerVision,850,500)).toBe(true);
  expect(visionLit(east.playerVision,850,500)).toBe(false);
  expect(visionLit(east.playerVision,600,500)).toBe(true);
  expect(visionContains(east.playerVision,600,500)).toBe(false);
  editMapWalls(f.session.id,f.map.id,{removeId:wall.id});
  expect(visionLit(buildSnapshot(f.session.id,'player',null,'east')!.playerVision,850,500)).toBe(true);
 });
 it('does not expose an unseen carrier through the light payload',()=>{
  const f=fixture();db.prepare('UPDATE tokens SET carried_lantern = 1 WHERE id = ?').run(f.enemy.id);
  const west=buildSnapshot(f.session.id,'player',null,'west')!;
  expect(west.tokens.some(t=>t.id===f.enemy.id)).toBe(false);
  expect(west.playerVision!.lights.some(l=>l.id===f.enemy.id)).toBe(false);
  expect(buildSnapshot(f.session.id,'player',null,'east')!.playerVision!.lights.some(l=>l.id===f.enemy.id)).toBe(true);
 });
 it('reveals through a gap and hides again after moving behind its side, preserving fog and hidden rules',()=>{
  const f=fixture();editMapWalls(f.session.id,f.map.id,{removeId:wall.id});
  editMapWalls(f.session.id,f.map.id,{add:{...wall,by:380}});editMapWalls(f.session.id,f.map.id,{add:{...wall,id:'lower',ay:460}});
  moveToken(f.enemy.id,850,400);
  const seen=()=>buildSnapshot(f.session.id,'player',null,'west')!.tokens.some(t=>t.id===f.enemy.id);
  expect(seen()).toBe(true);moveToken(f.west.id,500,800);expect(seen()).toBe(false);
  moveToken(f.west.id,500,400);expect(seen()).toBe(true);
  setTokenHidden(f.enemy.id,true);expect(seen()).toBe(false);setTokenHidden(f.enemy.id,false);
  setFogLayer(f.map.id,'tokens',true);setFogRevealed(f.map.id,'tokens',[]);expect(seen()).toBe(false);
 });
 it('does not assign a reveal tag to an enemy behind every player wall',()=>{
  const f=fixture();moveToken(f.east.id,500,450);
  // Use another monster that has never been visible since activation.
  const template=createMonsterTemplate(f.session.id,{name:'Skeleton',maxHp:13});
  const hidden=createToken({mapId:f.map.id,kind:'monster',refId:instantiateMonster(template.id)!.id,x:1000,y:600});
  expect(buildSnapshot(f.session.id,'dm',f.map.id)!.tokens.find(t=>t.id===hidden.id)!.revealTag).toBe('U');
  editMapWalls(f.session.id,f.map.id,{removeId:wall.id});
  expect(buildSnapshot(f.session.id,'player',null,'west')!.tokens.find(t=>t.id===hidden.id)!.revealTag).not.toBe('U');
 });
});


describe('solid wall movement',()=>{
 const barrier:MapWall={id:'solid',kind:'rectangle',ax:100,ay:-100,bx:120,by:100};
 it('sweeps the whole base across thick walls in either direction',()=>{
  expect(stopAtWalls({x:0,y:0},{x:1000,y:0},10,[barrier]).x).toBeCloseTo(89.99);
  expect(stopAtWalls({x:200,y:0},{x:0,y:0},10,[barrier]).x).toBeCloseTo(130.01);
  expect(stopAtWalls({x:0,y:0},{x:1000,y:0},10,[{...barrier,kind:undefined,bx:100}]).x).toBeCloseTo(89.99);
 });
 it('allows parallel travel and moving away but clips diagonal corner contact',()=>{
  expect(stopAtWalls({x:89.99,y:0},{x:89.99,y:50},10,[barrier])).toEqual({x:89.99,y:50});
  expect(stopAtWalls({x:89.99,y:0},{x:0,y:0},10,[barrier])).toEqual({x:0,y:0});
  const result=stopAtWalls({x:0,y:0},{x:200,y:200},10,[barrier]);
  expect(result.x).toBeLessThan(100);expect(result.y).toBe(result.x);
  expect(distanceToWall(result,barrier)).toBeGreaterThanOrEqual(10);
 });
 it('requires enough doorway clearance for the entire base',()=>{
  const door:MapWall[]=[{id:'top',ax:100,ay:-100,bx:100,by:-15},{id:'bottom',ax:100,ay:15,bx:100,by:100}];
  expect(stopAtWalls({x:0,y:0},{x:200,y:0},10,door)).toEqual({x:200,y:0});
  expect(stopAtWalls({x:0,y:0},{x:200,y:0},20,door).x).toBeLessThan(100);
  expect(stopAtWalls({x:110,y:0},{x:200,y:0},10,[barrier])).toEqual({x:110,y:0});
 });
 it('enforces collision in saved player moves while allowing DM corrections',()=>{
  const f=fixture();
  const first=moveToken(f.west.id,1200,400,true)!;
  expect(first.x).toBeGreaterThan(500);expect(first.x).toBeLessThan(700);
  expect(moveToken(f.west.id,1200,400,true)!.x).toBeCloseTo(first.x);
  expect(moveToken(f.west.id,1200,400)!.x).toBe(1200);
 });
});


it('allows modest doorway squeeze independent of decorative base size',()=>{
 const walls:MapWall[]=[{id:'top',ax:100,ay:-100,bx:100,by:-30},{id:'bottom',ax:100,ay:30,bx:100,by:100}];
 // 20px/ft: a three-foot doorway admits a medium body, not a large body.
 expect(wallCollisionRadiusFt(5)).toBe(1.25);
 expect(stopAtWalls({x:0,y:0},{x:200,y:0},wallCollisionRadiusFt(5)*20,walls)).toEqual({x:200,y:0});
 expect(stopAtWalls({x:0,y:0},{x:200,y:0},wallCollisionRadiusFt(10)*20,walls).x).toBeLessThan(100);
 expect(stopAtWalls({x:0,y:0},{x:200,y:0},wallCollisionRadiusFt(5)*20,[{id:'solid',ax:100,ay:-100,bx:100,by:100}]).x).toBeCloseTo(74.99);
});


describe('doors incorporated into walls',()=>{
 it.each([undefined,'rectangle'] as const)('cuts a full opening in %s walls and opens light and movement together',kind=>{
  const wall:MapWall={id:'w',ax:100,ay:-100,bx:kind?120:100,by:100,...(kind?{kind}:{})};
  const parts=cutDoor(wall,{wallId:'w',id:'door',ax:110,ay:-30,bx:110,by:30})!;
  expect(parts).toHaveLength(3);expect(parts[2].door).toBe(true);
  expect(hasLineOfSight({x:0,y:0},{x:200,y:0},parts)).toBe(false);
  const opened=parts.map(w=>w.door?{...w,open:true}:w);
  expect(hasLineOfSight({x:0,y:0},{x:200,y:0},opened)).toBe(true);
  expect(stopAtWalls({x:0,y:0},{x:200,y:0},25,opened)).toEqual({x:200,y:0});
  expect(stopAtWalls({x:0,y:60},{x:200,y:60},25,opened).x).toBeLessThan(100);
  expect(wallVisibilityPolygon({x:0,y:0},opened,500).some(p=>p.x>200&&Math.abs(p.y)<1)).toBe(true);
  expect(sanitizeWalls(opened)).toEqual(opened);
 });
 it('works for reversed horizontal and diagonal walls',()=>{
  for(const wall of [{id:'w',kind:'rectangle' as const,ax:200,ay:120,bx:0,by:100},{id:'w',ax:0,ay:0,bx:200,by:200}]){
   const parts=cutDoor(wall,{wallId:'w',id:'d',ax:70,ay:70,bx:130,by:130})!;
   expect(parts).toHaveLength(3);expect(sanitizeWalls(parts)).toEqual(parts);
  }
 });
 it('persists door state, keeps daylight unlimited, and re-hides a room when closed',()=>{
  const f=fixture();updateMapEnvironment(f.session.id,f.map.id,{enabled:false});
  // Put the observer very far away on a clear line through the doorway.
  moveToken(f.west.id,-10000,400);moveToken(f.enemy.id,850,400);
  expect(editMapWalls(f.session.id,f.map.id,{door:{wallId:wall.id,id:'door',ax:700,ay:300,bx:700,by:600}})).toBeNull();
  expect(buildSnapshot(f.session.id,'player',null,'west')!.tokens.some(t=>t.id===f.enemy.id)).toBe(false);
  expect(setWallDoor(f.session.id,f.map.id,'door',true)).toBeNull();
  const snap=buildSnapshot(f.session.id,'player',null,'west')!;
  expect(snap.playerVision?.daylight).toBe(true);
  expect(snap.tokens.some(t=>t.id===f.enemy.id)).toBe(true);
  const restored=importSession(exportSession(f.session.code)!);
  expect(listMaps(getSessionByCode(restored.code)!.id)[0].walls?.find(w=>w.id==='door')?.open).toBe(true);
  expect(setWallDoor(f.session.id,f.map.id,'door',false)).toBeNull();
  expect(buildSnapshot(f.session.id,'player',null,'west')!.tokens.some(t=>t.id===f.enemy.id)).toBe(false);
  setWallDoor(f.session.id,f.map.id,'door',true);moveToken(f.west.id,700,400);
  expect(setWallDoor(f.session.id,f.map.id,'door',false)).toContain('clear');
  expect(getMap(f.map.id)!.walls!.find(w=>w.id==='door')!.open).toBe(true);
  expect(setWallDoor(createSession('other').id,f.map.id,'door',false)).toContain('not found');
 });
});


it('attaches an existing locked door without losing its stats or hidden state',()=>{
 const f=fixture(),template=createMonsterTemplate(f.session.id,{name:'Iron vault',maxHp:30,armorClass:19,objectKind:'door',objectDc:22});
 const object=instantiateMonster(template.id)!,token=createToken({mapId:f.map.id,kind:'monster',refId:object.id,x:620,y:600,isHidden:true});
 setCondition('monster',object.id,{id:'lock',label:'Locked',aura:'red',isConcentration:false});
 expect(editMapWalls(f.session.id,f.map.id,{door:{wallId:wall.id,id:'vault',tokenId:token.id,ax:700,ay:300,bx:700,by:600}})).toBeNull();
 expect(getMonster(object.id)).toMatchObject({objectDc:22,maxHp:30,armorClass:19});
 expect(getToken(token.id)!.isHidden).toBe(true);
 expect(setWallDoor(f.session.id,f.map.id,'vault',true)).toContain('locked');
 expect(buildSnapshot(f.session.id,'player',null,'west')!.tokens.some(t=>t.id===token.id)).toBe(false);
 setTokenHidden(token.id,false);
 expect(buildSnapshot(f.session.id,'player',null,'west')!.tokens.some(t=>t.id===token.id)).toBe(true);
 clearCondition('monster',object.id,'lock');
 expect(setWallDoor(f.session.id,f.map.id,'vault',true)).toBeNull();
 expect(getMonster(object.id)!.conditions.some(c=>c.label==='Open')).toBe(true);
 const restored=importSession(exportSession(f.session.code)!);
 const map=listMaps(getSessionByCode(restored.code)!.id)[0],door=map.walls!.find(w=>w.id==='vault')!;
 expect(door.tokenId).not.toBe(token.id);
 expect(getMonster(getToken(door.tokenId!)!.refId)).toMatchObject({objectDc:22,armorClass:19,maxHp:30});
 expect(door.open).toBe(true);
});


it('restores the functional wall door when undoing deletion of its object',()=>{
 const f=fixture();editMapWalls(f.session.id,f.map.id,{door:{wallId:wall.id,id:'door',ax:700,ay:300,bx:700,by:600}});
 const tokenId=getMap(f.map.id)!.walls!.find(w=>w.id==='door')!.tokenId!;
 captureTokenDelete(f.session.id,tokenId);deleteToken(tokenId);
 expect(hasLineOfSight({x:500,y:400},{x:900,y:400},getMap(f.map.id)!.walls)).toBe(true);
 popUndo(f.session.id)!.run();
 expect(getToken(tokenId)).toBeTruthy();
 expect(hasLineOfSight({x:500,y:400},{x:900,y:400},getMap(f.map.id)!.walls)).toBe(false);
});
