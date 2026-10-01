import type { AbilityKey } from '../../shared/skills.js';
import { SKILLS } from '../../shared/skills.js';
import type { ClassProgression } from '../../shared/characterProgression.js';
import type { Character, SheetAbility } from '../../shared/types.js';
import type { LevelUpFeat, LevelUpFeatureChoice } from '../../shared/levelingTypes.js';
import { getFeature } from './features/srd.js';
import { getAllSpells, getSpell } from './spells/srd.js';
import { getManeuver } from './maneuvers/srd.js';

const ABILITIES: AbilityKey[] = ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'];
type Feat = LevelUpFeat & { minimum?: Partial<Record<AbilityKey, number>>; spellcasting?: boolean };
/** Deliberately reviewed 2024 options; the older sheet picker also contains 2014 feats. */
export const LEVELING_FEATS: Feat[] = [
  { name: 'Tough', category: 'Origin', description: 'Your maximum HP increases by twice your level, then by 2 at every later level.' },
  { name: 'Alert', category: 'Origin', description: 'Add your proficiency bonus to initiative. After rolling initiative, you may swap initiative with a willing ally. Resolve those initiative benefits with the DM.' },
  { name: 'Savage Attacker', category: 'Origin', description: 'Once per turn when you hit with a weapon, roll its damage dice twice and use either result.' },
  { name: 'Skilled', category: 'Origin', description: 'Gain proficiency in three skills or tools of your choice. The guide offers skills; tools can be recorded on your sheet.' },
  { name: 'Resilient', category: 'General', abilityChoices: ABILITIES, abilityIncrease: 1, description: 'Increase an ability score by 1, maximum 20, and gain proficiency in that saving throw.' },
  { name: 'Great Weapon Master', category: 'General', abilityChoices: ['STR'], abilityIncrease: 1, minimum: { STR: 13 }, prerequisite: 'Strength 13+', description: 'Increase Strength by 1. On your turn, Heavy weapon hits made as part of the Attack action add your proficiency bonus to damage. A melee critical hit or kill can grant a bonus-action attack. Adjudicate those attack benefits with the DM.' },
  { name: 'War Caster', category: 'General', abilityChoices: ['INT', 'WIS', 'CHA'], abilityIncrease: 1, spellcasting: true, prerequisite: 'Spellcasting or Pact Magic', description: 'Increase Intelligence, Wisdom, or Charisma by 1. Have advantage on Constitution saves to maintain concentration, perform somatic components with occupied hands, and use a qualifying spell for an opportunity attack.' },
  { name: 'Sentinel', category: 'General', abilityChoices: ['STR', 'DEX'], abilityIncrease: 1, prerequisite: 'Strength or Dexterity 13+', description: 'Increase Strength or Dexterity by 1. Certain adjacent enemy actions provoke your reaction attack, and an opportunity-attack hit reduces speed to 0 for that turn.' },
  { name: 'Sharpshooter', category: 'General', abilityChoices: ['DEX'], abilityIncrease: 1, minimum: { DEX: 13 }, prerequisite: 'Dexterity 13+', description: 'Increase Dexterity by 1. Ranged weapon attacks ignore half and three-quarters cover, suffer no long-range disadvantage, and are not disadvantaged solely by an adjacent enemy.' },
  { name: 'Durable', category: 'General', abilityChoices: ['CON'], abilityIncrease: 1, description: 'Increase Constitution by 1, have advantage on death saves, and spend a Hit Die as a bonus action to recover its roll in HP.' },
  { name: 'Athlete', category: 'General', abilityChoices: ['STR', 'DEX'], abilityIncrease: 1, minimum: { STR: 13 }, prerequisite: 'Strength or Dexterity 13+', description: 'Increase Strength or Dexterity by 1. Gain a climb speed, stand from Prone using 5 feet of movement, and make running jumps after moving only 5 feet.' },
  { name: 'Boon of Combat Prowess', category: 'Epic Boon', abilityChoices: ABILITIES, abilityIncrease: 1, description: 'Increase one ability score by 1, maximum 30. Once per turn when an attack misses, you may make it hit instead.' },
  { name: 'Boon of Fate', category: 'Epic Boon', abilityChoices: ABILITIES, abilityIncrease: 1, description: 'Increase one ability score by 1, maximum 30. After a creature within 60 feet makes a d20 test, use your reaction to add or subtract 2d4. Recover this use on a Short or Long Rest or when rolling initiative.' },
  { name: 'Boon of Fortitude', category: 'Epic Boon', abilityChoices: ABILITIES, abilityIncrease: 1, description: 'Increase one ability score by 1, maximum 30. Your maximum HP increases by 40. Once per turn when regaining HP, also regain HP equal to your Constitution modifier.' },
  { name: 'Boon of Recovery', category: 'Epic Boon', abilityChoices: ABILITIES, abilityIncrease: 1, description: 'Increase one ability score by 1, maximum 30. Once per Long Rest when reduced to 0 HP, remain at 1 HP and regain half your maximum HP. A separate pool of ten d10s can be spent as a bonus action to regain their rolled HP; the pool recovers on a Long Rest. Resolve these benefits with the DM.' },
  { name: 'Boon of Speed', category: 'Epic Boon', abilityChoices: ABILITIES, abilityIncrease: 1, description: 'Increase one ability score by 1, maximum 30. Your speed increases by 30 feet. As a bonus action, Disengage and end the Grappled condition on yourself.' },
];

