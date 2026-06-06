import { useEffect, useRef, useState } from 'react';
import type { FogLayer } from '../../../shared/types';

/**
 * The map toolbar's "Fog" dropdown (DM only): enable each fog layer, then choose
 * the paint target, brush mode/size, and bulk cover/reveal. Mirrors MeasureMenu's
 * popover pattern. Presentational — all state lives in MapStage.
 */
export function FogMenu({
  mapFogEnabled,
  tokenFogEnabled,
  paintLayer,
  fogBrush,
  brushSize,
  onToggleLayer,
  onSetPaintLayer,
  onSetBrush,
  onSetBrushSize,
  onCoverAll,
  onRevealAll,
}: {
  mapFogEnabled: boolean;
  tokenFogEnabled: boolean;
  paintLayer: FogLayer;
  fogBrush: 'off' | 'reveal' | 'hide';
  brushSize: number;
  onToggleLayer: (layer: FogLayer) => void;
  onSetPaintLayer: (layer: FogLayer) => void;
  onSetBrush: (brush: 'off' | 'reveal' | 'hide') => void;
  onSetBrushSize: (n: number) => void;
  onCoverAll: () => void;
  onRevealAll: () => void;
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

  const anyFog = mapFogEnabled || tokenFogEnabled;
  const label =
    fogBrush !== 'off' ? `🌫 Fog: ${fogBrush === 'reveal' ? 'Reveal' : 'Hide'} ${brushSize}×` : '🌫 Fog';

  return (
    <>
      <button
        ref={btn}
        type="button"
        className={`btn tiny ${anyFog ? 'on' : ''}`}
        onClick={toggle}
        title="Fog of war"
      >
        {label} ▾
      </button>
      {open && (
        <>
          <div className="popover-backdrop" onClick={() => setOpen(false)} />
          <div className="measure-menu" style={{ left: pos.x, top: pos.y }} onClick={(e) => e.stopPropagation()}>
            <button
              className={`measure-row ${mapFogEnabled ? 'on' : ''}`}
              onClick={() => onToggleLayer('map')}
            >
              <span>🗺 Map fog</span>
              <span className="muted">{mapFogEnabled ? 'on' : 'off'}</span>
            </button>
            <button
              className={`measure-row ${tokenFogEnabled ? 'on' : ''}`}
              onClick={() => onToggleLayer('tokens')}
            >
              <span>👤 Token fog</span>
              <span className="muted">{tokenFogEnabled ? 'on' : 'off'}</span>
            </button>

            {anyFog && (
              <>
                <div className="measure-sep" />
                <div className="measure-label">Paint layer</div>
                <div className="measure-sizes">
                  <button
                    className={`btn tiny ${paintLayer === 'map' ? 'on' : ''}`}
                    disabled={!mapFogEnabled}
                    onClick={() => onSetPaintLayer('map')}
                  >
                    Map
                  </button>
                  <button
                    className={`btn tiny ${paintLayer === 'tokens' ? 'on' : ''}`}
                    disabled={!tokenFogEnabled}
                    onClick={() => onSetPaintLayer('tokens')}
                  >
                    Tokens
                  </button>
                </div>
                <div className="measure-label">Brush</div>
                <div className="measure-sizes">
                  <button
                    className={`btn tiny ${fogBrush === 'reveal' ? 'on' : ''}`}
                    onClick={() => onSetBrush(fogBrush === 'reveal' ? 'off' : 'reveal')}
                  >
                    Reveal
                  </button>
                  <button
                    className={`btn tiny ${fogBrush === 'hide' ? 'on' : ''}`}
                    onClick={() => onSetBrush(fogBrush === 'hide' ? 'off' : 'hide')}
                  >
                    Hide
                  </button>
                  {[1, 3, 5].map((n) => (
                    <button
                      key={n}
                      className={`btn tiny ${brushSize === n ? 'on' : ''}`}
                      onClick={() => onSetBrushSize(n)}
                      title={`Brush ${n}×${n}`}
                    >
                      {n}×
                    </button>
                  ))}
                </div>
                <div className="measure-clear">
                  <button className="btn tiny" onClick={onCoverAll} title="Re-cover everything on the painted layer">
                    Cover all
                  </button>
                  <button className="btn tiny" onClick={onRevealAll}>
                    Reveal all
                  </button>
                </div>
              </>
            )}
          </div>
        </>
      )}
    </>
  );
}
