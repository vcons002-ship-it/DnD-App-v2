import { db, newId, getMeta, setMeta } from './db.js';
import { SRD_ITEMS } from './items/srd.js';
import type {
  CreatureAbility,
  CreatureTemplate,
  InventoryItem,
  LibraryCharacter,
  LibraryItem,
  SheetAbility,
  Weapon,
} from '../../shared/types.js';
import { getSrd, iconForCreature } from './creatures/srd.js';

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
  sheet_abilities: string;
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
    sheetAbilities: JSON.parse(r.sheet_abilities ?? '[]') as SheetAbility[],
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
  sheetAbilities?: SheetAbility[];
  icon?: string;
};

/**
 * Save a creature to the library under `name`. A name that already exists —
 * either in the library OR as a built-in SRD creature (which the saved copy
 * would shadow in search/lookup) — returns the existing entry so the caller can
 * prompt (cancel / rename / overwrite); otherwise it writes it.
 */
export function saveLibraryCreature(
  input: SaveCreatureInput,
  overwrite: boolean,
): { saved: CreatureTemplate } | { conflict: CreatureTemplate } {
  const name = input.name.trim();
  const existing = getLibraryCreature(name) ?? getSrd(name);
  if (existing && !overwrite) return { conflict: existing };

  const id =
    (db
      .prepare('SELECT id FROM library_creatures WHERE LOWER(name) = ?')
      .get(name.toLowerCase()) as { id: string } | undefined)?.id ?? newId();

  db.prepare(
    `INSERT OR REPLACE INTO library_creatures
       (id, name, creature_type, level, max_hp, armor_class, speed, stats,
        resistances, weaknesses, weapons, actions, abilities, sheet_abilities,
        icon, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
    JSON.stringify(input.sheetAbilities ?? []),
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

// ---- Cross-session character library ----

type LibCharacterRow = {
  id: string;
  name: string;
  race: string;
  class_name: string;
  subclass: string;
  level: number;
  max_hp: number;
  cur_hp: number;
  armor_class: number;
  speed: string;
  stats: string;
  spell_slots: string;
  resources: string;
  weapons: string;
  resistances: string;
  weaknesses: string;
  actions: string;
  abilities: string;
  proficient_skills: string;
  save_proficiencies: string;
  modifiers: string;
  items: string;
  sheet_abilities: string;
  icon: string;
};

function rowToLibraryCharacter(r: LibCharacterRow): LibraryCharacter {
  return {
    name: r.name,
    race: r.race,
    className: r.class_name,
    subclass: r.subclass ?? '',
    level: r.level ?? 1,
    maxHp: r.max_hp,
    curHp: r.cur_hp,
    armorClass: r.armor_class,
    speed: r.speed,
    stats: JSON.parse(r.stats ?? '{}'),
    spellSlots: JSON.parse(r.spell_slots ?? '{}'),
    resources: JSON.parse(r.resources ?? '{}'),
    weapons: JSON.parse(r.weapons ?? '[]') as Weapon[],
    resistances: JSON.parse(r.resistances ?? '[]'),
    weaknesses: JSON.parse(r.weaknesses ?? '[]'),
    actions: JSON.parse(r.actions ?? '[]') as CreatureAbility[],
    abilities: JSON.parse(r.abilities ?? '[]') as CreatureAbility[],
    proficientSkills: JSON.parse(r.proficient_skills ?? '[]'),
    saveProficiencies: JSON.parse(r.save_proficiencies ?? '[]'),
    modifiers: JSON.parse(r.modifiers ?? '[]'),
    items: JSON.parse(r.items ?? '[]') as InventoryItem[],
    sheetAbilities: JSON.parse(r.sheet_abilities ?? '[]') as SheetAbility[],
    icon: r.icon,
  };
}

/** Library characters whose name contains the query (prefix-first), capped. */
export function searchLibraryCharacters(query: string, limit = 50): LibraryCharacter[] {
  const q = query.trim().toLowerCase();
  const rows = (
    q
      ? db
          .prepare(
            'SELECT * FROM library_characters WHERE LOWER(name) LIKE ? ORDER BY name ASC',
          )
          .all(`%${q}%`)
      : db
          .prepare('SELECT * FROM library_characters ORDER BY name ASC LIMIT ?')
          .all(limit)
  ) as LibCharacterRow[];
  rows.sort((a, b) => {
    const ap = a.name.toLowerCase().startsWith(q) ? 0 : 1;
    const bp = b.name.toLowerCase().startsWith(q) ? 0 : 1;
    return ap - bp || a.name.localeCompare(b.name);
  });
  return rows.slice(0, limit).map(rowToLibraryCharacter);
}

/** Exact (case-insensitive) library lookup. */
export function getLibraryCharacter(name: string): LibraryCharacter | null {
  const row = db
    .prepare('SELECT * FROM library_characters WHERE LOWER(name) = ?')
    .get(name.trim().toLowerCase()) as LibCharacterRow | undefined;
  return row ? rowToLibraryCharacter(row) : null;
}

export type SaveCharacterInput = Partial<LibraryCharacter> & { name: string };

/**
 * Save a character to the library under `name`. A name already in the library
 * returns the existing entry so the caller can prompt (cancel / rename /
 * overwrite); otherwise it writes the full sheet (minus session state).
 */
export function saveLibraryCharacter(
  input: SaveCharacterInput,
  overwrite: boolean,
): { saved: LibraryCharacter } | { conflict: LibraryCharacter } {
  const name = input.name.trim();
  const existing = getLibraryCharacter(name);
  if (existing && !overwrite) return { conflict: existing };

  const id =
    (db
      .prepare('SELECT id FROM library_characters WHERE LOWER(name) = ?')
      .get(name.toLowerCase()) as { id: string } | undefined)?.id ?? newId();

  db.prepare(
    `INSERT OR REPLACE INTO library_characters
       (id, name, race, class_name, subclass, level, max_hp, cur_hp, armor_class, speed,
        stats, spell_slots, resources, weapons, resistances, weaknesses, actions,
        abilities, proficient_skills, save_proficiencies, modifiers, items,
        sheet_abilities, icon, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    name,
    input.race ?? '',
    input.className ?? '',
    input.subclass ?? '',
    input.level ?? 1,
    input.maxHp ?? 10,
    input.curHp ?? input.maxHp ?? 10,
    input.armorClass ?? 0,
    input.speed ?? '',
    JSON.stringify(input.stats ?? {}),
    JSON.stringify(input.spellSlots ?? {}),
    JSON.stringify(input.resources ?? {}),
    JSON.stringify(input.weapons ?? []),
    JSON.stringify(input.resistances ?? []),
    JSON.stringify(input.weaknesses ?? []),
    JSON.stringify(input.actions ?? []),
    JSON.stringify(input.abilities ?? []),
    JSON.stringify(input.proficientSkills ?? []),
    JSON.stringify(input.saveProficiencies ?? []),
    JSON.stringify(input.modifiers ?? []),
    JSON.stringify(input.items ?? []),
    JSON.stringify(input.sheetAbilities ?? []),
    input.icon ?? '',
    Date.now(),
  );
  return { saved: getLibraryCharacter(name)! };
}

export function deleteLibraryCharacter(name: string): void {
  db.prepare('DELETE FROM library_characters WHERE LOWER(name) = ?').run(
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
            'SELECT * FROM library_items WHERE LOWER(name) LIKE ? OR LOWER(description) LIKE ? ORDER BY name ASC',
          )
          .all(`%${q}%`, `%${q}%`)
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

/**
 * Seed the cross-session item library with the curated SRD catalogue, ONCE. The
 * one-time `app_meta` marker means later user deletions/edits aren't undone on
 * restart; within the seed run we still skip any name already present so we never
 * clobber a same-named item the DM saved earlier.
 */
export const seedLibraryItems = db.transaction((): number => {
  if (getMeta('items_seeded_v1')) return 0;
  let added = 0;
  const exists = db.prepare(
    'SELECT 1 FROM library_items WHERE LOWER(name) = ? LIMIT 1',
  );
  for (const it of SRD_ITEMS) {
    if (exists.get(it.name.toLowerCase())) continue;
    saveLibraryItem({
      name: it.name,
      description: it.description,
      qtyDefault: it.qtyDefault ?? 1,
    });
    added++;
  }
  setMeta('items_seeded_v1', '1');
  return added;
});
