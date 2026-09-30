import {useEffect,useState} from 'react';
import type {MapState} from '../../../shared/types';
import {draftWallRect,type MapGeometryDraft} from '../../../shared/mapGeometryDraft';
import {apiFetch} from '../lib/api';

export function WallDraft({map,onClose}:{map:MapState;onClose:()=>void}) {
  const [draft,setDraft]=useState<MapGeometryDraft|null>(null);
  const [selected,setSelected]=useState<string[]>([]);
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  const [method,setMethod]=useState<'ai'|'local'>('local');
  const [threshold,setThreshold]=useState(90),[polarity,setPolarity]=useState('dark'),[minLength,setMinLength]=useState(2);
  const [showArt,setShowArt]=useState(true);
  useEffect(()=>{const key=(e:KeyboardEvent)=>{if(e.key==='Escape'&&!busy)onClose();};window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);},[busy,onClose]);
  const analyze=async()=>{
    setBusy(true);setError('');
    try{
      const response=await apiFetch(`/api/maps/${map.id}/wall-draft`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({method,options:{threshold,polarity,minLengthSquares:minLength}})}),body=await response.json();
      if(!response.ok)throw new Error(body.error||'Map analysis failed.');
      setDraft(body);setSelected(body.items.filter((i:MapGeometryDraft['items'][number])=>i.kind==='wall'&&i.confidence>=.75).map((i:MapGeometryDraft['items'][number])=>i.id));
    }catch(e){setError(e instanceof Error?e.message:'Map analysis failed.');}finally{setBusy(false);}
  };
  const toggle=(id:string)=>setSelected(old=>old.includes(id)?old.filter(x=>x!==id):[...old,id]);
  const apply=async()=>{
    setBusy(true);setError('');
    try{
      const response=await apiFetch(`/api/maps/${map.id}/wall-draft/apply`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({draft,selected})});
      const body=await response.json();if(!response.ok)throw new Error(body.error||'Could not apply draft.');onClose();
    }catch(e){setError(e instanceof Error?e.message:'Could not apply draft.');}finally{setBusy(false);}
  };
  const download=()=>{
    const url=URL.createObjectURL(new Blob([JSON.stringify(draft,null,2)],{type:'application/json'}));
    const a=document.createElement('a');a.href=url;a.download='map-geometry-draft.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  };
  return <div role="dialog" aria-modal="true" aria-label="Wall draft" style={{position:'fixed',inset:16,zIndex:1000,background:'#131820',border:'1px solid #aa8550',borderRadius:8,padding:16,display:'flex',flexDirection:'column',gap:10,boxShadow:'0 0 0 100vmax #000b'}}>
    <div style={{display:'flex',justifyContent:'space-between'}}><strong>Suggest walls from map art — {map.name}</strong><button className="btn" disabled={busy} onClick={onClose}>Close</button></div>
    <p style={{margin:0}}>Review the overlay before applying. Gold: selected walls. Orange dashed: unselected walls. Green: doorway gaps. Blue: obstacles (reference only).</p>
    <p className="muted" style={{margin:0}}>Heights are estimates. This first version applies full-height walls only; doors and obstacle heights remain in the downloadable draft. Existing walls are preserved.</p>
    <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
      <label>Detection <select aria-label="Wall detection method" disabled={busy} value={method} onChange={e=>setMethod(e.target.value as 'ai'|'local')}><option value="local">Local contrast / empty space (no API)</option><option value="ai">AI image analysis</option></select></label>
      {method==='local'&&<><label>Walls <select aria-label="Wall contrast polarity" disabled={busy} value={polarity} onChange={e=>setPolarity(e.target.value)}><option value="dark">Darker than floor</option><option value="light">Lighter than floor</option></select></label>
        <label>Threshold <input aria-label="Wall detection threshold" disabled={busy} type="number" min={0} max={255} value={threshold} onChange={e=>setThreshold(Number(e.target.value))} style={{width:65}}/></label>
        <label>Minimum length (squares) <input aria-label="Minimum wall length" disabled={busy} type="number" min={1} max={10} value={minLength} onChange={e=>setMinLength(Number(e.target.value))} style={{width:50}}/></label></>}
      <button className="btn" disabled={busy||!map.imagePath} onClick={analyze}>{busy?'Working…':draft?'Analyze again':'Analyze map'}</button>
      {draft&&<><button className="btn" disabled={busy||!selected.length} onClick={apply}>Apply {selected.length} walls</button><button className="btn" onClick={download}>Download JSON</button>
        <button className="btn" onClick={()=>setSelected([])}>Deselect all</button><label><input type="checkbox" checked={showArt} onChange={e=>setShowArt(e.target.checked)}/> Show map art</label></>}
    </div>
    {busy&&<div role="status">{draft?'Processing draft…':method==='local'?'Scanning wall bands and open floor contrast locally...':'Analyzing the image. API retries or local-model fallback may take a minute.'}</div>}
    {error&&<div role="alert" style={{color:'#ffb6a1'}}>{error}</div>}
    {draft&&<small>Draft from {draft.method==='local'?'local contrast detection (experimental; all walls start unselected)':'AI image analysis'}. Analyzes the base map image only. Review doors carefully.</small>}
    <div style={{display:'flex',gap:12,flex:1,minHeight:0,overflow:'auto',flexWrap:'wrap'}}>
      <div style={{flex:'1 1 500px',minWidth:0,overflow:'auto',background:'#080c10'}}>
        {draft?<svg aria-label="Wall draft overlay" viewBox={`0 0 ${draft.source.width} ${draft.source.height}`} style={{width:'100%',display:'block'}}>
          {showArt&&<image href={map.imagePath!} width={draft.source.width} height={draft.source.height}/>}
          {draft.items.map(item=>{const r=draftWallRect(item,draft.source),checked=selected.includes(item.id),color=item.kind==='door'?'#58eea5':item.kind==='obstacle'?'#62c9ff':checked?'#ffe068':'#ff974d';return <rect key={item.id} data-draft-id={item.id} x={r.ax} y={r.ay} width={r.bx-r.ax} height={r.by-r.ay} fill={color} fillOpacity={checked?.35:.12} stroke={color} strokeWidth={2} vectorEffect="non-scaling-stroke" strokeDasharray={checked?undefined:'6 3'} onClick={()=>item.kind==='wall'&&toggle(item.id)} style={{cursor:item.kind==='wall'?'pointer':'default'}}><title>{item.label}: {Math.round(item.confidence*100)}% confidence, estimated {item.heightFt} ft high</title></rect>;})}
        </svg>:map.imagePath&&<img src={map.imagePath} alt="Map to analyze" style={{width:'100%'}}/>}
      </div>
      {draft&&<div style={{flex:'0 1 270px',overflowY:'auto'}}>{!draft.items.length&&<p>No reliable geometry found. Use the manual wall tools.</p>}{draft.items.map(item=><label key={item.id} style={{display:'block',padding:'7px 0',borderBottom:'1px solid #39404b'}}>
        <input type="checkbox" disabled={busy||item.kind!=='wall'} checked={selected.includes(item.id)} onChange={()=>toggle(item.id)}/> {item.label} <small>({item.kind})</small><br/>
        <span className="muted">{Math.round(item.confidence*100)}% confidence · estimated {item.heightFt} ft high</span>
      </label>)}</div>}
    </div>
  </div>;
}
