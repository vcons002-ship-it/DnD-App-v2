import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useStore, loadSavedSession } from '../state/socket';
import { PlayerView } from './PlayerView';

export function PlayerRoute() {
  const [params] = useSearchParams();
  const status = useStore((s) => s.status);
  const snapshot = useStore((s) => s.snapshot);
  const error = useStore((s) => s.error);
  const connect = useStore((s) => s.connect);
  const [code, setCode] = useState(params.get('code') ?? '');

  useEffect(() => {
    const c = params.get('code');
    if (c) setCode(c);
  }, [params]);

  // After a reload / tab eviction, auto-rejoin the saved session so the player
  // isn't bounced to this screen (unless a different ?code= link was opened).
  useEffect(() => {
    if (status !== 'idle') return;
    const saved = loadSavedSession();
    const param = params.get('code');
    if (saved?.role === 'player' && (!param || param === saved.code)) {
      connect(saved.code, 'player', saved.dmPassphrase);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // NB: players deliberately do NOT get a browse-all-sessions list — that would
  // expose every campaign's join code to anyone. A player joins by the link the
  // DM shares (?code=…) or by typing the code; returning players auto-rejoin.

  // Stay on the game view through a reconnect blip (we keep the last snapshot);
  // ConnectionStatus shows the "Reconnecting…" banner.
  if (status === 'connected' || (status === 'reconnecting' && snapshot)) {
    return <PlayerView />;
  }

  return (
    <div className="entry">
      <h1>Join Game</h1>
      <p>Enter the session code your DM shared.</p>
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
    </div>
  );
}
