import {describe,it,expect} from 'vitest';
import {createSession,createMap,createCharacter,claimCharacter,createToken,createMonsterTemplate,instantiateMonster,setActiveMap,moveToken,setTokenHidden,setFogLayer,setFogRevealed,updateMapEnvironment} from './sessions.js';
import {editMapWalls} from './mapWalls.js';
import {createSnapshotBuilder,buildSnapshot} from './visibility.js';

function setup(){
 const s=createSession('Shared live sight'),map=createMap(s.id,{name:'Two rooms'});
 const a=createCharacter(s.id,{name:'West'}),b=createCharacter(s.id,{name:'East'});
 claimCharacter(a.id,'west');claimCharacter(b.id,'east');
 const west=createToken({mapId:map.id,kind:'pc',refId:a.id,x:100,y:100});
 const east=createToken({mapId:map.id,kind:'pc',refId:b.id,x:900,y:100});
 const m=instantiateMonster(createMonsterTemplate(s.id,{name:'Goblin',maxHp:7}).id)!;
 const enemy=createToken({mapId:map.id,kind:'monster',refId:m.id,x:950,y:100});
 editMapWalls(s.id,map.id,{add:{id:'wall',ax:500,ay:-1000,bx:500,by:1000}});
 setActiveMap(s.id,map.id);
 const snap=(socket='west')=>buildSnapshot(s.id,'player',null,socket)!;
 return {s,map,west,east,enemy,snap};
}

describe('live party creature awareness',()=>{
 it('shares only current sightings, independently per viewer, in daylight and both darkness levels',()=>{
  const f=setup();
  for(const settings of [{enabled:false},{enabled:true,lighting:'dungeon' as const,heavyDarkness:false},{heavyDarkness:true}]){
   updateMapEnvironment(f.s.id,f.map.id,settings);
   for(const order of [['west','east'],['east','west']]){
    const build=createSnapshotBuilder(f.s.id)!;
    for(const viewer of order){const snap=build('player',null,viewer);
     expect(snap.tokens.find(t=>t.id===f.enemy.id)?.sharedSightOnly).toBe(viewer==='west'?true:undefined);
     expect(snap.tokens.find(t=>t.id===(viewer==='west'?f.east:f.west).id)?.sharedSightOnly).toBe(true);
    }
   }
  }
  moveToken(f.east.id,150,100);
  expect(f.snap().tokens.some(t=>t.id===f.enemy.id)).toBe(false);
  expect(f.snap().monsters.some(m=>m.id===f.enemy.refId)).toBe(false);
  expect(f.snap().exploredTerrain?.length).toBeGreaterThan(0);
  expect(buildSnapshot(f.s.id,'dm',f.map.id)!.tokens.every(t=>!t.sharedSightOnly)).toBe(true);
 });
 it('always retains party positions but never leaks an explicitly hidden PC or creature, nor fogged enemies',()=>{
  const f=setup();setFogLayer(f.map.id,'map',true);setFogRevealed(f.map.id,'map',[]);
  expect(f.snap().tokens.find(t=>t.id===f.east.id)?.sharedSightOnly).toBe(true);
  expect(f.snap().tokens.some(t=>t.id===f.enemy.id)).toBe(false);
  setFogLayer(f.map.id,'map',false);setFogLayer(f.map.id,'tokens',true);setFogRevealed(f.map.id,'tokens',[]);
  expect(f.snap().tokens.some(t=>t.id===f.enemy.id)).toBe(false);
  setFogLayer(f.map.id,'tokens',false);setTokenHidden(f.enemy.id,true);
  expect(f.snap().tokens.some(t=>t.id===f.enemy.id)).toBe(false);
  setTokenHidden(f.enemy.id,false);setTokenHidden(f.east.id,true);
  expect(f.snap().tokens.some(t=>t.id===f.east.id||t.id===f.enemy.id)).toBe(false);
 });
 it('keeps distant PCs known without granting their surroundings sight, and drops unobserved enemies',()=>{
  const f=setup();editMapWalls(f.s.id,f.map.id,{removeId:'wall'});
  updateMapEnvironment(f.s.id,f.map.id,{enabled:true,lighting:'night',heavyDarkness:true});
  moveToken(f.east.id,2500,100);
  expect(f.snap().tokens.find(t=>t.id===f.east.id)?.sharedSightOnly).toBe(true);
  expect(f.snap().tokens.some(t=>t.id===f.enemy.id)).toBe(false);
  moveToken(f.enemy.id,2550,100);
  expect(f.snap().tokens.find(t=>t.id===f.enemy.id)?.sharedSightOnly).toBe(true);
  moveToken(f.east.id,100,100);
  expect(f.snap().tokens.some(t=>t.id===f.enemy.id)).toBe(false);
  updateMapEnvironment(f.s.id,f.map.id,{enabled:false});
  expect(f.snap().tokens.find(t=>t.id===f.enemy.id)?.sharedSightOnly).toBeUndefined();
  expect(f.snap().tokens.some(t=>t.id===f.enemy.id)).toBe(true);
 });
});
