import {useEffect,useRef,useState} from 'react';

export type WallTool='off'|'rectangle'|'draw'|'erase';
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
    }} aria-label="Walls" title="Draw walls that block player movement, light and sight">Walls{tool!=='off'?`: ${tool==='rectangle'?'Rectangle':tool==='draw'?'Line':'Erase'}`:''} ▾</button>
    {position&&<><div className="popover-backdrop" onClick={()=>setPosition(null)}/>
      <div className="measure-menu" style={{...position,width:238}}>
        <div className="measure-label">{count} saved {count===1?'wall':'walls'}</div>
        <button className={`measure-row ${tool==='rectangle'?'on':''}`} onClick={()=>{onTool('rectangle');setPosition(null);}}>Draw wall rectangles</button>
        <button className={`measure-row ${tool==='draw'?'on':''}`} onClick={()=>{onTool('draw');setPosition(null);}}>Draw connected walls</button>
        <button className={`measure-row ${tool==='erase'?'on':''}`} onClick={()=>{onTool('erase');setPosition(null);}}>Erase a wall</button>
        <label className="measure-row"><span>Snap to grid corners</span><input type="checkbox" checked={snap} onChange={e=>onSnap(e.target.checked)}/></label>
        <div className="measure-sep"/>
        <button className="measure-row" disabled={!count} onClick={onUndo}>Undo last wall</button>
        {tool==='draw'&&<button className="measure-row" onClick={()=>{onFinish();setPosition(null);}}>Finish this chain</button>}
        <button className="measure-row" onClick={()=>{onTool('off');setPosition(null);}}>Done drawing</button>
        <p className="muted" style={{padding:'0 10px',fontSize:12}}>Drag a rectangle across the length and thickness of a wall. Release to save all four sides together. Leave gaps for doorways; connected lines are also available.</p>
      </div>
    </>}
  </>;
}
