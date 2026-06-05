// Pure, framework-free spell math so the server resolves rolls authoritatively
// and it stays unit-testable. Handles upcasting (extra dice per slot level above
// a spell's base level) and cantrip scaling (extra dice at caster levels 5/11/17).
import type { AbilityRoll } from './types.js';
import { abilityMod, proficiencyBonus } from './skills.js';

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

/** The caster's best spellcasting ability modifier (INT/WIS/CHA). */
export function spellcastingMod(stats: Record<string, number>): number {
  return Math.max(
    abilityMod(stats.INT ?? 10),
    abilityMod(stats.WIS ?? 10),
    abilityMod(stats.CHA ?? 10),
  );
}

/** Spell attack bonus = proficiency + spellcasting modifier. */
export function spellAttackBonus(level: number, stats: Record<string, number>): number {
  return proficiencyBonus(level || 1) + spellcastingMod(stats);
}

/** Spell save DC = 8 + proficiency + spellcasting modifier. */
export function spellSaveDC(level: number, stats: Record<string, number>): number {
  return 8 + proficiencyBonus(level || 1) + spellcastingMod(stats);
}
