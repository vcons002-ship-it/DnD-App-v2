import { useEffect, useRef, useState, type ReactNode } from 'react';

export type Section = { id: string; label: string; node: ReactNode };

function loadOrder(storageKey: string, fallback: string[]): string[] {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return fallback;
    const saved = JSON.parse(raw) as string[];
    if (!Array.isArray(saved)) return fallback;
    // Keep saved order, append any new ids, drop any that no longer exist.
    const kept = saved.filter((id) => fallback.includes(id));
    return [...kept, ...fallback.filter((id) => !kept.includes(id))];
  } catch {
    return fallback;
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
    const arr = [...order];
    const from = arr.indexOf(src);
    const to = arr.indexOf(targetId);
    if (from < 0 || to < 0) return;
    arr.splice(from, 1);
    arr.splice(to, 0, src);
    persist(arr);
  };

  const byId = new Map(sections.map((s) => [s.id, s]));

  return (
    <>
      {order.map((id) => {
        const s = byId.get(id);
        if (!s) return null;
        return (
          <div
            key={id}
            className={`reorder-section ${dragging === id ? 'dragging' : ''}`}
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
              <span className="reorder-grip">⠿</span>
              <span className="reorder-label">{s.label}</span>
            </div>
            {s.node}
          </div>
        );
      })}
    </>
  );
}
