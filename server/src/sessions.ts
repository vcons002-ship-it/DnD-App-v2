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
import { getLibraryCharacter } from './library.js';
import { deriveClassResources } from './data/classTables.js';
import { abilityMod } from '../../shared/skills.js';
import { weaponsFromActions } from '../../shared/monsterAttacks.js';
import type {
  Character,
  CombatRole,
  Condition,
  FogLayer,
  MapState,
  Measurement,
  Monster,
  RollEntry,
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
  widthFt: number,
): void {
  db.prepare(
    'UPDATE maps SET grid_size_px = ?, feet_per_square = ?, width_ft = ? WHERE id = ?',
  ).run(gridSizePx, feetPerSquare, widthFt, mapId);
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
export function deleteMap(mapId: string): void {
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
    `INSERT INTO tokens (id, map_id, kind, ref_id, x, y, size, width_ft, initiative, is_hidden, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 1, 5, NULL, ?, ?)`,
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

/** Resize a token by its real footprint WIDTH IN FEET (min 2.5ft = Tiny). The
 *  legacy square `size` is kept in sync (widthFt / 5) for back-compat. */
export function resizeToken(tokenId: string, widthFt: number): Token | null {
  const w = Math.max(2.5, widthFt);
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
  for (const id of tokenIds) stmt.run(hide ? 1 : 0, id);
}

/** Override (role) or clear (null → auto-derive) the combat role across tokens. */
export function setTokensCombatRole(
  tokenIds: string[],
  role: Token['combatRoleOverride'],
): void {
  const stmt = db.prepare(
    'UPDATE tokens SET combat_role_override = ? WHERE id = ?',
  );
  for (const id of tokenIds) stmt.run(role, id);
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

/** Damage (+) / heal (−) every listed token's creature (AOE). */
export function damageTokens(tokenIds: string[], amount: number): void {
  for (const id of tokenIds) {
    const t = getToken(id);
    if (t) applyDamage(t.kind, t.refId, amount);
  }
}

/** Hide/show every listed token from players. */
export function setTokensHidden(tokenIds: string[], hidden: boolean): void {
  const stmt = db.prepare('UPDATE tokens SET is_hidden = ? WHERE id = ?');
  for (const id of tokenIds) stmt.run(hidden ? 1 : 0, id);
}

/** Apply one condition to every listed token's creature (own id per creature). */
export function setTokensCondition(
  tokenIds: string[],
  condition: Omit<Condition, 'id'>,
): void {
  for (const id of tokenIds) {
    const t = getToken(id);
    if (t) setCondition(t.kind, t.refId, { id: newId(), ...condition });
  }
}

/** Clear ALL conditions from every listed token's creature. */
export function clearTokensConditions(tokenIds: string[]): void {
  for (const id of tokenIds) {
    const t = getToken(id);
    if (!t) continue;
    const table = t.kind === 'pc' ? 'characters' : 'monsters';
    db.prepare(`UPDATE ${table} SET conditions = '[]' WHERE id = ?`).run(
      t.refId,
    );
  }
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
export function duplicateToken(tokenId: string): Token | null {
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
    const inst = insertMonster(
      src.sessionId,
      {
        name: src.name,
        maxHp: src.maxHp,
        creatureType: src.creatureType,
        armorClass: src.armorClass,
        speed: src.speed,
        stats: src.stats,
        resistances: src.resistances,
        weaknesses: src.weaknesses,
        actions: src.actions,
        abilities: src.abilities,
        weapons: src.weapons,
        level: src.level,
        icon: src.icon,
        disposition: src.disposition,
        source: src.source,
      },
      { isTemplate: false, templateId: template_id, name },
    );
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
}

// ---- Initiative turn order (operates on the active map) ----

export function setActiveTurn(sessionId: string, tokenId: string | null): void {
  db.prepare(
    'UPDATE sessions SET active_turn_token_id = ? WHERE id = ?',
  ).run(tokenId, sessionId);
}

/** A token's initiative bonus = its creature's DEX modifier (0 if unknown). */
function initiativeBonus(token: Token): number {
  const entity =
    token.kind === 'pc' ? getCharacter(token.refId) : getMonster(token.refId);
  return entity ? abilityMod(entity.stats.DEX) : 0;
}

/** A d20 + DEX modifier for a token (5e initiative). */
const rollInitiative = (token: Token): number =>
  Math.floor(Math.random() * 20) + 1 + initiativeBonus(token);

/** Roll initiative (d20 + DEX) for EVERY token on a map (resets the round). */
export function rollAllInitiative(mapId: string): void {
  const roll = db.prepare('UPDATE tokens SET initiative = ? WHERE id = ?');
  for (const t of listTokens(mapId)) {
    roll.run(rollInitiative(t), t.id);
  }
}

/** Roll only for tokens that haven't rolled yet (e.g. latecomers to combat). */
export function rollMissingInitiative(mapId: string): void {
  const roll = db.prepare('UPDATE tokens SET initiative = ? WHERE id = ?');
  for (const t of listTokens(mapId)) {
    if (t.initiative === null) roll.run(rollInitiative(t), t.id);
  }
}

/** Tokens with initiative on a map, ordered for turn-taking (desc, ties stable). */
function initiativeOrder(mapId: string): Token[] {
  return listTokens(mapId)
    .filter((t) => t.initiative !== null)
    .sort((a, b) => (b.initiative ?? 0) - (a.initiative ?? 0));
}

/** The token at the top of the initiative order, or null. */
export function firstInInitiative(mapId: string): string | null {
  return initiativeOrder(mapId)[0]?.id ?? null;
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
  },
): RollEntry {
  const id = newId();
  const createdAt = Date.now();
  db.prepare(
    `INSERT INTO roll_log (id, session_id, roller, label, expr, total, detail, description, apply, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
    createdAt,
  );
  return { id, ...entry, createdAt };
}

/** Wipe the shared roll log for a session. */
export function clearRollLog(sessionId: string): void {
  db.prepare('DELETE FROM roll_log WHERE session_id = ?').run(sessionId);
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
  created_at: number;
};

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
  const derived = deriveClassResources(opts.className ?? '', level, opts.stats ?? {});
  const spellSlots = opts.spellSlots ?? derived.spellSlots;
  const resources = opts.resources ?? derived.resources;
  db.prepare(
    `INSERT INTO characters
       (id, session_id, name, race, class_name, level, max_hp, cur_hp,
        armor_class, speed, stats, weapons, resistances, weaknesses,
        actions, abilities, proficient_skills, save_proficiencies, items,
        sheet_abilities, spell_slots, resources, icon)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    sessionId,
    opts.name.trim() || 'Adventurer',
    opts.race ?? '',
    opts.className ?? '',
    level,
    maxHp,
    Math.max(0, Math.min(maxHp, curHp)),
    opts.armorClass ?? 0,
    opts.speed ?? '',
    JSON.stringify(opts.stats ?? {}),
    JSON.stringify(opts.weapons ?? []),
    JSON.stringify(opts.resistances ?? []),
    JSON.stringify(opts.weaknesses ?? []),
    JSON.stringify(opts.actions ?? []),
    JSON.stringify(opts.abilities ?? []),
    JSON.stringify(opts.proficientSkills ?? []),
    JSON.stringify(opts.saveProficiencies ?? []),
    JSON.stringify(opts.items ?? []),
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

export function setItem(
  characterId: string,
  item: Character['items'][number],
): Character | null {
  const c = getCharacter(characterId);
  if (!c) return null;
  const items = c.items.filter((i) => i.id !== item.id);
  items.push({
    id: item.id || newId(),
    name: item.name,
    qty: item.qty,
    note: item.note ?? '',
  });
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

/** Upsert a spell/ability on a character's sheet (by id). */
export function setSheetAbility(
  characterId: string,
  ability: Character['sheetAbilities'][number],
): Character | null {
  const c = getCharacter(characterId);
  if (!c) return null;
  const list = c.sheetAbilities.filter((a) => a.id !== ability.id);
  list.push({ ...ability, id: ability.id || newId() });
  db.prepare('UPDATE characters SET sheet_abilities = ? WHERE id = ?').run(
    JSON.stringify(list),
    characterId,
  );
  // Adding the first maneuver seeds the Battle Master pool: a Superiority Dice
  // counter + a default d8 die size (left alone if the character already has them).
  if (ability.type === 'maneuver') {
    if (!c.resources['Superiority Dice'])
      setResource(characterId, 'resources', 'Superiority Dice', { max: 4, used: 0 });
    if (!c.superiorityDie)
      db.prepare('UPDATE characters SET superiority_die = ? WHERE id = ?').run(
        'd8',
        characterId,
      );
  }
  return getCharacter(characterId);
}

export function removeSheetAbility(
  characterId: string,
  abilityId: string,
): Character | null {
  const c = getCharacter(characterId);
  if (!c) return null;
  db.prepare('UPDATE characters SET sheet_abilities = ? WHERE id = ?').run(
    JSON.stringify(c.sheetAbilities.filter((a) => a.id !== abilityId)),
    characterId,
  );
  return getCharacter(characterId);
}

/** Patch editable fields of a character (DM or the owning player). */
export function updateCharacter(
  characterId: string,
  patch: Partial<{
    name: string;
    race: string;
    className: string;
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
    items: Character['items'];
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
  if (patch.weapons !== undefined) put('weapons', JSON.stringify(patch.weapons));
  if (patch.actions !== undefined) put('actions', JSON.stringify(patch.actions));
  if (patch.abilities !== undefined)
    put('abilities', JSON.stringify(patch.abilities));
  if (patch.proficientSkills !== undefined)
    put('proficient_skills', JSON.stringify(patch.proficientSkills));
  if (patch.saveProficiencies !== undefined)
    put('save_proficiencies', JSON.stringify(patch.saveProficiencies));
  if (patch.items !== undefined) put('items', JSON.stringify(patch.items));
  if (patch.spellSlots !== undefined)
    put('spell_slots', JSON.stringify(patch.spellSlots));
  if (patch.resources !== undefined)
    put('resources', JSON.stringify(patch.resources));

  // Re-derive spell slots / class resources when level or class changes, unless
  // the caller passed them explicitly (preserve `used` + any custom counters).
  if (
    (patch.level !== undefined || patch.className !== undefined) &&
    patch.spellSlots === undefined &&
    patch.resources === undefined
  ) {
    const derived = deriveClassResources(
      patch.className ?? c.className,
      patch.level ?? c.level,
      patch.stats ?? c.stats,
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
): Character | null {
  // A player holds exactly one character — release any prior claim first so
  // "change character" frees the old one instead of orphaning it.
  releaseClaims(socketId);
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
  actions?: Monster['actions'];
  abilities?: Monster['abilities'];
  weapons?: Monster['weapons'];
  icon?: string;
  disposition?: Monster['disposition'];
  source?: Monster['source'];
};

function insertMonster(
  sessionId: string,
  opts: MonsterInput,
  meta: { isTemplate: boolean; templateId: string | null; name: string },
): Monster {
  const id = newId();
  const type = opts.creatureType ?? '';
  const icon = opts.icon || iconForCreature(meta.name, type);
  db.prepare(
    `INSERT INTO monsters
       (id, session_id, name, creature_type, max_hp, cur_hp,
        resistances, weaknesses, abilities, source, icon,
        armor_class, speed, stats, actions, is_template, template_id,
        disposition, weapons, level)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    sessionId,
    meta.name,
    type,
    opts.maxHp,
    opts.maxHp,
    JSON.stringify(opts.resistances ?? []),
    JSON.stringify(opts.weaknesses ?? []),
    JSON.stringify(opts.abilities ?? []),
    opts.source ?? 'manual',
    icon,
    opts.armorClass ?? 0,
    opts.speed ?? '',
    JSON.stringify(opts.stats ?? {}),
    JSON.stringify(opts.actions ?? []),
    meta.isTemplate ? 1 : 0,
    meta.templateId,
    opts.disposition ?? 'enemy',
    JSON.stringify(opts.weapons ?? []),
    opts.level ?? 0,
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

/** Create a reusable creature template (one spawn button). */
export function createMonsterTemplate(
  sessionId: string,
  opts: MonsterInput,
): Monster {
  const base = opts.name.trim() || 'Creature';
  // Give monsters rollable attacks: when no structured weapons are supplied,
  // derive them from the free-text actions (e.g. "+4 to hit, 1d6+2 slashing").
  let input = opts;
  if ((!opts.weapons || opts.weapons.length === 0) && opts.actions?.length) {
    const { weapons, actions } = weaponsFromActions(opts.actions);
    if (weapons.length) input = { ...opts, weapons, actions };
  }
  return insertMonster(sessionId, input, {
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
  return insertMonster(
    tmpl.sessionId,
    {
      name: tmpl.name,
      maxHp: tmpl.maxHp,
      creatureType: tmpl.creatureType,
      armorClass: tmpl.armorClass,
      speed: tmpl.speed,
      stats: tmpl.stats,
      resistances: tmpl.resistances,
      weaknesses: tmpl.weaknesses,
      actions: tmpl.actions,
      abilities: tmpl.abilities,
      weapons: tmpl.weapons,
      level: tmpl.level,
      icon: tmpl.icon,
      disposition: tmpl.disposition,
      source: tmpl.source,
    },
    { isTemplate: false, templateId, name: `${tmpl.name} ${n}` },
  );
}

/** Duplicate a creature template into a new independent template. */
export function copyMonster(monsterId: string): Monster | null {
  const m = getMonster(monsterId);
  if (!m) return null;
  return createMonsterTemplate(m.sessionId, {
    name: m.name,
    maxHp: m.maxHp,
    creatureType: m.creatureType,
    armorClass: m.armorClass,
    speed: m.speed,
    stats: m.stats,
    resistances: m.resistances,
    weaknesses: m.weaknesses,
    actions: m.actions,
    abilities: m.abilities,
    weapons: m.weapons,
    level: m.level,
    icon: m.icon,
    disposition: m.disposition,
    source: m.source,
  });
}

/** Patch editable fields of a creature (template or instance). DM-only. */
export function updateMonster(
  monsterId: string,
  patch: Partial<{
    disposition: Monster['disposition'];
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
    icon: string;
  }>,
): Monster | null {
  const m = getMonster(monsterId);
  if (!m) return null;

  // Map each patchable field to its column + serialized value.
  const sets: string[] = [];
  const vals: unknown[] = [];
  const put = (col: string, v: unknown) => {
    sets.push(`${col} = ?`);
    vals.push(v);
  };
  if (patch.disposition !== undefined) put('disposition', patch.disposition);
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
  if (patch.weapons !== undefined) put('weapons', JSON.stringify(patch.weapons));
  if (patch.actions !== undefined) put('actions', JSON.stringify(patch.actions));
  if (patch.abilities !== undefined)
    put('abilities', JSON.stringify(patch.abilities));

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
  db.prepare('DELETE FROM tokens WHERE kind = ? AND ref_id = ?').run(
    'monster',
    monsterId,
  );
  db.prepare('DELETE FROM monsters WHERE id = ?').run(monsterId);
}

/** Remove a player character (and any of its placed tokens) from the session.
 *  Tokens reference characters by ref_id (no FK cascade), so delete them too. */
export function deleteCharacter(characterId: string): void {
  db.prepare('DELETE FROM tokens WHERE kind = ? AND ref_id = ?').run(
    'pc',
    characterId,
  );
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

export function applyDamage(
  kind: TokenKind,
  refId: string,
  amount: number,
): Character | Monster | null {
  const table = kind === 'pc' ? 'characters' : 'monsters';
  const entity = kind === 'pc' ? getCharacter(refId) : getMonster(refId);
  if (!entity) return null;
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
  db.prepare(`UPDATE ${table} SET cur_hp = ?, temp_hp = ? WHERE id = ?`).run(
    nextCur,
    nextTemp,
    refId,
  );
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
