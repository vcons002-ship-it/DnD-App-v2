import { useStore } from '../state/socket';

/** A small banner shown while the socket is dropped. The last snapshot stays on
 *  screen; on reconnect the client rejoins and the server pushes a fresh
 *  snapshot that the view resyncs to. NB: actions taken while offline are NOT
 *  guaranteed to replay — a buffered event can reach the server before the
 *  rejoin re-registers this socket — so the copy promises a resync, not that
 *  offline edits upload. */
export function ConnectionStatus() {
  const status = useStore((s) => s.status);
  if (status !== 'reconnecting') return null;
  return (
    <div className="conn-banner" role="status">
      <span className="conn-dot" /> Reconnecting… the game will resync when you’re back online.
    </div>
  );
}
