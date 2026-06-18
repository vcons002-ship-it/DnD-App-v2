import { useMemo } from 'react';
import type { StateSnapshot } from '../../../shared/types';

/**
 * Shared "enemies defeated" scoreboard: every PC with at least one kill, sorted
 * by kill count (desc). Visible to everyone (the count is public on the sheet).
 * Renders nothing until the party has scored a kill, so it stays out of the way
 * before combat. Used in the DM Data view and the initiative header.
 */
export function KillScoreboard({
  snapshot,
  className = '',
}: {
  snapshot: StateSnapshot;
  className?: string;
}) {
  const scored = useMemo(
    () =>
      snapshot.characters
        .filter((c) => (c.killCount ?? 0) > 0)
        .sort((a, b) => (b.killCount ?? 0) - (a.killCount ?? 0)),
    [snapshot.characters],
  );
  if (scored.length === 0) return null;
  return (
    <div className={`kill-scoreboard ${className}`} title="Enemies defeated">
      <span className="kill-scoreboard-title">💀 Kills</span>
      {scored.map((c) => (
        <span key={c.id} className="kill-scoreboard-row">
          <span className="kill-name">{c.name}</span>
          <span className="kill-num">{c.killCount}</span>
        </span>
      ))}
    </div>
  );
}
