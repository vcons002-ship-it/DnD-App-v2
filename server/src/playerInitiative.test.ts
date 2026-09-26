import { afterEach, expect, it, vi } from 'vitest';
import { createSession, createMap, setActiveMap, createCharacter, createToken, claimCharacter,
  startCombat, rollPlayerInitiative, getSessionById, getToken, listRollLog, finishInitiative,
  rollMissingInitiative, advanceTurn, clearInitiative } from './sessions.js';
afterEach(() => vi.restoreAllMocks());
function arena() {
  const s=createSession('Initiative'), map=createMap(s.id,{name:'Arena'});
  setActiveMap(s.id,map.id);
  const pc=createCharacter(s.id,{name:'Player',stats:{DEX:14}});
  const npc=createCharacter(s.id,{name:'DM character'});
  claimCharacter(pc.id,'owner');
  const a=createToken({mapId:map.id,kind:'pc',refId:pc.id,x:50,y:50});
  const b=createToken({mapId:map.id,kind:'pc',refId:npc.id,x:100,y:50});
  vi.spyOn(Math,'random').mockReturnValue(.5);
  return {s,map,a,b};
}
it('starts with DM creatures rolled and waits for a claimed player',()=>{
  const f=arena();startCombat(f.s.id);
  expect(getToken(f.a.id)!.initiative).toBeNull();
  expect(getToken(f.b.id)!.initiative).not.toBeNull();
  expect(getSessionById(f.s.id)).toMatchObject({initiativePending:true,combatRound:0,activeTurnTokenId:null});
  advanceTurn(f.s.id);
  expect(getSessionById(f.s.id)!.activeTurnTokenId).toBeNull();
  expect(rollPlayerInitiative(f.s.id,f.a.id,'other')).toBe(false);
  expect(rollPlayerInitiative(f.s.id,f.a.id,'owner')).toBe(true);
  expect(getToken(f.a.id)!.initiative).toBe(13);
  expect(getSessionById(f.s.id)).toMatchObject({initiativePending:false,combatRound:1,activeTurnTokenId:f.a.id});
  expect(rollPlayerInitiative(f.s.id,f.a.id,'owner')).toBe(false);
  expect(listRollLog(f.s.id).filter(r=>r.label==='Initiative')).toHaveLength(1);
});
it('DM Roll remaining finishes the phase without rerolling existing results',()=>{
  const f=arena();startCombat(f.s.id);const initial=getToken(f.b.id)!.initiative;
  rollMissingInitiative(f.map.id);finishInitiative(f.s.id);
  expect(getToken(f.b.id)!.initiative).toBe(initial);
  expect(getSessionById(f.s.id)!.initiativePending).toBe(false);
  expect(getSessionById(f.s.id)!.combatRound).toBe(1);
});
it('disconnected players roll automatically and End combat cancels pending requests',()=>{
  const f=arena();startCombat(f.s.id,()=>false);
  expect(getSessionById(f.s.id)!.initiativePending).toBe(false);
  expect(getToken(f.a.id)!.initiative).not.toBeNull();
  clearInitiative(f.s.id);startCombat(f.s.id);clearInitiative(f.s.id);
  expect(rollPlayerInitiative(f.s.id,f.a.id,'owner')).toBe(false);
  expect(getSessionById(f.s.id)!.initiativePending).toBe(false);
});
