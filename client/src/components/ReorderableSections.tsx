import { useEffect, useRef, useState, type ReactNode } from 'react';

export type Section = { id: string; label: string; node: ReactNode };

/**
 * Per-section accent colors, keyed by section id so every surface that uses a
 * given section (DM panel, player console, token panel) gets the SAME color.
 * Applied as a left border + faint header tint — enough to scan by, never loud.
 * Logic: combat red · conditions amber · spells violet · loot gold · sheet/
 * character blue · maps green · initiative orange · dice cyan · notes slate ·
 * target ember (combat-adjacent) · DM tools steel · Roll20 rose.
 */
const SECTION_ACCENTS: Record<string, string> = {
  combat: '#e25b5b',
  target: '#d98a5b',
  conditions: '#e6c54d',
  abilities: '#a98bd4',
  loot: '#d9b23d',
  sheet: '#5b9de2',
  character: '#5b9de2',
  maps: '#5bbf7a',
  initiative: '#e89a4a',
  dice: '#56c8d8',
  notes: '#8fa3b8',
  dmtools: '#9aa5b1',
  roll20: '#c98ba6',
};

function loadOrder(storageKey: string, fallback: string[]): string[] {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return fallback;
    const saved = JSON.parse(raw) as string[];
    if (!Array.isArray(saved)) return fallback;
    // Keep the saved order and drop ids that no longer exist; ids the user has
    // never seen slot in at their DESIGNED position (fallback index), so a new
    // section meant for the top doesn't get appended at the bottom.
    const next = saved.filter((id) => fallback.includes(id));
    fallback.forEach((id, i) => {
      if (!next.includes(id)) next.splice(Math.min(i, next.length), 0, id);
    });
    return next;
  } catch {
    return fallback;
  }
}

/** Section ids the user has collapsed (default = open, i.e. absent). */
function loadCollapsed(storageKey: string): Set<string> {
  try {
    const raw = localStorage.getItem(`${storageKey}-collapsed`);
    if (!raw) return new Set();
    const saved = JSON.parse(raw);
    return Array.isArray(saved) ? new Set(saved as string[]) : new Set();
  } catch {
    return new Set();
  }
}

/**
 * Stacks the given sections in a user-orderable column. Each section has a small
 * drag handle (only the handle is draggable, so inner controls stay usable); the
 * order persists per `storageKey` in localStorage. Uses native HTML5 drag-and-drop
 * (same pattern as the Data view's card reorder) — no external library.
 */
export function ReorderableSections({
  storageKey,
  sections,
}: {
  storageKey: string;
  sections: Section[];
}) {
  const idsKey = sections.map((s) => s.id).join(',');
  const [order, setOrder] = useState<string[]>(() =>
    loadOrder(storageKey, sections.map((s) => s.id)),
  );
  const [dragging, setDragging] = useState<string | null>(null);
  const dragId = useRef<string | null>(null);
  // Per-section collapse (default open); persisted separately from the order.
  const [collapsed, setCollapsed] = useState<Set<string>>(() => loadCollapsed(storageKey));

  const toggleCollapsed = (id: string) => {
    setCollapsed((cur) => {
      const next = new Set(cur);
      next.has(id) ? next.delete(id) : next.add(id);
      try {
        localStorage.setItem(`${storageKey}-collapsed`, JSON.stringify([...next]));
      } catch {
        /* ignore quota/availability errors */
      }
      return next;
    });
  };

  // Reconcile if the set of sections changes (added/removed).
  useEffect(() => {
    setOrder((cur) => loadOrder(storageKey, sections.map((s) => s.id)) ?? cur);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey]);

  const persist = (next: string[]) => {
    setOrder(next);
    try {
      localStorage.setItem(storageKey, JSON.stringify(next));
    } catch {
      /* ignore quota/availability errors */
    }
  };

  const onDrop = (targetId: string) => {
    const src = dragId.current;
    dragId.current = null;
    setDragging(null);
    if (!src || src === targetId) return;
    move(src, order.indexOf(targetId));
  };

  // Shared move (used by drag-drop AND the tap ▲/▼ buttons, which is the only
  // way to reorder on touch — HTML5 drag-and-drop doesn't fire on mobile).
  const move = (id: string, to: number) => {
    const arr = [...order];
    const from = arr.indexOf(id);
    if (from < 0 || to < 0 || to >= arr.length || from === to) return;
    arr.splice(from, 1);
    arr.splice(to, 0, id);
    persist(arr);
  };

  const byId = new Map(sections.map((s) => [s.id, s]));

  return (
    <>
      {order.map((id) => {
        const s = byId.get(id);
        if (!s) return null;
        const accent = SECTION_ACCENTS[id];
        return (
          <div
            key={id}
            className={`reorder-section ${accent ? 'accented' : ''} ${
              dragging === id ? 'dragging' : ''
            }`}
            // The accent rides a CSS variable; the header styles consume it.
            style={accent ? ({ '--sec-accent': accent } as React.CSSProperties) : undefined}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => onDrop(id)}
          >
            <div
              className="reorder-handle"
              draggable
              onDragStart={() => {
                dragId.current = id;
                setDragging(id);
              }}
              onDragEnd={() => {
                dragId.current = null;
                setDragging(null);
              }}
              title="Drag to reorder this section"
            >
              <button
                type="button"
                className="reorder-caret"
                draggable={false}
                aria-expanded={!collapsed.has(id)}
                title={collapsed.has(id) ? 'Expand section' : 'Collapse section'}
                onMouseDown={(e) => e.stopPropagation()}
                onDragStart={(e) => e.preventDefault()}
                onClick={(e) => {
                  e.stopPropagation();
                  toggleCollapsed(id);
                }}
              >
                {collapsed.has(id) ? '▸' : '▾'}
              </button>
              <span className="reorder-grip">⠿</span>
              {/* A real heading so screen readers / browser nav see the structure. */}
              <h4 className="reorder-label">{s.label}</h4>
              {/* Tap up/down reorder — the only way to reorder on touch, where
                  HTML5 drag-and-drop never fires. Hidden on hover-capable
                  pointers (use the grip there). */}
              <span className="reorder-moves">
                <button
                  type="button"
                  className="reorder-move"
                  draggable={false}
                  title="Move section up"
                  aria-label="Move section up"
                  disabled={order.indexOf(id) === 0}
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    move(id, order.indexOf(id) - 1);
                  }}
                >
                  ▲
                </button>
                <button
                  type="button"
                  className="reorder-move"
                  draggable={false}
                  title="Move section down"
                  aria-label="Move section down"
                  disabled={order.indexOf(id) === order.length - 1}
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    move(id, order.indexOf(id) + 1);
                  }}
                >
                  ▼
                </button>
              </span>
            </div>
            {!collapsed.has(id) && s.node}
          </div>
        );
      })}
    </>
  );
}
