import type { CreatureTemplate } from '../../../shared/types.js';

/**
 * A curated, offline subset of the 5e SRD bestiary so standard-creature search
 * works with zero network/keys. Gemini (creatures/gemini.ts) covers anything
 * not listed here. HP values are the SRD averages.
 */
type SrdEntry = Omit<
  CreatureTemplate,
  'icon' | 'source' | 'armorClass' | 'speed' | 'stats' | 'actions'
> &
  Partial<Pick<CreatureTemplate, 'armorClass' | 'speed' | 'stats' | 'actions'>>;

const SRD: SrdEntry[] = [
  { name: 'Goblin', creatureType: 'humanoid (goblinoid)', maxHp: 7, armorClass: 15, speed: '30 ft.', stats: { STR: 8, DEX: 14, CON: 10, INT: 10, WIS: 8, CHA: 8 }, resistances: [], weaknesses: [], actions: [{ name: 'Scimitar', description: '+4 to hit, 1d6+2 slashing.' }, { name: 'Shortbow', description: '+4 to hit, range 80/320, 1d6+2 piercing.' }], abilities: [{ name: 'Nimble Escape', description: 'Can Disengage or Hide as a bonus action.' }] },
  { name: 'Hobgoblin', creatureType: 'humanoid (goblinoid)', maxHp: 11, resistances: [], weaknesses: [], abilities: [{ name: 'Martial Advantage', description: 'Once per turn, +2d6 damage to a creature near an ally.' }] },
  { name: 'Orc', creatureType: 'humanoid (orc)', maxHp: 15, armorClass: 13, speed: '30 ft.', stats: { STR: 16, DEX: 12, CON: 16, INT: 7, WIS: 11, CHA: 10 }, resistances: [], weaknesses: [], actions: [{ name: 'Greataxe', description: '+5 to hit, 1d12+3 slashing.' }, { name: 'Javelin', description: '+5 to hit, 1d6+3 piercing.' }], abilities: [{ name: 'Aggressive', description: 'Bonus action move toward a hostile creature.' }] },
  { name: 'Kobold', creatureType: 'humanoid (kobold)', maxHp: 5, resistances: [], weaknesses: [], abilities: [{ name: 'Pack Tactics', description: 'Advantage on attacks if an ally is adjacent to the target.' }, { name: 'Sunlight Sensitivity', description: 'Disadvantage in sunlight.' }] },
  { name: 'Bandit', creatureType: 'humanoid', maxHp: 11, resistances: [], weaknesses: [], abilities: [] },
  { name: 'Guard', creatureType: 'humanoid', maxHp: 11, resistances: [], weaknesses: [], abilities: [] },
  { name: 'Cultist', creatureType: 'humanoid', maxHp: 9, resistances: [], weaknesses: [], abilities: [] },
  { name: 'Skeleton', creatureType: 'undead', maxHp: 13, resistances: [], weaknesses: ['bludgeoning'], abilities: [{ name: 'Undead', description: 'Immune to poison and exhaustion.' }] },
  { name: 'Zombie', creatureType: 'undead', maxHp: 22, resistances: [], weaknesses: [], abilities: [{ name: 'Undead Fortitude', description: 'On reduction to 0 HP, CON save to drop to 1 HP instead.' }] },
  { name: 'Ghoul', creatureType: 'undead', maxHp: 22, resistances: [], weaknesses: [], abilities: [{ name: 'Paralyzing Claws', description: 'Targets hit must save or be paralyzed.' }] },
  { name: 'Ghost', creatureType: 'undead', maxHp: 45, resistances: ['acid', 'fire', 'lightning', 'thunder', 'bludgeoning/piercing/slashing from nonmagical attacks'], weaknesses: [], abilities: [{ name: 'Incorporeal Movement', description: 'Can move through objects and creatures.' }] },
  { name: 'Wight', creatureType: 'undead', maxHp: 45, resistances: ['necrotic', 'nonmagical bludgeoning/piercing/slashing'], weaknesses: [], abilities: [{ name: 'Life Drain', description: 'Reduces target max HP on hit.' }] },
  { name: 'Dire Wolf', creatureType: 'beast', maxHp: 37, resistances: [], weaknesses: [], abilities: [{ name: 'Pack Tactics', description: 'Advantage on attacks with an adjacent ally.' }] },
  { name: 'Wolf', creatureType: 'beast', maxHp: 11, resistances: [], weaknesses: [], abilities: [{ name: 'Pack Tactics', description: 'Advantage on attacks with an adjacent ally.' }] },
  { name: 'Brown Bear', creatureType: 'beast', maxHp: 34, resistances: [], weaknesses: [], abilities: [{ name: 'Multiattack', description: 'One bite and one claw attack.' }] },
  { name: 'Giant Spider', creatureType: 'beast', maxHp: 26, resistances: [], weaknesses: [], abilities: [{ name: 'Web', description: 'Restrains a target on a failed save.' }] },
  { name: 'Giant Rat', creatureType: 'beast', maxHp: 7, resistances: [], weaknesses: [], abilities: [{ name: 'Pack Tactics', description: 'Advantage on attacks with an adjacent ally.' }] },
  { name: 'Giant Bat', creatureType: 'beast', maxHp: 22, resistances: [], weaknesses: [], abilities: [] },
  { name: 'Boar', creatureType: 'beast', maxHp: 11, resistances: [], weaknesses: [], abilities: [{ name: 'Relentless', description: 'Drop to 1 HP instead of 0 once per turn.' }] },
  { name: 'Owlbear', creatureType: 'monstrosity', maxHp: 59, armorClass: 13, speed: '40 ft.', stats: { STR: 20, DEX: 12, CON: 17, INT: 3, WIS: 12, CHA: 7 }, resistances: [], weaknesses: [], actions: [{ name: 'Multiattack', description: 'One beak and one claws attack.' }, { name: 'Beak', description: '+7 to hit, 1d10+5 piercing.' }, { name: 'Claws', description: '+7 to hit, 2d8+5 slashing.' }], abilities: [{ name: 'Keen Sight & Smell', description: 'Advantage on Perception using sight or smell.' }] },
  { name: 'Bugbear', creatureType: 'humanoid (goblinoid)', maxHp: 27, resistances: [], weaknesses: [], abilities: [{ name: 'Brute', description: 'Extra die of damage on melee weapon hits.' }] },
  { name: 'Gnoll', creatureType: 'humanoid (gnoll)', maxHp: 22, resistances: [], weaknesses: [], abilities: [{ name: 'Rampage', description: 'Bonus action bite after reducing a creature to 0 HP.' }] },
  { name: 'Ogre', creatureType: 'giant', maxHp: 59, resistances: [], weaknesses: [], abilities: [] },
  { name: 'Troll', creatureType: 'giant', maxHp: 84, resistances: [], weaknesses: ['fire', 'acid'], abilities: [{ name: 'Regeneration', description: 'Regains 10 HP at the start of its turn unless damaged by fire/acid.' }] },
  { name: 'Hill Giant', creatureType: 'giant', maxHp: 105, resistances: [], weaknesses: [], abilities: [{ name: 'Multiattack', description: 'Two greatclub attacks.' }] },
  { name: 'Mimic', creatureType: 'monstrosity', maxHp: 58, resistances: [], weaknesses: [], abilities: [{ name: 'Adhesive', description: 'Grapples creatures that touch it.' }] },
  { name: 'Gelatinous Cube', creatureType: 'ooze', maxHp: 84, resistances: [], weaknesses: [], abilities: [{ name: 'Engulf', description: 'Can move through and engulf creatures.' }] },
  { name: 'Animated Armor', creatureType: 'construct', maxHp: 33, resistances: [], weaknesses: [], abilities: [{ name: 'Antimagic Susceptibility', description: 'Incapacitated in an antimagic field.' }] },
  { name: 'Will-o\'-Wisp', creatureType: 'undead', maxHp: 22, resistances: ['lightning', 'cold', 'necrotic'], weaknesses: [], abilities: [{ name: 'Consume Life', description: 'Can drain the life of a creature at 0 HP.' }] },
  { name: 'Imp', creatureType: 'fiend (devil)', maxHp: 10, resistances: ['cold', 'nonmagical non-silvered attacks'], weaknesses: [], abilities: [{ name: 'Shapechanger', description: 'Can transform into beast forms.' }] },
  { name: 'Quasit', creatureType: 'fiend (demon)', maxHp: 7, resistances: ['fire', 'cold', 'lightning', 'nonmagical attacks'], weaknesses: [], abilities: [{ name: 'Scare', description: 'Frightens a target on a failed save.' }] },
  { name: 'Fire Elemental', creatureType: 'elemental', maxHp: 102, resistances: ['nonmagical bludgeoning/piercing/slashing'], weaknesses: [], abilities: [{ name: 'Fire Form', description: 'Ignites creatures and objects it touches.' }] },
  { name: 'Water Elemental', creatureType: 'elemental', maxHp: 114, resistances: ['acid', 'nonmagical attacks'], weaknesses: [], abilities: [{ name: 'Whelm', description: 'Can engulf creatures in its space.' }] },
  { name: 'Young Red Dragon', creatureType: 'dragon', maxHp: 178, armorClass: 18, speed: '40 ft., fly 80 ft.', stats: { STR: 23, DEX: 10, CON: 21, INT: 14, WIS: 11, CHA: 19 }, resistances: ['fire'], weaknesses: [], actions: [{ name: 'Multiattack', description: 'One bite and two claw attacks.' }, { name: 'Bite', description: '+10 to hit, 2d10+6 piercing plus 1d6 fire.' }, { name: 'Fire Breath (Recharge 5–6)', description: '30-ft. cone, DC 17 DEX, 16d6 fire (half on save).' }], abilities: [] },
  { name: 'Giant Snake', creatureType: 'beast', maxHp: 11, resistances: [], weaknesses: [], abilities: [] },
  { name: 'Specter', creatureType: 'undead', maxHp: 22, resistances: ['necrotic', 'nonmagical attacks'], weaknesses: [], abilities: [{ name: 'Life Drain', description: 'Reduces target max HP on hit.' }] },
];

