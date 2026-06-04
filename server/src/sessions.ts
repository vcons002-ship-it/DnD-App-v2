import {
  db,
  newId,
  newSessionCode,
  rowToCharacter,
  rowToMap,
  rowToMonster,
  rowToToken,
} from './db.js';
import type {
  Character,
  Condition,
  MapState,
  Monster,
  Token,
  TokenKind,
} from '../../shared/types.js';

export type Session = {
  id: string;
  code: string;
  name: string;
  activeMapId: string | null;
};

type SessionRow = {
  id: string;
  code: string;
  name: string;
  active_map_id: string | null;
};

const rowToSession = (r: SessionRow): Session => ({
  id: r.id,
  code: r.code,
  name: r.name,
  activeMapId: r.active_map_id,
});

// ---- Sessions ----

export function createSession(name = 'New Campaign'): Session {
  const id = newId();
  let code = newSessionCode();
  // Avoid the (very unlikely) code collision.
  while (db.prepare('SELECT 1 FROM sessions WHERE code = ?').get(code)) {
    code = newSessionCode();
  }
  db.prepare(
    'INSERT INTO sessions (id, code, name, active_map_id, created_at) VALUES (?, ?, ?, NULL, ?)',
  ).run(id, code, name, Date.now());
  seedExampleCharacters(id);
  return { id, code, name, activeMapId: null };
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

export function createMonster(
  sessionId: string,
  opts: { name: string; maxHp: number; creatureType?: string },
): Monster {
  const id = newId();
  db.prepare(
    `INSERT INTO monsters (id, session_id, name, creature_type, max_hp, cur_hp)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(id, sessionId, opts.name, opts.creatureType ?? '', opts.maxHp, opts.maxHp);
  return getMonster(id)!;
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
