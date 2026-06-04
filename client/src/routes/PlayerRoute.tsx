import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useStore } from '../state/socket';
import { PlayerView } from './PlayerView';

export function PlayerRoute() {
  const [params] = useSearchParams();
  const status = useStore((s) => s.status);
  const error = useStore((s) => s.error);
  const connect = useStore((s) => s.connect);
  const [code, setCode] = useState(params.get('code') ?? '');

  useEffect(() => {
    const c = params.get('code');
    if (c) setCode(c);
  }, [params]);

  if (status === 'connected') return <PlayerView />;

  return (
    <div className="entry">
      <h1>Join Game</h1>
      <p>Enter the session code your DM shared.</p>
      <input
        placeholder="Session code"
        value={code}
        onChange={(e) => setCode(e.target.value.toUpperCase())}
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
