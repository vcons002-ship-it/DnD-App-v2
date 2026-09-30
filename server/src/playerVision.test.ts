import {lightColorCoverage} from '../../shared/lightFalloff.js';
import {db} from './db.js';
import {describe,it,expect} from 'vitest';
import {createSession,createMap,createCharacter,claimCharacter,createToken,createMonsterTemplate,instantiateMonster,setActiveMap,updateMapEnvironment,moveToken,setTokenHidden,setFogLayer,setFogRevealed} from './sessions.js';
import {createSnapshotBuilder,buildSnapshot} from './visibility.js';
import {visionContains,visionLit,lightCoverage} from '../../shared/playerVision.js';

describe('personal dungeon vision',()=>{
 it('color reveal fades with physical light attenuation instead of a hard radius',()=>{
  const lamp={radius:100,height:14,strength:.85};
  expect(lightCoverage(0,lamp)).toBeGreaterThan(.90);
  expect(lightCoverage(60,lamp)).toBe(1);
  expect(lightCoverage(100,lamp)).toBe(1);
  expect(lightCoverage(125,lamp)).toBeLessThan(1);
  expect(lightCoverage(90,lamp)).toBeGreaterThan(0);
  expect(lightCoverage(100,lamp)).toBeGreaterThan(.70);
  expect(lightCoverage(125,lamp)).toBeGreaterThan(0);
  expect(lightCoverage(150,lamp)).toBe(0);
  expect(lightCoverage(60,{...lamp,strength:0})).toBe(0);
  expect(lightCoverage(125,{...lamp,strength:1.5})).toBeGreaterThan(lightCoverage(125,lamp));
 });
 it('removes every grayscale/detail contribution at useful illumination while retaining a soft edge',()=>{
  expect(lightColorCoverage(0)).toBe(0);
  expect(lightColorCoverage(.05)).toBe(0);
  expect(lightColorCoverage(.575)).toBeCloseTo(.5);
  expect(lightColorCoverage(1.1)).toBe(1);
  expect(lightColorCoverage(3)).toBe(1);
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
    expect(snap.tokens.find(t=>t.id===(socket==='vision-a'?f.far:f.near).id)?.sharedSightOnly).toBe(true);
    expect(snap.monsters.map(m=>m.id).sort()).toEqual([f.near.refId,f.far.refId].sort());
   }
  }
  expect(buildSnapshot(f.s.id,'dm',f.map.id)!.tokens).toHaveLength(4);
  expect(buildSnapshot(f.s.id,'player',null,'unclaimed')!.tokens.every(t=>t.sharedSightOnly)).toBe(true);
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
 it('reveals distant illuminated enemies in either darkness level without revealing the dark gap',()=>{
  const f=setup();
  updateMapEnvironment(f.s.id,f.map.id,{lights:[{id:'distant',x:1400,y:100,radiusFt:15,heightFt:5,intensity:1,color:'warm',flicker:true}]});
  for(const heavyDarkness of [false,true]){
   updateMapEnvironment(f.s.id,f.map.id,{heavyDarkness});
   const snap=buildSnapshot(f.s.id,'player',null,'vision-a')!;
   expect(snap.map!.environment!.lights.map(l=>l.id)).toEqual(['distant']);
   expect(visionContains(snap.playerVision,1400,100)).toBe(true);
   expect(visionContains(snap.playerVision,1000,100)).toBe(false);
   expect(snap.tokens.some(t=>t.id===f.far.id)).toBe(true);
   expect(snap.monsters.some(m=>m.id===f.far.refId)).toBe(true);
   expect(snap.tokens.find(t=>t.id===f.far.id)?.revealTag).not.toBe('U');
  }
  expect(buildSnapshot(f.s.id,'player',null,'unclaimed')!.tokens.every(t=>t.sharedSightOnly)).toBe(true);
  updateMapEnvironment(f.s.id,f.map.id,{lights:[]});
  expect(buildSnapshot(f.s.id,'player',null,'vision-a')!.tokens.find(t=>t.id===f.far.id)?.sharedSightOnly).toBe(true);
 });
 it('keeps distant lit enemies hidden under token fog or the DM hidden flag',()=>{
  const f=setup();updateMapEnvironment(f.s.id,f.map.id,{lights:[{id:'distant',x:1400,y:100,radiusFt:15,heightFt:5,intensity:1,color:'warm',flicker:true}]});
  setTokenHidden(f.far.id,true);
  expect(buildSnapshot(f.s.id,'player',null,'vision-a')!.tokens.some(t=>t.id===f.far.id)).toBe(false);
  setTokenHidden(f.far.id,false);setFogLayer(f.map.id,'tokens',true);setFogRevealed(f.map.id,'tokens',[]);
  const snap=buildSnapshot(f.s.id,'player',null,'vision-a')!;
  expect(snap.tokens.some(t=>t.id===f.far.id)).toBe(false);
  expect(snap.map!.environment!.lights).toHaveLength(1);
 });
 it('conceals fogged placed lights and tokens even when another visible light illuminates their square',()=>{
  const f=setup();updateMapEnvironment(f.s.id,f.map.id,{lights:[{id:'distant',x:1400,y:100,radiusFt:15,heightFt:5,intensity:1,color:'warm',flicker:true}]});
  setFogLayer(f.map.id,'map',true);setFogRevealed(f.map.id,'map',['2,2','10,2']);
  let snap=buildSnapshot(f.s.id,'player',null,'vision-a')!;
  expect(snap.playerVision!.lights).toHaveLength(0);
  expect(snap.map!.environment!.lights).toHaveLength(0);
  expect(snap.tokens.some(t=>t.id===f.far.id)).toBe(false);
  updateMapEnvironment(f.s.id,f.map.id,{lights:[{id:'visible',x:1350,y:100,radiusFt:15,heightFt:5,intensity:1,color:'warm',flicker:true}]});
  setFogRevealed(f.map.id,'map',['2,2','27,2']);
  snap=buildSnapshot(f.s.id,'player',null,'vision-a')!;
  expect(snap.playerVision!.lights).toHaveLength(1);
  expect(visionContains(snap.playerVision,1400,100)).toBe(true);
  expect(snap.tokens.some(t=>t.id===f.far.id)).toBe(false);
 });
 it('reveals distant carried lights but never leaks a hidden or token-fogged carrier light',()=>{
  const f=setup();
  db.prepare('UPDATE tokens SET carried_lantern = 1 WHERE id = ?').run(f.far.id);
  expect(buildSnapshot(f.s.id,'player',null,'vision-a')!.tokens.some(t=>t.id===f.far.id)).toBe(true);
  // A second, unlit enemy next to the carrier must not be disclosed by a concealed source.
  moveToken(f.near.id,1350,100);
  const other=buildSnapshot(f.s.id,'dm',f.map.id)!.tokens.find(t=>t.kind==='pc'&&t.id!==f.ta.id)!;
  setTokenHidden(other.id,true); // Isolate personal light visibility from party awareness.
  for(const conceal of ['hidden','fog']){
   setTokenHidden(f.far.id,conceal==='hidden');
   if(conceal==='fog'){setFogLayer(f.map.id,'tokens',true);setFogRevealed(f.map.id,'tokens',['27,2']);}
   const snap=buildSnapshot(f.s.id,'player',null,'vision-a')!;
   expect(snap.playerVision!.lights).toHaveLength(0);
   expect(snap.monsters).toHaveLength(0);
  }
  updateMapEnvironment(f.s.id,f.map.id,{enabled:false});expect(buildSnapshot(f.s.id,'player',null,'vision-a')!.playerVision).toBeUndefined();
 });
 it('assigns reveal tags to a distant lit enemy only after its unobscured light is added',()=>{
  const f=setup();moveToken(f.far.id,2500,100);
  expect(buildSnapshot(f.s.id,'dm',f.map.id)!.tokens.find(t=>t.id===f.far.id)?.revealTag).toBe('U');
  updateMapEnvironment(f.s.id,f.map.id,{lights:[{id:'far-lamp',x:2500,y:100,radiusFt:15,heightFt:5,intensity:1,color:'warm',flicker:true}]});
  const token=buildSnapshot(f.s.id,'player',null,'vision-a')!.tokens.find(t=>t.id===f.far.id);
  expect(token).toBeDefined();expect(token!.revealTag).not.toBe('U');
 });
 it('does not allocate encounter numbers to creatures beyond every PC before discovery',()=>{
  const f=setup();moveToken(f.far.id,2500,100);
  expect(buildSnapshot(f.s.id,'dm',f.map.id)!.tokens.find(t=>t.id===f.far.id)?.revealTag).toBe('U');
  moveToken(f.ta.id,2100,100);
  expect(buildSnapshot(f.s.id,'player',null,'vision-a')!.tokens.find(t=>t.id===f.far.id)?.revealTag).not.toBe('U');
 });
});
