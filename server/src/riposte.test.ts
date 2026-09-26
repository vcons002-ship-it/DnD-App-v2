import { afterEach, expect, it, vi } from 'vitest';
import { createSession, createMap, setActiveMap, createCharacter, createToken, setSheetAbility,
  getCharacter, setActiveTurn, setResource, updateCharacter, claimCharacter,
  listRollLog, setManualDamage, getRollEntry, clearInitiative } from './sessions.js';
import { resolveAttack, resolveRiposte, resolveAttackDamage } from './combat.js';
import { getManeuver } from './maneuvers/srd.js';
import { listRipostes, RIPOSTE_SPENT } from './reactions.js';
import { buildSnapshot } from './visibility.js';

afterEach(() => vi.restoreAllMocks());
function arena(manual = false, ranged = false, distance = 50) {
  const s = createSession('Reactions');
  const map = createMap(s.id, {name: 'Arena'}); setActiveMap(s.id, map.id); setManualDamage(s.id, manual);
  const fighter = createCharacter(s.id, {name:'Fighter', className:'Fighter', level:5, maxHp:100, armorClass:50, stats:{STR:10},
    weapons:[{name:'Sword',kind:'melee',damage:'3d1',attackBonus:100}]});
  const foe = createCharacter(s.id, {name:'Foe', maxHp:100, armorClass:1,
    weapons:[{name:'Attack',kind:ranged ? 'ranged':'melee',damage:'1d1',attackBonus:0}]});
  setSheetAbility('pc',fighter.id,{...getManeuver('Riposte')!,id:'riposte'});
  const a=createToken({mapId:map.id,kind:'pc',refId:foe.id,x:100,y:100});
  const d=createToken({mapId:map.id,kind:'pc',refId:fighter.id,x:100+distance,y:100});
  vi.spyOn(Math,'random').mockReturnValue(.5);
  const miss=()=>{resolveAttack(s.id,'DM',a.id,d.id,0);return listRipostes(s.id)[0];};
  return {s,fighter,foe,a,d,miss};
}
for(const manual of [false,true]) it(`Riposte spends once and adds a die only on its hit (manual=${manual})`,()=>{
  const f=arena(manual), offer=f.miss(); expect(offer.weaponIndices).toEqual([0]);
  expect(resolveRiposte(f.s.id,'Fighter',offer.id,0)).toEqual({ok:true});
  const hit=listRollLog(f.s.id).filter(e=>e.label==='Attack').at(-1)!;
  if(manual) expect(resolveAttackDamage(f.s.id,'Fighter',hit.id)).toBe(true);
  expect(getCharacter(f.foe.id)!.curHp).toBe(92);
  expect(getCharacter(f.fighter.id)!.resources['Superiority Dice'].used).toBe(1);
  expect(getCharacter(f.fighter.id)!.conditions.some(c=>c.label===RIPOSTE_SPENT)).toBe(true);
  expect(resolveRiposte(f.s.id,'Fighter',offer.id,0).ok).toBe(false);
  expect(f.miss()).toBeUndefined();
  setActiveTurn(f.s.id,f.d.id);
  expect(f.miss()).toBeTruthy();
});
it('a missed Riposte spends its die and reaction but deals no damage',()=>{
  const f=arena(),offer=f.miss(); vi.mocked(Math.random).mockReturnValue(0);
  resolveRiposte(f.s.id,'Fighter',offer.id,0);
  expect(getCharacter(f.foe.id)!.curHp).toBe(100);
  expect(getCharacter(f.fighter.id)!.resources['Superiority Dice'].used).toBe(1);
});
it('a critical Riposte doubles both weapon and superiority dice',()=>{
  const f=arena(),offer=f.miss(); vi.mocked(Math.random).mockReturnValue(.999);
  resolveRiposte(f.s.id,'Fighter',offer.id,0);
  expect(getCharacter(f.foe.id)!.curHp).toBe(78);
});
it('never offers on ranged attacks, out-of-reach attacks or exhausted dice',()=>{
  expect(arena(false,true).miss()).toBeUndefined();
  expect(arena(false,false,150).miss()).toBeUndefined();
  const f=arena(); setResource(f.fighter.id,'resources','Superiority Dice',{used:4});
  expect(f.miss()).toBeUndefined();
});
it('expiry, passing and a turn change consume no dice',()=>{
  const f=arena(),offer=f.miss();
  expect(resolveRiposte(f.s.id,'Fighter',offer.id,undefined,true).ok).toBe(true);
  const expired=f.miss(); vi.spyOn(Date,'now').mockReturnValue(expired.expiresAt+1);
  expect(resolveRiposte(f.s.id,'Fighter',expired.id,0).ok).toBe(false);
  vi.mocked(Date.now).mockRestore();
  const stale=f.miss(); setActiveTurn(f.s.id,f.a.id);
  expect(resolveRiposte(f.s.id,'Fighter',stale.id,0).ok).toBe(false);
  expect(getCharacter(f.fighter.id)!.resources['Superiority Dice'].used).toBe(0);
});
it('revalidates incapacitation and resources at click time',()=>{
  const f=arena(),offer=f.miss(); updateCharacter(f.fighter.id,{curHp:0});
  expect(resolveRiposte(f.s.id,'Fighter',offer.id,0).ok).toBe(false);
  expect(getCharacter(f.fighter.id)!.resources['Superiority Dice'].used).toBe(0);
});
it('only the defender and DM receive the opportunity',()=>{
  const f=arena(); claimCharacter(f.fighter.id,'fighter-socket'); f.miss();
  expect(buildSnapshot(f.s.id,'dm')!.ripostes).toHaveLength(1);
  // Default map fog can conceal the attacker; clear it for this visibility test.
  const owner=buildSnapshot(f.s.id,'player',null,'fighter-socket')!;
  expect(owner.ripostes?.length).toBe(owner.tokens.some(t=>t.id===f.a.id) ? 1:0);
  expect(buildSnapshot(f.s.id,'player',null,'other-socket')!.ripostes).toHaveLength(0);
});
it('ending combat clears spent Riposte reactions',()=>{
  const f=arena(),offer=f.miss();resolveRiposte(f.s.id,'DM',offer.id,0);
  clearInitiative(f.s.id);
  expect(getCharacter(f.fighter.id)!.conditions.some(c=>c.label===RIPOSTE_SPENT)).toBe(false);
});
