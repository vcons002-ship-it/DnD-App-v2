import {db} from './db.js';
import {describe,it,expect} from 'vitest';
import {createSession,createMap,createCharacter,claimCharacter,createToken,createMonsterTemplate,instantiateMonster,setActiveMap,updateMapEnvironment,moveToken,setTokenHidden,setFogLayer,setFogRevealed} from './sessions.js';
import {createSnapshotBuilder,buildSnapshot} from './visibility.js';
import {visionContains,visionLit,lightCoverage} from '../../shared/playerVision.js';

describe('personal dungeon vision',()=>{
 it('color reveal fades with physical light attenuation instead of a hard radius',()=>{
  const lamp={radius:100,height:14,strength:.85};
  expect(lightCoverage(0,lamp)).toBeGreaterThan(.99);
  expect(lightCoverage(60,lamp)).toBeGreaterThan(lightCoverage(90,lamp));
  expect(lightCoverage(90,lamp)).toBeGreaterThan(0);
  expect(lightCoverage(100,lamp)).toBe(0);
  expect(lightCoverage(60,{...lamp,strength:0})).toBe(0);
  expect(lightCoverage(60,{...lamp,strength:1.5})).toBeGreaterThan(lightCoverage(60,lamp));
 });
 function setup(){
  const s=createSession('Personal vision'),map=createMap(s.id,{name:'Dark dungeon'});
  updateMapEnvironment(s.id,map.id,{enabled:true,lighting:'dungeon',heavyDarkness:true,mist:false});
  const a=createCharacter(s.id,{name:'Viewer A'}),b=createCharacter(s.id,{name:'Viewer B'});
  claimCharacter(a.id,'vision-a');claimCharacter(b.id,'vision-b');
  const ta=createToken({mapId:map.id,kind:'pc',refId:a.id,x:100,y:100});
  createToken({mapId:map.id,kind:'pc',refId:b.id,x:1500,y:100});
  const template=createMonsterTemplate(s.id,{name:'Goblin',maxHp:7});
  const near=createToken({mapId:map.id,kind:'monster',refId:instantiateMonster(template.id)!.id,x:500,y:100});
  const far=createToken({mapId:map.id,kind:'monster',refId:instantiateMonster(template.id)!.id,x:1400,y:100});
  setActiveMap(s.id,map.id);
  return {s,map,ta,near,far};
 }
 it('keeps each viewer token AND monster lists independent in either builder order',()=>{
  const f=setup();
  for(const order of [['vision-a','vision-b'],['vision-b','vision-a']]){
   const build=createSnapshotBuilder(f.s.id)!;
   for(const socket of order){const snap=build('player',null,socket);
    expect(snap.playerVision?.rangeFt).toBe(60);
    expect(snap.tokens.some(t=>t.id===(socket==='vision-a'?f.near:f.far).id)).toBe(true);
    expect(snap.tokens.some(t=>t.id===(socket==='vision-a'?f.far:f.near).id)).toBe(false);
    expect(snap.monsters.map(m=>m.id)).toEqual([(socket==='vision-a'?f.near:f.far).refId]);
   }
  }
  expect(buildSnapshot(f.s.id,'dm',f.map.id)!.tokens).toHaveLength(4);
  expect(buildSnapshot(f.s.id,'player',null,'unclaimed')!.tokens).toHaveLength(0);
 });
 it('applies the same strict boundary in dim and complete darkness and updates after movement',()=>{
  const f=setup();
  for(const heavyDarkness of [false,true]){
   updateMapEnvironment(f.s.id,f.map.id,{heavyDarkness});
   const v=buildSnapshot(f.s.id,'player',null,'vision-a')!.playerVision!;
   expect(v.heavy).toBe(heavyDarkness);expect(visionContains(v,700,100)).toBe(true);expect(visionContains(v,700.1,100)).toBe(false);
   expect(visionLit(v,500,100)).toBe(false);
  }
  moveToken(f.ta.id,1000,100);
  expect(buildSnapshot(f.s.id,'player',null,'vision-a')!.tokens.some(t=>t.id===f.far.id)).toBe(true);
 });
 it('keeps hidden and fogged creatures concealed and limits placed light metadata',()=>{
  const f=setup();updateMapEnvironment(f.s.id,f.map.id,{lights:[{id:'near',x:450,y:100,radiusFt:15,heightFt:5,intensity:1,color:'warm',flicker:true},{id:'secret',x:1400,y:100,radiusFt:60,heightFt:5,intensity:1,color:'warm',flicker:true}]});
  const snap=buildSnapshot(f.s.id,'player',null,'vision-a')!;
  expect(snap.map!.environment!.lights.map(l=>l.id)).toEqual(['near']);
  expect(visionLit(snap.playerVision,500,100)).toBe(true);expect(visionContains(snap.playerVision,1400,100)).toBe(false);
  setTokenHidden(f.near.id,true);expect(buildSnapshot(f.s.id,'player',null,'vision-a')!.monsters).toHaveLength(0);
  setTokenHidden(f.near.id,false);
  db.prepare('UPDATE tokens SET carried_lantern = 1 WHERE id = ?').run(f.near.id);
  expect(buildSnapshot(f.s.id,'player',null,'vision-a')!.playerVision!.lights.some(l=>l.id===f.near.id)).toBe(true);
  setFogLayer(f.map.id,'tokens',true);setFogRevealed(f.map.id,'tokens',[]);
  expect(buildSnapshot(f.s.id,'player',null,'vision-a')!.monsters).toHaveLength(0);
  expect(buildSnapshot(f.s.id,'player',null,'vision-a')!.playerVision!.lights.some(l=>l.id===f.near.id)).toBe(false);
  updateMapEnvironment(f.s.id,f.map.id,{enabled:false});expect(buildSnapshot(f.s.id,'player',null,'vision-a')!.playerVision).toBeUndefined();
 });
 it('does not allocate encounter numbers to creatures beyond every PC before discovery',()=>{
  const f=setup();moveToken(f.far.id,2500,100);
  expect(buildSnapshot(f.s.id,'dm',f.map.id)!.tokens.find(t=>t.id===f.far.id)?.revealTag).toBe('U');
  moveToken(f.ta.id,2100,100);
  expect(buildSnapshot(f.s.id,'player',null,'vision-a')!.tokens.find(t=>t.id===f.far.id)?.revealTag).not.toBe('U');
 });
});
