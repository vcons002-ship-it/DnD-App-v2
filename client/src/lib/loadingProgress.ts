import { useSyncExternalStore } from 'react';

export type LoadingCategory =
  | 'session'
  | 'map'
  | 'miniature'
  | 'lod'
  | 'preload'
  | 'artwork'
  | 'render'
  | 'sync';

export interface LoadingTaskInput {
  id: string;
  category: LoadingCategory;
  /** Relative work weight (defaults by category). */
  weight?: number;
  /** Known stage progress in [0, 1]. */
  progress?: number;
  /** Expected ceiling before the next stage update (used for smooth intra-stage estimate). */
  stageCeiling?: number;
  /** True when the operation has no measurable completion percentage. */
  indeterminate?: boolean;
  /** Custom themed label override. */
  label?: string;
  /** Delay before this task alone can make the loading bar visible (ms). */
  showDelayMs?: number;
}

interface ActiveTask {
  id: string;
  category: LoadingCategory;
  weight: number;
  progress: number;
  stageCeiling: number;
  indeterminate: boolean;
  label?: string;
  startedAt: number;
  stageUpdatedAt: number;
  visibleAt: number;
}

export interface LoadingProgressSnapshot {
  visible: boolean;
  variant: 'bar' | 'corner';
  phase: 'idle' | 'active' | 'completing';
  /** Percentage in [1..100], or null when purely indeterminate. */
  percent: number | null;
  indeterminate: boolean;
  label: string;
  category: LoadingCategory;
}

const DEFAULT_WEIGHT: Record<LoadingCategory, number> = {
  session: 3,
  map: 4,
  miniature: 4,
  lod: 2.5,
  preload: 1.5,
  artwork: 1.5,
  render: 1.5,
  sync: 2,
};

const DEFAULT_DELAY_MS: Record<LoadingCategory, number> = {
  session: 0,
  map: 0,
  miniature: 60,
  lod: 90,
  preload: 140,
  artwork: 80,
  render: 180,
  sync: 80,
};

const CATEGORY_PRIORITY: Record<LoadingCategory, number> = {
  session: 90,
  map: 80,
  miniature: 70,
  sync: 60,
  lod: 50,
  artwork: 40,
  preload: 30,
  render: 20,
};

const CATEGORY_LABEL: Record<LoadingCategory, string> = {
  session: 'Opening Campaign…',
  map: 'Loading Battlefield…',
  miniature: 'Summoning Miniatures…',
  lod: 'Refining Miniatures…',
  preload: 'Preparing Encounter…',
  artwork: 'Loading Artwork…',
  render: 'Rendering Battlefield…',
  sync: 'Syncing Vision…',
};

const COMPLETE_HOLD_MS = 220;
const STARTUP_SETTLE_MS = 220;
const TICK_INTERVAL_MS = 80;

const activeTasks = new Map<string, ActiveTask>();
const listeners = new Set<() => void>();

let waveCompletedWeight = 0;
let waveUseBar = false;
let wavePeakPercent = 0;
let waveVisible = false;
let waveCompletingUntil = 0;
let waveLastLabel = CATEGORY_LABEL.map;
let waveLastCategory: LoadingCategory = 'map';
let startupHoldUntil = 0;
let startupMapKey: string | null = null;
let tickTimer: ReturnType<typeof setTimeout> | null = null;

const IDLE_SNAPSHOT: LoadingProgressSnapshot = {
  visible: false,
  variant: 'bar',
  phase: 'idle',
  percent: null,
  indeterminate: false,
  label: CATEGORY_LABEL.map,
  category: 'map',
};

let currentSnapshot: LoadingProgressSnapshot = IDLE_SNAPSHOT;

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function effectiveTaskProgress(task: ActiveTask, now: number): number {
  if (task.indeterminate) return 0;
  const base = clamp(task.progress, 0, 0.98);
  const ceiling = clamp(Math.max(base, task.stageCeiling), base, 0.96);
  const headroom = Math.max(0, ceiling - base);
  if (headroom <= 0.001) return base;
  const elapsed = Math.max(0, now - task.stageUpdatedAt);
  // Smooth asymptotic estimate within the current stage so the bar keeps moving
  // gently during a network fetch, GLB parse, or shader compile.
  const creep = 1 - Math.exp(-elapsed / 1400);
  return clamp(base + headroom * creep, base, ceiling);
}

function pickDominantLabelAndCategory(now: number): { label: string; category: LoadingCategory } {
  if (now < startupHoldUntil || activeTasks.has('map:startup')) {
    return { label: CATEGORY_LABEL.map, category: 'map' };
  }
  let bestTask: ActiveTask | null = null;
  let bestPriority = -1;
  for (const task of activeTasks.values()) {
    const p = CATEGORY_PRIORITY[task.category];
    if (p > bestPriority) {
      bestPriority = p;
      bestTask = task;
    }
  }
  if (!bestTask) {
    return { label: waveLastLabel, category: waveLastCategory };
  }
  return {
    label: bestTask.label ?? CATEGORY_LABEL[bestTask.category],
    category: bestTask.category,
  };
}

