import type { CreatureTemplate } from '../../../shared/types.js';
import { weaponsFromActions } from '../../../shared/monsterAttacks.js';
import { getSrd } from './srd.js';

/** SRD 5.1 stat blocks with deliberately selected physical models and sizes. */
export const STARTER_APPEARANCES: Record<string, [string, string, string[]]> = {
  Goblin: ['goblin', 'Small', ['goblinoid']],
  Hobgoblin: ['hobgoblin', 'Medium', ['goblinoid']],
  Orc: ['orc', 'Medium', ['orc']],
  Kobold: ['kobold', 'Small', ['reptilian']],
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

export function starterCreatures(): CreatureTemplate[] {
  const creatures = Object.entries(STARTER_APPEARANCES).map(([name, [modelType, size, visualTags]]) => {
    const source = getSrd(name);
    if (!source) throw new Error(`Missing starter SRD creature: ${name}`);
    return { ...source, creatureType: `${size} ${source.creatureType}`, modelType,
      visualTags, weapons: weaponsFromActions(source.actions).weapons };
  });
  const bandit = creatures.find(c => c.name === 'Bandit')!;
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
