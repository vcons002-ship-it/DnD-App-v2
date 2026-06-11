// Framework-free spell-economy helpers: prepared/known + cantrip "soft" limits by
// class & level, and parsing a casting-time string into an action type. These are
// advisory (the UI shows counters, never blocks), so the class tables are sensible
// 2014/2024-flavoured approximations rather than an exhaustive ruleset.

export type ActionType = 'action' | 'bonus' | 'reaction';

/** Best-effort action type from a spell's "1 bonus action · …" meta string. */
export function parseActionType(meta: string | undefined): ActionType | undefined {
  if (!meta) return undefined;
  const m = meta.toLowerCase();
  if (m.includes('bonus action')) return 'bonus';
  if (m.includes('reaction')) return 'reaction';
  if (m.includes('action')) return 'action';
  return undefined;
}

/** Icon + label per action type, for the ability rows / floating menu. */
export const ACTION_ICON: Record<ActionType, { icon: string; label: string }> = {
  action: { icon: '●', label: 'Action' },
  bonus: { icon: '⚡', label: 'Bonus action' },
  reaction: { icon: '↩', label: 'Reaction' },
};

const abilityMod = (score: number | undefined): number =>
  Math.floor(((score ?? 10) - 10) / 2);

/** Normalize a class name to a lowercase key (first word, e.g. "Fighter (EK)" → "fighter"). */
function classKey(className: string): string {
  return className.trim().toLowerCase().split(/[^a-z]+/i)[0] ?? '';
}

/** Cantrips known by class & level (0 when the class learns none). */
export function cantripsKnown(className: string, level: number): number {
  const lv = Math.max(1, level);
  const k = classKey(className);
  const tier = (a: number, b = a, c = b) => (lv >= 10 ? c : lv >= 4 ? b : a);
  switch (k) {
    case 'wizard':
    case 'sorcerer':
      return lv >= 10 ? 6 : lv >= 4 ? 5 : 4; // 5/4 start, scale up
    case 'cleric':
    case 'druid':
    case 'bard':
      return tier(3, 4, 5);
    case 'warlock':
      return tier(2, 3, 4);
    case 'artificer':
      return lv >= 10 ? 3 : 2;
    default:
      return 0; // martial / non-caster
  }
}

export type SpellCapacity =
  | { kind: 'prepared'; max: number }
  | { kind: 'known'; max: number }
  | null;

// Known-caster tables (leveled spells known by level). Index by level (1-based).
const KNOWN: Record<string, number[]> = {
  // lvl: 1  2  3  4  5  6  7  8  9 10 11 12 13 14 15 16 17 18 19 20
  bard:    [4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 15, 15, 16, 18, 19, 19, 20, 22, 22, 22],
  sorcerer:[2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 12, 13, 13, 14, 14, 15, 15, 15, 15],
  ranger:  [0, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11],
  warlock: [1, 2, 2, 3, 3, 4, 4, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11],
};

/**
 * How many leveled spells the character can have ready: a "prepared" cap for
 * prepared casters (mod + level, or half), a "known" cap for known casters, or
 * null for non/limited casters (so the UI shows no counter).
 */
export function spellCapacity(
  className: string,
  level: number,
  stats: Record<string, number>,
): SpellCapacity {
  const lv = Math.max(1, level);
  const k = classKey(className);
  switch (k) {
    case 'wizard':
      return { kind: 'prepared', max: Math.max(1, abilityMod(stats.INT) + lv) };
    case 'cleric':
    case 'druid':
      return { kind: 'prepared', max: Math.max(1, abilityMod(stats.WIS) + lv) };
    case 'paladin':
      return { kind: 'prepared', max: Math.max(1, abilityMod(stats.CHA) + Math.floor(lv / 2)) };
    case 'artificer':
      return { kind: 'prepared', max: Math.max(1, abilityMod(stats.INT) + Math.floor(lv / 2)) };
    case 'bard':
    case 'sorcerer':
    case 'ranger':
    case 'warlock':
      return { kind: 'known', max: KNOWN[k][Math.min(lv, 20) - 1] ?? 0 };
    default:
      return null;
  }
}