/** Pick an emoji icon from a creature's name/type. */
export function iconForCreature(name: string, type: string): string {
  const s = `${name} ${type}`.toLowerCase();
  const map: [RegExp, string][] = [
    [/dragon/, '🐉'],
    [/skeleton|specter|wight|lich/, '💀'],
    [/zombie/, '🧟'],
    [/ghost|wisp|spectre/, '👻'],
    [/ghoul|undead/, '🧟'],
    [/goblin|kobold/, '👺'],
    [/orc|hobgoblin|bugbear|gnoll/, '🧌'],
    [/ogre|troll|giant/, '🗿'],
    [/wolf/, '🐺'],
    [/bear|owlbear/, '🐻'],
    [/spider/, '🕷️'],
    [/rat/, '🐀'],
    [/bat/, '🦇'],
    [/boar|pig/, '🐗'],
    [/snake|serpent/, '🐍'],
    [/fire|flame/, '🔥'],
    [/water|aqua/, '🌊'],
    [/devil|demon|fiend|imp|quasit/, '😈'],
    [/ooze|cube|slime|jelly/, '🟩'],
    [/armor|construct|golem/, '🛡️'],
    [/mimic/, '🧰'],
    [/bandit|guard|cultist|humanoid/, '🧑'],
  ];
  for (const [re, emoji] of map) if (re.test(s)) return emoji;
  return '👹';
}

