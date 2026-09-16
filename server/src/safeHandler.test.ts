import { describe, expect, it, vi } from 'vitest';
import { invokeSafely } from './safeHandler.js';

describe('socket failure boundary', () => {
  it('reports synchronous and asynchronous failures without rejecting to the process', async () => {
    const report = vi.fn();
    const sync = new Error('sync failure'),
      async = new Error('async failure');
    invokeSafely(() => {
      throw sync;
    }, report);
    invokeSafely(async () => {
      throw async;
    }, report);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(report.mock.calls).toEqual([[sync], [async]]);
  });
  it('does not change successful handlers or run them twice', async () => {
    const run = vi.fn(() => Promise.resolve()),
      report = vi.fn();
    invokeSafely(run, report);
    await Promise.resolve();
    expect(run).toHaveBeenCalledTimes(1);
    expect(report).not.toHaveBeenCalled();
  });
});
