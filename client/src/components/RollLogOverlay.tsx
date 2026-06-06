import { useEffect, useState } from 'react';
import type { RollEntry } from '../../../shared/types';
import { rollCategory, rollerColor } from '../lib/rollStyle';

const WINDOW_MS = 60_000; // rolls newer than this stay stacked
const FADE_MS = 400; // grace window matching the CSS opacity transition
const MAX_STACK = 6; // cap so a busy round can't cover the map

/**
 * Compact, click-through roll feed pinned to the bottom-left of the map.
 * Every roll under a minute old is shown stacked (newest nearest the corner),
 * each on a single line; older lines fade out and the stack shrinks back to just
 * the most-recent roll, which always stays visible. `pointer-events` are off so
 * the map stays clickable through the overlay.
 */
export function RollLogOverlay({ rollLog }: { rollLog: RollEntry[] }) {
  const [now, setNow] = useState(() => Date.now());

  // Re-evaluate ages on a slow tick so lines age out on their own.
  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, []);
  // Snap to the current time on a new roll so it appears immediately.
  useEffect(() => setNow(Date.now()), [rollLog]);

  const latest = rollLog[rollLog.length - 1];
  if (!latest) return null;

  // Keep the latest plus anything still inside the window (+ fade grace),
  // capped to the most-recent MAX_STACK, oldest first → newest at the bottom.
  const shown = rollLog
    .filter((r) => r.id === latest.id || now - r.createdAt < WINDOW_MS + FADE_MS)
    .slice(-MAX_STACK);

  return (
    <div className="roll-log-overlay">
      {shown.map((entry) => {
        const color = rollerColor(entry.roller);
        const faded = entry.id !== latest.id && now - entry.createdAt >= WINDOW_MS;
        return (
          <div
            key={entry.id}
            className={`roll-entry cat-${rollCategory(entry)}`}
            style={{ borderLeftColor: color, opacity: faded ? 0 : 1 }}
          >
            <span className="roll-total">{entry.total}</span>
            <span className="roll-meta">
              <strong style={{ color }}>{entry.roller}</strong>
              {entry.label ? ` · ${entry.label}` : ''}{' '}
              <span className="muted">{entry.detail}</span>
            </span>
          </div>
        );
      })}
    </div>
  );
}
