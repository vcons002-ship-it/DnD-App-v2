import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import type { StateSnapshot, Token } from '../../../shared/types';
import { useStore } from '../state/socket';
import { resolveToken } from '../lib/entities';
import { safeSetItem } from '../lib/storage';
import {DockableWindowHeader,type WindowSide} from './DockableWindowHeader';
import { HudIcon } from './HudIcon';
import {createPortal} from 'react-dom';
import {explicitTokenInspection} from '../lib/tokenInspection';

type Tool = 'maps' | 'spawn' | 'initiative' | 'chat';
type Panel = Tool | 'inspect';
type Layout = { open: Panel[]; pinned: Panel[]; anchor: WindowSide; sides: Partial<Record<Panel,WindowSide>> };
const tools: { id: Panel; label: string; icon: 'spellbook' | 'party' | 'character' | 'checks' | 'inventory' }[] = [
  { id: 'maps', label: 'Maps', icon: 'spellbook' },
  { id: 'spawn', label: 'Creatures', icon: 'party' },
  { id: 'initiative', label: 'Initiative', icon: 'character' },
  { id: 'chat', label: 'Chat & dice', icon: 'checks' },
  { id: 'inspect', label: 'Token inspector', icon: 'inventory' },
];
const defaultSide = (id: Panel):WindowSide => id === 'inspect' ? 'right' : 'left';
const panelSide=(layout:Layout,id:Panel):WindowSide=>layout.pinned.includes(id)?layout.anchor:layout.sides[id]??(layout.pinned.length?layout.anchor:defaultSide(id));

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
  const active = snapshot.tokens.find(t => t.id === snapshot.activeTurnTokenId);
  const activeName = active ? resolveToken(snapshot, active).name : 'Current turn';
  const pinKey = `dnd.dmPinnedPanels:${snapshot.sessionCode}`;
  const [layout, setLayout] = useState<Layout>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(pinKey) ?? 'null');
      if (saved && Array.isArray(saved.pinned)) {
        const pinned: Panel[] = [...new Set<Panel>(saved.pinned.filter((id: unknown) => tools.some(t => t.id === id)))];
        const sides:Layout['sides']={};for(const {id} of tools)if(saved.sides?.[id]==='left'||saved.sides?.[id]==='right')sides[id]=saved.sides[id];
        return {open:pinned.length?pinned:snapshot.map?[]:['maps'],pinned,anchor:saved.anchor==='right'?'right':'left',sides};
      }
    } catch { /* Invalid or unavailable storage uses the ordinary workspace. */ }
    return { open: snapshot.map ? [] : ['maps'], pinned: [], anchor: 'left', sides:{} };
  });
  useEffect(() => { safeSetItem(pinKey, JSON.stringify({ pinned: layout.pinned, anchor: layout.anchor, sides:layout.sides })); }, [pinKey, layout.pinned, layout.anchor, layout.sides]);
  const [width, setWidth] = useDmPanelWidth(`dnd.dmWorkspaceWidth:${snapshot.sessionCode}`);
  const [inspectorWidth, setInspectorWidth] = useDmPanelWidth(`dnd.dmInspectorWidth:${snapshot.sessionCode}`);
  const [inspectorHeight, setInspectorHeight] = useState(() => {
    try {const saved = Number(localStorage.getItem(`dnd.dmInspectorHeight:${snapshot.sessionCode}`));
      return saved >= 220 && saved <= 900 ? saved : 440;
    } catch {return 440;}
  });
  const hasSelection = !!selectedToken || selectionCount > 1;
  const visibleOpen = layout.open.filter(id => id !== 'inspect' || hasSelection);
  const selectionName = selectionCount > 1 ? `${selectionCount} tokens selected`
    : selectedToken ? resolveToken(snapshot, selectedToken).name : 'Token inspector';
  const openPanel = useCallback((id: Panel) => {
    if (id === 'inspect' && !hasSelection) return;
    setLayout(current => {
      if (current.open.includes(id)) return current;
      const side=current.pinned.length?current.anchor:panelSide(current,id);
      const keep=[...new Set([...current.pinned,...current.open.filter(other=>window.innerWidth>=1000&&panelSide(current,other)!==side)])];
      return {...current,open:[...keep,id],sides:{...current.sides,[id]:side}};
    });
  }, [hasSelection]);
  useEffect(() => {
    if (selectedToken?.id || selectionCount > 1) {if(!explicitTokenInspection())openPanel('inspect');}
    else setLayout(current => current.open.includes('inspect') ? { ...current, open: current.open.filter(id => id !== 'inspect') } : current);
  }, [selectedToken?.id, selectionCount, openPanel]);
  const consumedOpenSignal=useRef(openSignal);
  useEffect(() => {
    if(openSignal===consumedOpenSignal.current)return;
    consumedOpenSignal.current=openSignal;
    if(openSignal)openPanel('inspect');
  }, [openSignal, openPanel]);
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
    anchor: current.pinned.length ? current.anchor : panelSide(current,id),
    sides:{...current.sides,[id]:panelSide(current,id)},
    pinned: current.pinned.includes(id) ? current.pinned.filter(p => p !== id) : [...current.pinned, id],
  }));
  const sideOf=(id:Panel)=>panelSide(layout,id);
  const [layoutMenu,setLayoutMenu]=useState<HTMLElement|null>(null);
  useEffect(()=>{setLayoutMenu(document.querySelector<HTMLElement>('.dm-campaign-menu .topbar-actions'));},[]);
  const resetLayout=()=>{
    setLayout({open:hasSelection?['inspect']:snapshot.map?[]:['maps'],pinned:[],anchor:'left',sides:{}});
    setWidth(360);setInspectorWidth(360);setInspectorHeight(440);
    safeSetItem(`dnd.dmInspectorHeight:${snapshot.sessionCode}`,'440');
  };
  const dock=(id:Panel,side:WindowSide)=>{
    const from=sideOf(id);if(from===side)return;
    (side==='left'?setWidth:setInspectorWidth)(from==='left'?width:inspectorWidth);
    setLayout(current=>{
      const sides={...current.sides,[id]:side};
      if(current.pinned.includes(id)){
        // Move the pinned column together, including its currently open companion.
        for(const panel of current.open)if(panelSide(current,panel)===current.anchor)sides[panel]=side;
        return {...current,anchor:side,sides};
      }
      return {...current,sides};
    });
  };
  const content: Record<Panel, ReactNode> = {
    maps: mapsAndCreatures('maps'), spawn: mapsAndCreatures('spawn'), initiative, chat, inspect: inspector,
  };

  return <>
    {layoutMenu&&createPortal(<>
      <button className="btn tiny" disabled={!visibleOpen.some(id=>!layout.pinned.includes(id))} onClick={()=>setLayout(current=>({...current,open:current.open.filter(id=>current.pinned.includes(id))}))}>Close unpinned windows</button>
      <button className="btn tiny" onClick={resetLayout} title="Restore default window sides and sizes and clear pins. Drafts are kept.">Reset window layout</button>
    </>,layoutMenu)}
    <nav className="dm-tool-rail" aria-label="DM tools">
      {tools.map(item => <button key={item.id} id={`dm-tool-${item.id}`} className={`dm-tool ${visibleOpen.includes(item.id) ? 'on' : ''}`}
        disabled={item.id === 'inspect' && !hasSelection}
        aria-label={item.label} aria-expanded={visibleOpen.includes(item.id)} aria-controls={`dm-panel-${item.id}`}
        title={item.id==='inspect'?'Inspect selected token, or double-tap a token on the map':item.label}
        onClick={() => toggle(item.id)}>
        <HudIcon name={item.icon} /><span>{item.id === 'inspect' ? `Inspect${selectionCount > 1 ? ` (${selectionCount})` : ''}` : item.label}</span>
      </button>)}
    </nav>
    {tools.map(item => {
      const side = sideOf(item.id);
      const column = visibleOpen.filter(id => sideOf(id) === side);
      const pinned = layout.pinned.includes(item.id);
      const corner = item.id === 'inspect' && !layout.pinned.includes(item.id) && column.length===1;
      return <aside key={item.id} id={`dm-panel-${item.id}`} data-panel={item.id} data-dock-window data-dock-side={side}
        className={`dm-window ${item.id === 'inspect' ? 'dm-inspector' : 'dm-workspace'} side ${side}${corner ? ' dm-inspector-corner' : ''}`}
        hidden={!visibleOpen.includes(item.id)} aria-label={item.label}
        style={{ width: side === 'left' ? width : inspectorWidth,
          ...(corner ? { height: inspectorHeight } : {}),
          '--dm-panel-index': Math.max(0, column.indexOf(item.id)), '--dm-panel-count': Math.max(1, column.length) } as CSSProperties}
        onKeyDown={event => {
          if (event.key === 'Escape' && !pinned && !document.querySelector('dialog[open]')) close(item.id);
        }}>
        <DockableWindowHeader className="dm-window-header" label={item.label} side={side} onDock={side=>dock(item.id,side)}><div><small>{item.id === 'inspect' ? 'SELECTED TOKEN' : 'DUNGEON MASTER'}</small>
          <h2>{item.id === 'inspect' ? selectionName : item.label}</h2></div>
          <div className="dm-window-actions">
            <button className={`btn dm-pin ${pinned ? 'on' : ''}`} aria-label={`${pinned ? 'Unpin' : 'Pin'} ${item.label}`}
              aria-pressed={pinned} title={pinned ? 'Unpin this panel' : 'Keep open and stack additional panels in this column'} onClick={() => pin(item.id)}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M8 3h8l-1 7 4 4v2H5v-2l4-4-1-7Zm4 13v6M7 3h10" /></svg>
            </button>
            <button className="btn" aria-label={item.id === 'inspect' ? 'Close token inspector' : 'Close DM panel'}
              title={`Close ${item.label}`} onClick={() => close(item.id)}>&times;</button>
          </div>
        </DockableWindowHeader>
        <div className="dm-window-content">{content[item.id]}</div>
        <DmResizeHandle width={side === 'left' ? width : inspectorWidth} onWidth={side === 'left' ? setWidth : setInspectorWidth}
          side={side} label={item.id === 'inspect' ? 'Resize token inspector' : 'Resize DM panel'} />
        {corner && <DmHeightResizeHandle height={inspectorHeight} onHeight={value => {
          const height = Math.max(220, Math.min(900, value));
          setInspectorHeight(height); safeSetItem(`dnd.dmInspectorHeight:${snapshot.sessionCode}`, String(height));
        }} />}
      </aside>;
    })}
    {snapshot.round > 0 && <div className="dm-turn-bar" role="region" aria-label="Turn controls">
      <button className="dm-turn-summary" onClick={() => toggle('initiative')} aria-label="Open initiative tracker">
        <span className="dm-round">ROUND {snapshot.round}</span>
        <strong>{activeName}</strong>
        <span className="muted">Current turn</span>
      </button>
      <button className="btn dm-next-turn" onClick={nextTurn} disabled={snapshot.initiativePending}>
        Next turn <span aria-hidden="true">&rarr;</span>
      </button>
    </div>}
  </>;
}

