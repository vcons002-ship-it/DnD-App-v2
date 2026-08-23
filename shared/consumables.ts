// Working out what an inventory item DOES when you drink/use it, so a healing
// potion can roll and apply itself instead of being manual bookkeeping.
// Framework-free (the server re-parses every use — the client is never trusted)
// and unit-tested.
import { rollDice } from './dice.js';

/** What using a consumable does. `tempHp` sets temporary HP rather than healing. */
export type ConsumableEffect = {
  kind: 'heal' | 'tempHp';
  /** A rollable expression, e.g. "2d4+2" or a flat "10". */
  dice: string;
};

/** The shape `parseConsumable` needs — an InventoryItem, or anything like one. */
export type ConsumableSource = {
  name: string;
  note?: string;
  use?: ConsumableEffect;
};

/** A number or dice term, possibly summed: "2d4 + 2", "10", "1d8". */
const EXPR = String.raw`(?:\d*d\d+|\d+)(?:\s*[+-]\s*(?:\d*d\d+|\d+))*`;
/**
 * "restores 2d4 + 2 hit points", "you gain 10 temporary hit points". The healing
 * VERB must sit immediately before the amount, and "hit points" immediately
 * after — otherwise a rope's "has 2 hit points and can be burst" (or a Rope of
 * Climbing's "20 hit points … regains 1 per 5 minutes") would read as a potion.
 */
const HEAL_RE = new RegExp(
  String.raw`\b(?:restor|regain|recover|heal|gain)\w*\s+(?:up\s+to\s+)?(${EXPR})\s+(temporary\s+)?hit\s+points`,
  'i',
);

/** The standard healing potions, so a hand-typed name with no description still
 *  works. Longest/most specific names first — "Potion of Healing" is a prefix of
 *  nothing, but "Greater/Superior/Supreme" all contain "Healing". */
const BY_NAME: { match: RegExp; effect: ConsumableEffect }[] = [
  { match: /potion of supreme healing/i, effect: { kind: 'heal', dice: '10d4+20' } },
  { match: /potion of superior healing/i, effect: { kind: 'heal', dice: '8d4+8' } },
  { match: /potion of greater healing/i, effect: { kind: 'heal', dice: '4d4+4' } },
  { match: /potion of healing/i, effect: { kind: 'heal', dice: '2d4+2' } },
];

/** A dice/flat expression the roller can actually evaluate. */
function cleanDice(raw: string): string | null {
  const expr = raw.replace(/\s+/g, '');
  if (!expr) return null;
  return rollDice(expr) ? expr : null;
}

/**
 * What happens when this item is used — or null when it isn't a consumable.
 * Resolution order: an explicit `use` the DM/player set, then the item's own
 * description, then the standard-potion name table.
 */
export function parseConsumable(item: ConsumableSource): ConsumableEffect | null {
  if (item.use) {
    const dice = cleanDice(item.use.dice ?? '');
    if (dice) return { kind: item.use.kind === 'tempHp' ? 'tempHp' : 'heal', dice };
  }
  const m = HEAL_RE.exec(item.note ?? '');
  if (m) {
    const dice = cleanDice(m[1]);
    if (dice) return { kind: m[2] ? 'tempHp' : 'heal', dice };
  }
  for (const entry of BY_NAME) {
    if (entry.match.test(item.name)) return { ...entry.effect };
  }
  return null;
}

/** Short label for the Use button's tooltip, e.g. "heal 2d4+2". */
export function describeConsumable(e: ConsumableEffect): string {
  return `${e.kind === 'tempHp' ? 'temp HP' : 'heal'} ${e.dice}`;
}
