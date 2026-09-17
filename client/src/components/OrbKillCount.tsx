import { useId } from 'react';

/** An engraved trophy on the orb's plinth. The saved server tally is read-only. */
export function OrbKillCount({ name, value }: { name: string; value: number }) {
  const id = useId();
  const count = value.toLocaleString('en-US');
  return (
    <div className="orb-kill-count" data-kill-count={value}
      role="status" aria-label={`${name}: ${value} ${value === 1 ? 'kill' : 'kills'}`}
      title={`${name} · ${count} ${value === 1 ? 'kill' : 'kills'} credited to this character`}>
      <svg className="orb-kill-crest" viewBox="0 0 108 40" aria-hidden="true" focusable="false">
        <defs>
          <linearGradient id={`${id}-bronze`} x1="0" y1="0" x2=".4" y2="1">
            <stop stopColor="#f5dfb2" /><stop offset=".25" stopColor="#b49a65" />
            <stop offset=".5" stopColor="#51402c" /><stop offset=".77" stopColor="#c2a572" />
            <stop offset="1" stopColor="#6a5030" />
          </linearGradient>
          <linearGradient id={`${id}-bone`} x1="0" y1="0" x2="1" y2="1">
            <stop stopColor="#f2dfb7" /><stop offset=".45" stopColor="#c3ab7f" />
            <stop offset="1" stopColor="#705a3c" />
          </linearGradient>
        </defs>
        <path d="M9 9 24 5l11 3 54-1 10 5-2 20-10 5-52-2-12 3-14-6Z"
          fill="#12151bcc" stroke={`url(#${id}-bronze)`} strokeWidth="1.6" />
        <path d="m36 11 51-1 8 4-2 15-7 5-50-2M10 12l13-4 9 3M12 29l11 6 9-3"
          fill="none" stroke="#d6bd8b" strokeWidth=".6" opacity=".7" />
        <path d="M13 9Q3 2 4 16l5 5-5 7q-2 6 7 7M99 11q7-8 7 3l-6 7 4 5q3 7-7 9"
          fill="none" stroke={`url(#${id}-bronze)`} strokeWidth="1.5" />
        <path d="m49 5 4-3 4 3-4 3ZM49 36l4-2 4 2-4 3Z" fill={`url(#${id}-bronze)`} />
        <path d="M14 19c0-7 4-10 10-10s10 3 10 10l-3 5v7l-3 2h-8l-3-2v-7Z"
          fill={`url(#${id}-bone)`} stroke="#59442c" strokeWidth="1" />
        <path d="m17 19 6 1-1 5-4-1Zm14 0-6 1 1 5 4-1Zm-7 5-2 4h4Z" fill="#19191b" />
        <path d="M19 29h10m-7 0v4m4-4v4M17 16q7-8 14 0" fill="none" stroke="#705636" strokeWidth=".8" />
      </svg>
      <span className="orb-kill-inscription" aria-hidden="true">
        <strong className="orb-kill-value" style={{ fontSize: count.length > 6 ? 11 : count.length > 4 ? 16 : undefined }}>{count}</strong>
        <small>Kills</small>
      </span>
    </div>
  );
}
