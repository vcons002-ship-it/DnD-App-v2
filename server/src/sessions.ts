import {
  db,
  newId,
  newSessionCode,
  rowToCharacter,
  rowToMap,
  rowToMonster,
  rowToToken,
} from './db.js';
import { iconForCreature } from './creatures/srd.js';
import type {
  Character,
  Condition,
  FogMode,
  MapState,
  Monster,
  SessionSummary,
  Token,
  TokenKind,
} from '../../shared/types.js';

export type Session = {
  id: string;
  code: string;
  name: string;
  activeMapId: string | null;
  activeTurnTokenId: string | null;
};

type SessionRow = {
  id: string;
  code: string;
  name: string;
  active_map_id: string | null;
  active_turn_token_id: string | null;
};

const rowToSession = (r: SessionRow): Session => ({
  id: r.id,
  code: r.code,
  name: r.name,
  activeMapId: r.active_map_id,
  activeTurnTokenId: r.active_turn_token_id,
});

// ---- Sessions ----

export function createSession(name = 'New Campaign'): Session {
  const id = newId();
  let code = newSessionCode();
  // Avoid the (very unlikely) code collision.
  while (db.prepare('SELECT 1 FROM sessions WHERE code = ?').get(code)) {
    code = newSessionCode();
  }
  const now = Date.now();
  db.prepare(
    `INSERT INTO sessions (id, code, name, active_map_id, created_at, last_played_at)
     VALUES (?, ?, ?, NULL, ?, ?)`,
  ).run(id, code, name, now, now);
  seedExampleCharacters(id);
  return { id, code, name, activeMapId: null, activeTurnTokenId: null };
}

/** Bump a session's last-played time (used for the resume directory). */
export function touchSession(sessionId: string): void {
  db.prepare('UPDATE sessions SET last_played_at = ? WHERE id = ?').run(
    Date.now(),
    sessionId,
  );
}

/** All saved sessions, most-recently-played first (DM resume directory). */
export function listSessions(): SessionSummary[] {
  const rows = db
    .prepare(
      `SELECT s.code, s.name, s.created_at, s.last_played_at,
              (SELECT COUNT(*) FROM maps m WHERE m.session_id = s.id) AS map_count
       FROM sessions s
       ORDER BY s.last_played_at DESC, s.created_at DESC`,
    )
    .all() as {
    code: string;
    name: string;
    created_at: number;
    last_played_at: number;
    map_count: number;
  }[];
  return rows.map((r) => ({
    code: r.code,
    name: r.name,
    createdAt: r.created_at,
    lastPlayedAt: r.last_played_at,
    mapCount: r.map_count,
  }));
}

export function getSessionByCode(code: string): Session | null {
  const row = db
    .prepare('SELECT * FROM sessions WHERE code = ?')
    .get(code.toUpperCase()) as SessionRow | undefined;
  return row ? rowToSession(row) : null;
}

export function getSessionById(id: string): Session | null {
  const row = db.prepare('SELECT * FROM sessions WHERE id = ?').get(id) as
    | SessionRow
    | undefined;
  return row ? rowToSession(row) : null;
}

