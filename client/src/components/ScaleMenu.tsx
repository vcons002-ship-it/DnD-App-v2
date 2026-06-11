import { useEffect, useRef, useState } from 'react';

/**
 * The map toolbar's "Scale" dropdown (DM only): the grid square size in **feet**
 * (e.g. 5 ft — the standard D&D square), the real-world map width in feet (the
 * scale source of truth), a derived pixel-cell read-out, and the "set scale from
 * a drawn line" toggle. The pixel grid is derived from feet ÷ map scale, so a
 * square always means real feet. Mirrors MeasureMenu's popover pattern;
 * presentational — the canonical state lives in MapStage.
 */
export function ScaleMenu({
  feetPerSquare,
  widthFt,
  gridPx,
  scaleMode,
  matchMode,
  gridHidden,
  gridLocked,
  onCommit,
  onToggleScaleMode,
  onToggleMatchMode,
  onToggleHidden,
  onUnlock,
}: {
  feetPerSquare: number;
  widthFt: number;
  gridPx: number;
  scaleMode: boolean;
  matchMode: boolean;
  gridHidden: boolean;
  gridLocked: boolean;
  /** Commit a new grid-square (ft) and/or map width (ft); MapStage derives px. */
  onCommit: (feetPerSquare: number, widthFt: number) => void;
  onToggleScaleMode: () => void;
  onToggleMatchMode: () => void;
  onToggleHidden: () => void;
  onUnlock: () => void;
}) {
  const btn = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  // Local edit buffers so typing doesn't fight the derived round-trip; they
  // re-seed from props whenever the committed values change.
  const [ftStr, setFtStr] = useState(String(Math.round(feetPerSquare) || 5));
  const [widthStr, setWidthStr] = useState(String(Math.round(widthFt)));
  useEffect(() => setFtStr(String(Math.round(feetPerSquare) || 5)), [feetPerSquare]);
  useEffect(() => setWidthStr(String(Math.round(widthFt))), [widthFt]);

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

  const commit = () => {
    const ft = Number(ftStr);
    const width = Number(widthStr);
    if (ft > 0 && width > 0) onCommit(ft, width);
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
              <span>Grid square</span>
              <input
                className="grid-input"
                type="number"
                value={ftStr}
                disabled={gridLocked}
                onChange={(e) => setFtStr(e.target.value)}
                onBlur={commit}
                onKeyDown={(e) => e.key === 'Enter' && commit()}
                title={
                  gridLocked
                    ? 'Grid size is locked (matched to the map). Unlock below to edit.'
                    : 'Grid square size in feet (e.g. 5). The pixel cell is derived from the map scale.'
                }
              />
              <span className="muted">ft</span>
            </label>
            <label className="scale-field">
              <span>Map width</span>
              <input
                className="grid-input"
                type="number"
                value={widthStr}
                onChange={(e) => setWidthStr(e.target.value)}
                onBlur={commit}
                onKeyDown={(e) => e.key === 'Enter' && commit()}
                title="Real-world map width in feet — drives the scale"
              />
              <span className="muted">ft</span>
            </label>
            <div className="measure-label">≈ {Math.round(gridPx)} px / square</div>
            {gridLocked && (
              <div className="measure-label">
                🔒 Grid size locked{' '}
                <button className="btn tiny" onClick={onUnlock} title="Allow editing the cell size again">
                  Unlock
                </button>
              </div>
            )}
            <div className="measure-sep" />
            <label className="measure-row" style={{ justifyContent: 'space-between' }}>
              <span>👁 Hide grid</span>
              <input type="checkbox" checked={gridHidden} onChange={onToggleHidden} />
            </label>
            <button
              className={`measure-row ${matchMode ? 'on' : ''}`}
              onClick={() => {
                onToggleMatchMode();
                setOpen(false);
              }}
              title="Drag across one square of the map's printed grid to match it"
            >
              <span>🔲 Match map grid (drag a square)</span>
            </button>
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
