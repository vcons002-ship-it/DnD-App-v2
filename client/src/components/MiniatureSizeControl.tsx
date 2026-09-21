import { useEffect, useId, useState } from 'react';
import type { Token } from '../../../shared/types';
import { useStore } from '../state/socket';
import './miniature-size-control.css';

/** Width in feet drives the model, its base hit region, and the map tools. */
export function MiniatureSizeControl({ token }: { token: Token | null }) {
  const resizeToken = useStore(s => s.resizeToken);
  const inputId = useId();
  const [draft, setDraft] = useState(String(token?.widthFt ?? 5));
  useEffect(() => { setDraft(String(token?.widthFt ?? 5)); }, [token?.id, token?.widthFt]);
  const normalize = (value: number) => Math.max(0.5, Math.min(120, Math.round(value * 2) / 2));
  const draftWidth = draft.trim() && Number.isFinite(Number(draft)) ? normalize(Number(draft)) : token?.widthFt ?? 5;
  const apply = (value: number) => {
    if (!token) return;
    const width = normalize(value);
    setDraft(String(width));
    // Always send: a field blur can have queued another width just before Fit.
    resizeToken(token.id, width);
  };
  return <section className="miniature-size-control" aria-label="3D figure size">
    <label htmlFor={inputId} title="Figure base width in feet, shared on this map">3D size</label>
    <div className="miniature-size-actions">
      <button className="btn" aria-label="Smaller figure" disabled={!token || draftWidth <= 0.5}
        onClick={() => apply(draftWidth - 0.5)}>&minus;</button>
      <input id={inputId} aria-label="Base width (ft)" type="number" min={0.5} max={120} step={0.5} disabled={!token}
        value={draft} onChange={event => setDraft(event.target.value)} onBlur={() => apply(draftWidth)}
        onKeyDown={event => {
          if (event.key === 'Enter') { event.preventDefault(); event.currentTarget.blur(); }
          if (event.key === 'Escape') { event.stopPropagation(); setDraft(String(token?.widthFt ?? 5)); }
        }} /><span className="muted">ft</span>
      <button className="btn" aria-label="Larger figure" disabled={!token || draftWidth >= 120}
        onClick={() => apply(draftWidth + 0.5)}>+</button>
      <button className="btn miniature-fit" disabled={!token} onClick={() => apply(5)}
        title="Set the base to 5 feet across using the current map scale">Fit to map</button>
    </div>
    {!token && <small className="muted">Place on the map to resize.</small>}
  </section>;
}
