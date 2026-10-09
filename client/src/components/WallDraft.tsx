import {useMapAnalysisSource} from '../lib/useMapAnalysisSource';
import {wallSvgPath} from '../../../shared/wallGeometry';
import {useEffect,useState} from 'react';
import type {MapState} from '../../../shared/types';
import {draftWallShape,type MapGeometryDraft} from '../../../shared/mapGeometryDraft';
import {apiFetch} from '../lib/api';
import {WallPerformanceNotice} from './WallPerformanceNotice';

export function WallDraft({map,onClose}:{map:MapState;onClose:()=>void}) {
  const analysis=useMapAnalysisSource(map);
  const [draft,setDraft]=useState<MapGeometryDraft|null>(null);
  const [selected,setSelected]=useState<string[]>([]);
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  const [method,setMethod]=useState<'ai'|'local'>('ai');
  const [threshold,setThreshold]=useState(90),[polarity,setPolarity]=useState('dark'),[minLength,setMinLength]=useState(2);
  const [showArt,setShowArt]=useState(true);
  const [showMask,setShowMask]=useState(false);
  const [naturalBoundaries,setNaturalBoundaries]=useState(true),[maskStage,setMaskStage]=useState('combined');
  const maskPath=maskStage==='walls'?draft?.wallMaskImagePath:maskStage==='natural'?draft?.naturalMaskImagePath:draft?.maskImagePath;
  useEffect(()=>{const key=(e:KeyboardEvent)=>{if(e.key==='Escape'&&!busy)onClose();};window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);},[busy,onClose]);
  const analyze=async()=>{
    setBusy(true);setError('');
    try{
      const response=await apiFetch(`/api/maps/${map.id}/wall-draft`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({method,options:{threshold,polarity,minLengthSquares:minLength,naturalBoundaries}})}),body=await response.json();
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
    {analysis.loading&&<small role="status">Preparing the assembled map and image tiles...</small>}{analysis.error&&<p role="alert">{analysis.error}</p>}{!analysis.loading&&!analysis.error&&<small>{analysis.source?.tileCount??0} image tiles included</small>}<p style={{margin:0}}>Review the overlay before applying. Gold: selected walls. Orange dashed: unselected walls. Check that rooms and doorway gaps stay clear.</p>
    <p className="muted" style={{margin:0}}>Apply creates full-height walls that block sight and movement. Add working doors afterward with the door tool. Existing walls are preserved.</p>
    <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
      <label>Detection <select aria-label="Wall detection method" disabled={busy} value={method} onChange={e=>setMethod(e.target.value as 'ai'|'local')}><option value="local">Local contrast / empty space (no API)</option><option value="ai">AI yellow wall mask (recommended)</option></select></label>
      {method==='ai'&&<label><input type="checkbox" disabled={busy} checked={naturalBoundaries} onChange={e=>setNaturalBoundaries(e.target.checked)}/> Include cave boundaries and pillars (second API pass)</label>}
      {method==='local'&&<><label>Walls <select aria-label="Wall contrast polarity" disabled={busy} value={polarity} onChange={e=>setPolarity(e.target.value)}><option value="dark">Darker than floor</option><option value="light">Lighter than floor</option></select></label>
        <label>Threshold <input aria-label="Wall detection threshold" disabled={busy} type="number" min={0} max={255} value={threshold} onChange={e=>setThreshold(Number(e.target.value))} style={{width:65}}/></label>
        <label>Minimum length (squares) <input aria-label="Minimum wall length" disabled={busy} type="number" min={1} max={10} value={minLength} onChange={e=>setMinLength(Number(e.target.value))} style={{width:50}}/></label></>}
      <button className="btn" disabled={busy||analysis.loading||!!analysis.error||!analysis.imagePath} onClick={analyze}>{busy?'Working…':draft?'Analyze again':'Analyze map'}</button>
      {draft&&<><button className="btn" disabled={busy||!selected.length} onClick={apply}>Apply {selected.length} walls</button><button className="btn" onClick={download}>Download JSON</button>
        <button className="btn" onClick={()=>setSelected([])}>Deselect all</button><label><input type="checkbox" checked={showArt} onChange={e=>setShowArt(e.target.checked)}/> Show map art</label></>}
    </div>
    {busy&&<div role="status">{draft?'Processing draft…':method==='local'?'Scanning wall bands and open floor contrast locally...':'Generating the yellow mask, then converting it to walls. Image API retries may take a few minutes.'}</div>}
    {error&&<div role="alert" style={{color:'#ffb6a1'}}>{error}</div>}
    <WallPerformanceNotice walls={[...(map.walls??[]),...(draft?.items.filter(i=>i.kind==='wall'&&selected.includes(i.id)).map(i=>draftWallShape(i,draft.source))??[])]}/>
    {draft?.maskWarnings?.map(warning=><div key={warning} role="alert" style={{color:'#ffd39a'}}>{warning}</div>)}
    {draft&&<small>Draft from {draft.method==='local'?'local contrast detection (experimental; all walls start unselected)':'AI yellow-mask conversion'}. Analyzes the assembled map, including all placed image tiles. Review alignment and doorway gaps carefully. Yellow-mask percentages describe conversion coverage, not accuracy.</small>}
    {draft?.maskGeometry&&<small>{draft.maskGeometry==='outlines'?'Wall shapes follow the painted outlines, including curves, angles and empty room interiors. Apply saves these exact shapes.':'This mask required rectangular wall fitting. Check curved and angled sections carefully before applying.'}</small>}
    {draft?.maskImagePath&&<label><input type="checkbox" checked={showMask} onChange={e=>setShowMask(e.target.checked)}/> Show generated yellow annotation behind proposed walls</label>}
    {showMask&&draft?.wallMaskImagePath&&<label>Mask view <select aria-label="Wall mask stage" value={maskStage} onChange={e=>setMaskStage(e.target.value)}><option value="combined">Combined mask used for walls</option><option value="walls">Pass 1: structural walls (raw API)</option>{draft.naturalMaskImagePath&&<option value="natural">Pass 2: natural boundaries (raw API)</option>}</select></label>}
    <div style={{display:'flex',gap:12,flex:1,minHeight:0,overflow:'auto',flexWrap:'wrap'}}>
      <div style={{flex:'1 1 500px',minWidth:0,overflow:'auto',background:'#080c10'}}>
        {draft?<svg aria-label="Wall draft overlay" viewBox={`${draft.source.originX??0} ${draft.source.originY??0} ${draft.source.width} ${draft.source.height}`} style={{width:'100%',display:'block'}}>
          {showArt&&<image href={showMask?maskPath??draft.maskImagePath:analysis.imagePath!} x={draft.source.originX??0} y={draft.source.originY??0} width={draft.source.width} height={draft.source.height} preserveAspectRatio="none"/>}
          {draft.items.map(item=>{const r=draftWallShape(item,draft.source),checked=selected.includes(item.id),color=item.kind==='door'?'#58eea5':item.kind==='obstacle'?'#62c9ff':checked?'#ffe068':'#ff974d';return <path key={item.id} data-draft-id={item.id} d={wallSvgPath(r)} fillRule="evenodd" fill={color} fillOpacity={checked?.35:.12} stroke={color} strokeWidth={2} vectorEffect="non-scaling-stroke" strokeDasharray={checked?undefined:'6 3'} onClick={()=>item.kind==='wall'&&toggle(item.id)} style={{cursor:item.kind==='wall'?'pointer':'default'}}><title>{item.label}: {draft.maskImagePath?'Mask-derived wall':`${Math.round(item.confidence*100)}% confidence`}, estimated {item.heightFt} ft high</title></path>;})}
        </svg>:analysis.imagePath&&<img src={analysis.imagePath} alt="Map to analyze" style={{width:'100%'}}/>}
      </div>
      {draft&&<div style={{flex:'0 1 270px',overflowY:'auto'}}>{!draft.items.length&&<p>No reliable geometry found. Use the manual wall tools.</p>}{draft.items.map(item=><label key={item.id} style={{display:'block',padding:'7px 0',borderBottom:'1px solid #39404b'}}>
        <input type="checkbox" disabled={busy||item.kind!=='wall'} checked={selected.includes(item.id)} onChange={()=>toggle(item.id)}/> {item.label} <small>({item.kind})</small><br/>
        <span className="muted">{draft.maskImagePath?'Mask-derived wall':`${Math.round(item.confidence*100)}% confidence`} · estimated {item.heightFt} ft high</span>
      </label>)}</div>}
    </div>
  </div>;
}
