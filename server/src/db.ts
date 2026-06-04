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
    fog_enabled     INTEGER NOT NULL DEFAULT 0,
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
    claimed_by  TEXT
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
    source        TEXT NOT NULL DEFAULT 'manual'
  );
`);

// ---- Lightweight migrations for DBs created by earlier versions ----
// (Durability requirement: existing saved games must keep working across upgrades.)
function ensureColumn(table: string, column: string, ddl: string): void {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as {
    name: string;
  }[];
  if (!cols.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
  }
}

ensureColumn('sessions', 'active_turn_token_id', 'active_turn_token_id TEXT');
ensureColumn(
  'sessions',
  'last_played_at',
  'last_played_at INTEGER NOT NULL DEFAULT 0',
);
ensureColumn('maps', 'fog_revealed', "fog_revealed TEXT NOT NULL DEFAULT '[]'");

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
  fog_enabled: number;
  fog_revealed: string;
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
    fogEnabled: !!r.fog_enabled,
    fogRevealed: JSON.parse(r.fog_revealed ?? '[]') as string[],
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
  };
}

type CharacterRow = {
  id: string;
  session_id: string;
  name: string;
  race: string;
  class_name: string;
  max_hp: number;
  cur_hp: number;
  stats: string;
  spell_slots: string;
  resources: string;
  weapons: string;
  conditions: string;
  claimed_by: string | null;
};

export function rowToCharacter(r: CharacterRow): Character {
  return {
    id: r.id,
    sessionId: r.session_id,
    name: r.name,
    race: r.race,
    className: r.class_name,
    maxHp: r.max_hp,
    curHp: r.cur_hp,
    stats: JSON.parse(r.stats),
    spellSlots: JSON.parse(r.spell_slots),
    resources: JSON.parse(r.resources),
    weapons: JSON.parse(r.weapons),
    conditions: JSON.parse(r.conditions) as Condition[],
    claimedBy: r.claimed_by,
  };
}

type MonsterRow = {
  id: string;
  session_id: string;
  name: string;
  creature_type: string;
  max_hp: number;
  cur_hp: number;
  resistances: string;
  weaknesses: string;
  abilities: string;
  conditions: string;
  source: Monster['source'];
};

export function rowToMonster(r: MonsterRow): Monster {
  return {
    id: r.id,
    sessionId: r.session_id,
    name: r.name,
    creatureType: r.creature_type,
    maxHp: r.max_hp,
    curHp: r.cur_hp,
    resistances: JSON.parse(r.resistances),
    weaknesses: JSON.parse(r.weaknesses),
    abilities: JSON.parse(r.abilities),
    conditions: JSON.parse(r.conditions) as Condition[],
    source: r.source,
  };
}
