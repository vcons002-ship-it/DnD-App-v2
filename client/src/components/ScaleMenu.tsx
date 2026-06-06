import { useEffect, useRef, useState } from 'react';

/**
 * The map toolbar's "Scale" dropdown (DM only): the grid cell size (visual), the
 * real-world map width in feet (the scale source of truth), a derived
 * feet-per-square read-out, and the "set scale from a drawn line" toggle. Mirrors
 * MeasureMenu's popover pattern; presentational — state lives in MapStage.
 */
export function ScaleMenu({
  gridPx,
  widthFt,
  derivedFtPerSquare,
  scaleMode,
  onGridPx,
  onWidthFt,
  onCommit,
  onToggleScaleMode,
}: {
  gridPx: number;
  widthFt: number;
  derivedFtPerSquare: number;
  scaleMode: boolean;
  onGridPx: (n: number) => void;
  onWidthFt: (n: number) => void;
  onCommit: () => void;
  onToggleScaleMode: () => void;
}) {
  const btn = useRef<HTMLButtonElement>(null);
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
      const W = 230;
      setPos({ x: Math.max(8, Math.min(r.left, window.innerWidth - W - 8)), y: r.bottom + 4 });
    }
    setOpen((o) => !o);
  };

  return (
    <>
      <button
        ref={btn}
        type="button"
        className={`btn tiny ${scaleMode ? 'on' : ''}`}
        onClick={toggle}
        title="Map scale & grid"
      >
        📐 Scale{widthFt > 0 ? `: ${Math.round(widthFt)} ft` : ''} ▾
      </button>
      {open && (
        <>
          <div className="popover-backdrop" onClick={() => setOpen(false)} />
          <div className="measure-menu scale-menu" style={{ left: pos.x, top: pos.y }} onClick={(e) => e.stopPropagation()}>
            <label className="scale-field">
              <span>Grid cell</span>
              <input
                className="grid-input"
                type="number"
                value={gridPx}
                onChange={(e) => onGridPx(Number(e.target.value))}
                onBlur={onCommit}
                onKeyDown={(e) => e.key === 'Enter' && onCommit()}
                title="Grid cell size in pixels (visual only)"
              />
              <span className="muted">px</span>
            </label>
            <label className="scale-field">
              <span>Map width</span>
              <input
                className="grid-input"
                type="number"
                value={widthFt}
                onChange={(e) => onWidthFt(Number(e.target.value))}
                onBlur={onCommit}
                onKeyDown={(e) => e.key === 'Enter' && onCommit()}
                title="Real-world map width in feet — drives the scale"
              />
              <span className="muted">ft</span>
            </label>
            <div className="measure-label">≈ {Math.round(derivedFtPerSquare)} ft / square</div>
            <div className="measure-sep" />
            <button
              className={`measure-row ${scaleMode ? 'on' : ''}`}
              onClick={() => {
                onToggleScaleMode();
                setOpen(false);
              }}
            >
              <span>📏 Set scale from line</span>
            </button>
          </div>
        </>
      )}
    </>
  );
}