const key = (name: string) => name.trim().toLowerCase();
export function eligibleLevelingFeats(c: Character, p: ClassProgression, scores: Record<string, number>): LevelUpFeat[] {
  const owned = new Set([...c.sheetAbilities, ...c.abilities].map(a => key(a.name)));
  for (const modifier of c.modifiers) if (LEVELING_FEATS.some(f => key(f.name) === key(modifier.source))) owned.add(key(modifier.source));
  return LEVELING_FEATS.filter(f => !owned.has(key(f.name)) &&
    (f.category !== 'Epic Boon' || c.level + 1 >= 19) &&
    (f.category !== 'General' || c.level + 1 >= 4) &&
    (!f.spellcasting || p.cantrips > 0 || p.maxSpellLevel > 0 || c.sheetAbilities.some(a => a.type === 'spell')) &&
    (['Athlete', 'Sentinel'].includes(f.name) ? Math.max(scores.STR ?? 10, scores.DEX ?? 10) >= 13 :
      Object.entries(f.minimum ?? {}).every(([ab, min]) => (scores[ab] ?? 10) >= min!)))
    .map(({ minimum: _minimum, spellcasting: _spellcasting, ...f }) => f.name === 'Resilient' ? {
      ...f, abilityChoices: f.abilityChoices?.filter(ab => !c.saveProficiencies.includes(ab)),
    } : f).filter(f => !f.abilityChoices || f.abilityChoices.length > 0);
}

