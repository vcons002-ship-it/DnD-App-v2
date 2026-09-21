import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import type { StateSnapshot, Token } from '../../../shared/types';
import { useStore } from '../state/socket';
import { resolveToken } from '../lib/entities';
import { safeSetItem } from '../lib/storage';
import { HudIcon } from './HudIcon';

type Tool = 'maps' | 'spawn' | 'initiative' | 'chat';
type Panel = Tool | 'inspect';
type Layout = { open: Panel[]; pinned: Panel[]; anchor: 'left' | 'right' };
const tools: { id: Panel; label: string; icon: 'spellbook' | 'party' | 'character' | 'checks' | 'inventory' }[] = [
  { id: 'maps', label: 'Maps', icon: 'spellbook' },
  { id: 'spawn', label: 'Creatures', icon: 'party' },
  { id: 'initiative', label: 'Initiative', icon: 'character' },
  { id: 'chat', label: 'Chat & dice', icon: 'checks' },
  { id: 'inspect', label: 'Token inspector', icon: 'inventory' },
];
const defaultSide = (id: Panel) => id === 'inspect' ? 'right' : 'left';

/** Stable panel instances preserve drafts even when pinning moves their column. */
export function DmWorkspace({ snapshot, selectedToken, selectionCount, openSignal, pending,
  mapsAndCreatures, initiative, chat, inspector }: {
  snapshot: StateSnapshot;
  selectedToken: Token | null;
  selectionCount: number;
  openSignal: number;
  pending: { kind: 'pc' | 'monster'; refId: string } | null;
  mapsAndCreatures: (section: 'maps' | 'spawn') => ReactNode;
  initiative: ReactNode;
  chat: ReactNode;
  inspector: ReactNode;
}) {
  const nextTurn = useStore(s => s.nextTurn);
  const pinKey = `dnd.dmPinnedPanels:${snapshot.sessionCode}`;
  const [layout, setLayout] = useState<Layout>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(pinKey) ?? 'null');
      if (saved && Array.isArray(saved.pinned)) {
        const pinned: Panel[] = [...new Set<Panel>(saved.pinned.filter((id: unknown) => tools.some(t => t.id === id)))];
        if (pinned.length) return { open: pinned, pinned, anchor: saved.anchor === 'right' ? 'right' : 'left' };
      }
    } catch { /* Invalid or unavailable storage uses the ordinary workspace. */ }
    return { open: snapshot.map ? [] : ['maps'], pinned: [], anchor: 'left' };
  });
  useEffect(() => { safeSetItem(pinKey, JSON.stringify({ pinned: layout.pinned, anchor: layout.anchor })); }, [pinKey, layout.pinned, layout.anchor]);
  const [width, setWidth] = useDmPanelWidth(`dnd.dmWorkspaceWidth:${snapshot.sessionCode}`);
  const [inspectorWidth, setInspectorWidth] = useDmPanelWidth(`dnd.dmInspectorWidth:${snapshot.sessionCode}`);
  const active = snapshot.tokens.find(t => t.id === snapshot.activeTurnTokenId);
  const activeName = active ? resolveToken(snapshot, active).name : null;
  const selectionName = selectionCount > 1 ? `${selectionCount} tokens selected`
    : selectedToken ? resolveToken(snapshot, selectedToken).name : 'Token inspector';
  const openPanel = useCallback((id: Panel) => {
    setLayout(current => {
      if (current.open.includes(id)) return current;
      const keep = [...new Set([...current.pinned, ...current.open.filter(other =>
        !current.pinned.length && window.innerWidth >= 1000 && defaultSide(other) !== defaultSide(id))])];
      return { ...current, open: [...keep, id] };
    });
  }, []);
  useEffect(() => {
    if (selectedToken?.id || selectionCount > 1) openPanel('inspect');
  }, [selectedToken?.id, selectionCount, openPanel]);
  useEffect(() => { if (openSignal) openPanel('inspect'); }, [openSignal, openPanel]);
  useEffect(() => {
    if (pending && window.innerWidth < 1000) setLayout(current => ({ ...current, open: [] }));
  }, [pending]);
  const close = (id: Panel) => {
    setLayout(current => ({ ...current, open: current.open.filter(p => p !== id), pinned: current.pinned.filter(p => p !== id) }));
    document.getElementById(`dm-tool-${id}`)?.focus();
  };
  const toggle = (id: Panel) => layout.open.includes(id) ? close(id) : openPanel(id);
  const pin = (id: Panel) => setLayout(current => ({
    ...current,
    anchor: current.pinned.length ? current.anchor : defaultSide(id),
    pinned: current.pinned.includes(id) ? current.pinned.filter(p => p !== id) : [...current.pinned, id],
  }));
  const sideOf = (id: Panel) => layout.pinned.length ? layout.anchor : defaultSide(id);
  const content: Record<Panel, ReactNode> = {
    maps: mapsAndCreatures('maps'), spawn: mapsAndCreatures('spawn'), initiative, chat, inspect: inspector,
  };

  return <>
    <nav className="dm-tool-rail" aria-label="DM tools">
      {tools.map(item => <button key={item.id} id={`dm-tool-${item.id}`} className={`dm-tool ${layout.open.includes(item.id) ? 'on' : ''}`}
        aria-label={item.label} aria-expanded={layout.open.includes(item.id)} aria-controls={`dm-panel-${item.id}`}
        onClick={() => toggle(item.id)}>
        <HudIcon name={item.icon} /><span>{item.id === 'inspect' ? `Inspect${selectionCount > 1 ? ` (${selectionCount})` : ''}` : item.label}</span>
      </button>)}
    </nav>
    {tools.map(item => {
      const side = sideOf(item.id);
      const column = layout.open.filter(id => sideOf(id) === side);
      const pinned = layout.pinned.includes(item.id);
      return <aside key={item.id} id={`dm-panel-${item.id}`} data-panel={item.id}
        className={`dm-window ${item.id === 'inspect' ? 'dm-inspector' : 'dm-workspace'} side ${side}`}
        hidden={!layout.open.includes(item.id)} aria-label={item.label}
        style={{ width: side === 'left' ? width : inspectorWidth,
          '--dm-panel-index': Math.max(0, column.indexOf(item.id)), '--dm-panel-count': Math.max(1, column.length) } as CSSProperties}
        onKeyDown={event => {
          if (event.key === 'Escape' && !pinned && !document.querySelector('dialog[open]')) close(item.id);
        }}>
        <header className="dm-window-header"><div><small>{item.id === 'inspect' ? 'SELECTED TOKEN' : 'DUNGEON MASTER'}</small>
          <h2>{item.id === 'inspect' ? selectionName : item.label}</h2></div>
          <div className="dm-window-actions">
            <button className={`btn dm-pin ${pinned ? 'on' : ''}`} aria-label={`${pinned ? 'Unpin' : 'Pin'} ${item.label}`}
              aria-pressed={pinned} title={pinned ? 'Unpin this panel' : 'Keep open and stack additional panels in this column'} onClick={() => pin(item.id)}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M8 3h8l-1 7 4 4v2H5v-2l4-4-1-7Zm4 13v6M7 3h10" /></svg>
            </button>
            <button className="btn" aria-label={item.id === 'inspect' ? 'Close token inspector' : 'Close DM panel'}
              title={`Close ${item.label}`} onClick={() => close(item.id)}>&times;</button>
          </div>
        </header>
        <div className="dm-window-content">{content[item.id]}</div>
        <DmResizeHandle width={side === 'left' ? width : inspectorWidth} onWidth={side === 'left' ? setWidth : setInspectorWidth}
          side={side} label={item.id === 'inspect' ? 'Resize token inspector' : 'Resize DM panel'} />
      </aside>;
    })}
    <div className="dm-turn-bar" role="region" aria-label="Turn controls">
      <button className="dm-turn-summary" onClick={() => toggle('initiative')} aria-label="Open initiative tracker">
        <span className="dm-round">{snapshot.round > 0 ? `ROUND ${snapshot.round}` : 'ENCOUNTER'}</span>
        <strong>{activeName ?? 'Prepare initiative'}</strong>
        <span className="muted">{activeName ? 'Current turn' : 'Choose combatants and roll'}</span>
      </button>
      {snapshot.round > 0 && <button className="btn dm-next-turn" onClick={nextTurn}>Next turn <span aria-hidden="true">&rarr;</span></button>}
    </div>
  </>;
}

