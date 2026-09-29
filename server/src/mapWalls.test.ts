import {describe,it,expect} from 'vitest';
import {hasLineOfSight,sanitizeWalls,wallVisibilityPolygon,wallEdgeCount,distanceToWall,type MapWall} from '../../shared/mapWalls.js';
import {visionContains,visionLit} from '../../shared/playerVision.js';
import {editMapWalls} from './mapWalls.js';
import {createSession,createMap,createCharacter,claimCharacter,createToken,createMonsterTemplate,instantiateMonster,setActiveMap,updateMapEnvironment,getMap,getSessionByCode,listMaps,moveToken,setTokenHidden,setFogLayer,setFogRevealed} from './sessions.js';
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
