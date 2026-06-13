import { useEffect, useRef, useState } from 'react';
import type { MapImage } from '../../../shared/types';

/**
 * The map toolbar's "Tiles" dropdown (DM only): build a larger map out of several
 * image files. Upload tiles, toggle on-map arranging (drag to move / corner to
 * resize), and reorder/remove each. Mirrors the Measure/Scale/Fog popover
 * pattern; presentational — canonical state lives in MapStage.
 */
export function TilesMenu({
  tiles,
  arranging,
  onToggleArrange,
  onAddFile,
  onReorder,
  onRemove,
}: {
  tiles: MapImage[];
  arranging: boolean;
  onToggleArrange: () => void;
  /** Upload + place an image file as a new tile. */
  onAddFile: (file: File) => void;
  onReorder: (id: string, to: 'front' | 'back') => void;
  onRemove: (id: string) => void;
}) {
  const btn = useRef<HTMLButtonElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const toggle = () => {
    if (!open && btn.current) {
      const r = btn.current.getBoundingClientRect();
      const W = 250;
      setPos({ x: Math.max(8, Math.min(r.left, window.innerWidth - W - 8)), y: r.bottom + 4 });
    }
    setOpen((o) => !o);
  };

  return (
    <>
      <button
        ref={btn}
        type="button"
        className={`btn tiny ${arranging ? 'on' : ''}`}
        onClick={toggle}
        title="Map tiles — compose a larger map from several images"
      >
        🧩 Tiles{tiles.length ? ` (${tiles.length})` : ''} ▾
      </button>
      {open && (
        <>
          <div className="popover-backdrop" onClick={() => setOpen(false)} />
          <div className="measure-menu tiles-menu" style={{ left: pos.x, top: pos.y }} onClick={(e) => e.stopPropagation()}>
            <p className="hint">
              Add image files and arrange them on the map to build a bigger
              battlemap. The grid, fog, and scale span all the tiles.
            </p>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onAddFile(f);
                if (fileRef.current) fileRef.current.value = '';
              }}
            />
            <button className="btn tiny" onClick={() => fileRef.current?.click()}>
              ➕ Add image tile
            </button>
            <label className="measure-row" style={{ justifyContent: 'space-between' }}>
              <span>✥ Arrange on map (drag / resize)</span>
              <input type="checkbox" checked={arranging} onChange={onToggleArrange} />
            </label>
            {tiles.length > 0 && <div className="measure-sep" />}
            <div className="tiles-list">
              {tiles.map((t, i) => (
                <div key={t.id} className="tiles-row">
                  <span className="tiles-name">Tile {i + 1}</span>
                  <button className="btn tiny" title="Bring to front" onClick={() => onReorder(t.id, 'front')}>
                    ⤒
                  </button>
                  <button className="btn tiny" title="Send to back" onClick={() => onReorder(t.id, 'back')}>
                    ⤓
                  </button>
                  <button className="res-x" title="Remove tile" onClick={() => onRemove(t.id)}>
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </>
  );
}
