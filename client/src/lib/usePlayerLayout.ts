import { useCallback, useEffect, useState } from 'react';

export type PlayerPanelName = 'combat' | 'chat';
export type PlayerPanelSize = { width: number; height: number };
export type ResourceLayout = 'compact' | 'concentric';
type PlayerLayout = {
  resourceLayout: ResourceLayout;
  scale: number;
  combat: PlayerPanelSize;
  chat: PlayerPanelSize;
};

const STORAGE_KEY = 'dnd:player-layout:v1';
const DEFAULT_LAYOUT: PlayerLayout = {
  resourceLayout: 'concentric',
  scale: 0.85,
  combat: { width: 320, height: 410 },
  chat: { width: 420, height: 270 },
};
const MINIMUM = { combat: { width: 280, height: 160 }, chat: { width: 280, height: 170 } };
const MAXIMUM = { width: 1000, height: 1000 };
const clamp = (n: number, low: number, high: number) => Math.max(low, Math.min(high, n));
const validNumber = (value: unknown, fallback: number) =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

function readLayout(): PlayerLayout {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
    return {
      // Respect a deliberate compact preference; older or invalid settings
      // inherit the current presentation default without touching game data.
      resourceLayout: stored?.resourceLayout === 'compact' || stored?.resourceLayout === 'concentric'
        ? stored.resourceLayout : DEFAULT_LAYOUT.resourceLayout,
      scale: clamp(validNumber(stored?.scale, DEFAULT_LAYOUT.scale), 0.7, 1.15),
      combat: readSize(stored?.combat, 'combat'),
      chat: readSize(stored?.chat, 'chat'),
    };
  } catch {
    return DEFAULT_LAYOUT;
  }
}

function readSize(stored: Partial<PlayerPanelSize> | undefined, panel: PlayerPanelName): PlayerPanelSize {
  return {
    width: clamp(validNumber(stored?.width, DEFAULT_LAYOUT[panel].width), MINIMUM[panel].width, MAXIMUM.width),
    height: clamp(validNumber(stored?.height, DEFAULT_LAYOUT[panel].height), MINIMUM[panel].height, MAXIMUM.height),
  };
}

/** Browser-local presentation only: no session, character or map-scale writes.
 * Dimensions are unscaled CSS pixels. Viewport clamps affect only presentation,
 * so temporarily narrowing the window does not erase a player's preferred size.
 */
export function usePlayerLayout() {
  const [layout, setLayout] = useState(readLayout);
  const [body, bodyRef] = useState<HTMLDivElement | null>(null);
  const [viewport, setViewport] = useState({ width: window.innerWidth, height: window.innerHeight - 50 });
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(layout)); } catch { /* Private/storage-full browsers still work. */ }
  }, [layout]);
  useEffect(() => {
    if (!body) return;
    const measure = () => {
      const rect = body.getBoundingClientRect();
      setViewport({ width: rect.width, height: rect.height });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(body);
    return () => observer.disconnect();
  }, [body]);

  const limits = useCallback((panel: PlayerPanelName) => {
    const max = {
      width: Math.max(1, Math.min(MAXIMUM.width, (viewport.width - 16) / layout.scale)),
      height: Math.max(1, Math.min(MAXIMUM.height, (viewport.height - 16) / layout.scale)),
    };
    return {
      min: { width: Math.min(MINIMUM[panel].width, max.width), height: Math.min(MINIMUM[panel].height, max.height) },
      max,
    };
  }, [viewport, layout.scale]);
  const size = (panel: PlayerPanelName): PlayerPanelSize => {
    const { min, max } = limits(panel);
    return {
      width: clamp(layout[panel].width, min.width, max.width),
      height: clamp(layout[panel].height, min.height, max.height),
    };
  };
  const setSize = (panel: PlayerPanelName, next: PlayerPanelSize) => {
    const { min, max } = limits(panel);
    setLayout((current) => ({
      ...current,
      [panel]: {
        width: Math.round(clamp(validNumber(next.width, current[panel].width), min.width, max.width)),
        height: Math.round(clamp(validNumber(next.height, current[panel].height), min.height, max.height)),
      },
    }));
  };
  return {
    resourceLayout: layout.resourceLayout,
    setResourceLayout: (resourceLayout: ResourceLayout) => setLayout((current) => ({ ...current, resourceLayout })),
    scale: layout.scale,
    setScale: (scale: number) => setLayout((current) => ({ ...current, scale: clamp(validNumber(scale, current.scale), 0.7, 1.15) })),
    bodyRef,
    size,
    setSize,
    limits,
    reset: () => setLayout(DEFAULT_LAYOUT),
  };
}

export type PlayerLayoutController = ReturnType<typeof usePlayerLayout>;