const DESCRIPTIONS: Record<string, string> = {
  'Expertise': 'Choose two eligible skill proficiencies. Your proficiency bonus is doubled for checks using those skills.',
  'Jack of All Trades': 'Add half your proficiency bonus, rounded down, to an ability check that uses a skill and does not already include your proficiency bonus.',
  'Extra Attack': 'When you take the Attack action, make two attacks instead of one. Fighter improvements increase this to three at level 11 and four at level 20. The app keeps individual attacks under your control.',
  'Two Extra Attacks': 'When you take the Attack action, make three attacks instead of one. Roll each attack individually.',
  'Three Extra Attacks': 'When you take the Attack action, make four attacks instead of one. Roll each attack individually.',
  'Action Surge': 'On your turn, take one additional action, except the Magic action. Recover uses on a Short or Long Rest; only one use per turn.',
  'Reckless Attack': 'On the first attack of your turn, choose advantage for Strength attack rolls until your next turn; attacks against you also have advantage during that time.',
  'Font of Inspiration': 'Regain Bardic Inspiration on a Short or Long Rest. You can also expend a spell slot to recover one use without an action.',
  'Paladin’s Smite': 'You always have Divine Smite prepared. Cast it once without a spell slot per Long Rest, or with a spell slot; the app offers this choice after a qualifying hit.',
  "Paladin's Smite": 'You always have Divine Smite prepared. Cast it once without a spell slot per Long Rest, or with a spell slot; the app offers this choice after a qualifying hit.',
  'Combat Superiority': 'Learn three maneuvers and gain four d8 Superiority Dice. Recover the dice on a Short or Long Rest. Learn two more maneuvers at levels 7, 10, and 15; dice improve to d10 at 10 and d12 at 18.',
  'Student of War': 'Gain proficiency with one artisan’s tool and one additional Fighter skill. Record the tool on your sheet.',
  'Improved Critical': 'Your weapon attacks and Unarmed Strikes score a critical hit on a natural 19 or 20. Resolve the expanded range with the DM.',
  'Remarkable Athlete': 'You have advantage on initiative and Strength (Athletics) checks. Immediately after a critical hit, move up to half your speed without provoking opportunity attacks.',
  'Superior Critical': 'Your weapon attacks and Unarmed Strikes score a critical hit on a natural 18, 19, or 20. Resolve the expanded range with the DM.',
  'Cunning Action': 'Take Dash, Disengage, or Hide as a bonus action on your turn.',
  'Uncanny Dodge': 'When a visible attacker hits you, use your reaction to halve the damage from that attack.',
  'Evasion': 'On a Dexterity save for half damage, take no damage on a success and half on a failure. This does not apply while Incapacitated.',
  'Indomitable': 'Reroll a failed saving throw with a bonus equal to your Fighter level. Use the new roll. Uses recover on a Long Rest.',
  'Tactical Mind': 'When you fail an ability check, expend Second Wind to add 1d10 to the result. If the check still fails, the use is not expended.',
  'Tactical Shift': 'After using Second Wind as a bonus action, move up to half your speed without provoking opportunity attacks.',
  'Primal Champion': 'Increase Strength and Constitution by 4, to a maximum of 25.',
  'Body and Mind': 'Increase Dexterity and Wisdom by 4, to a maximum of 25.',
  'Metamagic': 'Choose Metamagic options and spend Sorcery Points to alter a spell. Normally only one option applies to a spell unless that option says otherwise.',
  'Eldritch Invocations': 'Choose qualifying Eldritch Invocations. Their prerequisites and individual effects determine when they can be used.',
  'Fighting Style': 'Choose a Fighting Style feat appropriate to your class. Its benefits are recorded on your sheet.',
  'Additional Fighting Style': 'Choose one additional Fighting Style feat.',
  'Bard Subclass': 'Choose a Bard college and gain its level-3 features.',
  'Fighter Subclass': 'Choose a Fighter subclass and gain its level-3 features.',
  'Rogue Subclass': 'Choose a Rogue subclass and gain its level-3 features.',
  'Spellcasting': 'Use your class’s 2024 preparation and spell-slot progression. Spell slots are tracked on your sheet; casting ability and spell-specific effects are resolved by the combat engine.',
  'Pact Magic': 'Your Pact Magic slots share one spell level and recover on a Short or Long Rest. Spent uses carry over when that slot level increases.',
  'Fast Hands': 'Use a bonus action for a Dexterity (Sleight of Hand) check, or to take the Utilize action or a qualifying Magic action using a magic item.',
  'Second-Story Work': 'Gain a climb speed equal to your speed and use Dexterity when determining jump distance.',
  'Frenzy': 'While raging and using Reckless Attack, the first Strength-based hit on your turn deals extra d6 damage equal to your Rage Damage bonus.',
  'Mindless Rage': 'While raging, you are immune to Charmed and Frightened. Existing instances of those conditions end when you enter Rage.',
  'Retaliation': 'When a creature within 5 feet damages you, use your reaction to make a melee attack against it.',
  'Bonus Proficiencies': 'Gain proficiency in three skills of your choice.',
  'Cutting Words': 'Use your reaction and expend Bardic Inspiration to subtract its roll from a visible creature’s attack roll, ability check, or damage roll within 60 feet.',
  'Disciple of Life': 'When a spell slot restores HP, restore an additional 2 plus the slot’s level on that turn.',
  'Blessed Healer': 'When a spell slot heals another creature, regain HP equal to 2 plus the slot’s level on that turn.',
  'Supreme Healing': 'When a spell or Channel Divinity heals a creature, use the maximum result for its healing dice.',
  'Open Hand Technique': 'When Flurry of Blows hits, choose a Dexterity save against Prone, a Strength save against a 15-foot push, or prevent opportunity attacks until the target’s next turn.',
  'Wholeness of Body': 'Use a bonus action to roll a Martial Arts die and regain that roll plus Wisdom modifier in HP. Uses equal Wisdom modifier, minimum 1, per Long Rest.',
  'Sacred Weapon': 'Use Channel Divinity with the Attack action to empower one weapon for 10 minutes. Its attack rolls gain your Charisma modifier, minimum +1, and you may choose radiant damage.',
  'Aura of Devotion': 'While your Aura of Protection is active, you and allies in it cannot be Charmed.',
  'Hunter’s Lore': 'While a creature is marked by Hunter’s Mark, you know its damage immunities, resistances, and vulnerabilities.',
  "Hunter's Lore": 'While a creature is marked by Hunter’s Mark, you know its damage immunities, resistances, and vulnerabilities.',
  'Hunter’s Prey': 'Choose Colossus Slayer or Horde Breaker. You may change this choice after a Short or Long Rest.',
  "Hunter's Prey": 'Choose Colossus Slayer or Horde Breaker. You may change this choice after a Short or Long Rest.',
  'Draconic Resilience': 'Your maximum HP increases by 3 now and 1 at each further Sorcerer level. While unarmored, your AC equals 10 plus Dexterity and Charisma modifiers.',
  'Elemental Affinity': 'Choose the damage type of your draconic ancestor. Gain resistance to it and add Charisma to one damage roll of a spell that deals that type.',
  'Dragon Wings': 'Manifest draconic wings as a bonus action, gaining a fly speed of 60 feet for 1 hour. Recover on a Long Rest, or spend 3 Sorcery Points to recover the use.',
  'Dark One’s Blessing': 'When you reduce an enemy to 0 HP, or an enemy within 10 feet is reduced to 0 HP, gain temporary HP equal to your Warlock level plus Charisma modifier, minimum 1.',
  "Dark One's Blessing": 'When you reduce an enemy to 0 HP, or an enemy within 10 feet is reduced to 0 HP, gain temporary HP equal to your Warlock level plus Charisma modifier, minimum 1.',
  'Dark One’s Own Luck': 'Add 1d10 to an ability check or save after seeing its roll. Use this Charisma-modifier times, minimum 1, per Long Rest, once per roll.',
  'Evocation Savant': 'Add two Evocation Wizard spells of level 1 or 2 to your spellbook. On later access to a new slot level, add one Evocation Wizard spell of any level for which you have spell slots.',
  'Potent Cantrip': 'When a creature succeeds on a save against your damaging cantrip or your cantrip attack misses, it still takes half the damage and no other effect.',
  'Sculpt Spells': 'When an Evocation spell affects creatures you can see, protect a number of them equal to 1 plus the spell’s level. They succeed on their saves and take no damage if a successful save normally halves it.',
  'Empowered Evocation': 'Add your Intelligence modifier to one damage roll of a Wizard Evocation spell.',
  'Overchannel': 'Maximize the damage of a Wizard spell of levels 1–5 that deals damage on the turn you cast it. Repeated uses before a Long Rest deal increasing necrotic damage to you.',
};

