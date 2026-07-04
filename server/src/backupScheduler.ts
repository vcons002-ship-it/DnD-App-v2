// Automatic periodic backups of every session to disk, so a lost/corrupt
// game.db isn't a lost campaign even if the DM never clicks "export".
//
// Restart-safe: the last run time lives in app_meta (not just a timer), and we
// re-check every few hours, backing up only once >= INTERVAL_DAYS have elapsed.
// So server restarts don't reset the clock, and a machine that was off for a
// while catches up on its next boot. Files land in data/backups/<timestamp>/
// (gitignored); the oldest are pruned to KEEP.
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import { getMeta, setMeta } from './db.js';
import { listSessions } from './sessions.js';
import { exportSession } from './backup.js';

const DAY = 24 * 60 * 60 * 1000;
const INTERVAL_DAYS = Number(process.env.BACKUP_INTERVAL_DAYS) || 3.5; // ~twice a week
const KEEP = Math.max(1, Number(process.env.BACKUP_KEEP) || 8); // ~4 weeks of history
const CHECK_EVERY = 3 * 60 * 60 * 1000; // re-check cadence (restart-safe, not the interval)
const META_KEY = 'last_auto_backup_at';

const backupsDir = (): string => path.join(config.dataDir, 'backups');

/** Back up every session into a fresh timestamped folder, record the time, prune
 *  old folders. Returns how many sessions were written. */
export function runBackupNow(now = Date.now()): number {
  const sessions = listSessions();
  setMeta(META_KEY, String(now)); // stamp first, so a mid-run crash doesn't loop
  if (!sessions.length) return 0;

  const stamp = new Date(now).toISOString().slice(0, 19).replace(/[:T]/g, '-');
  const dir = path.join(backupsDir(), stamp);
  fs.mkdirSync(dir, { recursive: true });
  let written = 0;
  for (const s of sessions) {
    try {
      const bundle = exportSession(s.code);
      if (!bundle) continue;
      fs.writeFileSync(path.join(dir, `session-${s.code}.json`), JSON.stringify(bundle));
      written++;
    } catch (err) {
      console.warn(`  [backup] could not export ${s.code}:`, (err as Error).message);
    }
  }
  pruneOldBackups();
  console.log(`  [backup] wrote ${written} session backup(s) → data/backups/${stamp}`);
  return written;
}

/** Keep only the newest KEEP backup folders. */
function pruneOldBackups(): void {
  try {
    const dirs = fs
      .readdirSync(backupsDir(), { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .sort(); // ISO-ish timestamp names sort chronologically
    for (const old of dirs.slice(0, Math.max(0, dirs.length - KEEP))) {
      fs.rmSync(path.join(backupsDir(), old), { recursive: true, force: true });
    }
  } catch {
    /* no backups dir yet — nothing to prune */
  }
}

/** Start the periodic check. Safe to call once at boot. */
export function startBackupScheduler(): void {
  const check = () => {
    try {
      const now = Date.now();
      const last = Number(getMeta(META_KEY) ?? 0);
      if (now - last >= INTERVAL_DAYS * DAY) runBackupNow(now);
    } catch (err) {
      console.warn('  [backup] scheduler check failed:', (err as Error).message);
    }
  };
  // First check shortly after boot (never blocks startup), then on a cadence.
  // unref() so these timers never keep the process alive on their own.
  setTimeout(check, 8000).unref?.();
  setInterval(check, CHECK_EVERY).unref?.();
}
