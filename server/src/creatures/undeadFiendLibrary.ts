import type { CreatureTemplate } from '../../../shared/types.js';

/** New SRD 5.2.1 entries only; never converts existing saved stat blocks. */
export const UNDEAD_FIEND_BATCH = ['Shadow', 'Mummy', 'Quasit', 'Dretch'];

export function undeadFiendCreatures(): CreatureTemplate[] {
  const entries: CreatureTemplate[] = [
    {
      name: 'Shadow', creatureType: 'Medium undead', level: 0.5,
      maxHp: 27, armorClass: 12, speed: '40 ft.',
      stats: { STR: 6, DEX: 14, CON: 13, INT: 6, WIS: 10, CHA: 8 },
      resistances: ['acid', 'cold', 'fire', 'lightning', 'thunder'],
      immunities: ['necrotic', 'poison'], weaknesses: ['radiant'],
      weapons: [{ name: 'Draining Swipe', kind: 'melee', attackBonus: 4, range: 'reach 5 ft.', damage: '1d6+2', damageType: 'necrotic' }],
      actions: [
        { name: 'Draining Swipe', description: '+4 to hit, reach 5 ft., 1d6+2 necrotic.' },
        { name: 'Shadow Stealth', description: 'Bonus action: take the Hide action while in dim light or darkness.' },
      ],
      abilities: [
        { name: 'Draining Swipe effect', description: 'On a hit, also reduce the target\'s Strength by 1d4. It dies if its Strength reaches 0. A Humanoid killed by this attack becomes a Shadow after 1d4 hours. The DM tracks the Strength loss separately from HP damage.' },
        { name: 'Amorphous', description: 'Can pass through gaps as narrow as 1 inch without extra movement.' },
        { name: 'Sunlight Weakness', description: 'Disadvantage on D20 Tests while in sunlight.' },
        { name: 'Condition immunities', description: 'Exhaustion, frightened, grappled, paralyzed, petrified, poisoned, prone, restrained and unconscious.' },
        { name: 'Senses, skills and languages', description: 'Darkvision 60 ft.; passive Perception 10; Stealth +6. No languages.' },
      ],
      modelType: 'shadow', visualTags: ['undead', 'shadow'], source: 'srd', icon: '/miniatures/monsters/shadow.png',
    },
    {
      name: 'Mummy', creatureType: 'Medium undead', level: 3,
      maxHp: 58, armorClass: 11, speed: '20 ft.',
      stats: { STR: 16, DEX: 8, CON: 15, INT: 6, WIS: 12, CHA: 12 },
      resistances: [], immunities: ['necrotic', 'poison'], weaknesses: ['fire'],
      weapons: [{ name: 'Rotting Fist', kind: 'melee', attackBonus: 5, range: 'reach 5 ft.', damage: '1d10+3', damageType: 'bludgeoning', extraDamage: '3d6', extraDamageType: 'necrotic' }],
      actions: [
        { name: 'Rotting Fist', description: '+5 to hit, reach 5 ft., 1d10+3 bludgeoning.' },
        { name: 'Multiattack', description: 'Make two Rotting Fist attacks and use Dreadful Glare.' },
        { name: 'Dreadful Glare', description: 'One visible creature within 60 ft. makes a DC 11 WIS save. Failure: frightened until the end of the mummy\'s next turn. Success: immune to this mummy\'s Dreadful Glare for 24 hours.' },
      ],
      abilities: [
        { name: 'Rotting Fist curse', description: 'Each hit also deals 3d6 necrotic damage (included in the weapon roll) and curses a creature target. The curse prevents healing and prevents its HP maximum returning to normal after a Long Rest; every 24 hours its HP maximum decreases by 3d6. A creature reduced to 0 HP by this attack dies and becomes dust. The DM tracks the curse and its ongoing effects.' },
        { name: 'Saving throws', description: 'Wisdom +3.' },
        { name: 'Condition immunities', description: 'Charmed, exhaustion, frightened, paralyzed and poisoned.' },
        { name: 'Senses and languages', description: 'Darkvision 60 ft.; passive Perception 11. Common and two other languages.' },
        { name: 'Size', description: 'SRD size is Medium or Small; this template uses Medium. The DM may choose Small.' },
      ],
      modelType: 'mummy', visualTags: ['undead', 'mummy'], source: 'srd', icon: '/miniatures/monsters/mummy.png',
    },
    {
      name: 'Quasit', creatureType: 'Tiny fiend (demon)', level: 1,
      maxHp: 25, armorClass: 13, speed: '40 ft.',
      stats: { STR: 5, DEX: 17, CON: 10, INT: 7, WIS: 10, CHA: 10 },
      resistances: ['cold', 'fire', 'lightning'], immunities: ['poison'], weaknesses: [],
      weapons: [{ name: 'Rend', kind: 'melee', attackBonus: 5, range: 'reach 5 ft.', damage: '1d4+3', damageType: 'slashing' }],
      actions: [
        { name: 'Rend', description: '+5 to hit, reach 5 ft., 1d4+3 slashing.' },
        { name: 'Invisibility', description: 'Cast Invisibility on itself without components, using Charisma. Concentration, up to 1 hour; ends when the quasit attacks, deals damage or casts a spell.' },
        { name: 'Scare (1/day)', description: 'One creature within 20 ft. makes a DC 10 WIS save. Failure: frightened. Repeat the save at each turn end, ending the effect on a success; after 1 minute the save succeeds automatically.' },
        { name: 'Shape-Shift', description: 'Change into a bat (speed 10 ft., fly 40 ft.), centipede (40 ft., climb 40 ft.), toad (40 ft., swim 40 ft.), or true form. Only speed changes; equipment does not transform.' },
      ],
      abilities: [
        { name: 'Rend effect', description: 'On a hit, the target is also poisoned until the start of the quasit\'s next turn. The DM applies the condition.' },
        { name: 'Magic Resistance', description: 'Advantage on saves against spells and other magical effects.' },
        { name: 'Condition immunities', description: 'Poisoned.' },
        { name: 'Senses, skills and languages', description: 'Darkvision 120 ft.; passive Perception 10; Stealth +5. Abyssal and Common.' },
      ],
      modelType: 'quasit', visualTags: ['fiend', 'demon', 'shapechanger'], source: 'srd', icon: '/miniatures/monsters/quasit.png',
    },
    {
      name: 'Dretch', creatureType: 'Small fiend (demon)', level: 0.25,
      maxHp: 18, armorClass: 11, speed: '20 ft.',
      stats: { STR: 12, DEX: 11, CON: 12, INT: 5, WIS: 8, CHA: 3 },
      resistances: ['cold', 'fire', 'lightning'], immunities: ['poison'], weaknesses: [],
      weapons: [{ name: 'Rend', kind: 'melee', attackBonus: 3, range: 'reach 5 ft.', damage: '1d6+1', damageType: 'slashing' }],
      actions: [
        { name: 'Rend', description: '+3 to hit, reach 5 ft., 1d6+1 slashing.' },
        { name: 'Fetid Cloud (1/day)', description: 'Each creature in a 10-foot emanation makes a DC 11 CON save. Failure: poisoned until the end of its next turn. While poisoned this way, it can take an action or a bonus action on its turn, not both, and cannot take reactions.' },
      ],
      abilities: [
        { name: 'Condition immunities', description: 'Poisoned.' },
        { name: 'Senses and languages', description: 'Darkvision 60 ft.; passive Perception 9. Abyssal; telepathy 60 ft. with creatures that understand Abyssal.' },
      ],
      modelType: 'dretch', visualTags: ['fiend', 'demon'], source: 'srd', icon: '/miniatures/monsters/dretch.png',
    },
  ];
  return entries.map(creature => ({ ...creature, modelColor: 'natural',
    abilities: [...creature.abilities, { name: 'Rules reference', description: 'SRD 5.2.1 (2024 rules). Damage attacks are rollable; condition, curse, ability-score and daily-use effects are managed by the DM.' }],
  }));
}
