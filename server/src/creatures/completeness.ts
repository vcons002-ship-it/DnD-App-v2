import type { CreatureTemplate, ObjectKind, Weapon } from '../../../shared/types.js';
import { weaponsFromActions } from '../../../shared/monsterAttacks.js';
import { getWeapon } from '../weapons/srd.js';
import { isDamageType } from '../../../shared/damage.js';

export const SCORE_KEYS = ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'] as const;
type Creature = Partial<CreatureTemplate> & { name: string; objectKind?: ObjectKind };
/** Older imports put the damage type in the dice field; the editor rejects it. */
function normalizeAttack(weapon: Weapon): Weapon {
  const match = weapon.damage?.match(/^(\d+d\d+(?:\s*[+-]\s*\d+)?)\s+([a-z]+)(?:\s+damage)?\.?$/i);
  return match && isDamageType(match[2]) ? { ...weapon, damage: match[1].replace(/\s/g, ''), damageType: weapon.damageType || match[2].toLowerCase() } : weapon;
}
/** Markers and spell effects must never acquire creature attacks from a fallback. */
export function isUtilityToken(creature: Creature): boolean {
  return !!creature.objectKind || /^(mage hand|medium sized boat token)(?:\s+\d+)?$/i.test(creature.name)
    || /spell effect/i.test(creature.creatureType ?? '');
}
export function creatureGaps(creature: Creature): string[] {
  if (isUtilityToken(creature)) return [];
  const gaps: string[] = [];
  if (!(creature.maxHp! > 0)) gaps.push('HP');
  if (!(creature.armorClass! > 0)) gaps.push('AC');
  if (!creature.speed?.trim()) gaps.push('speed');
  for (const key of SCORE_KEYS) if (!(Number.isFinite(creature.stats?.[key]) && creature.stats![key] > 0)) gaps.push(key);
  const attacks = [...(creature.weapons ?? []), ...weaponsFromActions(creature.actions ?? []).weapons];
  for (const w of creature.weapons ?? []) if (!w.damage || !Number.isFinite(w.attackBonus) || normalizeAttack(w) !== w) gaps.push(`attack: ${w.name}`);
  if (!attacks.some(w => !!w.damage && Number.isFinite(w.attackBonus)) &&
      !creature.sheetAbilities?.some(a => a.roll && ['attack', 'save', 'damage'].includes(a.roll.kind))) gaps.push('attacks');
  return gaps;
}

/** A patch, not a replacement: preserve DM scores, HP, art and custom attacks. */
export function missingCreatureFields(current: Creature, source: CreatureTemplate): Partial<CreatureTemplate> {
  if (isUtilityToken(current)) return {};
  const patch: Partial<CreatureTemplate> = {};
  const stats = { ...current.stats };
  for (const key of SCORE_KEYS) if (!(Number.isFinite(stats[key]) && stats[key] > 0) && source.stats[key] > 0) stats[key] = source.stats[key];
  if (JSON.stringify(stats) !== JSON.stringify(current.stats ?? {})) patch.stats = stats;
  if (!(current.armorClass! > 0) && source.armorClass > 0) patch.armorClass = source.armorClass;
  if (!(current.maxHp! > 0) && source.maxHp > 0) patch.maxHp = source.maxHp;
  if (!current.speed?.trim() && source.speed) patch.speed = source.speed;
  if (!current.creatureType?.trim()) patch.creatureType = source.creatureType;
  const ownAttacks = weaponsFromActions(current.actions ?? []).weapons;
  const sourceAttacks = (source.weapons?.length ? source.weapons : weaponsFromActions(source.actions).weapons).map(normalizeAttack);
  if (!current.weapons?.length && (ownAttacks.length || sourceAttacks.length)) patch.weapons = ownAttacks.length ? ownAttacks : sourceAttacks;
  if (current.weapons?.some(w => !w.damage || !Number.isFinite(w.attackBonus) || normalizeAttack(w) !== w)) {
    patch.weapons = current.weapons.map(normalizeAttack).map(w => {
      const reference = [...ownAttacks, ...sourceAttacks].find(a => a.name.toLowerCase() === w.name.toLowerCase());
      const book = getWeapon(w.name);
      const score = book?.properties.includes('finesse') ? Math.max(stats.STR ?? 10, stats.DEX ?? 10) : w.kind === 'ranged' ? stats.DEX ?? 10 : stats.STR ?? 10;
      const mod = Math.floor((score - 10) / 2);
      const pb = 2 + Math.floor(Math.max(0, (current.level || source.level || 0) - 1) / 4);
      return { ...w,
        ...(!w.damage && (reference?.damage || book) ? { damage: reference?.damage ?? `${book!.damage}${mod < 0 ? '' : '+'}${mod}`, damageType: w.damageType ?? reference?.damageType ?? book?.damageType } : {}),
        ...(!Number.isFinite(w.attackBonus) ? { attackBonus: reference?.attackBonus ?? pb + mod } : {}),
      };
    });
  }
  if (!current.actions?.length && !current.sheetAbilities?.length && source.actions.length) patch.actions = source.actions;
  if (!current.abilities?.length && source.abilities.length) patch.abilities = source.abilities;
  if (!current.sheetAbilities?.length && source.sheetAbilities?.length) patch.sheetAbilities = source.sheetAbilities;
  // CR zero is legitimate. Only infer CR for a completely blank original sheet.
  if (!Object.keys(current.stats ?? {}).length && !current.level && source.level) patch.level = source.level;
  return patch;
}
