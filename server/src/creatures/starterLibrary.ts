import type { CreatureTemplate } from '../../../shared/types.js';
import { weaponsFromActions } from '../../../shared/monsterAttacks.js';
import { getSrd } from './srd.js';

/** SRD 5.1 stat blocks with deliberately selected physical models and sizes. */
export const STARTER_APPEARANCES: Record<string, [string, string, string[]]> = {
  Ogre: ['ogre', 'Large', ['giant']],
  Ghoul: ['ghoul', 'Medium', ['undead']],
  'Giant Bat': ['giant-bat', 'Large', ['beast']],
  'Black Bear': ['brown-bear', 'Medium', ['beast', 'black']],
  'Giant Wolf Spider': ['spider', 'Medium', ['beast']],
  Scout: ['human-bandit', 'Medium', ['humanoid', 'scout']],
  Veteran: ['human-guard', 'Medium', ['humanoid', 'soldier']],
  Bugbear: ['bugbear', 'Medium', ['goblinoid']],
  Gnoll: ['gnoll', 'Medium', ['humanoid', 'gnoll']],
  Owlbear: ['owlbear', 'Large', ['monstrosity']],
  'Brown Bear': ['brown-bear', 'Large', ['beast']],
  Commoner: ['human-commoner', 'Medium', ['humanoid']],
  'Bandit Captain': ['human-bandit', 'Medium', ['humanoid', 'pirate']],
  Mage: ['human-mage', 'Medium', ['humanoid', 'arcane']],
  Treant: ['treant', 'Huge', ['plant']],
  Goblin: ['goblin', 'Small', ['goblinoid']],
  Hobgoblin: ['hobgoblin', 'Medium', ['goblinoid']],
  Orc: ['orc', 'Medium', ['orc']],
  Kobold: ['kobold', 'Small', ['reptilian']],
  Imp: ['imp', 'Tiny', ['fiend', 'devil', 'shapechanger']],
  Bandit: ['human-bandit', 'Medium', ['humanoid']],
  Guard: ['human-guard', 'Medium', ['humanoid']],
  Cultist: ['human-mage', 'Medium', ['cultist']],
  Skeleton: ['skeleton', 'Medium', ['undead']],
  Zombie: ['zombie', 'Medium', ['undead']],
  Ghost: ['ghost', 'Medium', ['spectral', 'undead']],
  Wight: ['wight', 'Medium', ['undead']],
  Specter: ['ghost', 'Medium', ['spectral', 'undead']],
  Wolf: ['wolf', 'Medium', ['beast']],
  'Dire Wolf': ['wolf', 'Large', ['beast']],
  'Giant Spider': ['spider', 'Large', ['beast']],
  'Giant Rat': ['giant-rat', 'Small', ['beast']],
  'Constrictor Snake': ['snake', 'Large', ['beast']],
  Mimic: ['mimic', 'Medium', ['shapechanger']],
  Troll: ['troll', 'Large', ['giant']],
  'Young Red Dragon': ['dragon', 'Large', ['dragon', 'red', 'young']],
};

/** Separate seed batch so upgrades do not restore deliberately deleted starters. */
export const COMMON_CREATURE_BATCH = ['Bugbear', 'Gnoll', 'Owlbear', 'Brown Bear', 'Commoner', 'Bandit Captain', 'Mage', 'Treant'];
export const COMMON_CREATURE_BATCH_2 = ['Ogre', 'Ghoul', 'Giant Bat', 'Black Bear', 'Giant Wolf Spider', 'Scout', 'Veteran'];

export function starterCreatures(): CreatureTemplate[] {
  const creatures = Object.entries(STARTER_APPEARANCES).map(([name, [modelType, size, visualTags]]) => {
    const source = getSrd(name);
    if (!source) throw new Error(`Missing starter SRD creature: ${name}`);
    return { ...source, creatureType: `${size} ${source.creatureType}`, modelType,
      ...( ['bugbear', 'gnoll', 'owlbear', 'brown-bear', 'ogre', 'ghoul', 'giant-bat'].includes(modelType) ? { icon: `/miniatures/monsters/${modelType}.png`, modelColor: name === 'Black Bear' ? '' : 'natural' } : {}),
      visualTags, weapons: weaponsFromActions(source.actions).weapons };
  });
  const bandit = creatures.find(c => c.name === 'Bandit')!;
  const imp = creatures.find(c => c.name === 'Imp')!;
  imp.icon = '/miniatures/monsters/imp.png';
  imp.modelColor = 'natural';
  imp.actions = [...imp.actions, { name: 'Invisibility', description: 'Become invisible, including carried equipment. Ends when the imp attacks or loses concentration.' }];
  imp.abilities = [
    { name: 'Shapechanger', description: 'Use an action to take rat, raven, spider, or true form. Rat speed 20 ft.; raven speed 20 ft. and fly 60 ft.; spider speed 20 ft. and climb 20 ft. Other statistics stay the same. Equipment does not transform. Death restores true form.' },
    { name: "Devil's Sight", description: 'Darkvision 120 ft.; magical darkness does not block this darkvision.' },
    { name: 'Magic Resistance', description: 'Advantage on saving throws against spells and other magical effects.' },
    { name: 'Immunities', description: 'Immune to fire and poison damage and the poisoned condition.' },
    { name: 'Skills and languages', description: 'Deception +4, Insight +3, Persuasion +4, Stealth +5; passive Perception 11. Speaks Infernal and Common.' },
  ];
  creatures.push({ ...bandit, name: 'Pirate First Mate', visualTags: ['humanoid', 'sailor', 'pirate', 'first-mate'],
    abilities: [...bandit.abilities, { name: 'Pirate role', description: 'A first mate using the Bandit stat block. The title does not change its challenge rating.' }] });
  creatures.push({ name: 'Mage Hand', creatureType: 'Tiny spell effect', level: 0,
    modelType: 'mage-hand', modelColor: 'natural', visualTags: ['arcane', 'spell-effect'],
    maxHp: 1, armorClass: 0, speed: '30 ft. per use of the caster\'s action', stats: {},
    resistances: [], weaknesses: [], weapons: [], icon: '✋', source: 'library',
    actions: [{ name: 'Manipulate object', description: 'The caster uses an action to manipulate an object, open an unlocked door or container, retrieve or stow an item in an open container, or pour out a vial. Move the hand up to 30 feet with that action.' }],
    abilities: [
      { name: 'Mage Hand limits (2014)', description: 'Lasts 1 minute. Disappears more than 30 feet from the caster or if cast again. Cannot attack, activate magic items, or carry more than 10 pounds.' },
      { name: 'Utility marker', description: 'This is a spell effect, not a creature. Its 1 HP and 0 AC are display placeholders, not rules statistics. The DM manages its duration, movement and dismissal.' },
    ] });
  return creatures;
}
