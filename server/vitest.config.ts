import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // The whole suite shares one on-disk SQLite file (server/data/game.db) with
    // no per-file isolation, so running test files in PARALLEL races their
    // transactions against the same file ("database is locked", seen as a flaky
    // failure in sessions.test.ts's map-import deep-copy). Running the files
    // sequentially removes the contention; the suite is small (~2s) so the cost
    // is negligible.
    fileParallelism: false,
  },
});
