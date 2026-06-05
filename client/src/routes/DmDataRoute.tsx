import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useStore } from '../state/socket';
import { DmDataView } from './DmDataView';

/**
 * Standalone DM "Data mode" entry — meant to be opened in a second window /
 * monitor / tablet. It connects as another DM client (no new server state) and
 * renders the full-screen battlefield dashboard. Auto-connects from ?code=…,
 * falling back to a tiny passphrase form if the session requires one.
 */
export function DmDataRoute() {
  const [params] = useSearchParams();
  const status = useStore((s) => s.status);
  const error = useStore((s) => s.error);
  const snapshot = useStore((s) => s.snapshot);
  const connect = useStore((s) => s.connect);
  const code = (params.get('code') ?? '').toUpperCase();
  const [passphrase, setPassphrase] = useState('');
  const [tried, setTried] = useState(false);

  // Try once with no passphrase; if the session needs one, the form appears.
  useEffect(() => {
    if (code && status === 'idle' && !tried) {
      setTried(true);
      connect(code, 'dm', '');
    }
  }, [code, status, tried, connect]);

  if (status === 'connected' && snapshot?.role === 'dm') {
    return <DmDataView />;
  }

  return (
    <div className="entry">
      <h1>DM Data mode</h1>
      {!code && <p className="err">Open this from the DM screen (no code given).</p>}
      {code && <p>Connecting to session {code}…</p>}
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
        {status === 'connecting' ? 'Connecting…' : 'Connect'}
      </button>
      {error && <p className="err">{error}</p>}
    </div>
  );
}
