import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useStore } from '../state/socket';
import { DmView } from './DmView';

export function DmRoute() {
  const [params] = useSearchParams();
  const status = useStore((s) => s.status);
  const error = useStore((s) => s.error);
  const connect = useStore((s) => s.connect);
  const [code, setCode] = useState(params.get('code') ?? '');
  const [passphrase, setPassphrase] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    const c = params.get('code');
    if (c) setCode(c);
  }, [params]);

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
    </div>
  );
}
