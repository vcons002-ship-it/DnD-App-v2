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
  encounterTags?: Row[];
  exploredTerrain?: Row[];
  characters: Row[];
  monsters: Row[];
  measurements: Row[];
  annotations: Row[];
  mapImages: Row[];
  rollLog: Row[];
  chat: Row[];
  /** uploaded filename (no path) -> base64 contents */
  assets: Record<string, string>;
  /** Referenced chat attachments live outside the public uploads directory. */
  chatImages?: Row[];
  /** Original chat image id -> base64 contents, separate from public assets. */
  privateChatAssets?: Record<string, string>;
  /** Explicitly report omissions; never label an incomplete export self-contained. */
  assetWarnings?: string[];
};

/** Cap on total inlined image bytes, so a giant campaign can't OOM the export. */
const MAX_ASSET_BYTES = 300 * 1024 * 1024;

const all = (sql: string, ...args: unknown[]): Row[] =>
  db.prepare(sql).all(...args) as Row[];

/** A safe uploads filename: no path separators, no traversal. */
const safeUploadName = (f: string): boolean =>
  !!f && !f.includes('/') && !f.includes('\\') && !f.includes('..');

const PRIVATE_IMAGE_EXT: Record<string, string> = {
  'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp', 'image/gif': '.gif',
};
const privateImagesDir = (): string => path.join(config.dataDir, 'private-chat-images');
/** Private attachment filenames are generated UUIDs with a known raster type. */
const safePrivateImage = (row: Row): boolean =>
  typeof row.file_name === 'string' && typeof row.mime === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpg|webp|gif)$/i.test(row.file_name) &&
  path.extname(row.file_name).toLowerCase() === PRIVATE_IMAGE_EXT[row.mime];

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
    encounterTags: all('SELECT t.* FROM encounter_tags t JOIN maps m ON t.map_id = m.id WHERE m.session_id = ?', sid),
    exploredTerrain: all('SELECT t.* FROM explored_terrain t JOIN maps m ON t.map_id = m.id WHERE m.session_id = ?', sid),
    characters: all('SELECT * FROM characters WHERE session_id = ?', sid),
    monsters: all('SELECT * FROM monsters WHERE session_id = ?', sid),
    measurements: all('SELECT * FROM measurements WHERE session_id = ?', sid),
    annotations: all('SELECT * FROM annotations WHERE session_id = ?', sid),
    mapImages: all('SELECT * FROM map_images WHERE session_id = ?', sid),
    rollLog: all('SELECT * FROM roll_log WHERE session_id = ?', sid),
    chat: all('SELECT * FROM chat_messages WHERE session_id = ?', sid),
    assets: {},
    chatImages: all(
      'SELECT * FROM chat_images WHERE session_id = ? AND id IN (SELECT image_id FROM chat_messages WHERE session_id = ? AND image_id IS NOT NULL)',
      sid, sid,
    ),
    privateChatAssets: {},
  };

  // Inline every referenced upload (map images, icons, decals — wherever a
  // `/uploads/<file>` path appears, including inside JSON columns).
  const refs = new Set<string>();
  const scan = JSON.stringify({ ...bundle, assets: undefined });
  for (const m of scan.matchAll(/\/uploads\/([A-Za-z0-9._-]+)/g)) refs.add(m[1]);
  let total = 0;
  const warnings: string[] = [];
  for (const file of refs) {
    if (!safeUploadName(file)) { warnings.push(`Unsafe upload reference: ${file}`); continue; }
    try {
      const size = fs.statSync(path.join(config.uploadsDir, file)).size;
      if (total + size > MAX_ASSET_BYTES) {
        warnings.push(`Asset capacity exceeded: ${file}`);
        continue;
      }
      const buf = fs.readFileSync(path.join(config.uploadsDir, file));
      if (total + buf.length > MAX_ASSET_BYTES) { warnings.push(`Asset capacity exceeded: ${file}`); continue; }
      total += buf.length;
      bundle.assets[file] = buf.toString('base64');
    } catch {
      warnings.push(`Unreadable upload: ${file}`);
    }
  }
  const imagesById = new Map(bundle.chatImages!.map((image) => [image.id, image]));
  for (const id of new Set(bundle.chat.map((message) => message.image_id).filter((id) => typeof id === 'string'))) {
    const image = imagesById.get(id);
    if (!image) { warnings.push(`Missing private chat image: ${id}`); continue; }
    if (!safePrivateImage(image)) { warnings.push(`Unsafe private chat image: ${id}`); continue; }
    try {
      const file = path.join(privateImagesDir(), image.file_name as string);
      const size = fs.statSync(file).size;
      if (total + size > MAX_ASSET_BYTES) {
        warnings.push(`Asset capacity exceeded: private chat image ${id}`);
        continue;
      }
      const bytes = fs.readFileSync(file);
      if (total + bytes.length > MAX_ASSET_BYTES) {
        warnings.push(`Asset capacity exceeded: private chat image ${id}`);
        continue;
      }
      total += bytes.length;
      bundle.privateChatAssets![id as string] = bytes.toString('base64');
    } catch {
      warnings.push(`Unreadable private chat image: ${id}`);
    }
  }
  if (warnings.length) bundle.assetWarnings = warnings;
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
 *  written. Exported so the undo stack can re-insert captured rows verbatim. */
