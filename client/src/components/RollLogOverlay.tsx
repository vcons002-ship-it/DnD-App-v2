import type { RollEntry } from '../../../shared/types';
import { rollCategory, rollerColor } from '../lib/rollStyle';

/**
 * Compact, click-through roll readout pinned to the bottom-left of the map.
 * Shows just the latest roll on a single line so it stays out of the way;
 * `pointer-events:none` keeps the map fully clickable underneath.
 */
export function RollLogOverlay({ rollLog }: { rollLog: RollEntry[] }) {
  const latest = rollLog[rollLog.length - 1];
  if (!latest) return null;
  const color = rollerColor(latest.roller);
  return (
    <div
      className={`roll-log-overlay roll-entry cat-${rollCategory(latest)}`}
      style={{ borderLeftColor: color }}
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
