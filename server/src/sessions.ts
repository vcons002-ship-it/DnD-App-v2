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
import { impliedConditions } from '../../shared/conditionEffects.js';
import { getLibraryCharacter } from './library.js';
import { deriveClassResources } from './data/classTables.js';
import { abilityMod } from '../../shared/skills.js';
import {
  effectiveStats,
  initiativeExtra,
  sanitizeItems,
  sanitizeModifiers,
  sanitizeWeapons,
} from '../../shared/modifiers.js';
import { weaponsFromActions, actionsToSheetAbilities } from '../../shared/monsterAttacks.js';
import { isDamageType } from '../../shared/damage.js';
import type {
  Character,
  CombatRole,
  Condition,
  FogLayer,
  HpFxEvent,
  InventoryItem,
  LootContents,
  MapImage,
  MapState,
  Measurement,
  Monster,
  RollEntry,
  ChatMessage,
  Annotation,
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
  /** Combat round counter (0 = no combat running). */
  combatRound: number;
  /** When true, the DM's own rolls are hidden from players' roll logs. */
  hideDmRolls: boolean;
};

type SessionRow = {
  id: string;
  code: string;
  name: string;
  active_map_id: string | null;
  active_turn_token_id: string | null;
  combat_round: number | null;
  hide_dm_rolls: number | null;
};

const rowToSession = (r: SessionRow): Session => ({
  id: r.id,
  code: r.code,
  name: r.name,
  activeMapId: r.active_map_id,
  activeTurnTokenId: r.active_turn_token_id,
  combatRound: r.combat_round ?? 0,
  hideDmRolls: !!r.hide_dm_rolls,
});

// ---- Sessions ----

/** A rejected custom session code (already taken / too short) — mapped to 409. */
export class SessionCodeError extends Error {}

/** Normalize a human-typed code: uppercase, A–Z/0–9 only, max 12 chars. */
export function normalizeSessionCode(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
}

export function createSession(name = 'New Campaign', customCode?: string): Session {
  const id = newId();
  const taken = (c: string) => !!db.prepare('SELECT 1 FROM sessions WHERE code = ?').get(c);
  let code: string;
  if (customCode && customCode.trim()) {
    // A DM-chosen memorable code (e.g. "TAVERN") for a stable, shareable link.
    code = normalizeSessionCode(customCode);
    if (code.length < 3)
      throw new SessionCodeError('Code must be at least 3 letters or digits.');
    if (taken(code)) throw new SessionCodeError(`Code "${code}" is already in use.`);
  } else {
    code = newSessionCode();
    while (taken(code)) code = newSessionCode(); // avoid the (very unlikely) collision
  }
  const now = Date.now();
  db.prepare(
    `INSERT INTO sessions (id, code, name, active_map_id, created_at, last_played_at)
     VALUES (?, ?, ?, NULL, ?, ?)`,
  ).run(id, code, name, now, now);
  seedExampleCharacters(id);
  return { id, code, name, activeMapId: null, activeTurnTokenId: null, combatRound: 0, hideDmRolls: false };
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
  widthFt: number,
  opts: { offsetX?: number; offsetY?: number; locked?: boolean; hidden?: boolean } = {},
): void {
  const m = getMap(mapId);
  if (!m) return;
  db.prepare(
    `UPDATE maps SET grid_size_px = ?, feet_per_square = ?, width_ft = ?,
       grid_offset_x = ?, grid_offset_y = ?, grid_locked = ?, grid_hidden = ?
     WHERE id = ?`,
  ).run(
    gridSizePx,
    feetPerSquare,
    widthFt,
    opts.offsetX ?? m.gridOffsetX,
    opts.offsetY ?? m.gridOffsetY,
    opts.locked === undefined ? (m.gridLocked ? 1 : 0) : opts.locked ? 1 : 0,
    opts.hidden === undefined ? (m.gridHidden ? 1 : 0) : opts.hidden ? 1 : 0,
    mapId,
  );
}

/** Columns for each fog layer (enabled flag + revealed-cell set). */
const FOG_COLS: Record<FogLayer, { enabled: string; revealed: string }> = {
  map: { enabled: 'map_fog_enabled', revealed: 'map_fog_revealed' },
  tokens: { enabled: 'token_fog_enabled', revealed: 'token_fog_revealed' },
};

export function setFogLayer(
  mapId: string,
  layer: FogLayer,
  enabled: boolean,
): void {
  db.prepare(
    `UPDATE maps SET ${FOG_COLS[layer].enabled} = ? WHERE id = ?`,
  ).run(enabled ? 1 : 0, mapId);
}

/** Reveal or re-hide "col,row" cells on one fog layer of a map. */
export function paintFog(
  mapId: string,
  layer: FogLayer,
  cells: string[],
  reveal: boolean,
): void {
  const map = getMap(mapId);
  if (!map) return;
  const current =
    layer === 'map' ? map.mapFogRevealed : map.tokenFogRevealed;
  const set = new Set(current);
  for (const c of cells) {
    if (reveal) set.add(c);
    else set.delete(c);
  }
  db.prepare(
    `UPDATE maps SET ${FOG_COLS[layer].revealed} = ? WHERE id = ?`,
  ).run(JSON.stringify([...set]), mapId);
}

/** Re-cover the entire map on one fog layer (clear that layer's revealed cells). */
export function coverFog(mapId: string, layer: FogLayer): void {
  db.prepare(
    `UPDATE maps SET ${FOG_COLS[layer].revealed} = '[]' WHERE id = ?`,
  ).run(mapId);
}

/** Set a fog layer's revealed cells exactly (used by undo to restore a wipe). */
export function setFogRevealed(mapId: string, layer: FogLayer, cells: string[]): void {
  db.prepare(`UPDATE maps SET ${FOG_COLS[layer].revealed} = ? WHERE id = ?`).run(
    JSON.stringify(Array.isArray(cells) ? cells : []),
    mapId,
  );
}

/** Rename a map (DM). Empty names are ignored. */
export function renameMap(mapId: string, name: string): void {
  const trimmed = name.trim();
  if (!trimmed) return;
  db.prepare('UPDATE maps SET name = ? WHERE id = ?').run(trimmed, mapId);
}

/** Rename the session/campaign (DM). Empty names are ignored. */
export function renameSession(sessionId: string, name: string): void {
  const trimmed = name.trim();
  if (!trimmed) return;
  db.prepare('UPDATE sessions SET name = ? WHERE id = ?').run(trimmed, sessionId);
}

/**
 * Change a session's join code in place. All data is keyed by the session **id**
 * (not the code), so every map/token/character/log is preserved; only links to
 * the previous code stop working. Validates like a DM-chosen custom code.
 */
export function changeSessionCode(sessionId: string, rawCode: string): string {
  const code = normalizeSessionCode(rawCode);
  if (code.length < 3)
    throw new SessionCodeError('Code must be at least 3 letters or digits.');
  const taken = db
    .prepare('SELECT 1 FROM sessions WHERE code = ? AND id != ?')
    .get(code, sessionId);
  if (taken) throw new SessionCodeError(`Code "${code}" is already in use.`);
  db.prepare('UPDATE sessions SET code = ? WHERE id = ?').run(code, sessionId);
  return code;
}

/**
 * Delete a session and everything under it. Maps → tokens, characters, monsters,
 * measurements and the roll log all cascade via `ON DELETE CASCADE`
 * (`foreign_keys = ON`). Uploaded map images are left on disk (harmless orphans).
 */
export function deleteSession(sessionId: string): void {
  db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);
}

export function setActiveMap(sessionId: string, mapId: string): void {
  db.prepare('UPDATE sessions SET active_map_id = ? WHERE id = ?').run(
    mapId,
    sessionId,
  );
}

/**
 * Delete a map and everything anchored to it: its token placements and any
 * monster instances those tokens uniquely referenced (templates and instances
 * still placed elsewhere are kept). If the deleted map was active, promote the
 * next remaining map (or none) and clear a now-dangling turn marker.
 */
// Atomic: token cleanup → orphan-monster GC → map delete → active-map promotion
// all commit together, so a mid-way failure can't strand instances or leave a
// dangling active_map_id.
export const deleteMap = db.transaction((mapId: string): void => {
  const map = getMap(mapId);
  if (!map) return;
  const { sessionId } = map;

  const monsterRefs = new Set(
    listTokens(mapId)
      .filter((t) => t.kind === 'monster')
      .map((t) => t.refId),
  );
  db.prepare('DELETE FROM tokens WHERE map_id = ?').run(mapId);

  // Drop monster instances no token references anymore (skip templates).
  const stillReferenced = db.prepare(
    'SELECT COUNT(*) AS c FROM tokens WHERE kind = ? AND ref_id = ?',
  );
  const dropInstance = db.prepare(
    'DELETE FROM monsters WHERE id = ? AND is_template = 0',
  );
  for (const refId of monsterRefs) {
    const { c } = stillReferenced.get('monster', refId) as { c: number };
    if (c === 0) dropInstance.run(refId);
  }

  db.prepare('DELETE FROM map_images WHERE map_id = ?').run(mapId);
  db.prepare('DELETE FROM maps WHERE id = ?').run(mapId);

  // Promote a replacement active map and clear the stale turn marker.
  const session = getSessionById(sessionId);
  if (session?.activeMapId === mapId) {
    const next = listMaps(sessionId)[0]?.id ?? null;
    db.prepare('UPDATE sessions SET active_map_id = ? WHERE id = ?').run(
      next,
      sessionId,
    );
    setActiveTurn(sessionId, null);
  }
});

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
  shape?: Token['shape'];
}): Token {
  const id = newId();
  // Objects read better as non-circles: chests/doors square, traps triangular.
  const objectKind =
    opts.kind === 'monster' ? getMonster(opts.refId)?.objectKind : undefined;
  const shape: Token['shape'] =
    opts.shape ??
    (objectKind === 'trap'
      ? 'triangle'
      : objectKind === 'chest' || objectKind === 'door'
        ? 'square'
        : 'circle');
  db.prepare(
    `INSERT INTO tokens (id, map_id, kind, ref_id, x, y, size, width_ft, initiative, is_hidden, shape, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 1, 5, NULL, ?, ?, ?)`,
  ).run(
    id,
    opts.mapId,
    opts.kind,
    opts.refId,
    opts.x,
    opts.y,
    opts.isHidden ? 1 : 0,
    shape,
    Date.now(),
  );
  return getToken(id)!;
}

/** Create a pasted-image OBJECT (a non-combat 'other' object) and place its
 *  token (shape 'image', unclipped art) at (x,y). Returns the token. */
export function createPastedObject(
  sessionId: string,
  mapId: string,
  x: number,
  y: number,
  icon: string,
  name = 'Object',
): Token {
  const m = insertMonster(
    sessionId,
    { name, maxHp: 1, icon, objectKind: 'other', disposition: 'neutral', source: 'manual' },
    { isTemplate: false, templateId: null, name },
  );
  return createToken({ mapId, kind: 'monster', refId: m.id, x, y, shape: 'image' });
}

/**
 * Spawn a lightweight summon/companion: a FRIENDLY creature token (Mage Hand, a
 * conjured beast, …) with a name + icon and a minimal stat block. It's a real
 * `monster` with `disposition:'friendly'`, so the existing token:move gate lets
 * any player drag it, players see it under token fog, and it never auto-rolls
 * initiative concerns beyond a normal creature. NOT an object (so it's movable).
 */
export function createSummon(
  sessionId: string,
  mapId: string,
  x: number,
  y: number,
  name: string,
  icon: string,
): Token {
  const m = insertMonster(
    sessionId,
    { name, maxHp: 1, icon, disposition: 'friendly', source: 'manual' },
    { isTemplate: false, templateId: null, name },
  );
  return createToken({ mapId, kind: 'monster', refId: m.id, x, y });
}

