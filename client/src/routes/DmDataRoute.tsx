import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useStore } from '../state/socket';
import { DmDataView } from './DmDataView';

/**
 * Standalone DM "Data mode" entry — meant to be opened in a second window /
 * monitor / tablet. It connects as another DM client (no new server state) and
 * renders the full-screen battlefield dashboard. The DM enters their secret
 * here (this is a separate window, so it doesn't share the main screen's login).
 */
export function DmDataRoute() {
  const [params] = useSearchParams();
  const status = useStore((s) => s.status);
  const error = useStore((s) => s.error);
  const snapshot = useStore((s) => s.snapshot);
  const connect = useStore((s) => s.connect);
  const code = (params.get('code') ?? '').toUpperCase();
  const [passphrase, setPassphrase] = useState('');

  // Stay on the dashboard through a reconnect blip (keep the last snapshot).
  if (
    snapshot?.role === 'dm' &&
    (status === 'connected' || status === 'reconnecting')
  ) {
    return <DmDataView />;
  }

  return (
    <div className="entry">
      <h1>DM Data mode</h1>
      {!code && <p className="err">Open this from the DM screen (no code given).</p>}
      {code && <p>Enter your DM secret to open session {code}.</p>}
      <input
        placeholder="DM secret (required — see server console)"
        type="password"
        value={passphrase}
        onChange={(e) => setPassphrase(e.target.value)}
        title="Printed in the server console at startup and saved in server/data/dm-secret.txt."
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
