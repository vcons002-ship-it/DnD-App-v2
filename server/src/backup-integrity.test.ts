import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { config } from './config.js';
import { getMeta, setMeta } from './db.js';

const mocks = vi.hoisted(() => ({ sessions: vi.fn(), export: vi.fn() }));
vi.mock('./sessions.js', () => ({ listSessions: mocks.sessions }));
vi.mock('./backup.js', () => ({ exportSession: mocks.export }));
import { runBackupNow } from './backupScheduler.js';

const created: string[] = [];
afterEach(() => {
  for (const dir of created.splice(0)) {
    // Strict test-only boundary for cleanup.
    if (path.dirname(dir) !== path.join(config.dataDir, 'backups'))
      throw new Error('Unsafe cleanup');
    fs.rmSync(dir, { recursive: true, force: true });
  }
  vi.restoreAllMocks();
});
function manifestAt(now: number) {
  const dir = path.join(
    config.dataDir,
    'backups',
    new Date(now).toISOString().slice(0, 19).replace(/[:T]/g, '-'),
  );
  created.push(dir);
  return {
    dir,
    manifest: JSON.parse(
      fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'),
    ),
  };
}
describe('verified backup completion', () => {
  it('updates last success only after every session and file checksum is verified', () => {
    mocks.sessions.mockReturnValue([{ code: 'SAFE' }]);
    mocks.export.mockReturnValue({
      version: 1,
      session: { code: 'SAFE' },
      assets: {},
    });
    const now = 1_800_000_000_000;
    expect(runBackupNow(now)).toBe(1);
    const { dir, manifest } = manifestAt(now);
    expect(manifest.complete).toBe(true);
    expect(getMeta('last_auto_backup_at')).toBe(String(now));
    const bytes = fs.readFileSync(path.join(dir, manifest.files[0].file));
    expect(crypto.createHash('sha256').update(bytes).digest('hex')).toBe(
      manifest.files[0].sha256,
    );
  });
  it('retains the last success marker and previous backups when any session fails', () => {
    setMeta('last_auto_backup_at', '123');
    mocks.sessions.mockReturnValue([{ code: 'SAFE' }, { code: 'FAIL' }]);
    mocks.export.mockImplementation((code) => {
      if (code === 'FAIL') throw new Error('simulated export failure');
      return { version: 1, assets: {} };
    });
    const remove = vi.spyOn(fs, 'rmSync');
    const now = 1_800_000_010_000;
    expect(runBackupNow(now)).toBe(1);
    expect(manifestAt(now).manifest.complete).toBe(false);
    expect(getMeta('last_auto_backup_at')).toBe('123');
    expect(remove).not.toHaveBeenCalled();
  });
  it('does not declare missing or over-capacity images a complete backup', () => {
    setMeta('last_auto_backup_at', '456');
    mocks.sessions.mockReturnValue([{ code: 'SAFE' }]);
    mocks.export.mockReturnValue({
      version: 1,
      assets: {},
      assetWarnings: ['Unreadable upload: missing.png'],
    });
    const now = 1_800_000_020_000;
    runBackupNow(now);
    const { manifest } = manifestAt(now);
    expect(manifest.complete).toBe(false);
    expect(manifest.warnings).toContain('SAFE: Unreadable upload: missing.png');
    expect(getMeta('last_auto_backup_at')).toBe('456');
  });
});