/** Newly gained features are 2024 notes unless an existing, reviewed runtime profile applies. */
export function levelingFeature(name: string, c: Character, p: ClassProgression): SheetAbility {
  const reuse = ['Reckless Attack', 'Action Surge', 'Cunning Action', 'Uncanny Dodge', 'Evasion', 'Savage Attacker'];
  const existing = reuse.includes(name) ? getFeature(name) : null;
  const smite = /paladin.s smite/i.test(name) ? getSpell('Divine Smite') : null;
  const definition = smite ?? existing;
  return {
    ...(definition ?? {}),
    id: '', name: smite ? 'Divine Smite' : name, sourceClass: p.classKey,
    type: definition?.type ?? 'ability', source: 'srd',
    school: `${c.className} feature (2024)`, classes: [p.classKey],
    tags: [...new Set([...(definition?.tags ?? []), p.classKey, 'feature', '2024', 'leveling-2024'])],
    description: smite?.description ?? DESCRIPTIONS[name] ?? `${name} is gained at ${c.className} level ${p.level}. Apply its situational effects with your DM using the 2024 class rules.`,
    meta: `2024 · ${c.className} level ${p.level}`,
    ...(smite ? { prepared: true, tags: ['paladin', 'feature', 'smite', '2024', 'leveling-2024', 'always-prepared'] } : {}),
    ...(p.resourceMaxima[name] ? { useCounter: { name, max: p.resourceMaxima[name] } } : name === "Monk's Focus" ? { useCounter: { name: 'Ki', max: p.resourceMaxima.Ki ?? p.level } } : {}),
  };
}

