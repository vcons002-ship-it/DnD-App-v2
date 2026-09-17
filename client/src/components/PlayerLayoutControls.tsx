import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent, PointerEvent } from 'react';
import { createPortal } from 'react-dom';
import type { PlayerLayoutController, PlayerPanelName, PlayerPanelSize } from '../lib/usePlayerLayout';

export function ChatBubbleIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M5 4h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-8l-5 3v-3H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z" /><path d="M7 9h10M7 13h7" /></svg>;
}

/** Pointer deltas are physical pixels; the panels use CSS zoom. */
export function PanelResizeHandle({ panel, layout }: { panel: PlayerPanelName; layout: PlayerLayoutController }) {
  const drag = useRef<{ id: number; x: number; y: number; size: PlayerPanelSize; scale: number } | null>(null);
  const label = panel === 'combat' ? 'Resize combat panel' : 'Resize chat and roll log';
  const vertical = panel === 'combat' ? 1 : -1;
  const start = (event: PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.focus();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, size: layout.size(panel), scale: layout.scale };
  };
  const move = (event: PointerEvent<HTMLButtonElement>) => {
    const current = drag.current;
    if (!current || current.id !== event.pointerId) return;
    layout.setSize(panel, {
      width: current.size.width - (event.clientX - current.x) / current.scale,
      height: current.size.height + vertical * (event.clientY - current.y) / current.scale,
    });
  };
  const stop = (event: PointerEvent<HTMLButtonElement>) => {
    if (drag.current?.id !== event.pointerId) return;
    drag.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };
  const key = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    event.preventDefault();
    event.stopPropagation();
    const step = event.shiftKey ? 25 : 10;
    const current = layout.size(panel);
    layout.setSize(panel, {
      width: current.width + (event.key === 'ArrowLeft' ? step : event.key === 'ArrowRight' ? -step : 0),
      height: current.height + vertical * (event.key === 'ArrowDown' ? step : event.key === 'ArrowUp' ? -step : 0),
    });
  };
  return <button
    type="button"
    className={`player-panel-resize ${panel}`}
    aria-label={label}
    title={`${label}: drag this corner, or focus and use arrow keys (Shift for larger steps). Exact sizes are in Interface settings.`}
    onPointerDown={start}
    onPointerMove={move}
    onPointerUp={stop}
    onPointerCancel={stop}
    onLostPointerCapture={() => { drag.current = null; }}
    onKeyDown={key}
  ><svg viewBox="0 0 18 18" aria-hidden="true"><path d="M3 4v11h11M7 4v7h7M11 4v3h3" /></svg></button>;
}

