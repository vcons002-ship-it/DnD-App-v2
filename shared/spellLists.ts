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

/** One-line label for an allowance, e.g. "Druid +2 cantrips +1 spell (Magic
 *  Initiate (Druid))" or "Wizard (Eldritch Knight)". */
export function allowanceLabel(a: SpellListAllowance): string {
  const parts: string[] = [a.list === 'any' ? 'Any list' : cap(a.list)];
  if (a.cantrips) parts.push(`+${a.cantrips} cantrip${a.cantrips > 1 ? 's' : ''}`);
  if (a.leveled) parts.push(`+${a.leveled} spell${a.leveled > 1 ? 's' : ''}`);
  return `${parts.join(' ')} (${a.source})`;
}
