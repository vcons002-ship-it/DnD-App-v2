import {useLayoutEffect,useRef,useState,type ReactNode} from 'react';
import {createPortal} from 'react-dom';
import {COMPACT_TOOLBAR_VIEWPORT,useCompactViewport} from '../lib/useCompactViewport';

/** Compact viewport grouping. Portals escape the toolbar's CSS zoom so
 * coordinates and touch targets remain physical CSS pixels. */
export function CompactToolbarMenu({label,shortLabel=label,children}:{label:string;shortLabel?:string;children:ReactNode}){
 const compact=useCompactViewport(COMPACT_TOOLBAR_VIEWPORT),trigger=useRef<HTMLButtonElement>(null),content=useRef<HTMLDivElement>(null);
 const [open,setOpen]=useState(false),[pos,setPos]=useState({left:8,top:8});
 useLayoutEffect(()=>{
  if(!open||!compact)return;
  const position=()=>{const r=trigger.current?.getBoundingClientRect();if(r)setPos({left:Math.max(8,Math.min(r.left,innerWidth-328)),top:r.bottom+5});};
  const outside=(e:PointerEvent)=>{if(!content.current?.contains(e.target as Node)&&!trigger.current?.contains(e.target as Node))setOpen(false);};
  const escape=(e:KeyboardEvent)=>{if(e.key==='Escape'){setOpen(false);trigger.current?.focus();}};
  position();document.addEventListener('pointerdown',outside);document.addEventListener('keydown',escape);
  window.addEventListener('resize',position);
  return()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',escape);window.removeEventListener('resize',position);};
 },[open,compact]);
 if(!compact)return <>{children}</>;
 const host=trigger.current?.closest('.layout');
 return <>
  <button ref={trigger} className="btn tiny compact-toolbar-trigger" type="button" aria-label={label} aria-haspopup="dialog" aria-expanded={open} onClick={()=>setOpen(v=>!v)}>{shortLabel} ▾</button>
  {open&&host&&createPortal(<div ref={content} className="compact-toolbar-menu" role="dialog" aria-label={label}
   style={{...pos,maxHeight:`calc(100dvh - ${pos.top+8}px)`}}>{children}</div>,host)}
 </>;
}
