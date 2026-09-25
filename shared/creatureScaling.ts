import type { AbilityRoll, CreatureAbility, Monster, SheetAbility, Weapon } from './types.js';
import { effectiveSheetAbility } from './spellExecution.js';
import { profBonusForCR, weaponAttackBonus } from './combatMath.js';

/** DMG (2014), p.274: HP/DPR range midpoints, AC, attack bonus, save DC.
 * Ratios preserve the original creature's deviations from the benchmark.
 * This is a scaling estimate, not a recalculation of effective offensive/defensive CR.
 */
const rows = [
  [0,3.5,0.5,13,3,13],[.125,21,2.5,13,3,13],[.25,42.5,4.5,13,3,13],
  [.5,60,7,13,3,13],[1,78,11.5,13,3,13],[2,93,17.5,13,3,13],
  [3,108,23.5,13,4,13],[4,123,29.5,14,5,14],[5,138,35.5,15,6,15],
  [6,153,41.5,15,6,15],[7,168,47.5,15,6,15],[8,183,53.5,16,7,16],
  [9,198,59.5,16,7,16],[10,213,65.5,17,7,16],[11,228,71.5,17,8,17],
  [12,243,77.5,17,8,17],[13,258,83.5,18,8,18],[14,273,89.5,18,8,18],
  [15,288,95.5,18,8,18],[16,303,101.5,18,9,18],[17,318,107.5,19,10,19],
  [18,333,113.5,19,10,19],[19,348,119.5,19,10,19],[20,378,131.5,19,10,19],
  [21,423,149.5,19,11,20],[22,468,167.5,19,11,20],[23,513,185.5,19,11,20],
  [24,558,203.5,19,12,21],[25,603,221.5,19,12,21],[26,648,239.5,19,12,21],
  [27,693,257.5,19,13,22],[28,738,275.5,19,13,22],[29,783,293.5,19,13,22],
  [30,828,311.5,19,14,23],
] as const;
export const CHALLENGE_RATINGS: readonly number[] = rows.map(r => r[0]);
export const crLabel = (cr: number) => ({ '.125':'1/8', '0.125':'1/8', '0.25':'1/4', '0.5':'1/2' }[String(cr)] ?? String(cr));
export const validCR = (cr: number) => CHALLENGE_RATINGS.includes(cr);
export type CreatureBaseline = Pick<Monster, 'level'|'maxHp'|'armorClass'|'stats'|'weapons'|'actions'|'abilities'|'sheetAbilities'>;
export function readCreatureBaseline(value: unknown): CreatureBaseline | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const b = value as CreatureBaseline;
  if (!validCR(b.level) || !Number.isFinite(b.maxHp) || b.maxHp < 1 || !Number.isFinite(b.armorClass) ||
      !b.stats || typeof b.stats !== 'object' || !Object.values(b.stats).every(Number.isFinite) ||
      !Array.isArray(b.weapons) || !b.weapons.every(w=>w && typeof w.name==='string') ||
      ![b.actions,b.abilities,b.sheetAbilities].every(a=>Array.isArray(a) && a.every(x=>x && typeof x.name==='string' && typeof x.description==='string'))) return undefined;
  return creatureBaseline(b);
}
export function creatureBaseline(m: CreatureBaseline): CreatureBaseline {
  return structuredClone({level:m.level,maxHp:m.maxHp,armorClass:m.armorClass,stats:m.stats,
    weapons:m.weapons,actions:m.actions,abilities:m.abilities,sheetAbilities:m.sheetAbilities});
}

/** Keep the original die type where possible; select dice and a nonnegative
 * remainder to approximate the target expectation within half a hit point. */
export function scaleDice(expression: string | undefined, ratio: number): string | undefined {
  if (!expression || ratio === 1) return expression;
  const cleaned=expression.replace(/\s/g,'').toLowerCase();
  const terms=cleaned.match(/[+-]?(?:\d*d\d+|\d+)/g);
  if (!terms || terms.join('')!==cleaned) return expression;
  let average=0, firstSides=0;
  for(const term of terms){
    const die=term.match(/^([+-]?)(\d*)d(\d+)$/);
    if(die){
      const sides=Number(die[3]), count=Number(die[2] || 1);
      if(sides<1 || sides>1000 || count<1 || count>100) return expression;
      firstSides ||= sides;
      average+=(die[1]==='-'?-1:1)*count*(sides+1)/2;
    } else average+=Number(term);
  }
  if(average<=0) return expression;
  return firstSides ? diceNear(average*ratio,firstSides) : String(Math.max(1,Math.round(average*ratio)));
}

