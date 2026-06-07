import { useEffect, useState } from 'react';
import type { RollEntry } from '../../../shared/types';
import { rollCategory, rollerColor } from '../lib/rollStyle';
import { renderRollDetail } from '../lib/rollDetail';

const WINDOW_MS = 20_000; // a roll auto-fades this long after it arrives
const STALE_MS = 60_000; // past this, hovering reveals only the latest roll
const FADE_MS = 400; // grace window matching the CSS opacity transition
const MAX_STACK = 6; // cap so a busy round can't cover the map

/**
 * Compact roll feed pinned to the bottom-left of the map. Each line shows its
 * full text (it wraps, never truncated). New rolls fade in and, when idle, fade
 * out ~20s later — leaving only a faint latest line as a hover target. Hovering
 * fades the panel back to full opacity: within a minute it reveals the recent
 * stack; once the latest roll is over a minute old, hovering shows only that
 * single latest roll.
 */
export function RollLogOverlay({ rollLog }: { rollLog: RollEntry[] }) {
  const [now, setNow] = useState(() => Date.now());
  const [hovered, setHovered] = useState(false);

  // Re-evaluate ages on a slow tick so lines age out on their own.
  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, []);
  // Snap to the current time on a new roll so it appears immediately.
  useEffect(() => setNow(Date.now()), [rollLog]);

  const latest = rollLog[rollLog.length - 1];
  if (!latest) return null;

  // Most-recent rolls inside a window (+ fade grace), oldest first → newest last.
  const within = (ms: number) =>
    rollLog.filter((r) => now - r.createdAt < ms + FADE_MS).slice(-MAX_STACK);

  const stale = now - latest.createdAt >= WINDOW_MS;
  let shown: RollEntry[];
  if (hovered) {
    const recent = within(STALE_MS);
    shown = recent.length ? recent : [latest];
  } else if (stale) {
    shown = [latest]; // faint, persistent hover target
  } else {
    shown = within(WINDOW_MS);
  }

  return (
    <div
      className="roll-log-overlay"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {shown.map((entry) => {
        const color = rollerColor(entry.roller);
        const aged = now - entry.createdAt >= WINDOW_MS;
        const opacity = hovered ? 1 : stale ? 0.22 : aged ? 0 : 1;
        return (
          <div
            key={entry.id}
            className={`roll-entry cat-${rollCategory(entry)}`}
            style={{ borderLeftColor: color, opacity }}
          >
            <span className="roll-total">{entry.total}</span>
            <span className="roll-meta">
              <strong style={{ color }}>{entry.roller}</strong>
              {entry.label ? ` · ${entry.label}` : ''}{' '}
              <span className="muted">{renderRollDetail(entry.detail)}</span>
            </span>
          </div>
        );
      })}
    </div>
  );
}
