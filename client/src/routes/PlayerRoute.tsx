import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { SessionSummary } from '../../../shared/types';
import { useStore } from '../state/socket';
import { PlayerView } from './PlayerView';

const fmtDate = (ms: number) =>
  ms
    ? new Date(ms).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
      })
    : '';

export function PlayerRoute() {
  const [params] = useSearchParams();
  const status = useStore((s) => s.status);
  const error = useStore((s) => s.error);
  const connect = useStore((s) => s.connect);
  const [code, setCode] = useState(params.get('code') ?? '');
  const [sessions, setSessions] = useState<SessionSummary[]>([]);

  useEffect(() => {
    const c = params.get('code');
    if (c) setCode(c);
  }, [params]);

  // Saved sessions to pick from (the directory is public, no DM-only data).
  useEffect(() => {
    if (status !== 'connected')
      fetch('/api/sessions')
        .then((r) => r.json())
        .then((d: SessionSummary[]) => setSessions(Array.isArray(d) ? d : []))
        .catch(() => setSessions([]));
  }, [status]);

  if (status === 'connected') return <PlayerView />;

  return (
    <div className="entry">
      <h1>Join Game</h1>
      <p>Enter the session code your DM shared, or pick a saved game below.</p>
      <input
        placeholder="Session code"
        value={code}
        onChange={(e) => setCode(e.target.value.toUpperCase())}
        onKeyDown={(e) => e.key === 'Enter' && code && connect(code, 'player')}
      />
      <button
        className="btn big"
        disabled={!code || status === 'connecting'}
        onClick={() => connect(code, 'player')}
      >
        {status === 'connecting' ? 'Connecting…' : 'Join'}
      </button>
      {error && <p className="err">{error}</p>}

      {sessions.length > 0 && (
        <div className="session-dir">
          <div className="entry-divider">saved sessions</div>
          {sessions.map((s) => (
            <div key={s.code} className="session-row-wrap">
              <button
                className="session-row"
                onClick={() => connect(s.code, 'player')}
                title={`Played ${fmtDate(s.lastPlayedAt)} · click to join`}
              >
                <span className="session-code">{s.code}</span>
                <span className="session-name">{s.name}</span>
                <span className="session-meta">
                  {s.mapCount} map{s.mapCount === 1 ? '' : 's'} · played{' '}
                  {fmtDate(s.lastPlayedAt)}
                </span>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
