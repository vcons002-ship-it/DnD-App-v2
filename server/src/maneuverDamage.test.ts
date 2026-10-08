import { afterEach, expect, it, vi } from 'vitest';
import { createSession, createMap, setActiveMap, createCharacter, createToken,
  setManualDamage, setSheetAbility, getCharacter, listRollLog, setResource,
  setConcentration, getRollEntry, updateCharacter } from './sessions.js';
import { resolveAttack, resolveAttackDamage, resolveManeuver } from './combat.js';
import { getManeuver } from './maneuvers/srd.js';
import { isOnHitManeuver } from '../../shared/maneuvers.js';
import {runLiveCommand} from './liveRolls.js';
import type {PhysicalDiceInfo} from '../../shared/dice.js';
import type {LiveDiceFrame} from '../../shared/liveDiceTypes.js';
import {LIVE_DICE_RESULT_HOLD_MS} from '../../shared/dicePresentationTiming.js';

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
  return {s, ch, target, hit,a,b};
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
    expect(listRollLog(f.s.id).find(e => e.label === 'Trip Attack')?.apply).toBeUndefined();
    expect(listRollLog(f.s.id).some(e=>e.label==='STR save')).toBe(true);
    expect(getCharacter(f.target.id)!.conditions.some(c=>c.label==='Prone')).toBe(true);
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
it('rolls Pushing Attack only after the hit, then saves its already chosen target automatically',async()=>{
 const f=arena(true);updateCharacter(f.ch.id,{weapons:[{name:'Sword',kind:'melee',damage:'1d6',attackBonus:100}]});
 setSheetAbility('pc',f.ch.id,{...getManeuver('Pushing Attack')!,id:'push',maneuver:{...getManeuver('Pushing Attack')!.maneuver!,active:true}});
 const requests:{sides:number[];info?:PhysicalDiceInfo}[]=[];
 const live=async(run:()=>void)=>runLiveCommand(run,()=>{},{label:'Attack',roller:'Fighter',className:'Fighter'},async(sides,_p,_m,_seed,info)=>{requests.push({sides,info});return sides.map(s=>s===20?12:4);});
 await live(()=>{resolveAttack(f.s.id,'Fighter',f.a.id,f.b.id,0);});
 expect(requests.map(r=>r.sides)).toEqual([[20]]);expect(getCharacter(f.ch.id)!.resources['Superiority Dice'].used).toBe(0);
 const pending=listRollLog(f.s.id).find(e=>e.pending)!;
 await live(()=>{expect(resolveManeuver(f.s.id,'Fighter',pending.id,'push').ok).toBe(true);});
 expect(requests.map(r=>r.sides)).toEqual([[20],[6],[8],[20]]);
 expect(requests.map(r=>r.info?.label)).toEqual(['Sword — Attack Roll','Sword — Weapon Damage','Pushing Attack — Superiority damage','Pushing Attack — STR Saving Throw']);
 expect(requests[3].info?.target?.refId).toBe(f.target.id);
 expect(listRollLog(f.s.id).some(e=>e.apply)).toBe(false);
 expect(getCharacter(f.ch.id)!.resources['Superiority Dice'].used).toBe(1);
});

it('holds maximum unmodified superiority d8s before requesting the save, without committing the hit early',async()=>{
 const f=arena(true);updateCharacter(f.ch.id,{weapons:[{name:'Sword',kind:'melee',damage:'1d6',attackBonus:100}]});
 setSheetAbility('pc',f.ch.id,{...getManeuver('Pushing Attack')!,id:'push'});
 const requests:number[][]=[],holds:LiveDiceFrame[]=[];let frame:LiveDiceFrame,release:()=>void=()=>{};
 let notify:()=>void=()=>{};const reachedHold=new Promise<void>(resolve=>notify=resolve);
 const dice=async(sides:number[],publish:(f:LiveDiceFrame)=>void,meta:any)=>{
  requests.push(sides);
  const values=sides.map(s=>s===20?20:s===8?8:4);
  publish({id:`throw-${requests.length}`,seq:0,done:true,sides,values,label:meta.label,roller:'Fighter',className:'Fighter',sets:sides.map(()=>0),critical:sides.map(()=>false),percentile:sides.map(()=>null),poses:[],rerolls:sides.map(()=>0),radius:1,elapsed:1});return values;
 };
 const live=(run:()=>void)=>runLiveCommand(run,f=>{frame=f;},{label:'Attack',roller:'Fighter',className:'Fighter',waitForPresentation:async(_id,ms)=>{
  if(frame.resultHoldMs===undefined)return;
  holds.push(frame);expect(ms).toBe(LIVE_DICE_RESULT_HOLD_MS);notify();
  await new Promise<void>(resolve=>release=resolve);
 }},dice);
 await live(()=>{resolveAttack(f.s.id,'Fighter',f.a.id,f.b.id,0);});
 expect(holds).toHaveLength(0); // Natural 20 still goes straight to attack modifiers.
 const hit=listRollLog(f.s.id).find(e=>e.pending)!;
 const pending=live(()=>{expect(resolveManeuver(f.s.id,'Fighter',hit.id,'push').ok).toBe(true);});
 await reachedHold;
 expect(requests).toEqual([[20],[6,6],[8,8]]);
 expect(holds[0].values).toEqual([8,8]);expect(holds[0].calculation).toBeUndefined();
 expect(getCharacter(f.target.id)!.curHp).toBe(200);
 expect(getCharacter(f.ch.id)!.resources['Superiority Dice'].used).toBe(0);
 expect(getRollEntry(hit.id)!.pending!.done).not.toBe(true);
 release();await pending;
 expect(requests.at(-1)).toEqual([20]);expect(holds).toHaveLength(1);
 expect(getCharacter(f.ch.id)!.resources['Superiority Dice'].used).toBe(1);
 expect(getCharacter(f.target.id)!.curHp).toBeLessThan(200);
});
