import { describe, it, expect, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { runBackupNow } from './backupScheduler.js';
import { config } from './config.js';
import { createSession } from './sessions.js';

describe('automatic backup', () => {
  const created: string[] = [];
  afterAll(() => {
    for (const d of created) fs.rmSync(d, { recursive: true, force: true });
  });

  // runBackupNow exports EVERY session in the shared on-disk test DB (with images
  // inlined), so on a slow disk — and as the suite accumulates sessions — it can
  // run past the 5s default. Give this disk-heavy test room so it doesn't flake.
  it('writes a valid JSON backup per session into a timestamped folder', () => {
    const s = createSession('AutoBackup');
    // The folder name is deterministic because the test derives `stamp` from the
    // SAME `now` it passes in — not because the value is a constant. It must be
    // the CURRENT time: `runBackupNow` prunes to the newest KEEP folders by name,
    // so a pinned past timestamp (the old 1_700_000_000_000) sorts oldest and the
    // run deletes its own backup the moment the data dir holds KEEP folders.
    const now = Date.now();
    const n = runBackupNow(now);
    expect(n).toBeGreaterThan(0);

    const stamp = new Date(now).toISOString().slice(0, 19).replace(/[:T]/g, '-');
    const dir = path.join(config.dataDir, 'backups', stamp);
    created.push(dir);

    const file = path.join(dir, `session-${s.code}.json`);
    expect(fs.existsSync(file)).toBe(true);
    const bundle = JSON.parse(fs.readFileSync(file, 'utf8'));
    expect(bundle.version).toBe(1);
    expect(bundle.session.code).toBe(s.code);
  }, 30_000);
});
