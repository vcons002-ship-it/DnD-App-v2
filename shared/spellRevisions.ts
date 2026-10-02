import type { AbilityRoll, SheetAbility } from './types.js';

type SpellInput = Pick<SheetAbility, 'name' | 'type'> & Partial<SheetAbility>;
export type SpellRevision2024 = {
  key: string;
  level: number;
  /** The exact originally shipped roll. Extra authored fields opt out. */
  legacy: AbilityRoll;
  /** Missing means there is no safe single automatic effect roll. */
  roll?: AbilityRoll;
  description: string;
  upcast?: string;
  components?: { dice: string; damageType: string; scaleDice?: string }[];
  concentration?: boolean;
  legacyMeta?: string;
  meta?: string;
};

/** Reviewed 2024 corrections to the previously shipped catalogue, not an
 * edition conversion for homebrew. Primary rules checked 2026-10-01:
 * https://www.dndbeyond.com/sources/dnd/br-2024/spell-descriptions
 * Witch Bolt: licensed Player's Handbook (2024) text at
 * https://roll20.net/compendium/dnd5e/Spells:Witch%20Bolt?expansion=32231
 * Mixed damage and conditional effects deliberately have no collapsed roll. */
export const SPELL_REVISIONS_2024: readonly SpellRevision2024[] = [
  { key: 'poison spray', level: 0,
    legacy: { kind: 'save', dice: '1d12', scaleDice: '1d12', baseLevel: 0, save: 'CON', damageType: 'poison' },
    roll: { kind: 'attack', dice: '1d12', scaleDice: '1d12', baseLevel: 0, damageType: 'poison' },
    description: 'Make a ranged spell attack against a creature within 30 feet. A hit deals 1d12 Poison damage, increasing by 1d12 at character levels 5, 11, and 17.' },
  { key: 'sorcerous burst', level: 0,
    legacy: { kind: 'attack', dice: '1d8', scaleDice: '1d8', baseLevel: 0, damageType: 'force' },
    roll: { kind: 'attack', dice: '1d8', scaleDice: '1d8', baseLevel: 0,
      damageTypeChoices: ['acid', 'cold', 'fire', 'lightning', 'poison', 'psychic', 'thunder'] },
    description: 'Make a ranged spell attack dealing 1d8 of a chosen type: Acid, Cold, Fire, Lightning, Poison, Psychic, or Thunder. Each damage die showing 8 allows another d8; the number of extra dice cannot exceed your casting modifier. Damage grows by 1d8 at levels 5, 11, and 17. Resolve the extra maximum-face dice manually.' },
  { key: 'false life', level: 1,
    legacy: { kind: 'heal', dice: '1d4+4', baseLevel: 1, damageType: 'healing' },
    roll: { kind: 'heal', dice: '2d4+4', scaleDice: '5', baseLevel: 1, damageType: 'healing',
      healingMode: 'temporary', healingBonus: 'none', healTarget: 'self' },
    description: 'Gain 2d4 + 4 temporary HP. Add 5 temporary HP per spell-slot level above 1. Temporary HP replace a smaller existing pool; they do not heal or revive you.',
    upcast: '+5 temporary HP per slot above 1st.' },
  { key: 'inflict wounds', level: 1,
    legacy: { kind: 'attack', dice: '3d10', scaleDice: '1d10', baseLevel: 1, damageType: 'necrotic' },
    roll: { kind: 'save', dice: '2d10', scaleDice: '1d10', baseLevel: 1, save: 'CON',
      saveDamage: 'half', targetMode: 'single', damageType: 'necrotic' },
    description: 'A touched creature makes a Constitution save, taking 2d10 Necrotic damage on failure or half on success. Add 1d10 per slot level above 1.',
    upcast: '+1d10 damage per slot above 1st.' },
  { key: 'witch bolt', level: 1,
    legacy: { kind: 'attack', dice: '1d12', scaleDice: '1d12', baseLevel: 1, damageType: 'lightning' },
    roll: { kind: 'attack', dice: '2d12', scaleDice: '1d12', baseLevel: 1, damageType: 'lightning' },
    description: 'A ranged spell attack deals 2d12 Lightning damage. On later turns, a Bonus Action deals 1d12 automatically, even if the original attack missed. The link ends beyond 60 feet or Total Cover; handle subsequent damage manually. Only initial damage increases with slot level.',
    upcast: '+1d12 initial damage per slot above 1st.', concentration: true,
    legacyMeta: '1 action · 30 ft · V,S,M · Concentration', meta: '1 action · 60 ft · V,S,M · Concentration' },
  { key: 'flame blade', level: 2,
    legacy: { kind: 'attack', dice: '3d6', baseLevel: 2, damageType: 'fire' },
    roll: { kind: 'attack', dice: '3d6', scaleDice: '1d6', baseLevel: 2, damageType: 'fire', damageBonus: 'spellcasting' },
    description: 'Conjure a fiery blade. A Magic action makes a melee spell attack for 3d6 Fire damage plus your casting modifier. Add 1d6 per slot above 2. The blade sheds light; later attacks use the existing blade rather than spending another slot.',
    upcast: '+1d6 damage per slot above 2nd.', concentration: true },
  { key: 'spiritual weapon', level: 2,
    legacy: { kind: 'attack', dice: '1d8', baseLevel: 2, damageType: 'force' },
    roll: { kind: 'attack', dice: '1d8', scaleDice: '1d8', baseLevel: 2, damageType: 'force', damageBonus: 'spellcasting' },
    description: 'Create a floating weapon while concentrating. Its melee spell attack deals 1d8 Force damage plus your casting modifier, adding 1d8 per slot above 2. On later turns a Bonus Action moves it up to 20 feet and repeats the attack; handle repeat use without casting again.',
    upcast: '+1d8 damage per slot above 2nd.', concentration: true,
    legacyMeta: '1 bonus action · 60 ft · V,S', meta: '1 bonus action · 60 ft · V,S · Concentration' },
  { key: 'wind wall', level: 3,
    legacy: { kind: 'save', dice: '3d8', baseLevel: 3, save: 'STR', damageType: 'bludgeoning' },
    roll: { kind: 'save', dice: '4d8', baseLevel: 3, save: 'STR', saveDamage: 'half', targetMode: 'multiple', damageType: 'bludgeoning' },
    description: 'When the wind wall appears, creatures in its area make Strength saves for 4d8 Bludgeoning damage, half on success. The wall blocks specified gases, small flyers, and ordinary projectiles; those wall effects remain manual.', concentration: true },
  { key: 'mass cure wounds', level: 5,
    legacy: { kind: 'heal', dice: '3d8', scaleDice: '1d8', baseLevel: 5, damageType: 'healing' },
    roll: { kind: 'heal', dice: '5d8', scaleDice: '1d8', baseLevel: 5, damageType: 'healing',
      targetMode: 'multiple', maxTargets: 6, healingBonus: 'spellcasting' },
    description: 'Choose up to six creatures in a 30-foot-radius sphere. Each regains 5d8 HP plus your casting modifier, with another 1d8 per slot above 5.',
    upcast: '+1d8 healing per slot above 5th.' },
  { key: 'mass healing word', level: 3,
    legacy: { kind: 'heal', dice: '2d4', scaleDice: '1d4', baseLevel: 3, damageType: 'healing' },
    roll: { kind: 'heal', dice: '2d4', scaleDice: '1d4', baseLevel: 3, damageType: 'healing',
      targetMode: 'multiple', maxTargets: 6, healingBonus: 'spellcasting' },
    description: 'Choose up to six creatures you can see within 60 feet. Each regains 2d4 HP plus your casting modifier, with another 1d4 per slot above 3.',
    upcast: '+1d4 healing per slot above 3rd.' },
  { key: 'circle of death', level: 6,
    legacy: { kind: 'save', dice: '8d6', scaleDice: '2d6', baseLevel: 6, save: 'CON', damageType: 'necrotic' },
    roll: { kind: 'save', dice: '8d8', scaleDice: '2d8', baseLevel: 6, save: 'CON',
      saveDamage: 'half', targetMode: 'multiple', damageType: 'necrotic' },
    description: 'Creatures in a 60-foot-radius sphere make Constitution saves for 8d8 Necrotic damage, half on success. Add 2d8 per slot above 6.',
    upcast: '+2d8 damage per slot above 6th.' },
  { key: 'blade barrier', level: 6,
    legacy: { kind: 'save', dice: '6d10', baseLevel: 6, save: 'DEX', damageType: 'slashing' },
    roll: { kind: 'save', dice: '6d10', baseLevel: 6, save: 'DEX', saveDamage: 'half', targetMode: 'multiple', damageType: 'force' },
    description: 'A creature in the blade wall makes a Dexterity save for 6d10 Force damage, half on success. Entry or ending a turn there can trigger it once per turn. The wall provides cover and difficult terrain; resolve later triggers manually.', concentration: true },
  { key: "mordenkainen's sword", level: 7,
    legacy: { kind: 'attack', dice: '3d10', baseLevel: 7, damageType: 'force' },
    roll: { kind: 'attack', dice: '4d12', baseLevel: 7, damageType: 'force', damageBonus: 'spellcasting' },
    description: 'Create a spectral sword within 90 feet. Its melee spell attack deals 4d12 Force damage plus your casting modifier. On later turns a Bonus Action moves it up to 30 feet and repeats the attack; repeat use remains manual and does not require a new casting.',
    concentration: false, legacyMeta: '1 action · 60 ft · V,S,M · Concentration', meta: '1 action · 90 ft · V,S,M · 1 minute' },
  { key: 'weird', level: 9,
    legacy: { kind: 'save', dice: '4d10', baseLevel: 9, save: 'WIS', damageType: 'psychic' },
    roll: { kind: 'save', dice: '10d10', baseLevel: 9, save: 'WIS', saveDamage: 'half', targetMode: 'multiple', damageType: 'psychic' },
    description: 'Chosen creatures in a 30-foot-radius sphere make Wisdom saves for 10d10 Psychic damage, half on success. Failed saves also cause Frightened. A frightened target repeats the save at turn end, taking 5d10 on failure or ending the effect on success; later damage remains manual.', concentration: true },
  { key: 'ray of enfeeblement', level: 2,
    legacy: { kind: 'attack', dice: '0', baseLevel: 2, damageType: 'necrotic' },
    roll: { kind: 'save', save: 'CON', saveDamage: 'none', targetMode: 'single', baseLevel: 2 },
    description: 'A Constitution save determines the weakening effect. Success gives disadvantage on the next attack until your next turn. Failure gives disadvantage on Strength d20 tests and subtracts 1d8 from damage; end-of-turn saves can end it. Apply those effects manually.', concentration: true },
  { key: 'contagion', level: 5,
    legacy: { kind: 'attack', dice: '0', baseLevel: 5, damageType: 'poison' },
    roll: { kind: 'save', dice: '11d8', baseLevel: 5, save: 'CON', saveDamage: 'none', targetMode: 'single', damageType: 'necrotic' },
    description: 'A touched creature makes a Constitution save. Failure deals 11d8 Necrotic damage and causes Poisoned, with save disadvantage for a chosen ability. Track the repeated saves, three successes/failures, and long-duration effect manually.' },
  { key: 'ice storm', level: 4,
    legacy: { kind: 'save', dice: '2d8', scaleDice: '1d8', baseLevel: 4, save: 'DEX', damageType: 'bludgeoning' },
    description: 'Creatures in a 20-foot-radius cylinder make Dexterity saves for 2d10 Bludgeoning plus 4d6 Cold damage, half on success. Add 1d10 Bludgeoning per slot above 4. Roll and apply both damage types separately; the area becomes difficult terrain until your next turn.',
    upcast: '+1d10 Bludgeoning damage per slot above 4th.',
    components: [{ dice: '2d10', damageType: 'bludgeoning', scaleDice: '1d10' }, { dice: '4d6', damageType: 'cold' }] },
  { key: 'flame strike', level: 5,
    legacy: { kind: 'save', dice: '4d6', scaleDice: '1d6', baseLevel: 5, save: 'DEX', damageType: 'fire' },
    description: 'Creatures in the 10-foot-radius cylinder make Dexterity saves for 5d6 Fire plus 5d6 Radiant damage, half on success. Each damage type gains 1d6 per slot above 5; roll and apply the two types separately.',
    upcast: '+1d6 Fire and +1d6 Radiant per slot above 5th.',
    components: [{ dice: '5d6', damageType: 'fire', scaleDice: '1d6' }, { dice: '5d6', damageType: 'radiant', scaleDice: '1d6' }] },
  { key: 'meteor swarm', level: 9,
    legacy: { kind: 'save', dice: '40d6', baseLevel: 9, save: 'DEX', damageType: 'fire' },
    description: 'Creatures in four 40-foot-radius spheres make Dexterity saves for 20d6 Fire plus 20d6 Bludgeoning damage, half on success. A creature in overlapping spheres is affected once. Roll and apply each damage type separately.',
    components: [{ dice: '20d6', damageType: 'fire' }, { dice: '20d6', damageType: 'bludgeoning' }] },
  { key: 'true strike', level: 0,
    legacy: { kind: 'attack', dice: '1d6', scaleDice: '1d6', baseLevel: 0, damageType: 'radiant' },
    description: 'Make an attack with the spell-component weapon using your casting ability for attack and damage. Choose the weapon damage type or Radiant. Add 1d6 Radiant at character level 5, 2d6 at 11, and 3d6 at 17. Resolve the weapon-based attack manually.' },
  { key: 'aid', level: 2,
    legacy: { kind: 'heal', dice: '5', scaleDice: '5', baseLevel: 2, damageType: 'healing' },
    description: 'For 8 hours, up to three creatures gain 5 to both current and maximum HP, plus 5 per slot above 2. Apply and later remove the maximum-HP increase manually; this is not ordinary healing.',
    upcast: '+5 current and maximum HP per slot above 2nd.' },
  { key: 'prayer of healing', level: 2,
    legacy: { kind: 'heal', dice: '2d8', scaleDice: '1d8', baseLevel: 2, damageType: 'healing' },
    description: 'Up to five creatures that stay for the 10-minute casting gain a Short Rest and regain 2d8 HP, plus 1d8 per slot above 2. No casting modifier is added. A creature cannot benefit again until a Long Rest. Resolve the rest and shared healing manually.',
    upcast: '+1d8 healing per slot above 2nd.' },
  { key: 'mass heal', level: 9,
    legacy: { kind: 'heal', dice: '700', baseLevel: 9, damageType: 'healing' },
    description: 'Distribute a pool of 700 healing among creatures you can see within range, without adding a casting modifier. The chosen targets also lose Blinded, Deafened, and Poisoned. Allocate and apply the pool manually.' },
  { key: 'glyph of warding', level: 3,
    legacy: { kind: 'save', dice: '5d8', scaleDice: '1d8', baseLevel: 3, save: 'DEX' },
    description: 'Inscribe a glyph and choose a later trigger. An explosive glyph deals 5d8 of a chosen type (Acid, Cold, Fire, Lightning, or Thunder) with a Dexterity save for half, adding 1d8 per slot above 3. A spell glyph instead stores a spell. Creating the glyph deals no immediate damage.',
    upcast: '+1d8 explosive damage or a higher stored-spell level per slot above 3rd.' },
  { key: 'dream', level: 5,
    legacy: { kind: 'save', dice: '3d6', baseLevel: 5, save: 'WIS', damageType: 'psychic' },
    description: 'A messenger enters a sleeping target\'s dream. A terrifying message allows a Wisdom save; failure prevents rest benefits and deals 3d6 Psychic when the target wakes. Casting is not an immediate damaging attack; resolve the dream manually.' },
  { key: 'earthquake', level: 8,
    legacy: { kind: 'save', dice: '5d6', baseLevel: 8, save: 'DEX', damageType: 'bludgeoning' },
    description: 'A tremor creates difficult terrain. Failed Dexterity saves cause Prone and break concentration. Optional fissures and collapsing structures have separate effects; falling debris can deal 5d6 Bludgeoning with a save for half. Creating the tremor does not directly damage every creature.', concentration: true },
  { key: 'fire shield', level: 4,
    legacy: { kind: 'damage', dice: '2d8', baseLevel: 4, damageType: 'fire' },
    description: 'Choose a warm shield for Cold resistance or a chill shield for Fire resistance. A creature within 5 feet hitting you with a melee attack takes 2d8 Fire or Cold damage respectively. Apply the resistance and retaliation manually; casting deals no immediate damage.' },
  { key: 'geas', level: 5,
    legacy: { kind: 'damage', dice: '5d10', baseLevel: 5, damageType: 'psychic' },
    description: 'A failed Wisdom save charms the creature and imposes your command. Acting directly against the command can deal 5d10 Psychic at most once per day. Resolve the command and its conditional damage manually; casting is not an immediate damage roll.' },
  { key: 'elemental weapon', level: 3,
    legacy: { kind: 'damage', dice: '1d4', baseLevel: 3 },
    description: 'A nonmagical weapon becomes magical, gains +1 to attack rolls, and adds 1d4 of a chosen elemental damage type on hits. Higher slots improve both bonuses. Apply the weapon buff manually; casting itself deals no damage.', concentration: true },
  { key: 'bestow curse', level: 3,
    legacy: { kind: 'damage', dice: '1d8', baseLevel: 3, damageType: 'necrotic' },
    description: 'A touched creature makes a Wisdom save. On failure, choose the curse: ability-test disadvantage, attack disadvantage against you, turn-start behavior, or an extra 1d8 Necrotic when you damage it. Resolve the chosen effect manually; the optional rider is not damage dealt on casting.', concentration: true },
];

