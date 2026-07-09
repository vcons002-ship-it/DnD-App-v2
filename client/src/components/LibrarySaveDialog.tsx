import { useState } from 'react';
import type { Monster } from '../../../shared/types';
import { apiFetch } from '../lib/api';

type Existing = {
  name: string;
  creatureType: string;
  maxHp: number;
  armorClass: number;
  source?: 'srd' | 'gemini' | 'library';
};

const SOURCE_LABEL: Record<string, string> = {
  srd: 'built-in SRD',
  library: 'library',
  gemini: 'AI',
};

/**
 * "Save to library" dialog. The DM names the entry; on a name clash the server
 * returns 409 and we show the existing entry side-by-side with Cancel / rename /
 * overwrite (per the agreed conflict workflow).
 */
export function LibrarySaveDialog({
  monster,
  onClose,
}: {
  monster: Monster;
  onClose: () => void;
}) {
  const [name, setName] = useState(monster.name);
  const [busy, setBusy] = useState(false);
  const [conflict, setConflict] = useState<Existing | null>(null);
  const [status, setStatus] = useState<'idle' | 'saved' | 'error'>('idle');

  const body = () => ({
    name: name.trim(),
    creatureType: monster.creatureType,
    level: monster.level,
    maxHp: monster.maxHp,
    armorClass: monster.armorClass,
    speed: monster.speed,
    stats: monster.stats,
    resistances: monster.resistances,
    weaknesses: monster.weaknesses,
    weapons: monster.weapons,
    actions: monster.actions,
    abilities: monster.abilities,
    sheetAbilities: monster.sheetAbilities,
    icon: monster.icon,
  });

  const save = async (overwrite: boolean) => {
    if (!name.trim()) return;
    setBusy(true);
    setStatus('idle');
    try {
      const res = await apiFetch(
        `/api/library/creatures${overwrite ? '?overwrite=true' : ''}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body()),
        },
      );
      if (res.status === 409) {
        const data = await res.json();
        setConflict(data.existing as Existing);
        return;
      }
      if (!res.ok) {
        setStatus('error');
        return;
      }
      setStatus('saved');
      setConflict(null);
      setTimeout(onClose, 600);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>Save to library</h3>
          <button className="btn tiny" onClick={onClose}>
            ✕
          </button>
        </div>

        <label className="settings-field">
          Save as
          <input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </label>

        {conflict ? (
          <div className="lib-conflict">
            <p className="err">
              A {SOURCE_LABEL[conflict.source ?? 'library']} creature named “
              {conflict.name}” already exists — saving will shadow it in
              search.
            </p>
            <div className="lib-compare">
              <div>
                <h4>Existing ({SOURCE_LABEL[conflict.source ?? 'library']})</h4>
                <p className="muted">
                  {conflict.creatureType || '—'} · HP {conflict.maxHp} · AC{' '}
                  {conflict.armorClass}
                </p>
              </div>
              <div>
                <h4>New</h4>
                <p className="muted">
                  {monster.creatureType || '—'} · HP {monster.maxHp} · AC{' '}
                  {monster.armorClass}
                </p>
              </div>
            </div>
            <div className="modal-actions">
              <button className="btn red" disabled={busy} onClick={() => save(true)}>
                Overwrite
              </button>
              <button className="btn" onClick={() => setConflict(null)}>
                Edit name &amp; save
              </button>
              <button className="btn" onClick={onClose}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="modal-actions">
            <button
              className="btn green"
              disabled={busy || !name.trim()}
              onClick={() => save(false)}
            >
              {status === 'saved' ? 'Saved ✓' : busy ? 'Saving…' : 'Save'}
            </button>
            <button className="btn" onClick={onClose}>
              Cancel
            </button>
          </div>
        )}
        {status === 'error' && <p className="err">Could not save.</p>}
      </div>
    </div>
  );
}
