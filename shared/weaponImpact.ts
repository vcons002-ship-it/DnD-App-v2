import type {HpFxEvent,Weapon,WeaponAttackKind} from './types.js';

/** Cosmetic categories only. Never forward a creature's weapon name or stats. */
export function weaponAttackKind(weapon:Weapon,distanceFt=0):WeaponAttackKind{
  const tags=[weapon.name,...weapon.tags??[]].join(' ').toLowerCase();
  const throwable=/\bthrown\b/.test(tags+' '+(weapon.range??''))||/\b(handaxe|dagger|javelin|spear|trident|light hammer)\b/.test(tags);
  const reach=Number(/reach\s*(\d+)/i.exec(weapon.range??'')?.[1]??5);
  if(weapon.kind==='ranged'||throwable&&(distanceFt>reach+1e-6||/\bthrow(?:n)?\b/.test(weapon.name.toLowerCase()))){
    if(/crossbow/.test(tags))return 'bolt';
    if(/\b(pistol|musket|rifle|firearm|gun)\b/.test(tags))return 'bullet';
    if(/blowgun|\bdart\b/.test(tags))return 'dart';
    if(/bow|arrow/.test(tags))return 'arrow';
    if(/sling|\brock\b|\bstone\b|boulder/.test(tags))return 'stone';
    if(/axe/.test(tags))return 'axe';
    if(/dagger|knife/.test(tags))return 'knife';
    if(/trident/.test(tags))return 'trident';
    if(/javelin|spear/.test(tags))return 'spear';
    if(/hammer/.test(tags))return 'hammer';
    return 'thrown';
  }
  if(/\bwhip\b/.test(tags))return 'whip';
  if(/\bclaws?\b|talons?/.test(tags))return 'claw';
  if(/\bbite\b|fangs?/.test(tags))return 'bite';
  if(weapon.damageType?.toLowerCase()==='slashing')return 'slash';
  if(weapon.damageType?.toLowerCase()==='piercing')return 'thrust';
  return 'blunt';
}
export const WEAPON_FLIGHT_MS=340;
export const isWeaponProjectile=(kind:WeaponAttackKind)=>
  ['arrow','bolt','stone','thrown','axe','knife','spear','trident','hammer','dart','bullet'].includes(kind);
export const weaponTravelMs=(event:Pick<HpFxEvent,'weaponAttack'|'sourcePosition'>)=>
  event.sourcePosition&&event.weaponAttack&&isWeaponProjectile(event.weaponAttack.kind)?WEAPON_FLIGHT_MS:0;
