import { useCallback, useEffect, useState } from 'react';
import type { Monster } from '../../../shared/types';
import { productionFamily, type AssetJob } from '../../../shared/assetProduction';
import { apiFetch } from '../lib/api';
import { resolveMiniature, useMiniatureCatalog } from '../lib/miniatures';
import { useStore } from '../state/socket';

/** Private job names/status never go to the player catalog or player UI. */
export function AssetProductionStatus({ monster }: { monster: Monster }) {
  const role = useStore(s => s.snapshot?.role);
  const updateMonster = useStore(s => s.updateMonster);
  const [notes, setNotes] = useState('');
  const [state, setState] = useState<{ jobs: AssetJob[]; paused: boolean }>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useMiniatureCatalog();
  const refresh = useCallback(async () => {
    if (role !== 'dm') return;
    try {
      const response = await apiFetch('/api/assets/jobs', { signal: AbortSignal.timeout(10000) });
      if (response.ok) { setState(await response.json()); setError(''); }
      else setError('Could not read 3D job status.');
    } catch { setError('3D job status temporarily unavailable.'); }
  }, [role]);
  useEffect(() => { void refresh(); const timer = setInterval(() => { void refresh(); }, 5000); return () => clearInterval(timer); }, [refresh]);
  useEffect(() => { setNotes(''); }, [monster.id]);
  const family = productionFamily(monster);
  if (role !== 'dm' || monster.objectKind) return null;
  const model = resolveMiniature(monster.name, 'monster', monster);
  const custom = state?.jobs.filter(j => j.sourceMonsterId === monster.id).at(-1);
  const job = custom ?? state?.jobs.find(j => j.family === family);
  const action = async (url: string, body: object) => {
    setBusy(true);
    try {
      const response = await apiFetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!response.ok) { const result = await response.json(); throw Error(result.error || 'Could not update the 3D job.'); }
      await refresh();
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not update the 3D job. Try again.'); }
    finally { setBusy(false); }
  };
  return <div className="asset-production-status" aria-live="polite">
    <small>{job ? `3D ${job.state}: ${job.stage}` : model ? '3D model ready' : '2D placeholder · no 3D model yet'}{state?.paused ? ' · Queue paused' : ''}</small>
    {job?.error && <small>{job.error}</small>}
    {error && <small role="alert">{error}</small>}
    <div>
      {!model && !job && family && <button disabled={busy} onClick={() => void action('/api/assets/queue', { monsterId: monster.id })}>Create 3D model</button>}
      {custom?.state === 'ready' && monster.modelType !== custom.family && <button onClick={() => updateMonster({ monsterId: monster.id, modelType: custom.family })}>Use this model</button>}
      {job?.state === 'failed' && <button disabled={busy} onClick={() => void action(`/api/assets/jobs/${job.id}/retry`, {})}>Retry 3D</button>}
      {state && <button disabled={busy} title="Pausing lets the current model finish and holds subsequent jobs." onClick={() => void action('/api/assets/pause', { paused: !state.paused })}>{state.paused ? 'Resume 3D queue' : 'Pause 3D queue'}</button>}
    </div>
    <details>
      <summary>New 3D model</summary>
      <small>Uses this token’s weapons, attacks, and armor details. Keeps the current model until you choose Use this model.</small>
      <label>Appearance notes (optional)<textarea aria-label="3D appearance notes" maxLength={600} value={notes} onChange={e => setNotes(e.target.value)} placeholder="For example: chainmail, crossbow held ready, sword sheathed" /></label>
      <button disabled={busy || !!(custom && ['queued', 'running'].includes(custom.state))} onClick={() => void action('/api/assets/queue', { monsterId: monster.id, newModel: true, notes })}>Generate new 3D model</button>
    </details>
  </div>;
}
