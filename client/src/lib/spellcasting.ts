import type { Condition, SheetAbility } from '../../../shared/types';

/** Icon per rollable kind, so a button reads attack vs save vs damage vs heal. */
export const ROLL_ICON: Record<string, string> = {
  attack: '✨',
  save: '🎯',
  damage: '💥',
  heal: '✚',
};

/** The base spell level (from the roll, else the entry's level). */
export const spellBaseLevel = (a: SheetAbility): number =>
  a.roll?.baseLevel ?? a.level ?? 0;

/** Any leveled spell can be cast with a higher slot — dice scale where the roll
 *  defines `scaleDice`; otherwise the higher-level effect is the `upcast` note. */
export const upcastable = (a: SheetAbility): boolean =>
  a.type === 'spell' && spellBaseLevel(a) >= 1;

/** Does this entry have the concentration flag (tag or meta)? Spell OR stance. */
export const castsConcentration = (a: SheetAbility): boolean =>
  (a.tags ?? []).some((t) => t.trim().toLowerCase() === 'concentration') ||
  (a.meta ?? '').toLowerCase().includes('concentration');

/** A concentration SPELL (by tag or meta) — casting it starts concentration. */
export const isConcentration = (a: SheetAbility): boolean =>
  a.type === 'spell' && castsConcentration(a);

/** Warn before starting a NEW concentration while another is already running —
 *  5e lets you keep only one, so casting ends the old. Returns false to abort. */
export function confirmConcentration(
  caster: { name: string; conditions: Condition[] },
  a: SheetAbility,
): boolean {
  if (!castsConcentration(a)) return true;
  const existing = caster.conditions.find(
    (c) => c.isConcentration && c.label !== `Concentration: ${a.name}`,
  );
  if (!existing) return true;
  const prev =
    existing.label.replace(/^Concentration:\s*/i, '').trim() || 'another spell';
  return window.confirm(
    `${caster.name} is already concentrating on ${prev}. ` +
      `Casting ${a.name} will end that concentration. Continue?`,
  );
}