function DmHeightResizeHandle({height,onHeight}:{height:number;onHeight:(height:number)=>void}) {
  const drag = useRef<{id:number;y:number;height:number;scale:number}|null>(null);
  return <button className="dm-resize-height" aria-label="Resize token inspector height" title="Drag the top edge to resize vertically, or use up and down arrow keys"
    onPointerDown={e => { if(e.button!==0)return; e.preventDefault();e.currentTarget.setPointerCapture(e.pointerId);const parent=e.currentTarget.parentElement!;const scale=Number(getComputedStyle(parent).zoom)||1;drag.current={id:e.pointerId,y:e.clientY,height:parent.getBoundingClientRect().height/scale,scale}; }}
    onPointerMove={e => {if(drag.current?.id===e.pointerId)onHeight(drag.current.height+(drag.current.y-e.clientY)/drag.current.scale);}}
    onPointerUp={()=>{drag.current=null;}} onPointerCancel={()=>{drag.current=null;}} onLostPointerCapture={()=>{drag.current=null;}}
    onKeyDown={e=>{if(e.key==='ArrowUp'||e.key==='ArrowDown'){e.preventDefault();onHeight(height+(e.key==='ArrowUp'?20:-20));}}} />;
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
  const drag = useRef<{ id: number; x: number; width: number; scale: number } | null>(null);
  const direction = side === 'left' ? 1 : -1;
  return <button className="dm-resize" aria-label={label} title="Drag to resize, or use left and right arrow keys"
    onPointerDown={event => {
      if (event.button !== 0) return;
      event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId);
      drag.current = { id: event.pointerId, x: event.clientX, width, scale: Number(getComputedStyle(event.currentTarget.parentElement!).zoom) || 1 };
    }} onPointerMove={event => {
      if (drag.current?.id === event.pointerId) onWidth(drag.current.width + direction * (event.clientX - drag.current.x) / drag.current.scale);
    }} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}
    onLostPointerCapture={() => { drag.current = null; }}
    onKeyDown={event => {
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault(); onWidth(width + direction * (event.key === 'ArrowRight' ? 20 : -20));
      }
    }} />;
}
