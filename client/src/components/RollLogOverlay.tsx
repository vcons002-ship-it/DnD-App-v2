import { useEffect, useRef, useState } from 'react';
import type { RollEntry } from '../../../shared/types';
import { rollCategory, rollerColor } from '../lib/rollStyle';

const SIZE_KEY = 'rollOverlaySize';
const FADE_MS = 6000;

function loadSize(): { w: number; h: number } {
  try {
    const s = JSON.parse(localStorage.getItem(SIZE_KEY) ?? '');
    if (s && typeof s.w === 'number' && typeof s.h === 'number') return s;
  } catch {
    /* fall through to default */
  }
  return { w: 280, h: 320 };
}

/**
 * Transparent, click-through roll-log overlay on the map. Fades in when a new
 * roll arrives or the cursor is over it (detected by rect since pointer-events
 * are off so the map stays clickable), and fades out when idle. Resizeable via a
 * bottom-left handle (the only interactive part); size persists to localStorage.
 */
export function RollLogOverlay({ rollLog }: { rollLog: RollEntry[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [size, setSize] = useState(loadSize);
  const hideAt = useRef(0);
  const hovering = useRef(false);
  const resizing = useRef(false);
  const seen = useRef<string | undefined>(rollLog[rollLog.length - 1]?.id);

  // Reveal briefly when first enabled so it's not blank.
  useEffect(() => {
    setVisible(true);
    hideAt.current = Date.now() + FADE_MS;
  }, []);

  // Fade in on a new roll (skip the initial mount).
  useEffect(() => {
    const id = rollLog[rollLog.length - 1]?.id;
    if (id && id !== seen.current) {
      seen.current = id;
      setVisible(true);
      hideAt.current = Date.now() + FADE_MS;
    }
  }, [rollLog]);

  // Hover (via cursor-vs-rect, since the box is pointer-events:none) + fade-out tick.
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const r = ref.current?.getBoundingClientRect();
      const inside =
        !!r && e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
      hovering.current = inside;
      if (inside) {
        hideAt.current = Date.now() + FADE_MS;
        setVisible(true);
      }
    };
    const tick = setInterval(() => {
      if (!hovering.current && !resizing.current && Date.now() >= hideAt.current) setVisible(false);
    }, 500);
    document.addEventListener('mousemove', onMove);
    return () => {
      document.removeEventListener('mousemove', onMove);
      clearInterval(tick);
    };
  }, []);

  const startResize = (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    resizing.current = true;
    setVisible(true);
    const sx = e.clientX;
    const sy = e.clientY;
    const sw = size.w;
    const sh = size.h;
    const onMove = (ev: PointerEvent) => {
      // Bottom-left handle: dragging left grows width, dragging down grows height.
      const w = Math.max(160, sw + (sx - ev.clientX));
      const h = Math.max(120, sh + (ev.clientY - sy));
      setSize({ w, h });
    };
    const onUp = () => {
      resizing.current = false;
      hideAt.current = Date.now() + FADE_MS;
      setSize((s) => {
        localStorage.setItem(SIZE_KEY, JSON.stringify(s));
        return s;
      });
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  return (
    <div
      ref={ref}
      className="roll-log-overlay"
      style={{ width: size.w, height: size.h, opacity: visible ? 1 : 0 }}
    >
      <button
        className="roll-log-resize"
        title="Drag to resize"
        onPointerDown={startResize}
      />
      <div className="roll-log-overlay-list">
        {[...rollLog].reverse().map((r) => (
          <div
            key={r.id}
            className={`roll-entry cat-${rollCategory(r)}`}
            style={{ borderLeftColor: rollerColor(r.roller) }}
          >
            <span className="roll-total">{r.total}</span>
            <span className="roll-meta">
              <strong style={{ color: rollerColor(r.roller) }}>{r.roller}</strong>
              {r.label ? ` · ${r.label}` : ''}{' '}
              <span className="muted">{r.detail}</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