const toTemplate = (e: SrdEntry): CreatureTemplate => ({
  name: e.name,
  creatureType: e.creatureType,
  maxHp: e.maxHp,
  armorClass: e.armorClass ?? 0,
  speed: e.speed ?? '',
  stats: e.stats ?? {},
  resistances: e.resistances,
  weaknesses: e.weaknesses,
  actions: e.actions ?? [],
  abilities: e.abilities,
  icon: iconForCreature(e.name, e.creatureType),
  source: 'srd',
});

/** Fuzzy-ish prefix/substring search over the local SRD list. */
export function searchSrd(query: string, limit = 8): CreatureTemplate[] {
  const q = query.trim().toLowerCase();
  if (!q) return SRD.slice(0, limit).map(toTemplate);
  const matches = SRD.filter((e) => e.name.toLowerCase().includes(q));
  matches.sort((a, b) => {
    const ap = a.name.toLowerCase().startsWith(q) ? 0 : 1;
    const bp = b.name.toLowerCase().startsWith(q) ? 0 : 1;
    return ap - bp || a.name.localeCompare(b.name);
  });
  return matches.slice(0, limit).map(toTemplate);
}

/** Exact (case-insensitive) SRD lookup. */
export function getSrd(name: string): CreatureTemplate | null {
  const e = SRD.find((m) => m.name.toLowerCase() === name.trim().toLowerCase());
  return e ? toTemplate(e) : null;
}
