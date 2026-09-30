import {useState} from 'react';
import {createPortal} from 'react-dom';
import type {MapState} from '../../../shared/types';
import type {MapLightDraft} from '../../../shared/mapLightDraft';
import {apiFetch} from '../lib/api';
export function LightDraft({map,onClose}:{map:MapState;onClose:()=>void}){
 const [draft,setDraft]=useState<MapLightDraft|null>(null),[selected,setSelected]=useState<string[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState(''),[mask,setMask]=useState(false);
 const request=async(apply=false)=>{setBusy(true);setError('');try{
  const r=await apiFetch(`/api/maps/${map.id}/light-draft${apply?'/apply':''}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(apply?{draft,selected}:{})});const data=await r.json();if(!r.ok)throw Error(data.error||'Light drafting failed.');
  if(apply)onClose();else{setDraft(data);setSelected(data.lights.map((l:MapLightDraft['lights'][number])=>l.id));}
 }catch(e){setError(e instanceof Error?e.message:'Light drafting failed.');}finally{setBusy(false);}};
 const toggle=(id:string)=>setSelected(ids=>ids.includes(id)?ids.filter(i=>i!==id):[...ids,id]);
 return createPortal(<div role="dialog" aria-modal="true" aria-label="Light draft" style={{position:'fixed',inset:16,zIndex:1100,background:'#131820',border:'1px solid #aa8550',borderRadius:8,padding:16,display:'flex',flexDirection:'column',gap:10,boxShadow:'0 0 0 100vmax #000b'}}>
  <div style={{display:'flex',justifyContent:'space-between'}}><strong>Suggest lights from map art - {map.name}</strong><button className="btn" disabled={busy} onClick={onClose}>Close</button></div>
  <p style={{margin:0}}>Marks visible torches, lanterns and other emitters. This uses a separate image request from wall drafting. Walls and original artwork stay unchanged.</p>
  <p className="muted" style={{margin:0}}>Review positions before applying. Defaults: warm, 20 ft radius, 8 ft height, gentle flicker, no 3D fixture. Edit each light afterward in Environment. Only the base map image is analyzed.</p>
  <div style={{display:'flex',gap:10,flexWrap:'wrap'}}><button className="btn" disabled={busy} onClick={()=>request()}>{busy?'Working...':draft?'Analyze again':'Find light sources'}</button>
   {draft&&<><button className="btn" disabled={busy||!selected.length} onClick={()=>request(true)}>Apply {selected.length} lights</button><button className="btn" disabled={busy} onClick={()=>setSelected([])}>Deselect all</button><label><input type="checkbox" checked={mask} onChange={e=>setMask(e.target.checked)}/>Show AI marker image</label></>}
  </div>
  {busy&&<div role="status">{draft?'Applying or refreshing the draft...':'The image API is marking emitters. Connection retries may take a few minutes.'}</div>}
  {error&&<div role="alert">{error}</div>}
  {draft?.lights.length===0&&<p>No new sources to add. Positions within 1 ft of an existing light are skipped.</p>}
  <div style={{display:'flex',gap:16,flex:1,minHeight:0,overflow:'auto',flexWrap:'wrap'}}><div style={{flex:'1 1 500px',minWidth:0,overflow:'auto'}}>
   {draft?<svg aria-label="Light draft overlay" viewBox={`0 0 ${draft.source.width} ${draft.source.height}`} style={{width:'100%',display:'block'}}><image href={mask?draft.maskImagePath:map.imagePath!} width={draft.source.width} height={draft.source.height} preserveAspectRatio="none"/>{draft.lights.map((l,i)=><g key={l.id} onClick={()=>!busy&&toggle(l.id)} style={{cursor:'pointer'}}><circle cx={l.x} cy={l.y} r={draft.source.width*.012} fill={selected.includes(l.id)?'#ffe078':'#555'} fillOpacity={.7} stroke="white" strokeWidth={2}/><text x={l.x} y={l.y} textAnchor="middle" dominantBaseline="central" fill="#000" fontSize={draft.source.width*.014}>{i+1}</text></g>)}</svg>:<img src={map.imagePath!} alt="Map to analyze" style={{width:'100%'}}/>}
  </div>{draft&&<div style={{flex:'0 1 220px',overflow:'auto'}}>{draft.lights.map((l,i)=><label key={l.id} style={{display:'block',padding:8}}><input type="checkbox" disabled={busy} checked={selected.includes(l.id)} onChange={()=>toggle(l.id)}/>Light source {i+1}</label>)}</div>}</div>
 </div>,document.body);
}
