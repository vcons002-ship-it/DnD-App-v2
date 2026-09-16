import { defineConfig } from 'vitest/config';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

// Never accept a caller's production DB_PATH when running the suite.
const testRoot = mkdtempSync(path.join(tmpdir(), 'dnd-unit-'));

export default defineConfig({
  test: {
    env: {
      DATA_ROOT: testRoot,
      DB_PATH: path.join(testRoot, 'game.db'),
      DM_PASSPHRASE: 'test-dm-secret',
    },
    // The whole suite shares one throwaway SQLite file with
    // no per-file isolation, so running test files in PARALLEL races their
    // transactions against the same file ("database is locked", seen as a flaky
    // failure in sessions.test.ts's map-import deep-copy). Running the files
    // sequentially removes the contention; the suite is small (~2s) so the cost
    // is negligible.
    fileParallelism: false,
  },
});
