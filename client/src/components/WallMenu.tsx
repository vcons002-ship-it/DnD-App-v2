import {useEffect,useRef,useState} from 'react';
import {MAX_MAP_WALLS} from '../../../shared/mapWalls';

export type WallTool='off'|'draw'|'erase';
export function WallMenu({tool,count,snap,onTool,onSnap,onUndo,onFinish}:{
  tool:WallTool;count:number;snap:boolean;onTool:(tool:WallTool)=>void;
  onSnap:(snap:boolean)=>void;onUndo:()=>void;onFinish:()=>void;
}){
  const button=useRef<HTMLButtonElement>(null);
  const [position,setPosition]=useState<{left:number;top:number}|null>(null);
  useEffect(()=>{
    if(!position)return;
    const close=(event:KeyboardEvent)=>{if(event.key==='Escape')setPosition(null);};
    window.addEventListener('keydown',close);return()=>window.removeEventListener('keydown',close);
  },[position]);
  return <>
    <button ref={button} className={`btn tiny ${tool!=='off'?'on':''}`} onClick={()=>{
      const rect=button.current!.getBoundingClientRect();setPosition(position?null:{left:Math.max(8,Math.min(rect.left,window.innerWidth-254)),top:rect.bottom+4});
    }} aria-label="Walls" title="Draw walls that block light and sight">Walls{tool!=='off'?`: ${tool==='draw'?'Draw':'Erase'}`:''} ▾</button>
    {position&&<><div className="popover-backdrop" onClick={()=>setPosition(null)}/>
      <div className="measure-menu" style={{...position,width:238}}>
        <div className="measure-label">Walls · {count}/{MAX_MAP_WALLS}</div>
        <button className={`measure-row ${tool==='draw'?'on':''}`} onClick={()=>{onTool('draw');setPosition(null);}}>Draw connected walls</button>
        <button className={`measure-row ${tool==='erase'?'on':''}`} onClick={()=>{onTool('erase');setPosition(null);}}>Erase a wall</button>
        <label className="measure-row"><span>Snap to grid corners</span><input type="checkbox" checked={snap} onChange={e=>onSnap(e.target.checked)}/></label>
        <div className="measure-sep"/>
        <button className="measure-row" disabled={!count} onClick={onUndo}>Undo last wall</button>
        <button className="measure-row" onClick={()=>{onFinish();setPosition(null);}}>Finish this chain</button>
        <button className="measure-row" onClick={()=>{onTool('off');setPosition(null);}}>Done drawing</button>
        <p className="muted" style={{padding:'0 10px',fontSize:12}}>Click each corner to trace a wall. Leave gaps for doorways. Walls save to this map and block sight and light for every player.</p>
      </div>
    </>}
  </>;
}
