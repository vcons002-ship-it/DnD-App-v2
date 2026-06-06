import { useEffect, useRef, useState } from 'react';
import type { RollEntry } from '../../../shared/types';
import { rollCategory, rollerColor } from '../lib/rollStyle';

const FADE_MS = 6000;

/**
 * Compact, click-through latest-roll readout pinned to the bottom-left of the map.
 * Shows just the latest roll on a single line so it stays out of the way. Fades
 * in on a new roll or when the cursor is over it (detected by rect since
 * `pointer-events` are off so the map stays clickable) and fades out when idle.
 */
export function RollLogOverlay({ rollLog }: { rollLog: RollEntry[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(true);
  const hideAt = useRef(Date.now() + FADE_MS);
  const hovering = useRef(false);
  const seen = useRef<string | undefined>(rollLog[rollLog.length - 1]?.id);

  // Fade in on a new roll.
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
      if (!hovering.current && Date.now() >= hideAt.current) setVisible(false);
    }, 500);
    document.addEventListener('mousemove', onMove);
    return () => {
      document.removeEventListener('mousemove', onMove);
      clearInterval(tick);
    };
  }, []);

  const latest = rollLog[rollLog.length - 1];
  if (!latest) return null;
  const color = rollerColor(latest.roller);
  return (
    <div
      ref={ref}
      className={`roll-log-overlay roll-entry cat-${rollCategory(latest)}`}
      style={{ borderLeftColor: color, opacity: visible ? 1 : 0 }}
    >
      <span className="roll-total">{latest.total}</span>
      <span className="roll-meta">
        <strong style={{ color }}>{latest.roller}</strong>
        {latest.label ? ` · ${latest.label}` : ''}{' '}
        <span className="muted">{latest.detail}</span>
      </span>
    </div>
  );
}
