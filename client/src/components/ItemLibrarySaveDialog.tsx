import { useState } from 'react';
import type { LibraryItem, SheetModifier } from '../../../shared/types';

/** The item being saved (custom or AI-generated — they share this one path). */
export type SaveableItem = {
  name: string;
  description: string;
  qtyDefault: number;
  modifiers?: SheetModifier[];
};

/**
 * "Save to library" dialog for an ITEM. Mirrors the creature/character flow: the
 * user names the entry; on a name clash the server returns 409 and we show the
 * existing item side-by-side with Cancel / rename / overwrite. Carries the item's
 * magic effects (`modifiers`) so a saved +1 cloak keeps its bonuses.
 */
export function ItemLibrarySaveDialog({
  item,
  onClose,
  onSaved,
}: {
  item: SaveableItem;
  onClose: () => void;
  onSaved?: () => void;
}) {
  const [name, setName] = useState(item.name);
  const [busy, setBusy] = useState(false);
  const [conflict, setConflict] = useState<LibraryItem | null>(null);
  const [status, setStatus] = useState<'idle' | 'saved' | 'error'>('idle');

  const modCount = item.modifiers?.length ?? 0;

  const save = async (overwrite: boolean) => {
    if (!name.trim()) return;
    setBusy(true);
    setStatus('idle');
    try {
      const res = await fetch(
        `/api/library/items${overwrite ? '?overwrite=true' : ''}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: name.trim(),
            description: item.description,
            qtyDefault: item.qtyDefault,
            modifiers: item.modifiers ?? [],
          }),
        },
      );
      if (res.status === 409) {
        const data = await res.json();
        setConflict(data.existing as LibraryItem);
        return;
      }
      if (!res.ok) {
        setStatus('error');
        return;
      }
      setStatus('saved');
      setConflict(null);
      onSaved?.();
      setTimeout(onClose, 600);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>Save item to library</h3>
          <button className="btn tiny" onClick={onClose}>
            ✕
          </button>
        </div>

        <label className="settings-field">
          Save as
          <input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </label>
        {modCount > 0 && (
          <p className="muted">Includes {modCount} magic effect{modCount > 1 ? 's' : ''} ✦</p>
        )}

        {conflict ? (
          <div className="lib-conflict">
            <p className="err">
              A library item named “{conflict.name}” already exists — saving will
              replace it.
            </p>
            <div className="lib-compare">
              <div>
                <h4>Existing</h4>
                <p className="muted">
                  ×{conflict.qtyDefault}
                  {(conflict.modifiers?.length ?? 0) > 0 &&
                    ` · ✦${conflict.modifiers!.length}`}
                </p>
              </div>
              <div>
                <h4>New</h4>
                <p className="muted">
                  ×{item.qtyDefault}
                  {modCount > 0 && ` · ✦${modCount}`}
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
