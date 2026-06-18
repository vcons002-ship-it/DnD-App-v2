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

/**
 * Roll a d20 honoring advantage/disadvantage, returning the chosen face plus a
 * display breakdown that shows BOTH dice: `d20[a,b]→adv face` (or `d20[a]` for a
 * straight roll). Shared by every server-side d20 roll so the log is uniform.
 */
export function rollD20Detail(advantage?: Advantage): { face: number; detail: string } {
  const a = d20();
  if (!advantage) return { face: a, detail: `d20[${a}]` };
  const b = d20();
  const face = advantage === 'adv' ? Math.max(a, b) : Math.min(a, b);
  return { face, detail: `d20[${a},${b}]→${advantage} ${face}` };
}

/** Monster proficiency bonus by challenge rating (CR 0–4 → +2, 5–8 → +3, …). */
export const profBonusForCR = (cr: number): number =>
  Math.max(2, Math.ceil(Math.max(0, cr) / 4) + 1);

export const profBonusFor = (c: Combatant): number =>
  c.isMonster ? profBonusForCR(c.level) : proficiencyBonus(c.level || 1);

/** Ranged → DEX; melee → the better of STR/DEX (covers finesse). */
/** Ranged → DEX; melee `finesse` weapons → better of STR/DEX; other melee → STR. */
function weaponAbility(c: Combatant, w: Weapon): 'STR' | 'DEX' {
  if (w.kind === 'ranged') return 'DEX';
  const finesse = (w.tags ?? []).some((t) => t.trim().toLowerCase() === 'finesse');
  if (finesse) return abilityMod(c.stats.DEX) > abilityMod(c.stats.STR) ? 'DEX' : 'STR';
  return 'STR';
}

/** A weapon's to-hit: the tagged value if present, else ability mod + prof. */
export function weaponAttackBonus(c: Combatant, w: Weapon): number {
  if (typeof w.attackBonus === 'number') return w.attackBonus;
  return abilityMod(c.stats[weaponAbility(c, w)]) + profBonusFor(c);
}

/**
 * A weapon's to-hit AS A LABELLED BREAKDOWN for the roll log, e.g.
 * `+3[STR] +2[PROF]` when derived from live stats, or `+5[hit]` when a fixed
 * `attackBonus` overrides it. Mirrors the damage breakdown so the to-hit math is
 * transparent; `bonus` equals what `weaponAttackBonus` returns.
 */
