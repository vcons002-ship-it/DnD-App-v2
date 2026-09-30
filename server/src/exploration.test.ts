import {describe,it,expect,vi} from 'vitest';
import {db} from './db.js';
import {buildSnapshot} from './visibility.js';
import {clearExplorationCache,visibleTerrain} from './exploration.js';
import {createSession,createMap,createCharacter,claimCharacter,createToken,createMonsterTemplate,instantiateMonster,setActiveMap,moveToken,setFogLayer,setFogRevealed,updateMapEnvironment,getSessionByCode,listMaps,listCharacters} from './sessions.js';
import {editMapWalls,setWallDoor} from './mapWalls.js';
import {exportSession,importSession} from './backup.js';
import type {ExploredTerrain} from '../../shared/exploration.js';

function contains(shape:ExploredTerrain|undefined,x:number,y:number){
 const inside=(ring:[number,number][])=>{let yes=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){
  const [a,b]=ring[i],[c,d]=ring[j];if((b>y)!==(d>y)&&x<(c-a)*(y-b)/(d-b)+a)yes=!yes;
 }return yes;};
 return shape?.some(p=>inside(p[0])&&!p.slice(1).some(inside))??false;
}
function fixture(){
 const s=createSession('Exploration'),map=createMap(s.id,{name:'Remembered dungeon'});
 const a=createCharacter(s.id,{name:'Viewer A'}),b=createCharacter(s.id,{name:'Viewer B'});
 claimCharacter(a.id,'explorer-a');claimCharacter(b.id,'explorer-b');
 const ta=createToken({mapId:map.id,kind:'pc',refId:a.id,x:100,y:100});
 createToken({mapId:map.id,kind:'pc',refId:b.id,x:100,y:100});
 const m=instantiateMonster(createMonsterTemplate(s.id,{name:'Goblin',maxHp:7}).id)!;
 const enemy=createToken({mapId:map.id,kind:'monster',refId:m.id,x:900,y:100});
 editMapWalls(s.id,map.id,{add:{id:'partition',ax:500,ay:-1000,bx:500,by:1000}});
 setActiveMap(s.id,map.id);
 const snap=(socket='explorer-a')=>buildSnapshot(s.id,'player',null,socket)!;
 return {s,map,a,b,ta,enemy,snap};
}
describe('persistent shared party terrain memory',()=>{
 it('merges fractional thick-door openings across repeated movement and closure',()=>{
  const warnings=vi.spyOn(console,'warn').mockImplementation(()=>{});
  try {
   for(const edge of [419.46875,419.473684,420,419.47]){
    const f=fixture();editMapWalls(f.s.id,f.map.id,{removeId:'partition'});
    editMapWalls(f.s.id,f.map.id,{add:{id:'thick',kind:'rectangle',ax:450,ay:-2000,bx:470,by:2000}});
    editMapWalls(f.s.id,f.map.id,{door:{wallId:'thick',id:'door',ax:460,ay:300.526316,bx:460,by:edge}});
    const other=buildSnapshot(f.s.id,'dm',f.map.id)!.tokens.find(t=>t.refId===f.b.id)!;
    moveToken(other.id,600,360);
    for(let pass=0;pass<3;pass++)for(const x of [300,380,530,380]){
     moveToken(f.ta.id,x,360);setWallDoor(f.s.id,f.map.id,'door',pass%2===0);f.snap();
    }
   }
   expect(warnings).not.toHaveBeenCalled();
  }finally{warnings.mockRestore();}
 });
 it('leaves an unobstructed non-dark map fully visible in color, while explicit fog still hides tokens',()=>{
  const f=fixture();editMapWalls(f.s.id,f.map.id,{removeId:'partition'});
  const snap=f.snap();expect(snap.playerVision).toBeUndefined();expect(snap.tokens.some(t=>t.id===f.enemy.id)).toBe(true);
  setFogLayer(f.map.id,'map',true);setFogRevealed(f.map.id,'map',['2,2']);
  expect(f.snap().tokens.some(t=>t.id===f.enemy.id)).toBe(false);
  expect(contains(f.snap().exploredTerrain,900,100)).toBe(false);
 });
 it('merges repeated daylight doorway walks without distant-boundary clipping failures',()=>{
  const f=fixture();editMapWalls(f.s.id,f.map.id,{removeId:'partition'});
  const rects=[[250,80,600,102],[250,102,273,428],[273,405,493,427],[543,405,600,427],[578,102,600,285],[578,335,600,405]];
  rects.forEach(([ax,ay,bx,by],i)=>editMapWalls(f.s.id,f.map.id,{add:{id:`room-${i}`,kind:'rectangle',ax,ay,bx,by}}));
  const warnings=vi.spyOn(console,'warn').mockImplementation(()=>{});
  try {
   for(let pass=0;pass<3;pass++)for(const [x,y] of [[430,475],[520,475],[520,365],[520,475],[430,475]]){moveToken(f.ta.id,x,y);f.snap();}
   expect(contains(f.snap().exploredTerrain,415,250)).toBe(true);expect(warnings).not.toHaveBeenCalled();
  }finally{warnings.mockRestore();}
 });
 it('remembers visited rooms after sight is lost and shares terrain without sharing live enemy visibility',()=>{
  const f=fixture();
  expect(contains(f.snap().exploredTerrain,900,100)).toBe(false);
  moveToken(f.ta.id,800,100); // DM relocation for this unit fixture.
  expect(f.snap().tokens.some(t=>t.id===f.enemy.id)).toBe(true);
  expect(contains(f.snap().exploredTerrain,900,100)).toBe(true);
  moveToken(f.ta.id,100,100);
  const snap=f.snap();expect(contains(snap.exploredTerrain,900,100)).toBe(true);
  expect(snap.tokens.some(t=>t.id===f.enemy.id)).toBe(false);
  expect(snap.monsters.some(m=>m.id===f.enemy.refId)).toBe(false);
  expect(contains(f.snap('explorer-b').exploredTerrain,900,100)).toBe(true);
  expect(f.snap('explorer-b').tokens.some(t=>t.id===f.enemy.id)).toBe(false);
 });
 it('persists through cache loss, reclaim and map switching; DM-only prep does not explore',()=>{
  const f=fixture();
  buildSnapshot(f.s.id,'dm',f.map.id);
  expect(db.prepare('SELECT count(*) n FROM explored_terrain WHERE map_id=?').get(f.map.id)).toEqual({n:0});
  moveToken(f.ta.id,800,100);f.snap();moveToken(f.ta.id,100,100);
  clearExplorationCache();claimCharacter(f.a.id,'reconnected');
  const second=createMap(f.s.id,{name:'Second map'});setActiveMap(f.s.id,second.id);
  expect(f.snap('reconnected').exploredTerrain).toEqual([]);
  setActiveMap(f.s.id,f.map.id);
  expect(contains(f.snap('reconnected').exploredTerrain,900,100)).toBe(true);
 });
 it('manual map fog blocks both learning and displaying memories but token fog is not a terrain curtain',()=>{
  const f=fixture();moveToken(f.ta.id,800,100);
  setFogLayer(f.map.id,'map',true);setFogRevealed(f.map.id,'map',['16,2']);
  expect(contains(f.snap().exploredTerrain,900,100)).toBe(false);
  setFogRevealed(f.map.id,'map',['16,2','18,2']);
  expect(contains(f.snap().exploredTerrain,910,110)).toBe(true);
  setFogRevealed(f.map.id,'map',[]);expect(f.snap().exploredTerrain).toEqual([]);
  setFogLayer(f.map.id,'map',false);moveToken(f.ta.id,100,100);
  expect(contains(f.snap().exploredTerrain,910,110)).toBe(true);
  setFogLayer(f.map.id,'tokens',true);setFogRevealed(f.map.id,'tokens',[]);
  expect(contains(f.snap().exploredTerrain,910,110)).toBe(true);
 });
 it('uses darkvision range and distant wall-clipped light pools, with no exploration beyond either',()=>{
  const vision={rangeFt:60 as const,radius:600,heavy:true,origins:[{id:'pc',x:0,y:0}],lights:[{id:'torch',x:1500,y:0,radius:100,height:20,strength:1}]};
  let area=visibleTerrain(vision);
  expect(contains(area,500,0)).toBe(true);expect(contains(area,900,0)).toBe(false);expect(contains(area,1500,0)).toBe(true);
  area=visibleTerrain({...vision,walls:[{id:'wall',ax:1200,ay:-1000,bx:1200,by:1000}]});
  expect(contains(area,1500,0)).toBe(false);
 });
 it('keeps memories after lights go out and does not inherit history when the terrain is replaced',()=>{
  const f=fixture();updateMapEnvironment(f.s.id,f.map.id,{enabled:true,lighting:'dungeon',heavyDarkness:true,lights:[{id:'torch',x:1500,y:0,radiusFt:10,heightFt:5,intensity:1,color:'warm',flicker:true}]});
  moveToken(f.ta.id,800,100);f.snap();moveToken(f.ta.id,100,100);
  expect(contains(f.snap().exploredTerrain,900,100)).toBe(true);
  db.prepare('UPDATE maps SET image_path=? WHERE id=?').run('/uploads/replacement.png',f.map.id);
  expect(contains(f.snap().exploredTerrain,900,100)).toBe(false);
 });
 it('backs up and restores party history with remapped map IDs, and accepts old saves',()=>{
  const f=fixture();moveToken(f.ta.id,800,100);f.snap();moveToken(f.ta.id,100,100);
  const bundle=exportSession(f.s.code)!;expect(bundle.exploredTerrain).toHaveLength(1);
  const restored=importSession(bundle),s=getSessionByCode(restored.code)!,map=listMaps(s.id)[0],a=listCharacters(s.id).find(c=>c.name==='Viewer A')!;
  claimCharacter(a.id,'restored');
  expect(contains(buildSnapshot(s.id,'player',map.id,'restored')!.exploredTerrain,900,100)).toBe(true);
  delete bundle.exploredTerrain;expect(()=>importSession(bundle)).not.toThrow();
 });
});
