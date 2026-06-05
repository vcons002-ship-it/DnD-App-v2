import { db, newId } from './db.js';
import type {
  CreatureAbility,
  CreatureTemplate,
  LibraryItem,
  Weapon,
} from '../../shared/types.js';
import { iconForCreature } from './creatures/srd.js';

// ---- Cross-session creature library ----

type LibCreatureRow = {
  id: string;
  name: string;
  creature_type: string;
  level: number;
  max_hp: number;
  armor_class: number;
  speed: string;
  stats: string;
  resistances: string;
  weaknesses: string;
  weapons: string;
  actions: string;
  abilities: string;
  icon: string;
};

function rowToTemplate(r: LibCreatureRow): CreatureTemplate {
  return {
    name: r.name,
    creatureType: r.creature_type,
    level: r.level ?? 0,
    maxHp: r.max_hp,
    armorClass: r.armor_class,
    speed: r.speed,
    stats: JSON.parse(r.stats ?? '{}'),
    resistances: JSON.parse(r.resistances ?? '[]'),
    weaknesses: JSON.parse(r.weaknesses ?? '[]'),
    weapons: JSON.parse(r.weapons ?? '[]') as Weapon[],
    actions: JSON.parse(r.actions ?? '[]') as CreatureAbility[],
    abilities: JSON.parse(r.abilities ?? '[]') as CreatureAbility[],
    icon: r.icon || iconForCreature(r.name, r.creature_type),
    source: 'library',
  };
}

/** Library creatures whose name contains the query (prefix-first), capped. */
export function searchLibraryCreatures(query: string, limit = 8): CreatureTemplate[] {
  const q = query.trim().toLowerCase();
  const rows = (
    q
      ? db
          .prepare(
            'SELECT * FROM library_creatures WHERE LOWER(name) LIKE ? ORDER BY name ASC',
          )
          .all(`%${q}%`)
      : db
          .prepare('SELECT * FROM library_creatures ORDER BY name ASC LIMIT ?')
          .all(limit)
  ) as LibCreatureRow[];
  rows.sort((a, b) => {
    const ap = a.name.toLowerCase().startsWith(q) ? 0 : 1;
    const bp = b.name.toLowerCase().startsWith(q) ? 0 : 1;
    return ap - bp || a.name.localeCompare(b.name);
  });
  return rows.slice(0, limit).map(rowToTemplate);
}

/** Exact (case-insensitive) library lookup — a hit means no AI call is needed. */
export function getLibraryCreature(name: string): CreatureTemplate | null {
  const row = db
    .prepare('SELECT * FROM library_creatures WHERE LOWER(name) = ?')
    .get(name.trim().toLowerCase()) as LibCreatureRow | undefined;
  return row ? rowToTemplate(row) : null;
}

export type SaveCreatureInput = {
  name: string;
  creatureType?: string;
  level?: number;
  maxHp?: number;
  armorClass?: number;
  speed?: string;
  stats?: Record<string, number>;
  resistances?: string[];
  weaknesses?: string[];
  weapons?: Weapon[];
  actions?: CreatureAbility[];
  abilities?: CreatureAbility[];
  icon?: string;
};

/**
 * Save a creature to the library under `name`. If an entry with that name
 * already exists and `overwrite` is false, returns the existing entry so the
 * caller can prompt (cancel / rename / overwrite); otherwise writes it.
 */
export function saveLibraryCreature(
  input: SaveCreatureInput,
  overwrite: boolean,
): { saved: CreatureTemplate } | { conflict: CreatureTemplate } {
  const name = input.name.trim();
  const existing = getLibraryCreature(name);
  if (existing && !overwrite) return { conflict: existing };

  const id =
    (db
      .prepare('SELECT id FROM library_creatures WHERE LOWER(name) = ?')
      .get(name.toLowerCase()) as { id: string } | undefined)?.id ?? newId();

  db.prepare(
    `INSERT OR REPLACE INTO library_creatures
       (id, name, creature_type, level, max_hp, armor_class, speed, stats,
        resistances, weaknesses, weapons, actions, abilities, icon, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    name,
    input.creatureType ?? '',
    input.level ?? 0,
    input.maxHp ?? 1,
    input.armorClass ?? 0,
    input.speed ?? '',
    JSON.stringify(input.stats ?? {}),
    JSON.stringify(input.resistances ?? []),
    JSON.stringify(input.weaknesses ?? []),
    JSON.stringify(input.weapons ?? []),
    JSON.stringify(input.actions ?? []),
    JSON.stringify(input.abilities ?? []),
    input.icon ?? iconForCreature(name, input.creatureType ?? ''),
    Date.now(),
  );
  return { saved: getLibraryCreature(name)! };
}

export function deleteLibraryCreature(name: string): void {
  db.prepare('DELETE FROM library_creatures WHERE LOWER(name) = ?').run(
    name.trim().toLowerCase(),
  );
}

// ---- Cross-session item library ----

type LibItemRow = {
  id: string;
  name: string;
  description: string;
  qty_default: number;
};

const rowToItem = (r: LibItemRow): LibraryItem => ({
  id: r.id,
  name: r.name,
  description: r.description,
  qtyDefault: r.qty_default,
});

export function listLibraryItems(query = ''): LibraryItem[] {
  const q = query.trim().toLowerCase();
  const rows = (
    q
      ? db
          .prepare(
            'SELECT * FROM library_items WHERE LOWER(name) LIKE ? ORDER BY name ASC',
          )
          .all(`%${q}%`)
      : db.prepare('SELECT * FROM library_items ORDER BY name ASC').all()
  ) as LibItemRow[];
  return rows.map(rowToItem);
}

export function saveLibraryItem(input: {
  name: string;
  description?: string;
  qtyDefault?: number;
}): LibraryItem {
  const name = input.name.trim();
  const id =
    (db
      .prepare('SELECT id FROM library_items WHERE LOWER(name) = ?')
      .get(name.toLowerCase()) as { id: string } | undefined)?.id ?? newId();
  db.prepare(
    `INSERT OR REPLACE INTO library_items
       (id, name, description, qty_default, data, created_at)
     VALUES (?, ?, ?, ?, '{}', ?)`,
  ).run(id, name, input.description ?? '', input.qtyDefault ?? 1, Date.now());
  return rowToItem(
    db.prepare('SELECT * FROM library_items WHERE id = ?').get(id) as LibItemRow,
  );
}

export function deleteLibraryItem(id: string): void {
  db.prepare('DELETE FROM library_items WHERE id = ?').run(id);
}
