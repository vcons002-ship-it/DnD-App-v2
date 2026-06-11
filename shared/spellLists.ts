// Framework-free helper: which class SPELL LISTS a character may pick from,
// derived from class + subclass + feats, plus the bonus cantrip/leveled-spell
// counts those feats grant. Like spellPrep these are advisory (the UI shows
// the breakdown, never blocks) — a curated 5e approximation, not an exhaustive
// ruleset.

import { classKey } from './spellPrep.js';

export type SpellListAllowance = {
  /** Lowercase class list, e.g. "wizard" — or "any" for pick-a-list feats. */
  list: string;
  /** Where it comes from: 'class', the subclass name, or the feat name. */
  source: string;
  /** Bonus cantrips this grant adds (feats only — class counts come from
   *  cantripsKnown/spellCapacity). */
  cantrips?: number;
  /** Bonus leveled spells this grant adds (always-prepared feat spells). */
  leveled?: number;
};

/** Classes with their own spell list. */
const CASTER_CLASSES = new Set([
  'wizard', 'sorcerer', 'cleric', 'druid', 'bard',
  'warlock', 'paladin', 'ranger', 'artificer',
]);

/** Subclasses that cast off ANOTHER class's list (lowercase match → list). */
const SUBCLASS_LISTS: [RegExp, string][] = [
  [/eldritch\s*knight/, 'wizard'],
  [/arcane\s*trickster/, 'wizard'],
  [/divine\s*soul/, 'cleric'],
];

/**
 * Spell-granting feats, matched against trait/ability names. Magic Initiate
 * captures its list from the name — "Magic Initiate (Druid)", "Magic
 * Initiate: Druid", or "Magic Initiate Druid" all work.
 */
