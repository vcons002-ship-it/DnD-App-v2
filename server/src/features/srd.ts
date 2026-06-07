import type { SheetAbility } from '../../../shared/types.js';

/**
 * Curated, impactful 5e class features that fit the sheet's toggle/resource/roll
 * model: `stance` features (Rage, Reckless Attack) modify weapon attacks while
 * active; others are tracked via a linked `useCounter` and are descriptive. They
 * surface in the same "+ Add spell / ability" search as spells & masteries.
 *
 * Descriptions are short original paraphrases of SRD rules, not verbatim text.
 */
export type FeatureEntry = Omit<SheetAbility, 'id' | 'source'>;

const FEATURES: FeatureEntry[] = [
  {
    name: 'Rage',
    type: 'stance',
    school: 'Barbarian feature',
    classes: ['barbarian'],
    tags: ['barbarian', 'feature', 'stance', 'rage', 'melee', 'damage'],
    meta: 'Bonus action · toggle · resistance to b/p/s',
    description:
      'While raging you add bonus damage to Strength melee attacks, have advantage on Strength checks/saves, and resist bludgeoning, piercing, and slashing damage. Toggle on to spend a use; lasts up to 1 minute.',
    stance: { active: false, appliesTo: 'melee', bonusDamage: '2' },
    useCounter: { name: 'Rage', max: 2 },
  },
  {
    name: 'Reckless Attack',
    type: 'stance',
    school: 'Barbarian feature',
    classes: ['barbarian'],
    tags: ['barbarian', 'feature', 'stance', 'advantage', 'melee'],
    meta: 'Toggle · advantage on Strength melee attacks',
    description:
      'When active, you attack recklessly: your Strength melee attacks gain advantage this turn, but attack rolls against you also have advantage until your next turn.',
    stance: { active: false, appliesTo: 'melee', grantsAdvantage: true },
  },
  {
    name: 'Action Surge',
    type: 'ability',
    school: 'Fighter feature',
    classes: ['fighter'],
    tags: ['fighter', 'feature', 'action'],
    meta: '1/short rest · extra action',
    description:
      'On your turn you can take one additional action. Track the use here; refreshes on a short or long rest.',
    useCounter: { name: 'Action Surge', max: 1 },
  },
  {
    name: 'Channel Divinity',
    type: 'ability',
    school: 'Cleric/Paladin feature',
    classes: ['cleric', 'paladin'],
    tags: ['cleric', 'paladin', 'feature', 'divine'],
    meta: 'Toggle use · 1–3 per rest',
    description:
      'Channel divine energy for a domain/oath effect (e.g. Turn Undead, Sacred Weapon). Spend a charge here; refreshes on a rest.',
    useCounter: { name: 'Channel Divinity', max: 1 },
  },
  {
    name: 'Wild Shape',
    type: 'ability',
    school: 'Druid feature',
    classes: ['druid'],
    tags: ['druid', 'feature', 'transform', 'beast form'],
    meta: '2/short rest · beast form',
    description:
      'Transform into a beast you have seen. Track uses here; while shaped, edit your stat block (or use a beast token) for the form’s stats, then revert.',
    useCounter: { name: 'Wild Shape', max: 2 },
  },
  {
    name: 'Bardic Inspiration',
    type: 'ability',
    school: 'Bard feature',
    classes: ['bard'],
    tags: ['bard', 'feature', 'support', 'inspiration'],
    meta: 'Bonus action · give an ally a d6+ die',
    description:
      'Give another creature a Bardic Inspiration die (d6, scaling with level) they can add to one attack, check, or save within 10 minutes. Track your uses here.',
    useCounter: { name: 'Bardic Inspiration', max: 3 },
  },
  {
    name: 'Ki',
    type: 'ability',
    school: 'Monk feature',
    classes: ['monk'],
    tags: ['monk', 'feature', 'ki'],
    meta: 'Spend points · Flurry/Patient Defense/Step',
    description:
      'Spend Ki points to fuel Flurry of Blows, Patient Defense, or Step of the Wind. Track your pool here; refreshes on a short or long rest.',
    useCounter: { name: 'Ki', max: 3 },
  },
  {
    name: 'Lay on Hands',
    type: 'ability',
    school: 'Paladin feature',
    classes: ['paladin'],
    tags: ['paladin', 'feature', 'healing'],
    meta: 'Healing pool = 5 × paladin level',
    description:
      'Draw from a pool of healing equal to five times your paladin level, restoring that many hit points (or curing a disease/poison for 5). Track the pool here.',
    useCounter: { name: 'Lay on Hands (HP)', max: 25 },
  },
  {
    name: 'Indomitable',
    type: 'ability',
    school: 'Fighter feature',
    classes: ['fighter'],
    tags: ['fighter', 'feature', 'save'],
    meta: '1/long rest · reroll a save',
    description:
      'When you fail a saving throw you can reroll it, using the new result. Track the use here; refreshes on a long rest.',
    useCounter: { name: 'Indomitable', max: 1 },
  },
  {
    name: "Hunter's Mark",
    type: 'stance',
    school: 'Ranger feature',
    classes: ['ranger'],
    tags: ['ranger', 'feature', 'stance', 'damage', 'concentration'],
    meta: 'Concentration · +1d6 to weapon hits on the marked target',
    description:
      'Mark a creature; your weapon attacks against it deal an extra 1d6 force/weapon damage. Toggle on while concentrating (handle the single-target restriction at the table).',
    stance: { active: false, appliesTo: 'all', bonusDamage: '1d6' },
  },
];

const haystack = (f: FeatureEntry): string =>
  [f.name, f.school, ...(f.classes ?? []), ...(f.tags ?? [])]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

/** Search class features by name OR tag/class (name-prefix first). */
export function searchFeatures(query: string, limit = 8): FeatureEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return FEATURES.slice(0, limit);
  const matches = FEATURES.filter((f) => haystack(f).includes(q));
  matches.sort((a, b) => {
    const ap = a.name.toLowerCase().startsWith(q) ? 0 : 1;
    const bp = b.name.toLowerCase().startsWith(q) ? 0 : 1;
    return ap - bp || a.name.localeCompare(b.name);
  });
  return matches.slice(0, limit);
}

/** Exact (case-insensitive) lookup by feature name. */
export function getFeature(name: string): FeatureEntry | null {
  const q = name.trim().toLowerCase();
  return FEATURES.find((f) => f.name.toLowerCase() === q) ?? null;
}
