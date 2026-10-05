import type {MapState} from '../../../shared/types';
import {WallDraft} from './WallDraft';
import {DoorDraft} from './DoorDraft';
import {MapSetupDraft} from './MapSetupDraft';
import {WallPerformanceNotice} from './WallPerformanceNotice';
import {wallPerformanceWarning} from '../../../shared/mapWalls';
import {useStore} from '../state/socket';
import {useEffect,useRef,useState} from 'react';

export type WallTool='off'|'rectangle'|'draw'|'circle'|'freehand'|'edit'|'erase'|'erase-area'|'door';
const toolNames:Record<WallTool,string>={off:'',rectangle:'Rectangle',draw:'Line',circle:'Circle',freehand:'Free draw',edit:'Move / rotate',erase:'Delete wall','erase-area':'Erase section',door:'Door'};
export function WallMenu({map,tool,count,snap,onTool,onSnap,onUndo,onFinish,doors=[],onDoor}:{
  map?:MapState|null;
  tool:WallTool;count:number;snap:boolean;onTool:(tool:WallTool)=>void;
  onSnap:(snap:boolean)=>void;onUndo:()=>void;onFinish:()=>void;doors?:{id:string;open?:boolean}[];onDoor?:(id:string,open:boolean)=>void;
}){
  const [draftOpen,setDraftOpen]=useState(false);
  const [doorsDraftOpen,setDoorsDraftOpen]=useState(false);
  const [setupDraftOpen,setSetupDraftOpen]=useState(false);
  const [setupScope,setSetupScope]=useState<'full'|'regions'>('full');
  const button=useRef<HTMLButtonElement>(null);
  const [position,setPosition]=useState<{left:number;top:number}|null>(null);
  const warnedMaps=useRef(new Set<string>());
  useEffect(()=>{
    if(!map)return;
    const warning=wallPerformanceWarning(map.walls??[]);
    if(warning&&!warnedMaps.current.has(map.id)){warnedMaps.current.add(map.id);useStore.getState().notify(warning);}
  },[map?.id,map?.walls]);
  useEffect(()=>{
    if(!position)return;
    const close=(event:KeyboardEvent)=>{if(event.key==='Escape')setPosition(null);};
    window.addEventListener('keydown',close);return()=>window.removeEventListener('keydown',close);
  },[position]);
  return <>
    {draftOpen&&map&&<WallDraft key={map.id} map={map} onClose={()=>setDraftOpen(false)}/>}
    {doorsDraftOpen&&map&&<DoorDraft key={map.id} map={map} onClose={()=>setDoorsDraftOpen(false)}/>}
    {setupDraftOpen&&map&&<MapSetupDraft key={map.id+setupScope} map={map} scope={setupScope} onClose={()=>setSetupDraftOpen(false)}/>}
    <button ref={button} className={`btn tiny ${tool!=='off'?'on':''}`} onClick={()=>{
      const rect=button.current!.getBoundingClientRect();setPosition(position?null:{left:Math.max(8,Math.min(rect.left,window.innerWidth-254)),top:rect.bottom+4});
    }} aria-label="Walls" title="Draw walls that block player movement, light and sight">Walls{tool!=='off'?`: ${toolNames[tool]}`:''} ▾</button>
    {position&&<><div className="popover-backdrop" onClick={()=>setPosition(null)}/>
      <div className="measure-menu" style={{...position,width:238}}>
        <button className="measure-row" disabled={!map?.imagePath} onClick={()=>{setPosition(null);setSetupScope('full');setSetupDraftOpen(true);}}>Suggest walls, doors, windows &amp; lights</button>
        <button className="measure-row" disabled={!map?.imagePath} onClick={()=>{setPosition(null);setSetupScope('regions');setSetupDraftOpen(true);}}>Analyze selected regions</button>
        <button className="measure-row" disabled={!map?.imagePath} onClick={()=>{setPosition(null);setDraftOpen(true);}}>Suggest walls from map art</button>
        <button className="measure-row" disabled={!map?.imagePath} onClick={()=>{setPosition(null);setDoorsDraftOpen(true);}}>Suggest doors from map art</button>
        <div className="measure-label">{count} saved wall pieces</div>
        {(map?.walls??[]).filter(w=>w.window).map((w,i)=><button key={w.id} className="measure-row" onClick={()=>{if(map)useStore.getState().editMapWalls(map.id,{removeId:w.id});setPosition(null);}}>Remove window {i+1}</button>)}
        <WallPerformanceNotice walls={map?.walls??[]}/>
        <button className={`measure-row ${tool==='rectangle'?'on':''}`} onClick={()=>{onTool('rectangle');setPosition(null);}}>Draw wall rectangles</button>
        <button className={`measure-row ${tool==='draw'?'on':''}`} onClick={()=>{onTool('draw');setPosition(null);}}>Draw wall line</button>
        <button className={`measure-row ${tool==='circle'?'on':''}`} onClick={()=>{onTool('circle');setPosition(null);}}>Draw circular wall</button>
        <button className={`measure-row ${tool==='freehand'?'on':''}`} onClick={()=>{onTool('freehand');setPosition(null);}}>Free draw wall</button>
        <button className={`measure-row ${tool==='edit'?'on':''}`} onClick={()=>{onTool('edit');setPosition(null);}}>Move / rotate wall</button>
        <button className="measure-row" onClick={()=>{onTool('edit');setPosition(null);}}>Select walls, windows, doors &amp; lights</button>
        <button className={`measure-row ${tool==='erase-area'?'on':''}`} onClick={()=>{onTool('erase-area');setPosition(null);}}>Erase wall section</button>
        <button className={`measure-row ${tool==='erase'?'on':''}`} onClick={()=>{onTool('erase');setPosition(null);}}>Delete entire wall</button>
        <button className={`measure-row ${tool==='door'?'on':''}`} onClick={()=>{onTool('door');setPosition(null);}}>Draw door opening</button>
        {doors.map((d,i)=><button key={d.id} className="measure-row" onClick={()=>{onDoor?.(d.id,!d.open);setPosition(null);onTool('off');}}>Door {i+1}: {d.open?'open':'closed'} - Controls</button>)}
        <label className="measure-row"><span>Snap to grid corners</span><input type="checkbox" checked={snap} onChange={e=>onSnap(e.target.checked)}/></label>
        <div className="measure-sep"/>
        <button className="measure-row" disabled={!count} onClick={onUndo}>Undo last wall</button>
        {tool!=='off'&&<button className="measure-row" onClick={()=>{onFinish();setPosition(null);}}>Cancel current stroke</button>}
        <button className="measure-row" onClick={()=>{onTool('off');setPosition(null);}}>Done drawing</button>
        <p className="muted" style={{padding:'0 10px',fontSize:12}}>In selection mode, click a feature; Shift/Ctrl-click adds or removes it. Ctrl-drag selects fully enclosed pieces. Delete removes the selection; Ctrl+Z restores it. A connected wall shape is one piece: use Erase wall section for a partial correction. Drag a wall to move it; use its round handle to rotate. Walls block sight in every lighting mode. Outlines hide when you finish editing.</p>
      </div>
    </>}
  </>;
}
