import type { SheetAbility } from '../../../shared/types.js';

/**
 * A curated, offline subset of common 5e SRD spells (plus a few class
 * abilities) so the sheet's "add spell/ability" search works with zero
 * network/keys. Gemini (spells/gemini.ts) covers anything not listed here.
 *
 * Entries carry a structured `roll` where it's well-defined; damage spells use
 * `dice` + `scaleDice` so the server can upcast them (cantrips scale by caster
 * level instead). Descriptions are short paraphrases of the SRD text.
 */
export type SpellEntry = Omit<SheetAbility, 'id' | 'source'>;

const SPELLS: SpellEntry[] = [
  // ---- Cantrips (scale by caster level) ----
  {
    name: 'Fire Bolt',
    type: 'spell',
    level: 0,
    school: 'Evocation',
    meta: '1 action · 120 ft · V,S',
    description:
      'Hurl a mote of fire at a creature or object. On a hit it takes fire damage. A flammable object ignites if not worn or carried.',
    roll: { kind: 'attack', dice: '1d10', scaleDice: '1d10', baseLevel: 0, damageType: 'fire' },
  },
  {
    name: 'Eldritch Blast',
    type: 'spell',
    level: 0,
    school: 'Evocation',
    meta: '1 action · 120 ft · V,S',
    description:
      'A beam of crackling energy streaks toward a creature. On a hit it takes force damage. The spell creates more beams at higher levels (roll each separately).',
    roll: { kind: 'attack', dice: '1d10', scaleDice: '1d10', baseLevel: 0, damageType: 'force' },
  },
  {
    name: 'Ray of Frost',
    type: 'spell',
    level: 0,
    school: 'Evocation',
    meta: '1 action · 60 ft · V,S',
    description:
      'A frigid beam streaks toward a creature. On a hit it takes cold damage and its speed is reduced by 10 ft until your next turn.',
    roll: { kind: 'attack', dice: '1d8', scaleDice: '1d8', baseLevel: 0, damageType: 'cold' },
  },
  {
    name: 'Sacred Flame',
    type: 'spell',
    level: 0,
    school: 'Evocation',
    meta: '1 action · 60 ft · V,S',
    description:
      'Flame-like radiance descends on a creature. It must succeed a DEX save or take radiant damage. It gains no benefit from cover.',
    roll: { kind: 'save', dice: '1d8', scaleDice: '1d8', baseLevel: 0, save: 'DEX', damageType: 'radiant' },
  },
  // ---- Leveled spells (upcast by slot level) ----
  {
    name: 'Magic Missile',
    type: 'spell',
    level: 1,
    school: 'Evocation',
    meta: '1 action · 120 ft · V,S',
    description:
      'Three glowing darts each strike a target you choose, dealing force damage. The darts hit automatically. One extra dart per slot level above 1st.',
    roll: { kind: 'damage', dice: '1d4+1', instances: 3, scaleInstances: 1, baseLevel: 1, damageType: 'force' },
  },
  {
    name: 'Cure Wounds',
    type: 'spell',
    level: 1,
    school: 'Evocation',
    meta: '1 action · Touch · V,S',
    description:
      'A creature you touch regains hit points (add your spellcasting modifier). Healing increases by 1d8 per slot level above 1st. No effect on undead/constructs.',
    roll: { kind: 'heal', dice: '1d8', scaleDice: '1d8', baseLevel: 1 },
  },
  {
    name: 'Healing Word',
    type: 'spell',
    level: 1,
    school: 'Evocation',
    meta: '1 bonus action · 60 ft · V',
    description:
      'A creature of your choice regains hit points (add your spellcasting modifier). Healing increases by 1d4 per slot level above 1st.',
    roll: { kind: 'heal', dice: '1d4', scaleDice: '1d4', baseLevel: 1 },
  },
  {
    name: 'Guiding Bolt',
    type: 'spell',
    level: 1,
    school: 'Evocation',
    meta: '1 action · 120 ft · V,S',
    description:
      'A flash of light streaks toward a creature. On a hit it takes radiant damage and the next attack against it has advantage. +1d6 per slot level above 1st.',
    roll: { kind: 'attack', dice: '4d6', scaleDice: '1d6', baseLevel: 1, damageType: 'radiant' },
  },
  {
    name: 'Chromatic Orb',
    type: 'spell',
    level: 1,
    school: 'Evocation',
    meta: '1 action · 90 ft · V,S,M',
    description:
      'You hurl a 4-inch sphere of energy (choose acid, cold, fire, lightning, poison, or thunder). On a hit the target takes damage. +1d8 per slot level above 1st.',
    roll: { kind: 'attack', dice: '3d8', scaleDice: '1d8', baseLevel: 1 },
  },
  {
    name: 'Inflict Wounds',
    type: 'spell',
    level: 1,
    school: 'Necromancy',
    meta: '1 action · Touch · V,S',
    description:
      'Make a melee spell attack against a creature. On a hit it takes necrotic damage. +1d10 per slot level above 1st.',
    roll: { kind: 'attack', dice: '3d10', scaleDice: '1d10', baseLevel: 1, damageType: 'necrotic' },
  },
  {
    name: 'Burning Hands',
    type: 'spell',
    level: 1,
    school: 'Evocation',
    meta: '1 action · Self (15-ft cone) · V,S',
    description:
      'A thin sheet of flames shoots from your fingertips. Each creature in a 15-ft cone makes a DEX save, taking fire damage (half on success). +1d6 per slot above 1st.',
    roll: { kind: 'save', dice: '3d6', scaleDice: '1d6', baseLevel: 1, save: 'DEX', damageType: 'fire' },
  },
  {
    name: 'Thunderwave',
    type: 'spell',
    level: 1,
    school: 'Evocation',
    meta: '1 action · Self (15-ft cube) · V,S',
    description:
      'A wave of thunderous force sweeps out. Each creature in a 15-ft cube makes a CON save, taking thunder damage and being pushed 10 ft on a failure (half, no push, on success). +1d8 per slot above 1st.',
    roll: { kind: 'save', dice: '2d8', scaleDice: '1d8', baseLevel: 1, save: 'CON', damageType: 'thunder' },
  },
  {
    name: 'Scorching Ray',
    type: 'spell',
    level: 2,
    school: 'Evocation',
    meta: '1 action · 120 ft · V,S',
    description:
      'You create three rays of fire. Make a separate ranged spell attack for each ray; on a hit a target takes 2d6 fire. One extra ray per slot level above 2nd.',
    roll: { kind: 'attack', dice: '2d6', baseLevel: 2, damageType: 'fire' },
  },
  {
    name: 'Shatter',
    type: 'spell',
    level: 2,
    school: 'Evocation',
    meta: '1 action · 60 ft · V,S,M',
    description:
      'A loud ringing noise erupts in a 10-ft sphere. Each creature makes a CON save, taking thunder damage (half on success). +1d8 per slot level above 2nd.',
    roll: { kind: 'save', dice: '3d8', scaleDice: '1d8', baseLevel: 2, save: 'CON', damageType: 'thunder' },
  },
  {
    name: 'Fireball',
    type: 'spell',
    level: 3,
    school: 'Evocation',
    meta: '1 action · 150 ft · V,S,M',
    description:
      'A bright streak blossoms into an explosion of flame in a 20-ft sphere. Each creature makes a DEX save, taking fire damage (half on success). +1d6 per slot level above 3rd.',
    roll: { kind: 'save', dice: '8d6', scaleDice: '1d6', baseLevel: 3, save: 'DEX', damageType: 'fire' },
  },
  {
    name: 'Lightning Bolt',
    type: 'spell',
    level: 3,
    school: 'Evocation',
    meta: '1 action · Self (100-ft line) · V,S,M',
    description:
      'A stroke of lightning forms a 100-ft line. Each creature makes a DEX save, taking lightning damage (half on success). +1d6 per slot level above 3rd.',
    roll: { kind: 'save', dice: '8d6', scaleDice: '1d6', baseLevel: 3, save: 'DEX', damageType: 'lightning' },
  },
  // ---- Class abilities (slot-fueled or fixed) ----
  {
    name: 'Divine Smite',
    type: 'ability',
    school: 'Paladin feature',
    meta: 'On a melee weapon hit · expend a spell slot',
    description:
      'When you hit with a melee weapon, expend a spell slot to deal extra radiant damage: 2d8 for a 1st-level slot, +1d8 per slot level above 1st (max 5d8), +1d8 vs undead/fiends.',
    roll: { kind: 'damage', dice: '2d8', scaleDice: '1d8', baseLevel: 1, damageType: 'radiant' },
  },
  {
    name: 'Second Wind',
    type: 'ability',
    school: 'Fighter feature',
    meta: '1 bonus action · 1/short rest',
    description:
      'You draw on a well of stamina to regain hit points equal to 1d10 + your fighter level.',
    roll: { kind: 'heal', dice: '1d10' },
  },
  {
    name: 'Sneak Attack',
    type: 'ability',
    school: 'Rogue feature',
    meta: 'Once per turn · finesse/ranged weapon',
    description:
      'Once per turn, deal extra damage to a target you hit with advantage (or with an ally adjacent). Scales with rogue level — adjust the dice as you level up.',
    roll: { kind: 'damage', dice: '1d6' },
  },
];

/** Search the local spell/ability list (prefix-first, then substring). */
export function searchSpells(query: string, limit = 8): SpellEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return SPELLS.slice(0, limit);
  const matches = SPELLS.filter((s) => s.name.toLowerCase().includes(q));
  matches.sort((a, b) => {
    const ap = a.name.toLowerCase().startsWith(q) ? 0 : 1;
    const bp = b.name.toLowerCase().startsWith(q) ? 0 : 1;
    return ap - bp || a.name.localeCompare(b.name);
  });
  return matches.slice(0, limit);
}

/** Exact (case-insensitive) local lookup. */
export function getSpell(name: string): SpellEntry | null {
  const q = name.trim().toLowerCase();
  return SPELLS.find((s) => s.name.toLowerCase() === q) ?? null;
}
