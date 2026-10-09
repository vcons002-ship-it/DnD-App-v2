import type {MapState} from '../../../shared/types';
import {WallDraft} from './WallDraft';
import {DoorDraft} from './DoorDraft';
import {LightDraft} from './LightDraft';
import {MapLightControls} from './MapLightControls';
import {useEnvironmentEditor} from '../lib/useEnvironmentEditor';
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
  const mapImagesAvailable=useStore(s=>s.snapshot?.map?.id===map?.id&&!!s.snapshot?.mapImages.length);
  const [draftOpen,setDraftOpen]=useState(false);
  const [doorsDraftOpen,setDoorsDraftOpen]=useState(false);
  const [lightsDraftOpen,setLightsDraftOpen]=useState(false);
  const [setupDraftOpen,setSetupDraftOpen]=useState(false);
  const [setupScope,setSetupScope]=useState<'full'|'regions'>('full');
  const [section,setSection]=useState<'add'|'edit'|'lights'|'analysis'|null>(null);
  const placeLight=useEnvironmentEditor(s=>s.place);
  const startLight=(lightId?:string)=>{if(map){onTool('off');setPosition(null);placeLight({mapId:map.id,lightId});}};
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
    {lightsDraftOpen&&map&&<LightDraft key={map.id} map={map} onClose={()=>setLightsDraftOpen(false)}/>}
    {setupDraftOpen&&map&&<MapSetupDraft key={map.id+setupScope} map={map} scope={setupScope} onClose={()=>setSetupDraftOpen(false)}/>}
    <button ref={button} className={`btn tiny ${tool!=='off'?'on':''}`} onClick={()=>{
      const rect=button.current!.getBoundingClientRect();setPosition(position?null:{left:Math.max(8,Math.min(rect.left,window.innerWidth-304)),top:rect.bottom+4});
    }} aria-label="Walls" aria-expanded={!!position} title="Add or adjust walls, doors, windows and lights">Walls{tool!=='off'?`: ${toolNames[tool]}`:''} ▾</button>
    {position&&<><div className="popover-backdrop" onClick={()=>setPosition(null)}/>
      <div className="measure-menu wall-menu" style={position} aria-label="Walls and doors tools">
        <button className={`measure-row wall-menu-adjust ${tool==='edit'?'on':''}`} onClick={()=>{onTool('edit');setPosition(null);}}>Adjust existing walls, doors, windows &amp; lights</button>
        <div className="wall-menu-sections">
          {([['add','Add features'],['edit','Edit tools'],['lights','Lights'],['analysis','AI analysis']] as const).map(([id,label])=><button key={id} className={`btn tiny ${section===id?'on':''}`} aria-expanded={section===id} aria-controls={`wall-menu-${id}`} onClick={()=>setSection(section===id?null:id)}>{label}</button>)}
        </div>
        {section==='analysis'&&<div id="wall-menu-analysis" className="wall-menu-section" role="region" aria-label="AI analysis">
        <button className="measure-row" disabled={!map?.imagePath&&!mapImagesAvailable} onClick={()=>{setPosition(null);setSetupScope('full');setSetupDraftOpen(true);}}>Suggest walls, doors, windows &amp; lights</button>
        <button className="measure-row" disabled={!map?.imagePath&&!mapImagesAvailable} onClick={()=>{setPosition(null);setSetupScope('regions');setSetupDraftOpen(true);}}>Analyze selected regions</button>
        <button className="measure-row" disabled={!map?.imagePath&&!mapImagesAvailable} onClick={()=>{setPosition(null);setDraftOpen(true);}}>Suggest walls from map art</button>
        <button className="measure-row" disabled={!map?.imagePath&&!mapImagesAvailable} onClick={()=>{setPosition(null);setDoorsDraftOpen(true);}}>Suggest doors from map art</button>
        <button className="measure-row" disabled={!map?.imagePath&&!mapImagesAvailable} onClick={()=>{setPosition(null);setLightsDraftOpen(true);}}>Suggest lights from map art</button>
        </div>}
        {section==='add'&&<div id="wall-menu-add" className="wall-menu-section" role="region" aria-label="Add features">
        <button className={`measure-row ${tool==='rectangle'?'on':''}`} onClick={()=>{onTool('rectangle');setPosition(null);}}>Draw wall rectangles</button>
        <button className={`measure-row ${tool==='draw'?'on':''}`} onClick={()=>{onTool('draw');setPosition(null);}}>Draw wall line</button>
        <button className={`measure-row ${tool==='circle'?'on':''}`} onClick={()=>{onTool('circle');setPosition(null);}}>Draw circular wall</button>
        <button className={`measure-row ${tool==='freehand'?'on':''}`} onClick={()=>{onTool('freehand');setPosition(null);}}>Free draw wall</button>
        <button className={`measure-row ${tool==='door'?'on':''}`} onClick={()=>{onTool('door');setPosition(null);}}>Draw door opening</button>
        <button className="measure-row" disabled={!map} onClick={()=>startLight()}>Place light on map</button>
        <label className="measure-row"><span>Snap to grid corners</span><input type="checkbox" checked={snap} onChange={e=>onSnap(e.target.checked)}/></label>
        </div>}
        {section==='lights'&&map&&<div id="wall-menu-lights" className="wall-menu-section" role="region" aria-label="Lights"><MapLightControls map={map} onPlace={startLight}/></div>}
        {section==='edit'&&<div id="wall-menu-edit" className="wall-menu-section" role="region" aria-label="Edit tools">
        <button className={`measure-row ${tool==='edit'?'on':''}`} onClick={()=>{onTool('edit');setPosition(null);}}>Select / move / rotate features</button>
        <button className={`measure-row ${tool==='erase-area'?'on':''}`} onClick={()=>{onTool('erase-area');setPosition(null);}}>Erase wall section</button>
        <button className={`measure-row ${tool==='erase'?'on':''}`} onClick={()=>{onTool('erase');setPosition(null);}}>Delete entire wall</button>
        <button className="measure-row" disabled={!count} onClick={onUndo}>Undo last wall</button>
        {!!doors.length&&<details className="wall-menu-list"><summary>Door controls ({doors.length})</summary>
          {doors.map((d,i)=><button key={d.id} className="measure-row" onClick={()=>{onDoor?.(d.id,!d.open);setPosition(null);onTool('off');}}>Door {i+1}: {d.open?'open':'closed'} - Controls</button>)}
        </details>}
        {!!map?.walls?.some(w=>w.window)&&<details className="wall-menu-list"><summary>Remove windows ({map.walls.filter(w=>w.window).length})</summary>
          {map.walls.filter(w=>w.window).map((w,i)=><button key={w.id} className="measure-row" onClick={()=>{useStore.getState().editMapWalls(map.id,{removeId:w.id});setPosition(null);}}>Remove window {i+1}</button>)}
        </details>}
        </div>}
        <div className="measure-label">{count} saved wall pieces · {doors.length} doors</div>
        <WallPerformanceNotice walls={map?.walls??[]}/>
        {tool!=='off'&&<button className="measure-row" onClick={()=>{onFinish();setPosition(null);}}>Cancel current stroke</button>}
        {tool!=='off'&&<button className="measure-row" onClick={()=>{onTool('off');setPosition(null);}}>Done editing</button>}
        <details className="wall-menu-help"><summary>Editing help</summary><p className="muted">Click a feature to select it. Shift/Ctrl-click adds or removes it; Ctrl-drag selects a group. Delete removes the selection; Ctrl+Z restores it. Drag to move; use the round handle to rotate. Use Erase wall section for a partial correction. Outlines hide when you finish editing.</p></details>
      </div>
    </>}
  </>;
}