const styles = [
  { name: 'Archery', description: '+2 to attack rolls with ranged weapons.' },
  { name: 'Defense', description: '+1 AC while wearing armor.' },
  { name: 'Dueling', description: '+2 damage while wielding a melee weapon in one hand and no other weapon.' },
  { name: 'Great Weapon Fighting', description: 'For a two-handed melee weapon attack, treat damage dice rolls of 1 or 2 as 3; the weapon must have Two-Handed or Versatile.' },
  { name: 'Protection', description: 'With a shield equipped, use a reaction to impose disadvantage on attacks against an adjacent ally until your next turn while you remain within 5 feet.' },
  { name: 'Two-Weapon Fighting', description: 'Add your ability modifier to damage of an extra attack granted by a Light weapon.' },
];
const invocationNames = ['Agonizing Blast', 'Repelling Blast', 'Devil’s Sight', 'Eldritch Mind', 'Fiendish Vigor', 'Mask of Many Faces', 'Misty Visions', 'Pact of the Blade', 'Pact of the Chain', 'Pact of the Tome', 'Otherworldly Leap', 'Lessons of the First Ones', 'Thirsting Blade', 'Lifedrinker', 'Devouring Blade'];
const invocationMin: Record<string, number> = { 'Agonizing Blast': 2, 'Repelling Blast': 2, 'Devil’s Sight': 2, 'Fiendish Vigor': 2, 'Otherworldly Leap': 2, 'Lessons of the First Ones': 2, 'Pact of the Chain': 2, 'Thirsting Blade': 5, 'Lifedrinker': 9, 'Devouring Blade': 12 };
const metamagicNames = ['Careful Spell', 'Distant Spell', 'Empowered Spell', 'Extended Spell', 'Heightened Spell', 'Quickened Spell', 'Seeking Spell', 'Subtle Spell', 'Transmuted Spell', 'Twinned Spell'];
const option = (name: string, description: string) => ({ name, description });
const invocationCount = (level: number) => level < 1 ? 0 : level >= 18 ? 10 : level >= 15 ? 9 : level >= 12 ? 8 : level >= 9 ? 7 : level >= 7 ? 6 : level >= 5 ? 5 : level >= 2 ? 3 : 1;

