import { afterEach, expect, it, vi } from 'vitest';
import { createSession, createMap, setActiveMap, createCharacter, createToken,
  setManualDamage, setSheetAbility, getCharacter, listRollLog, setResource,
  setConcentration, getRollEntry, updateCharacter } from './sessions.js';
import { resolveAttack, resolveAttackDamage, resolveManeuver } from './combat.js';
import { getManeuver } from './maneuvers/srd.js';
import { isOnHitManeuver } from '../../shared/maneuvers.js';

afterEach(() => vi.restoreAllMocks());
function arena(manual: boolean) {
  const s = createSession('Maneuver test');
  const map = createMap(s.id, {name: 'Arena'});
  setActiveMap(s.id, map.id); setManualDamage(s.id, manual);
  const ch = createCharacter(s.id, {name: 'Fighter', className: 'Fighter', level: 5,
    stats: {STR: 10, DEX: 18}, weapons: [{name: 'Sword', kind: 'melee', damage: '3d1', damageType: 'slashing', attackBonus: 100}]});
  const target = createCharacter(s.id, {name: 'Target', maxHp: 200, armorClass: 1});
  setSheetAbility('pc', ch.id, {...getManeuver('Trip Attack')!, id: 'trip'});
  const a = createToken({mapId: map.id, kind: 'pc', refId: ch.id, x: 0, y: 0});
  const b = createToken({mapId: map.id, kind: 'pc', refId: target.id, x: 60, y: 0});
  vi.spyOn(Math, 'random').mockReturnValue(.5);
  const hit = () => { resolveAttack(s.id, 'DM', a.id, b.id, 0); return listRollLog(s.id).filter(e => e.label === 'Attack').at(-1)!; };
  return {s, ch, target, hit};
}
for (const manual of [false, true]) {
  it(`offers known maneuvers after a hit and combines damage once (manual=${manual})`, () => {
    const f = arena(manual); setConcentration('pc', f.target.id, 'Bless');
    const hit = f.hit();
    expect(hit.pending?.maneuver?.abilityIds).toEqual(['trip']);
    expect(getCharacter(f.target.id)!.curHp).toBe(200);
    expect(resolveManeuver(f.s.id, 'DM', hit.id, 'trip')).toEqual({ok: true});
    expect(getCharacter(f.target.id)!.curHp).toBe(192);
    expect(getCharacter(f.ch.id)!.resources['Superiority Dice'].used).toBe(1);
    expect(listRollLog(f.s.id).filter(e => e.label === 'Concentration')).toHaveLength(1);
    expect(listRollLog(f.s.id).find(e => e.label === 'Trip Attack')?.apply).toMatchObject({amount: 0, dc: 15, onFail: 'Prone'});
    expect(resolveManeuver(f.s.id, 'DM', hit.id, 'trip').ok).toBe(false);
    expect(resolveAttackDamage(f.s.id, 'DM', hit.id)).toBe(false);
  });
  it(`normal damage skips the maneuver without spending a die (manual=${manual})`, () => {
    const f = arena(manual), hit = f.hit();
    expect(resolveAttackDamage(f.s.id, 'DM', hit.id)).toBe(true);
    expect(getCharacter(f.ch.id)!.resources['Superiority Dice'].used).toBe(0);
    expect(getCharacter(f.target.id)!.curHp).toBe(197);
    expect(resolveManeuver(f.s.id, 'DM', hit.id, 'trip').ok).toBe(false);
  });
}
it('doubles critical maneuver dice and rounds resistance on the whole damage type', () => {
  const f = arena(false); updateCharacter(f.target.id, {resistances: ['slashing']});
  let hit = f.hit(); resolveManeuver(f.s.id, 'DM', hit.id, 'trip');
  expect(getCharacter(f.target.id)!.curHp).toBe(196); // floor((3+5)/2), not 1+2
  vi.mocked(Math.random).mockReturnValue(.999);
  hit = f.hit(); resolveManeuver(f.s.id, 'DM', hit.id, 'trip');
  expect(getCharacter(f.target.id)!.curHp).toBe(185); // (6+16)/2
  const p = getRollEntry(hit.id)!.pending!;
  expect(p.damageBreakdown!.dice.concat(p.damageBreakdown!.mods).reduce((n,d) => n+d.value,0)).toBe(p.amount);
});
it('rejects unknown, exhausted, stale and already-used choices', () => {
  const f = arena(false), hit = f.hit();
  expect(resolveManeuver(f.s.id, 'DM', hit.id, 'unknown').ok).toBe(false);
  setResource(f.ch.id, 'resources', 'Superiority Dice', {used: 4});
  expect(resolveManeuver(f.s.id, 'DM', hit.id, 'trip').ok).toBe(false);
  setResource(f.ch.id, 'resources', 'Superiority Dice', {used: 0});
  f.hit();
  expect(resolveManeuver(f.s.id, 'DM', hit.id, 'trip').ok).toBe(false);
});
it('does not offer on misses or alongside a maneuver used for the attack roll', () => {
  const f = arena(false); vi.mocked(Math.random).mockReturnValue(0);
  expect(f.hit().pending).toBeUndefined();
  vi.mocked(Math.random).mockReturnValue(.5);
  const precision = getManeuver('Precision Attack')!;
  setSheetAbility('pc', f.ch.id, {...precision, id: 'precision', maneuver: {...precision.maneuver!, active: true}});
  expect(f.hit().pending?.maneuver).toBeUndefined();
  expect(getCharacter(f.ch.id)!.resources['Superiority Dice'].used).toBe(1);
});
it('keeps reaction, pre-attack, check and secondary-target maneuvers out of this choice', () => {
  for (const name of ['Precision Attack', 'Parry', 'Feinting Attack', 'Grappling Strike', 'Sweeping Attack', 'Riposte'])
    expect(isOnHitManeuver({...getManeuver(name)!, id: name})).toBe(false);
});
