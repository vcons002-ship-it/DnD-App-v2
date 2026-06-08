import { useStore } from '../state/socket';

/** A small banner shown while the socket is dropped. The last snapshot stays on
 *  screen and actions are queued by Socket.IO, flushing on reconnect. */
export function ConnectionStatus() {
  const status = useStore((s) => s.status);
  if (status !== 'reconnecting') return null;
  return (
    <div className="conn-banner" role="status">
      <span className="conn-dot" /> Reconnecting… changes will sync when you’re back online.
    </div>
  );
}