function scheduleTick(delayMs: number) {
  if (tickTimer !== null) return;
  tickTimer = setTimeout(() => {
    tickTimer = null;
    recompute();
  }, Math.max(16, delayMs));
}

function clearTick() {
  if (tickTimer !== null) {
    clearTimeout(tickTimer);
    tickTimer = null;
  }
}

function sameSnapshot(a: LoadingProgressSnapshot, b: LoadingProgressSnapshot): boolean {
  return (
    a.visible === b.visible &&
    a.variant === b.variant &&
    a.phase === b.phase &&
    a.percent === b.percent &&
    a.indeterminate === b.indeterminate &&
    a.label === b.label &&
    a.category === b.category
  );
}

function emitIfChanged(next: LoadingProgressSnapshot) {
  if (sameSnapshot(currentSnapshot, next)) return;
  currentSnapshot = next;
  for (const listener of listeners) listener();
}

function recompute() {
  const now = performance.now();
  if (activeTasks.has('map:startup') && now >= startupHoldUntil) {
    const startupTask = activeTasks.get('map:startup')!;
    activeTasks.delete('map:startup');
    waveCompletedWeight += startupTask.weight;
    if (activeTasks.size === 0 && waveVisible) {
      waveCompletingUntil = Math.max(waveCompletingUntil, now + COMPLETE_HOLD_MS);
    }
  }

  const hasActive = activeTasks.size > 0;
  if (!hasActive) {
    if (waveVisible && now < waveCompletingUntil) {
      scheduleTick(waveCompletingUntil - now + 8);
      emitIfChanged({
        visible: true,
        variant: waveUseBar ? 'bar' : 'corner',
        phase: 'completing',
        percent: currentSnapshot.indeterminate ? null : 100,
        indeterminate: currentSnapshot.indeterminate,
        label: waveLastLabel,
        category: waveLastCategory,
      });
      return;
    }
    waveCompletedWeight = 0;
    wavePeakPercent = 0;
    waveVisible = false;
    waveUseBar = false;
    waveCompletingUntil = 0;
    clearTick();
    emitIfChanged(IDLE_SNAPSHOT);
    return;
  }

  let earliestVisibleAt = Infinity;
  let anyReadyToShow = waveVisible || now < startupHoldUntil;
  let determinateWeight = 0;
  let determinateDone = 0;
  let hasDeterminateTask = waveCompletedWeight > 0;
  let hasIndeterminateTask = false;

  for (const task of activeTasks.values()) {
    if (
      task.category === 'map' ||
      task.category === 'session' ||
      task.category === 'sync' ||
      task.id.startsWith('upload:')
    ) {
      waveUseBar = true;
    }
    if (now >= task.visibleAt) {
      anyReadyToShow = true;
    } else if (task.visibleAt < earliestVisibleAt) {
      earliestVisibleAt = task.visibleAt;
    }
    if (task.indeterminate) {
      hasIndeterminateTask = true;
    } else {
      hasDeterminateTask = true;
      determinateWeight += task.weight;
      determinateDone += task.weight * effectiveTaskProgress(task, now);
    }
  }

  if (!anyReadyToShow) {
    scheduleTick(earliestVisibleAt - now + 4);
    emitIfChanged(IDLE_SNAPSHOT);
    return;
  }

  if (now < startupHoldUntil || waveCompletedWeight + determinateWeight >= 28) {
    waveUseBar = true;
  }
  waveVisible = true;
  waveCompletingUntil = 0;
  const { label, category } = pickDominantLabelAndCategory(now);
  waveLastLabel = label;
  waveLastCategory = category;

  let percent: number | null = null;
  const indeterminate = !hasDeterminateTask && hasIndeterminateTask;
  if (hasDeterminateTask) {
    const totalWeight = Math.max(0.01, waveCompletedWeight + determinateWeight);
    const doneWeight = clamp(waveCompletedWeight + determinateDone, 0, totalWeight);
    const rawPercent = Math.round(clamp((doneWeight / totalWeight) * 100, 4, 98));
    // Prevent jarring backward jumps within the same loading wave; allow a gentle
    // blend only if a large batch of new tasks just arrived.
    if (rawPercent >= wavePeakPercent) {
      wavePeakPercent = rawPercent;
    } else if (wavePeakPercent - rawPercent > 28) {
      wavePeakPercent = Math.max(8, Math.round(wavePeakPercent * 0.75 + rawPercent * 0.25));
    }
    percent = clamp(wavePeakPercent, 4, 98);
  }

  scheduleTick(TICK_INTERVAL_MS);
  emitIfChanged({
    visible: true,
    variant: waveUseBar ? 'bar' : 'corner',
    phase: 'active',
    percent,
    indeterminate,
    label,
    category,
  });
}

/**
 * Starts or updates an active loading task.
 */