/** Seed the example party from the spec so players have characters to claim. */
function seedExampleCharacters(sessionId: string): void {
  const party = [
    { name: 'Vanec', race: 'Half-Elf', className: 'Fighter', maxHp: 28 },
    { name: 'Varis', race: 'Elf', className: 'Wizard', maxHp: 18 },
    { name: 'Druk', race: 'Half-Orc', className: 'Barbarian', maxHp: 34 },
  ];
  const insert = db.prepare(
    `INSERT INTO characters (id, session_id, name, race, class_name, max_hp, cur_hp)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  for (const c of party) {
    insert.run(newId(), sessionId, c.name, c.race, c.className, c.maxHp, c.maxHp);
  }
}

// ---- Maps ----

export function listMaps(sessionId: string): MapState[] {
  const rows = db
    .prepare('SELECT * FROM maps WHERE session_id = ? ORDER BY created_at ASC')
    .all(sessionId) as Parameters<typeof rowToMap>[0][];
  return rows.map(rowToMap);
}

export function getMap(mapId: string): MapState | null {
  const row = db.prepare('SELECT * FROM maps WHERE id = ?').get(mapId) as
    | Parameters<typeof rowToMap>[0]
    | undefined;
  return row ? rowToMap(row) : null;
}

export function createMap(
  sessionId: string,
  opts: { name: string; imagePath?: string | null; slidesUrl?: string | null },
): MapState {
  const id = newId();
  db.prepare(
    `INSERT INTO maps (id, session_id, name, image_path, slides_url, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    sessionId,
    opts.name,
    opts.imagePath ?? null,
    opts.slidesUrl ?? null,
    Date.now(),
  );
  // First map in a session becomes active by default.
  const session = getSessionById(sessionId);
  if (session && !session.activeMapId) setActiveMap(sessionId, id);
  return getMap(id)!;
}

export function updateMapGrid(
  mapId: string,
  gridSizePx: number,
  feetPerSquare: number,
): void {
  db.prepare(
    'UPDATE maps SET grid_size_px = ?, feet_per_square = ? WHERE id = ?',
  ).run(gridSizePx, feetPerSquare, mapId);
}

export function setFogMode(mapId: string, mode: FogMode): void {
  db.prepare('UPDATE maps SET fog_mode = ? WHERE id = ?').run(mode, mapId);
}

/** Reveal or re-hide a set of "col,row" cells on a map's fog layer. */
export function paintFog(
  mapId: string,
  cells: string[],
  reveal: boolean,
): void {
  const map = getMap(mapId);
  if (!map) return;
  const set = new Set(map.fogRevealed);
  for (const c of cells) {
    if (reveal) set.add(c);
    else set.delete(c);
  }
  db.prepare('UPDATE maps SET fog_revealed = ? WHERE id = ?').run(
    JSON.stringify([...set]),
    mapId,
  );
}

/** Re-cover the entire map (clear all revealed cells). */
export function coverFog(mapId: string): void {
  db.prepare("UPDATE maps SET fog_revealed = '[]' WHERE id = ?").run(mapId);
}

export function setActiveMap(sessionId: string, mapId: string): void {
  db.prepare('UPDATE sessions SET active_map_id = ? WHERE id = ?').run(
    mapId,
    sessionId,
  );
}

export function getActiveMapId(sessionId: string): string | null {
  return getSessionById(sessionId)?.activeMapId ?? null;
}

// ---- Tokens ----

export function listTokens(mapId: string): Token[] {
  const rows = db
    .prepare('SELECT * FROM tokens WHERE map_id = ? ORDER BY created_at ASC')
    .all(mapId) as Parameters<typeof rowToToken>[0][];
  return rows.map(rowToToken);
}

export function getToken(tokenId: string): Token | null {
  const row = db.prepare('SELECT * FROM tokens WHERE id = ?').get(tokenId) as
    | Parameters<typeof rowToToken>[0]
    | undefined;
  return row ? rowToToken(row) : null;
}

export function createToken(opts: {
  mapId: string;
  kind: TokenKind;
  refId: string;
  x: number;
  y: number;
  isHidden?: boolean;
}): Token {
  const id = newId();
  db.prepare(
    `INSERT INTO tokens (id, map_id, kind, ref_id, x, y, size, initiative, is_hidden, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 1, NULL, ?, ?)`,
  ).run(
    id,
    opts.mapId,
    opts.kind,
    opts.refId,
    opts.x,
    opts.y,
    opts.isHidden ? 1 : 0,
    Date.now(),
  );
  return getToken(id)!;
}

export function moveToken(tokenId: string, x: number, y: number): Token | null {
  db.prepare('UPDATE tokens SET x = ?, y = ? WHERE id = ?').run(x, y, tokenId);
  return getToken(tokenId);
}

export function resizeToken(tokenId: string, size: number): Token | null {
  db.prepare('UPDATE tokens SET size = ? WHERE id = ?').run(
    Math.max(0.5, size),
    tokenId,
  );
  return getToken(tokenId);
}

export function setTokenInitiative(
  tokenId: string,
  initiative: number | null,
): Token | null {
  db.prepare('UPDATE tokens SET initiative = ? WHERE id = ?').run(
    initiative,
    tokenId,
  );
  return getToken(tokenId);
}

export function deleteToken(tokenId: string): void {
  db.prepare('DELETE FROM tokens WHERE id = ?').run(tokenId);
}

export function setTokenHidden(tokenId: string, hidden: boolean): Token | null {
  db.prepare('UPDATE tokens SET is_hidden = ? WHERE id = ?').run(
    hidden ? 1 : 0,
    tokenId,
  );
  return getToken(tokenId);
}

/**
 * Copy token placements from one map to another. Tokens reference characters /
 * monsters, so HP and conditions automatically carry over ("statuses carry").
 * Skips refs already present on the target map so re-copying won't duplicate.
 */
export function copyTokens(
  fromMapId: string,
  toMapId: string,
  kinds: TokenKind[],
): void {
  const existing = new Set(
    listTokens(toMapId).map((t) => `${t.kind}:${t.refId}`),
  );
  const insert = db.prepare(
    `INSERT INTO tokens (id, map_id, kind, ref_id, x, y, size, initiative, is_hidden, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  for (const t of listTokens(fromMapId)) {
    if (!kinds.includes(t.kind)) continue;
    if (existing.has(`${t.kind}:${t.refId}`)) continue;
    insert.run(
      newId(),
      toMapId,
      t.kind,
      t.refId,
      t.x,
      t.y,
      t.size,
      t.initiative,
      t.isHidden ? 1 : 0,
      Date.now(),
    );
  }
}

// ---- Initiative turn order (operates on the active map) ----

export function setActiveTurn(sessionId: string, tokenId: string | null): void {
  db.prepare(
    'UPDATE sessions SET active_turn_token_id = ? WHERE id = ?',
  ).run(tokenId, sessionId);
}

/** Roll a d20 for every token on a map and clear the active turn marker. */
export function rollAllInitiative(mapId: string): void {
  const roll = db.prepare('UPDATE tokens SET initiative = ? WHERE id = ?');
  for (const t of listTokens(mapId)) {
    roll.run(Math.floor(Math.random() * 20) + 1, t.id);
  }
}

/** Tokens with initiative on a map, ordered for turn-taking (desc, ties stable). */
function initiativeOrder(mapId: string): Token[] {
  return listTokens(mapId)
    .filter((t) => t.initiative !== null)
    .sort((a, b) => (b.initiative ?? 0) - (a.initiative ?? 0));
}

/** Advance the active-turn marker to the next token in initiative order. */
export function advanceTurn(sessionId: string): void {
  const session = getSessionById(sessionId);
  if (!session?.activeMapId) return;
  const order = initiativeOrder(session.activeMapId);
  if (order.length === 0) {
    setActiveTurn(sessionId, null);
    return;
  }
  const idx = order.findIndex((t) => t.id === session.activeTurnTokenId);
  const next = order[(idx + 1) % order.length];
  setActiveTurn(sessionId, next.id);
}

export function clearInitiative(sessionId: string): void {
  const session = getSessionById(sessionId);
  if (session?.activeMapId) {
    db.prepare(
      'UPDATE tokens SET initiative = NULL WHERE map_id = ?',
    ).run(session.activeMapId);
  }
  setActiveTurn(sessionId, null);
}

// ---- Characters ----

export function listCharacters(sessionId: string): Character[] {
  const rows = db
    .prepare('SELECT * FROM characters WHERE session_id = ? ORDER BY name ASC')
    .all(sessionId) as Parameters<typeof rowToCharacter>[0][];
  return rows.map(rowToCharacter);
}

export function getCharacter(id: string): Character | null {
  const row = db.prepare('SELECT * FROM characters WHERE id = ?').get(id) as
    | Parameters<typeof rowToCharacter>[0]
    | undefined;
  return row ? rowToCharacter(row) : null;
}

export function claimCharacter(
  characterId: string,
  socketId: string,
): Character | null {
  db.prepare('UPDATE characters SET claimed_by = ? WHERE id = ?').run(
    socketId,
    characterId,
  );
  return getCharacter(characterId);
}

export function releaseClaims(socketId: string): void {
  db.prepare('UPDATE characters SET claimed_by = NULL WHERE claimed_by = ?').run(
    socketId,
  );
}

// ---- Monsters ----

export function listMonsters(sessionId: string): Monster[] {
  const rows = db
    .prepare('SELECT * FROM monsters WHERE session_id = ? ORDER BY name ASC')
    .all(sessionId) as Parameters<typeof rowToMonster>[0][];
  return rows.map(rowToMonster);
}

export function getMonster(id: string): Monster | null {
  const row = db.prepare('SELECT * FROM monsters WHERE id = ?').get(id) as
    | Parameters<typeof rowToMonster>[0]
    | undefined;
  return row ? rowToMonster(row) : null;
}

export type MonsterInput = {
  name: string;
  maxHp: number;
  count?: number;
  creatureType?: string;
  resistances?: string[];
  weaknesses?: string[];
  abilities?: Monster['abilities'];
  icon?: string;
  source?: Monster['source'];
};

function insertMonster(sessionId: string, opts: MonsterInput): Monster {
  const id = newId();
  const type = opts.creatureType ?? '';
  const icon = opts.icon || iconForCreature(opts.name, type);
  db.prepare(
    `INSERT INTO monsters
       (id, session_id, name, creature_type, max_hp, cur_hp,
        resistances, weaknesses, abilities, source, icon)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    sessionId,
    opts.name,
    type,
    opts.maxHp,
    opts.maxHp,
    JSON.stringify(opts.resistances ?? []),
    JSON.stringify(opts.weaknesses ?? []),
    JSON.stringify(opts.abilities ?? []),
    opts.source ?? 'manual',
    icon,
  );
  return getMonster(id)!;
}

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Highest existing suffix for a base name ("Goblin"=1, "Goblin 3"=3); 0 if none. */
function existingMaxNumber(sessionId: string, base: string): number {
  const rows = db
    .prepare('SELECT name FROM monsters WHERE session_id = ?')
    .all(sessionId) as { name: string }[];
  const re = new RegExp(`^${escapeRegex(base)}(?:\\s+(\\d+))?$`, 'i');
  let max = 0;
  let found = false;
  for (const r of rows) {
    const m = r.name.match(re);
    if (m) {
      found = true;
      const n = m[1] ? parseInt(m[1], 10) : 1;
      if (n > max) max = n;
    }
  }
  return found ? max : 0;
}

/**
 * Create one or more monsters. With count > 1 (or when the base name already
 * exists) they are auto-numbered "Goblin 1", "Goblin 2", … and each is an
 * independent record with its own HP/conditions.
 */
export function createMonsters(
  sessionId: string,
  opts: MonsterInput,
): Monster[] {
  const base = opts.name.trim() || 'Creature';
  const count = Math.max(1, Math.min(50, opts.count ?? 1));
  const existingMax = existingMaxNumber(sessionId, base);
  const created: Monster[] = [];
  for (let i = 0; i < count; i++) {
    const name =
      count === 1 && existingMax === 0 ? base : `${base} ${existingMax + 1 + i}`;
    created.push(insertMonster(sessionId, { ...opts, name }));
  }
  return created;
}

/** Duplicate an existing monster into a new independent creature. */
export function copyMonster(monsterId: string): Monster | null {
  const m = getMonster(monsterId);
  if (!m) return null;
  const base = m.name.replace(/\s+\d+$/, ''); // drop any trailing number
  return createMonsters(m.sessionId, {
    name: base,
    maxHp: m.maxHp,
    creatureType: m.creatureType,
    resistances: m.resistances,
    weaknesses: m.weaknesses,
    abilities: m.abilities,
    icon: m.icon,
    source: m.source,
    count: 1,
  })[0];
}

/** Set the token art for a character or monster. */
export function setEntityIcon(
  kind: TokenKind,
  refId: string,
  icon: string,
): void {
  const table = kind === 'pc' ? 'characters' : 'monsters';
  db.prepare(`UPDATE ${table} SET icon = ? WHERE id = ?`).run(icon, refId);
}

// ---- Shared HP / condition mutations across kinds ----

export function applyDamage(
  kind: TokenKind,
  refId: string,
  amount: number,
): Character | Monster | null {
  const table = kind === 'pc' ? 'characters' : 'monsters';
  const entity = kind === 'pc' ? getCharacter(refId) : getMonster(refId);
  if (!entity) return null;
  const next = Math.min(entity.maxHp, Math.max(0, entity.curHp - amount));
  db.prepare(`UPDATE ${table} SET cur_hp = ? WHERE id = ?`).run(next, refId);
  return kind === 'pc' ? getCharacter(refId) : getMonster(refId);
}

export function setCondition(
  kind: TokenKind,
  refId: string,
  condition: Condition,
): Character | Monster | null {
  const table = kind === 'pc' ? 'characters' : 'monsters';
  const entity = kind === 'pc' ? getCharacter(refId) : getMonster(refId);
  if (!entity) return null;
  const conditions = entity.conditions.filter(
    (c) => c.label.toLowerCase() !== condition.label.toLowerCase(),
  );
  conditions.push(condition);
  db.prepare(`UPDATE ${table} SET conditions = ? WHERE id = ?`).run(
    JSON.stringify(conditions),
    refId,
  );
  return kind === 'pc' ? getCharacter(refId) : getMonster(refId);
}

export function clearCondition(
  kind: TokenKind,
  refId: string,
  conditionId: string,
): Character | Monster | null {
  const table = kind === 'pc' ? 'characters' : 'monsters';
  const entity = kind === 'pc' ? getCharacter(refId) : getMonster(refId);
  if (!entity) return null;
  const conditions = entity.conditions.filter((c) => c.id !== conditionId);
  db.prepare(`UPDATE ${table} SET conditions = ? WHERE id = ?`).run(
    JSON.stringify(conditions),
    refId,
  );
  return kind === 'pc' ? getCharacter(refId) : getMonster(refId);
}