const keyFor = (name: string) => name.trim().toLowerCase().replace(/[’‘]/g, "'");
const normalized = (value: unknown) => typeof value === 'string' ? value.replace(/\s/g, '').toLowerCase() : value;
function matchesRoll(actual: AbilityRoll | undefined, expected: AbilityRoll | undefined): boolean {
  if (!actual || !expected) return actual === expected;
  // Selecting INT/WIS/CHA for a class-scoped spell does not author new mechanics.
  const keys = (roll: AbilityRoll) => Object.keys(roll).filter(key => key !== 'castingAbility' && roll[key as keyof AbilityRoll] !== undefined).sort();
  const a = keys(actual), b = keys(expected);
  return a.join(',') === b.join(',') && a.every(key => JSON.stringify(normalized(actual[key as keyof AbilityRoll])) === JSON.stringify(normalized(expected[key as keyof AbilityRoll])));
}
export function spellRevision2024For(ability: SpellInput): SpellRevision2024 | undefined {
  if (ability.type !== 'spell') return undefined;
  return SPELL_REVISIONS_2024.find(revision => revision.key === keyFor(ability.name) && ability.level === revision.level);
}
export function matchesRevisedSpell2024(ability: SpellInput): boolean {
  if (ability.source === 'custom' || ability.executionProfile === 'manual') return false;
  const revision = spellRevision2024For(ability);
  return !!revision && matchesRoll(ability.roll, revision.roll);
}
/** Nonmutating upgrade, only for the exact old shipped formula. */
export function revisedSpellAbility2024(ability: SheetAbility): SheetAbility {
  if (ability.source === 'custom' || ability.executionProfile === 'manual') return ability;
  const revision = spellRevision2024For(ability);
  if (!revision || !matchesRoll(ability.roll, revision.legacy)) return ability;
  const next: SheetAbility = { ...ability,
    roll: revision.roll ? { ...revision.roll, ...(ability.roll?.castingAbility ? { castingAbility: ability.roll.castingAbility } : {}) } : undefined };
  if (revision.concentration !== undefined) {
    const tags = (ability.tags ?? []).filter(tag => tag.trim().toLowerCase() !== 'concentration');
    next.tags = revision.concentration ? [...tags, 'concentration'] : tags;
  }
  if (revision.meta && (!ability.meta || ability.meta === revision.legacyMeta)) next.meta = revision.meta;
  return next;
}
