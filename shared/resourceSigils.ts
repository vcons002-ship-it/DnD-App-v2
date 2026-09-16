/** Labels and artwork only: stored resource names and counters are never changed. */
export type ResourceSigilKind =
  | 'spell'
  | 'sorcery'
  | 'superiority'
  | 'wind'
  | 'surge'
  | 'resolve'
  | 'rage'
  | 'focus'
  | 'inspiration'
  | 'divinity'
  | 'nature'
  | 'healing'
  | 'custom';

export interface ResourceSigilPresentation {
  kind: ResourceSigilKind;
  name: string;
  caption: string;
  numeral?: string;
  initial?: string;
}

const ROMAN_LEVELS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX'];

/** Display order only: spell slots first, recognized class pools next, then
 * custom trackers. Stable within each resource tier; saved objects are untouched.
 * Unusual spell-slot keys still take priority even without dedicated sigil art. */
export function prioritizeResourceRows<T extends { group: 'spellSlots' | 'resources'; name: string }>(rows: readonly T[]): T[] {
  const priority = (row: T) => row.group === 'spellSlots' ? 0
    : resourceSigilPresentation(row.group, row.name).kind === 'custom' ? 2 : 1;
  return [...rows].sort((a, b) => priority(a) - priority(b)
    || (a.group === 'spellSlots' && b.group === 'spellSlots'
      ? a.name.localeCompare(b.name, undefined, { numeric: true }) : 0));
}

const CLASS_SIGILS: Record<string, { kind: ResourceSigilKind; caption: string }> = {
  'sorcery points': { kind: 'sorcery', caption: 'Sorcery' },
  'superiority dice': { kind: 'superiority', caption: 'Battle dice' },
  'superiority die': { kind: 'superiority', caption: 'Battle die' },
  'second wind': { kind: 'wind', caption: 'Second Wind' },
  'action surge': { kind: 'surge', caption: 'Surge' },
  indomitable: { kind: 'resolve', caption: 'Resolve' },
  rage: { kind: 'rage', caption: 'Rage' },
  rages: { kind: 'rage', caption: 'Rage' },
  'ki points': { kind: 'focus', caption: 'Ki' },
  ki: { kind: 'focus', caption: 'Ki' },
  'focus points': { kind: 'focus', caption: 'Focus' },
  'bardic inspiration': { kind: 'inspiration', caption: 'Bardic' },
  'channel divinity': { kind: 'divinity', caption: 'Divinity' },
  'wild shape': { kind: 'nature', caption: 'Wild Shape' },
  'lay on hands': { kind: 'healing', caption: 'Lay on Hands' },
  'lay on hands hp': { kind: 'healing', caption: 'Lay on Hands' },
};

export function resourceSigilPresentation(
  group: 'spellSlots' | 'resources',
  key: string,
): ResourceSigilPresentation {
  const spellLevel = group === 'spellSlots' ? /^L([1-9])$/.exec(key) : null;
  if (spellLevel) {
    const level = Number(spellLevel[1]);
    return { kind: 'spell', name: `Level ${level}`, caption: '', numeral: ROMAN_LEVELS[level - 1] };
  }
  const normalized = key.trim().toLowerCase();
  const classSigil = group === 'resources' && Object.hasOwn(CLASS_SIGILS, normalized)
    ? CLASS_SIGILS[normalized]
    : undefined;
  if (classSigil) return { ...classSigil, name: key };
  return {
    kind: 'custom',
    name: key,
    caption: key,
    initial: Array.from(key.trim())[0]?.toLocaleUpperCase() || '◇',
  };
}
