import {describe,it,expect} from 'vitest';
import {createSession,createMap,createCharacter,claimCharacter,createToken,createMonsterTemplate,instantiateMonster,setActiveMap,moveToken,setTokenHidden,setFogLayer,setFogRevealed,updateMapEnvironment,setExplorationMode,setSharedPartyVision,getMap,getSessionByCode,listTokens,listCharacters,listMaps} from './sessions.js';
import {editMapWalls} from './mapWalls.js';
import {buildSnapshot} from './visibility.js';
import {exportSession,importSession} from './backup.js';
import {clearExplorationCache} from './exploration.js';
import {recordWalkingMove} from './walking.js';
import {db} from './db.js';

function fixture(mode:'day'|'regular'|'heavy'='day'){
 const s=createSession('Keep revealed'),map=createMap(s.id,{name:'Two rooms'});
 const c=createCharacter(s.id,{name:'Explorer'});claimCharacter(c.id,'viewer');
 const pc=createToken({mapId:map.id,kind:'pc',refId:c.id,x:400,y:200});
 const m=instantiateMonster(createMonsterTemplate(s.id,{name:'Goblin',maxHp:7}).id)!;
 const enemy=createToken({mapId:map.id,kind:'monster',refId:m.id,x:500,y:200});
 editMapWalls(s.id,map.id,{add:{id:'wall',ax:300,ay:-1000,bx:300,by:1000}});
 setActiveMap(s.id,map.id);setExplorationMode(s.id,map.id,'revealed');
 updateMapEnvironment(s.id,map.id,{enabled:true,lighting:mode==='day'?'day':'dungeon',heavyDarkness:mode==='heavy',lights:[]});
 return {s,map,pc,enemy,snap:()=>buildSnapshot(s.id,'player',null,'viewer')!};
}
describe('keep revealed fog',()=>{
 for(const mode of ['day','regular','heavy'] as const)it(`${mode}: keeps full-color frozen figures after sight is lost, without leaking movement or allowing a direct target`,()=>{
  const f=fixture(mode);expect(f.snap().tokens.find(t=>t.id===f.enemy.id)?.sharedSightOnly).toBeUndefined();
  moveToken(f.pc.id,100,200);moveToken(f.enemy.id,650,200);
  db.prepare("UPDATE monsters SET icon='changed',conditions=? WHERE id=?").run(JSON.stringify([{id:'secret',label:'Secret condition'}]),f.enemy.refId);
  const snap=f.snap(),ghost=snap.tokens.find(t=>t.id===f.enemy.id)!;
  expect(ghost).toMatchObject({x:500,y:200,sharedSightOnly:true,revealedOnly:true});
  expect(snap.monsters.find(m=>m.id===f.enemy.refId)?.icon).not.toBe('changed');
  expect(snap.monsters.find(m=>m.id===f.enemy.refId)?.conditions).toEqual([]);
  expect(snap.map?.explorationMode).toBe('revealed');
  expect(buildSnapshot(f.s.id,'dm',f.map.id)!.tokens.find(t=>t.id===f.enemy.id)).toMatchObject({x:650});
  setExplorationMode(f.s.id,f.map.id,'remembered');expect(f.snap().tokens.some(t=>t.id===f.enemy.id)).toBe(false);
 });
 it('does not retain unseen creatures, concealed creatures, or manually covered cells',()=>{
  const f=fixture();moveToken(f.pc.id,100,200);expect(f.snap().tokens.some(t=>t.id===f.enemy.id)).toBe(false);
  moveToken(f.pc.id,400,200);f.snap();moveToken(f.pc.id,100,200);
  setFogLayer(f.map.id,'tokens',true);setFogRevealed(f.map.id,'tokens',[]);expect(f.snap().tokens.some(t=>t.id===f.enemy.id)).toBe(false);
  setFogLayer(f.map.id,'tokens',false);setTokenHidden(f.enemy.id,true);expect(f.snap().tokens.some(t=>t.id===f.enemy.id)).toBe(false);
 });
 it('still limits retained figures by the viewer heavy-darkness distance',()=>{
  const f=fixture('heavy');f.snap();
  const friend=createCharacter(f.s.id,{name:'Distant observer'});createToken({mapId:f.map.id,kind:'pc',refId:friend.id,x:450,y:250});
  moveToken(f.pc.id,-200,200);expect(f.snap().tokens.some(t=>t.id===f.enemy.id)).toBe(false);
  updateMapEnvironment(f.s.id,f.map.id,{heavyDarkness:false});expect(f.snap().tokens.find(t=>t.id===f.enemy.id)?.revealedOnly).toBe(true);
 });
 it('clears a last-seen figure when the party sees its now-empty old location',()=>{
  const f=fixture();f.snap();moveToken(f.pc.id,100,200);moveToken(f.enemy.id,500,500);f.snap();
  editMapWalls(f.s.id,f.map.id,{add:{id:'new-room',ax:300,ay:400,bx:2000,by:400}});
  moveToken(f.pc.id,400,200);expect(f.snap().tokens.some(t=>t.id===f.enemy.id)).toBe(false);
  editMapWalls(f.s.id,f.map.id,{removeId:'new-room'});
  expect(f.snap().tokens.find(t=>t.id===f.enemy.id)).toMatchObject({x:500,y:500});
 });
 it('persists and remaps frozen appearances through campaign export/import, defaults conservatively and scopes edits',()=>{
  const f=fixture(),other=createSession('Other');
  expect(setExplorationMode(other.id,f.map.id,'revealed')).toBe(false);
  expect(setExplorationMode(f.s.id,f.map.id,'bad' as any)).toBe(false);
  expect(getMap(createMap(f.s.id,{name:'Default'}).id)?.explorationMode).toBe('remembered');
  f.snap();moveToken(f.pc.id,100,200);moveToken(f.enemy.id,650,200);f.snap();
  clearExplorationCache();expect(f.snap().tokens.find(t=>t.id===f.enemy.id)?.x).toBe(500);
  const restored=importSession(exportSession(f.s.code)!);const sid=getSessionByCode(restored.code)!.id;const map=listMaps(sid).find(m=>m.name==='Two rooms')!;
  const c=listCharacters(sid).find(c=>c.name==='Explorer')!;claimCharacter(c.id,'restored');
  const snap=buildSnapshot(sid,'player',map.id,'restored')!;
  expect(snap.map?.explorationMode).toBe('revealed');
  const enemy=listTokens(map.id).find(t=>t.kind==='monster')!;
  expect(snap.tokens.find(t=>t.id===enemy.id)).toMatchObject({x:500,revealedOnly:true});
 });
 it('updates remembered creature location in DB when found at a new spot or cleared via walking sweep and multi-PC memory',async ()=>{
  const f=fixture();
  // Initial sighting at (500, 200), then lose sight and enemy moves to (500, 600).
  expect(f.snap().tokens.find(t=>t.id===f.enemy.id)).toMatchObject({x:500,y:200});
  moveToken(f.pc.id,100,200);moveToken(f.enemy.id,500,600);
  expect(f.snap().tokens.find(t=>t.id===f.enemy.id)).toMatchObject({x:500,y:200,revealedOnly:true});
  // Add a horizontal wall at y=400 separating (500, 200) from (500, 600).
  editMapWalls(f.s.id,f.map.id,{add:{id:'h-wall',ax:300,ay:400,bx:2000,by:400}});
  // Player sees the creature in the lower room at (400, 600), then returns behind the vertical wall at (100, 600).
  moveToken(f.pc.id,400,600);
  expect(f.snap().tokens.find(t=>t.id===f.enemy.id)).toMatchObject({x:500,y:600});
  moveToken(f.pc.id,100,600);moveToken(f.enemy.id,800,600);
  clearExplorationCache();
  expect(f.snap().tokens.find(t=>t.id===f.enemy.id)).toMatchObject({x:500,y:600,revealedOnly:true});
  // Walking sweep through the lower room when enemy has moved away behind another wall clears the remembered spot.
  editMapWalls(f.s.id,f.map.id,{add:{id:'far-wall',ax:700,ay:400,bx:700,by:1000}});
  const beforeWalk=moveToken(f.pc.id,400,600)!;
  const afterWalk=moveToken(f.pc.id,450,600)!;
  await recordWalkingMove(beforeWalk,afterWalk,true);
  moveToken(f.pc.id,100,600);
  clearExplorationCache();
  expect(f.snap().tokens.some(t=>t.id===f.enemy.id)).toBe(false);
  // Multi-PC personal vision (e.g. DM Party View combining personal memories): when one PC sees the old location is empty, stale memory from another PC is cleared.
  setSharedPartyVision(f.s.id,f.map.id,false);
  const partyView=()=>buildSnapshot(f.s.id,'dm',f.map.id,undefined,undefined,true)!.partyView!;
  const c2=createCharacter(f.s.id,{name:'Scout'});claimCharacter(c2.id,'scout-viewer');
  const pc2=createToken({mapId:f.map.id,kind:'pc',refId:c2.id,x:800,y:600});
  expect(partyView().tokens.find(t=>t.id===f.enemy.id)).toMatchObject({x:800,y:600});
  moveToken(pc2.id,100,600);moveToken(f.enemy.id,500,200);
  expect(partyView().tokens.find(t=>t.id===f.enemy.id)).toMatchObject({x:800,y:600,revealedOnly:true});
  // Explorer (pc) moves to (800, 600) and sees the spot is now empty, then moves back to (100, 600).
  moveToken(f.pc.id,800,600);partyView();moveToken(f.pc.id,100,600);
  expect(partyView().tokens.some(t=>t.id===f.enemy.id)).toBe(false);
 });
});