export function weaponAttackBonusDetail(
  c: Combatant,
  w: Weapon,
): { bonus: number; detail: string; parts: { label: string; value: number }[] } {
  if (typeof w.attackBonus === 'number')
    return {
      bonus: w.attackBonus,
      detail: `${signed(w.attackBonus)}[hit]`,
      parts: w.attackBonus ? [{ label: 'hit', value: w.attackBonus }] : [],
    };
  const ability = weaponAbility(c, w);
  const abil = abilityMod(c.stats[ability]);
  const prof = profBonusFor(c);
  return {
    bonus: abil + prof,
    detail: `${signed(abil)}[${ability}] ${signed(prof)}[PROF]`,
    parts: [
      ...(abil ? [{ label: ability, value: abil }] : []),
      { label: 'PROF', value: prof },
    ],
  };
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

/** One labelled term in an attack's reveal breakdown (mirrors `RollReveal`'s
 *  `RevealStep`, kept local so `shared/combatMath` needn't import the big types). */
export type AttackStep = { label: string; value: number; faces?: number[] };
export type AttackOutcome = {
  face: number;
  bonus: number;
  attackTotal: number;
  crit: boolean;
  fumble: boolean;
  hit: boolean;
  damage: number;
  detail: string;
  /** Structured to-hit bonuses (ability mod, proficiency, maneuver…) for the
   *  reveal animation — the running total counts d20 + these up to attackTotal. */
  toHitSteps: AttackStep[];
  /** Damage dice (each with its faces) — a crit appends a second dice step. */
  damageDiceSteps: AttackStep[];
  /** Flat damage modifiers (ability mod, magic, mastery) after the dice. */
  damageModSteps: AttackStep[];
};

/** Resolve a weapon attack vs a target AC, including crit (double dice). */
export function rollWeaponAttack(
  attacker: Combatant,
  weapon: Weapon,
  targetAC: number,
  advantage?: Advantage,
  opts?: {
    twoHanded?: boolean;
    noAbilityMod?: boolean;
    bonusDamage?: number;
    bonusLabel?: string;
    /** Extra added to the attack roll itself (e.g. a Precision maneuver die). */
    attackRollBonus?: number;
    /** Log label for that extra, e.g. "maneuver" or the granting item's name. */
    attackRollBonusLabel?: string;
    /** Force a critical hit on ANY hit (e.g. an attack within 5 ft of a paralyzed
     *  or unconscious target). Does not turn a miss into a hit. */
    forceCrit?: boolean;
  },
): AttackOutcome {
  const { face, detail: d20detail } = rollD20Detail(advantage);
  const { bonus, detail: bonusDetail, parts: bonusParts } = weaponAttackBonusDetail(attacker, weapon);
  const toHitExtra = opts?.attackRollBonus ?? 0;
  // Structured to-hit breakdown for the reveal animation (d20 + these).
  const toHitSteps: AttackStep[] = [
    ...bonusParts,
    ...(toHitExtra ? [{ label: opts?.attackRollBonusLabel || 'maneuver', value: toHitExtra }] : []),
  ];
  const attackTotal = face + bonus + toHitExtra;
  const natCrit = face === 20;
  const fumble = face === 1;
  const hit = natCrit || (!fumble && attackTotal >= targetAC);
  const crit = hit && (natCrit || !!opts?.forceCrit); // auto-crit only on a hit

  // Versatile weapons use their two-handed dice when wielded 2H.
  const expr =
    (opts?.twoHanded && weapon.versatileDamage?.trim()) || weapon.damage?.trim() || '1d4';

  let damage = 0;
  let dmgText = '';
  const damageDiceSteps: AttackStep[] = [];
  const damageModSteps: AttackStep[] = [];
  if (hit) {
    const { dice, flat } = damageParts(expr);
    const magic = weapon.magicBonus ?? 0;
    // PCs add their ability modifier to damage at roll time (weapons store dice
    // only); monster stat blocks already bake it in — EXCEPT weapons flagged
    // `diceOnly` (e.g. a creature attack picked from the weapon/natural library),
    // which behave like a PC weapon and pull the mod from live stats. Off-hand /
    // Cleave omit it.
    const usesAbilityMod = !attacker.isMonster || !!weapon.diceOnly;
    const addAbilityMod = usesAbilityMod && !opts?.noAbilityMod;
    const abil = addAbilityMod ? weaponAbilityMod(attacker, weapon) : 0;
    // A dice-only weapon's `damage` must carry NO baked flat modifier — the
    // ability mod is added above, so honoring a stray flat too would double-count
    // it (the classic "+DEX twice" bug). Ignore it for those; pre-baked monster
    // damage keeps its flat.
    const usableFlat = usesAbilityMod ? 0 : flat;
    const bonus2 = opts?.bonusDamage ?? 0; // flat on-hit mastery damage (e.g. GWM), folded in
    const r1 = dice ? rollDice(dice) : null;
    let sum = usableFlat + magic + abil + bonus2; // magic/ability/bonus added once, not doubled on a crit
    // Compact, labelled breakdown, e.g. "2d6[4,6]+[3,5][CRIT]+4[STR]+1[MAGIC]+3[GWM]".
    const parts: string[] = [];
    if (r1) {
      sum += r1.total;
      parts.push(`${dice}[${r1.rolls.join(',')}]`);
      damageDiceSteps.push({ label: dice, value: r1.total, faces: r1.rolls });
    }
    if (crit && dice) {
      const r2 = rollDice(dice)!;
      sum += r2.total;
      parts.push(`+[${r2.rolls.join(',')}][CRIT]`);
      damageDiceSteps.push({ label: 'CRIT', value: r2.total, faces: r2.rolls });
    }
    if (usableFlat) parts.push(signed(usableFlat));
    if (abil) parts.push(`${signed(abil)}[${weaponAbility(attacker, weapon)}]`);
    if (magic) parts.push(`${signed(magic)}[MAGIC]`);
    if (bonus2) parts.push(`${signed(bonus2)}[${opts?.bonusLabel || 'BONUS'}]`);
    if (usableFlat) damageModSteps.push({ label: 'flat', value: usableFlat });
    if (abil) damageModSteps.push({ label: weaponAbility(attacker, weapon), value: abil });
    if (magic) damageModSteps.push({ label: 'MAGIC', value: magic });
    if (bonus2) damageModSteps.push({ label: opts?.bonusLabel || 'BONUS', value: bonus2 });
    damage = Math.max(1, sum);
    dmgText = parts.join('') || `${damage}`;
  }

  const twoH = opts?.twoHanded && weapon.versatileDamage?.trim() ? ' (2H)' : '';
  const result = crit ? 'CRIT' : fumble ? 'MISS (nat 1)' : hit ? 'HIT' : 'MISS';
  const detail =
    `${weapon.name}${twoH}: ${d20detail} ${bonusDetail}${toHitExtra ? ` ${signed(toHitExtra)}[${opts?.attackRollBonusLabel || 'maneuver'}]` : ''} = ${attackTotal} vs AC ${targetAC} — ${result}` +
    (hit ? `, ${damage} dmg (${dmgText})` : '');

  return {
    face,
    bonus,
    attackTotal,
    crit,
    fumble,
    hit,
    damage,
    detail,
    toHitSteps,
    damageDiceSteps,
    damageModSteps,
  };
}

export type SaveOutcome = {
  face: number;
  mod: number;
  total: number;
  pass: boolean;
  /** Whether the proficiency bonus was added (proficient save). */
  proficient: boolean;
  /** Both-dice display breakdown for the d20, e.g. `d20[14,3]→dis 3`. */
  d20Detail: string;
};

/**
 * Roll a saving throw: d20 + ability modifier (+ proficiency bonus when the
 * creature is proficient in that save) vs a DC.
 */
export function rollSavingThrow(
  c: Combatant,
  ability: string,
  dc: number,
  advantage?: Advantage,
  proficient = false,
): SaveOutcome {
  const { face, detail: d20Detail } = rollD20Detail(advantage);
  const mod = abilityMod(c.stats[ability.toUpperCase()]) + (proficient ? profBonusFor(c) : 0);
  const total = face + mod;
  return { face, mod, total, pass: total >= dc, proficient, d20Detail };
}

/**
 * Damage multiplier from a target's resistances/vulnerabilities for a damage
 * type: 0.5 if resistant, 2 if vulnerable, else 1. Per 5e you can't be both at
 * once — if a type is listed in both, we treat it as normal. Matched on the
 * type word, case-insensitive.
 */
export function damageMultiplier(
  damageType: string | undefined,
  resistances: string[],
  weaknesses: string[],
): number {
  const dt = (damageType ?? '').trim().toLowerCase();
  if (!dt) return 1;
  const has = (arr: string[]) => arr.some((x) => x.trim().toLowerCase() === dt);
  const resist = has(resistances);
  const vuln = has(weaknesses);
  if (resist && vuln) return 1;
  if (resist) return 0.5;
  if (vuln) return 2;
  return 1;
}