/** Set a token's silhouette (DM). */
export function setTokenShape(tokenId: string, shape: Token['shape']): Token | null {
  db.prepare('UPDATE tokens SET shape = ? WHERE id = ?').run(shape, tokenId);
  return getToken(tokenId);
}

export function moveToken(tokenId: string, x: number, y: number): Token | null {
  // Never trust client coordinates: reject NaN/Infinity and clamp to a sane
  // canvas range so a buggy/forged payload can't park a token at ±1e9 (which
  // would break the map view for everyone) or bind a non-finite value.
  const clamp = (n: number) => Math.max(-100_000, Math.min(100_000, Number.isFinite(n) ? n : 0));
  db.prepare('UPDATE tokens SET x = ?, y = ? WHERE id = ?').run(clamp(x), clamp(y), tokenId);
  return getToken(tokenId);
}

/** Resize a token by its real footprint WIDTH IN FEET (min 2.5ft = Tiny). The
 *  legacy square `size` is kept in sync (widthFt / 5) for back-compat. */
export function resizeToken(tokenId: string, widthFt: number): Token | null {
  // Snap to half-foot steps; 0.5 ft minimum allows small objects, 120 ft caps
  // gargantuan set pieces. The legacy grid-square `size` stays in sync.
  if (!Number.isFinite(widthFt)) return getToken(tokenId);
  const w = Math.min(120, Math.max(0.5, Math.round(widthFt * 2) / 2));
  db.prepare('UPDATE tokens SET width_ft = ?, size = ? WHERE id = ?').run(
    w,
    w / 5,
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
  // Deleting the token whose TURN it is: tick the marker to the next living
  // combatant first (so its position isn't lost). If that crossing wraps the
  // order, the round advances — it would have when this turn ended anyway.
  const token = getToken(tokenId);
  const sessionId = token ? getMap(token.mapId)?.sessionId : undefined;
  if (token && sessionId) {
    const session = getSessionById(sessionId);
    if (session?.activeTurnTokenId === tokenId) {
      advanceTurn(sessionId);
      // Still pointing here → it was the only living combatant.
      if (getSessionById(sessionId)?.activeTurnTokenId === tokenId) {
        setActiveTurn(sessionId, null);
      }
    }
  }
  db.prepare('DELETE FROM tokens WHERE id = ?').run(tokenId);
}

export function setTokenHidden(tokenId: string, hidden: boolean): Token | null {
  db.prepare('UPDATE tokens SET is_hidden = ? WHERE id = ?').run(
    hidden ? 1 : 0,
    tokenId,
  );
  return getToken(tokenId);
}

/** Hide/show the combat-role badge across one or more tokens (DM). */
export function setTokensHideCombatRole(
  tokenIds: string[],
  hide: boolean,
): void {
  const stmt = db.prepare(
    'UPDATE tokens SET hide_combat_role = ? WHERE id = ?',
  );
  // One transaction instead of a WAL commit per token (bulk Data-view edits).
  db.transaction(() => {
    for (const id of tokenIds) stmt.run(hide ? 1 : 0, id);
  })();
}

/** Override (role) or clear (null → auto-derive) the combat role across tokens. */
export function setTokensCombatRole(
  tokenIds: string[],
  role: Token['combatRoleOverride'],
): void {
  const stmt = db.prepare(
    'UPDATE tokens SET combat_role_override = ? WHERE id = ?',
  );
  db.transaction(() => {
    for (const id of tokenIds) stmt.run(role, id);
  })();
}

/** Record the combat role of a creature's most recent attack so the token
 *  badge follows the weapon last used (PC or monster, by ref id). */
export function setLastAttackRole(
  kind: Token['kind'],
  refId: string,
  role: CombatRole,
): void {
  const table = kind === 'pc' ? 'characters' : 'monsters';
  db.prepare(`UPDATE ${table} SET last_attack_role = ? WHERE id = ?`).run(
    role,
    refId,
  );
}

/** Set the shared party notes on a creature/NPC (DM- and player-writable). */
export function setMonsterPlayerNotes(
  monsterId: string,
  notes: string,
): Monster | null {
  db.prepare('UPDATE monsters SET player_notes = ? WHERE id = ?').run(
    String(notes ?? '').slice(0, 4000),
    monsterId,
  );
  return getMonster(monsterId);
}

/** Write a character's death-save tallies (each clamped 0–3). */
export function setDeathSaves(
  characterId: string,
  successes: number,
  failures: number,
): Character | null {
  const clamp = (n: number) => Math.max(0, Math.min(3, Math.round(n)));
  db.prepare(
    'UPDATE characters SET death_successes = ?, death_failures = ? WHERE id = ?',
  ).run(clamp(successes), clamp(failures), characterId);
  return getCharacter(characterId);
}

/** Damage (+) / heal (−) every listed token's creature (AOE). */
export function damageTokens(tokenIds: string[], amount: number): void {
  db.transaction(() => {
    for (const id of tokenIds) {
      const t = getToken(id);
      if (t) applyDamage(t.kind, t.refId, amount);
    }
  })();
}

/** Hide/show every listed token from players. */
export function setTokensHidden(tokenIds: string[], hidden: boolean): void {
  const stmt = db.prepare('UPDATE tokens SET is_hidden = ? WHERE id = ?');
  db.transaction(() => {
    for (const id of tokenIds) stmt.run(hidden ? 1 : 0, id);
  })();
}

/** Apply one condition to every listed token's creature (own id per creature). */
export function setTokensCondition(
  tokenIds: string[],
  condition: Omit<Condition, 'id'>,
): void {
  db.transaction(() => {
    for (const id of tokenIds) {
      const t = getToken(id);
      if (t) setCondition(t.kind, t.refId, { id: newId(), ...condition });
    }
  })();
}

/** Clear ALL conditions from every listed token's creature. */
export function clearTokensConditions(tokenIds: string[]): void {
  db.transaction(() => {
    for (const id of tokenIds) {
      const t = getToken(id);
      if (!t) continue;
      const table = t.kind === 'pc' ? 'characters' : 'monsters';
      db.prepare(`UPDATE ${table} SET conditions = '[]' WHERE id = ?`).run(
        t.refId,
      );
    }
  })();
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
): number {
  const existing = new Set(
    listTokens(toMapId).map((t) => `${t.kind}:${t.refId}`),
  );
  const insert = db.prepare(
    `INSERT INTO tokens (id, map_id, kind, ref_id, x, y, size, initiative, is_hidden, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  let copied = 0;
  db.transaction(() => {
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
      copied++;
    }
  })();
  return copied;
}

/**
 * Generic row clone: copies a row (all columns, including migrated ones) under a
 * fresh id, applying `overrides`. Used to import content between sessions.
 */
function cloneRow(
  table: string,
  srcId: string,
  overrides: Record<string, unknown>,
): string {
  const cols = (
    db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]
  ).map((c) => c.name);
  const row = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(srcId) as
    | Record<string, unknown>
    | undefined;
  if (!row) throw new Error(`cloneRow: ${table} ${srcId} not found`);
  const out: Record<string, unknown> = { ...row, ...overrides };
  out.id = (overrides.id as string) ?? newId();
  db.prepare(
    `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${cols
      .map(() => '?')
      .join(', ')})`,
  ).run(...cols.map((c) => out[c]));
  return out.id as string;
}

/** A source session's maps with token counts, for the import picker. */
export function listMapsForImport(
  sourceCode: string,
): { id: string; name: string; tokenCount: number }[] {
  const source = getSessionByCode(sourceCode);
  if (!source) return [];
  return listMaps(source.id).map((m) => ({
    id: m.id,
    name: m.name,
    tokenCount: listTokens(m.id).length,
  }));
}

/**
 * Import selected maps from another session (by code) into `targetSessionId`,
 * deep-copying each map plus its tokens and the monsters/characters those tokens
 * reference (fresh ids; monster template links and player claims are dropped so
 * the copies are independent). Uploaded images are shared by path (the uploads
 * folder is global). Returns the number of maps imported.
 */
export type ImportMapsOptions = {
  /** Per-source-character-id choice: reuse existing / overwrite it / make new. */
  resolutions?: Record<string, 'reuse' | 'overwrite' | 'new'>;
  /** Returns true if a claim is held by a still-connected player (never clobber). */
  isClaimActive?: (claimedBy: string | null) => boolean;
};

/** First character in `sessionId` whose name matches (case-insensitive), or null. */
function findCharacterIdByName(
  sessionId: string,
  name: string,
): { id: string; claimedBy: string | null } | null {
  const row = db
    .prepare(
      'SELECT id, claimed_by FROM characters WHERE session_id = ? AND LOWER(name) = ? LIMIT 1',
    )
    .get(sessionId, name.trim().toLowerCase()) as
    | { id: string; claimed_by: string | null }
    | undefined;
  return row ? { id: row.id, claimedBy: row.claimed_by } : null;
}

/** Copy every stat column from one character row onto another (keeps the target's
 *  id, session, and claim) — used by an "overwrite" import resolution. */
function overwriteCharacterFrom(targetId: string, sourceId: string): void {
  const cols = (
    db.prepare('PRAGMA table_info(characters)').all() as { name: string }[]
  )
    .map((c) => c.name)
    .filter((c) => !['id', 'session_id', 'claimed_by'].includes(c));
  const src = db
    .prepare('SELECT * FROM characters WHERE id = ?')
    .get(sourceId) as Record<string, unknown> | undefined;
  if (!src) return;
  db.prepare(
    `UPDATE characters SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`,
  ).run(...cols.map((c) => src[c]), targetId);
}

export const importMaps = db.transaction(
  (
    targetSessionId: string,
    sourceCode: string,
    mapIds: string[],
    opts: ImportMapsOptions = {},
  ): number => {
    const source = getSessionByCode(sourceCode);
    if (!source || source.id === targetSessionId) return 0;
    const resolutions = opts.resolutions ?? {};
    const isClaimActive = opts.isClaimActive ?? (() => false);
    const sourceMapIds = new Set(listMaps(source.id).map((m) => m.id));
    const now = Date.now();
    const refCache = new Map<string, string>(); // `${kind}:${oldRef}` -> newRef
    const cloneRef = (kind: TokenKind, oldRef: string): string => {
      const key = `${kind}:${oldRef}`;
      const hit = refCache.get(key);
      if (hit) return hit;
      let newRef: string;
      if (kind === 'monster') {
        // Monsters import as fresh, independent instances (never deduped).
        newRef = cloneRow('monsters', oldRef, {
          session_id: targetSessionId,
          template_id: null,
          is_template: 0,
        });
      } else {
        newRef = resolveCharacterRef(oldRef);
      }
      refCache.set(key, newRef);
      return newRef;
    };
    // Resolve a referenced PC per the DM's choice (default: make a new copy).
    const resolveCharacterRef = (oldRef: string): string => {
      const fresh = () =>
        cloneRow('characters', oldRef, {
          session_id: targetSessionId,
          claimed_by: null,
        });
      const choice = resolutions[oldRef] ?? 'new';
      if (choice === 'new') return fresh();
      const src = getCharacter(oldRef);
      const existing = src && findCharacterIdByName(targetSessionId, src.name);
      if (!existing) return fresh(); // nothing to reuse/overwrite → new copy
      if (choice === 'overwrite' && !isClaimActive(existing.claimedBy)) {
        overwriteCharacterFrom(existing.id, oldRef);
      }
      // reuse (or overwrite that fell back) → link tokens to the existing PC.
      return existing.id;
    };
    const insertTok = db.prepare(
      `INSERT INTO tokens (id, map_id, kind, ref_id, x, y, size, initiative, is_hidden, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    let imported = 0;
    for (const mapId of mapIds) {
      if (!sourceMapIds.has(mapId)) continue;
      const newMapId = cloneRow('maps', mapId, {
        session_id: targetSessionId,
        created_at: now,
      });
      for (const t of listTokens(mapId)) {
        const newRef = cloneRef(t.kind, t.refId);
        insertTok.run(
          newId(),
          newMapId,
          t.kind,
          newRef,
          t.x,
          t.y,
          t.size,
          t.initiative ?? null,
          t.isHidden ? 1 : 0,
          now,
        );
      }
      imported++;
    }
    return imported;
  },
);

/**
 * For the import dialog: the distinct CHARACTERS referenced by tokens on the
 * picked source maps, flagged when a same-named character already exists in the
 * target session (so the DM can choose reuse / overwrite / new per name).
 */
export function previewImportCharacters(
  targetSessionId: string,
  sourceCode: string,
  mapIds: string[],
): { sourceId: string; name: string; exists: boolean }[] {
  const source = getSessionByCode(sourceCode);
  if (!source || source.id === targetSessionId) return [];
  const sourceMapIds = new Set(listMaps(source.id).map((m) => m.id));
  const seen = new Set<string>();
  const out: { sourceId: string; name: string; exists: boolean }[] = [];
  for (const mapId of mapIds) {
    if (!sourceMapIds.has(mapId)) continue;
    for (const t of listTokens(mapId)) {
      if (t.kind !== 'pc' || seen.has(t.refId)) continue;
      seen.add(t.refId);
      const c = getCharacter(t.refId);
      if (!c) continue;
      out.push({
        sourceId: c.id,
        name: c.name,
        exists: !!findCharacterIdByName(targetSessionId, c.name),
      });
    }
  }
  return out;
}

/**
 * Duplicate a single placed token into a second, independently-tracked copy
 * dropped one grid square down-right. For a monster the referenced instance is
 * cloned with its CURRENT state (HP + conditions) into a fresh instance that
 * takes the next sequential name (Goblin 1 -> Goblin 3), so the two are
 * "identical but uniquely tracked". PC tokens just re-place the same character.
 */
// Atomic: insert the copied monster instance, stamp its HP/conditions, and
// create its token as one unit.
export const duplicateToken = db.transaction((tokenId: string): Token | null => {
  const token = getToken(tokenId);
  if (!token) return null;
  const map = getMap(token.mapId);
  const off = map?.gridSizePx ?? 50;
  const x = token.x + off;
  const y = token.y + off;

  let refId = token.refId;
  if (token.kind === 'monster') {
    const src = getMonster(token.refId);
    if (!src) return null;
    const { template_id } = (db
      .prepare('SELECT template_id FROM monsters WHERE id = ?')
      .get(token.refId) as { template_id: string | null } | undefined) ?? {
      template_id: null,
    };
    // Next sequential name from the template (matches instantiateMonster), or a
    // "(copy)" suffix when the instance has no template to count against.
    let name = `${src.name} (copy)`;
    if (template_id) {
      const tmpl = getMonster(template_id);
      const n =
        (db
          .prepare('SELECT COUNT(*) AS c FROM monsters WHERE template_id = ?')
          .get(template_id) as { c: number }).c + 1;
      name = `${tmpl?.name ?? src.name} ${n}`;
    }
    // Full-fidelity clone (fixes duplicated objects losing loot/objectKind and
    // spellcaster instances losing their sheet abilities + save proficiencies).
    const inst = insertMonster(src.sessionId, toMonsterInput(src), {
      isTemplate: false,
      templateId: template_id,
      name,
    });
    // Carry the source instance's current HP + conditions onto the copy.
    db.prepare('UPDATE monsters SET cur_hp = ?, conditions = ? WHERE id = ?').run(
      src.curHp,
      JSON.stringify(src.conditions),
      inst.id,
    );
    refId = inst.id;
  }

  const copy = createToken({
    mapId: token.mapId,
    kind: token.kind,
    refId,
    x,
    y,
    isHidden: token.isHidden,
  });
  if (token.widthFt !== 5) resizeToken(copy.id, token.widthFt);
  return getToken(copy.id);
});

// ---- Initiative turn order (operates on the active map) ----

export function setActiveTurn(sessionId: string, tokenId: string | null): void {
  db.prepare(
    'UPDATE sessions SET active_turn_token_id = ? WHERE id = ?',
  ).run(tokenId, sessionId);
}

/** A token's initiative bonus = its creature's effective DEX modifier (incl.
 *  feat/equipped-item mods) plus any flat initiative modifiers. 0 if unknown. */
function initiativeBonus(token: Token): number {
  const entity =
    token.kind === 'pc' ? getCharacter(token.refId) : getMonster(token.refId);
  if (!entity) return 0;
  return (
    abilityMod(effectiveStats(entity).scores.DEX) + initiativeExtra(entity).total
  );
}

/** Objects (chests/doors/traps/items) never take turns — they don't roll
 *  initiative and are skipped by the turn order. */
function isObjectToken(token: Token): boolean {
  return token.kind === 'monster' && !!getMonster(token.refId)?.objectKind;
}

/** A DEAD combatant keeps its slot in the initiative order (so the order stays
 *  intact for everyone else) but is skipped when its turn comes around:
 *  monsters at 0 HP or marked "Dead"; PCs only when actually dead (3 failed
 *  death saves or the Dead mark) — a downed PC still takes its turn to roll
 *  death saves. */
function isDeadToken(token: Token): boolean {
  const marked = (conds: Condition[]) =>
    conds.some((c) => c.label.toLowerCase() === 'dead');
  if (token.kind === 'pc') {
    const c = getCharacter(token.refId);
    return !!c && (c.deathSaves.failures >= 3 || marked(c.conditions));
  }
  const m = getMonster(token.refId);
  return !!m && (m.curHp <= 0 || marked(m.conditions));
}

/** A d20 + DEX modifier for a token (5e initiative). */
const rollInitiative = (token: Token): number =>
  Math.floor(Math.random() * 20) + 1 + initiativeBonus(token);

/** Roll initiative (d20 + DEX) for every COMBATANT on a map (resets the round).
 *  Objects are skipped — and any stray roll an object had (old saves) is cleared. */
export function rollAllInitiative(mapId: string): void {
  const roll = db.prepare('UPDATE tokens SET initiative = ? WHERE id = ?');
  db.transaction(() => {
    for (const t of listTokens(mapId)) {
      roll.run(isObjectToken(t) ? null : rollInitiative(t), t.id);
    }
  })();
}

/** Roll only for combatants that haven't rolled yet (latecomers to combat). */
export function rollMissingInitiative(mapId: string): void {
  const roll = db.prepare('UPDATE tokens SET initiative = ? WHERE id = ?');
  db.transaction(() => {
    for (const t of listTokens(mapId)) {
      if (t.initiative === null && !isObjectToken(t)) roll.run(rollInitiative(t), t.id);
    }
  })();
}

/** Toggle whether the DM's own rolls are hidden from players' logs. */
export function setHideDmRolls(sessionId: string, hide: boolean): void {
  db.prepare('UPDATE sessions SET hide_dm_rolls = ? WHERE id = ?').run(
    hide ? 1 : 0,
    sessionId,
  );
}

/** Set the session's combat-round counter (0 = no combat running). */
export function setCombatRound(sessionId: string, round: number): void {
  db.prepare('UPDATE sessions SET combat_round = ? WHERE id = ?').run(
    Math.max(0, Math.round(round)),
    sessionId,
  );
}

/** Tokens with initiative on a map, ordered for turn-taking (desc, ties stable).
 *  Objects are excluded defensively (an old save may have rolled one). */
function initiativeOrder(mapId: string): Token[] {
  return listTokens(mapId)
    .filter((t) => t.initiative !== null && !isObjectToken(t))
    .sort((a, b) => (b.initiative ?? 0) - (a.initiative ?? 0));
}

/** The token at the top of the initiative order, or null. */
export function firstInInitiative(mapId: string): string | null {
  return initiativeOrder(mapId)[0]?.id ?? null;
}

/** Advance the active-turn marker to the next LIVING token in initiative
 *  order. Dead combatants keep their slot but are walked past; crossing the
 *  top of the order — including while skipping the dead — starts a new round
 *  (counter +1). Latecomers who roll in mid-round just slot into the order
 *  without touching the counter, so "Add rolls" never resets or skips a
 *  round. An orphaned marker (the current token vanished without going
 *  through deleteToken) restarts at the top of the SAME round. With no living
 *  combatant left the marker clears (combat is effectively over). */
export function advanceTurn(sessionId: string): void {
  const session = getSessionById(sessionId);
  if (!session?.activeMapId) return;
  const order = initiativeOrder(session.activeMapId);
  if (order.length === 0) {
    setActiveTurn(sessionId, null);
    return;
  }
  const idx = order.findIndex((t) => t.id === session.activeTurnTokenId);
  let wrapped = false;
  let i = idx;
  for (let step = 0; step < order.length; step++) {
    i += 1;
    if (i >= order.length) {
      i = 0;
      // Reaching the top FROM a real position is a wrap; an orphaned marker
      // (idx === -1) walks 0..n-1 without ever passing the end.
      wrapped = true;
    }
    if (!isDeadToken(order[i])) {
      if (wrapped) setCombatRound(sessionId, Math.max(1, session.combatRound) + 1);
      setActiveTurn(sessionId, order[i].id);
      return;
    }
  }
  // Everyone in the order is dead — no turn to give.
  setActiveTurn(sessionId, null);
}

export function clearInitiative(sessionId: string): void {
  const session = getSessionById(sessionId);
  if (session?.activeMapId) {
    db.prepare(
      'UPDATE tokens SET initiative = NULL WHERE map_id = ?',
    ).run(session.activeMapId);
  }
  setActiveTurn(sessionId, null);
  setCombatRound(sessionId, 0);
}

// ---- Shared dice roll log ----

export function addRollLog(
  sessionId: string,
  entry: {
    roller: string;
    label: string;
    expr: string;
    total: number;
    detail: string;
    /** Optional long text (e.g. a cast spell's full description). */
    description?: string;
    /** Optional "Apply damage" payload (save/damage spell → click-to-target saves). */
    apply?: RollEntry['apply'];
    /** HP accounting note ("Druk HP 42→38") + its target for visibility. */
    hpNote?: RollEntry['hpNote'];
    /** Cosmetic attack-roll reveal payload (the brief d20 animation). */
    reveal?: RollEntry['reveal'];
    /** Enemy/neutral creature roll → players see no modifier breakdown. */
    hideMods?: boolean;
  },
): RollEntry {
  const id = newId();
  const createdAt = Date.now();
  // Hide-DM-rolls: a DM-rolled entry is flagged dmOnly while the session toggle
  // is on, so player snapshots can drop it (damage still applied separately).
  const dmOnly =
    entry.roller === 'DM' && !!getSessionById(sessionId)?.hideDmRolls;
  db.prepare(
    `INSERT INTO roll_log (id, session_id, roller, label, expr, total, detail, description, apply, hp_note, reveal, hide_mods, dm_only, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    sessionId,
    entry.roller,
    entry.label,
    entry.expr,
    entry.total,
    entry.detail,
    entry.description ?? '',
    entry.apply ? JSON.stringify(entry.apply) : '',
    entry.hpNote ? JSON.stringify(entry.hpNote) : '',
    entry.reveal ? JSON.stringify(entry.reveal) : '',
    entry.hideMods ? 1 : 0,
    dmOnly ? 1 : 0,
    createdAt,
  );
  pruneRollLog(sessionId);
  return {
    id,
    ...entry,
    createdAt,
    ...(dmOnly ? { dmOnly: true } : {}),
    ...(entry.hideMods ? { hideMods: true } : {}),
  };
}

/** Keep the newest N rolls per session so long campaigns don't grow the DB forever. */
export const ROLL_LOG_CAP = 500;
function pruneRollLog(sessionId: string): void {
  db.prepare(
    `DELETE FROM roll_log WHERE session_id = ? AND id NOT IN (
       SELECT id FROM roll_log WHERE session_id = ?
       ORDER BY created_at DESC, rowid DESC LIMIT ?
     )`,
  ).run(sessionId, sessionId, ROLL_LOG_CAP);
}

/** Wipe the shared roll log for a session. */
export function clearRollLog(sessionId: string): void {
  db.prepare('DELETE FROM roll_log WHERE session_id = ?').run(sessionId);
}

/** Append a chat message and return it. */
export function addChatMessage(
  sessionId: string,
  sender: string,
  role: ChatMessage['role'],
  text: string,
  dmOnly = false,
  pages: number[] = [],
): ChatMessage {
  const msg: ChatMessage = {
    id: newId(),
    sender,
    role,
    text: text.slice(0, 4000),
    createdAt: Date.now(),
    ...(dmOnly ? { dmOnly: true } : {}),
    ...(pages.length ? { pages } : {}),
  };
  db.prepare(
    'INSERT INTO chat_messages (id, session_id, sender, role, text, created_at, dm_only, pages) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
  ).run(msg.id, sessionId, msg.sender, msg.role, msg.text, msg.createdAt, dmOnly ? 1 : 0, JSON.stringify(pages));
  pruneChat(sessionId);
  return msg;
}

/** Keep the chat table bounded (only the most recent are ever read/shipped);
 *  mirrors the roll-log cap so a long campaign can't grow the table forever. */
export const CHAT_CAP = 1000;
function pruneChat(sessionId: string): void {
  db.prepare(
    `DELETE FROM chat_messages WHERE session_id = ? AND id NOT IN (
       SELECT id FROM chat_messages WHERE session_id = ?
       ORDER BY created_at DESC, rowid DESC LIMIT ?
     )`,
  ).run(sessionId, sessionId, CHAT_CAP);
}

/** Parse a stored pages JSON array defensively (old rows have '[]'). */
function safeParsePages(raw: string): number[] {
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((n) => typeof n === 'number') : [];
  } catch {
    return [];
  }
}

/** Most-recent chat messages, oldest-first for display (capped). */
export function listChat(sessionId: string, limit = 100): ChatMessage[] {
  const rows = db
    .prepare(
      'SELECT id, sender, role, text, created_at, dm_only, pages FROM chat_messages WHERE session_id = ? ORDER BY created_at DESC, rowid DESC LIMIT ?',
    )
    .all(sessionId, limit) as {
    id: string;
    sender: string;
    role: ChatMessage['role'];
    text: string;
    created_at: number;
    dm_only: number;
    pages: string;
  }[];
  return rows
    .map((r) => {
      const pages = safeParsePages(r.pages);
      return {
        id: r.id,
        sender: r.sender,
        role: r.role,
        text: r.text,
        createdAt: r.created_at,
        ...(r.dm_only ? { dmOnly: true } : {}),
        ...(pages.length ? { pages } : {}),
      };
    })
    .reverse();
}

/** Most-recent rolls, returned oldest-first for display (capped). */
export function listRollLog(sessionId: string, limit = 30): RollEntry[] {
  const rows = db
    .prepare(
      // rowid disambiguates rolls made within the same millisecond.
      'SELECT * FROM roll_log WHERE session_id = ? ORDER BY created_at DESC, rowid DESC LIMIT ?',
    )
    .all(sessionId, limit) as RollLogRow[];
  return rows.map(rowToRollEntry).reverse();
}

type RollLogRow = {
  id: string;
  roller: string;
  label: string;
  expr: string;
  total: number;
  detail: string;
  description: string | null;
  apply: string | null;
  hp_note: string | null;
  reveal: string | null;
  hide_mods: number | null;
  dm_only: number | null;
  created_at: number;
};

/** Stored as JSON; a legacy plain-text note (no target) parses to undefined so
 *  it can never leak an enemy's HP to players. */
function parseHpNote(raw: string): RollEntry['hpNote'] {
  try {
    const v = JSON.parse(raw);
    if (v && typeof v.text === 'string' && typeof v.refId === 'string') return v;
  } catch {
    /* legacy plain text */
  }
  return undefined;
}

function rowToRollEntry(r: RollLogRow): RollEntry {
  return {
    id: r.id,
    roller: r.roller,
    label: r.label,
    expr: r.expr,
    total: r.total,
    detail: r.detail,
    ...(r.description ? { description: r.description } : {}),
    ...(r.apply ? { apply: JSON.parse(r.apply) as RollEntry['apply'] } : {}),
    ...(r.hp_note ? { hpNote: parseHpNote(r.hp_note) } : {}),
    ...(r.reveal ? { reveal: JSON.parse(r.reveal) as RollEntry['reveal'] } : {}),
    ...(r.hide_mods ? { hideMods: true } : {}),
    ...(r.dm_only ? { dmOnly: true } : {}),
    createdAt: r.created_at,
  };
}

/** A single roll-log entry by id (for "Apply damage" save resolution). */
export function getRollEntry(id: string): RollEntry | null {
  const r = db.prepare('SELECT * FROM roll_log WHERE id = ?').get(id) as
    | RollLogRow
    | undefined;
  return r ? rowToRollEntry(r) : null;
}

// ---- Measuring shapes (cone/circle/line) ----

type MeasurementRow = {
  id: string;
  map_id: string;
  kind: string;
  origin_x: number;
  origin_y: number;
  target_x: number;
  target_y: number;
  token_id: string | null;
  created_by: string;
};

const rowToMeasurement = (r: MeasurementRow): Measurement => ({
  id: r.id,
  mapId: r.map_id,
  kind: r.kind as Measurement['kind'],
  origin: { x: r.origin_x, y: r.origin_y },
  target: { x: r.target_x, y: r.target_y },
  ...(r.token_id ? { tokenId: r.token_id } : {}),
  createdBy: r.created_by,
});

export function addMeasurement(
  sessionId: string,
  input: {
    mapId: string;
    kind: Measurement['kind'];
    origin: { x: number; y: number };
    target: { x: number; y: number };
    tokenId?: string;
    createdBy: string;
  },
): Measurement {
  const id = newId();
  db.prepare(
    `INSERT INTO measurements
       (id, session_id, map_id, kind, origin_x, origin_y, target_x, target_y,
        token_id, created_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    sessionId,
    input.mapId,
    input.kind,
    input.origin.x,
    input.origin.y,
    input.target.x,
    input.target.y,
    input.tokenId ?? null,
    input.createdBy,
    Date.now(),
  );
  return rowToMeasurement(
    db.prepare('SELECT * FROM measurements WHERE id = ?').get(id) as MeasurementRow,
  );
}

export function listMeasurements(mapId: string): Measurement[] {
  return (
    db
      .prepare('SELECT * FROM measurements WHERE map_id = ? ORDER BY created_at ASC')
      .all(mapId) as MeasurementRow[]
  ).map(rowToMeasurement);
}

/** Remove one measurement; when `requireCreatedBy` is set, only its creator's. */
export function removeMeasurement(id: string, requireCreatedBy?: string): void {
  if (requireCreatedBy !== undefined) {
    db.prepare('DELETE FROM measurements WHERE id = ? AND created_by = ?').run(
      id,
      requireCreatedBy,
    );
  } else {
    db.prepare('DELETE FROM measurements WHERE id = ?').run(id);
  }
}

/** Clear a map's measurements — all of them, or only one drawer's (`createdBy`). */
export function clearMeasurements(mapId: string, createdBy?: string): void {
  if (createdBy !== undefined) {
    db.prepare('DELETE FROM measurements WHERE map_id = ? AND created_by = ?').run(
      mapId,
      createdBy,
    );
  } else {
    db.prepare('DELETE FROM measurements WHERE map_id = ?').run(mapId);
  }
}

// ---- Map annotations (freehand strokes + text labels) ----

type AnnotationRow = {
  id: string;
  map_id: string;
  kind: string;
  points: string;
  x: number;
  y: number;
  text: string;
  color: string;
  url: string | null;
  width: number | null;
  height: number | null;
  popup: string | null;
  created_by: string;
};

const parsePopup = (raw: string | null): Annotation['popup'] => {
  if (!raw) return undefined;
  try {
    const p = JSON.parse(raw) as Annotation['popup'];
    return p && Array.isArray(p.items) ? p : undefined;
  } catch {
    return undefined;
  }
};

const rowToAnnotation = (r: AnnotationRow): Annotation => {
  const popup = parsePopup(r.popup);
  return {
    id: r.id,
    mapId: r.map_id,
    kind: r.kind as Annotation['kind'],
    points: JSON.parse(r.points || '[]') as number[],
    x: r.x,
    y: r.y,
    text: r.text,
    color: r.color,
    ...(r.url ? { url: r.url, width: r.width ?? 0, height: r.height ?? 0 } : {}),
    ...(popup ? { popup } : {}),
    createdBy: r.created_by,
  };
};

export function addAnnotation(
  sessionId: string,
  input: {
    mapId: string;
    kind: Annotation['kind'];
    points?: number[];
    x?: number;
    y?: number;
    text?: string;
    color: string;
    url?: string;
    width?: number;
    height?: number;
    createdBy: string;
  },
): Annotation {
  const id = newId();
  db.prepare(
    `INSERT INTO annotations (id, session_id, map_id, kind, points, x, y, text, color, url, width, height, created_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    sessionId,
    input.mapId,
    input.kind,
    JSON.stringify(input.points ?? []),
    input.x ?? 0,
    input.y ?? 0,
    (input.text ?? '').slice(0, 200),
    input.color,
    input.url ?? '',
    input.width ?? 0,
    input.height ?? 0,
    input.createdBy,
    Date.now(),
  );
  return rowToAnnotation(
    db.prepare('SELECT * FROM annotations WHERE id = ?').get(id) as AnnotationRow,
  );
}

export function listAnnotations(mapId: string): Annotation[] {
  return (
    db
      .prepare('SELECT * FROM annotations WHERE map_id = ? ORDER BY created_at ASC')
      .all(mapId) as AnnotationRow[]
  ).map(rowToAnnotation);
}

/** Remove one annotation; when `requireCreatedBy` is set, only its creator's. */
export function removeAnnotation(id: string, requireCreatedBy?: string): void {
  if (requireCreatedBy !== undefined) {
    db.prepare('DELETE FROM annotations WHERE id = ? AND created_by = ?').run(id, requireCreatedBy);
  } else {
    db.prepare('DELETE FROM annotations WHERE id = ?').run(id);
  }
}

/** Clear a map's annotations — all, only one drawer's (`createdBy`), and/or
 *  only one kind (e.g. 'image' = scenery decals). */
export function clearAnnotations(
  mapId: string,
  createdBy?: string,
  kind?: Annotation['kind'],
): void {
  const conds = ['map_id = ?'];
  const args: string[] = [mapId];
  if (createdBy !== undefined) {
    conds.push('created_by = ?');
    args.push(createdBy);
  }
  if (kind !== undefined) {
    conds.push('kind = ?');
    args.push(kind);
  }
  db.prepare(`DELETE FROM annotations WHERE ${conds.join(' AND ')}`).run(...args);
}

/** Reposition an annotation's anchor (image decals dragged by the DM). */
export function moveAnnotation(id: string, x: number, y: number): void {
  db.prepare('UPDATE annotations SET x = ?, y = ? WHERE id = ?').run(x, y, id);
}

/** Resize an image decal (corner-handle drag). */
export function resizeAnnotation(id: string, width: number, height: number): void {
  db.prepare('UPDATE annotations SET width = ?, height = ? WHERE id = ?').run(width, height, id);
}

/** Attach/replace a decal's clickable popup ("shop"), or clear it with null. */
export function setAnnotationPopup(id: string, popup: Annotation['popup'] | null): void {
  db.prepare('UPDATE annotations SET popup = ? WHERE id = ?').run(
    popup ? JSON.stringify(popup) : '',
    id,
  );
}

// ---- Map image tiles (compose a larger map from several images) ----

type MapImageRow = {
  id: string;
  map_id: string;
  image_path: string;
  x: number;
  y: number;
  w: number;
  h: number;
  z: number;
};

const rowToMapImage = (r: MapImageRow): MapImage => ({
  id: r.id,
  imagePath: r.image_path,
  x: r.x,
  y: r.y,
  w: r.w,
  h: r.h,
  z: r.z,
});

/** Tiles on a map, bottom-to-top (z ascending, then insertion order). */
export function listMapImages(mapId: string): MapImage[] {
  return (
    db
      .prepare('SELECT * FROM map_images WHERE map_id = ? ORDER BY z ASC, created_at ASC')
      .all(mapId) as MapImageRow[]
  ).map(rowToMapImage);
}

/** Place a new image tile on a map; it lands on top of the existing stack. */
export function addMapImage(
  sessionId: string,
  input: { mapId: string; imagePath: string; x: number; y: number; w: number; h: number },
): MapImage {
  const id = newId();
  const topZ =
    (db.prepare('SELECT MAX(z) AS z FROM map_images WHERE map_id = ?').get(input.mapId) as {
      z: number | null;
    }).z ?? 0;
  db.prepare(
    `INSERT INTO map_images (id, session_id, map_id, image_path, x, y, w, h, z, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    sessionId,
    input.mapId,
    input.imagePath,
    input.x,
    input.y,
    Math.max(1, input.w),
    Math.max(1, input.h),
    topZ + 1,
    Date.now(),
  );
  return rowToMapImage(
    db.prepare('SELECT * FROM map_images WHERE id = ?').get(id) as MapImageRow,
  );
}

export function moveMapImage(id: string, x: number, y: number): void {
  db.prepare('UPDATE map_images SET x = ?, y = ? WHERE id = ?').run(x, y, id);
}

export function resizeMapImage(id: string, x: number, y: number, w: number, h: number): void {
  db.prepare('UPDATE map_images SET x = ?, y = ?, w = ?, h = ? WHERE id = ?').run(
    x,
    y,
    Math.max(1, w),
    Math.max(1, h),
    id,
  );
}

/** Send a tile to the front (above all) or back (below all) of its map's stack. */
export function reorderMapImage(id: string, to: 'front' | 'back'): void {
  const row = db.prepare('SELECT map_id FROM map_images WHERE id = ?').get(id) as
    | { map_id: string }
    | undefined;
  if (!row) return;
  const ext = db
    .prepare('SELECT MIN(z) AS lo, MAX(z) AS hi FROM map_images WHERE map_id = ?')
    .get(row.map_id) as { lo: number | null; hi: number | null };
  const z = to === 'front' ? (ext.hi ?? 0) + 1 : (ext.lo ?? 0) - 1;
  db.prepare('UPDATE map_images SET z = ? WHERE id = ?').run(z, id);
}

export function deleteMapImage(id: string): void {
  db.prepare('DELETE FROM map_images WHERE id = ?').run(id);
}

/** The character id a player's socket currently has claimed (or null) — used to
 *  pin chat typing/speech bubbles to their PC token. */
export function getClaimedCharacterId(sessionId: string, socketId: string): string | null {
  const c = db
    .prepare('SELECT id FROM characters WHERE session_id = ? AND claimed_by = ?')
    .get(sessionId, socketId) as { id: string } | undefined;
  return c?.id ?? null;
}

/** A roll's "who" — the player's claimed character name, "DM", or "Player". */
export function rollerName(sessionId: string, socketId: string, isDm: boolean): string {
  if (isDm) return 'DM';
  const c = db
    .prepare('SELECT name FROM characters WHERE session_id = ? AND claimed_by = ?')
    .get(sessionId, socketId) as { name: string } | undefined;
  return c?.name ?? 'Player';
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

export type CharacterInput = {
  name: string;
  race?: string;
  className?: string;
  subclass?: string;
  level?: number;
  maxHp?: number;
  curHp?: number;
  armorClass?: number;
  speed?: string;
  stats?: Record<string, number>;
  weapons?: Character['weapons'];
  resistances?: string[];
  weaknesses?: string[];
  actions?: Character['actions'];
  abilities?: Character['abilities'];
  proficientSkills?: string[];
  saveProficiencies?: string[];
  modifiers?: Character['modifiers'];
  items?: Character['items'];
  sheetAbilities?: Character['sheetAbilities'];
  /** When provided (e.g. loading a saved sheet), used verbatim instead of being
   *  derived from class/level — preserves used counts + custom counters. */
  spellSlots?: Character['spellSlots'];
  resources?: Character['resources'];
  icon?: string;
};

/** Create a player character (DM or a player may add one). */
export function createCharacter(
  sessionId: string,
  opts: CharacterInput,
): Character {
  const id = newId();
  const maxHp = opts.maxHp && opts.maxHp > 0 ? Math.round(opts.maxHp) : 10;
  const curHp = opts.curHp !== undefined ? Math.round(opts.curHp) : maxHp;
  const level = opts.level && opts.level > 0 ? opts.level : 1;
  // Auto-fill spell slots + class resources from 5e class/level tables, unless
  // the caller supplied them (e.g. loading a saved sheet).
  const derived = deriveClassResources(
    opts.className ?? '',
    level,
    opts.stats ?? {},
    opts.subclass ?? '',
  );
  const spellSlots = opts.spellSlots ?? derived.spellSlots;
  const resources = opts.resources ?? derived.resources;
  db.prepare(
    `INSERT INTO characters
       (id, session_id, name, race, class_name, subclass, level, max_hp, cur_hp,
        armor_class, speed, stats, weapons, resistances, weaknesses,
        actions, abilities, proficient_skills, save_proficiencies, modifiers, items,
        sheet_abilities, spell_slots, resources, icon)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    sessionId,
    opts.name.trim() || 'Adventurer',
    opts.race ?? '',
    opts.className ?? '',
    opts.subclass ?? '',
    level,
    maxHp,
    Math.max(0, Math.min(maxHp, curHp)),
    opts.armorClass ?? 0,
    opts.speed ?? '',
    JSON.stringify(opts.stats ?? {}),
    JSON.stringify(sanitizeWeapons(opts.weapons ?? [])),
    JSON.stringify(opts.resistances ?? []),
    JSON.stringify(opts.weaknesses ?? []),
    JSON.stringify(opts.actions ?? []),
    JSON.stringify(opts.abilities ?? []),
    JSON.stringify(opts.proficientSkills ?? []),
    JSON.stringify(opts.saveProficiencies ?? []),
    // Sanitized: creation inputs arrive from sockets / the character library
    // (REST-writable), and modifiers/items feed the server's roll math.
    JSON.stringify(sanitizeModifiers(opts.modifiers, newId)),
    JSON.stringify(sanitizeItems(opts.items, newId)),
    JSON.stringify(opts.sheetAbilities ?? []),
    JSON.stringify(spellSlots),
    JSON.stringify(resources),
    opts.icon ?? '',
  );
  return getCharacter(id)!;
}

/** Instantiate a saved library character into a session as a fresh PC. */
export function createCharacterFromLibrary(
  sessionId: string,
  name: string,
): Character | null {
  const lib = getLibraryCharacter(name);
  if (!lib) return null;
  return createCharacter(sessionId, { ...lib });
}

type Counters = Record<string, { max: number; used: number }>;
/** Apply derived counter maxes onto existing counters, preserving used + custom. */
function mergeCounters(existing: Counters, derived: Counters): Counters {
  const out: Counters = { ...existing };
  for (const [key, d] of Object.entries(derived)) {
    out[key] = { max: d.max, used: Math.min(existing[key]?.used ?? 0, d.max) };
  }
  return out;
}

/** Set/clear a single counter (spell slot or class resource) on a character. */
export function setResource(
  characterId: string,
  group: 'spellSlots' | 'resources',
  key: string,
  patch: { max?: number; used?: number; remove?: boolean },
): Character | null {
  const c = getCharacter(characterId);
  if (!c) return null;
  const map: Counters = { ...(group === 'spellSlots' ? c.spellSlots : c.resources) };
  if (patch.remove) {
    delete map[key];
  } else {
    const cur = map[key] ?? { max: 0, used: 0 };
    const max = patch.max ?? cur.max;
    const used = Math.max(0, Math.min(max, patch.used ?? cur.used));
    map[key] = { max, used };
  }
  const col = group === 'spellSlots' ? 'spell_slots' : 'resources';
  db.prepare(`UPDATE characters SET ${col} = ? WHERE id = ?`).run(
    JSON.stringify(map),
    characterId,
  );
  return getCharacter(characterId);
}

/**
 * Spend one spell slot of `level` on a character (used when casting from the
 * sheet). Reports whether the character tracks that level (`hasSlot`) and
 * whether a slot was actually consumed (`spent` is false when a caster is
 * tapped out, so the caller can warn without blocking the roll).
 */
export function spendSpellSlot(
  characterId: string,
  level: number,
): { hasSlot: boolean; spent: boolean } {
  const c = getCharacter(characterId);
  if (!c) return { hasSlot: false, spent: false };
  const key = `L${level}`;
  const slot = c.spellSlots[key];
  if (!slot) return { hasSlot: false, spent: false };
  if (slot.used >= slot.max) return { hasSlot: true, spent: false };
  const next = { ...c.spellSlots, [key]: { max: slot.max, used: slot.used + 1 } };
  db.prepare('UPDATE characters SET spell_slots = ? WHERE id = ?').run(
    JSON.stringify(next),
    characterId,
  );
  return { hasSlot: true, spent: true };
}

/**
 * Spend one use of the class-resource counter matching a rolled sheet ability's
 * name (using "Second Wind" ticks the Second Wind pool; same for Bardic
 * Inspiration, Channel Divinity…). Case-insensitive exact match. Soft like every
 * counter: when the pool is already empty the roll still happened — we report
 * `spent: false` so the caller can nudge the player. `matched: false` when the
 * character tracks no counter by that name.
 */
export function spendResourceForAbility(
  characterId: string,
  abilityName: string,
): { matched: boolean; spent: boolean } {
  const c = getCharacter(characterId);
  if (!c) return { matched: false, spent: false };
  const want = abilityName.trim().toLowerCase();
  const key = Object.keys(c.resources).find(
    (k) => k.trim().toLowerCase() === want,
  );
  if (!key) return { matched: false, spent: false };
  const r = c.resources[key];
  if (r.used >= r.max) return { matched: true, spent: false };
  const next = { ...c.resources, [key]: { max: r.max, used: r.used + 1 } };
  db.prepare('UPDATE characters SET resources = ? WHERE id = ?').run(
    JSON.stringify(next),
    characterId,
  );
  return { matched: true, spent: true };
}

export function setItem(
  characterId: string,
  item: Character['items'][number],
): Character | null {
  const c = getCharacter(characterId);
  if (!c) return null;
  const items = c.items.filter((i) => i.id !== item.id);
  // Sanitized (qty clamped, modifiers validated): item:set is player-reachable
  // and magic-item effects feed the server's roll math.
  const clean = sanitizeItems([{ ...item, id: item.id || newId() }], newId)[0];
  if (!clean) return c;
  items.push(clean);
  db.prepare('UPDATE characters SET items = ? WHERE id = ?').run(
    JSON.stringify(items),
    characterId,
  );
  return getCharacter(characterId);
}

export function removeItem(characterId: string, itemId: string): Character | null {
  const c = getCharacter(characterId);
  if (!c) return null;
  db.prepare('UPDATE characters SET items = ? WHERE id = ?').run(
    JSON.stringify(c.items.filter((i) => i.id !== itemId)),
    characterId,
  );
  return getCharacter(characterId);
}

/** Replace the loot held by an object (chest/treasure pile). DM-authored. An
 *  empty container stores NULL so it reads back as `loot: undefined`. */
export function setLoot(
  monsterId: string,
  loot: LootContents | null,
): Monster | null {
  const m = getMonster(monsterId);
  if (!m) return null;
  // Sanitized: validates modifiers and NaN-proofs gold/qty. Containers never
  // hold an `equipped` item (magic effects ride along but start dormant).
  const gold =
    loot && Number.isFinite(loot.gold) ? Math.max(0, Math.round(loot.gold)) : 0;
  const items = loot
    ? sanitizeItems(loot.items, newId).map(({ equipped: _e, ...i }) => ({
        ...i,
        qty: Math.max(1, i.qty),
      }))
    : [];
  const clean: LootContents | null = gold > 0 || items.length > 0 ? { gold, items } : null;
  db.prepare('UPDATE monsters SET loot = ? WHERE id = ?').run(
    clean ? JSON.stringify(clean) : null,
    monsterId,
  );
  return getMonster(monsterId);
}

/**
 * Move loot from an object into a character. `all` takes everything; otherwise
 * `itemId` takes one item and/or `gold` takes that many coins (clamped to what's
 * there). Items merge with a matching inventory line (same name + note). When the
 * container empties it's flagged with a "Looted"/"Taken" condition. Runs as one
 * transaction so the character credit and container debit can't split.
 */
export const takeLoot = db.transaction(takeLootImpl);
function takeLootImpl(
  monsterId: string,
  characterId: string,
  opts: { itemId?: string; gold?: number; all?: boolean },
): { monster: Monster; character: Character } | null {
  const m = getMonster(monsterId);
  const c = getCharacter(characterId);
  if (!m || !m.loot || !c) return null;

  const loot: LootContents = {
    gold: m.loot.gold,
    items: m.loot.items.map((i) => ({ ...i })),
  };
  const items = c.items.map((i) => ({ ...i }));
  let gained = 0;

  const moveItem = (it: InventoryItem) => {
    // Items carrying magic effects stay their own stack (don't fold a +1 cloak
    // into a pile of mundane cloaks). Plain items merge by name + note as before.
    const plain = !(it.modifiers && it.modifiers.length);
    const match = plain
      ? items.find(
          (x) =>
            !(x.modifiers && x.modifiers.length) &&
            x.name.toLowerCase() === it.name.toLowerCase() &&
            (x.note ?? '') === (it.note ?? ''),
        )
      : undefined;
    if (match) match.qty += it.qty;
    else items.push({ ...it, id: newId() });
  };

  if (opts.all) {
    loot.items.forEach(moveItem);
    loot.items = [];
    gained = loot.gold;
    loot.gold = 0;
  } else {
    if (opts.itemId) {
      const idx = loot.items.findIndex((i) => i.id === opts.itemId);
      if (idx >= 0) {
        moveItem(loot.items[idx]);
        loot.items.splice(idx, 1);
      }
    }
    if (opts.gold !== undefined && Number.isFinite(opts.gold)) {
      gained = Math.max(0, Math.min(Math.round(opts.gold), loot.gold));
      loot.gold -= gained;
    }
  }

  db.prepare('UPDATE characters SET items = ?, gold = ? WHERE id = ?').run(
    JSON.stringify(items),
    c.gold + gained,
    characterId,
  );

  // Anything actually moved → a one-shot gold sparkle over the container.
  const took = gained > 0 || loot.items.length < m.loot.items.length;
  if (took && hpFxQueue.length < 200)
    hpFxQueue.push({
      sessionId: m.sessionId,
      kind: 'monster',
      refId: monsterId,
      delta: 0,
      effect: 'loot',
    });

  const emptied = loot.gold <= 0 && loot.items.length === 0;
  setLoot(monsterId, emptied ? null : loot);
  // Flag a drained container so its state reads "Looted"/"Taken" everywhere.
  if (emptied) {
    const flag = m.objectKind === 'item' ? 'Taken' : 'Looted';
    if (!m.conditions.some((x) => x.label.toLowerCase() === flag.toLowerCase())) {
      setCondition('monster', monsterId, {
        id: newId(),
        label: flag,
        aura: 'blue',
        isConcentration: false,
      });
    }
  }
  return { monster: getMonster(monsterId)!, character: getCharacter(characterId)! };
}

/** Upsert a rich spell/ability on a PC or monster sheet (by id). */
export function setSheetAbility(
  kind: TokenKind,
  refId: string,
  ability: Character['sheetAbilities'][number],
): Character | Monster | null {
  if (kind === 'monster') {
    const m = getMonster(refId);
    if (!m) return null;
    const list = m.sheetAbilities.filter((a) => a.id !== ability.id);
    list.push({ ...ability, id: ability.id || newId() });
    db.prepare('UPDATE monsters SET sheet_abilities = ? WHERE id = ?').run(
      JSON.stringify(list),
      refId,
    );
    return getMonster(refId);
  }
  const c = getCharacter(refId);
  if (!c) return null;
  const list = c.sheetAbilities.filter((a) => a.id !== ability.id);
  list.push({ ...ability, id: ability.id || newId() });
  db.prepare('UPDATE characters SET sheet_abilities = ? WHERE id = ?').run(
    JSON.stringify(list),
    refId,
  );
  // Adding the first maneuver seeds the Battle Master pool: a Superiority Dice
  // counter + a default d8 die size (left alone if the character already has them).
  // Monsters have no resource counters, so this is PC-only.
  if (ability.type === 'maneuver') {
    if (!c.resources['Superiority Dice'])
      setResource(refId, 'resources', 'Superiority Dice', { max: 4, used: 0 });
    if (!c.superiorityDie)
      db.prepare('UPDATE characters SET superiority_die = ? WHERE id = ?').run(
        'd8',
        refId,
      );
  }
  return getCharacter(refId);
}

export function removeSheetAbility(
  kind: TokenKind,
  refId: string,
  abilityId: string,
): Character | Monster | null {
  if (kind === 'monster') {
    const m = getMonster(refId);
    if (!m) return null;
    db.prepare('UPDATE monsters SET sheet_abilities = ? WHERE id = ?').run(
      JSON.stringify(m.sheetAbilities.filter((a) => a.id !== abilityId)),
      refId,
    );
    return getMonster(refId);
  }
  const c = getCharacter(refId);
  if (!c) return null;
  db.prepare('UPDATE characters SET sheet_abilities = ? WHERE id = ?').run(
    JSON.stringify(c.sheetAbilities.filter((a) => a.id !== abilityId)),
    refId,
  );
  return getCharacter(refId);
}

/**
 * Reorder a creature's `sheetAbilities` to match a client-supplied id order.
 * Unknown/missing ids are ignored; any ability not named in `orderedIds` is
 * appended in its existing order, so a partial order (e.g. one group) never
 * drops entries.
 */
export function reorderSheetAbilities(
  kind: TokenKind,
  refId: string,
  orderedIds: string[],
): Character | Monster | null {
  const ent = kind === 'monster' ? getMonster(refId) : getCharacter(refId);
  if (!ent) return null;
  const byId = new Map(ent.sheetAbilities.map((a) => [a.id, a]));
  const seen = new Set<string>();
  const ordered: Character['sheetAbilities'] = [];
  for (const id of orderedIds) {
    const a = byId.get(id);
    if (a && !seen.has(id)) {
      ordered.push(a);
      seen.add(id);
    }
  }
  for (const a of ent.sheetAbilities) if (!seen.has(a.id)) ordered.push(a);
  const table = kind === 'monster' ? 'monsters' : 'characters';
  db.prepare(`UPDATE ${table} SET sheet_abilities = ? WHERE id = ?`).run(
    JSON.stringify(ordered),
    refId,
  );
  return kind === 'monster' ? getMonster(refId) : getCharacter(refId);
}

/** Credit a PC with a kill (dropped an enemy to 0 HP). Returns the new total. */
export function incrementKillCount(characterId: string): number {
  const c = getCharacter(characterId);
  if (!c) return 0;
  const next = (c.killCount ?? 0) + 1;
  db.prepare('UPDATE characters SET kill_count = ? WHERE id = ?').run(next, characterId);
  return next;
}

/** Patch editable fields of a character (DM or the owning player). */
export function updateCharacter(
  characterId: string,
  patch: Partial<{
    name: string;
    race: string;
    className: string;
    subclass: string;
    level: number;
    maxHp: number;
    curHp: number;
    tempHp: number;
    armorClass: number;
    speed: string;
    stats: Record<string, number>;
    resistances: string[];
    weaknesses: string[];
    weapons: Character['weapons'];
    actions: Character['actions'];
    abilities: Character['abilities'];
    proficientSkills: string[];
    saveProficiencies: string[];
    modifiers: Character['modifiers'];
    items: Character['items'];
    gold: number;
    sheetAbilities: Character['sheetAbilities'];
    spellSlots: Character['spellSlots'];
    resources: Character['resources'];
    icon: string;
  }>,
): Character | null {
  const c = getCharacter(characterId);
  if (!c) return null;
  const sets: string[] = [];
  const vals: unknown[] = [];
  const put = (col: string, v: unknown) => {
    sets.push(`${col} = ?`);
    vals.push(v);
  };
  if (patch.name !== undefined) put('name', patch.name);
  if (patch.race !== undefined) put('race', patch.race);
  if (patch.className !== undefined) put('class_name', patch.className);
  if (patch.subclass !== undefined) put('subclass', patch.subclass);
  if (patch.level !== undefined) put('level', patch.level);
  if (patch.maxHp !== undefined) put('max_hp', Math.max(1, patch.maxHp));
  if (patch.curHp !== undefined) put('cur_hp', patch.curHp);
  if (patch.tempHp !== undefined) put('temp_hp', Math.max(0, patch.tempHp));
  if (patch.armorClass !== undefined) put('armor_class', patch.armorClass);
  if (patch.speed !== undefined) put('speed', patch.speed);
  if (patch.icon !== undefined) put('icon', patch.icon);
  if (patch.stats !== undefined) put('stats', JSON.stringify(patch.stats));
  if (patch.resistances !== undefined)
    put('resistances', JSON.stringify(patch.resistances));
  if (patch.weaknesses !== undefined)
    put('weaknesses', JSON.stringify(patch.weaknesses));
  // Player-editable + REST/import-writable, and weapons feed server roll math.
  if (patch.weapons !== undefined)
    put('weapons', JSON.stringify(sanitizeWeapons(patch.weapons)));
  if (patch.actions !== undefined) put('actions', JSON.stringify(patch.actions));
  if (patch.abilities !== undefined)
    put('abilities', JSON.stringify(patch.abilities));
  if (patch.proficientSkills !== undefined)
    put('proficient_skills', JSON.stringify(patch.proficientSkills));
  if (patch.saveProficiencies !== undefined)
    put('save_proficiencies', JSON.stringify(patch.saveProficiencies));
  // Modifiers and items feed the server's own roll math — never store a
  // client-supplied array raw (unclamped values; a malformed target would
  // throw inside every later resolver touching this PC).
  if (patch.modifiers !== undefined)
    put('modifiers', JSON.stringify(sanitizeModifiers(patch.modifiers, newId)));
  if (patch.items !== undefined)
    put('items', JSON.stringify(sanitizeItems(patch.items, newId)));
  if (patch.gold !== undefined)
    put('gold', Number.isFinite(patch.gold) ? Math.max(0, Math.round(patch.gold)) : 0);
  if (patch.sheetAbilities !== undefined)
    put('sheet_abilities', JSON.stringify(patch.sheetAbilities));
  if (patch.spellSlots !== undefined)
    put('spell_slots', JSON.stringify(patch.spellSlots));
  if (patch.resources !== undefined)
    put('resources', JSON.stringify(patch.resources));

  // Re-derive spell slots / class resources when level, class, or subclass
  // changes, unless the caller passed them explicitly (preserve `used` + any
  // custom counters).
  if (
    (patch.level !== undefined ||
      patch.className !== undefined ||
      patch.subclass !== undefined) &&
    patch.spellSlots === undefined &&
    patch.resources === undefined
  ) {
    const derived = deriveClassResources(
      patch.className ?? c.className,
      patch.level ?? c.level,
      patch.stats ?? c.stats,
      patch.subclass ?? c.subclass,
    );
    put('spell_slots', JSON.stringify(mergeCounters(c.spellSlots, derived.spellSlots)));
    put('resources', JSON.stringify(mergeCounters(c.resources, derived.resources)));
  }

  if (sets.length) {
    db.prepare(`UPDATE characters SET ${sets.join(', ')} WHERE id = ?`).run(
      ...vals,
      characterId,
    );
    const after = getCharacter(characterId)!;
    if (after.curHp > after.maxHp) {
      db.prepare('UPDATE characters SET cur_hp = ? WHERE id = ?').run(
        after.maxHp,
        characterId,
      );
    }
  }
  return getCharacter(characterId);
}

export function claimCharacter(
  characterId: string,
  socketId: string,
  playerId?: string | null,
): Character | null {
  // A player holds exactly one character — release any prior claim first so
  // "change character" frees the old one instead of orphaning it.
  releaseClaims(socketId);
  db.prepare('UPDATE characters SET claimed_by = ? WHERE id = ?').run(
    socketId,
    characterId,
  );
  // Record the most recent identified holder. Used only to hand the character
  // back to that player on reconnect (priority) — it does NOT lock others out;
  // a character is "taken" only while a live socket (or one in its disconnect
  // grace) holds it.
  if (playerId) {
    db.prepare('UPDATE characters SET owner_player_id = ? WHERE id = ?').run(
      playerId,
      characterId,
    );
  }
  return getCharacter(characterId);
}

/** Enforce one owned character per player: clear `owner_player_id` on this
 *  player's OTHER characters in the session, so reconnect reclaim is
 *  unambiguous and an explicit "change character" doesn't snap them back.
 *  Omit `exceptId` to clear ALL of the player's ownership in the session. */
export function clearOwnershipElsewhere(
  sessionId: string,
  playerId: string,
  exceptId?: string,
): void {
  db.prepare(
    'UPDATE characters SET owner_player_id = NULL WHERE session_id = ? AND owner_player_id = ? AND id != ?',
  ).run(sessionId, playerId, exceptId ?? '');
}

/** Set/clear a character's durable owner (DM unlock passes null; clearing also
 *  releases the live claim so the sheet is immediately up for grabs). */
export function setCharacterOwner(characterId: string, ownerId: string | null): void {
  if (ownerId === null) {
    db.prepare(
      'UPDATE characters SET owner_player_id = NULL, claimed_by = NULL WHERE id = ?',
    ).run(characterId);
  } else {
    db.prepare('UPDATE characters SET owner_player_id = ? WHERE id = ?').run(
      ownerId,
      characterId,
    );
  }
}

export function releaseClaims(socketId: string): void {
  db.prepare('UPDATE characters SET claimed_by = NULL WHERE claimed_by = ?').run(
    socketId,
  );
}

// ---- Monsters ----
// A "template" (is_template = 1) is a reusable creature definition shown as one
// spawn button. Each placement creates a numbered *instance* (is_template = 0,
// template_id set) with its own HP/conditions, referenced by a token.

/** Placed monster instances (referenced by tokens). */
export function listMonsters(sessionId: string): Monster[] {
  const rows = db
    .prepare(
      'SELECT * FROM monsters WHERE session_id = ? AND is_template = 0 ORDER BY name ASC',
    )
    .all(sessionId) as Parameters<typeof rowToMonster>[0][];
  return rows.map(rowToMonster);
}

/** Reusable creature templates (the DM's spawn buttons). */
export function listMonsterTemplates(sessionId: string): Monster[] {
  const rows = db
    .prepare(
      'SELECT * FROM monsters WHERE session_id = ? AND is_template = 1 ORDER BY name ASC',
    )
    .all(sessionId) as Parameters<typeof rowToMonster>[0][];
  return rows.map(rowToMonster);
}

export function getMonster(id: string): Monster | null {
  const row = db.prepare('SELECT * FROM monsters WHERE id = ?').get(id) as
    | Parameters<typeof rowToMonster>[0]
    | undefined;
  return row ? rowToMonster(row) : null;
}

/** True when the monster exists and belongs to the given session — guards
 *  monster-targeting events against stale/forged ids from other sessions. */
export function monsterInSession(monsterId: string, sessionId: string): boolean {
  return getMonster(monsterId)?.sessionId === sessionId;
}

export type MonsterInput = {
  name: string;
  maxHp: number;
  creatureType?: string;
  level?: number;
  armorClass?: number;
  speed?: string;
  stats?: Record<string, number>;
  resistances?: string[];
  weaknesses?: string[];
  saveProficiencies?: string[];
  actions?: Monster['actions'];
  abilities?: Monster['abilities'];
  sheetAbilities?: Monster['sheetAbilities'];
  weapons?: Monster['weapons'];
  icon?: string;
  disposition?: Monster['disposition'];
  objectKind?: Monster['objectKind'];
  loot?: Monster['loot'];
  objectDc?: Monster['objectDc'];
  source?: Monster['source'];
};

/** Snapshot a stored creature's copyable fields into a MonsterInput so spawn /
 *  copy / duplicate clone the FULL creature (save proficiencies, object state,
 *  sheet abilities…) instead of a hand-copied field list that silently drifts.
 *  Deep-copies the nested structures so per-instance edits never alias the source. */
function toMonsterInput(m: Monster): MonsterInput {
  return {
    name: m.name,
    maxHp: m.maxHp,
    creatureType: m.creatureType,
    armorClass: m.armorClass,
    speed: m.speed,
    stats: { ...m.stats },
    resistances: [...m.resistances],
    weaknesses: [...m.weaknesses],
    saveProficiencies: [...(m.saveProficiencies ?? [])],
    actions: m.actions,
    abilities: m.abilities,
    weapons: JSON.parse(JSON.stringify(m.weapons ?? [])),
    sheetAbilities: JSON.parse(JSON.stringify(m.sheetAbilities ?? [])),
    level: m.level,
    icon: m.icon,
    disposition: m.disposition,
    objectKind: m.objectKind,
    loot: m.loot ? JSON.parse(JSON.stringify(m.loot)) : m.loot,
    objectDc: m.objectDc,
    source: m.source,
  };
}

function insertMonster(
  sessionId: string,
  opts: MonsterInput,
  meta: { isTemplate: boolean; templateId: string | null; name: string },
): Monster {
  const id = newId();
  const type = opts.creatureType ?? '';
  const icon = opts.icon || iconForCreature(meta.name, type);
  // `actions` is only a transport shape (SRD / AI / pasted stat blocks): weapon-
  // like entries ("+4 to hit, 1d6+2 slashing") become rollable weapons, the rest
  // merge into sheetAbilities. Stored monsters always keep `actions` empty.
  let weapons = opts.weapons ?? [];
  let actions = opts.actions ?? [];
  if (weapons.length === 0 && actions.length) {
    const split = weaponsFromActions(actions);
    weapons = split.weapons;
    actions = split.actions;
  }
  const sheetAbilities = [
    ...(opts.sheetAbilities ?? []),
    ...actionsToSheetAbilities(actions, { makeId: newId, source: opts.source }),
  ];
  db.prepare(
    `INSERT INTO monsters
       (id, session_id, name, creature_type, max_hp, cur_hp,
        resistances, weaknesses, save_proficiencies, abilities, source, icon,
        armor_class, speed, stats, actions, is_template, template_id,
        disposition, weapons, level, object_kind, loot, object_dc, sheet_abilities)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    sessionId,
    meta.name,
    type,
    opts.maxHp,
    opts.maxHp,
    JSON.stringify(opts.resistances ?? []),
    JSON.stringify(opts.weaknesses ?? []),
    // Save proficiencies drive resolveSaves — carry them through spawn/copy so a
    // tuned boss keeps the saves it should pass.
    JSON.stringify(opts.saveProficiencies ?? []),
    JSON.stringify(opts.abilities ?? []),
    opts.source ?? 'manual',
    icon,
    opts.armorClass ?? 0,
    opts.speed ?? '',
    JSON.stringify(opts.stats ?? {}),
    '[]', // actions: converted to weapons/sheetAbilities above
    meta.isTemplate ? 1 : 0,
    meta.templateId,
    opts.disposition ?? 'enemy',
    // A spawned instance's weapons drive resolveAttack — clamp like the PC path.
    JSON.stringify(sanitizeWeapons(weapons)),
    opts.level ?? 0,
    opts.objectKind ?? null,
    opts.loot ? JSON.stringify(opts.loot) : null,
    opts.objectDc ?? null,
    JSON.stringify(sheetAbilities),
  );
  return getMonster(id)!;
}

/** Pick a unique template name (append " (2)", " (3)", … on collision). */
function uniqueTemplateName(sessionId: string, base: string): string {
  const names = new Set(
    listMonsterTemplates(sessionId).map((m) => m.name.toLowerCase()),
  );
  if (!names.has(base.toLowerCase())) return base;
  let n = 2;
  while (names.has(`${base} (${n})`.toLowerCase())) n++;
  return `${base} (${n})`;
}

/** Create a reusable creature template (one spawn button). Free-text `actions`
 *  are converted in `insertMonster`: weapon-like ones become rollable weapons,
 *  the rest become rich sheet abilities (rolls kept or scraped). */
export function createMonsterTemplate(
  sessionId: string,
  opts: MonsterInput,
): Monster {
  const base = opts.name.trim() || 'Creature';
  return insertMonster(sessionId, opts, {
    isTemplate: true,
    templateId: null,
    name: uniqueTemplateName(sessionId, base),
  });
}

/** Spawn a numbered instance from a template (Goblin 1, Goblin 2, …). */
export function instantiateMonster(templateId: string): Monster | null {
  const tmpl = getMonster(templateId);
  if (!tmpl) return null;
  const n =
    (db
      .prepare(
        'SELECT COUNT(*) AS c FROM monsters WHERE template_id = ?',
      )
      .get(templateId) as { c: number }).c + 1;
  // toMonsterInput carries the full stat block (save profs, object state, loot,
  // sheet abilities) and deep-copies the nested structures per instance.
  return insertMonster(tmpl.sessionId, toMonsterInput(tmpl), {
    isTemplate: false,
    templateId,
    name: `${tmpl.name} ${n}`,
  });
}

/** Duplicate a creature template into a new independent template. */
export function copyMonster(monsterId: string): Monster | null {
  const m = getMonster(monsterId);
  if (!m) return null;
  return createMonsterTemplate(m.sessionId, toMonsterInput(m));
}

/** Patch editable fields of a creature (template or instance). DM-only. */
export function updateMonster(
  monsterId: string,
  patch: Partial<{
    disposition: Monster['disposition'];
    objectKind: Monster['objectKind'];
    objectDc: number;
    name: string;
    level: number;
    maxHp: number;
    curHp: number;
    tempHp: number;
    creatureType: string;
    armorClass: number;
    speed: string;
    stats: Record<string, number>;
    resistances: string[];
    weaknesses: string[];
    saveProficiencies: string[];
    weapons: Monster['weapons'];
    actions: Monster['actions'];
    abilities: Monster['abilities'];
    sheetAbilities: Monster['sheetAbilities'];
    icon: string;
  }>,
): Monster | null {
  const m = getMonster(monsterId);
  if (!m) return null;

  // Merged ability system: a legacy `actions` patch (AI fill / pasted stat
  // block) is converted instead of stored — weapon-like entries become weapons
  // (when there are none yet), the rest fold into sheetAbilities (rolls kept or
  // scraped, deduped by name). Stored monsters always keep `actions` empty.
  if (patch.actions !== undefined) {
    let actions = patch.actions;
    if ((patch.weapons ?? m.weapons).length === 0 && actions.length) {
      const split = weaponsFromActions(actions);
      if (split.weapons.length) {
        patch = { ...patch, weapons: split.weapons };
        actions = split.actions;
      }
    }
    const baseSheet = patch.sheetAbilities ?? m.sheetAbilities;
    const have = new Set(baseSheet.map((a) => a.name.toLowerCase()));
    const converted = actionsToSheetAbilities(
      actions.filter((a) => !have.has(a.name.toLowerCase())),
      { makeId: newId, source: m.source },
    );
    patch = { ...patch, actions: [], sheetAbilities: [...baseSheet, ...converted] };
  }

  // Map each patchable field to its column + serialized value.
  const sets: string[] = [];
  const vals: unknown[] = [];
  const put = (col: string, v: unknown) => {
    sets.push(`${col} = ?`);
    vals.push(v);
  };
  if (patch.disposition !== undefined) put('disposition', patch.disposition);
  if (patch.objectKind !== undefined) put('object_kind', patch.objectKind ?? null);
  if (patch.objectDc !== undefined)
    put('object_dc', patch.objectDc != null ? Math.max(1, Math.round(patch.objectDc)) : null);
  if (patch.name !== undefined) put('name', patch.name);
  if (patch.level !== undefined) put('level', patch.level);
  if (patch.creatureType !== undefined) put('creature_type', patch.creatureType);
  if (patch.maxHp !== undefined) put('max_hp', Math.max(1, patch.maxHp));
  if (patch.curHp !== undefined) put('cur_hp', patch.curHp);
  if (patch.tempHp !== undefined) put('temp_hp', Math.max(0, patch.tempHp));
  if (patch.armorClass !== undefined) put('armor_class', patch.armorClass);
  if (patch.speed !== undefined) put('speed', patch.speed);
  if (patch.icon !== undefined) put('icon', patch.icon);
  if (patch.stats !== undefined) put('stats', JSON.stringify(patch.stats));
  if (patch.resistances !== undefined)
    put('resistances', JSON.stringify(patch.resistances));
  if (patch.weaknesses !== undefined)
    put('weaknesses', JSON.stringify(patch.weaknesses));
  if (patch.saveProficiencies !== undefined)
    put('save_proficiencies', JSON.stringify(patch.saveProficiencies));
  // Weapons drive resolveAttack — clamp untrusted client edits like the PC path.
  if (patch.weapons !== undefined)
    put('weapons', JSON.stringify(sanitizeWeapons(patch.weapons)));
  if (patch.actions !== undefined) put('actions', JSON.stringify(patch.actions));
  if (patch.abilities !== undefined)
    put('abilities', JSON.stringify(patch.abilities));
  if (patch.sheetAbilities !== undefined)
    put('sheet_abilities', JSON.stringify(patch.sheetAbilities));

  // Clamp curHp to a (possibly new) maxHp so the bar never overflows.
  if (sets.length) {
    db.prepare(`UPDATE monsters SET ${sets.join(', ')} WHERE id = ?`).run(
      ...vals,
      monsterId,
    );
    const after = getMonster(monsterId)!;
    if (after.curHp > after.maxHp) {
      db.prepare('UPDATE monsters SET cur_hp = ? WHERE id = ?').run(
        after.maxHp,
        monsterId,
      );
    }
  }
  return getMonster(monsterId);
}

/** Delete a monster (template or instance) and any tokens referencing it. */
export function deleteMonster(monsterId: string): void {
  // Per-token deletes so the active-turn guard in deleteToken runs.
  for (const t of tokensForRef('monster', monsterId)) deleteToken(t);
  db.prepare('DELETE FROM monsters WHERE id = ?').run(monsterId);
}

/** Token ids referencing a creature/character (no FK cascade on ref_id). */
function tokensForRef(kind: TokenKind, refId: string): string[] {
  return (
    db
      .prepare('SELECT id FROM tokens WHERE kind = ? AND ref_id = ?')
      .all(kind, refId) as { id: string }[]
  ).map((r) => r.id);
}

/** Remove a player character (and any of its placed tokens) from the session.
 *  Tokens reference characters by ref_id (no FK cascade), so delete them too. */
export function deleteCharacter(characterId: string): void {
  // Per-token deletes so the active-turn guard in deleteToken runs.
  for (const t of tokensForRef('pc', characterId)) deleteToken(t);
  db.prepare('DELETE FROM characters WHERE id = ?').run(characterId);
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

// Transient HP-change FX queue: applyDamage records every effective change and
// broadcastSnapshots drains it into per-viewer 'fx:hp' events (floating ±X over
// the token). Never persisted; capped so an undrained queue can't grow forever.
const hpFxQueue: (HpFxEvent & { sessionId: string })[] = [];
export function drainHpFx(sessionId: string): HpFxEvent[] {
  const mine: HpFxEvent[] = [];
  for (let i = hpFxQueue.length - 1; i >= 0; i--) {
    if (hpFxQueue[i].sessionId !== sessionId) continue;
    const { kind, refId, delta, damageType, effect } = hpFxQueue[i];
    mine.unshift({
      kind,
      refId,
      delta,
      ...(damageType ? { damageType } : {}),
      ...(effect ? { effect } : {}),
    });
    hpFxQueue.splice(i, 1);
  }
  return mine;
}

export function applyDamage(
  kind: TokenKind,
  refId: string,
  amount: number,
  /** Canonical 5e damage type when the source knew it (drives the token's
   *  elemental burst FX); omitted for heals/untyped damage. */
  damageType?: string,
): Character | Monster | null {
  const table = kind === 'pc' ? 'characters' : 'monsters';
  const entity = kind === 'pc' ? getCharacter(refId) : getMonster(refId);
  if (!entity || !Number.isFinite(amount)) return null;
  // Clamp to a sane magnitude so a buggy/forged event can't apply absurd values.
  amount = Math.trunc(Math.max(-10000, Math.min(10000, amount)));
  // 2024 rules: damage drains the temporary-HP buffer first, then real HP;
  // healing (amount < 0) only restores real HP and never refills temp HP.
  let nextTemp = entity.tempHp;
  let nextCur: number;
  if (amount > 0) {
    const absorbed = Math.min(nextTemp, amount);
    nextTemp -= absorbed;
    nextCur = Math.min(entity.maxHp, Math.max(0, entity.curHp - (amount - absorbed)));
  } else {
    nextCur = Math.min(entity.maxHp, Math.max(0, entity.curHp - amount));
  }
  // Float a ±X over the token when the effective pool (HP + temp) changed.
  // Damage absorbed by temp HP still reads as the full hit. Damage to a
  // creature ALREADY at 0 HP changes nothing numerically but must still read
  // as a hit (death-save failures, attacking a downed body) — float the
  // attempted amount.
  const delta = nextCur + nextTemp - (entity.curHp + entity.tempHp);
  const fxDelta = delta !== 0 ? delta : amount > 0 ? -amount : 0;
  // A creature (not an object, not a PC — PCs go DOWN, not dead) dropping from
  // above 0 to 0 gets a one-shot death puff on top of the damage floater.
  const died =
    kind === 'monster' &&
    !(entity as Monster).objectKind &&
    entity.curHp > 0 &&
    nextCur === 0;
  if (fxDelta !== 0 && hpFxQueue.length < 200)
    hpFxQueue.push({
      sessionId: entity.sessionId,
      kind,
      refId,
      delta: fxDelta,
      // Type only rides on damage (heals are sign-coded green client-side).
      ...(fxDelta < 0 && isDamageType(damageType)
        ? { damageType: damageType.trim().toLowerCase() }
        : {}),
      ...(died ? { effect: 'death' as const } : {}),
    });
  // PCs track death saves at 0 HP: healing above 0 resets them; taking damage
  // while already down adds a failure (5e auto-fail).
  if (kind === 'pc') {
    const ch = entity as Character;
    let ds = ch.deathSaves;
    if (amount < 0 && nextCur > 0 && (ds.successes || ds.failures)) {
      ds = { successes: 0, failures: 0 };
    } else if (amount > 0 && entity.curHp === 0 && ds.failures < 3) {
      // Taking damage while down adds a failure; a stable creature (3✓) becomes
      // unstable and resumes dying with that one failure.
      const wasStable = ds.successes >= 3;
      ds = {
        successes: wasStable ? 0 : ds.successes,
        failures: wasStable ? 1 : Math.min(3, ds.failures + 1),
      };
    }
    db.prepare(
      'UPDATE characters SET cur_hp = ?, temp_hp = ?, death_successes = ?, death_failures = ? WHERE id = ?',
    ).run(nextCur, nextTemp, ds.successes, ds.failures, refId);
    return getCharacter(refId);
  }
  db.prepare(`UPDATE ${table} SET cur_hp = ?, temp_hp = ? WHERE id = ?`).run(
    nextCur,
    nextTemp,
    refId,
  );
  return getMonster(refId);
}

/** Set a creature's temporary-HP buffer to an exact amount (mirrors the
 *  StatBlock edit field, but as a quick in-combat action). Temp HP is a flat
 *  2024-rules pool drained before real HP by {@link applyDamage}; granting it
 *  never touches real HP. Clamped non-negative. */
export function setTempHp(
  kind: TokenKind,
  refId: string,
  amount: number,
): Character | Monster | null {
  const table = kind === 'pc' ? 'characters' : 'monsters';
  const entity = kind === 'pc' ? getCharacter(refId) : getMonster(refId);
  if (!entity || !Number.isFinite(amount)) return null;
  const next = Math.trunc(Math.max(0, Math.min(10000, amount)));
  db.prepare(`UPDATE ${table} SET temp_hp = ? WHERE id = ?`).run(next, refId);
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
  // Stamp the current combat round (when combat is running) for manual duration
  // tracking — applied to the new condition and any cascaded ones.
  const round = getSessionById(entity.sessionId)?.combatRound || 0;
  const stamp = (c: Condition): Condition =>
    round > 0 && c.round === undefined ? { ...c, round } : c;
  const conditions = entity.conditions.filter(
    (c) => c.label.toLowerCase() !== condition.label.toLowerCase(),
  );
  conditions.push(stamp(condition));
  // Cascade the implied bundle (Unconscious → Incapacitated + Prone, etc.) so
  // applying one chip sets the conditions it always carries in 5e.
  for (const label of impliedConditions(condition.label)) {
    if (!conditions.some((c) => c.label.toLowerCase() === label.toLowerCase()))
      conditions.push(stamp({ id: newId(), label, aura: 'red', isConcentration: false }));
  }
  db.prepare(`UPDATE ${table} SET conditions = ? WHERE id = ?`).run(
    JSON.stringify(conditions),
    refId,
  );
  return kind === 'pc' ? getCharacter(refId) : getMonster(refId);
}

/**
 * Start concentration on a creature for a named spell. 5e allows only one
 * concentration at a time, so any prior concentration condition is dropped first.
 * No-op if it's already concentrating on the same spell (avoids re-logging churn).
 */
export function setConcentration(
  kind: TokenKind,
  refId: string,
  spellName: string,
): { changed: boolean } {
  const table = kind === 'pc' ? 'characters' : 'monsters';
  const entity = kind === 'pc' ? getCharacter(refId) : getMonster(refId);
  if (!entity) return { changed: false };
  const label = `Concentration: ${spellName}`;
  if (entity.conditions.some((c) => c.isConcentration && c.label === label))
    return { changed: false };
  const conditions = entity.conditions.filter((c) => !c.isConcentration);
  conditions.push({ id: newId(), label, aura: 'blue', isConcentration: true });
  db.prepare(`UPDATE ${table} SET conditions = ? WHERE id = ?`).run(
    JSON.stringify(conditions),
    refId,
  );
  return { changed: true };
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
