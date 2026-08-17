import fs from 'node:fs';
import Database from 'better-sqlite3';
import { randomUUID, randomInt } from 'node:crypto';
import { config } from './config.js';
import type {
  Character,
  Condition,
  CreatureAbility,
  MapState,
  Monster,
  SheetAbility,
  Token,
  TokenKind,
} from '../../shared/types.js';
import {
  actionsToSheetAbilities,
  weaponsFromActions,
} from '../../shared/monsterAttacks.js';

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

  -- Freehand + text annotations drawn on a map.
  CREATE TABLE IF NOT EXISTS annotations (
    id         TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    map_id     TEXT NOT NULL,
    kind       TEXT NOT NULL,
    points     TEXT NOT NULL DEFAULT '[]',
    x          REAL NOT NULL DEFAULT 0,
    y          REAL NOT NULL DEFAULT 0,
    text       TEXT NOT NULL DEFAULT '',
    color      TEXT NOT NULL DEFAULT '#ffd166',
    created_by TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL
  );

  -- Image tiles composing a map (in addition to the legacy single image_path,
  -- which renders as the base layer at the origin). Each tile is positioned and
  -- sized in the map's pixel space; the composite extent spans them all.
  CREATE TABLE IF NOT EXISTS map_images (
    id         TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    map_id     TEXT NOT NULL,
    image_path TEXT NOT NULL DEFAULT '',
    x          REAL NOT NULL DEFAULT 0,
    y          REAL NOT NULL DEFAULT 0,
    w          REAL NOT NULL DEFAULT 0,
    h          REAL NOT NULL DEFAULT 0,
    z          INTEGER NOT NULL DEFAULT 0,
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

  -- Shared in-session chat.
  CREATE TABLE IF NOT EXISTS chat_messages (
    id         TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    sender     TEXT NOT NULL DEFAULT '',
    role       TEXT NOT NULL DEFAULT 'player',
    text       TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL
  );

  -- App-wide key/value store (e.g. one-time seed markers). Not session-scoped.
  CREATE TABLE IF NOT EXISTS app_meta (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL DEFAULT ''
  );

  -- Hot lookup paths: everything is fetched per session (or per map for tokens/
  -- shapes) on every snapshot, so index those columns. Idempotent for old saves.
  CREATE INDEX IF NOT EXISTS idx_maps_session          ON maps(session_id);
  CREATE INDEX IF NOT EXISTS idx_tokens_map            ON tokens(map_id);
  CREATE INDEX IF NOT EXISTS idx_characters_session    ON characters(session_id);
  -- rollerName() looks up the claimant per cursor/roll packet; index the column.
  CREATE INDEX IF NOT EXISTS idx_characters_claimed_by ON characters(claimed_by);
  CREATE INDEX IF NOT EXISTS idx_monsters_session      ON monsters(session_id);
  CREATE INDEX IF NOT EXISTS idx_measurements_session  ON measurements(session_id);
  CREATE INDEX IF NOT EXISTS idx_annotations_session   ON annotations(session_id);
  -- measurements + annotations are fetched per MAP on every snapshot build; the
  -- session index above didn't cover that, so these avoid a full-table scan.
  CREATE INDEX IF NOT EXISTS idx_measurements_map      ON measurements(map_id);
  CREATE INDEX IF NOT EXISTS idx_annotations_map       ON annotations(map_id);
  CREATE INDEX IF NOT EXISTS idx_map_images_map         ON map_images(map_id);
  CREATE INDEX IF NOT EXISTS idx_roll_log_session      ON roll_log(session_id);
  CREATE INDEX IF NOT EXISTS idx_chat_messages_session ON chat_messages(session_id);
`);

/** Read an app-wide meta value (one-time flags, etc.), or undefined if unset. */
export function getMeta(key: string): string | undefined {
  return (
    db.prepare('SELECT value FROM app_meta WHERE key = ?').get(key) as
      | { value: string }
      | undefined
  )?.value;
}

/** Write an app-wide meta value. */
export function setMeta(key: string, value: string): void {
  db.prepare(
    'INSERT OR REPLACE INTO app_meta (key, value) VALUES (?, ?)',
  ).run(key, value);
}

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
// Combat round counter (0 = no combat running); advances when the turn wraps.
ensureColumn('sessions', 'combat_round', 'combat_round INTEGER NOT NULL DEFAULT 0');
// Hide the DM's own rolls from players' logs while on.
ensureColumn('sessions', 'hide_dm_rolls', 'hide_dm_rolls INTEGER NOT NULL DEFAULT 0');
// Per-roll flag: a DM roll captured while hide_dm_rolls was on (filtered for players).
ensureColumn('roll_log', 'dm_only', 'dm_only INTEGER NOT NULL DEFAULT 0');
// Per-message flag: rules-assistant Q&A is DM-only (filtered from player snapshots).
ensureColumn('chat_messages', 'dm_only', 'dm_only INTEGER NOT NULL DEFAULT 0');
// Rulebook page citations on an assistant answer (JSON number[]).
ensureColumn('chat_messages', 'pages', "pages TEXT NOT NULL DEFAULT '[]'");
// Image-decal annotations: uploaded art path + draw size.
ensureColumn('annotations', 'url', "url TEXT NOT NULL DEFAULT ''");
ensureColumn('annotations', 'width', 'width REAL NOT NULL DEFAULT 0');
ensureColumn('annotations', 'height', 'height REAL NOT NULL DEFAULT 0');
// Clickable decal popup ("shop"): JSON MapPopup, or '' for none.
ensureColumn('annotations', 'popup', "popup TEXT NOT NULL DEFAULT ''");
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
// Grid alignment + lock/hide (line the overlay up with a printed map grid).
ensureColumn('maps', 'grid_offset_x', 'grid_offset_x REAL NOT NULL DEFAULT 0');
ensureColumn('maps', 'grid_offset_y', 'grid_offset_y REAL NOT NULL DEFAULT 0');
ensureColumn('maps', 'grid_locked', 'grid_locked INTEGER NOT NULL DEFAULT 0');
ensureColumn('maps', 'grid_hidden', 'grid_hidden INTEGER NOT NULL DEFAULT 0');
// DM-chosen map order. Legacy rows default to 0 and are listed by created_at as
// before, so an existing campaign's map order is untouched until the DM reorders
// (which stamps every map 1..N); new maps take MAX+1 so they land at the end.
ensureColumn('maps', 'sort_order', 'sort_order INTEGER NOT NULL DEFAULT 0');
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
// Real-world footprint width in feet (source of truth for token size; decoupled
// from the visual grid). Backfill old saves from the legacy square size (5ft/sq).
ensureColumn('tokens', 'width_ft', 'width_ft REAL');
db.prepare('UPDATE tokens SET width_ft = size * 5 WHERE width_ft IS NULL').run();
ensureColumn(
  'tokens',
  'hide_combat_role',
  'hide_combat_role INTEGER NOT NULL DEFAULT 0',
);
// Token silhouette ('circle' default; objects default to a non-circle by kind).
ensureColumn('tokens', 'shape', "shape TEXT NOT NULL DEFAULT 'circle'");
// Whether this token joins combat when the DM rolls initiative. NULL = auto
// (join if visible), 1 = always join (an invisible stalker IS a combatant),
// 0 = never (a bystander NPC standing in the open). Nullable so existing saves
// stay on 'auto' with no behavior change beyond the visibility rule.
ensureColumn('tokens', 'in_combat', 'in_combat INTEGER');
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
// Subclass / archetype on PCs (adjusts derived resources + spell limits).
ensureColumn('characters', 'subclass', "subclass TEXT NOT NULL DEFAULT ''");
ensureColumn('library_characters', 'subclass', "subclass TEXT NOT NULL DEFAULT ''");
// Permanent stat/roll modifiers (ASI/Resilient/racial); magic-item effects ride
// inside the items JSON. JSON array of SheetModifier.
ensureColumn('characters', 'modifiers', "modifiers TEXT NOT NULL DEFAULT '[]'");
ensureColumn('library_characters', 'modifiers', "modifiers TEXT NOT NULL DEFAULT '[]'");
// Optional long text on a roll entry (e.g. a cast spell's full description).
ensureColumn('roll_log', 'description', "description TEXT NOT NULL DEFAULT ''");
// Optional "Apply damage" payload on a save/damage roll (DM click-to-target saves).
ensureColumn('roll_log', 'apply', "apply TEXT NOT NULL DEFAULT ''");
// DM-only HP accounting note per roll ("Druk HP 42→38").
ensureColumn('roll_log', 'hp_note', "hp_note TEXT NOT NULL DEFAULT ''");
// Cosmetic attack-roll reveal payload (drives the brief d20 reveal animation).
ensureColumn('roll_log', 'reveal', "reveal TEXT NOT NULL DEFAULT ''");
// Enemy/neutral creature roll → strip its modifier breakdown from player logs.
ensureColumn('roll_log', 'hide_mods', 'hide_mods INTEGER NOT NULL DEFAULT 0');
// Emanation measurements follow a token by id.
ensureColumn('measurements', 'token_id', 'token_id TEXT');
// The combat role of a creature's most recent attack, so the token badge
// follows the weapon last used (null until it attacks).
ensureColumn('characters', 'last_attack_role', 'last_attack_role TEXT');
ensureColumn('monsters', 'last_attack_role', 'last_attack_role TEXT');
// Shared party notes on a creature/NPC — editable by the DM and players alike.
ensureColumn('monsters', 'player_notes', "player_notes TEXT NOT NULL DEFAULT ''");
ensureColumn('monsters', 'object_kind', 'object_kind TEXT');
// Loot held by an object (chest/treasure pile): JSON { gold, items }.
ensureColumn('monsters', 'loot', 'loot TEXT');
// Disarm DC for a trap object (DEX / Sleight of Hand check).
ensureColumn('monsters', 'object_dc', 'object_dc INTEGER');
// Rich rollable spells/abilities/masteries on a creature (same shape as PCs).
ensureColumn('monsters', 'sheet_abilities', "sheet_abilities TEXT NOT NULL DEFAULT '[]'");
// Library creatures carry the merged rollable abilities too (round-trip safe).
ensureColumn('library_creatures', 'sheet_abilities', "sheet_abilities TEXT NOT NULL DEFAULT '[]'");
// Coins a character is carrying, in gold pieces (single purse).
ensureColumn('characters', 'gold', 'gold INTEGER NOT NULL DEFAULT 0');
// Battle Master Superiority Die size (the pool lives in the resources counters).
ensureColumn('characters', 'superiority_die', 'superiority_die TEXT');
ensureColumn('characters', 'death_successes', 'death_successes INTEGER NOT NULL DEFAULT 0');
ensureColumn('characters', 'death_failures', 'death_failures INTEGER NOT NULL DEFAULT 0');
// Durable per-player ownership (random browser id) — survives reconnects so
// only the owning player (or DM) can re-claim and edit the sheet.
ensureColumn('characters', 'owner_player_id', 'owner_player_id TEXT');
// Tally of enemies this PC has dropped to 0 HP — shown on the sheet + a shared
// scoreboard (everyone can see it).
ensureColumn('characters', 'kill_count', 'kill_count INTEGER NOT NULL DEFAULT 0');

// Merge legacy free-text monster `actions` into the SINGLE rollable system
// (sheet_abilities): weapon-like actions ("+4 to hit, 1d6+2 slashing") become
// rollable weapons when the monster has none, and the rest keep/scrape a
// structured roll (same converter as creature insert). Idempotent — migrated
// rows store actions = '[]', so old saves convert exactly once. Exported so the
// migration itself is unit-testable against a hand-inserted legacy row.
export function migrateLegacyMonsterActions(): void {
  const rows = db
    .prepare(
      `SELECT id, actions, weapons, sheet_abilities, source FROM monsters
       WHERE actions IS NOT NULL AND actions != '[]' AND actions != ''`,
    )
    .all() as {
    id: string;
    actions: string;
    weapons: string | null;
    sheet_abilities: string | null;
    source: string;
  }[];
  const update = db.prepare(
    'UPDATE monsters SET actions = ?, weapons = ?, sheet_abilities = ? WHERE id = ?',
  );
  for (const r of rows) {
    try {
      let actions = JSON.parse(r.actions) as CreatureAbility[];
      if (!Array.isArray(actions) || actions.length === 0) continue;
      let weapons = JSON.parse(r.weapons ?? '[]') as unknown[];
      if (!Array.isArray(weapons)) weapons = [];
      if (weapons.length === 0) {
        const split = weaponsFromActions(actions);
        weapons = split.weapons;
        actions = split.actions;
      }
      const sheet = JSON.parse(r.sheet_abilities ?? '[]');
      const existing: SheetAbility[] = Array.isArray(sheet) ? sheet : [];
      // Don't duplicate an ability the DM already authored under the same name.
      const have = new Set(existing.map((a) => (a.name ?? '').toLowerCase()));
      const converted = actionsToSheetAbilities(
        actions.filter((a) => !have.has((a.name ?? '').toLowerCase())),
        { makeId: randomUUID, source: r.source as 'srd' | 'gemini' | 'manual' },
      );
      update.run(
        '[]',
        JSON.stringify(weapons),
        JSON.stringify([...existing, ...converted]),
        r.id,
      );
    } catch {
      /* leave a malformed legacy row untouched rather than break loading */
    }
  }
}
migrateLegacyMonsterActions();

export const newId = (): string => randomUUID();

/** Short, unambiguous human-shareable session code (e.g. "K7QF"). */
export function newSessionCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  // Crypto RNG (not Math.random) so codes aren't predictable from prior ones.
  for (let i = 0; i < 4; i++) {
    code += alphabet[randomInt(alphabet.length)];
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
  grid_offset_x: number | null;
  grid_offset_y: number | null;
  grid_locked: number | null;
  grid_hidden: number | null;
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
    gridOffsetX: r.grid_offset_x ?? 0,
    gridOffsetY: r.grid_offset_y ?? 0,
    gridLocked: !!r.grid_locked,
    gridHidden: !!r.grid_hidden,
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
  width_ft: number | null;
  initiative: number | null;
  is_hidden: number;
  combat_role_override: Token['combatRoleOverride'];
  hide_combat_role: number;
  shape: string | null;
  in_combat: number | null;
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
    widthFt: r.width_ft ?? r.size * 5,
    initiative: r.initiative,
    isHidden: !!r.is_hidden,
    // NULL stays undefined = 'auto' (decided by visibility at roll time).
    ...(r.in_combat === null || r.in_combat === undefined
      ? {}
      : { inCombat: !!r.in_combat }),
    combatRoleOverride: r.combat_role_override ?? null,
    hideCombatRole: !!r.hide_combat_role,
    // Placeholder like `combatRole`: buildSnapshot recomputes it with the map's
    // fog before any client sees it. Standalone consumers get the fog-free rule.
    inCombatEffective: r.in_combat === null || r.in_combat === undefined
      ? !r.is_hidden
      : !!r.in_combat,
    // Effective role is filled in by buildSnapshot (needs creature context).
    combatRole: null,
    shape: (r.shape as Token['shape']) ?? 'circle',
  };
}

type CharacterRow = {
  id: string;
  session_id: string;
  name: string;
  race: string;
  class_name: string;
  subclass: string;
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
  gold: number;
  sheet_abilities: string;
  modifiers: string;
  conditions: string;
  claimed_by: string | null;
  owner_player_id: string | null;
  last_attack_role: string | null;
  superiority_die: string | null;
  death_successes: number | null;
  death_failures: number | null;
  kill_count: number | null;
  icon: string;
};

export function rowToCharacter(r: CharacterRow): Character {
  return {
    id: r.id,
    sessionId: r.session_id,
    name: r.name,
    race: r.race,
    className: r.class_name,
    subclass: r.subclass ?? '',
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
    modifiers: JSON.parse(r.modifiers ?? '[]'),
    items: JSON.parse(r.items ?? '[]'),
    gold: r.gold ?? 0,
    sheetAbilities: JSON.parse(r.sheet_abilities ?? '[]'),
    conditions: JSON.parse(r.conditions) as Condition[],
    claimedBy: r.claimed_by,
    ownerId: r.owner_player_id ?? null,
    lastAttackRole: (r.last_attack_role as Character['lastAttackRole']) ?? null,
    superiorityDie: r.superiority_die ?? undefined,
    deathSaves: {
      successes: r.death_successes ?? 0,
      failures: r.death_failures ?? 0,
    },
    killCount: r.kill_count ?? 0,
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
  object_kind: string | null;
  loot: string | null;
  object_dc: number | null;
  sheet_abilities: string;
  last_attack_role: string | null;
  player_notes: string | null;
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
    sheetAbilities: JSON.parse(r.sheet_abilities ?? '[]'),
    conditions: JSON.parse(r.conditions) as Condition[],
    source: r.source,
    disposition: r.disposition ?? 'enemy',
    ...(r.object_kind ? { objectKind: r.object_kind as Monster['objectKind'] } : {}),
    ...(r.loot ? { loot: JSON.parse(r.loot) as Monster['loot'] } : {}),
    ...(r.object_dc != null ? { objectDc: r.object_dc } : {}),
    lastAttackRole: (r.last_attack_role as Monster['lastAttackRole']) ?? null,
    icon: r.icon ?? '',
    playerNotes: r.player_notes ?? '',
  };
}
