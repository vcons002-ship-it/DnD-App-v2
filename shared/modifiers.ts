// Framework-free helpers for the character "modifier" system: a base ability
// score (kept in Character.stats) plus named adjustments from feats/ASIs (on the
// character) and magic items (on equipped InventoryItems). Effective score =
// base + matching ability modifiers; flat save/skill/attack/AC bonuses layer on
// at roll time. Pure + unit-tested; the server computes the authoritative math.

import type { InventoryItem, ModTarget, SheetModifier } from './types.js';
import type { AbilityKey } from './skills.js';

const ABILITIES: AbilityKey[] = ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'];

/** The minimal character shape these helpers need (so they're easy to test). */
export type ModSource = {
  stats?: Record<string, number>;
  armorClass?: number;
  modifiers?: SheetModifier[];
  items?: InventoryItem[];
};

/**
 * Every modifier currently in effect: the character's own permanent modifiers
 * plus those from EQUIPPED items (an item's modifiers do nothing until it's
 * equipped/attuned). An item modifier with a blank `source` falls back to the
 * item's name so the tooltip/log always names where the bonus came from.
 */
export function activeModifiers(c: ModSource): SheetModifier[] {
  const own = c.modifiers ?? [];
  const fromItems = (c.items ?? [])
    .filter((it) => it.equipped && (it.modifiers?.length ?? 0) > 0)
    .flatMap((it) =>
      (it.modifiers ?? []).map((m) => ({ ...m, source: m.source || it.name })),
    );
  return [...own, ...fromItems];
}

export type StatBreakdown = {
  base: number;
  parts: { source: string; value: number }[];
  total: number;
};

/**
 * Effective ability scores = base + ability-target modifiers, with a per-ability
 * breakdown for the stat-math tooltip. Only abilities the creature actually has
 * a base score for are included (never fabricates scores).
 */
export function effectiveStats(c: ModSource): {
  scores: Record<string, number>;
  breakdown: Record<string, StatBreakdown>;
} {
  const mods = activeModifiers(c);
  const scores: Record<string, number> = {};
  const breakdown: Record<string, StatBreakdown> = {};
  for (const ab of ABILITIES) {
    const base = c.stats?.[ab];
    if (base === undefined) continue;
    const parts = mods
      .filter((m) => m.target.kind === 'ability' && m.target.ability === ab)
      .map((m) => ({ source: m.source, value: m.value }));
    const total = base + parts.reduce((s, p) => s + p.value, 0);
    scores[ab] = total;
    breakdown[ab] = { base, parts, total };
  }
  return { scores, breakdown };
}

/** Effective AC = base armorClass + AC-target modifiers. */
export function effectiveAc(c: ModSource): number {
  return (
    (c.armorClass ?? 0) +
    activeModifiers(c)
      .filter((m) => m.target.kind === 'ac')
      .reduce((s, m) => s + m.value, 0)
  );
}

/** Sum + named parts of the modifiers whose target matches `pred`. */
function extras(
  c: ModSource,
  pred: (t: ModTarget) => boolean,
): { total: number; parts: { source: string; value: number }[] } {
  const parts = activeModifiers(c)
    .filter((m) => pred(m.target))
    .map((m) => ({ source: m.source, value: m.value }));
  return { total: parts.reduce((s, p) => s + p.value, 0), parts };
}

/** Flat bonus to a saving throw for `ability` (matches that save or all-saves). */
export function saveExtra(c: ModSource, ability: string) {
  const ab = ability.trim().toUpperCase();
  return extras(c, (t) => t.kind === 'save' && (!t.ability || t.ability === ab));
}

/** Flat bonus to a skill check (matches that skill or all-skills). */
export function skillExtra(c: ModSource, skillName: string) {
  const sk = skillName.trim().toLowerCase();
  return extras(
    c,
    (t) => t.kind === 'skill' && (!t.skill || t.skill.trim().toLowerCase() === sk),
  );
}

/** Flat bonus to every attack roll. */
export function attackExtra(c: ModSource) {
  return extras(c, (t) => t.kind === 'attack');
}

/** Flat bonus to initiative (the DEX mod already flows via effectiveStats). */
export function initiativeExtra(c: ModSource) {
  return extras(c, (t) => t.kind === 'initiative');
}

/** Human label for a modifier target, e.g. "STR", "all saves", "Stealth", "AC". */
export function targetLabel(t: ModTarget): string {
  switch (t.kind) {
    case 'ability':
      return t.ability;
    case 'save':
      return t.ability ? `${t.ability} save` : 'all saves';
    case 'skill':
      return t.skill || 'all skills';
    case 'attack':
      return 'attack rolls';
    case 'ac':
      return 'AC';
    case 'initiative':
      return 'initiative';
  }
}
