import type { ManeuverSpec, SheetAbility } from '../../../shared/types.js';

/**
 * Battle Master combat maneuvers (2024 rules), modeled on the mastery list: each
 * is a toggleable sheet entry that, when active, spends one Superiority Die on
 * the next attack and applies the die per `addDieTo` (and an optional forced
 * save whose failure applies `onFail`). Inherently positional/reaction maneuvers
 * (`addDieTo: 'none'`, plus Rally's `'heal'`) still roll + spend + log their
 * effect text, but their movement/reaction resolution is left to the table —
 * consistent with how the weapon masteries handle Push/Slow/etc.
 */
export type ManeuverEntry = Omit<SheetAbility, 'id' | 'source'>;

type Def = { description: string; maneuver: ManeuverSpec };

const DEFS: Record<string, Def> = {
  'Ambush': {
    description:
      'When you make a Dexterity (Stealth) check or an Initiative roll, you can expend one Superiority Die and add it to the roll, provided you aren’t Incapacitated. (Add the die to that roll manually.)',
    maneuver: { active: false, addDieTo: 'none', note: 'add die to Stealth / Initiative' },
  },
  'Bait and Switch': {
    description:
      'When you’re within 5 feet of a creature on your turn, you can expend one Superiority Die and switch places with it, provided you spend at least 5 feet of movement and it is willing. This movement doesn’t provoke Opportunity Attacks. Roll the die; until the start of your next turn, you or the other creature (your choice) gains a bonus to AC equal to the number rolled.',
    maneuver: { active: false, addDieTo: 'none', note: 'swap places; +die to AC' },
  },
  "Commander's Strike": {
    description:
      'When you take the Attack action, you can forgo one of your attacks and use a Bonus Action to direct one of your companions to strike. When you do so, choose a friendly creature who can see or hear you and expend one Superiority Die. That creature can immediately use its Reaction to make one melee attack, adding the Superiority Die to the attack’s damage roll.',
    maneuver: { active: false, addDieTo: 'none', note: 'ally Reaction attack +die damage' },
  },
  'Commanding Presence': {
    description:
      'When you make a Charisma (Intimidation), a Charisma (Performance), or a Charisma (Persuasion) check, you can expend one Superiority Die and add it to the roll. (Add the die to that check manually.)',
    maneuver: { active: false, addDieTo: 'none', note: 'add die to a Charisma check' },
  },
  'Disarming Attack': {
    description:
      'When you hit a creature with a weapon attack, you can expend one Superiority Die to attempt to disarm the target, adding the die to the attack’s damage roll. The target must succeed on a Strength saving throw or drop one item of your choice that it’s holding.',
    maneuver: { active: false, addDieTo: 'damage', save: { ability: 'STR' }, note: 'target drops an item on a failed save' },
  },
  'Distracting Strike': {
    description:
      'When you hit a creature with a weapon attack, you can expend one Superiority Die to distract it, adding the die to the attack’s damage roll. The next attack roll against the target by an attacker other than you has Advantage if the attack is made before the start of your next turn.',
    maneuver: { active: false, addDieTo: 'damage', grantsAdvantage: true, note: 'allies have Advantage vs the target' },
  },
  'Evasive Footwork': {
    description:
      'When you move, you can expend one Superiority Die, rolling it and adding the number rolled to your AC until you stop moving.',
    maneuver: { active: false, addDieTo: 'none', note: '+die to AC while moving' },
  },
  'Feinting Attack': {
    description:
      'You can expend one Superiority Die and use a Bonus Action to feint, choosing one creature within 5 feet of yourself as your target. You have Advantage on your next attack roll against that target this turn. If that attack hits, add the Superiority Die to the attack’s damage roll.',
    maneuver: { active: false, addDieTo: 'damage', grantsAdvantage: true, note: 'Advantage on this attack (Bonus Action)' },
  },
  'Goading Attack': {
    description:
      'When you hit a creature with a weapon attack, you can expend one Superiority Die to attempt to goad the target into attacking you, adding the die to the attack’s damage roll. The target must succeed on a Wisdom saving throw or have Disadvantage on attack rolls against targets other than you until the end of your next turn.',
    maneuver: { active: false, addDieTo: 'damage', save: { ability: 'WIS' }, note: 'on a failed save, target has Disadvantage vs others' },
  },
  'Grappling Strike': {
    description:
      'Immediately after you hit a creature with a melee weapon attack on your turn, you can expend one Superiority Die and attempt to grapple the target as a Bonus Action. Add the Superiority Die to your Strength (Athletics) check; on a failed save the target has the Grappled condition.',
    maneuver: { active: false, addDieTo: 'damage', save: { ability: 'STR', onFail: 'Grappled' }, note: 'grapple the target' },
  },
  'Lunging Attack': {
    description:
      'When you make a melee weapon attack on your turn, you can expend one Superiority Die to increase your reach for that attack by 5 feet. If you hit, add the die to the attack’s damage roll.',
    maneuver: { active: false, addDieTo: 'damage', note: '+5 ft reach' },
  },
  'Maneuvering Attack': {
    description:
      'When you hit a creature with a weapon attack, you can expend one Superiority Die to maneuver one of your comrades into a better position, adding the die to the attack’s damage roll. You then choose a friendly creature who can see or hear you; that creature can use its Reaction to move up to half its Speed without provoking Opportunity Attacks from the target.',
    maneuver: { active: false, addDieTo: 'damage', note: 'an ally may move without provoking' },
  },
  'Menacing Attack': {
    description:
      'When you hit a creature with a weapon attack, you can expend one Superiority Die to attempt to frighten the target, adding the die to the attack’s damage roll. The target must succeed on a Wisdom saving throw or have the Frightened condition until the end of your next turn.',
    maneuver: { active: false, addDieTo: 'damage', save: { ability: 'WIS', onFail: 'Frightened' }, note: 'frighten the target' },
  },
  'Parry': {
    description:
      'When another creature damages you with a melee attack, you can expend one Superiority Die and use your Reaction to reduce the damage by the number rolled plus your Dexterity modifier.',
    maneuver: { active: false, addDieTo: 'none', note: 'reduce melee damage taken (Reaction)' },
  },
  'Precision Attack': {
    description:
      'When you make a weapon attack roll against a creature, you can expend one Superiority Die to add it to the roll. You can use this maneuver before or after making the attack roll, but before any effects of the attack are applied.',
    maneuver: { active: false, addDieTo: 'attack', note: 'add die to the attack roll' },
  },
  'Pushing Attack': {
    description:
      'When you hit a creature with a weapon attack, you can expend one Superiority Die to attempt to drive the target back, adding the die to the attack’s damage roll. If the target is Large or smaller, it must succeed on a Strength saving throw or be pushed up to 15 feet away from you.',
    maneuver: { active: false, addDieTo: 'damage', save: { ability: 'STR' }, note: 'push up to 15 ft on a failed save' },
  },
  'Quick Toss': {
    description:
      'As a Bonus Action, you can expend one Superiority Die and make a ranged attack with a weapon that has the Thrown property. You can draw the weapon as part of making this attack. If you hit, add the Superiority Die to the weapon’s damage roll.',
    maneuver: { active: false, addDieTo: 'damage', note: 'thrown attack (Bonus Action)' },
  },
  'Rally': {
    description:
      'On your turn, you can expend one Superiority Die and use a Bonus Action to bolster the resolve of a companion. Choose a friendly creature who can see or hear you; that creature gains Temporary Hit Points equal to the Superiority Die roll plus your Charisma modifier.',
    maneuver: { active: false, addDieTo: 'heal', note: 'grant Temp HP = die + CHA mod' },
  },
  'Riposte': {
    description:
      'When a creature misses you with a melee attack, you can expend one Superiority Die and use your Reaction to make a melee weapon attack against the creature. If you hit, add the Superiority Die to the attack’s damage roll.',
    maneuver: { active: false, addDieTo: 'damage', note: 'Reaction attack after an enemy misses' },
  },
  'Sweeping Attack': {
    description:
      'When you hit a creature with a melee weapon attack, you can expend one Superiority Die to attempt to damage another creature with the same attack. Choose another creature within 5 feet of the original target and within your reach. If the original attack roll would hit the second creature, it takes damage equal to the number you roll on your Superiority Die (same type as the original attack).',
    maneuver: { active: false, addDieTo: 'none', note: 'deal die damage to a second creature (resolve manually)' },
  },
  'Tactical Assessment': {
    description:
      'When you make an Intelligence (History), an Intelligence (Investigation), or a Wisdom (Insight) check, you can expend one Superiority Die and add it to the roll. (Add the die to that check manually.)',
    maneuver: { active: false, addDieTo: 'none', note: 'add die to History / Investigation / Insight' },
  },
  'Trip Attack': {
    description:
      'When you hit a creature with a weapon attack, you can expend one Superiority Die to attempt to knock the target down, adding the die to the attack’s damage roll. If the target is Large or smaller, it must succeed on a Strength saving throw or have the Prone condition.',
    maneuver: { active: false, addDieTo: 'damage', save: { ability: 'STR', onFail: 'Prone' }, note: 'knock the target Prone' },
  },
};

const MANEUVERS: ManeuverEntry[] = Object.entries(DEFS).map(([name, d]) => ({
  name,
  type: 'maneuver' as const,
  meta: 'Battle Master maneuver',
  description: d.description,
  maneuver: d.maneuver,
}));

/** Search maneuvers by name or tag (e.g. "trip", "menacing", "maneuver"). The
 *  literal word "maneuver" (in the meta) makes them all findable by category. */
export function searchManeuvers(query: string, limit = 12): ManeuverEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return MANEUVERS.slice(0, limit);
  const matches = MANEUVERS.filter((m) =>
    `${m.name} ${m.meta ?? ''}`.toLowerCase().includes(q),
  );
  matches.sort((a, b) => {
    const ap = a.name.toLowerCase().startsWith(q) ? 0 : 1;
    const bp = b.name.toLowerCase().startsWith(q) ? 0 : 1;
    return ap - bp || a.name.localeCompare(b.name);
  });
  return matches.slice(0, limit);
}

/** Exact (case-insensitive) lookup by maneuver name. */
export function getManeuver(name: string): ManeuverEntry | null {
  const q = name.trim().toLowerCase();
  return MANEUVERS.find((m) => m.name.toLowerCase() === q) ?? null;
}