export function startLoadingTask(input: LoadingTaskInput): void {
  const now = performance.now();
  const existing = activeTasks.get(input.id);
  const weight = input.weight ?? existing?.weight ?? DEFAULT_WEIGHT[input.category];
  const progress = clamp(input.progress ?? existing?.progress ?? 0.08, 0, 0.98);
  const defaultCeiling = clamp(progress + 0.55, progress, 0.92);
  const stageCeiling = clamp(input.stageCeiling ?? defaultCeiling, progress, 0.96);
  const delayMs = input.showDelayMs ?? DEFAULT_DELAY_MS[input.category];

  if (existing) {
    const stageAdvanced = progress > existing.progress + 0.01;
    existing.category = input.category;
    existing.weight = weight;
    existing.progress = Math.max(existing.progress, progress);
    existing.stageCeiling = Math.max(existing.progress, stageCeiling);
    existing.indeterminate = input.indeterminate ?? existing.indeterminate;
    if (input.label !== undefined) existing.label = input.label;
    if (stageAdvanced) existing.stageUpdatedAt = now;
  } else {
    activeTasks.set(input.id, {
      id: input.id,
      category: input.category,
      weight,
      progress,
      stageCeiling,
      indeterminate: !!input.indeterminate,
      label: input.label,
      startedAt: now,
      stageUpdatedAt: now,
      visibleAt: now + delayMs,
    });
  }
  recompute();
}

/**
 * Updates the progress stage of an existing task (or creates it if not yet registered).
 */
export function updateLoadingTaskStage(
  id: string,
  category: LoadingCategory,
  progress: number,
  stageCeiling?: number,
  options?: { weight?: number; label?: string; showDelayMs?: number },
): void {
  startLoadingTask({
    id,
    category,
    progress,
    stageCeiling,
    weight: options?.weight,
    label: options?.label,
    showDelayMs: options?.showDelayMs,
  });
}

/**
 * Marks a task as completed and contributes its completed weight to the active wave.
 */
export function completeLoadingTask(id: string): void {
  const existing = activeTasks.get(id);
  if (!existing) return;
  activeTasks.delete(id);
  if (!existing.indeterminate) {
    waveCompletedWeight += existing.weight;
  }
  if (activeTasks.size === 0 && waveVisible) {
    waveCompletingUntil = performance.now() + COMPLETE_HOLD_MS;
  }
  recompute();
}

/**
 * Cancels a task without counting it as completed work (e.g. unmounted/aborted before needed).
 */
export function cancelLoadingTask(id: string): void {
  if (!activeTasks.delete(id)) return;
  if (activeTasks.size === 0 && waveVisible) {
    waveCompletingUntil = performance.now() + COMPLETE_HOLD_MS;
  }
  recompute();
}

/**
 * Cancels all tasks whose ID starts with the given prefix.
 */
export function cancelLoadingTasksByPrefix(prefix: string): void {
  let removed = false;
  for (const id of [...activeTasks.keys()]) {
    if (id.startsWith(prefix)) {
      activeTasks.delete(id);
      removed = true;
    }
  }
  if (removed) {
    if (activeTasks.size === 0 && waveVisible) {
      waveCompletingUntil = performance.now() + COMPLETE_HOLD_MS;
    }
    recompute();
  }
}

/**
 * Triggers an immediate map startup / map switch loading wave so the bar appears right away
 * and bridges initial artwork, tiles, 3D battlefield, and miniature spawns into one smooth bar.
 */
export function beginMapStartupWave(mapId: string | null | undefined): void {
  if (!mapId) {
    startupMapKey = null;
    cancelLoadingTask('map:startup');
    return;
  }
  if (startupMapKey === mapId) return;
  startupMapKey = mapId;
  const now = performance.now();
  // Reset previous wave counters when switching to a brand new map.
  waveCompletedWeight = 0;
  wavePeakPercent = 0;
  startupHoldUntil = now + STARTUP_SETTLE_MS;
  waveUseBar = true;
  startLoadingTask({
    id: 'map:startup',
    category: 'map',
    weight: 1.5,
    progress: 0.15,
    stageCeiling: 0.85,
    label: CATEGORY_LABEL.map,
    showDelayMs: 0,
  });
}

export function getLoadingProgressSnapshot(): LoadingProgressSnapshot {
  return currentSnapshot;
}

export function subscribeLoadingProgress(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useLoadingProgress(): LoadingProgressSnapshot {
  return useSyncExternalStore(
    subscribeLoadingProgress,
    getLoadingProgressSnapshot,
    getLoadingProgressSnapshot,
  );
}

export function resetLoadingProgressForTests(): void {
  clearTick();
  activeTasks.clear();
  waveCompletedWeight = 0;
  wavePeakPercent = 0;
  waveVisible = false;
  waveUseBar = false;
  waveCompletingUntil = 0;
  waveLastLabel = CATEGORY_LABEL.map;
  waveLastCategory = 'map';
  startupHoldUntil = 0;
  startupMapKey = null;
  currentSnapshot = IDLE_SNAPSHOT;
  for (const listener of listeners) listener();
}
