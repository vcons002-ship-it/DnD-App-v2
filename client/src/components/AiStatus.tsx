import { useEffect } from 'react';
import { useStore } from '../state/socket';

/**
 * Persistent banner shown while an AI request (stat-fill or creature lookup) is
 * in flight, so the DM knows the AI is working — these calls take many seconds.
 * Clears when the server's completion `notice` arrives, with a safety timeout.
 */
export function AiStatus() {
  const aiBusy = useStore((s) => s.aiBusy);
  const setAiBusy = useStore((s) => s.setAiBusy);

  useEffect(() => {
    if (!aiBusy) return;
    const t = setTimeout(() => setAiBusy(false), 45000);
    return () => clearTimeout(t);
  }, [aiBusy, setAiBusy]);

  if (!aiBusy) return null;
  return (
    <div className="ai-status" role="status">
      <span className="ai-spinner" />
      ✨ AI is working… this can take a few seconds
    </div>
  );
}
