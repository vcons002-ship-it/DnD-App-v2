/**
 * A hand-authored digest of core D&D 5e (2024) rules, paraphrased from the
 * freely-licensed SRD 5.2 (CC-BY-4.0) — NOT copied verbatim. This is the prose
 * backbone the rules assistant retrieves over, covering the procedural questions
 * a DM asks most (combat actions, advantage, cover, conditions, resting, death
 * saves, spellcasting rules, weapon masteries). The app's structured data
 * (spells, skills, feats) is layered on top in corpus.ts; an uploaded rulebook
 * PDF, when present, takes precedence over everything here.
 *
 * Each section is a retrievable chunk: a title + a short rules paraphrase.
 */
export type DigestSection = { title: string; text: string };

export const RULES_DIGEST: DigestSection[] = [
  {
    title: 'The Six Abilities & Modifiers',
    text: 'The six abilities are Strength, Dexterity, Constitution, Intelligence, Wisdom, and Charisma. Each has a score (typically 1–20 for adventurers, up to 30 for some monsters) and a modifier derived from it: modifier = (score − 10) rounded down, then halved (floor). So 10–11 = +0, 12–13 = +1, 14–15 = +2, 8–9 = −1, 20 = +5. You add the relevant modifier to d20 rolls (checks, attacks, saves) and to many other values.',
  },
  {
    title: 'Proficiency Bonus',
    text: 'Your proficiency bonus is based on level (characters) or Challenge Rating (monsters): +2 at levels 1–4, +3 at 5–8, +4 at 9–12, +5 at 13–16, +6 at 17–20. Add it once to any d20 roll you are proficient with (a skill, saving throw, or attack), and to spell save DCs and spell attacks. You never add it more than once to a single roll, even if more than one thing would grant it.',
  },
  {
    title: 'Ability Checks & Skills',
    text: 'To make an ability check, roll a d20 and add the relevant ability modifier (plus your proficiency bonus if proficient in a relevant skill or tool). Compare the total to a Difficulty Class (DC): very easy 5, easy 10, medium 15, hard 20, very hard 25, nearly impossible 30. The 18 skills are each tied to an ability (e.g. Stealth = Dexterity, Perception/Insight = Wisdom, Persuasion/Deception/Intimidation = Charisma, Athletics = Strength). A skill just lets you add proficiency to a check using its ability.',
  },
  {
    title: 'Advantage and Disadvantage',
    text: 'When you have advantage, roll two d20s and use the higher; with disadvantage, use the lower. They never stack: no matter how many sources apply, you have advantage OR disadvantage at most once. If you have both advantage and disadvantage at the same time, they cancel and you roll a single normal d20. Advantage/disadvantage is not added to anything — it only changes which die you keep.',
  },
  {
    title: 'Passive Checks',
    text: 'A passive check is a d20 check with no die roll, used for routine or secret checks (often passive Perception). The total = 10 + all modifiers that normally apply. If the character has advantage on such checks, add 5; with disadvantage, subtract 5. For example, passive Perception 14 means the character notices anything with a Stealth/DC of 14 or lower without rolling.',
  },
  {
    title: 'Inspiration / Heroic Inspiration',
    text: 'A character with Heroic Inspiration can expend it to reroll any one d20 immediately after rolling, and must use the new roll. You can have only one at a time. The DM grants it for great roleplaying, heroics, or other table rewards.',
  },
  {
    title: 'Combat — Round, Turn, and Initiative',
    text: 'Combat runs in rounds of about 6 seconds. At the start, everyone rolls initiative (a Dexterity check) and acts in order from highest to lowest; ties are broken by the DM or by Dexterity. On your turn you can move up to your Speed and take one action, plus possibly a bonus action and any number of free interactions. You can also take one reaction per round, even on others’ turns.',
  },
  {
    title: 'Actions in Combat',
    text: 'On your turn you take one action. Common actions: Attack (one or more attacks if a feature grants extra), Magic (cast a spell with a casting time of an action), Dash (extra movement equal to your Speed), Disengage (your movement doesn’t provoke opportunity attacks this turn), Dodge (attackers have disadvantage and you make Dexterity saves with advantage until your next turn), Help (give an ally advantage or aid an attack), Hide (make a Stealth check to become unseen), Ready (prepare a trigger and response), Search, Influence, Study, Utilize (use an object), and improvised actions the DM allows.',
  },
  {
    title: 'Bonus Actions and Reactions',
    text: 'A bonus action is a special, faster action you can take only when a feature, spell, or ability specifically says it uses a bonus action; you get at most one per turn. A reaction is an instant response triggered by a specific event (the most common is the opportunity attack), and you have one reaction per round that refreshes at the start of your turn. If you use your reaction, you can’t take another until your next turn.',
  },
  {
    title: 'Making an Attack & Hitting',
    text: 'To attack, roll a d20 and add your ability modifier (Strength for melee, Dexterity for ranged; finesse weapons use either) and your proficiency bonus if proficient. If the total equals or exceeds the target’s Armor Class (AC), you hit. On a hit, roll the weapon’s or spell’s damage and add the same ability modifier (not proficiency) for weapon attacks. A natural 20 on the d20 is a critical hit (it always hits); a natural 1 always misses.',
  },
  {
    title: 'Critical Hits',
    text: 'When you score a critical hit, roll all the attack’s damage dice twice and add them together, then add any relevant modifiers once. Only damage dice are doubled — flat bonuses (like your ability modifier or a +1 weapon) are not. A natural 20 on an attack roll is always a critical hit and always hits regardless of AC.',
  },
  {
    title: 'Armor Class (AC)',
    text: 'Armor Class measures how hard you are to hit. Without armor, AC = 10 + Dexterity modifier (plus features like a Barbarian’s Unarmored Defense). Light armor adds full Dex modifier; medium armor adds up to +2 Dex; heavy armor uses a fixed value and ignores Dex. A shield adds +2. You can’t add the same bonus twice, and most AC-setting features don’t stack with each other.',
  },
  {
    title: 'Opportunity Attacks',
    text: 'You can make an opportunity attack (one melee attack, using your reaction) when a creature you can see leaves your reach by moving on its own. It does not trigger if the creature Teleports, is moved without using its own movement, or takes the Disengage action. The attack happens right before the creature leaves your reach.',
  },
  {
    title: 'Cover',
    text: 'Cover improves AC and Dexterity saves against effects that come from the far side. Half cover (a low wall, furniture, another creature) gives +2 AC and +2 Dex saves. Three-quarters cover (an arrow slit, a tree trunk) gives +5 AC and +5 Dex saves. Total cover can’t be targeted directly by an attack or spell. A target benefits from the best cover available.',
  },
  {
    title: 'Cooperative & Group Checks',
    text: 'When several creatures attempt the same task together, the DM may call for a group check: everyone rolls, and if at least half succeed, the whole group succeeds. The Help action lets one ally give another advantage on an ability check for a task the helper could reasonably assist with, or aid an attack against a creature within 5 feet of the helper.',
  },
  {
    title: 'Grappling',
    text: 'In the 2024 rules, grappling is usually done with an Unarmed Strike (part of the Attack action) to Grapple: the target must succeed on a Strength or Dexterity saving throw (DC = 8 + your Strength modifier + proficiency bonus) or be Grappled. A Grappled creature has Speed 0 and moves with the grappler (at half the grappler’s speed). The grapple ends if the grappler is Incapacitated, the target is moved out of reach, or the target uses an action to escape with a Strength (Athletics) or Dexterity (Acrobatics) check vs the grapple DC.',
  },
  {
    title: 'Shoving',
    text: 'You can replace one of your attacks with a Shove using an Unarmed Strike: the target makes a Strength or Dexterity saving throw (DC = 8 + your Strength modifier + proficiency bonus). On a failure you either push it 5 feet away or knock it Prone (your choice). You can shove a creature no more than one size larger than you.',
  },
  {
    title: 'Being Prone',
    text: 'A Prone creature’s only movement option is to crawl (costing extra movement) unless it stands up, which costs half its Speed. While Prone it has disadvantage on attack rolls. Attack rolls against a Prone creature have advantage if the attacker is within 5 feet, and disadvantage otherwise (ranged attacks at range are harder).',
  },
  {
    title: 'Movement, Difficult Terrain, and Jumping',
    text: 'Each foot of difficult terrain (rubble, deep snow, dense undergrowth) costs 1 extra foot of movement. You can break up your movement around your action and even split it before and after. A long jump covers a number of feet up to your Strength score with a 10-foot running start (half without); a high jump reaches 3 + Strength modifier feet up (half without a running start).',
  },
  {
    title: 'Saving Throws',
    text: 'A saving throw resists a threat: roll a d20, add the relevant ability modifier, and add your proficiency bonus if proficient in that save (each class grants two save proficiencies). Compare to the effect’s DC. Spell save DC = 8 + the caster’s spellcasting ability modifier + proficiency bonus. On a successful save against many spells you take half damage; some effects say "half on a save" explicitly.',
  },
  {
    title: 'Damage, Resistance, and Vulnerability',
    text: 'Resistance halves damage of that type; vulnerability doubles it; immunity ignores it. Apply resistance/vulnerability after all other modifiers, and only once each (multiple sources of resistance don’t stack). If a creature has both resistance and vulnerability to the same type, they cancel. Round any halving down.',
  },
  {
    title: 'Dropping to 0 HP & Death Saving Throws',
    text: 'When a creature drops to 0 hit points it falls Unconscious (monsters usually just die). A player character at 0 HP makes a death saving throw at the start of each of its turns: roll a d20 — 10 or higher is a success, 9 or lower a failure. Three successes means you stabilize (Unconscious but no longer dying); three failures means death. A natural 20 means you regain 1 HP; a natural 1 counts as two failures. Taking any damage while at 0 HP is one automatic failure (two if the damage was from a critical hit). Healing any amount brings you back to consciousness.',
  },
  {
    title: 'Stabilizing & Temporary Hit Points',
    text: 'You can use an action to stabilize a dying creature with a DC 10 Wisdom (Medicine) check; a stabilized creature regains no HP but stops making death saves and will recover 1 HP after 1d4 hours. Temporary hit points are a buffer that absorbs damage before real HP and don’t stack (take the higher); they aren’t healing, can’t exceed your maximum, and are lost when they run out or after a long rest.',
  },
  {
    title: 'Short Rest and Long Rest',
    text: 'A short rest is at least 1 hour of light activity; during it you can spend Hit Dice to heal (roll the die + your Constitution modifier per die) and recover short-rest features. A long rest is at least 8 hours (up to 1 hour of which can be light activity); at its end you regain all lost hit points, recover up to half your total Hit Dice, and reset long-rest features and spell slots. You can benefit from only one long rest per 24 hours, and you must have at least 1 HP to start one.',
  },
  {
    title: 'The Exhaustion Condition (2024)',
    text: 'In the 2024 rules, Exhaustion is tracked in levels. Each level gives a cumulative −2 penalty to all d20 Tests (ability checks, attack rolls, and saving throws) and reduces your Speed by 5 feet per level. So 1 level = −2 and −5 ft, 2 levels = −4 and −10 ft, and so on. At 6 levels of exhaustion the creature dies. Finishing a long rest removes one level of exhaustion (you also need food and drink).',
  },
  {
    title: 'Conditions Overview',
    text: 'Conditions alter capabilities. Blinded: can’t see, auto-fail sight checks, attacks against have advantage and its attacks have disadvantage. Charmed: can’t harm the charmer, who has advantage on social checks with it. Frightened: disadvantage on checks and attacks while the source is in sight, and can’t willingly move closer to it. Grappled: Speed 0. Incapacitated: no actions, bonus actions, or reactions. Invisible: heavily obscured for being seen; attacks against have disadvantage and its attacks have advantage. Paralyzed: incapacitated, can’t move/speak, auto-fails Str/Dex saves, attacks against have advantage, and any hit within 5 feet is a critical. Petrified, Poisoned (disadvantage on attacks and checks), Prone, Restrained (Speed 0, disadvantage on attacks and Dex saves, advantage to attackers), Stunned, and Unconscious round out the list.',
  },
  {
    title: 'Concentration',
    text: 'Some spells require Concentration to maintain. You can concentrate on only one spell at a time; casting another concentration spell ends the first. Concentration ends if you’re Incapacitated, die, or cast another concentration spell. When you take damage while concentrating, make a Constitution saving throw (DC = 10 or half the damage taken, whichever is higher; minimum DC 10) or the spell ends. You also lose concentration if a effect specifically says so.',
  },
  {
    title: 'Casting Spells — Components, Range, and Targets',
    text: 'A spell lists its casting time, range, components, and duration. Components are Verbal (speech), Somatic (a free hand for gestures), and Material (specific items or a component pouch/focus; consumed only if the spell says so). You must be able to see or otherwise target within range, and you need a clear path to the target. A spell with a casting time of 1 action competes with other actions; rituals can be cast more slowly without a slot if you have the ritual feature.',
  },
  {
    title: 'Spell Slots, Upcasting, and Cantrips',
    text: 'Casting a leveled spell expends a slot of that level or higher. Casting a spell using a higher-level slot can strengthen it ("at a higher level" / upcasting), per the spell’s text. Cantrips don’t use slots and scale automatically with character level (most damage cantrips add dice at levels 5, 11, and 17). You regain expended slots on a long rest (Warlock Pact Magic slots return on a short rest).',
  },
  {
    title: 'Bonus-Action Spell Rule',
    text: 'If you cast a spell with a casting time of a bonus action, the only other spell you can cast on the same turn is a cantrip with a casting time of an action. You can’t cast two leveled spells in the same turn this way. (This restriction was relaxed in some 2024 wording, but the classic guideline is: one bonus-action spell plus, at most, an action cantrip.)',
  },
  {
    title: 'Two-Weapon Fighting',
    text: 'When you take the Attack action and attack with a Light weapon in one hand, you can use a bonus action to attack with a different Light weapon in the other hand. You don’t add your ability modifier to the bonus-action attack’s damage unless the modifier is negative or a feature (like the Two-Weapon Fighting style) lets you. In 2024 this is tied to the Light property and can be done once per turn.',
  },
  {
    title: 'Weapon Properties',
    text: 'Common properties: Finesse (use Str or Dex for attack and damage), Light (enables two-weapon fighting), Heavy (Small creatures have disadvantage; needed for some feats), Reach (+5 ft reach), Thrown (can be thrown using the same modifier), Two-Handed (needs both hands), Versatile (a bigger die when used two-handed), Ammunition, and Loading (one shot per action). The 2024 rules also give each weapon a Mastery property usable by classes with Weapon Mastery.',
  },
  {
    title: 'Weapon Mastery Properties (2024)',
    text: 'Each weapon has one mastery property; a character with Weapon Mastery can use it. Cleave (Greataxe etc.): on a hit, make a second attack against another creature within 5 ft. Graze (Greatsword, Glaive): on a miss, deal damage equal to your ability modifier. Nick (Dagger, Scimitar): make the extra Light-weapon attack as part of the Attack action (not a bonus action). Push (Greatclub, Pike): push a hit target up to 10 ft away. Sap (Mace, Spear): a hit target has disadvantage on its next attack. Slow (Club, Longbow): a hit reduces the target’s Speed by 10 ft. Topple (Quarterstaff, Battleaxe): a hit forces a Con save or the target falls Prone. Vex (Shortsword, Hand Crossbow): a hit gives you advantage on your next attack against that target.',
  },
  {
    title: 'Hidden, Unseen Attackers, and Obscurement',
    text: 'Attacking from an unseen position (or while the target can’t see you) gives advantage; attacking a target you can’t see gives disadvantage (and you must guess its location). A lightly obscured area (dim light, light fog) imposes disadvantage on Perception checks relying on sight; a heavily obscured area (darkness, thick fog) blocks vision entirely, effectively blinding creatures looking into it. Making an attack reveals a hidden creature.',
  },
  {
    title: 'Mounted and Underwater Combat (brief)',
    text: 'A willing mount lets you ride; you can make it Dash, Disengage, or Dodge, and being knocked off may require a save. Underwater, melee attacks without a suitable weapon and most ranged attacks have disadvantage, and creatures without a swim speed move at half and may need to hold their breath (1 + Constitution modifier minutes, minimum 30 seconds).',
  },
];
