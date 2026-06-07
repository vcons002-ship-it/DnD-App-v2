import { useState } from 'react';
import { useStore } from '../state/socket';
import type {
  ImportCharConflict,
  ImportConflictResolution,
} from '../../../shared/types';

type SrcMap = { id: string; name: string; tokenCount: number };

/**
 * DM dialog to import maps from another session: enter its code, pick which maps,
 * and copy them (with their tokens and referenced creatures/PCs) into this
 * session. The actual deep-copy is server-side (`session:importMaps`).
 */
export function ImportMapsDialog({ onClose }: { onClose: () => void }) {
  const importMapsFromSession = useStore((s) => s.importMapsFromSession);
  const previewImport = useStore((s) => s.previewImport);
  const [code, setCode] = useState('');
  const [maps, setMaps] = useState<SrcMap[] | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  // Conflict step: same-named characters the DM must resolve before importing.
  const [conflicts, setConflicts] = useState<ImportCharConflict[] | null>(null);
  const [choices, setChoices] = useState<
    Record<string, ImportConflictResolution>
  >({});

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

  // Step 1: from the map list, check for name collisions before importing.
  const proceed = async () => {
    if (!picked.size) return;
    const src = code.trim().toUpperCase();
    const found = await previewImport(src, [...picked]);
    const clash = found.filter((c) => c.exists);
    if (clash.length === 0) {
      importMapsFromSession(src, [...picked]); // nothing to resolve
      onClose();
      return;
    }
    // Default every conflict to the safe "reuse existing" choice.
    setChoices(Object.fromEntries(clash.map((c) => [c.sourceId, 'reuse'])));
    setConflicts(clash);
  };

  // Step 2: import with the DM's per-character resolutions.
  const doImport = () => {
    importMapsFromSession(code.trim().toUpperCase(), [...picked], choices);
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
        {/* Step 1: pick maps. */}
        {!conflicts && maps && maps.length > 0 && (
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
        {/* Step 2: resolve same-named characters. */}
        {conflicts && (
          <>
            <p className="hint">
              These characters already exist here. Choose what to do with each —
              a character a player is actively using is never overwritten.
            </p>
            <div className="import-map-list">
              {conflicts.map((c) => (
                <div key={c.sourceId} className="import-conflict-row">
                  <span className="import-map-name">{c.name}</span>
                  <div className="disposition-btns">
                    {(['reuse', 'overwrite', 'new'] as const).map((opt) => (
                      <button
                        key={opt}
                        className={`btn tiny ${choices[c.sourceId] === opt ? 'on' : ''}`}
                        title={
                          opt === 'reuse'
                            ? 'Link to the existing character (no copy)'
                            : opt === 'overwrite'
                            ? 'Replace the existing character with the imported one'
                            : 'Create a new, separate character'
                        }
                        onClick={() =>
                          setChoices((ch) => ({ ...ch, [c.sourceId]: opt }))
                        }
                      >
                        {opt[0].toUpperCase() + opt.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
        <div className="session-edit-actions">
          {conflicts ? (
            <button className="btn green" onClick={doImport}>
              Import {picked.size}
            </button>
          ) : (
            <button className="btn green" disabled={!picked.size} onClick={proceed}>
              Import{picked.size ? ` ${picked.size}` : ''}
            </button>
          )}
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
