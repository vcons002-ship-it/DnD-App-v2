// Parse a creature's free-text `actions` (e.g. "+4 to hit, 1d6+2 slashing.")
// into structured, rollable `weapons`. Pure + framework-free so it can run on
// the server at spawn time and be unit-tested. Monster damage is baked (the
// ability mod is already in the dice), matching rollWeaponAttack's isMonster path.
import type { AbilityRecharge, AbilityRoll, CreatureAbility, SheetAbility, Weapon } from './types.js';
import { isDamageType } from './damage.js';

/**
 * Read a limited-use marker from an action's name or text: "(Recharge 5–6)",
 * "Recharge 6", "(Recharges after a Short or Long Rest)", "(1/Day)". Returns
 * null for an at-will action. Pure text → data; nothing here rolls the d6.
 */
export function parseRecharge(name: string, description = ''): AbilityRecharge | null {
  const text = `${name} ${description}`;
  const dice = text.match(/\brecharge\s+([1-6])(?:\s*(?:[–—-]|to)\s*6)?\b/i);
  if (dice) return { min: Number(dice[1]) };
  const rest = text.match(/\brecharges?\s+(?:after|on|at the end of)\s+(?:a|an)?\s*(short(?:\s+or\s+long)?|long)\s+rest\b/i);
  if (rest) return { rest: /^short/i.test(rest[1]) ? 'short' : 'long' };
  if (/\(\s*\d+\s*\/\s*day(?:\s+each)?\s*\)/i.test(name)) return { rest: 'long' };
  return null;
}

/** The ability's recharge: its structured field, else what its name declares
 *  (so creatures saved before the field existed still show a Ready/Spent chip). */
export function effectiveRecharge(a: { name: string; description?: string; recharge?: AbilityRecharge }): AbilityRecharge | null {
  return a.recharge ?? parseRecharge(a.name, a.description);
}

/** Short chip text: "⟳ 5–6", "⟳ 6", "⟳ short rest", "⟳ long rest". */
export function rechargeLabel(r: AbilityRecharge): string {
  if (r.min) return `⟳ ${r.min === 6 ? '6' : `${r.min}–6`}`;
  return `⟳ ${r.rest === 'short' ? 'short rest' : 'long rest'}`;
}

/** An action is a weapon attack iff it has BOTH a "+N to hit" and damage dice.
 *  A limited-use action ("Recharge 5–6") stays an ability, so it keeps its
 *  Ready/Spent state instead of becoming an at-will weapon. */
function parseAttack(a: CreatureAbility): Weapon | null {
  if (a.recharge || parseRecharge(a.name, a.description ?? '')) return null;
  return parseAttackText(a);
}

/** "+N to hit … NdM type" as a weapon shape, ignoring any recharge marker. */
function parseAttackText(a: CreatureAbility): Weapon | null {
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
  if (after && isDamageType(after[1])) damageType = after[1].toLowerCase();

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

/** An attack line and NOTHING else: "+4 to hit, reach 5 ft., 1d6+2 piercing." —
 *  no save, no rider, no "plus" damage, no two-handed or second range. */
const BARE_ATTACK_LINE =
  /^\s*[+-]?\d+\s+to\s+hit\s*,\s*(?:(?:reach|range)\s+[\d/]+(?:\s*ft\.?)?\s*,\s*)?\d+d\d+(?:\s*[+-]\s*\d+)?\s+[a-z]+\s*\.?\s*$/i;

const normDice = (d?: string) => (d ?? '').replace(/\s+/g, '').toLowerCase();

/**
 * Whether an action is DEMONSTRABLY a duplicate of a weapon the creature already
 * has: its text is a bare attack line (nothing more), and it parses to a weapon
 * identical to a stored one — name, to-hit, dice, type, melee/ranged and range.
 * Anything carrying extra mechanics or prose (a save, "plus 1d6 fire", a
 * two-handed alternative) is NOT a duplicate, so it's kept.
 */
export function isCleanAttackDuplicate(action: CreatureAbility, weapons: Weapon[]): boolean {
  if (!BARE_ATTACK_LINE.test(action.description ?? '')) return false;
  const parsed = weaponsFromActions([action]).weapons[0];
  if (!parsed) return false;
  return weapons.some(
    (w) =>
      w.name.trim().toLowerCase() === parsed.name.trim().toLowerCase() &&
      w.kind === parsed.kind &&
      (w.attackBonus ?? null) === (parsed.attackBonus ?? null) &&
      normDice(w.damage) === normDice(parsed.damage) &&
      (w.damageType ?? '').toLowerCase() === (parsed.damageType ?? '').toLowerCase() &&
      (w.range ?? '').replace(/\s+/g, '') === (parsed.range ?? '').replace(/\s+/g, ''),
  );
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
/**
 * Convert free-text `actions` into rich sheet abilities — the ONE rollable
 * system. An action's structured roll is kept, or scraped from the prose
 * (`parseActionRoll`); purely descriptive entries (Multiattack) become roll-less
 * abilities. `makeId` is injected so this stays framework-free (the server
 * passes its uuid factory). Used at creature insert AND by the db migration of
 * old saves — keep both on this one implementation.
 */
export function actionsToSheetAbilities(
  actions: CreatureAbility[],
  opts: { makeId: () => string; source?: 'srd' | 'gemini' | 'manual' },
): SheetAbility[] {
  return actions.map((a) => {
    const recharge = a.recharge ?? parseRecharge(a.name, a.description ?? '');
    // A limited-use ATTACK ("Tail Spike (Recharge 5–6): +7 to hit, 2d8+4") isn't
    // a weapon (that would make it at-will), so it carries an attack roll instead.
    const attack = recharge && !a.roll ? parseAttackText(a) : null;
    return {
      id: opts.makeId(),
      name: a.name,
      type: 'ability' as const,
      description: a.description ?? '',
      roll: a.roll ?? parseActionRoll(a.description ?? '') ?? (attack
        ? { kind: 'attack' as const, dice: attack.damage, damageType: attack.damageType, attackBonus: attack.attackBonus }
        : undefined),
      ...(recharge ? { recharge } : {}),
      source: opts.source === 'manual' || !opts.source ? ('custom' as const) : opts.source,
    };
  });
}

export function parseActionRoll(description: string): AbilityRoll | null {
  const desc = description ?? '';
  if (/to hit/i.test(desc)) return null; // a weapon attack, not a save/damage action
  const dmg = desc.match(/(\d+d\d+(?:\s*[+-]\s*\d+)?)/i);
  if (!dmg) return null;
  const dice = dmg[1].replace(/\s+/g, '');

  let damageType: string | undefined;
  const after = desc.slice((dmg.index ?? 0) + dmg[1].length).match(/\s*([a-z]+)/i);
  if (after && isDamageType(after[1])) damageType = after[1].toLowerCase();

  const save = desc.match(/DC\s*(\d+)\s+([A-Za-z]+)/i);
  if (save) {
    const code = ABILITY_CODES[save[2].toLowerCase()];
    if (code) return { kind: 'save', dice, dc: parseInt(save[1], 10), save: code, damageType };
  }
  return { kind: 'damage', dice, damageType };
}
