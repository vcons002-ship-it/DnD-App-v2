import type { CreatureAbility, CreatureTemplate } from '../../../shared/types.js';

/** Additive library content; never replaces a campaign's existing Cultist. */
export const CULTIST_DEMON_BATCH = ['Cultist Swordsman', 'Cultist Fanatic', 'Vrock', 'Hezrou', 'Glabrezu'];

const demonTraits: CreatureAbility[] = [
  { name: 'Demonic Restoration', description: 'If killed outside the Abyss, its body dissolves into ichor and it immediately regains a body with all HP somewhere in the Abyss.' },
  { name: 'Magic Resistance', description: 'Advantage on saves against spells and other magical effects.' },
  { name: 'Condition immunities', description: 'Poisoned.' },
];

export function cultistDemonCreatures(): CreatureTemplate[] {
  const entries: CreatureTemplate[] = [
    {
      name: 'Cultist Swordsman', creatureType: 'Medium humanoid', level: 0.125,
      maxHp: 9, armorClass: 14, speed: '30 ft.',
      stats: { STR: 11, DEX: 12, CON: 10, INT: 10, WIS: 11, CHA: 10 },
      resistances: [], immunities: [], weaknesses: [],
      weapons: [{ name: 'Scimitar', kind: 'melee', attackBonus: 3, range: 'reach 5 ft.', damage: '1d6+1', damageType: 'slashing' }],
      actions: [{ name: 'Scimitar', description: '+3 to hit, reach 5 ft., 1d6+1 slashing.' }],
      abilities: [
        { name: 'Dark Devotion', description: 'Advantage on saves against being charmed or frightened.' },
        { name: 'Equipment', description: 'Leather armor, scimitar and shield. AC 14 includes the shield.' },
        { name: 'Skills, senses and languages', description: 'Deception +2, Religion +2; passive Perception 10. Common.' },
        { name: 'Rules reference', description: 'Equipped variant of the SRD 5.1 Cultist: added a shield (+2 AC) to match the existing model; all other statistics and CR are unchanged. This is a library variant, not a separate official stat block.' },
      ],
      modelType: 'cultist', visualTags: ['humanoid', 'cultist', 'swordsman'], source: 'library', icon: '/miniatures/monsters/cultist.png',
    },
    {
      name: 'Cultist Fanatic', creatureType: 'Medium humanoid', level: 2,
      maxHp: 44, armorClass: 13, speed: '30 ft.',
      stats: { STR: 11, DEX: 14, CON: 12, INT: 10, WIS: 14, CHA: 13 },
      resistances: [], immunities: [], weaknesses: [],
      weapons: [{ name: 'Pact Blade', kind: 'melee', attackBonus: 4, range: 'reach 5 ft.', damage: '1d8+2', damageType: 'slashing', extraDamage: '2d6', extraDamageType: 'necrotic' }],
      actions: [
        { name: 'Pact Blade', description: '+4 to hit, reach 5 ft., 1d8+2 slashing.' },
        { name: 'Spellcasting', description: 'Wisdom spellcasting: save DC 12, +4 spell attacks. At will: Light, Thaumaturgy. Command 2/day; Hold Person 1/day. Daily uses and spell conditions are managed by the DM.' },
        { name: 'Light', description: 'At will. Action; touch an object, making it shed bright light for 20 ft. and dim light for another 20 ft. for 1 hour. Covering it blocks the light.' },
        { name: 'Thaumaturgy', description: 'At will. Action; 30 ft. Produce a minor supernatural effect such as a booming voice, altered flames, harmless tremors, an instantaneous sound, a door opening or closing, or altered eyes.' },
        { name: 'Command (2/day)', description: 'Action; one visible creature within 60 ft. makes a DC 12 WIS save. On failure, it follows a one-word command on its next turn: Approach, Drop, Flee, Grovel or Halt. The DM tracks uses and applies the result.' },
        { name: 'Hold Person (1/day)', description: 'Action; one visible Humanoid within 60 ft. makes a DC 12 WIS save. Failure: paralyzed, concentration up to 1 minute. It repeats the save at the end of each turn, ending the effect on a success. The DM applies the condition and tracks concentration.' },
        { name: 'Spiritual Weapon (2/day)', description: 'Bonus action to cast; create a spectral weapon within 60 ft. Concentration, up to 1 minute. On casting and subsequent bonus actions, move it up to 20 ft. and attack a creature within 5 ft. of it: +4 to hit, 1d8+2 force. Measure reach from the spectral weapon; the DM positions it and tracks concentration and the two casts per day.', roll: { kind: 'attack', dice: '1d8+2', damageType: 'force', attackBonus: 4, castingAbility: 'WIS', baseLevel: 2 } },
      ],
      abilities: [
        { name: 'Pact Blade damage', description: 'The weapon roll includes its additional 2d6 necrotic damage.' },
        { name: 'Saving throws', description: 'Wisdom +4.' },
        { name: 'Skills, senses and languages', description: 'Deception +3, Persuasion +3, Religion +2; passive Perception 12. Common.' },
        { name: 'Equipment and size', description: 'Holy symbol and leather armor. SRD size is Medium or Small; this template uses Medium.' },
      ],
      modelType: 'cultist-fanatic', visualTags: ['humanoid', 'cultist', 'spellcaster'], source: 'srd', icon: '/miniatures/monsters/cultist-fanatic.png',
    },
    {
      name: 'Vrock', creatureType: 'Large fiend (demon)', level: 6,
      maxHp: 152, armorClass: 15, speed: '40 ft., fly 60 ft.',
      stats: { STR: 17, DEX: 15, CON: 18, INT: 8, WIS: 13, CHA: 8 },
      resistances: ['cold', 'fire', 'lightning'], immunities: ['poison'], weaknesses: [],
      weapons: [{ name: 'Shred', kind: 'melee', attackBonus: 6, range: 'reach 5 ft.', damage: '2d6+3', damageType: 'piercing', extraDamage: '3d6', extraDamageType: 'poison' }],
      actions: [
        { name: 'Shred', description: '+6 to hit, reach 5 ft., 2d6+3 piercing.' },
        { name: 'Multiattack', description: 'Make two Shred attacks. Each weapon roll includes the additional poison damage.' },
        { name: 'Spores (Recharge 6)', description: 'Each creature in a 20-foot emanation makes a DC 15 CON save. Failure: poisoned, repeating the save at each turn end to end the effect. While poisoned, use the Spore damage action at the start of each turn. Emptying a flask of Holy Water on the creature ends the effect. The DM tracks recharge, saves and the ongoing condition.' },
        { name: 'Spore damage', description: 'Apply only at the start of a creature\'s turn while it is poisoned by Spores.', roll: { kind: 'damage', dice: '1d10', damageType: 'poison' } },
        { name: 'Stunning Screech (1/day)', description: 'Each creature in a 20-foot emanation makes a DC 15 CON save; demons succeed automatically. Failure: 3d6 thunder damage and stunned until the end of the vrock\'s next turn. Success: no damage. The DM selects affected creatures, applies stunned and tracks the daily use.', roll: { kind: 'save', dice: '3d6', damageType: 'thunder', save: 'CON', dc: 15, saveDamage: 'none', targetMode: 'multiple' } },
      ],
      abilities: [ ...demonTraits,
        { name: 'Saving throws', description: 'Dexterity +5, Wisdom +4, Charisma +2.' },
        { name: 'Senses and languages', description: 'Darkvision 120 ft.; passive Perception 11. Abyssal; telepathy 120 ft.' },
      ],
      modelType: 'vrock', visualTags: ['fiend', 'demon', 'flying'], source: 'srd', icon: '/miniatures/monsters/vrock.png',
    },
    {
      name: 'Hezrou', creatureType: 'Large fiend (demon)', level: 8,
      maxHp: 157, armorClass: 18, speed: '30 ft.',
      stats: { STR: 19, DEX: 17, CON: 20, INT: 5, WIS: 12, CHA: 13 },
      resistances: ['cold', 'fire', 'lightning'], immunities: ['poison'], weaknesses: [],
      weapons: [{ name: 'Rend', kind: 'melee', attackBonus: 7, range: 'reach 5 ft.', damage: '1d4+4', damageType: 'slashing', extraDamage: '2d8', extraDamageType: 'poison' }],
      actions: [
        { name: 'Rend', description: '+7 to hit, reach 5 ft., 1d4+4 slashing.' },
        { name: 'Multiattack', description: 'Make three Rend attacks. Each weapon roll includes the additional poison damage.' },
        { name: 'Leap', description: 'Bonus action: jump up to 30 ft. by spending 10 ft. of movement.' },
      ],
      abilities: [ ...demonTraits,
        { name: 'Stench', description: 'A creature starting its turn in a 10-foot emanation makes a DC 16 CON save. Failure: poisoned until the start of its next turn. The DM resolves this at the affected creature\'s turn.' },
        { name: 'Saving throws', description: 'Strength +7, Constitution +8, Wisdom +4.' },
        { name: 'Senses and languages', description: 'Darkvision 120 ft.; passive Perception 11. Abyssal; telepathy 120 ft.' },
      ],
      modelType: 'hezrou', visualTags: ['fiend', 'demon', 'brute'], source: 'srd', icon: '/miniatures/monsters/hezrou.png',
    },
    {
      name: 'Glabrezu', creatureType: 'Large fiend (demon)', level: 9,
      maxHp: 189, armorClass: 17, speed: '40 ft.',
      stats: { STR: 20, DEX: 15, CON: 21, INT: 19, WIS: 17, CHA: 16 },
      resistances: ['cold', 'fire', 'lightning'], immunities: ['poison'], weaknesses: [],
      weapons: [{ name: 'Pincer', kind: 'melee', attackBonus: 9, range: 'reach 10 ft.', damage: '2d10+5', damageType: 'slashing' }],
      actions: [
        { name: 'Pincer', description: '+9 to hit, reach 10 ft., 2d10+5 slashing.' },
        { name: 'Multiattack', description: 'Make two Pincer attacks, then use Pummel or Spellcasting.' },
        { name: 'Pummel', description: 'One creature grappled by the glabrezu makes a DC 17 DEX save. Failure: 3d6+5 bludgeoning damage. Success: half damage. Only choose a creature already grappled by a pincer.', roll: { kind: 'save', dice: '3d6+5', damageType: 'bludgeoning', save: 'DEX', dc: 17, saveDamage: 'half', targetMode: 'single' } },
        { name: 'Spellcasting', description: 'Intelligence spellcasting, save DC 16, without Material components. At will: Darkness, Detect Magic, Dispel Magic. Once per day each: Confusion, Fly, Power Word Stun. The DM tracks daily uses and concentration.' },
        { name: 'Darkness', description: 'At will. Action; 60 ft. Create magical darkness in a 15-foot-radius sphere, concentration up to 10 minutes. Nonmagical light and Darkvision cannot illuminate or see through it.' },
        { name: 'Detect Magic', description: 'At will. Action; concentration up to 10 minutes. Sense magical effects within 30 ft.; use an action to see an aura on visible affected creatures or objects and learn a spell\'s school.' },
        { name: 'Dispel Magic', description: 'At will. Action; 120 ft. End ongoing level 3 or lower spells on one creature, object or magical effect. For each level 4+ spell, make an Intelligence check (+4), DC 10 + spell level, ending it on success.' },
        { name: 'Confusion (1/day)', description: 'Action; 90 ft.; 10-foot-radius sphere. DC 16 WIS save or affected by Confusion, concentration up to 1 minute. Roll a ten-sided die for each affected creature\'s behavior at its turn start: 1 random movement; 2-6 no movement/action; 7-8 melee attack a random creature in reach; 9-10 normal turn. No reactions. Repeat the save at each turn end. The DM applies the behavior and condition.' },
        { name: 'Fly (1/day)', description: 'Action; touch a willing creature. Give it fly speed 60 ft. and hover, concentration up to 10 minutes. It falls when the spell ends unless it can remain aloft.' },
        { name: 'Power Word Stun (1/day)', description: 'Action; one visible creature within 60 ft. If it has 150 HP or fewer, it is stunned; otherwise its speed is 0 until the start of the caster\'s next turn. A stunned target repeats a DC 16 CON save at the end of each turn to end the effect. The DM applies and tracks the condition.' },
      ],
      abilities: [ ...demonTraits,
        { name: 'Pincer grapple', description: 'A Pincer hit grapples a Medium or smaller creature (escape DC 15), using one of the two pincers. The DM tracks which pincer is occupied.' },
        { name: 'Saving throws', description: 'Strength +9, Constitution +9, Wisdom +7, Charisma +7.' },
        { name: 'Skills, senses and languages', description: 'Deception +7, Perception +7; Truesight 120 ft.; passive Perception 17. Abyssal; telepathy 120 ft.' },
      ],
      modelType: 'glabrezu', visualTags: ['fiend', 'demon', 'spellcaster'], source: 'srd', icon: '/miniatures/monsters/glabrezu.png',
    },
  ];
  return entries.map(creature => ({ ...creature, modelColor: 'natural',
    abilities: creature.source === 'library' ? creature.abilities : [...creature.abilities,
      { name: 'Rules reference', description: 'SRD 5.2.1 (2024 rules). Weapon damage includes listed extra damage. Special conditions, saving-throw proficiencies, Magic Resistance, concentration, recharge and daily uses remain DM-managed.' },
    ],
  }));
}
