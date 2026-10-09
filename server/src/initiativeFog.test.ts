import {describe,it,expect} from 'vitest';
import {createSession,createMap,setActiveMap,createCharacter,claimCharacter,createToken,
  createMonsterTemplate,instantiateMonster,updateMapEnvironment,setVisionFog,setFogLayer,
  setTokenHidden,setTokenInCombat,setTokenInitiative,rollsInitiative,rollMissingInitiative,
  rollAllInitiative,getToken,moveToken,setExplorationMode} from './sessions.js';
import {editMapWalls,setWallDoor} from './mapWalls.js';
import {buildSnapshot} from './visibility.js';

function fixture(){
 const session=createSession('Initiative fog'),map=createMap(session.id,{name:'Two rooms'});
 const west=createCharacter(session.id,{name:'West'});claimCharacter(west.id,'west');
 const pc=createToken({mapId:map.id,kind:'pc',refId:west.id,x:100,y:200});
 const monster=instantiateMonster(createMonsterTemplate(session.id,{name:'Goblin',maxHp:7}).id)!;
 const enemy=createToken({mapId:map.id,kind:'monster',refId:monster.id,x:500,y:200});
 editMapWalls(session.id,map.id,{add:{id:'door',kind:'rectangle',ax:290,ay:-1000,bx:310,by:1000,door:true,open:false}});
 setActiveMap(session.id,map.id);
 return {session,map,pc,enemy};
}

describe('initiative respects current party sight rather than explored memory',()=>{
 for(const mode of ['day','dim','heavy'] as const)for(const [mapOn,tokenOn] of [[true,true],[false,true],[true,false],[false,false]]){
  it(`${mode}, map fog ${mapOn}, token fog ${tokenOn}: automatic eligibility matches creature visibility`,()=>{
   const f=fixture();
   updateMapEnvironment(f.session.id,f.map.id,{enabled:true,lighting:mode==='day'?'day':'dungeon',heavyDarkness:mode==='heavy'});
   setVisionFog(f.session.id,f.map.id,'map',mapOn);setVisionFog(f.session.id,f.map.id,'tokens',tokenOn);
   const dm=buildSnapshot(f.session.id,'dm',f.map.id)!;
   const visible=buildSnapshot(f.session.id,'player',null,'west')!.tokens.some(t=>t.id===f.enemy.id);
   expect(visible).toBe(!mapOn&&!tokenOn);
   expect(dm.tokens.find(t=>t.id===f.enemy.id)!.inCombatEffective).toBe(visible);
   rollMissingInitiative(f.map.id);
   expect(getToken(f.enemy.id)!.initiative!==null).toBe(visible);
   expect(getToken(f.pc.id)!.initiative).not.toBeNull();
  });
 }
 it('admits an enemy seen by another party member and preserves that member initiative in shared sight',()=>{
  const f=fixture(),east=createCharacter(f.session.id,{name:'East'});claimCharacter(east.id,'east');
  const ally=createToken({mapId:f.map.id,kind:'pc',refId:east.id,x:600,y:200});
  expect(rollsInitiative(f.enemy)).toBe(true);
  setTokenInitiative(ally.id,17);
  const shared=buildSnapshot(f.session.id,'player',null,'west')!.tokens.find(t=>t.id===ally.id)!;
  expect(shared).toMatchObject({sharedSightOnly:true,initiative:17});
  moveToken(ally.id,150,200);
  expect(rollsInitiative(f.enemy)).toBe(false);
 });
 it('keeps party PCs eligible under painted cover but explicit DM hiding and opt-outs still win',()=>{
  const f=fixture();setFogLayer(f.map.id,'map',true);
  expect(rollsInitiative(f.pc)).toBe(true);
  expect(rollsInitiative(f.enemy)).toBe(false);
  setTokenInCombat(f.pc.id,false);expect(rollsInitiative(getToken(f.pc.id)!)).toBe(false);
  setTokenInCombat(f.pc.id,undefined);setTokenHidden(f.pc.id,true);
  expect(rollsInitiative(getToken(f.pc.id)!)).toBe(false);
  setTokenInCombat(f.enemy.id,true);expect(rollsInitiative(getToken(f.enemy.id)!)).toBe(true);
 });
 it('excludes distant heavy-darkness creatures even with both fog switches off, but includes lit ones',()=>{
  const f=fixture();setWallDoor(f.session.id,f.map.id,'door',true);moveToken(f.enemy.id,1000,200);
  for(const layer of ['map','tokens'] as const)setVisionFog(f.session.id,f.map.id,layer,false);
  updateMapEnvironment(f.session.id,f.map.id,{enabled:true,lighting:'dungeon',heavyDarkness:true,lights:[]});
  expect(rollsInitiative(getToken(f.enemy.id)!)).toBe(false);
  updateMapEnvironment(f.session.id,f.map.id,{lights:[{id:'torch',x:1000,y:200,radiusFt:20,heightFt:7,intensity:1,color:'#ffb55c',visibleTorch:false}]});
  expect(rollsInitiative(getToken(f.enemy.id)!)).toBe(true);
  updateMapEnvironment(f.session.id,f.map.id,{heavyDarkness:false,lights:[]});
  expect(rollsInitiative(getToken(f.enemy.id)!)).toBe(true);
 });
 it('shares an enemy initiative in live party sight but removes it from a retained-only image',()=>{
  const f=fixture(),east=createCharacter(f.session.id,{name:'East'});
  const ally=createToken({mapId:f.map.id,kind:'pc',refId:east.id,x:600,y:200});
  setExplorationMode(f.session.id,f.map.id,'revealed');setTokenInitiative(f.enemy.id,13);
  expect(buildSnapshot(f.session.id,'player',null,'west')!.tokens.find(t=>t.id===f.enemy.id)).toMatchObject({sharedSightOnly:true,initiative:13});
  moveToken(ally.id,150,200);
  expect(buildSnapshot(f.session.id,'player',null,'west')!.tokens.find(t=>t.id===f.enemy.id)).toMatchObject({revealedOnly:true,initiative:null});
  expect(buildSnapshot(f.session.id,'dm',f.map.id)!.tokens.find(t=>t.id===f.enemy.id)!.initiative).toBe(13);
  setTokenHidden(f.enemy.id,true);expect(buildSnapshot(f.session.id,'player',null,'west')!.tokens.some(t=>t.id===f.enemy.id)).toBe(false);
 });
 it('does not recruit a retained image of a creature after its door closes',()=>{
  const f=fixture();setExplorationMode(f.session.id,f.map.id,'revealed');
  setWallDoor(f.session.id,f.map.id,'door',true);buildSnapshot(f.session.id,'player',null,'west');
  setWallDoor(f.session.id,f.map.id,'door',false);
  expect(buildSnapshot(f.session.id,'player',null,'west')!.tokens.find(t=>t.id===f.enemy.id)?.revealedOnly).toBe(true);
  expect(rollsInitiative(f.enemy)).toBe(false);
  setWallDoor(f.session.id,f.map.id,'door',true);rollAllInitiative(f.map.id);
  const rolled=getToken(f.enemy.id)!.initiative;
  setWallDoor(f.session.id,f.map.id,'door',false);rollMissingInitiative(f.map.id);
  expect(getToken(f.enemy.id)!.initiative).toBe(rolled);
 });
});
