// Startup migrations for the 25 Sep review's trust fixes. Both are idempotent
// (a second run changes nothing) and conservative: they touch only data that is
// provably what the app itself produced, and leave anything a DM edited alone.
import { db } from './db.js';
import { getSrd } from './creatures/srd.js';
import { isCleanAttackDuplicate } from '../../shared/monsterAttacks.js';
import type { SheetAbility, Weapon } from '../../shared/types.js';

/** The exact key set `actionsToSheetAbilities` gives an attack line (its roll is
 *  undefined, so JSON drops it). More keys = someone touched it. */
const UNTOUCHED_KEYS = new Set(['id', 'name', 'type', 'description', 'source']);

/**
 * Remove sheet abilities that duplicate one of the creature's own weapons — the
 * "every SRD attack appears twice" bug — but only when BOTH hold:
 *  - the text is a bare attack line identical to a stored weapon (no rider, no
 *    save, no "plus" damage): see `isCleanAttackDuplicate`;
 *  - the entry is exactly what insert produced (no roll added via "Make
 *    rollable", no edits) — so a DM's work is never discarded.
 * Returns how many creatures changed.
 */
export function migrateDuplicateAttackAbilities(): number {
  const rows = db
    .prepare(`SELECT id, weapons, sheet_abilities FROM monsters`)
    .all() as { id: string; weapons: string | null; sheet_abilities: string | null }[];
  const update = db.prepare('UPDATE monsters SET sheet_abilities = ? WHERE id = ?');
  let changed = 0;
  for (const r of rows) {
    try {
      const weapons = JSON.parse(r.weapons ?? '[]') as Weapon[];
      const sheet = JSON.parse(r.sheet_abilities ?? '[]') as SheetAbility[];
      if (!Array.isArray(weapons) || !weapons.length || !Array.isArray(sheet) || !sheet.length)
        continue;
      const keep = sheet.filter((ab) => {
        const untouched =
          ab.type === 'ability' &&
          !ab.roll &&
          Object.keys(ab).every((k) => UNTOUCHED_KEYS.has(k));
        return !(untouched && isCleanAttackDuplicate({ name: ab.name, description: ab.description }, weapons));
      });
      if (keep.length === sheet.length) continue;
      update.run(JSON.stringify(keep), r.id);
      changed++;
    } catch {
      /* leave a malformed row untouched rather than break loading */
    }
  }
  return changed;
}

const lc = (xs: unknown): string[] =>
  (Array.isArray(xs) ? xs : []).map((x) => String(x).trim().toLowerCase()).sort();
const sameSet = (a: unknown, b: unknown) => JSON.stringify(lc(a)) === JSON.stringify(lc(b));
const sameStats = (a: Record<string, number>, b: Record<string, number>) => {
  const keys = [...new Set([...Object.keys(a ?? {}), ...Object.keys(b ?? {})])].sort();
  return keys.every((k) => (a ?? {})[k] === (b ?? {})[k]);
};

type StatRow = {
  id: string;
  name: string;
  creature_type: string | null;
  level: number | null;
  max_hp: number | null;
  armor_class: number | null;
  stats: string | null;
  resistances: string | null;
  weaknesses: string | null;
  immunities: string | null;
  object_kind: string | null;
};

/**
 * Give an SRD creature the damage immunities its stat block has always had —
 * placed creatures AND the DM's library copies — but ONLY when every defining
 * field still matches the SRD block exactly: name (an instance's "Goblin 2"
 * counts as "Goblin"), type, CR, AC, max HP, ability scores, weaknesses, and
 * resistances (either the current list, or the old one where an immunity was
 * filed as a resistance — the Young Red Dragon's fire). A source label proves
 * nothing, so it isn't consulted; a CR-scaled, reskinned or edited creature
 * doesn't match and is left alone. Returns how many rows changed.
 */
export function migrateSrdImmunities(): number {
  let changed = 0;
  for (const table of ['monsters', 'library_creatures'] as const) {
    const rows = db
      .prepare(
        `SELECT id, name, creature_type, level, max_hp, armor_class, stats, resistances,
                weaknesses, immunities, object_kind FROM ${table}`,
      )
      .all() as StatRow[];
    const update = db.prepare(`UPDATE ${table} SET immunities = ?, resistances = ? WHERE id = ?`);
    for (const r of rows) {
      try {
        if (r.object_kind) continue;
        if (lc(JSON.parse(r.immunities ?? '[]')).length) continue; // already has some
        const srd = getSrd(r.name) ?? getSrd(r.name.replace(/\s+\d+$/, ''));
        const imm = srd?.immunities ?? [];
        if (!srd || imm.length === 0) continue;
        const res = JSON.parse(r.resistances ?? '[]');
        const matches =
          (r.creature_type ?? '') === srd.creatureType &&
          Number(r.level) === Number(srd.level) &&
          r.max_hp === srd.maxHp &&
          r.armor_class === srd.armorClass &&
          sameStats(JSON.parse(r.stats ?? '{}'), srd.stats ?? {}) &&
          sameSet(JSON.parse(r.weaknesses ?? '[]'), srd.weaknesses) &&
          (sameSet(res, srd.resistances) || sameSet(res, [...srd.resistances, ...imm]));
        if (!matches) continue;
        update.run(JSON.stringify(imm), JSON.stringify(srd.resistances), r.id);
        changed++;
      } catch {
        /* leave a malformed row untouched rather than break loading */
      }
    }
  }
  return changed;
}
