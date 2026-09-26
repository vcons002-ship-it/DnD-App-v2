import type { SheetAbility } from './types.js';

// Name fallback also supports maneuver entries on existing saved sheets.
const ON_HIT = new Set(['disarming attack', 'distracting strike', 'goading attack',
  'maneuvering attack', 'menacing attack', 'pushing attack', 'trip attack']);
export function isOnHitManeuver(ability: SheetAbility): boolean {
  return ability.type === 'maneuver' && ability.maneuver?.addDieTo === 'damage'
    && ON_HIT.has(ability.name.trim().toLowerCase());
}
