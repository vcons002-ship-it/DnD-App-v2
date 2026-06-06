import { useState } from 'react';
import type { Character } from '../../../shared/types';

type Existing = { name: string; className: string; level: number; maxHp: number };

/**
 * "Save to library" dialog for a CHARACTER. The owner/DM names the entry; on a
 * name clash the server returns 409 and we show the existing entry with
 * Cancel / rename / overwrite (mirrors the creature `LibrarySaveDialog`).
 */
export function LibraryCharacterDialog({
  character,
  onClose,
}: {
  character: Character;
  onClose: () => void;
}) {
  const [name, setName] = useState(character.name);
  const [busy, setBusy] = useState(false);
  const [conflict, setConflict] = useState<Existing | null>(null);
  const [status, setStatus] = useState<'idle' | 'saved' | 'error'>('idle');

  // The full sheet minus session state (id/sessionId/claimedBy/conditions).
  const body = () => ({
    name: name.trim(),
    race: character.race,
    className: character.className,
    level: character.level,
    maxHp: character.maxHp,
    curHp: character.curHp,
    armorClass: character.armorClass,
    speed: character.speed,
    stats: character.stats,
    spellSlots: character.spellSlots,
    resources: character.resources,
    weapons: character.weapons,
    resistances: character.resistances,
    weaknesses: character.weaknesses,
    actions: character.actions,
    abilities: character.abilities,
    proficientSkills: character.proficientSkills,
    items: character.items,
    sheetAbilities: character.sheetAbilities,
    icon: character.icon,
  });

  const save = async (overwrite: boolean) => {
    if (!name.trim()) return;
    setBusy(true);
    setStatus('idle');
    try {
      const res = await fetch(
        `/api/library/characters${overwrite ? '?overwrite=true' : ''}`,
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
          <h3>Save character to library</h3>
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
              A saved character named “{conflict.name}” already exists.
            </p>
            <div className="lib-compare">
              <div>
                <h4>Existing</h4>
                <p className="muted">
                  {conflict.className || '—'} · Lvl {conflict.level} · HP {conflict.maxHp}
                </p>
              </div>
              <div>
                <h4>New</h4>
                <p className="muted">
                  {character.className || '—'} · Lvl {character.level} · HP{' '}
                  {character.maxHp}
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