export function featureChoices2024(c: Character, p: ClassProgression): LevelUpFeatureChoice[] {
  const own = new Set(c.sheetAbilities.map(a => key(a.name)));
  const choices: LevelUpFeatureChoice[] = [];
  const add = (choice: LevelUpFeatureChoice) => { if (choice.count > 0) choices.push(choice); };
  const hasExpertise = (sk: string) => own.has(key(`Expertise: ${sk}`)) || c.modifiers.some(m => m.target.kind === 'skill' && key(m.target.skill ?? '') === key(sk) && /expertise/i.test(m.source));
  if (p.features.includes('Divine Order') || p.features.includes('Primal Order')) {
    const cleric = p.classKey === 'cleric', cantripClass = cleric ? 'cleric' : 'druid';
    add({ key: 'order', label: cleric ? 'Divine Order' : 'Primal Order', count: 1, options: cleric ? [
      option('Protector', 'Gain proficiency with Martial weapons and Heavy armor.'),
      option('Thaumaturge', 'Learn one extra Cleric cantrip. Add your Wisdom modifier, minimum 1, to Arcana and Religion checks.') ] : [
      option('Warden', 'Gain proficiency with Martial weapons and Medium armor.'),
      option('Magician', 'Learn one extra Druid cantrip. Add your Wisdom modifier, minimum 1, to Arcana and Nature checks.') ] });
    add({ key: 'orderCantrip', label: cleric ? 'Thaumaturge cantrip' : 'Magician cantrip', count: 1,
      when: { key: 'order', option: cleric ? 'Thaumaturge' : 'Magician' },
      options: getAllSpells().filter(s => s.type === 'spell' && s.level === 0 && s.classes?.includes(cantripClass) && !own.has(key(s.name))).map(s => option(s.name, s.description)) });
  }
  if (p.features.includes('Expertise') || p.features.includes('Scholar') || p.features.includes('Deft Explorer')) {
    const scholarSkills = ['Arcana', 'History', 'Investigation', 'Medicine', 'Nature', 'Religion'];
    add({ key: 'expertise', label: p.features.includes('Scholar') ? 'Scholar Expertise' : p.features.includes('Deft Explorer') ? 'Deft Explorer Expertise' : 'Expertise', count: p.features.includes('Expertise') ? 2 : 1,
      options: c.proficientSkills.filter(sk => !hasExpertise(sk) && (!p.features.includes('Scholar') || scholarSkills.includes(sk))).map(sk => option(sk, `Double proficiency for ${sk} checks.`)) });
  }
  if (p.features.includes('Fighting Style') || /champion/i.test(c.subclass) && p.level === 7) {
    const extra = p.classKey === 'paladin' ? [{ name: 'Blessed Warrior', description: 'Learn two Cleric cantrips as Paladin spells, using Charisma.' }] : p.classKey === 'ranger' ? [{ name: 'Druidic Warrior', description: 'Learn two Druid cantrips as Ranger spells, using Wisdom.' }] : [];
    add({ key: 'fightingStyle', label: 'Fighting Style', count: 1, options: [...styles, ...extra].filter(s => !own.has(key(`Fighting Style: ${s.name}`))) });
    if (extra.length) add({ key: 'warriorCantrips', label: `${extra[0].name} cantrips`, count: 2, when: { key: 'fightingStyle', option: extra[0].name },
      options: getAllSpells().filter(s => s.type === 'spell' && s.level === 0 && s.classes?.includes(p.classKey === 'paladin' ? 'cleric' : 'druid') && !own.has(key(s.name))).map(s => option(s.name, s.description)) });
  }
  if (p.features.includes('Primal Knowledge')) add({ key: 'primalKnowledge', label: 'Primal Knowledge skill', count: 1,
    options: ['Animal Handling', 'Athletics', 'Intimidation', 'Nature', 'Perception', 'Survival'].filter(s => !c.proficientSkills.includes(s)).map(s => option(s, `Gain ${s} proficiency.`)) });
  if (p.classKey === 'fighter' && /battle\s*master/i.test(c.subclass) && [3, 7, 10, 15].includes(p.level)) {
    const maneuvers = ['Trip Attack', 'Pushing Attack', 'Menacing Attack', 'Disarming Attack', 'Precision Attack', 'Riposte', 'Goading Attack', 'Maneuvering Attack', 'Distracting Strike', 'Lunging Attack', 'Sweeping Attack', 'Parry', 'Evasive Footwork', 'Feinting Attack', 'Rally'];
    add({ key: 'maneuvers', label: 'Battle Master maneuvers', count: p.level === 3 ? 3 : 2,
      options: maneuvers.filter(n => !own.has(key(n))).map(n => option(n, maneuver2024(n)?.description ?? 'Spend a Superiority Die to use this maneuver.')) });
    if (p.level === 3) add({ key: 'studentOfWar', label: 'Student of War skill', count: 1,
      options: ['Acrobatics', 'Animal Handling', 'Athletics', 'History', 'Insight', 'Intimidation', 'Persuasion', 'Perception', 'Survival'].filter(s => !c.proficientSkills.includes(s)).map(s => option(s, `Gain ${s} proficiency.`)) });
  }
  if (p.classKey === 'sorcerer' && [2, 10, 17].includes(p.level)) add({ key: 'metamagic', label: 'Metamagic', count: 2,
    options: metamagicNames.filter(n => !own.has(key(`Metamagic: ${n}`))).map(n => option(n, 'Alter a spell by spending Sorcery Points; apply the option’s 2024 rules with your DM.')) });
  if (p.classKey === 'warlock' && invocationCount(p.level) > invocationCount(p.level - 1)) add({ key: 'invocations', label: 'Eldritch Invocations', count: invocationCount(p.level) - invocationCount(p.level - 1),
    options: invocationNames.filter(n => !own.has(key(`Eldritch Invocation: ${n}`)) && (invocationMin[n] ?? 1) <= p.level &&
      (!['Thirsting Blade', 'Lifedrinker', 'Devouring Blade'].includes(n) || own.has(key('Eldritch Invocation: Pact of the Blade')) || own.has(key('Pact of the Blade'))) &&
      (n !== 'Devouring Blade' || own.has(key('Eldritch Invocation: Thirsting Blade'))))
      .map(n => option(n, 'Apply this invocation’s prerequisite and 2024 effect with your DM.')) });
  if (p.classKey === 'bard' && /(?:college of )?lore/i.test(c.subclass) && p.level === 3) add({ key: 'bonusProficiencies', label: 'College of Lore skills', count: 3,
    options: SKILLS.map(s => s.name).filter(s => !c.proficientSkills.includes(s)).map(s => option(s, `Gain ${s} proficiency.`)) });
  if (p.classKey === 'cleric' && p.level === 7) add({ key: 'blessedStrikes', label: 'Blessed Strikes', count: 1, options: [
    option('Divine Strike', 'Once on each of your turns, a weapon hit deals an extra 1d8 radiant or necrotic damage, your choice; this becomes 2d8 at level 14.'),
    option('Potent Spellcasting', 'Add your Wisdom modifier to damage dealt with a Cleric cantrip. At level 14, damaging with a Cleric cantrip can also grant temporary HP equal to twice Wisdom modifier.') ] });
  if (p.classKey === 'druid' && p.level === 7) add({ key: 'elementalFury', label: 'Elemental Fury', count: 1, options: [
    option('Primal Strike', 'Once on each of your turns, a weapon or Wild Shape hit deals an extra 1d8 cold, fire, lightning, or thunder damage; this becomes 2d8 at level 15.'),
    option('Potent Spellcasting', 'Add your Wisdom modifier to damage dealt with a Druid cantrip. At level 15, a Druid cantrip with at least 10-foot range gains 300 feet of range.') ] });
  return choices;
}

