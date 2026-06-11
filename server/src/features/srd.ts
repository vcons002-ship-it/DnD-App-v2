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
    level: 1,
    school: 'Divination',
    classes: ['ranger'],
    tags: ['ranger', 'spell', 'feature', 'stance', 'damage', 'concentration'],
    meta: '1 bonus action · L1 spell slot · Concentration · +1d6 vs the marked target',
    description:
      'Mark a creature; your weapon attacks against the marked target deal an extra 1d6 damage. Pick the target, then toggle on — this spends a 1st-level spell slot and starts concentration. Move the mark to a new target by re-selecting it.',
    stance: {
      active: false,
      appliesTo: 'all',
      bonusDamage: '1d6',
      targeted: true,
      marksTargetWith: 'Marked',
    },
  },
  {
    name: 'Ensnaring Strike',
    type: 'stance',
    level: 1,
    school: 'Conjuration',
    classes: ['ranger'],
    tags: ['ranger', 'spell', 'feature', 'stance', 'concentration', 'control', 'restrained'],
    meta: '1 bonus action · L1 slot · Concentration · next hit',
    description:
      'Toggle on (spends a 1st-level slot, starts concentration). On your next weapon hit, the target makes a Strength save or is Restrained by thorns (taking 1d6 piercing at the start of each of its turns — apply manually). The strike then expends.',
    stance: { active: false, appliesTo: 'all', onHitSave: { ability: 'STR', onFail: 'Restrained' } },
  },

  // ── Barbarian: rage variants & berserker ──
  {
    name: 'Frenzy',
    type: 'ability',
    school: 'Path of the Berserker',
    classes: ['barbarian'],
    tags: ['barbarian', 'feature', 'rage', 'variant', 'berserker', 'damage'],
    meta: 'While raging · bonus-action attack each turn',
    description:
      'While in a frenzy during your rage, you can make a single melee weapon attack as a bonus action on each of your turns. When the rage ends you suffer a level of exhaustion.',
  },
  {
    name: 'Mindless Rage',
    type: 'ability',
    school: 'Path of the Berserker',
    classes: ['barbarian'],
    tags: ['barbarian', 'feature', 'rage', 'variant', 'berserker'],
    meta: 'While raging · immune to charm & fear',
    description:
      'You cannot be charmed or frightened while raging. If you were charmed or frightened when you enter your rage, that effect is suspended for its duration.',
  },
  {
    name: 'Intimidating Presence',
    type: 'ability',
    school: 'Path of the Berserker',
    classes: ['barbarian'],
    tags: ['barbarian', 'feature', 'variant', 'berserker', 'control', 'fear'],
    meta: 'Action · one creature saves or is frightened',
    description:
      'As an action, frighten one creature within 30 feet unless it succeeds on a Wisdom save against your DC. You can extend the effect each turn; the fear ends if you stop or the target leaves your sight.',
  },
  {
    name: 'Retaliation',
    type: 'ability',
    school: 'Path of the Berserker',
    classes: ['barbarian'],
    tags: ['barbarian', 'feature', 'variant', 'berserker', 'reaction', 'damage'],
    meta: 'Reaction · strike back when hurt',
    description:
      'When you take damage from a creature within 5 feet, you can use your reaction to make a melee weapon attack against that creature.',
  },
  {
    name: 'Bear Rage',
    type: 'ability',
    school: 'Path of the Totem Warrior',
    classes: ['barbarian'],
    tags: ['barbarian', 'feature', 'rage', 'variant', 'totem', 'resistance'],
    meta: 'While raging · resist all but psychic',
    description:
      'While raging with the Bear totem, you resist every type of damage except psychic, letting you stand at the front of a fight and soak hits for your allies.',
  },
  {
    name: 'Eagle Rage',
    type: 'ability',
    school: 'Path of the Totem Warrior',
    classes: ['barbarian'],
    tags: ['barbarian', 'feature', 'rage', 'variant', 'totem', 'mobility', 'bonus action'],
    meta: 'While raging · Dash/Disengage as bonus action',
    description:
      'While raging with the Eagle totem, foes get disadvantage on opportunity attacks against you, and you can Dash as a bonus action, darting around the battlefield.',
  },
  {
    name: 'Wolf Rage',
    type: 'ability',
    school: 'Path of the Totem Warrior',
    classes: ['barbarian'],
    tags: ['barbarian', 'feature', 'rage', 'variant', 'totem', 'support', 'advantage'],
    meta: 'While raging · allies get advantage vs your foes',
    description:
      'While raging with the Wolf totem, your allies have advantage on melee attacks against any enemy within 5 feet of you, turning you into a pack-tactics anchor.',
  },

  // ── Fighter: champion + battle master pointer ──
  {
    name: 'Improved Critical',
    type: 'ability',
    school: 'Champion',
    classes: ['fighter'],
    tags: ['fighter', 'feature', 'variant', 'champion', 'critical', 'damage'],
    meta: 'Passive · crit on a 19–20',
    description:
      'Your weapon attacks score a critical hit on a roll of 19 or 20. (Resolve the wider crit range manually — the engine still crits only on a natural 20.)',
  },
  {
    name: 'Remarkable Athlete',
    type: 'ability',
    school: 'Champion',
    classes: ['fighter'],
    tags: ['fighter', 'feature', 'variant', 'champion', 'skill', 'passive'],
    meta: 'Passive · half proficiency on STR/DEX/CON checks',
    description:
      'Add half your proficiency bonus (rounded up) to any Strength, Dexterity, or Constitution check you are not already proficient in, and your running long jump distance increases.',
  },
  {
    name: 'Survivor',
    type: 'ability',
    school: 'Champion',
    classes: ['fighter'],
    tags: ['fighter', 'feature', 'variant', 'champion', 'healing', 'passive'],
    meta: 'Passive · regain HP each turn when bloodied',
    description:
      'At the start of each of your turns you regain hit points equal to 5 plus your Constitution modifier if you have no more than half your hit points left and at least 1 HP.',
  },
  {
    name: 'Maneuver (Battle Master)',
    type: 'ability',
    school: 'Battle Master',
    classes: ['fighter'],
    tags: ['fighter', 'feature', 'variant', 'battle master', 'maneuver'],
    meta: 'Spend a Superiority Die · add a maneuver',
    description:
      'Spend a Superiority Die to fuel a combat maneuver (Trip Attack, Riposte, Disarming Attack, and more). Add the specific maneuvers to your sheet separately; track the dice via the Superiority Dice resource.',
  },

  // ── Rogue ──
  {
    name: 'Cunning Action',
    type: 'ability',
    school: 'Rogue feature',
    classes: ['rogue'],
    tags: ['rogue', 'feature', 'bonus action', 'mobility'],
    meta: 'Bonus action · Dash, Disengage, or Hide',
    description:
      'On each of your turns you can take a bonus action to Dash, Disengage, or Hide, letting you reposition and vanish faster than other characters.',
  },
  {
    name: 'Uncanny Dodge',
    type: 'ability',
    school: 'Rogue feature',
    classes: ['rogue'],
    tags: ['rogue', 'feature', 'reaction', 'defense'],
    meta: 'Reaction · halve one attack’s damage',
    description:
      'When an attacker you can see hits you, you can use your reaction to halve the damage from that attack.',
  },
  {
    name: 'Evasion',
    type: 'ability',
    school: 'Rogue feature',
    classes: ['rogue'],
    tags: ['rogue', 'feature', 'defense', 'save'],
    meta: 'Passive · take no/half damage on a DEX save',
    description:
      'When you make a Dexterity save against an effect that deals half damage on a success, you instead take no damage on a success and only half on a failure.',
  },
  {
    name: 'Assassinate',
    type: 'ability',
    school: 'Assassin',
    classes: ['rogue'],
    tags: ['rogue', 'feature', 'variant', 'assassin', 'damage'],
    meta: 'Surprise · advantage & auto-crit',
    description:
      'You have advantage against any creature that has not yet acted in combat, and any hit you land against a surprised creature is automatically a critical hit.',
  },
  {
    name: 'Fast Hands',
    type: 'ability',
    school: 'Arcane Trickster / Thief',
    classes: ['rogue'],
    tags: ['rogue', 'feature', 'variant', 'thief', 'bonus action', 'utility'],
    meta: 'Bonus action · Sleight of Hand, use object, disarm',
    description:
      'Use your Cunning Action bonus action to make a Sleight of Hand check, use thieves’ tools to disarm a trap or open a lock, or take the Use an Object action.',
  },
  {
    name: 'Supreme Sneak',
    type: 'ability',
    school: 'Arcane Trickster / Thief',
    classes: ['rogue'],
    tags: ['rogue', 'feature', 'variant', 'thief', 'stealth'],
    meta: 'Passive · advantage on Stealth at half speed',
    description:
      'You have advantage on a Dexterity (Stealth) check on any turn in which you move no more than half your speed, making you nearly impossible to detect.',
  },

  // ── Paladin: Devotion CD + auras ──
  {
    name: 'Channel Divinity: Sacred Weapon',
    type: 'ability',
    school: 'Oath of Devotion',
    classes: ['paladin'],
    tags: ['paladin', 'feature', 'channel divinity', 'variant', 'devotion', 'damage'],
    meta: 'Action · weapon glows, +CHA to attacks',
    description:
      'For 1 minute, add your Charisma modifier to attack rolls with one weapon you imbue with positive energy, and the weapon sheds bright light and counts as magical. Spend a Channel Divinity use.',
    useCounter: { name: 'Channel Divinity', max: 1 },
  },
  {
    name: 'Channel Divinity: Turn the Unholy',
    type: 'ability',
    school: 'Oath of Devotion',
    classes: ['paladin'],
    tags: ['paladin', 'feature', 'channel divinity', 'variant', 'devotion', 'control'],
    meta: 'Action · fiends/undead save or flee',
    description:
      'Each fiend or undead within 30 feet that can see or hear you must make a Wisdom save or be turned for 1 minute, forced to flee from you. Spend a Channel Divinity use.',
    useCounter: { name: 'Channel Divinity', max: 1 },
  },
  {
    name: 'Aura of Protection',
    type: 'ability',
    school: 'Paladin feature',
    classes: ['paladin'],
    tags: ['paladin', 'feature', 'aura', 'support', 'save'],
    meta: 'Passive · you and nearby allies add CHA to saves',
    description:
      'You and friendly creatures within 10 feet (later 30) add your Charisma modifier to every saving throw, a powerful boost that protects your whole party.',
  },
  {
    name: 'Aura of Devotion',
    type: 'ability',
    school: 'Oath of Devotion',
    classes: ['paladin'],
    tags: ['paladin', 'feature', 'variant', 'devotion', 'aura', 'support'],
    meta: 'Passive · you and allies immune to charm',
    description:
      'You and friendly creatures within your aura cannot be charmed while you are conscious, shielding your allies from domination and beguilement effects.',
  },
  {
    name: 'Cleansing Touch',
    type: 'ability',
    school: 'Paladin feature',
    classes: ['paladin'],
    tags: ['paladin', 'feature', 'support', 'utility'],
    meta: 'Action · end a spell on a target',
    description:
      'As an action, end one spell on yourself or a willing creature you touch. You can do this a number of times equal to your Charisma modifier, regaining uses on a long rest.',
    useCounter: { name: 'Cleansing Touch', max: 3 },
  },

  // ── Cleric: Life domain CD + strikes ──
  {
    name: 'Channel Divinity: Turn Undead',
    type: 'ability',
    school: 'Cleric feature',
    classes: ['cleric'],
    tags: ['cleric', 'feature', 'channel divinity', 'control', 'undead'],
    meta: 'Action · undead save or flee',
    description:
      'Present your holy symbol; each undead within 30 feet that can see or hear you must make a Wisdom save or be turned for 1 minute, unable to approach and forced to flee. Spend a Channel Divinity use.',
    useCounter: { name: 'Channel Divinity', max: 1 },
  },
  {
    name: 'Channel Divinity: Preserve Life',
    type: 'ability',
    school: 'Life Domain',
    classes: ['cleric'],
    tags: ['cleric', 'feature', 'channel divinity', 'variant', 'life domain', 'healing'],
    meta: 'Action · heal a pool of 5 × cleric level',
    description:
      'Restore hit points equal to five times your cleric level, divided among creatures within 30 feet. A creature cannot be healed past half its hit point maximum this way. Spend a Channel Divinity use.',
    useCounter: { name: 'Channel Divinity', max: 1 },
  },
  {
    name: 'Divine Strike',
    type: 'stance',
    school: 'Cleric feature',
    classes: ['cleric'],
    tags: ['cleric', 'feature', 'variant', 'damage', 'stance'],
    meta: 'Once per turn · +1d8 (later 2d8) on a weapon hit',
    description:
      'Once on each of your turns when you hit with a weapon attack, the attack deals extra damage of your domain’s type. Toggle on; the bonus rises to 2d8 at higher levels.',
    stance: { active: false, appliesTo: 'all', bonusDamage: '1d8' },
  },
  {
    name: 'Blessed Healer',
    type: 'ability',
    school: 'Life Domain',
    classes: ['cleric'],
    tags: ['cleric', 'feature', 'variant', 'life domain', 'healing'],
    meta: 'Passive · self-heal when you heal others',
    description:
      'When you cast a 1st-level-or-higher spell that restores hit points to another creature, you regain 2 hit points plus the spell’s level.',
  },

  // ── Druid ──
  {
    name: 'Combat Wild Shape',
    type: 'ability',
    school: 'Circle of the Moon',
    classes: ['druid'],
    tags: ['druid', 'feature', 'variant', 'moon', 'transform'],
    meta: 'Bonus action · Wild Shape & spend slots to heal',
    description:
      'You can use Wild Shape as a bonus action, and while transformed you can expend spell slots as a bonus action to regain 1d8 hit points per slot level.',
  },
  {
    name: 'Natural Recovery',
    type: 'ability',
    school: 'Circle of the Land',
    classes: ['druid'],
    tags: ['druid', 'feature', 'variant', 'land', 'utility'],
    meta: '1/day · recover spell slots on a short rest',
    description:
      'During a short rest you can recover expended spell slots with a combined level up to half your druid level (rounded up), none of which can be 6th level or higher. Usable once per day.',
    useCounter: { name: 'Natural Recovery', max: 1 },
  },
  {
    name: "Land's Stride",
    type: 'ability',
    school: 'Circle of the Land',
    classes: ['druid'],
    tags: ['druid', 'feature', 'variant', 'land', 'mobility', 'passive'],
    meta: 'Passive · ignore difficult plant terrain',
    description:
      'Moving through nonmagical difficult terrain costs you no extra movement, and you can pass through plants without being slowed or harmed. You also have advantage on saves against magically created plant hazards.',
  },

  // ── Ranger ──
  {
    name: 'Favored Enemy',
    type: 'ability',
    school: 'Ranger feature',
    classes: ['ranger'],
    tags: ['ranger', 'feature', 'utility', 'passive'],
    meta: 'Passive · track & recall a chosen foe type',
    description:
      'You have advantage on Survival checks to track your chosen enemy types and on Intelligence checks to recall information about them, and you learn one related language.',
  },
  {
    name: 'Natural Explorer',
    type: 'ability',
    school: 'Ranger feature',
    classes: ['ranger'],
    tags: ['ranger', 'feature', 'utility', 'exploration', 'passive'],
    meta: 'Passive · master a favored terrain',
    description:
      'In your favored terrain you move stealthily at normal pace, are never lost by nonmagical means, stay alert to danger, and gain bonuses on intelligence and wisdom checks tied to the land.',
  },
  {
    name: 'Colossus Slayer',
    type: 'stance',
    school: 'Hunter',
    classes: ['ranger'],
    tags: ['ranger', 'feature', 'variant', 'hunter', 'damage', 'stance'],
    meta: 'Once per turn · +1d8 vs a wounded target',
    description:
      'Once on each turn, when you hit a creature that is below its hit point maximum with a weapon attack, you deal an extra 1d8 damage. Toggle on while you are hitting wounded foes.',
    stance: { active: false, appliesTo: 'all', bonusDamage: '1d8' },
  },
  {
    name: 'Horde Breaker',
    type: 'ability',
    school: 'Hunter',
    classes: ['ranger'],
    tags: ['ranger', 'feature', 'variant', 'hunter', 'damage'],
    meta: 'Once per turn · attack a second nearby foe',
    description:
      'Once on each of your turns when you make a weapon attack, you can make another attack with the same weapon against a different creature within 5 feet of the original target.',
  },
  {
    name: 'Giant Killer',
    type: 'ability',
    school: 'Hunter',
    classes: ['ranger'],
    tags: ['ranger', 'feature', 'variant', 'hunter', 'reaction', 'damage'],
    meta: 'Reaction · strike a Large+ attacker',
    description:
      'When a Large or larger creature within 5 feet hits or misses you, you can use your reaction to attack it after its attack resolves.',
  },
  {
    name: 'Primeval Awareness',
    type: 'ability',
    school: 'Ranger feature',
    classes: ['ranger'],
    tags: ['ranger', 'feature', 'utility', 'detection'],
    meta: 'Spend a slot · sense creature types nearby',
    description:
      'Expend a spell slot to sense whether aberrations, celestials, dragons, elementals, fey, fiends, or undead are present within 1 mile (6 miles in your favored terrain) for 1 minute per slot level.',
  },

  // ── Monk ──
  {
    name: 'Martial Arts',
    type: 'ability',
    school: 'Monk feature',
    classes: ['monk'],
    tags: ['monk', 'feature', 'unarmed', 'bonus action'],
    meta: 'Passive · DEX unarmed strikes + bonus strike',
    description:
      'Use Dexterity for your unarmed strikes and monk weapons, roll a scaling martial-arts die for their damage, and make one unarmed strike as a bonus action after you Attack.',
  },
  {
    name: 'Flurry of Blows',
    type: 'ability',
    school: 'Monk feature',
    classes: ['monk'],
    tags: ['monk', 'feature', 'ki', 'bonus action', 'damage'],
    meta: '1 Ki · two bonus-action unarmed strikes',
    description:
      'Immediately after you take the Attack action, spend 1 Ki point to make two unarmed strikes as a bonus action. (Track the cost against your Ki pool.)',
  },
  {
    name: 'Patient Defense',
    type: 'ability',
    school: 'Monk feature',
    classes: ['monk'],
    tags: ['monk', 'feature', 'ki', 'bonus action', 'defense'],
    meta: '1 Ki · Dodge as a bonus action',
    description:
      'Spend 1 Ki point to take the Dodge action as a bonus action, imposing disadvantage on attacks against you until your next turn. (Track the cost against your Ki pool.)',
  },
  {
    name: 'Step of the Wind',
    type: 'ability',
    school: 'Monk feature',
    classes: ['monk'],
    tags: ['monk', 'feature', 'ki', 'bonus action', 'mobility'],
    meta: '1 Ki · Dash/Disengage as a bonus action',
    description:
      'Spend 1 Ki point to Disengage or Dash as a bonus action, and your jump distance doubles for the turn. (Track the cost against your Ki pool.)',
  },
  {
    name: 'Stunning Strike',
    type: 'ability',
    school: 'Monk feature',
    classes: ['monk'],
    tags: ['monk', 'feature', 'ki', 'control', 'save'],
    meta: '1 Ki · target saves or is stunned',
    description:
      'When you hit a creature with a melee attack, spend 1 Ki point to force a Constitution save; on a failure the target is stunned until the end of your next turn. (Track the cost against your Ki pool.)',
  },
  {
    name: 'Deflect Missiles',
    type: 'ability',
    school: 'Monk feature',
    classes: ['monk'],
    tags: ['monk', 'feature', 'reaction', 'defense'],
    meta: 'Reaction · reduce ranged damage, maybe catch',
    description:
      'When hit by a ranged weapon attack, use your reaction to reduce the damage by 1d10 plus your Dexterity modifier and monk level. If you reduce it to 0 you can catch and hurl the missile back, spending 1 Ki.',
  },
  {
    name: 'Open Hand Technique',
    type: 'ability',
    school: 'Way of the Open Hand',
    classes: ['monk'],
    tags: ['monk', 'feature', 'variant', 'open hand', 'control', 'ki'],
    meta: 'On Flurry hit · knock prone, push, or deny reactions',
    description:
      'When you hit with a Flurry of Blows attack you can impose one effect: the target must save or be knocked prone, be pushed 15 feet, or lose reactions until the end of your next turn.',
  },

  // ── Sorcerer: Metamagic + Font of Magic ──
  {
    name: 'Font of Magic',
    type: 'ability',
    school: 'Sorcerer feature',
    classes: ['sorcerer'],
    tags: ['sorcerer', 'feature', 'sorcery points', 'metamagic'],
    meta: 'Convert sorcery points ↔ spell slots',
    description:
      'You have a pool of sorcery points you can spend to fuel Metamagic, or convert into spell slots (and slots back into points) as a bonus action. Track the pool here.',
    useCounter: { name: 'Sorcery Points', max: 2 },
  },
  {
    name: 'Metamagic: Quickened Spell',
    type: 'ability',
    school: 'Sorcerer feature',
    classes: ['sorcerer'],
    tags: ['sorcerer', 'feature', 'metamagic', 'variant', 'bonus action'],
    meta: '2 sorcery points · cast a 1-action spell as a bonus action',
    description:
      'Spend 2 sorcery points to change the casting time of a spell from 1 action to 1 bonus action for this casting.',
  },
  {
    name: 'Metamagic: Twinned Spell',
    type: 'ability',
    school: 'Sorcerer feature',
    classes: ['sorcerer'],
    tags: ['sorcerer', 'feature', 'metamagic', 'variant', 'support'],
    meta: 'Sorcery points = slot level · hit a second target',
    description:
      'When you cast a single-target spell, spend sorcery points equal to the spell’s level (minimum 1) to target a second creature in range with the same spell.',
  },
  {
    name: 'Metamagic: Empowered Spell',
    type: 'ability',
    school: 'Sorcerer feature',
    classes: ['sorcerer'],
    tags: ['sorcerer', 'feature', 'metamagic', 'variant', 'damage'],
    meta: '1 sorcery point · reroll damage dice',
    description:
      'Spend 1 sorcery point to reroll a number of a spell’s damage dice up to your Charisma modifier, using the new rolls.',
  },
  {
    name: 'Metamagic: Heightened Spell',
    type: 'ability',
    school: 'Sorcerer feature',
    classes: ['sorcerer'],
    tags: ['sorcerer', 'feature', 'metamagic', 'variant', 'control'],
    meta: '3 sorcery points · one target has disadvantage on its save',
    description:
      'When you cast a spell that forces a saving throw, spend 3 sorcery points to give one target disadvantage on its first save against the spell.',
  },
  {
    name: 'Metamagic: Subtle Spell',
    type: 'ability',
    school: 'Sorcerer feature',
    classes: ['sorcerer'],
    tags: ['sorcerer', 'feature', 'metamagic', 'variant', 'utility'],
    meta: '1 sorcery point · cast without somatic/verbal',
    description:
      'Spend 1 sorcery point to cast a spell without any somatic or verbal components, letting you cast while restrained, silenced, or unnoticed.',
  },
  {
    name: 'Metamagic: Distant Spell',
    type: 'ability',
    school: 'Sorcerer feature',
    classes: ['sorcerer'],
    tags: ['sorcerer', 'feature', 'metamagic', 'variant', 'utility'],
    meta: '1 sorcery point · double range (or 30 ft on touch)',
    description:
      'Spend 1 sorcery point to double the range of a spell, or to give a touch spell a range of 30 feet.',
  },
  {
    name: 'Metamagic: Careful Spell',
    type: 'ability',
    school: 'Sorcerer feature',
    classes: ['sorcerer'],
    tags: ['sorcerer', 'feature', 'metamagic', 'variant', 'support'],
    meta: '1 sorcery point · allies auto-succeed on the save',
    description:
      'When you cast a spell that forces a save, spend 1 sorcery point to let a number of chosen creatures up to your Charisma modifier automatically succeed on their save against it.',
  },
  {
    name: 'Metamagic: Extended Spell',
    type: 'ability',
    school: 'Sorcerer feature',
    classes: ['sorcerer'],
    tags: ['sorcerer', 'feature', 'metamagic', 'variant', 'utility'],
    meta: '1 sorcery point · double a spell’s duration',
    description:
      'Spend 1 sorcery point to double the duration of a spell, up to a maximum of 24 hours.',
  },

  // ── Warlock: Invocations + Pacts ──
  {
    name: 'Eldritch Invocation: Agonizing Blast',
    type: 'ability',
    school: 'Warlock feature',
    classes: ['warlock'],
    tags: ['warlock', 'feature', 'invocation', 'variant', 'damage'],
    meta: 'Passive · add CHA to Eldritch Blast damage',
    description:
      'When you cast Eldritch Blast, add your Charisma modifier to the damage of each of its beams, making your signature cantrip hit far harder.',
  },
  {
    name: "Eldritch Invocation: Devil's Sight",
    type: 'ability',
    school: 'Warlock feature',
    classes: ['warlock'],
    tags: ['warlock', 'feature', 'invocation', 'variant', 'utility', 'vision'],
    meta: 'Passive · see in normal & magical darkness',
    description:
      'You can see normally in darkness, both magical and nonmagical, out to 120 feet, letting you fight unhindered in the dark.',
  },
  {
    name: 'Eldritch Invocation: Repelling Blast',
    type: 'ability',
    school: 'Warlock feature',
    classes: ['warlock'],
    tags: ['warlock', 'feature', 'invocation', 'variant', 'control'],
    meta: 'Passive · Eldritch Blast pushes 10 ft',
    description:
      'When you hit a creature with Eldritch Blast, you can push it up to 10 feet away from you in a straight line, controlling the battlefield while you blast.',
  },
  {
    name: 'Eldritch Invocation: Mask of Many Faces',
    type: 'ability',
    school: 'Warlock feature',
    classes: ['warlock'],
    tags: ['warlock', 'feature', 'invocation', 'variant', 'utility', 'social'],
    meta: 'Passive · cast Disguise Self at will',
    description:
      'You can cast Disguise Self at will, without expending a spell slot, to change your appearance whenever you like.',
  },
  {
    name: 'Pact of the Blade',
    type: 'ability',
    school: 'Warlock feature',
    classes: ['warlock'],
    tags: ['warlock', 'feature', 'variant', 'pact', 'weapon'],
    meta: 'Action · summon a magic pact weapon',
    description:
      'As an action you can conjure a melee weapon bonded to you, using Charisma for its attacks and damage. You can dismiss and re-summon it at will and transform a magic weapon into your pact weapon.',
  },
  {
    name: 'Pact of the Tome',
    type: 'ability',
    school: 'Warlock feature',
    classes: ['warlock'],
    tags: ['warlock', 'feature', 'variant', 'pact', 'utility'],
    meta: 'Passive · Book of Shadows grants extra cantrips',
    description:
      'Your patron grants you a Book of Shadows holding three cantrips of your choice from any class’s spell list, which you can cast as warlock cantrips.',
  },
  {
    name: 'Pact of the Chain',
    type: 'ability',
    school: 'Warlock feature',
    classes: ['warlock'],
    tags: ['warlock', 'feature', 'variant', 'pact', 'familiar'],
    meta: 'Passive · Find Familiar with special forms',
    description:
      'You learn Find Familiar and can summon a more powerful familiar (imp, pseudodragon, quasit, or sprite). You can forgo one of your attacks to let your familiar use its reaction to attack.',
  },

  // ── Wizard ──
  {
    name: 'Arcane Recovery',
    type: 'ability',
    school: 'Wizard feature',
    classes: ['wizard'],
    tags: ['wizard', 'feature', 'utility', 'recovery'],
    meta: '1/day · recover slots on a short rest',
    description:
      'Once per day during a short rest, recover expended spell slots with a combined level up to half your wizard level (rounded up), none of which can be 6th level or higher.',
    useCounter: { name: 'Arcane Recovery', max: 1 },
  },
  {
    name: 'Sculpt Spells',
    type: 'ability',
    school: 'School of Evocation',
    classes: ['wizard'],
    tags: ['wizard', 'feature', 'variant', 'evocation', 'support'],
    meta: 'Passive · allies auto-dodge your evocations',
    description:
      'When you cast an evocation spell that affects others, you can protect a number of creatures equal to 1 plus the spell’s level; they automatically succeed on their save and take no damage from it.',
  },
  {
    name: 'Potent Cantrip',
    type: 'ability',
    school: 'School of Evocation',
    classes: ['wizard'],
    tags: ['wizard', 'feature', 'variant', 'evocation', 'damage'],
    meta: 'Passive · cantrips still deal half on a save',
    description:
      'Your damaging cantrips affect even creatures that succeed on their saving throw: a target that saves still takes half the cantrip’s damage (but suffers no other effect).',
  },
  {
    name: 'Empowered Evocation',
    type: 'stance',
    school: 'School of Evocation',
    classes: ['wizard'],
    tags: ['wizard', 'feature', 'variant', 'evocation', 'damage', 'stance'],
    meta: 'Passive · add INT to one evocation’s damage',
    description:
      'Add your Intelligence modifier to one damage roll of any wizard evocation spell you cast. Toggle on to fold the bonus into the spell’s damage.',
    stance: { active: false, appliesTo: 'all', bonusDamage: '3' },
  },

  // ── Bard ──
  {
    name: 'Cutting Words',
    type: 'ability',
    school: 'College of Lore',
    classes: ['bard'],
    tags: ['bard', 'feature', 'variant', 'lore', 'reaction', 'control'],
    meta: 'Reaction · spend Inspiration to subtract from a foe’s roll',
    description:
      'When a creature you can see within 60 feet makes an attack, ability check, or damage roll, use your reaction and a Bardic Inspiration die to subtract that roll from its result.',
  },
  {
    name: 'Song of Rest',
    type: 'ability',
    school: 'Bard feature',
    classes: ['bard'],
    tags: ['bard', 'feature', 'support', 'healing'],
    meta: 'Short rest · allies regain extra HP',
    description:
      'If you and your allies regain hit points at the end of a short rest by spending Hit Dice, each ally who can hear your performance regains an additional 1d6 (scaling with level).',
  },
  {
    name: 'Jack of All Trades',
    type: 'ability',
    school: 'Bard feature',
    classes: ['bard'],
    tags: ['bard', 'feature', 'skill', 'passive'],
    meta: 'Passive · half proficiency on other checks',
    description:
      'Add half your proficiency bonus (rounded down) to any ability check you make that does not already include your proficiency bonus.',
  },
  {
    name: 'Countercharm',
    type: 'ability',
    school: 'Bard feature',
    classes: ['bard'],
    tags: ['bard', 'feature', 'support', 'control'],
    meta: 'Action · grant advantage vs fear & charm',
    description:
      'As an action you start a performance until the end of your next turn; any friendly creature within 30 feet that can hear you has advantage on saves against being frightened or charmed.',
  },
  {
    name: 'Peerless Skill',
    type: 'ability',
    school: 'College of Lore',
    classes: ['bard'],
    tags: ['bard', 'feature', 'variant', 'lore', 'skill'],
    meta: 'Spend Inspiration · add the die to your own check',
    description:
      'When you make an ability check, you can expend one Bardic Inspiration die and add it to your roll, potentially turning a failure into a success.',
  },

  // ---- Feats (any class). Spell-granting feat NAMES are recognized by
  // shared/spellLists.ts and add to the sheet's spell-list allowances — keep
  // the "(Class)" suffix on Magic Initiate variants.
  {
    name: 'Magic Initiate (Wizard)',
    type: 'ability',
    school: 'Feat',
    tags: ['feat', 'magic initiate', 'wizard', 'spellcasting'],
    meta: 'Feat · 2 wizard cantrips + 1 level-1 spell',
    description:
      'You learn two cantrips and one level-1 spell from the wizard spell list. You can cast the level-1 spell once per long rest without a slot (Intelligence is your casting ability for them), and with any slots you have.',
  },
  {
    name: 'Magic Initiate (Cleric)',
    type: 'ability',
    school: 'Feat',
    tags: ['feat', 'magic initiate', 'cleric', 'spellcasting'],
    meta: 'Feat · 2 cleric cantrips + 1 level-1 spell',
    description:
      'You learn two cantrips and one level-1 spell from the cleric spell list. You can cast the level-1 spell once per long rest without a slot (Wisdom is your casting ability for them), and with any slots you have.',
  },
  {
    name: 'Magic Initiate (Druid)',
    type: 'ability',
    school: 'Feat',
    tags: ['feat', 'magic initiate', 'druid', 'spellcasting'],
    meta: 'Feat · 2 druid cantrips + 1 level-1 spell',
    description:
      'You learn two cantrips and one level-1 spell from the druid spell list. You can cast the level-1 spell once per long rest without a slot (Wisdom is your casting ability for them), and with any slots you have.',
  },
  {
    name: 'Fey Touched',
    type: 'ability',
    school: 'Feat',
    tags: ['feat', 'fey', 'spellcasting', 'teleport'],
    meta: 'Feat · +1 INT/WIS/CHA · Misty Step + 1 spell',
    description:
      'Increase Intelligence, Wisdom, or Charisma by 1. You learn Misty Step and one level-1 divination or enchantment spell; cast each once per long rest without a slot, and with any slots you have.',
  },
  {
    name: 'Shadow Touched',
    type: 'ability',
    school: 'Feat',
    tags: ['feat', 'shadow', 'spellcasting', 'stealth'],
    meta: 'Feat · +1 INT/WIS/CHA · Invisibility + 1 spell',
    description:
      'Increase Intelligence, Wisdom, or Charisma by 1. You learn Invisibility and one level-1 illusion or necromancy spell; cast each once per long rest without a slot, and with any slots you have.',
  },
  {
    name: 'Lucky',
    type: 'ability',
    school: 'Feat',
    tags: ['feat', 'luck', 'reroll'],
    meta: 'Feat · luck points = proficiency bonus',
    description:
      'You have luck points equal to your proficiency bonus, regained on a long rest. Spend one to give yourself advantage on a d20 test, or to impose disadvantage on an attack roll against you.',
    useCounter: { name: 'Luck Points', max: 2 },
  },
  {
    name: 'Tough',
    type: 'ability',
    school: 'Feat',
    tags: ['feat', 'hp', 'defense'],
    meta: 'Feat · +2 HP per level',
    description:
      'Your hit point maximum increases by twice your character level, and by 2 more each time you gain a level. (Adjust Max HP on the sheet.)',
  },
  {
    name: 'Alert',
    type: 'ability',
    school: 'Feat',
    tags: ['feat', 'initiative'],
    meta: 'Feat · add proficiency to initiative',
    description:
      'Add your proficiency bonus to initiative rolls. When you roll initiative you can swap your result with one willing ally (neither of you can be incapacitated).',
  },
];

const haystack = (f: FeatureEntry): string =>
  [f.name, f.school, ...(f.classes ?? []), ...(f.tags ?? [])]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

/** Search class features by name OR tag/class (name-prefix first). A generous
 *  limit so a family search (e.g. "rage", "metamagic") returns all its variants. */
export function searchFeatures(query: string, limit = 25): FeatureEntry[] {
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
