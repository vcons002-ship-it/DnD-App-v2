// A small per-session undo stack for the DM's destructive actions (delete a
// token / creature, or "cover all" fog). Before such an action the handler
// captures the exact rows about to vanish (or the value about to be wiped) and
// pushes a closure that puts them back; `session:undo` pops and runs it.
//
// In-memory + bounded (ephemeral — an "oops" safety net, not durable history).
// Row restores re-insert VERBATIM (original ids), so tokens still reference
// their creatures. Restores run in a transaction; if the world moved on (e.g.
// the map is gone), it rolls back and the caller reports the failure.
import { db } from './db.js';
import { insertRow } from './backup.js';

type Row = Record<string, unknown>;
type Captured = { table: string; row: Row }[];
type UndoEntry = { label: string; run: () => void };

const STACK_CAP = 25;
const stacks = new Map<string, UndoEntry[]>();

export function pushUndo(sessionId: string, label: string, run: () => void): void {
  let s = stacks.get(sessionId);
  if (!s) stacks.set(sessionId, (s = []));
  s.push({ label, run });
  if (s.length > STACK_CAP) s.shift();
}

export function popUndo(sessionId: string): UndoEntry | undefined {
  return stacks.get(sessionId)?.pop();
}

/** Label of the action the next undo would reverse (for the DM's button), or null. */
export function peekUndo(sessionId: string): string | null {
  const s = stacks.get(sessionId);
  return s && s.length ? s[s.length - 1].label : null;
}

/** Token ids referencing a creature (tokens.ref_id has no FK cascade). */
function tokenIdsForRef(kind: string, refId: string): string[] {
  return (
    db.prepare('SELECT id FROM tokens WHERE kind = ? AND ref_id = ?').all(kind, refId) as {
      id: string;
    }[]
  ).map((r) => r.id);
}

function captureRows(specs: { table: string; ids: string[] }[]): Captured {
  const out: Captured = [];
  for (const { table, ids } of specs) {
    for (const id of ids) {
      const row = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id) as Row | undefined;
      if (row) out.push({ table, row });
    }
  }
  return out;
}

function restoreRows(captured: Captured): void {
  db.transaction(() => {
    for (const { table, row } of captured) {
      const exists = db.prepare(`SELECT 1 FROM ${table} WHERE id = ?`).get(row.id);
      if (!exists) insertRow(table, row); // verbatim, original id
    }
  })();
}

/** Snapshot a soon-to-be-deleted token and register its undo. */
export function captureTokenDelete(sessionId: string, tokenId: string): void {
  const rows = captureRows([{ table: 'tokens', ids: [tokenId] }]);
  if (rows.length) pushUndo(sessionId, 'Delete token', () => restoreRows(rows));
}

/** Snapshot a soon-to-be-deleted creature PLUS its placed tokens (both vanish),
 *  so undo brings the creature and its tokens back together. */
export function captureCreatureDelete(
  sessionId: string,
  kind: 'pc' | 'monster',
  refId: string,
): void {
  const table = kind === 'pc' ? 'characters' : 'monsters';
  const rows = captureRows([
    { table, ids: [refId] }, // the creature first (tokens reference it)
    { table: 'tokens', ids: tokenIdsForRef(kind, refId) },
  ]);
  if (rows.length) {
    const label = kind === 'pc' ? 'Delete character' : 'Delete creature';
    pushUndo(sessionId, label, () => restoreRows(rows));
  }
}

/** Register an undo for a "cover all" fog wipe: restore the revealed cells. */
export function captureFogCover(
  sessionId: string,
  restore: () => void,
): void {
  pushUndo(sessionId, 'Cover fog', restore);
}
