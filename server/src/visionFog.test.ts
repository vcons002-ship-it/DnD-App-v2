import {describe,it,expect} from 'vitest';
import {createSession,createMap,createCharacter,claimCharacter,createToken,createMonsterTemplate,instantiateMonster,setActiveMap,updateMapEnvironment,setVisionFog,getMap,setTokenHidden,setFogLayer,moveToken} from './sessions.js';
import {buildSnapshot} from './visibility.js';
import {editMapWalls,setWallDoor} from './mapWalls.js';
import {usesMapVision,usesTokenVision,visionContains,fogVisionContains} from '../../shared/playerVision.js';
import {stopAtWalls,hasLineOfSight} from '../../shared/mapWalls.js';
import {exportSession,importSession} from './backup.js';

function fixture(){
 const session=createSession('Independent sight fog'),map=createMap(session.id,{name:'Two rooms'});
 const viewer=createCharacter(session.id,{name:'Viewer'});claimCharacter(viewer.id,'fog-viewer');
 const actor=createToken({mapId:map.id,kind:'pc',refId:viewer.id,x:100,y:200});
 const template=createMonsterTemplate(session.id,{name:'Goblin',maxHp:7});
 const enemy=createToken({mapId:map.id,kind:'monster',refId:instantiateMonster(template.id)!.id,x:500,y:200});
 editMapWalls(session.id,map.id,{add:{id:'closed-door',kind:'rectangle',ax:290,ay:-1000,bx:310,by:1000,door:true,open:false}});
 setActiveMap(session.id,map.id);
 const snapshot=()=>buildSnapshot(session.id,'player',null,'fog-viewer')!;
 return {session,map,actor,enemy,snapshot};
}

describe('independent automatic map and token fog',()=>{
 for(const mode of ['day','regular','heavy'] as const)for(const [mapOn,tokenOn] of [[true,true],[false,true],[false,false],[true,false]]){
  it(`${mode}: map ${mapOn}, tokens ${tokenOn} preserves physical sight and collision`,()=>{
   const f=fixture();
   updateMapEnvironment(f.session.id,f.map.id,{enabled:true,lighting:mode==='day'?'day':'dungeon',heavyDarkness:mode==='heavy'});
   setVisionFog(f.session.id,f.map.id,'map',mapOn);setVisionFog(f.session.id,f.map.id,'tokens',tokenOn);
   const snap=f.snapshot(),shown=snap.tokens.find(t=>t.id===f.enemy.id);
   expect(usesMapVision(snap.map)).toBe(mapOn);expect(usesTokenVision(snap.map)).toBe(mapOn||tokenOn);
   expect(!!shown).toBe(!mapOn&&!tokenOn);
   expect(visionContains(snap.playerVision,f.enemy.x,f.enemy.y)).toBe(false);
   expect(hasLineOfSight(f.actor,f.enemy,snap.map!.walls)).toBe(false);
   expect(stopAtWalls(f.actor,f.enemy,5,snap.map!.walls).x).toBeLessThan(290);
   if(shown){expect(shown.sharedSightOnly).toBeUndefined();expect(shown.revealTag).not.toBe('U');}
   expect(setWallDoor(f.session.id,f.map.id,'closed-door',true)).toBeNull();
   expect(f.snapshot().tokens.some(t=>t.id===f.enemy.id&&!t.sharedSightOnly)).toBe(true);
  });
 }
 for(const [mapOn,tokenOn] of [[true,true],[false,true],[false,false],[true,false]])it(`heavy range survives map ${mapOn}, token ${tokenOn} switches while dim sight remains unlimited`,()=>{
  const f=fixture();moveToken(f.enemy.id,1000,200);
  setVisionFog(f.session.id,f.map.id,'map',mapOn);setVisionFog(f.session.id,f.map.id,'tokens',tokenOn);
  setWallDoor(f.session.id,f.map.id,'closed-door',true);
  updateMapEnvironment(f.session.id,f.map.id,{enabled:true,lighting:'dungeon',heavyDarkness:true,lights:[]});
  let snap=f.snapshot();
  expect(fogVisionContains(snap.playerVision,1000,200,usesTokenVision(snap.map))).toBe(false);
  expect(snap.tokens.some(t=>t.id===f.enemy.id)).toBe(false);
  updateMapEnvironment(f.session.id,f.map.id,{heavyDarkness:false});
  snap=f.snapshot();expect(snap.tokens.some(t=>t.id===f.enemy.id&&!t.sharedSightOnly)).toBe(true);
  expect(visionContains(snap.playerVision,1000,200)).toBe(true);
 });
 it('defaults new and legacy maps on, scopes edits per campaign, and restores saved choices',()=>{
  const f=fixture(),other=createSession('Other'),m2=createMap(f.session.id,{name:'Another map'});
  expect(getMap(f.map.id)).toMatchObject({mapVisionEnabled:true,tokenVisionEnabled:true});
  expect(usesMapVision({})).toBe(true);expect(usesTokenVision({})).toBe(true);
  expect(setVisionFog(other.id,f.map.id,'map',false)).toBe(false);
  expect(setVisionFog(f.session.id,f.map.id,'map',false)).toBe(true);
  expect(setVisionFog(f.session.id,f.map.id,'tokens',false)).toBe(true);
  expect(getMap(m2.id)).toMatchObject({mapVisionEnabled:true,tokenVisionEnabled:true});
  const restored=importSession(exportSession(f.session.code)!);
  const copy=exportSession(restored.code)!;
  expect(copy.maps.find(m=>m.name==='Two rooms')).toMatchObject({map_vision_enabled:0,token_vision_enabled:0});
 });
 it('keeps explicit DM hiding and manually painted cover authoritative when automatic fog is off',()=>{
  const f=fixture();setVisionFog(f.session.id,f.map.id,'map',false);setVisionFog(f.session.id,f.map.id,'tokens',false);
  setTokenHidden(f.enemy.id,true);expect(f.snapshot().tokens.some(t=>t.id===f.enemy.id)).toBe(false);
  setTokenHidden(f.enemy.id,false);setFogLayer(f.map.id,'tokens',true);
  expect(f.snapshot().tokens.some(t=>t.id===f.enemy.id)).toBe(false);
 });
});
