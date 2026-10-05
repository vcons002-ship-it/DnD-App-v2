import {useState} from 'react';
import {createPortal} from 'react-dom';
import type {MapState} from '../../../shared/types';
import type {MapDoorDraft} from '../../../shared/mapDoorDraft';
import {wallSvgPath} from '../../../shared/wallGeometry';
import {apiFetch} from '../lib/api';
import {WallPerformanceNotice} from './WallPerformanceNotice';

export function DoorDraft({map,onClose}:{map:MapState;onClose:()=>void}){
  const [draft,setDraft]=useState<MapDoorDraft|null>(null),[selected,setSelected]=useState<string[]>([]),[busy,setBusy]=useState<'analyze'|'apply'|null>(null),[error,setError]=useState(''),[mask,setMask]=useState(false);
  const request=async(apply=false)=>{setBusy(apply?'apply':'analyze');setError('');try{
    const response=await apiFetch(`/api/maps/${map.id}/door-draft${apply?'/apply':''}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(apply?{draft,selected}:{})});
    const data=await response.json();if(!response.ok)throw Error(data.error||'Door drafting failed.');
    if(apply)onClose();else{setDraft(data);setSelected(data.doors.filter((d:MapDoorDraft['doors'][number])=>d.wall&&!d.issue).map((d:MapDoorDraft['doors'][number])=>d.id));}
  }catch(e){setError(e instanceof Error?e.message:'Door drafting failed.');}finally{setBusy(null);}};
  const toggle=(id:string)=>setSelected(ids=>ids.includes(id)?ids.filter(i=>i!==id):[...ids,id]);
  return createPortal(<div role="dialog" aria-modal="true" aria-label="Door draft" style={{position:'fixed',inset:16,zIndex:1100,background:'#131820',border:'1px solid #aa8550',borderRadius:8,padding:16,display:'flex',flexDirection:'column',gap:10,boxShadow:'0 0 0 100vmax #000b'}}>
    <div style={{display:'flex',justifyContent:'space-between'}}><strong>Suggest doors from map art - {map.name}</strong><button className="btn" disabled={!!busy} onClick={onClose}>Close</button></div>
    <p style={{margin:0}}>Find visible doors with a separate cyan mask. Review every marker: an open passage can be mistaken for a door. Only the base map image is analyzed.</p>
    <p className="muted" style={{margin:0}}>Apply walls first so each door can meet its jambs. Short yellow extensions can connect nearby wall ends to a door. Review them before applying. Selected doors start closed and unlocked, with the usual open, close and lock controls.</p>
    <div style={{display:'flex',gap:10,flexWrap:'wrap'}}>
      <button className="btn" disabled={!!busy} onClick={()=>request()}>{busy==='analyze'?'Finding doors...':draft?'Analyze again':'Find doors'}</button>
      {draft&&<><button className="btn" disabled={!!busy||!selected.length} onClick={()=>request(true)}>Apply {selected.length} doors</button><button className="btn" disabled={!!busy} onClick={()=>setSelected([])}>Deselect all</button><label><input type="checkbox" checked={mask} onChange={e=>setMask(e.target.checked)}/>Show AI door mask</label></>}
    </div>
    {busy&&<div role="status">{busy==='apply'?'Saving selected doors...':'The image API is painting complete doors cyan. This may take a few minutes.'}</div>}
    {error&&<div role="alert">{error}</div>}
    <WallPerformanceNotice walls={[...(map.walls??[]),...(draft?.doors.filter(d=>selected.includes(d.id)&&d.wall).flatMap(d=>[...(d.extensions??[]),d.wall!])??[])]}/>
    {draft?.doors.length===0&&<p>No door markers found. Use Draw door opening to add one manually.</p>}
    <div style={{display:'flex',gap:16,flex:1,minHeight:0,overflow:'auto',flexWrap:'wrap'}}>
      <div style={{flex:'1 1 500px',minWidth:0,minHeight:300,position:'relative'}}>
        {draft?<svg aria-label="Door draft overlay" viewBox={`0 0 ${draft.source.width} ${draft.source.height}`} style={{position:'absolute',inset:0,width:'100%',height:'100%',display:'block'}}>
          <image href={mask?draft.maskImagePath:map.imagePath!} width={draft.source.width} height={draft.source.height} preserveAspectRatio="none"/>
          {!mask&&draft.doors.map((d,i)=>{const active=selected.includes(d.id),color=d.issue?'#ffb65c':active?'#00ffff':'#a1a1aa';return <g key={d.id} style={{cursor:d.issue?'default':'pointer'}} onClick={()=>!busy&&!d.issue&&toggle(d.id)}>
            {d.footprint&&<polygon points={d.footprint.map(p=>`${p.x},${p.y}`).join(' ')} fill={color} fillOpacity={.18} stroke={color} strokeWidth={1}/>}
            {d.extensions?.map(w=><path key={w.id} aria-label="Door wall extension" d={wallSvgPath(w)} fill="#ffe068" fillOpacity={.45} stroke="#ffe068" strokeWidth={2} strokeDasharray="4 2"/>)}
            {d.wall?<path d={wallSvgPath(d.wall)} fill={color} fillOpacity={.5} stroke={color} strokeWidth={2}/>:<line x1={d.ax} y1={d.ay} x2={d.bx} y2={d.by} stroke={color} strokeWidth={d.thickness}/>}
            <text x={(d.ax+d.bx)/2+draft.source.width*.009} y={(d.ay+d.by)/2-draft.source.width*.01} fill={color} stroke="#000" strokeWidth={4} paintOrder="stroke" fontSize={draft.source.width*.016}>{i+1}</text>
          </g>;})}
        </svg>:<img src={map.imagePath!} alt="Map to analyze for doors" style={{position:'absolute',inset:0,width:'100%',height:'100%',objectFit:'contain'}}/>}
      </div>
      {draft&&<div style={{flex:'0 1 240px',overflow:'auto'}}>{draft.doors.map((d,i)=><label key={d.id} style={{display:'block',padding:8}}><input type="checkbox" disabled={!!busy||!!d.issue} checked={selected.includes(d.id)} onChange={()=>toggle(d.id)}/>Door {i+1}{!!d.extensions?.length&&<small style={{display:'block',color:'#ffe068'}}>Connects {d.extensions.length} wall ends</small>}{d.issue&&<small style={{display:'block',color:'#ffd39a'}}>{d.issue}</small>}</label>)}</div>}
    </div>
  </div>,document.body);
}