function DimensionInput({ label, value, min, max, onCommit }: {
  label: string; value: number; min: number; max: number; onCommit: (value: number) => void;
}) {
  const [draft, setDraft] = useState(String(Math.round(value)));
  const focused = useRef(false);
  const cancelled = useRef(false);
  useEffect(() => {
    if (!focused.current) setDraft(String(Math.round(value)));
  }, [value]);
  return <input type="number" aria-label={label} min={Math.ceil(min)} max={Math.floor(max)} step="10" value={draft}
    onFocus={() => { focused.current = true; }}
    onChange={(event) => setDraft(event.target.value)}
    onBlur={() => {
      focused.current = false;
      const parsed = Number(draft);
      const next = !cancelled.current && draft.trim() && Number.isFinite(parsed)
        ? Math.round(Math.max(min, Math.min(max, parsed))) : Math.round(value);
      cancelled.current = false;
      setDraft(String(next));
      onCommit(next);
    }}
    onKeyDown={(event) => {
      if (event.key !== 'Enter' && event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      cancelled.current = event.key === 'Escape';
      event.currentTarget.blur();
    }}
  />;
}

export function PlayerLayoutControls({ layout }: { layout: PlayerLayoutController }) {
  const [open, setOpen] = useState(false);
  const [toolbar, setToolbar] = useState<HTMLElement | null>(null);
  const [placement, setPlacement] = useState({ shift: 0, height: 480 });
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const options = useRef<HTMLElement>(null);
  // Join the player's existing toolbar flow instead of estimating a spare map
  // coordinate. Map controls can grow or move without overlapping this button.
  // This component is never mounted by the DM view.
  useLayoutEffect(() => {
    const actions = root.current?.closest('.player-fantasy')?.querySelector<HTMLElement>('.topbar-actions');
    if (actions) setToolbar(actions);
  }, []);
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const button = trigger.current?.getBoundingClientRect();
      const panel = options.current?.getBoundingClientRect();
      if (!button || !panel) return;
      const unshiftedLeft = button.right - panel.width;
      const left = Math.max(8, Math.min(unshiftedLeft, window.innerWidth - panel.width - 8));
      const next = {
        shift: (left - unshiftedLeft) / layout.scale,
        height: Math.max(0, (window.innerHeight - button.bottom - 8) / layout.scale - 8),
      };
      setPlacement((current) => Math.abs(current.shift - next.shift) < .25 && Math.abs(current.height - next.height) < .25 ? current : next);
    };
    place();
    const resize = new ResizeObserver(place);
    const header = toolbar?.closest('header');
    if (header) resize.observe(header);
    window.addEventListener('resize', place);
    return () => {
      resize.disconnect();
      window.removeEventListener('resize', place);
    };
  }, [open, layout.scale, toolbar]);
  useEffect(() => {
    if (!open) return;
    const outside = (event: globalThis.PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setOpen(false);
      trigger.current?.focus();
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);
  const controls = <div className={`player-layout-controls${toolbar ? ' in-toolbar' : ''}`} ref={root}
    style={{ '--player-options-shift': `${placement.shift}px`, '--player-options-max-height': `${placement.height}px` } as CSSProperties}>
    <button type="button" ref={trigger} className="btn player-layout-trigger" aria-label="Interface settings" title="Interface settings: scale and panel sizes" aria-expanded={open} aria-controls="player-layout-options" onClick={() => setOpen((value) => !value)}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="m9 3-1 3-3 1v3l-2 2 2 2v3l3 1 1 3h6l1-3 3-1v-3l2-2-2-2V7l-3-1-1-3Z" /><circle cx="12" cy="12" r="3.5" /></svg>
    </button>
    {open && <section ref={options} id="player-layout-options" className="player-layout-options fantasy-window" aria-label="Interface settings">
      <header><h2>Interface</h2><button type="button" className="btn tiny" aria-label="Close interface settings" onClick={() => setOpen(false)}>×</button></header>
      <label className="player-scale-label" htmlFor="player-ui-scale">UI scale <output>{Math.round(layout.scale * 100)}%</output></label>
      <input id="player-ui-scale" type="range" min="70" max="115" step="5" value={Math.round(layout.scale * 100)} onChange={(event) => layout.setScale(Number(event.target.value) / 100)} />
      <div className="player-scale-limits"><span>Compact 70%</span><span>Large 115%</span></div>
      <fieldset className="resource-layout-picker">
        <legend>Orb resources</legend>
        {(['compact', 'concentric'] as const).map((option) => <label key={option}>
          <input type="radio" name="orb-resource-layout" checked={layout.resourceLayout === option} onChange={() => layout.setResourceLayout(option)} />
          {option === 'compact' ? 'Compact rows' : 'Concentric arcs'}
        </label>)}
      </fieldset>
      {(['combat', 'chat'] as const).map((panel) => {
        const size = layout.size(panel);
        const { min, max } = layout.limits(panel);
        const title = panel === 'combat' ? 'Combat' : 'Chat / roll log';
        return <fieldset key={panel}>
          <legend>{title}</legend>
          {(['width', 'height'] as const).map((dimension) => <label key={dimension}>{dimension === 'width' ? 'Width' : 'Height'}
            <DimensionInput label={`${title} ${dimension}`} min={min[dimension]} max={max[dimension]} value={size[dimension]} onCommit={(value) => layout.setSize(panel, { ...size, [dimension]: value })} />
          </label>)}
        </fieldset>;
      })}
      <p>Drag a panel’s corner to resize, or use its focused handle’s arrow keys. Sizes are before UI scaling; panels stay inside the window.</p>
      <button type="button" className="btn tiny" onClick={layout.reset}>Reset interface layout</button>
      <small>Saved on this browser only. Map scale and campaign data are unchanged.</small>
    </section>}
  </div>;
  return toolbar ? createPortal(controls, toolbar) : controls;
}
