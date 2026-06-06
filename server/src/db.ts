import fs from 'node:fs';
import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import { config } from './config.js';
import type {
  Character,
  Condition,
  MapState,
  Monster,
  Token,
  TokenKind,
} from '../../shared/types.js';

fs.mkdirSync(config.dataDir, { recursive: true });
fs.mkdirSync(config.uploadsDir, { recursive: true });

export const db = new Database(config.dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    id                  TEXT PRIMARY KEY,
    code                TEXT UNIQUE NOT NULL,
    name                TEXT NOT NULL,
    active_map_id       TEXT,
    active_turn_token_id TEXT,
    created_at          INTEGER NOT NULL,
    last_played_at      INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS maps (
    id              TEXT PRIMARY KEY,
    session_id      TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    image_path      TEXT,
    slides_url      TEXT,
    grid_size_px    INTEGER NOT NULL DEFAULT 50,
    feet_per_square INTEGER NOT NULL DEFAULT 5,
    width_ft        REAL NOT NULL DEFAULT 0,
    fog_enabled     INTEGER NOT NULL DEFAULT 0,
    fog_mode        TEXT NOT NULL DEFAULT 'off',
    fog_revealed    TEXT NOT NULL DEFAULT '[]',
    created_at      INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS tokens (
    id         TEXT PRIMARY KEY,
    map_id     TEXT NOT NULL REFERENCES maps(id) ON DELETE CASCADE,
    kind       TEXT NOT NULL,
    ref_id     TEXT NOT NULL,
    x          REAL NOT NULL,
    y          REAL NOT NULL,
    size       REAL NOT NULL DEFAULT 1,
    initiative REAL,
    is_hidden  INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS characters (
    id          TEXT PRIMARY KEY,
    session_id  TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    race        TEXT NOT NULL DEFAULT '',
    class_name  TEXT NOT NULL DEFAULT '',
    max_hp      INTEGER NOT NULL DEFAULT 1,
    cur_hp      INTEGER NOT NULL DEFAULT 1,
    stats       TEXT NOT NULL DEFAULT '{}',
    spell_slots TEXT NOT NULL DEFAULT '{}',
    resources   TEXT NOT NULL DEFAULT '{}',
    weapons     TEXT NOT NULL DEFAULT '[]',
    conditions  TEXT NOT NULL DEFAULT '[]',
    claimed_by  TEXT,
    icon        TEXT NOT NULL DEFAULT ''
  );

  CREATE TABLE IF NOT EXISTS monsters (
    id            TEXT PRIMARY KEY,
    session_id    TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    name          TEXT NOT NULL,
    creature_type TEXT NOT NULL DEFAULT '',
    max_hp        INTEGER NOT NULL DEFAULT 1,
    cur_hp        INTEGER NOT NULL DEFAULT 1,
    resistances   TEXT NOT NULL DEFAULT '[]',
    weaknesses    TEXT NOT NULL DEFAULT '[]',
    abilities     TEXT NOT NULL DEFAULT '[]',
    conditions    TEXT NOT NULL DEFAULT '[]',
    source        TEXT NOT NULL DEFAULT 'manual',
    icon          TEXT NOT NULL DEFAULT '',
    armor_class   INTEGER NOT NULL DEFAULT 0,
    speed         TEXT NOT NULL DEFAULT '',
    stats         TEXT NOT NULL DEFAULT '{}',
    actions       TEXT NOT NULL DEFAULT '[]',
    is_template   INTEGER NOT NULL DEFAULT 0,
    template_id   TEXT
  );

  -- Cross-session library: homebrew/AI creatures + items saved by the DM, kept
  -- app-wide (no session_id) so they're reusable across campaigns.
  CREATE TABLE IF NOT EXISTS library_creatures (
    id            TEXT PRIMARY KEY,
    name          TEXT NOT NULL,
    creature_type TEXT NOT NULL DEFAULT '',
    level         REAL NOT NULL DEFAULT 0,
    max_hp        INTEGER NOT NULL DEFAULT 1,
    armor_class   INTEGER NOT NULL DEFAULT 0,
    speed         TEXT NOT NULL DEFAULT '',
    stats         TEXT NOT NULL DEFAULT '{}',
    resistances   TEXT NOT NULL DEFAULT '[]',
    weaknesses    TEXT NOT NULL DEFAULT '[]',
    weapons       TEXT NOT NULL DEFAULT '[]',
    actions       TEXT NOT NULL DEFAULT '[]',
    abilities     TEXT NOT NULL DEFAULT '[]',
    icon          TEXT NOT NULL DEFAULT '',
    created_at    INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS library_items (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    qty_default INTEGER NOT NULL DEFAULT 1,
    data        TEXT NOT NULL DEFAULT '{}',
    created_at  INTEGER NOT NULL
  );

  -- Cross-session character library: full sheets minus session state, app-wide.
  CREATE TABLE IF NOT EXISTS library_characters (
    id                TEXT PRIMARY KEY,
    name              TEXT NOT NULL,
    race              TEXT NOT NULL DEFAULT '',
    class_name        TEXT NOT NULL DEFAULT '',
    level             REAL NOT NULL DEFAULT 1,
    max_hp            INTEGER NOT NULL DEFAULT 10,
    cur_hp            INTEGER NOT NULL DEFAULT 10,
    armor_class       INTEGER NOT NULL DEFAULT 0,
    speed             TEXT NOT NULL DEFAULT '',
    stats             TEXT NOT NULL DEFAULT '{}',
    spell_slots       TEXT NOT NULL DEFAULT '{}',
    resources         TEXT NOT NULL DEFAULT '{}',
    weapons           TEXT NOT NULL DEFAULT '[]',
    resistances       TEXT NOT NULL DEFAULT '[]',
    weaknesses        TEXT NOT NULL DEFAULT '[]',
    actions           TEXT NOT NULL DEFAULT '[]',
    abilities         TEXT NOT NULL DEFAULT '[]',
    proficient_skills TEXT NOT NULL DEFAULT '[]',
    items             TEXT NOT NULL DEFAULT '[]',
    sheet_abilities   TEXT NOT NULL DEFAULT '[]',
    icon              TEXT NOT NULL DEFAULT '',
    created_at        INTEGER NOT NULL
  );

  -- Persistent measuring shapes (cone/circle/line) per map.
  CREATE TABLE IF NOT EXISTS measurements (
    id         TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    map_id     TEXT NOT NULL,
    kind       TEXT NOT NULL,
    origin_x   REAL NOT NULL,
    origin_y   REAL NOT NULL,
    target_x   REAL NOT NULL,
    target_y   REAL NOT NULL,
    token_id   TEXT,
    created_by TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL
  );

  -- Shared dice roll log per session.
  CREATE TABLE IF NOT EXISTS roll_log (
    id         TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    roller     TEXT NOT NULL DEFAULT '',
    label      TEXT NOT NULL DEFAULT '',
    expr       TEXT NOT NULL DEFAULT '',
    total      INTEGER NOT NULL DEFAULT 0,
    detail     TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL
  );
`);

// ---- Lightweight migrations for DBs created by earlier versions ----
// (Durability requirement: existing saved games must keep working across upgrades.)
/** Adds a column if missing; returns true if it was just added (for migrations). */
function ensureColumn(table: string, column: string, ddl: string): boolean {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as {
    name: string;
  }[];
  if (cols.some((c) => c.name === column)) return false;
  try {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
  } catch (err) {
    // The test suite opens this shared DB file from several parallel workers, so
    // two can race to add the same brand-new column; the loser sees a harmless
    // "duplicate column" error. Swallow only that — anything else is a real bug.
    if (!/duplicate column/i.test((err as Error).message)) throw err;
    return false;
  }
  return true;
}

ensureColumn('sessions', 'active_turn_token_id', 'active_turn_token_id TEXT');
ensureColumn(
  'sessions',
  'last_played_at',
  'last_played_at INTEGER NOT NULL DEFAULT 0',
);
ensureColumn('maps', 'fog_revealed', "fog_revealed TEXT NOT NULL DEFAULT '[]'");
// fog_enabled (legacy boolean) -> fog_mode (off/map/tokens).
if (ensureColumn('maps', 'fog_mode', "fog_mode TEXT NOT NULL DEFAULT 'off'")) {
  const hasFogEnabled = (
    db.prepare('PRAGMA table_info(maps)').all() as { name: string }[]
  ).some((c) => c.name === 'fog_enabled');
  if (hasFogEnabled) {
    db.exec("UPDATE maps SET fog_mode = 'map' WHERE fog_enabled = 1");
  }
}
// fog_mode (single layer) -> two independent layers (map fog + token fog).
ensureColumn('maps', 'map_fog_enabled', 'map_fog_enabled INTEGER NOT NULL DEFAULT 0');
ensureColumn('maps', 'token_fog_enabled', 'token_fog_enabled INTEGER NOT NULL DEFAULT 0');
// Real-world map width in feet (0 = unset → fall back to feet-per-square scale).
ensureColumn('maps', 'width_ft', 'width_ft REAL NOT NULL DEFAULT 0');
const addedMapRev = ensureColumn(
  'maps',
  'map_fog_revealed',
  "map_fog_revealed TEXT NOT NULL DEFAULT '[]'",
);
const addedTokRev = ensureColumn(
  'maps',
  'token_fog_revealed',
  "token_fog_revealed TEXT NOT NULL DEFAULT '[]'",
);
if (addedMapRev || addedTokRev) {
  const hasMode = (
    db.prepare('PRAGMA table_info(maps)').all() as { name: string }[]
  ).some((c) => c.name === 'fog_mode');
  if (hasMode) {
    db.exec(
      "UPDATE maps SET map_fog_enabled = 1, map_fog_revealed = fog_revealed WHERE fog_mode = 'map'",
    );
    db.exec(
      "UPDATE maps SET token_fog_enabled = 1, token_fog_revealed = fog_revealed WHERE fog_mode = 'tokens'",
    );
  }
}
ensureColumn('monsters', 'icon', "icon TEXT NOT NULL DEFAULT ''");
ensureColumn('characters', 'icon', "icon TEXT NOT NULL DEFAULT ''");
ensureColumn('monsters', 'armor_class', 'armor_class INTEGER NOT NULL DEFAULT 0');
ensureColumn('monsters', 'speed', "speed TEXT NOT NULL DEFAULT ''");
ensureColumn('monsters', 'stats', "stats TEXT NOT NULL DEFAULT '{}'");
ensureColumn('monsters', 'actions', "actions TEXT NOT NULL DEFAULT '[]'");
ensureColumn('monsters', 'is_template', 'is_template INTEGER NOT NULL DEFAULT 0');
ensureColumn('monsters', 'template_id', 'template_id TEXT');
ensureColumn(
  'monsters',
  'disposition',
  "disposition TEXT NOT NULL DEFAULT 'enemy'",
);
ensureColumn('monsters', 'weapons', "weapons TEXT NOT NULL DEFAULT '[]'");
ensureColumn('monsters', 'level', 'level REAL NOT NULL DEFAULT 0');
// Characters share the creatures' tagged stat-block shape for consistency.
ensureColumn('characters', 'level', 'level REAL NOT NULL DEFAULT 1');
ensureColumn('characters', 'armor_class', 'armor_class INTEGER NOT NULL DEFAULT 0');
ensureColumn('characters', 'speed', "speed TEXT NOT NULL DEFAULT ''");
ensureColumn('characters', 'resistances', "resistances TEXT NOT NULL DEFAULT '[]'");
ensureColumn('characters', 'weaknesses', "weaknesses TEXT NOT NULL DEFAULT '[]'");
ensureColumn('characters', 'actions', "actions TEXT NOT NULL DEFAULT '[]'");
ensureColumn('characters', 'abilities', "abilities TEXT NOT NULL DEFAULT '[]'");
ensureColumn(
  'characters',
  'proficient_skills',
  "proficient_skills TEXT NOT NULL DEFAULT '[]'",
);
ensureColumn('characters', 'items', "items TEXT NOT NULL DEFAULT '[]'");
ensureColumn(
  'characters',
  'sheet_abilities',
  "sheet_abilities TEXT NOT NULL DEFAULT '[]'",
);
ensureColumn('tokens', 'combat_role_override', 'combat_role_override TEXT');
ensureColumn(
  'tokens',
  'hide_combat_role',
  'hide_combat_role INTEGER NOT NULL DEFAULT 0',
);
// Temporary HP — a flat 2024-rules buffer pool depleted by damage before real HP.
ensureColumn('monsters', 'temp_hp', 'temp_hp INTEGER NOT NULL DEFAULT 0');
ensureColumn('characters', 'temp_hp', 'temp_hp INTEGER NOT NULL DEFAULT 0');
// Saving-throw proficiencies (ability codes) — add the proficiency bonus to saves.
ensureColumn(
  'characters',
  'save_proficiencies',
  "save_proficiencies TEXT NOT NULL DEFAULT '[]'",
);
ensureColumn(
  'monsters',
  'save_proficiencies',
  "save_proficiencies TEXT NOT NULL DEFAULT '[]'",
);
ensureColumn(
  'library_characters',
  'save_proficiencies',
  "save_proficiencies TEXT NOT NULL DEFAULT '[]'",
);
// Optional long text on a roll entry (e.g. a cast spell's full description).
ensureColumn('roll_log', 'description', "description TEXT NOT NULL DEFAULT ''");
// Optional "Apply damage" payload on a save/damage roll (DM click-to-target saves).
ensureColumn('roll_log', 'apply', "apply TEXT NOT NULL DEFAULT ''");
// Emanation measurements follow a token by id.
ensureColumn('measurements', 'token_id', 'token_id TEXT');

export const newId = (): string => randomUUID();

/** Short, unambiguous human-shareable session code (e.g. "K7QF"). */
export function newSessionCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return code;
}

// ---- Row -> domain mappers ----

type MapRow = {
  id: string;
  session_id: string;
  name: string;
  image_path: string | null;
  slides_url: string | null;
  grid_size_px: number;
  feet_per_square: number;
  width_ft: number;
  map_fog_enabled: number;
  token_fog_enabled: number;
  map_fog_revealed: string;
  token_fog_revealed: string;
};

export function rowToMap(r: MapRow): MapState {
  return {
    id: r.id,
    sessionId: r.session_id,
    name: r.name,
    imagePath: r.image_path,
    slidesUrl: r.slides_url,
    gridSizePx: r.grid_size_px,
    feetPerSquare: r.feet_per_square,
    mapWidthFt: r.width_ft,
    mapFogEnabled: !!r.map_fog_enabled,
    tokenFogEnabled: !!r.token_fog_enabled,
    mapFogRevealed: JSON.parse(r.map_fog_revealed ?? '[]') as string[],
    tokenFogRevealed: JSON.parse(r.token_fog_revealed ?? '[]') as string[],
  };
}

type TokenRow = {
  id: string;
  map_id: string;
  kind: TokenKind;
  ref_id: string;
  x: number;
  y: number;
  size: number;
  initiative: number | null;
  is_hidden: number;
  combat_role_override: Token['combatRoleOverride'];
  hide_combat_role: number;
};

export function rowToToken(r: TokenRow): Token {
  return {
    id: r.id,
    mapId: r.map_id,
    kind: r.kind,
    refId: r.ref_id,
    x: r.x,
    y: r.y,
    size: r.size,
    initiative: r.initiative,
    isHidden: !!r.is_hidden,
    combatRoleOverride: r.combat_role_override ?? null,
    hideCombatRole: !!r.hide_combat_role,
    // Effective role is filled in by buildSnapshot (needs creature context).
    combatRole: null,
  };
}

type CharacterRow = {
  id: string;
  session_id: string;
  name: string;
  race: string;
  class_name: string;
  level: number;
  max_hp: number;
  cur_hp: number;
  temp_hp: number;
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
  items: string;
  sheet_abilities: string;
  conditions: string;
  claimed_by: string | null;
  icon: string;
};

export function rowToCharacter(r: CharacterRow): Character {
  return {
    id: r.id,
    sessionId: r.session_id,
    name: r.name,
    race: r.race,
    className: r.class_name,
    level: r.level ?? 1,
    maxHp: r.max_hp,
    curHp: r.cur_hp,
    tempHp: r.temp_hp ?? 0,
    armorClass: r.armor_class ?? 0,
    speed: r.speed ?? '',
    stats: JSON.parse(r.stats),
    spellSlots: JSON.parse(r.spell_slots),
    resources: JSON.parse(r.resources),
    weapons: JSON.parse(r.weapons),
    resistances: JSON.parse(r.resistances ?? '[]'),
    weaknesses: JSON.parse(r.weaknesses ?? '[]'),
    actions: JSON.parse(r.actions ?? '[]'),
    abilities: JSON.parse(r.abilities ?? '[]'),
    proficientSkills: JSON.parse(r.proficient_skills ?? '[]'),
    saveProficiencies: JSON.parse(r.save_proficiencies ?? '[]'),
    items: JSON.parse(r.items ?? '[]'),
    sheetAbilities: JSON.parse(r.sheet_abilities ?? '[]'),
    conditions: JSON.parse(r.conditions) as Condition[],
    claimedBy: r.claimed_by,
    icon: r.icon ?? '',
  };
}

type MonsterRow = {
  id: string;
  session_id: string;
  name: string;
  creature_type: string;
  max_hp: number;
  cur_hp: number;
  temp_hp: number;
  resistances: string;
  weaknesses: string;
  save_proficiencies: string;
  abilities: string;
  conditions: string;
  source: Monster['source'];
  icon: string;
  armor_class: number;
  speed: string;
  stats: string;
  actions: string;
  weapons: string;
  disposition: Monster['disposition'];
  level: number;
};

export function rowToMonster(r: MonsterRow): Monster {
  return {
    id: r.id,
    sessionId: r.session_id,
    name: r.name,
    creatureType: r.creature_type,
    level: r.level ?? 0,
    maxHp: r.max_hp,
    curHp: r.cur_hp,
    tempHp: r.temp_hp ?? 0,
    armorClass: r.armor_class ?? 0,
    speed: r.speed ?? '',
    stats: JSON.parse(r.stats ?? '{}'),
    resistances: JSON.parse(r.resistances),
    weaknesses: JSON.parse(r.weaknesses),
    saveProficiencies: JSON.parse(r.save_proficiencies ?? '[]'),
    actions: JSON.parse(r.actions ?? '[]'),
    weapons: JSON.parse(r.weapons ?? '[]'),
    abilities: JSON.parse(r.abilities),
    conditions: JSON.parse(r.conditions) as Condition[],
    source: r.source,
    disposition: r.disposition ?? 'enemy',
    icon: r.icon ?? '',
  };
}