function diceNear(expected: number, originalSides: number): string {
  const target=Math.max(1,expected);
  const sides=target < (originalSides+1)/2
    ? ([12,10,8,6,4,2,1].find(s=>s<=originalSides && (s+1)/2<=target) ?? 1) : originalSides;
  const count=Math.max(1,Math.min(100,Math.floor(target/((sides+1)/2))));
  const remainder=Math.round(target-count*(sides+1)/2);
  return `${count}d${sides}${remainder>0?'+'+remainder:remainder<0?remainder:''}`;
}

export function scaleCreature(base: CreatureBaseline, target: number) {
  const from = rows.find(r => r[0] === base.level), to = rows.find(r => r[0] === target);
  if (!from || !to) throw new Error('CR must be 0, 1/8, 1/4, 1/2, or an integer from 1 to 30.');
  if (target === base.level) return creatureBaseline(base);
  const damage = to[2]/from[2], hit = to[4]-from[4], dc = to[5]-from[5];
  const castingMod = Math.max(...['INT','WIS','CHA'].map(k=>Math.floor(((base.stats[k] ?? 10)-10)/2)));
  const spellHit = castingMod + profBonusForCR(base.level);
  const roll = (r?: AbilityRoll): AbilityRoll | undefined => r && ({...r,
    dice: scaleDice(r.dice,damage), scaleDice: scaleDice(r.scaleDice,damage), crCasterLevel: base.level,
    ...(r.kind === 'save' ? {dc: Math.max(1,(r.dc ?? 8+(r.castingAbility ? Math.floor(((base.stats[r.castingAbility] ?? 10)-10)/2)+profBonusForCR(base.level) : spellHit))+dc)} : {}),
    ...(r.kind === 'attack' ? {attackBonus:(r.attackBonus ?? (r.castingAbility ? Math.floor(((base.stats[r.castingAbility] ?? 10)-10)/2)+profBonusForCR(base.level) : spellHit))+hit} : {}),
  });
  // Only known numeric combat phrases change: never range, duration, recharge,
  // number of attacks, or a spell's level. Average (dice) damage stays consistent.
  const prose = (s: string) => s.replace(/(?:(\d+)\s*\()?\b(\d+d\d+(?:\s*[+-]\s*\d+)?)\)?(?=\s+(?:\w+\s+)?damage)/gi,
    (_all,avg,dice:string) => { const scaled=scaleDice(dice,damage)!; return avg ? `${Math.round(Number(avg)*damage)} (${scaled})` : scaled; })
    .replace(/\bDC\s+(\d+)/gi,(_m,n)=>`DC ${Math.max(1,Number(n)+dc)}`)
    .replace(/([+-]\d+)\s+to hit/gi,(_m,n)=>`${Number(n)+hit>=0?'+':''}${Number(n)+hit} to hit`);
  const ability = <T extends CreatureAbility | SheetAbility>(a:T): T => ({...a,description:prose(a.description),roll:roll(a.roll)});
  const weapons: Weapon[] = base.weapons.map(w=>{
    const autoAbility=w.kind==='ranged'?'DEX':w.tags?.includes('finesse') && (base.stats.DEX ?? 10)>(base.stats.STR ?? 10)?'DEX':'STR';
    const abilityMod=Math.floor(((base.stats[w.attackAbility ?? autoAbility] ?? 10)-10)/2);
    const baked=(dice?:string)=>w.diceOnly && dice ? `${dice}${abilityMod>=0?'+':''}${abilityMod}` : dice;
    const {diceOnly: _diceOnly, ...rest} = w;
    return {...rest,
    damage:scaleDice(baked(w.damage),damage), versatileDamage:scaleDice(baked(w.versatileDamage),damage),
    extraDamage:scaleDice(w.extraDamage,damage),
    ...(w.magicBonus !== undefined ? {magicBonus:Math.round(w.magicBonus*damage)} : {}),
    attackBonus:weaponAttackBonus({stats:base.stats,level:base.level,isMonster:true},w)+hit,
  };});
  return {...creatureBaseline(base),level:target,maxHp:Math.max(1,Math.round(base.maxHp*to[1]/from[1])),
    armorClass:Math.max(1,base.armorClass+to[3]-from[3]), weapons,
    actions:base.actions.map(ability),abilities:base.abilities.map(ability),sheetAbilities:base.sheetAbilities.map(a=>ability(effectiveSheetAbility(a)))};
}

export function scaledCurrentHp(current: number, oldMax: number, newMax: number): number {
  if (current <= 0) return 0;
  return Math.max(1,Math.min(newMax,Math.round(current/Math.max(1,oldMax)*newMax)));
}