const MAGIC_INITIATE = /magic\s*initiate\s*[:(\-\s]*\s*([a-z]+)/;

function featGrant(
  name: string,
): { key: string; grant: SpellListAllowance } | null {
  const n = name.trim().toLowerCase();
  const mi = MAGIC_INITIATE.exec(n);
  if (mi && CASTER_CLASSES.has(mi[1])) {
    return {
      key: `magic-initiate:${mi[1]}`,
      grant: { list: mi[1], source: name.trim(), cantrips: 2, leveled: 1 },
    };
  }
  if (/artificer\s*initiate/.test(n))
    return {
      key: 'artificer-initiate',
      grant: { list: 'artificer', source: name.trim(), cantrips: 1, leveled: 1 },
    };
  if (/fey\s*touched/.test(n))
    return {
      key: 'fey-touched', // Misty Step + 1 L1 ench/div
      grant: { list: 'any', source: name.trim(), leveled: 2 },
    };
  if (/shadow\s*touched/.test(n))
    return {
      key: 'shadow-touched', // Invisibility + 1 L1 ill/necro
      grant: { list: 'any', source: name.trim(), leveled: 2 },
    };
  return null;
}

/**
 * Every spell list the character may draw from, with the bonus counts feats
 * grant. `featNames` should include BOTH the Traits & Feats entries and the
 * sheet's spells/abilities names (feats can live in either place).
 */
export function spellAllowances(
  className: string,
  subclass: string,
  featNames: string[],
): SpellListAllowance[] {
  const out: SpellListAllowance[] = [];
  const k = classKey(className);
  if (CASTER_CLASSES.has(k)) out.push({ list: k, source: 'class' });
  const sub = (subclass ?? '').trim();
  for (const [re, list] of SUBCLASS_LISTS) {
    if (re.test(sub.toLowerCase()) && !out.some((a) => a.list === list)) {
      out.push({ list, source: sub });
    }
  }
  const seen = new Set<string>();
  for (const name of featNames) {
    const hit = featGrant(name);
    // One grant per feat (the same feat in traits AND abilities — or under a
    // spelling variant — counts once).
    if (hit && !seen.has(hit.key)) {
      seen.add(hit.key);
      out.push(hit.grant);
    }
  }
  return out;
}

/** Total bonus cantrips + leveled spells granted by feats. */
export function featSpellBonus(allowances: SpellListAllowance[]): {
  cantrips: number;
  leveled: number;
} {
  return allowances.reduce(
    (acc, a) => ({
      cantrips: acc.cantrips + (a.cantrips ?? 0),
      leveled: acc.leveled + (a.leveled ?? 0),
    }),
    { cantrips: 0, leveled: 0 },
  );
}

const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/** Display name for an allowance's list ("Wizard", "Druid", "Any list"). */
export function listLabel(list: string): string {
  return list === 'any' ? 'Any list' : cap(list);
}

/**
 * Per-source breakdown of the cantrip + leveled-spell BUDGET, so the header can
 * show "Cantrips: 4 Wizard + 2 Druid = 6" instead of one merged number.
 *
 * - The PRIMARY caster list carries the class budget (`classCantrips`/
 *   `classSpells`, computed by the caller via cantripsKnown/spellCapacity): the
 *   `source: 'class'` allowance, or — when the class itself isn't a caster — a
 *   third-caster subclass (Eldritch Knight / Arcane Trickster).
 * - FEAT grants carry their own explicit bonus.
 * - A subclass EXPANSION list (e.g. Divine Soul adds cleric to a sorcerer's
 *   known list) adds access but no budget; it's returned in `access`.
 */
export function spellBudgetBreakdown(
  allowances: SpellListAllowance[],
  classCantrips: number,
  classSpells: number | null,
): {
  /** Cantrip budget per LIST (aggregated), so it reads "4 Wizard + 2 Druid". */
  cantrips: { label: string; value: number }[];
  spells: { label: string; value: number }[];
  /** Source credits — feats that granted spells + subclass expansion lists. */
  credits: string[];
} {
  const cantripBy = new Map<string, number>();
  const spellBy = new Map<string, number>();
  const credits: string[] = [];
  const hasClassList = allowances.some((a) => a.source === 'class');
  const bump = (m: Map<string, number>, list: string, n: number) => {
    if (n > 0) m.set(list, (m.get(list) ?? 0) + n);
  };
  for (const a of allowances) {
    const isFeat = (a.cantrips ?? 0) > 0 || (a.leveled ?? 0) > 0;
    // The primary budget list: the class itself, or a third-caster subclass when
    // the class isn't already a caster.
    const isPrimary = a.source === 'class' || (!isFeat && !hasClassList);
    if (isPrimary) {
      bump(cantripBy, a.list, classCantrips);
      bump(spellBy, a.list, classSpells ?? 0);
    } else if (isFeat) {
      bump(cantripBy, a.list, a.cantrips ?? 0);
      bump(spellBy, a.list, a.leveled ?? 0);
      credits.push(allowanceLabel(a));
    } else {
      // Subclass expansion: access to another list, no extra budget.
      credits.push(`${listLabel(a.list)} list (${a.source})`);
    }
  }
  const toParts = (m: Map<string, number>) =>
    [...m.entries()].map(([list, value]) => ({ label: listLabel(list), value }));
  return { cantrips: toParts(cantripBy), spells: toParts(spellBy), credits };
}

/** One-line label for an allowance, e.g. "Druid +2 cantrips +1 spell (Magic
 *  Initiate (Druid))" or "Wizard (Eldritch Knight)". */
export function allowanceLabel(a: SpellListAllowance): string {
  const parts: string[] = [a.list === 'any' ? 'Any list' : cap(a.list)];
  if (a.cantrips) parts.push(`+${a.cantrips} cantrip${a.cantrips > 1 ? 's' : ''}`);
  if (a.leveled) parts.push(`+${a.leveled} spell${a.leveled > 1 ? 's' : ''}`);
  return `${parts.join(' ')} (${a.source})`;
}
