import {describe,it,expect} from 'vitest';
import {db} from './db.js';
import {createSession,createMap,createCharacter,claimCharacter,createToken,createMonsterTemplate,instantiateMonster,setActiveMap,updateMapEnvironment,setTokenHidden,setFogLayer,setFogRevealed,getCharacter} from './sessions.js';
import {editMapWalls} from './mapWalls.js';
import {buildSnapshot,createSnapshotBuilder} from './visibility.js';
import {visionContains} from '../../shared/playerVision.js';

function fixture(){
 const s=createSession('DM combined sight'),map=createMap(s.id,{name:'Split rooms'});setActiveMap(s.id,map.id);
 const a=createCharacter(s.id,{name:'Left viewer'}),b=createCharacter(s.id,{name:'Right viewer'});
 claimCharacter(a.id,'left-player');claimCharacter(b.id,'right-player');
 createToken({mapId:map.id,kind:'pc',refId:a.id,x:100,y:100});createToken({mapId:map.id,kind:'pc',refId:b.id,x:900,y:100});
 editMapWalls(s.id,map.id,{add:{id:'partition',ax:500,ay:-1000,bx:500,by:1000}});
 const enemy=(name:string,x:number)=>{const m=instantiateMonster(createMonsterTemplate(s.id,{name,maxHp:10}).id)!;return createToken({mapId:map.id,kind:'monster',refId:m.id,x,y:100});};
 const left=enemy('Goblin',200),right=enemy('Skeleton',800),far=enemy('Ogre',1800),hidden=enemy('Hidden scout',250);setTokenHidden(hidden.id,true);
 const preview=()=>buildSnapshot(s.id,'dm',map.id,'dm',null,true)!.partyView!;
 return{s,map,a,b,left,right,far,hidden,preview};
}
describe('DM combined player view',()=>{
 it('combines direct party sight across walls while preserving DM concealment',()=>{
  const f=fixture(),preview=f.preview();
  expect(preview.playerVision?.origins).toHaveLength(2);
  expect(preview.tokens.find(t=>t.id===f.left.id)?.sharedSightOnly).toBeUndefined();
  expect(preview.tokens.find(t=>t.id===f.right.id)?.sharedSightOnly).toBeUndefined();
  expect(preview.tokens.some(t=>t.id===f.hidden.id)).toBe(false);
  expect(buildSnapshot(f.s.id,'player',null,'left-player')!.tokens.find(t=>t.id===f.right.id)?.sharedSightOnly).toBe(true);
 });
 it('obeys heavy darkness and reveals distant torch-lit creatures',()=>{
  const f=fixture();updateMapEnvironment(f.s.id,f.map.id,{enabled:true,lighting:'dungeon',heavyDarkness:true,lights:[]});
  expect(f.preview().tokens.some(t=>t.id===f.far.id)).toBe(false);
  updateMapEnvironment(f.s.id,f.map.id,{lights:[{id:'far-light',x:1800,y:100,radiusFt:20,heightFt:9,color:'warm',intensity:1,flicker:true}]});
  expect(f.preview().tokens.some(t=>t.id===f.far.id)).toBe(true);
 });
 it('respects manually covered creature fog',()=>{
  const f=fixture();setFogLayer(f.map.id,'tokens',true);setFogRevealed(f.map.id,'tokens',[]);
  expect(f.preview().tokens.some(t=>t.id===f.left.id||t.id===f.right.id)).toBe(false);
 });
 it('never writes exploration memory or changes character claims during preview',()=>{
  const f=fixture();const before=db.prepare('SELECT * FROM explored_terrain WHERE map_id=?').get(f.map.id);
  f.preview();
  expect(db.prepare('SELECT * FROM explored_terrain WHERE map_id=?').get(f.map.id)).toEqual(before);
  expect(getCharacter(f.a.id)?.claimedBy).toBe('left-player');expect(getCharacter(f.b.id)?.claimedBy).toBe('right-player');
  const build=createSnapshotBuilder(f.s.id)!;build('dm',f.map.id,'dm',null,true);build('player',null,'left-player');
  expect(db.prepare('SELECT * FROM explored_terrain WHERE map_id=?').get(f.map.id)).toBeDefined();
 });
 it('preserves existing revealed-mode token memory without updating it',()=>{
  const f=fixture();db.prepare("UPDATE maps SET exploration_mode='revealed' WHERE id=?").run(f.map.id);
  buildSnapshot(f.s.id,'player',null,'left-player');
  const before=db.prepare('SELECT * FROM explored_terrain WHERE map_id=?').get(f.map.id);
  f.preview();expect(db.prepare('SELECT * FROM explored_terrain WHERE map_id=?').get(f.map.id)).toEqual(before);
 });
 it('does not send extra preview data unless a DM requests it',()=>{
  const f=fixture();expect(buildSnapshot(f.s.id,'dm')!.partyView).toBeUndefined();
  expect(buildSnapshot(f.s.id,'player',null,'left-player',null,true)!.partyView).toBeUndefined();
 });
 it('previews the selected preparation map rather than mixing in active-map sight',()=>{
  const f=fixture(),prep=createMap(f.s.id,{name:'Preparation map'});
  createToken({mapId:prep.id,kind:'pc',refId:f.a.id,x:50,y:50});
  editMapWalls(f.s.id,prep.id,{add:{id:'prep-wall',ax:200,ay:-500,bx:200,by:500}});
  const preview=buildSnapshot(f.s.id,'dm',prep.id,'dm',null,true)!.partyView!;
  expect(preview.map?.id).toBe(prep.id);expect(preview.playerVision?.origins).toHaveLength(1);
  expect(visionContains(preview.playerVision,900,100)).toBe(false);
  expect(preview.tokens.every(t=>t.mapId===prep.id)).toBe(true);
 });
});