function useDmPanelWidth(key: string): [number, (width: number) => void] {
  const [width, setWidth] = useState(() => {
    try { const saved = Number(localStorage.getItem(key)); return saved >= 300 && saved <= 560 ? saved : 360; }
    catch { return 360; }
  });
  useEffect(() => { safeSetItem(key, String(width)); }, [key, width]);
  return [width, value => setWidth(Math.max(300, Math.min(560, value)))];
}

function DmResizeHandle({ width, onWidth, side, label }: {
  width: number; onWidth: (width: number) => void; side: 'left' | 'right'; label: string;
}) {
  const drag = useRef<{ id: number; x: number; width: number } | null>(null);
  const direction = side === 'left' ? 1 : -1;
  return <button className="dm-resize" aria-label={label} title="Drag to resize, or use left and right arrow keys"
    onPointerDown={event => {
      if (event.button !== 0) return;
      event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId);
      drag.current = { id: event.pointerId, x: event.clientX, width };
    }} onPointerMove={event => {
      if (drag.current?.id === event.pointerId) onWidth(drag.current.width + direction * (event.clientX - drag.current.x));
    }} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}
    onLostPointerCapture={() => { drag.current = null; }}
    onKeyDown={event => {
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault(); onWidth(width + direction * (event.key === 'ArrowRight' ? 20 : -20));
      }
    }} />;
}
