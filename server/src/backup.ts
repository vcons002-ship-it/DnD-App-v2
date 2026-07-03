// Full-session export / import ("backup & restore"). A session is serialised to
// a single self-contained JSON bundle — every session-scoped row PLUS the
// uploaded images it references, inlined as base64 — so it survives moving to a
// different machine or a wiped data folder. Import ALWAYS creates a brand-new
// session (fresh ids + code); it never touches an existing one, so a malformed
// or partial bundle can at worst produce a broken new session, never corrupt a
// live campaign. The whole import runs in one transaction (all-or-nothing).
import fs from 'node:fs';
import path from 'node:path';
import { db, newId, newSessionCode } from './db.js';
import { normalizeSessionCode, SessionCodeError } from './sessions.js';
import { config } from './config.js';

type Row = Record<string, unknown>;

export type SessionBundle = {
  version: 1;
  exportedAt: number;
  session: Row;
  maps: Row[];
  tokens: Row[];
  characters: Row[];
  monsters: Row[];
  measurements: Row[];
  annotations: Row[];
  mapImages: Row[];
  rollLog: Row[];
  chat: Row[];
  /** uploaded filename (no path) -> base64 contents */
  assets: Record<string, string>;
};

/** Cap on total inlined image bytes, so a giant campaign can't OOM the export. */
const MAX_ASSET_BYTES = 300 * 1024 * 1024;

const all = (sql: string, ...args: unknown[]): Row[] =>
  db.prepare(sql).all(...args) as Row[];

/** A safe uploads filename: no path separators, no traversal. */
const safeUploadName = (f: string): boolean =>
  !!f && !f.includes('/') && !f.includes('\\') && !f.includes('..');

/**
 * Serialise one session (by code) into a portable bundle, or null if the code
 * doesn't exist. Referenced `/uploads/<file>` images are inlined as base64 so
 * the bundle is self-contained.
 */
export function exportSession(code: string): SessionBundle | null {
  const session = db.prepare('SELECT * FROM sessions WHERE code = ?').get(code) as
    | Row
    | undefined;
  if (!session) return null;
  const sid = session.id as string;

  const bundle: SessionBundle = {
    version: 1,
    exportedAt: Date.now(),
    session,
    maps: all('SELECT * FROM maps WHERE session_id = ?', sid),
    // tokens have no session_id — reach them through their map.
    tokens: all(
      'SELECT t.* FROM tokens t JOIN maps m ON t.map_id = m.id WHERE m.session_id = ?',
      sid,
    ),
    characters: all('SELECT * FROM characters WHERE session_id = ?', sid),
    monsters: all('SELECT * FROM monsters WHERE session_id = ?', sid),
    measurements: all('SELECT * FROM measurements WHERE session_id = ?', sid),
    annotations: all('SELECT * FROM annotations WHERE session_id = ?', sid),
    mapImages: all('SELECT * FROM map_images WHERE session_id = ?', sid),
    rollLog: all('SELECT * FROM roll_log WHERE session_id = ?', sid),
    chat: all('SELECT * FROM chat_messages WHERE session_id = ?', sid),
    assets: {},
  };

  // Inline every referenced upload (map images, icons, decals — wherever a
  // `/uploads/<file>` path appears, including inside JSON columns).
  const refs = new Set<string>();
  const scan = JSON.stringify({ ...bundle, assets: undefined });
  for (const m of scan.matchAll(/\/uploads\/([A-Za-z0-9._-]+)/g)) refs.add(m[1]);
  let total = 0;
  for (const file of refs) {
    if (!safeUploadName(file)) continue;
    try {
      const buf = fs.readFileSync(path.join(config.uploadsDir, file));
      total += buf.length;
      if (total > MAX_ASSET_BYTES) break; // safety cap; import just misses these
      bundle.assets[file] = buf.toString('base64');
    } catch {
      /* file gone — skip; the reference stays but resolves to a broken image */
    }
  }
  return bundle;
}

