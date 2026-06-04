import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { SessionSummary } from '../../../shared/types';
import { useStore } from '../state/socket';
import { DmView } from './DmView';

const fmtDate = (ms: number) =>
  ms ? new Date(ms).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }) : '—';

export function DmRoute() {
  const [params] = useSearchParams();
  const status = useStore((s) => s.status);
  const error = useStore((s) => s.error);
  const connect = useStore((s) => s.connect);
  const [code, setCode] = useState(params.get('code') ?? '');
  const [passphrase, setPassphrase] = useState('');
  const [creating, setCreating] = useState(false);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);

  useEffect(() => {
    const c = params.get('code');
    if (c) setCode(c);
  }, [params]);

  useEffect(() => {
    fetch('/api/sessions')
      .then((r) => r.json())
      .then(setSessions)
      .catch(() => setSessions([]));
  }, []);

  const createSession = async () => {
    setCreating(true);
    try {
      const res = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      setCode(data.code);
      connect(data.code, 'dm', passphrase);
    } finally {
      setCreating(false);
    }
  };

  if (status === 'connected') return <DmView />;

  return (
    <div className="entry">
      <h1>DM Console</h1>
      <p>Start a new session or rejoin an existing one.</p>

      <button className="btn big" disabled={creating} onClick={createSession}>
        {creating ? 'Creating…' : 'Create new session'}
      </button>

      <div className="entry-divider">or rejoin</div>

      <input
        placeholder="Session code"
        value={code}
        onChange={(e) => setCode(e.target.value.toUpperCase())}
      />
      <input
        placeholder="DM passphrase (if set)"
        type="password"
        value={passphrase}
        onChange={(e) => setPassphrase(e.target.value)}
      />
      <button
        className="btn big"
        disabled={!code || status === 'connecting'}
        onClick={() => connect(code, 'dm', passphrase)}
      >
        {status === 'connecting' ? 'Connecting…' : 'Rejoin as DM'}
      </button>

      {error && <p className="err">{error}</p>}

      {sessions.length > 0 && (
        <div className="session-dir">
          <div className="entry-divider">saved sessions</div>
          {sessions.map((s) => (
            <button
              key={s.code}
              className="session-row"
              onClick={() => connect(s.code, 'dm', passphrase)}
              title={`Created ${fmtDate(s.createdAt)}`}
            >
              <span className="session-code">{s.code}</span>
              <span className="session-meta">
                {s.mapCount} map{s.mapCount === 1 ? '' : 's'} · played{' '}
                {fmtDate(s.lastPlayedAt)}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
