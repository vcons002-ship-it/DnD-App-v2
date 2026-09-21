import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import type { StateSnapshot, Token } from '../../../shared/types';
import { useStore } from '../state/socket';
import { resolveToken } from '../lib/entities';
import { safeSetItem } from '../lib/storage';
import { HudIcon } from './HudIcon';

type Tool = 'maps' | 'spawn' | 'initiative' | 'chat';
const tools: { id: Tool; label: string; icon: 'spellbook' | 'party' | 'character' | 'checks' }[] = [
  { id: 'maps', label: 'Maps', icon: 'spellbook' },
  { id: 'spawn', label: 'Creatures', icon: 'party' },
  { id: 'initiative', label: 'Initiative', icon: 'character' },
  { id: 'chat', label: 'Chat & dice', icon: 'checks' },
];

/** One workspace drawer and a contextual inspector, over the full battlefield.
 * Keep content mounted when closed so drafts and scroll positions survive. */
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
  const [tool, setTool] = useState<Tool | null>(snapshot.map ? null : 'maps');
  const [inspecting, setInspecting] = useState(false);
  const [width, setWidth] = useDmPanelWidth(`dnd.dmWorkspaceWidth:${snapshot.sessionCode}`);
  const [inspectorWidth, setInspectorWidth] = useDmPanelWidth(`dnd.dmInspectorWidth:${snapshot.sessionCode}`);
  const active = snapshot.tokens.find(t => t.id === snapshot.activeTurnTokenId);
  const activeName = active ? resolveToken(snapshot, active).name : null;
  const selectionName = selectionCount > 1 ? `${selectionCount} tokens selected`
    : selectedToken ? resolveToken(snapshot, selectedToken).name : 'Token inspector';
  const lastSection = useRef<'maps' | 'spawn'>('maps');
  if (tool === 'maps' || tool === 'spawn') lastSection.current = tool;

  const openInspector = useCallback(() => {
    setInspecting(true);
    if (window.innerWidth < 1000) setTool(null);
  }, []);
  useEffect(() => {
    if (selectedToken?.id || selectionCount > 1) openInspector();
    // Reopen on a new selection, not every snapshot or health update.
  }, [selectedToken?.id, selectionCount, openInspector]);
  useEffect(() => { if (openSignal) openInspector(); }, [openSignal, openInspector]);
  useEffect(() => {
    if (pending && window.innerWidth < 1000) setTool(null);
  }, [pending]);
  const closeTool = () => {
    const previous = tool;
    setTool(null);
    document.getElementById(`dm-tool-${previous}`)?.focus();
  };
  const closeInspector = () => {
    setInspecting(false);
    document.getElementById('dm-inspect-toggle')?.focus();
  };
  const toggle = (id: Tool) => {
    setTool(current => current === id ? null : id);
    if (window.innerWidth < 1000) setInspecting(false);
  };

  return <>
    <nav className="dm-tool-rail" aria-label="DM tools">
      {tools.map(item => <button key={item.id} id={`dm-tool-${item.id}`} className={`dm-tool ${tool === item.id ? 'on' : ''}`}
        aria-label={item.label} aria-expanded={tool === item.id} aria-controls="dm-workspace-drawer"
        onClick={() => toggle(item.id)}>
        <HudIcon name={item.icon} /><span>{item.label}</span>
      </button>)}
      <button id="dm-inspect-toggle" className={`dm-tool ${inspecting ? 'on' : ''}`} aria-label="Token inspector"
        aria-expanded={inspecting} aria-controls="dm-token-inspector" onClick={() => inspecting ? closeInspector() : openInspector()}>
        <HudIcon name="inventory" /><span>Inspect{selectionCount > 1 ? ` (${selectionCount})` : ''}</span>
      </button>
    </nav>

    <aside id="dm-workspace-drawer" className="dm-window dm-workspace side left" hidden={!tool}
      aria-label={tools.find(t => t.id === tool)?.label ?? 'DM workspace'} style={{ width }}
      onKeyDown={event => {
        if (event.key === 'Escape' && !document.querySelector('dialog[open]')) { closeTool(); }
      }}>
      <header className="dm-window-header"><div><small>DUNGEON MASTER</small><h2>{tools.find(t => t.id === tool)?.label}</h2></div>
        <button className="btn" aria-label="Close DM panel" onClick={closeTool}>×</button></header>
      <div className="dm-window-content">
        <div hidden={tool !== 'maps' && tool !== 'spawn'}>{mapsAndCreatures(lastSection.current)}</div>
        <div hidden={tool !== 'initiative'}>{initiative}</div>
        <div hidden={tool !== 'chat'}>{chat}</div>
      </div>
      <DmResizeHandle width={width} onWidth={setWidth} side="left" label="Resize DM panel" />
    </aside>

    <aside id="dm-token-inspector" className="dm-window dm-inspector side right" hidden={!inspecting}
      aria-label="Token inspector" style={{ width: inspectorWidth }} onKeyDown={event => {
        if (event.key === 'Escape' && !document.querySelector('dialog[open]')) { closeInspector(); }
      }}>
      <header className="dm-window-header"><div><small>SELECTED TOKEN</small><h2>{selectionName}</h2></div>
        <button className="btn" aria-label="Close token inspector" onClick={closeInspector}>×</button></header>
      <div className="dm-window-content">{inspector}</div>
      <DmResizeHandle width={inspectorWidth} onWidth={setInspectorWidth} side="right" label="Resize token inspector" />
    </aside>

    <div className="dm-turn-bar" role="region" aria-label="Turn controls">
      <button className="dm-turn-summary" onClick={() => toggle('initiative')} aria-label="Open initiative tracker">
        <span className="dm-round">{snapshot.round > 0 ? `ROUND ${snapshot.round}` : 'ENCOUNTER'}</span>
        <strong>{activeName ?? 'Prepare initiative'}</strong>
        <span className="muted">{activeName ? 'Current turn' : 'Choose combatants and roll'}</span>
      </button>
      {snapshot.round > 0 && <button className="btn dm-next-turn" onClick={nextTurn}>Next turn <span aria-hidden="true">→</span></button>}
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