const colCache = new Map<string, string[]>();
const tableCols = (table: string): string[] => {
  let c = colCache.get(table);
  if (!c) {
    c = (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map(
      (r) => r.name,
    );
    colCache.set(table, c);
  }
  return c;
};

/** Insert `row` (+ overrides) into `table`, using only the columns the table
 *  actually has (so migrated columns ride along, and columns a bundle lacks fall
 *  back to their DB default). `undefined` values are omitted; explicit `null` is
 *  written. */
function insertRow(table: string, row: Row, overrides: Row): void {
  const merged = { ...row, ...overrides };
  const cols = tableCols(table).filter((c) => c in merged && merged[c] !== undefined);
  db.prepare(
    `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`,
  ).run(...cols.map((c) => merged[c] as never));
}

const codeTaken = (c: string): boolean =>
  !!db.prepare('SELECT 1 FROM sessions WHERE code = ?').get(c);

function pickCode(custom?: string): string {
  if (custom && custom.trim()) {
    const c = normalizeSessionCode(custom);
    if (c.length < 3) throw new SessionCodeError('Code must be at least 3 letters or digits.');
    if (codeTaken(c)) throw new SessionCodeError(`Code "${c}" is already in use.`);
    return c;
  }
  let c = newSessionCode();
  while (codeTaken(c)) c = newSessionCode();
  return c;
}

/**
 * Restore a bundle as a NEW session (fresh ids + code; images written as fresh
 * files). Returns the new code. Throws SessionCodeError for a bad custom code.
 * Atomic: any failure rolls the whole thing back and touches no other session.
 */
export const importSession = db.transaction(
  (bundle: SessionBundle, customCode?: string): { code: string; name: string } => {
    if (!bundle || bundle.version !== 1 || !bundle.session)
      throw new Error('Unrecognized or corrupt backup file.');

    // 1. Write each inlined asset under a fresh filename; map old path -> new.
    const pathMap = new Map<string, string>();
    for (const [file, b64] of Object.entries(bundle.assets ?? {})) {
      if (!safeUploadName(file)) continue;
      const ext = path.extname(file) || '.png';
      const newFile = `${newId()}${ext}`;
      fs.writeFileSync(path.join(config.uploadsDir, newFile), Buffer.from(b64, 'base64'));
      pathMap.set(`/uploads/${file}`, `/uploads/${newFile}`);
    }

    // 2. Deep-rewrite every upload path in the rows (covers nested JSON columns),
    //    working on a copy so the caller's bundle is untouched.
    let data: SessionBundle = JSON.parse(
      JSON.stringify({ ...bundle, assets: undefined }),
    );
    if (pathMap.size) {
      let j = JSON.stringify(data);
      for (const [oldP, newP] of pathMap) j = j.split(oldP).join(newP);
      data = JSON.parse(j);
    }

    // 3. Pre-generate fresh ids for everything a foreign key points at.
    const remap = (rows: Row[]) =>
      new Map(rows.map((r) => [r.id as string, newId()] as const));
    const mapIds = remap(data.maps);
    const charIds = remap(data.characters);
    const monIds = remap(data.monsters);
    const tokIds = remap(data.tokens);
    const newRef = (id: unknown, m: Map<string, string>): string | null =>
      typeof id === 'string' ? m.get(id) ?? null : null;

    // 4. The session row (carrying combat_round / hide_dm_rolls etc.), with a
    //    fresh id + code; active map/turn are wired up at the end.
    const sid = newId();
    const code = pickCode(customCode);
    const now = Date.now();
    const name = String(data.session.name ?? 'Imported session');
    insertRow('sessions', data.session, {
      id: sid,
      code,
      name,
      active_map_id: null,
      active_turn_token_id: null,
      created_at: now,
      last_played_at: now,
    });

    // 5. Creatures first (tokens reference them). Drop live claims/owners.
    for (const c of data.characters)
      insertRow('characters', c, {
        id: charIds.get(c.id as string),
        session_id: sid,
        claimed_by: null,
        owner_id: null,
      });
    for (const m of data.monsters)
      insertRow('monsters', m, {
        id: monIds.get(m.id as string),
        session_id: sid,
        template_id: newRef(m.template_id, monIds),
      });

    // 6. Maps, then their tokens (ref_id -> the remapped creature).
    for (const mp of data.maps)
      insertRow('maps', mp, { id: mapIds.get(mp.id as string), session_id: sid });
    for (const t of data.tokens) {
      const ref = newRef(t.ref_id, t.kind === 'pc' ? charIds : monIds);
      const map = newRef(t.map_id, mapIds);
      if (!ref || !map) continue; // dangling reference — skip rather than break
      insertRow('tokens', t, { id: tokIds.get(t.id as string), map_id: map, ref_id: ref });
    }

    // 7. Per-map extras + the session-wide logs.
    for (const r of data.measurements)
      insertRow('measurements', r, {
        id: newId(),
        session_id: sid,
        map_id: newRef(r.map_id, mapIds),
        token_id: newRef(r.token_id, tokIds),
      });
    for (const r of data.annotations)
      insertRow('annotations', r, {
        id: newId(),
        session_id: sid,
        map_id: newRef(r.map_id, mapIds),
      });
    for (const r of data.mapImages)
      insertRow('map_images', r, {
        id: newId(),
        session_id: sid,
        map_id: newRef(r.map_id, mapIds),
      });
    for (const r of data.rollLog)
      insertRow('roll_log', r, { id: newId(), session_id: sid });
    for (const r of data.chat)
      insertRow('chat_messages', r, { id: newId(), session_id: sid });

    // 8. Wire up the active map + turn marker (now that they exist).
    db.prepare(
      'UPDATE sessions SET active_map_id = ?, active_turn_token_id = ? WHERE id = ?',
    ).run(
      newRef(data.session.active_map_id, mapIds),
      newRef(data.session.active_turn_token_id, tokIds),
      sid,
    );

    return { code, name };
  },
);
