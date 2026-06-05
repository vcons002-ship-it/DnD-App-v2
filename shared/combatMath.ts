// Derived 5e combat math: proficiency, attack/damage rolls, saves. Pure +
// framework-free so the server resolves authoritatively and it's unit-tested.
import type { Weapon } from './types.js';
import { abilityMod, proficiencyBonus, signed } from './skills.js';
import { rollDice } from './dice.js';

export type Advantage = 'adv' | 'dis';

/** A creature reduced to what combat math needs. `level` is PC level or CR. */
export type Combatant = {
  stats: Record<string, number>;
  level: number;
  isMonster: boolean;
};

const d20 = () => 1 + Math.floor(Math.random() * 20);
const rollWithAdv = (advantage?: Advantage): number => {
  const a = d20();
  if (!advantage) return a;
  const b = d20();
  return advantage === 'adv' ? Math.max(a, b) : Math.min(a, b);
};

/** Monster proficiency bonus by challenge rating (CR 0–4 → +2, 5–8 → +3, …). */
export const profBonusForCR = (cr: number): number =>
  Math.max(2, Math.ceil(Math.max(0, cr) / 4) + 1);

export const profBonusFor = (c: Combatant): number =>
  c.isMonster ? profBonusForCR(c.level) : proficiencyBonus(c.level || 1);

/** Ranged → DEX; melee → the better of STR/DEX (covers finesse). */
function weaponAbility(c: Combatant, w: Weapon): 'STR' | 'DEX' {
  if (w.kind === 'ranged') return 'DEX';
  return abilityMod(c.stats.DEX) > abilityMod(c.stats.STR) ? 'DEX' : 'STR';
}

/** A weapon's to-hit: the tagged value if present, else ability mod + prof. */
export function weaponAttackBonus(c: Combatant, w: Weapon): number {
  if (typeof w.attackBonus === 'number') return w.attackBonus;
  return abilityMod(c.stats[weaponAbility(c, w)]) + profBonusFor(c);
}

/** The ability modifier a weapon uses to attack (STR/DEX per the rules above). */
export function weaponAbilityMod(c: Combatant, w: Weapon): number {
  return abilityMod(c.stats[weaponAbility(c, w)]);
}

/** Split "1d8+3" into its dice expression and flat modifier. */
export function damageParts(expr: string): { dice: string; flat: number } {
  const cleaned = expr.replace(/\s+/g, '');
  let dice = '';
  const diceRe = /([+-]?)(\d*)d(\d+)/gi;
  let m: RegExpExecArray | null;
  while ((m = diceRe.exec(cleaned))) {
    dice += `${m[1] || '+'}${m[2] || '1'}d${m[3]}`;
  }
  let flat = 0;
  const noDice = cleaned.replace(/([+-]?)(\d*)d(\d+)/gi, '');
  const flatRe = /([+-]?\d+)/g;
  while ((m = flatRe.exec(noDice))) flat += parseInt(m[1], 10);
  return { dice: dice.replace(/^\+/, ''), flat };
}

export type AttackOutcome = {
  face: number;
  bonus: number;
  attackTotal: number;
  crit: boolean;
  fumble: boolean;
  hit: boolean;
  damage: number;
  detail: string;
};

/** Resolve a weapon attack vs a target AC, including crit (double dice). */
export function rollWeaponAttack(
  attacker: Combatant,
  weapon: Weapon,
  targetAC: number,
  advantage?: Advantage,
): AttackOutcome {
  const face = rollWithAdv(advantage);
  const bonus = weaponAttackBonus(attacker, weapon);
  const attackTotal = face + bonus;
  const crit = face === 20;
  const fumble = face === 1;
  const hit = crit || (!fumble && attackTotal >= targetAC);

  let damage = 0;
  let dmgText = '';
  if (hit) {
    const { dice, flat } = damageParts(weapon.damage?.trim() || '1d4');
    const r1 = dice ? rollDice(dice) : null;
    let sum = flat;
    const diceStrs: string[] = [];
    if (r1) {
      sum += r1.total;
      diceStrs.push(`[${r1.rolls.join(',')}]`);
    }
    if (crit && dice) {
      const r2 = rollDice(dice)!;
      sum += r2.total;
      diceStrs.push(`crit[${r2.rolls.join(',')}]`);
    }
    damage = Math.max(1, sum);
    dmgText = `${diceStrs.join(' + ')}${flat ? ` ${signed(flat)}` : ''} = ${damage}`;
  }

  const result = crit ? 'CRIT' : fumble ? 'MISS (nat 1)' : hit ? 'HIT' : 'MISS';
  const detail =
    `${weapon.name}: d20[${face}] ${signed(bonus)} = ${attackTotal} vs AC ${targetAC} — ${result}` +
    (hit ? `, ${damage} dmg (${dmgText})` : '');

  return { face, bonus, attackTotal, crit, fumble, hit, damage, detail };
}

export type SaveOutcome = { face: number; mod: number; total: number; pass: boolean };

/** Roll a saving throw: d20 + ability modifier vs a DC. */
export function rollSavingThrow(
  c: Combatant,
  ability: string,
  dc: number,
  advantage?: Advantage,
): SaveOutcome {
  const face = rollWithAdv(advantage);
  const mod = abilityMod(c.stats[ability.toUpperCase()]);
  const total = face + mod;
  return { face, mod, total, pass: total >= dc };
}
