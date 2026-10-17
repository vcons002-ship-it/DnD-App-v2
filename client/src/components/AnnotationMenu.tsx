import {useLayoutEffect,useId,useRef,useState} from 'react';

const colors=[
 {value:'#ffd166',name:'Gold'}, {value:'#ef476f',name:'Rose'},
 {value:'#06d6a0',name:'Green'}, {value:'#4cc9f0',name:'Blue'},
 {value:'#ffffff',name:'White'},
];

/** Shared drawing tools and palette, kept off the main toolbar until needed. */
export function AnnotationMenu({tool,color,onTool,onColor}:{
 tool:'pen'|'text'|null;color:string;
 onTool:(tool:'pen'|'text'|null)=>void;onColor:(color:string)=>void;
}){
 const id=useId(),trigger=useRef<HTMLButtonElement>(null),first=useRef<HTMLButtonElement>(null);
 const [open,setOpen]=useState(false),[pos,setPos]=useState({left:8,top:8});
 const close=()=>{setOpen(false);trigger.current?.focus();};
 useLayoutEffect(()=>{
  if(!open)return;
  const position=()=>{
   const rect=trigger.current?.getBoundingClientRect();if(!rect)return;
   setPos({left:Math.max(8,Math.min(rect.left,window.innerWidth-246)),top:rect.bottom+4});
  };
  const key=(e:KeyboardEvent)=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close();}};
  position();first.current?.focus();document.addEventListener('keydown',key);
  window.addEventListener('resize',position);window.addEventListener('scroll',position,true);
  return()=>{document.removeEventListener('keydown',key);window.removeEventListener('resize',position);window.removeEventListener('scroll',position,true);};
 },[open]);
 const choose=(next:'pen'|'text'|null)=>{onTool(next);close();};
 return <>
  <button ref={trigger} type="button" className={`btn tiny ${tool?'on':''}`}
   aria-label="Annotate" aria-haspopup="dialog" aria-expanded={open} aria-controls={open?id:undefined}
   title="Pen, text labels and colors" onClick={()=>setOpen(v=>!v)}>
   ✏️ {tool==='pen'?'Pen':tool==='text'?'Text':'Annotate'}
   <span className="anno-current-color" style={{background:color}} aria-hidden="true"/> ▾
  </button>
  {open&&<>
   <div className="popover-backdrop" onClick={close}/>
   <div id={id} className="measure-menu annotation-menu" style={{...pos,maxHeight:`calc(100dvh - ${pos.top+8}px)`}} role="dialog" aria-label="Annotation tools">
    <button ref={first} type="button" className={`measure-row ${tool==='pen'?'on':''}`} aria-pressed={tool==='pen'}
     title="Freehand pen — draw on the map" onClick={()=>choose('pen')}>✏️ Freehand pen</button>
    <button type="button" className={`measure-row ${tool==='text'?'on':''}`} aria-pressed={tool==='text'}
     title="Text label — click the map to place text" onClick={()=>choose('text')}>🅰 Text label</button>
    <div className="measure-sep"/>
    <div className="measure-label">Pen &amp; text color</div>
    <div className="annotation-palette" role="group" aria-label="Annotation color">
     {colors.map(c=><button key={c.value} type="button" className="anno-swatch" style={{background:c.value}}
      aria-label={c.name} title={c.name} aria-pressed={color===c.value} onClick={()=>onColor(c.value)}/>)}
    </div>
    {tool&&<><div className="measure-sep"/><button type="button" className="measure-row" onClick={()=>choose(null)}>Done annotating</button></>}
   </div>
  </>}
 </>;
}
