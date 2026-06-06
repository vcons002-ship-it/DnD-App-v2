// Parse a creature's free-text `actions` (e.g. "+4 to hit, 1d6+2 slashing.")
// into structured, rollable `weapons`. Pure + framework-free so it can run on
// the server at spawn time and be unit-tested. Monster damage is baked (the
// ability mod is already in the dice), matching rollWeaponAttack's isMonster path.
import type { CreatureAbility, Weapon } from './types.js';
import { abilityMod, signed } from './skills.js';
import { profBonusForCR } from './combatMath.js';

const DAMAGE_TYPES = new Set([
  'slashing', 'piercing', 'bludgeoning', 'fire', 'cold', 'lightning', 'thunder',
  'acid', 'poison', 'necrotic', 'radiant', 'force', 'psychic',
]);

/** An action is a weapon attack iff it has BOTH a "+N to hit" and damage dice. */
function parseAttack(a: CreatureAbility): Weapon | null {
  const desc = a.description ?? '';
  const hit = desc.match(/([+-]?\d+)\s*to hit/i);
  const dmg = desc.match(/(\d+d\d+(?:\s*[+-]\s*\d+)?)/i); // first damage clause only
  if (!hit || !dmg) return null;

  const ranged =
    /\b(bow|crossbow|sling|ranged)\b/i.test(`${a.name} ${desc}`) ||
    /range\s*\d+\s*\/\s*\d+/i.test(desc);

  // Damage type = the known type word right after the first dice clause.
  let damageType: string | undefined;
  const after = desc.slice((dmg.index ?? 0) + dmg[1].length).match(/\s*([a-z]+)/i);
  if (after && DAMAGE_TYPES.has(after[1].toLowerCase())) damageType = after[1].toLowerCase();

  // Range/reach text for display.
  const range =
    desc.match(/range\s*[\d/]+\s*(?:ft\.?)?/i)?.[0] ??
    desc.match(/reach\s*\d+\s*(?:ft\.?)?/i)?.[0];

  return {
    name: a.name,
    kind: ranged ? 'ranged' : 'melee',
    damage: dmg[1].replace(/\s+/g, ''),
    attackBonus: parseInt(hit[1], 10),
    damageType,
    range: range?.trim(),
  };
}

/** A library attack template (weapon book or natural attack) before baking. */
type AttackBase = {
  name: string;
  kind: 'melee' | 'ranged';
  damage?: string;
  damageType?: string;
  range?: string;
  properties?: string[];
};

/**
 * Turn a library attack (a 2024 weapon or a natural attack — both store DICE
 * ONLY) into a self-contained MONSTER attack: the creature's ability modifier
 * is BAKED into the damage and a CR-derived to-hit is set, because the combat
 * engine never adds a monster's ability mod at roll time (only PCs'). Ability:
 * ranged → DEX; melee → STR, unless `finesse` (then the better of STR/DEX).
 */
export function bakeMonsterAttack(
  base: AttackBase,
  stats: Record<string, number>,
  cr: number,
): Weapon {
  const finesse = (base.properties ?? []).some((p) => p.trim().toLowerCase() === 'finesse');
  const str = stats.STR ?? 10;
  const dex = stats.DEX ?? 10;
  const useDex = base.kind === 'ranged' || (finesse && dex > str);
  const mod = abilityMod(useDex ? dex : str);
  const dice = base.damage ?? '';
  return {
    name: base.name,
    kind: base.kind,
    damage: mod && dice ? `${dice}${signed(mod)}` : dice,
    attackBonus: mod + profBonusForCR(cr),
    damageType: base.damageType,
    range: base.range,
  };
}

/**
 * Split a creature's actions into structured `weapons` (the parseable attacks)
 * and the remaining `actions` (Multiattack, recharge/save abilities, etc.).
 */
export function weaponsFromActions(
  actions: CreatureAbility[],
): { weapons: Weapon[]; actions: CreatureAbility[] } {
  const weapons: Weapon[] = [];
  const rest: CreatureAbility[] = [];
  for (const a of actions) {
    const w = parseAttack(a);
    if (w) weapons.push(w);
    else rest.push(a);
  }
  return { weapons, actions: rest };
}
