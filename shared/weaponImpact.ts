import type {HpFxEvent,Weapon} from './types.js';

/** Cosmetic categories only. Never forward a creature's weapon name or stats. */
export function weaponAttackKind(weapon:Weapon):NonNullable<HpFxEvent['weaponAttack']>['kind']{
  const tags=[weapon.name,...weapon.tags??[]].join(' ').toLowerCase();
  if(weapon.kind==='ranged'){
    if(/crossbow/.test(tags))return 'bolt';
    if(/bow|arrow/.test(tags))return 'arrow';
    if(/sling|rock|stone/.test(tags))return 'stone';
    return 'thrown';
  }
  if(weapon.damageType?.toLowerCase()==='slashing')return 'slash';
  if(weapon.damageType?.toLowerCase()==='piercing')return 'thrust';
  return 'blunt';
}
export const WEAPON_FLIGHT_MS=420;
export const weaponTravelMs=(event:Pick<HpFxEvent,'weaponAttack'|'sourcePosition'>)=>
  event.sourcePosition&&event.weaponAttack&&['arrow','bolt','stone','thrown'].includes(event.weaponAttack.kind)?WEAPON_FLIGHT_MS:0;
