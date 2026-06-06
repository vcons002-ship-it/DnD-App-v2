// Parse a creature's free-text `actions` (e.g. "+4 to hit, 1d6+2 slashing.")
// into structured, rollable `weapons`. Pure + framework-free so it can run on
// the server at spawn time and be unit-tested. Monster damage is baked (the
// ability mod is already in the dice), matching rollWeaponAttack's isMonster path.
import type { AbilityRoll, CreatureAbility, Weapon } from './types.js';

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

const ABILITY_CODES: Record<string, string> = {
  str: 'STR', strength: 'STR',
  dex: 'DEX', dexterity: 'DEX',
  con: 'CON', constitution: 'CON',
  int: 'INT', intelligence: 'INT',
  wis: 'WIS', wisdom: 'WIS',
  cha: 'CHA', charisma: 'CHA',
};

/**
 * Best-effort scrape a structured roll from a NON-attack action's free text — a
 * "DC <n> <ability> saving throw … <NdM> <type> damage" (breath weapons, auras).
 * Returns a `save` roll when it finds a DC + dice, else a bare `damage` roll when
 * there's only damage dice, else null (e.g. Multiattack, recharge-only prose).
 * Weapon attacks ("+N to hit") are handled by `weaponsFromActions`, not here.
 */
export function parseActionRoll(description: string): AbilityRoll | null {
  const desc = description ?? '';
  if (/to hit/i.test(desc)) return null; // a weapon attack, not a save/damage action
  const dmg = desc.match(/(\d+d\d+(?:\s*[+-]\s*\d+)?)/i);
  if (!dmg) return null;
  const dice = dmg[1].replace(/\s+/g, '');

  let damageType: string | undefined;
  const after = desc.slice((dmg.index ?? 0) + dmg[1].length).match(/\s*([a-z]+)/i);
  if (after && DAMAGE_TYPES.has(after[1].toLowerCase())) damageType = after[1].toLowerCase();

  const save = desc.match(/DC\s*(\d+)\s+([A-Za-z]+)/i);
  if (save) {
    const code = ABILITY_CODES[save[2].toLowerCase()];
    if (code) return { kind: 'save', dice, dc: parseInt(save[1], 10), save: code, damageType };
  }
  return { kind: 'damage', dice, damageType };
}
