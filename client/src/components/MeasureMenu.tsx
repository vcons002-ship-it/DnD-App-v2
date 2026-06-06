import { useEffect, useRef, useState } from 'react';
import {
  MEASURE_FT,
  type MeasureShapeKind,
  type MeasureSize,
  type MeasureTool,
} from '../canvas/MapStage';

const SHAPES: { shape: MeasureShapeKind; label: string; icon: string; unit: string }[] = [
  { shape: 'circle', label: 'Circle', icon: '◯', unit: 'radius' },
  { shape: 'cone', label: 'Cone', icon: '△', unit: 'length' },
  { shape: 'line', label: 'Line', icon: '📏', unit: 'length' },
  { shape: 'square', label: 'Square', icon: '▢', unit: 'side' },
  { shape: 'emanation', label: 'Emanation', icon: '⊛', unit: 'radius' },
];

const SIZES: MeasureSize[] = ['custom', 'small', 'large'];

/**
 * The map toolbar's "Measure" dropdown: a snap toggle, a click-to-remove toggle,
 * Clear mine / Clear all, and a row per AOE shape that expands to Custom / Small
 * / Large. Picking a size selects the tool and closes the menu.
 */
export function MeasureMenu({
  tool,
  snap,
  removeMode,
  hasMeasurements,
  isDm,
  onPick,
  onToggleSnap,
  onToggleRemove,
  onClearMine,
  onClearAll,
}: {
  tool: MeasureTool | null;
  snap: boolean;
  removeMode: boolean;
  hasMeasurements: boolean;
  isDm: boolean;
  onPick: (shape: MeasureShapeKind, size: MeasureSize) => void;
  onToggleSnap: () => void;
  onToggleRemove: () => void;
  onClearMine: () => void;
  onClearAll: () => void;
}) {
  const btn = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [expanded, setExpanded] = useState<MeasureShapeKind | null>(null);

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
      setPos({
        x: Math.max(8, Math.min(r.left, window.innerWidth - W - 8)),
        y: r.bottom + 4,
      });
    }
    setOpen((o) => !o);
  };

  const sizeFt = (shape: MeasureShapeKind, size: MeasureSize): string =>
    size === 'custom' ? 'drag' : `${MEASURE_FT[shape][size]} ft`;

  // Short summary on the button.
  const active = removeMode
    ? 'Remove'
    : tool
      ? `${SHAPES.find((s) => s.shape === tool.shape)?.label} ${sizeFt(tool.shape, tool.size)}`
      : null;

  return (
    <>
      <button
        ref={btn}
        type="button"
        className={`btn tiny ${active ? 'on' : ''}`}
        onClick={toggle}
        title="Measuring & AOE tools"
      >
        📐 Measure{active ? `: ${active}` : ''} ▾
      </button>
      {open && (
        <>
          <div className="popover-backdrop" onClick={() => setOpen(false)} />
          <div
            className="measure-menu"
            style={{ left: pos.x, top: pos.y }}
            onClick={(e) => e.stopPropagation()}
          >
            {SHAPES.map(({ shape, label, icon, unit }) => (
              <div key={shape} className="measure-shape">
                <button
                  className={`measure-row ${tool?.shape === shape ? 'on' : ''}`}
                  onClick={() => setExpanded((x) => (x === shape ? null : shape))}
                >
                  <span>
                    {icon} {label}
                  </span>
                  <span className="muted">{expanded === shape ? '▾' : '▸'}</span>
                </button>
                {expanded === shape && (
                  <div className="measure-sizes">
                    {SIZES.map((size) => (
                      <button
                        key={size}
                        className={`btn tiny ${
                          tool?.shape === shape && tool?.size === size ? 'on' : ''
                        }`}
                        title={size === 'custom' ? 'Drag to size' : `${unit} ${sizeFt(shape, size)}`}
                        onClick={() => {
                          onPick(shape, size);
                          setOpen(false);
                        }}
                      >
                        {size === 'custom'
                          ? 'Custom'
                          : `${size[0].toUpperCase()}${size.slice(1)} · ${sizeFt(shape, size)}`}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}

            <div className="measure-sep" />
            <button
              className={`measure-row ${snap ? 'on' : ''}`}
              onClick={onToggleSnap}
            >
              <span>🧲 Snap to grid</span>
              <span className="muted">{snap ? 'on' : 'off'}</span>
            </button>
            <button
              className={`measure-row ${removeMode ? 'on' : ''}`}
              onClick={() => {
                onToggleRemove();
                setOpen(false);
              }}
            >
              <span>✕ Remove (click a shape)</span>
            </button>
            {hasMeasurements && (
              <div className="measure-clear">
                <button className="btn tiny" onClick={onClearMine}>
                  Clear mine
                </button>
                {isDm && (
                  <button className="btn tiny" onClick={onClearAll}>
                    Clear all
                  </button>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </>
  );
}