export function insertRow(table: string, row: Row, overrides: Row = {}): void {
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
const importSessionRows = db.transaction(
  (bundle: SessionBundle, customCode: string | undefined, writtenPrivateFiles: string[]): { code: string; name: string } => {
    if (!bundle || bundle.version !== 1 || !bundle.session)
      throw new Error('Unrecognized or corrupt backup file.');

    // 1. Write each inlined asset under a fresh filename; map old path -> new.
    const pathMap = new Map<string, string>();
    let totalAssetBytes = 0;
    for (const [file, b64] of Object.entries(bundle.assets ?? {})) {
      if (!safeUploadName(file)) continue;
      const ext = path.extname(file) || '.png';
      const newFile = `${newId()}${ext}`;
      const bytes = Buffer.from(b64, 'base64');
      totalAssetBytes += bytes.length;
      if (totalAssetBytes > MAX_ASSET_BYTES) throw new Error('Backup image capacity exceeded.');
      fs.writeFileSync(path.join(config.uploadsDir, newFile), bytes);
      pathMap.set(`/uploads/${file}`, `/uploads/${newFile}`);
    }

    // 2. Deep-rewrite every upload path in the rows (covers nested JSON columns),
    //    working on a copy so the caller's bundle is untouched.
    let data: SessionBundle = JSON.parse(
      JSON.stringify({ ...bundle, assets: undefined, privateChatAssets: undefined }),
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

    // 5. Creatures first (tokens reference them). Drop live claims/owners so an
    //    imported copy doesn't auto-reclaim a player onto "their" PC in it (the
    //    durable owner column is owner_player_id — a typo'd `owner_id` was silently
    //    dropped by insertRow's column intersection, leaving the owner imported).
    for (const c of data.characters)
      insertRow('characters', c, {
        id: charIds.get(c.id as string),
        session_id: sid,
        claimed_by: null,
        owner_player_id: null,
      });
    for (const m of data.monsters)
      insertRow('monsters', m, {
        id: monIds.get(m.id as string),
        session_id: sid,
        template_id: newRef(m.template_id, monIds),
      });

    // Restore only attachments referenced by chat. New IDs/files prevent imports
    // from sharing access with their source campaign, and uploader keys do not
    // carry into a copy whose character ownership is intentionally cleared.
    const imageIds = new Map<string, string>();
    const referencedImages = new Set(data.chat.map((message) => message.image_id));
    for (const image of data.chatImages ?? []) {
      if (typeof image.id !== 'string' || !referencedImages.has(image.id)) continue;
      if (!safePrivateImage(image)) throw new Error('Invalid private chat image metadata.');
      const encoded = bundle.privateChatAssets?.[image.id];
      // An incomplete export may retain metadata for a missing file. Keep its
      // text history, but never link the import back to a source attachment.
      if (encoded === undefined) continue;
      if (typeof encoded !== 'string' || !encoded.length || encoded.length % 4 !== 0 ||
          !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded))
        throw new Error('Invalid private chat image contents.');
      const bytes = Buffer.from(encoded, 'base64');
      totalAssetBytes += bytes.length;
      if (totalAssetBytes > MAX_ASSET_BYTES) throw new Error('Backup image capacity exceeded.');
      const id = newId(), fileName = `${id}${PRIVATE_IMAGE_EXT[image.mime as string]}`;
      fs.mkdirSync(privateImagesDir(), { recursive: true });
      const file = path.join(privateImagesDir(), fileName);
      fs.writeFileSync(file, bytes, { flag: 'wx' });
      writtenPrivateFiles.push(file);
      insertRow('chat_images', image, {
        id, session_id: sid, uploader_owner_id: null, file_name: fileName,
      });
      imageIds.set(image.id, id);
    }

    // 6. Maps, then their tokens (ref_id -> the remapped creature).
    for (const mp of data.maps)
      insertRow('maps', mp, { id: mapIds.get(mp.id as string), session_id: sid,
        ...(typeof mp.walls==='string'?{walls:JSON.stringify(JSON.parse(mp.walls).map((w:{tokenId?:string})=>({...w,...(w.tokenId?{tokenId:newRef(w.tokenId,tokIds)}:{})})))}:{}) });
    for (const t of data.tokens) {
      const ref = newRef(t.ref_id, t.kind === 'pc' ? charIds : monIds);
      const map = newRef(t.map_id, mapIds);
      if (!ref || !map) continue; // dangling reference — skip rather than break
      insertRow('tokens', t, { id: tokIds.get(t.id as string), map_id: map, ref_id: ref });
    }

    for (const tag of data.encounterTags ?? []) {
      const map = newRef(tag.map_id, mapIds);
      if (!map) continue;
      insertRow('encounter_tags', tag, { map_id: map, token_id: newRef(tag.token_id, tokIds) ?? newId() });
    }

    // 7. Per-map extras + the session-wide logs.
    for(const explored of data.exploredTerrain??[]){
      const map=newRef(explored.map_id,mapIds);
      if(map){
        let memory:unknown[]=[];
        try{const value=JSON.parse(String(explored.token_memory??'[]'));if(Array.isArray(value))memory=value;}catch{}
        const remapped=memory.flatMap((item:any)=>{
          const t=item?.token,id=newRef(t?.id,tokIds),ref=newRef(t?.refId,t?.kind==='pc'?charIds:monIds);
          if(!id||!ref||t.mapId!==explored.map_id)return [];
          return [{token:{...t,id,mapId:map,refId:ref},...(item.monster?{monster:{...item.monster,id:ref}}:{})}];
        });
        insertRow('explored_terrain',explored,{map_id:map,token_memory:JSON.stringify(remapped)});
      }
    }
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
    for (const r of data.chat) {
      // Clear every imported private audience. DM-participating whispers stay
      // in the DM's archive; player-only conversations remain inaccessible.
      // Claiming a copied PC cannot grant a new owner its original history.
      const legacyWhisper = !r.chat_channel && !!(r.whisper_character_id || r.whisper_character_name || r.whisper_owner_id);
      const privateRecord = !!r.chat_channel || legacyWhisper;
      const includesDm = r.chat_channel ? r.chat_includes_dm === 1 : legacyWhisper;
      let participants: { characterId: string; characterName: string }[] = [];
      try {
        const parsed = typeof r.chat_participants === 'string' ? JSON.parse(r.chat_participants) : [];
        if (Array.isArray(parsed)) participants = parsed.filter((p) => p && typeof p.characterName === 'string')
          .map((p) => ({ characterId: newRef(p.characterId, charIds) ?? '', characterName: p.characterName }));
      } catch { /* old or malformed participant metadata has no live audience */ }
      if (legacyWhisper && !participants.length) participants = [{
        characterId: newRef(r.whisper_character_id, charIds) ?? '',
        characterName: String(r.whisper_character_name ?? 'Player'),
      }];
      insertRow('chat_messages', r, {
        id: newId(), session_id: sid,
        whisper_character_id: newRef(r.whisper_character_id, charIds),
        whisper_owner_id: null,
        image_id: newRef(r.image_id, imageIds),
        chat_channel: r.chat_channel ?? (legacyWhisper ? 'whisper' : null),
        chat_audience: '[]',
        chat_participants: JSON.stringify(participants),
        chat_includes_dm: includesDm ? 1 : 0,
        ...(privateRecord ? { dm_only: 1 } : {}),
      });
    }

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

/** Database rollback also removes any private files created by a failed import. */
export function importSession(bundle: SessionBundle, customCode?: string): { code: string; name: string } {
  const writtenPrivateFiles: string[] = [];
  try {
    return importSessionRows(bundle, customCode, writtenPrivateFiles);
  } catch (error) {
    for (const file of writtenPrivateFiles) {
      try { fs.unlinkSync(file); } catch { /* preserve the original restore error */ }
    }
    throw error;
  }
}
