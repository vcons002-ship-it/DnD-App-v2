// Framework-free helper: the level-based cap on feats/ASIs (5e) and how many a
// character has used. A feat is a sheet ability tagged as a feat; an ASI is a
// `slot`-flagged modifier (so +1/+1 sharing one source counts once). Advisory by
// nature but used to HARD-cap the feat/ASI add UI per the user's choice.

import { classKey } from './spellPrep.js';
import type { SheetAbility, SheetModifier } from './types.js';

// Ability Score Improvement levels every class gets, plus martial extras.
const ASI_LEVELS = [4, 8, 12, 16, 19];
const FIGHTER_EXTRA = [6, 14];
const ROGUE_EXTRA = [10];

/** Number of feat/ASI slots a character has at this class + level. */
export function featSlots(className: string, level: number): number {
  const lv = Math.max(1, Math.round(level || 1));
  let n = ASI_LEVELS.filter((l) => lv >= l).length;
  const k = classKey(className);
  if (k === 'fighter') n += FIGHTER_EXTRA.filter((l) => lv >= l).length;
  if (k === 'rogue') n += ROGUE_EXTRA.filter((l) => lv >= l).length;
  return n;
}

/** Whether a sheet ability represents a feat (drives the cap count + add gate). */
export function isFeatAbility(a: Pick<SheetAbility, 'school' | 'tags'>): boolean {
  return (
    (a.school ?? '').trim().toLowerCase() === 'feat' ||
    (a.tags ?? []).some((t) => t.trim().toLowerCase() === 'feat')
  );
}

/** Feats + ASIs used vs the cap. Feats = feat-tagged sheet abilities; ASIs =
 *  distinct sources among `slot`-flagged modifiers. */
export function featUsage(c: {
  className: string;
  level: number;
  sheetAbilities: SheetAbility[];
  modifiers?: SheetModifier[];
}): { used: number; cap: number; feats: number; asis: number } {
  const feats = c.sheetAbilities.filter(isFeatAbility).length;
  const asis = new Set(
    (c.modifiers ?? [])
      .filter((m) => m.slot)
      .map((m) => m.source.trim().toLowerCase()),
  ).size;
  return { used: feats + asis, cap: featSlots(c.className, c.level), feats, asis };
}
