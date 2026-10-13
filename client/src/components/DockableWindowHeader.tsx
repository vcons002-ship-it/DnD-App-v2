import {useEffect,useRef,useState,type PointerEvent,type ReactNode} from 'react';
import {createPortal} from 'react-dom';
import './DockableWindowHeader.css';

export type WindowSide='left'|'right';
type Drag={id:number;x:number;y:number;active:boolean;side:WindowSide;window:HTMLElement;translate:string;zoom:number};

/** Docking changes browser-local layout only. Pointer motion never touches the map. */
export function DockableWindowHeader({label,side,onDock,className,children}:{
  label:string;side:WindowSide;onDock:(side:WindowSide)=>void;className:string;children:ReactNode;
}){
  const drag=useRef<Drag|null>(null),suppressClick=useRef(false);
  const [preview,setPreview]=useState<WindowSide|null>(null);
  const restore=(current:Drag)=>{
    current.window.style.translate=current.translate;
    delete current.window.dataset.dockDragging;
  };
  useEffect(()=>()=>{if(drag.current)restore(drag.current);},[]);
  const finish=(event:PointerEvent<HTMLElement>,commit:boolean)=>{
    const current=drag.current;if(!current||current.id!==event.pointerId)return;
    drag.current=null;restore(current);setPreview(null);
    if(event.currentTarget.hasPointerCapture(current.id))event.currentTarget.releasePointerCapture(current.id);
    if(current.active){event.stopPropagation();suppressClick.current=commit;if(commit)onDock(current.side);}
  };
  return <>
    <header className={`${className} window-dock-header`} tabIndex={0} role="group"
      aria-label={`Move ${label} window`} title="Drag this header to the left or right side. Or focus the header and press Left/Right. Escape cancels a drag."
      onPointerDown={event=>{
        if(event.button!==0||(event.target as Element).closest('button,input,select,textarea,a,summary,[contenteditable=true]'))return;
        const panel=event.currentTarget.closest<HTMLElement>('[data-dock-window]');if(!panel)return;
        event.preventDefault();event.stopPropagation();suppressClick.current=false;
        event.currentTarget.focus({preventScroll:true});event.currentTarget.setPointerCapture(event.pointerId);
        drag.current={id:event.pointerId,x:event.clientX,y:event.clientY,active:false,side,window:panel,translate:panel.style.translate,zoom:Number(getComputedStyle(panel).zoom)||1};
      }}
      onPointerMove={event=>{
        const current=drag.current;if(!current||current.id!==event.pointerId)return;
        const dx=event.clientX-current.x,dy=event.clientY-current.y;
        if(!current.active&&Math.hypot(dx,dy)<6)return;
        event.stopPropagation();current.active=true;current.window.dataset.dockDragging='true';
        current.window.style.translate=`${dx/current.zoom}px 0`;
        const next:WindowSide=event.clientX<window.innerWidth/2?'left':'right';
        if(preview!==next)setPreview(next);current.side=next;
      }}
      onPointerUp={event=>finish(event,true)} onPointerCancel={event=>finish(event,false)} onLostPointerCapture={event=>finish(event,false)}
      onClickCapture={event=>{if(suppressClick.current){suppressClick.current=false;event.preventDefault();event.stopPropagation();}}}
      onKeyDown={event=>{
        if(event.key==='Escape'&&drag.current){
          const current=drag.current;drag.current=null;restore(current);setPreview(null);
          if(event.currentTarget.hasPointerCapture(current.id))event.currentTarget.releasePointerCapture(current.id);
          event.preventDefault();event.stopPropagation();return;
        }
        if(event.target!==event.currentTarget)return;
        if(event.key==='ArrowLeft'||event.key==='ArrowRight'){
          event.preventDefault();event.stopPropagation();onDock(event.key==='ArrowLeft'?'left':'right');
        }
      }}>
      {children}
    </header>
    {preview&&createPortal(<div className={`window-dock-preview ${preview}`} role="status" aria-live="polite" data-dock-side={preview}>
      <span>Dock {label} {preview}</span>
    </div>,document.body)}
  </>;
}
