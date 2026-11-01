import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  beginMapStartupWave,
  cancelLoadingTask,
  completeLoadingTask,
  getLoadingProgressSnapshot,
  resetLoadingProgressForTests,
  startLoadingTask,
  updateLoadingTaskStage,
} from './loadingProgress';

describe('loadingProgress', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetLoadingProgressForTests();
  });

  afterEach(() => {
    resetLoadingProgressForTests();
    vi.useRealTimers();
  });

  it('shows map startup progress immediately and reaches 100% before fading to idle', () => {
    beginMapStartupWave('map-1');
    startLoadingTask({
      id: 'image:/uploads/castle.webp',
      category: 'map',
      weight: 4,
      progress: 0.2,
      showDelayMs: 0,
    });

    const initial = getLoadingProgressSnapshot();
    expect(initial.visible).toBe(true);
    expect(initial.phase).toBe('active');
    expect(initial.indeterminate).toBe(false);
    expect(initial.label).toBe('Loading Battlefield…');
    expect(initial.percent).not.toBeNull();
    expect(initial.percent!).toBeGreaterThanOrEqual(4);
    expect(initial.percent!).toBeLessThan(100);
    // Label must never expose raw asset counts
    expect(initial.label).not.toMatch(/\d+\s*\/\s*\d+/);

    completeLoadingTask('image:/uploads/castle.webp');
    vi.advanceTimersByTime(250);

    const completing = getLoadingProgressSnapshot();
    expect(completing.visible).toBe(true);
    expect(completing.phase).toBe('completing');
    expect(completing.percent).toBe(100);

    vi.advanceTimersByTime(300);
    const done = getLoadingProgressSnapshot();
    expect(done.visible).toBe(false);
    expect(done.phase).toBe('idle');
  });

  it('tracks multi-stage 3D miniature spawning mid-session with monotonic percentage', () => {
    startLoadingTask({
      id: 'miniature:tok-dragon',
      category: 'miniature',
      weight: 4,
      progress: 0.08,
      stageCeiling: 0.42,
      showDelayMs: 60,
    });

    // Hidden during initial anti-flicker grace window for already-cached models
    expect(getLoadingProgressSnapshot().visible).toBe(false);

    vi.advanceTimersByTime(70);
    const stage1 = getLoadingProgressSnapshot();
    expect(stage1.visible).toBe(true);
    expect(stage1.label).toBe('Summoning Miniatures…'); expect(stage1.variant).toBe('corner');
    expect(stage1.percent).not.toBeNull();

    updateLoadingTaskStage('miniature:tok-dragon', 'miniature', 0.48, 0.76);
    const stage2 = getLoadingProgressSnapshot();
    expect(stage2.percent!).toBeGreaterThan(stage1.percent!);

    updateLoadingTaskStage('miniature:tok-dragon', 'miniature', 0.78, 0.94);
    const stage3 = getLoadingProgressSnapshot();
    expect(stage3.percent!).toBeGreaterThan(stage2.percent!);

    completeLoadingTask('miniature:tok-dragon');
    const completing = getLoadingProgressSnapshot();
    expect(completing.phase).toBe('completing');
    expect(completing.percent).toBe(100);
  });

  it('uses indeterminate mode (null percent) when only un-staged tasks are active', () => {
    startLoadingTask({
      id: 'sync:party-view',
      category: 'sync',
      indeterminate: true,
      label: 'Syncing Party Sight…',
      showDelayMs: 0,
    });

    const snap = getLoadingProgressSnapshot();
    expect(snap.visible).toBe(true);
    expect(snap.indeterminate).toBe(true);
    expect(snap.percent).toBeNull();
    expect(snap.label).toBe('Syncing Party Sight…');

    completeLoadingTask('sync:party-view');
    vi.advanceTimersByTime(300);
    expect(getLoadingProgressSnapshot().visible).toBe(false);
  });

  it('does not flicker when a cached mid-session asset finishes within the grace delay', () => {
    startLoadingTask({
      id: 'render:step-frame',
      category: 'render',
      weight: 0.8,
      progress: 0.25,
      showDelayMs: 220,
    });
    vi.advanceTimersByTime(25);
    completeLoadingTask('render:step-frame');
    expect(getLoadingProgressSnapshot().visible).toBe(false);

    startLoadingTask({
      id: 'image:/uploads/cached.png',
      category: 'artwork',
      showDelayMs: 80,
    });
    cancelLoadingTask('image:/uploads/cached.png');
    expect(getLoadingProgressSnapshot().visible).toBe(false);
  });
});
