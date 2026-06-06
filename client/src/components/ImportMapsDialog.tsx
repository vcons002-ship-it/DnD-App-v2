import { useState } from 'react';
import { useStore } from '../state/socket';

type SrcMap = { id: string; name: string; tokenCount: number };

/**
 * DM dialog to import maps from another session: enter its code, pick which maps,
 * and copy them (with their tokens and referenced creatures/PCs) into this
 * session. The actual deep-copy is server-side (`session:importMaps`).
 */
export function ImportMapsDialog({ onClose }: { onClose: () => void }) {
  const importMapsFromSession = useStore((s) => s.importMapsFromSession);
  const [code, setCode] = useState('');
  const [maps, setMaps] = useState<SrcMap[] | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    const c = code.trim().toUpperCase();
    if (!c) return;
    setLoading(true);
    setErr(null);
    setMaps(null);
    setPicked(new Set());
    try {
      const res = await fetch(`/api/sessions/${c}/maps`);
      const data: SrcMap[] = await res.json().catch(() => []);
      if (!res.ok || !Array.isArray(data) || data.length === 0) {
        setErr('No maps found for that code.');
        setMaps([]);
        return;
      }
      setMaps(data);
    } finally {
      setLoading(false);
    }
  };

  const toggle = (id: string) =>
    setPicked((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const doImport = () => {
    if (!picked.size) return;
    importMapsFromSession(code.trim().toUpperCase(), [...picked]);
    onClose();
  };

  return (
    <div className="popover-backdrop" onClick={onClose}>
      <div className="import-maps-dialog" onClick={(e) => e.stopPropagation()}>
        <h3>Import maps from another session</h3>
        <div className="dice-row">
          <input
            placeholder="Session code"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === 'Enter' && load()}
            autoFocus
          />
          <button className="btn" disabled={loading || !code.trim()} onClick={load}>
            {loading ? '…' : 'Find'}
          </button>
        </div>
        {err && <p className="err">{err}</p>}
        {maps && maps.length > 0 && (
          <>
            <div className="import-map-list">
              {maps.map((m) => (
                <label key={m.id} className="import-map-row">
                  <input
                    type="checkbox"
                    checked={picked.has(m.id)}
                    onChange={() => toggle(m.id)}
                  />
                  <span className="import-map-name">{m.name}</span>
                  <span className="muted">
                    {m.tokenCount} token{m.tokenCount === 1 ? '' : 's'}
                  </span>
                </label>
              ))}
            </div>
            <p className="hint">
              Copies each picked map with its tokens and the creatures/PCs they use
              into this session. The other session is left untouched.
            </p>
          </>
        )}
        <div className="session-edit-actions">
          <button className="btn green" disabled={!picked.size} onClick={doImport}>
            Import{picked.size ? ` ${picked.size}` : ''}
          </button>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
