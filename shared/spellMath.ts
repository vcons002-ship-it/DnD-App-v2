// Pure, framework-free spell math so the server resolves rolls authoritatively
// and it stays unit-testable. Handles upcasting (extra dice per slot level above
// a spell's base level) and cantrip scaling (extra dice at caster levels 5/11/17).
import type { AbilityRoll } from './types.js';
import { abilityMod, proficiencyBonus, signed } from './skills.js';

/** Cantrip damage steps up at these caster levels (5e). */
const CANTRIP_TIERS = [5, 11, 17];

/** How many extra `scaleDice` instances apply for a cantrip at `casterLevel`. */
export function cantripExtraSteps(casterLevel: number): number {
  return CANTRIP_TIERS.filter((t) => casterLevel >= t).length;
}

/**
 * The effective dice expression for an ability's roll, accounting for upcasting.
 * - Leveled spells (baseLevel ≥ 1): add `scaleDice` once per level cast above base.
 * - Cantrips (baseLevel 0): add `scaleDice` once per caster-level tier reached.
 * Returns the base dice unchanged when there's nothing to scale.
 */
export function effectiveDice(
  roll: Pick<AbilityRoll, 'dice' | 'scaleDice' | 'baseLevel'>,
  opts: { castLevel?: number; casterLevel?: number } = {},
): string {
  const base = (roll.dice ?? '').trim();
  if (!roll.scaleDice || !base) return base;
  const baseLevel = roll.baseLevel ?? 0;
  let extra = 0;
  if (baseLevel >= 1) {
    const cast = Math.max(baseLevel, Math.floor(opts.castLevel ?? baseLevel));
    extra = cast - baseLevel;
  } else {
    extra = cantripExtraSteps(Math.floor(opts.casterLevel ?? 1));
  }
  if (extra <= 0) return base;
  return base + `+${roll.scaleDice.trim()}`.repeat(extra);
}

/** The caster's best spellcasting ability (INT/WIS/CHA) and its modifier; ties
 *  favour INT then WIS, so the label is stable. */
export function spellcastingAbility(
  stats: Record<string, number>,
): { ability: 'INT' | 'WIS' | 'CHA'; mod: number } {
  const cands = [
    { ability: 'INT' as const, mod: abilityMod(stats.INT ?? 10) },
    { ability: 'WIS' as const, mod: abilityMod(stats.WIS ?? 10) },
    { ability: 'CHA' as const, mod: abilityMod(stats.CHA ?? 10) },
  ];
  return cands.reduce((best, c) => (c.mod > best.mod ? c : best));
}

/** The caster's best spellcasting ability modifier (INT/WIS/CHA). */
export function spellcastingMod(stats: Record<string, number>): number {
  return spellcastingAbility(stats).mod;
}

/** Spell attack bonus = proficiency + spellcasting modifier. */
export function spellAttackBonus(level: number, stats: Record<string, number>): number {
  return proficiencyBonus(level || 1) + spellcastingMod(stats);
}

/**
 * A spell attack's to-hit AS A LABELLED BREAKDOWN for the roll log, e.g.
 * `+3[CHA] +2[PROF]`, mirroring the weapon breakdown. `prof` is supplied by the
 * caller — proficiency by level for PCs, by CR for monsters — so this works for
 * both; `bonus` equals casting mod + `prof`.
 */
export function spellAttackBonusDetail(
  stats: Record<string, number>,
  prof: number,
): { bonus: number; detail: string } {
  const { ability, mod } = spellcastingAbility(stats);
  return { bonus: mod + prof, detail: `${signed(mod)}[${ability}] ${signed(prof)}[PROF]` };
}

/** Spell save DC = 8 + proficiency + spellcasting modifier. */
export function spellSaveDC(level: number, stats: Record<string, number>): number {
  return 8 + proficiencyBonus(level || 1) + spellcastingMod(stats);
}