export function selectedFeatureAbility(choiceKey: string, name: string, c: Character): SheetAbility {
  const prefix: Record<string, string> = { expertise: 'Expertise: ', fightingStyle: 'Fighting Style: ', invocations: 'Eldritch Invocation: ', metamagic: 'Metamagic: ' };
  const base = choiceKey === 'maneuvers' ? maneuver2024(name) : null;
  return { ...(base ?? {}), id: '', name: `${prefix[choiceKey] ?? ''}${name}`, type: base?.type ?? 'ability', source: 'srd', sourceClass: c.className.toLowerCase(),
    school: `${c.className} feature (2024)`, classes: [c.className.toLowerCase()],
    tags: [...new Set([...(base?.tags ?? []), choiceKey, '2024', 'leveling-2024'])],
    description: base?.description ?? (choiceKey === 'fightingStyle' ? styles.find(s => s.name === name)?.description : undefined) ??
      (choiceKey === 'expertise' ? `Double your proficiency bonus on ${name} checks. The skill’s numeric bonus can be reviewed in the sheet’s modifiers.` : `Apply the 2024 ${name} feature with your DM.`),
  };
}

function maneuver2024(name: string) {
  const base = getManeuver(name); if (!base) return null;
  const changes: Record<string, { description: string; addDieTo?: 'none' | 'damage'; note: string }> = {
    'Lunging Attack': { description: 'Expend a Superiority Die as a bonus action to Dash. After moving at least 5 feet straight toward a creature this turn, a melee weapon or Unarmed Strike hit against it can add the die to damage.', addDieTo: 'damage', note: 'bonus-action Dash; move 5 feet straight toward the target before the hit' },
    'Evasive Footwork': { description: 'Expend a Superiority Die as a bonus action to Disengage. Roll it and add its result to your AC until your next turn. Apply the AC bonus manually.', addDieTo: 'none', note: 'bonus-action Disengage; +die AC until next turn (manual)' },
    'Parry': { description: 'When a melee attack damages you, use a reaction and a Superiority Die to reduce damage by its roll plus your Strength or Dexterity modifier, your choice. Apply the reduction manually.', addDieTo: 'none', note: 'reaction; reduce damage by die + STR or DEX (manual)' },
    'Rally': { description: 'Use a bonus action and a Superiority Die to grant a visible or audible ally within 30 feet temporary HP equal to its roll plus half your Fighter level, rounded down. Apply the temporary HP manually.', addDieTo: 'none', note: 'bonus action; temp HP = die + half Fighter level (manual)' },
    'Precision Attack': { description: 'After an attack roll with a weapon or Unarmed Strike misses, expend a Superiority Die and add its roll to the attack total. Resolve the changed result with the DM.', addDieTo: 'none', note: 'after a miss, add die to the attack total (manual)' },
  };
  const change = changes[name];
  return change ? { ...base, description: change.description, maneuver: { ...base.maneuver!, addDieTo: change.addDieTo ?? base.maneuver!.addDieTo, note: change.note } } : base;
}
