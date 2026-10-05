import {useMemo,useState} from 'react';
import {createPortal} from 'react-dom';
import type {MapState} from '../../../shared/types';
import type {MapSetupDrafts,MapSetupSelection,MapSetupStep} from '../../../shared/mapSetupDraft';
import {draftWallShape} from '../../../shared/mapGeometryDraft';
import {fitDoorMarker} from '../../../shared/doorMaskFit';
import {wallSvgPath} from '../../../shared/wallGeometry';
import {apiFetch} from '../lib/api';
import {WallPerformanceNotice} from './WallPerformanceNotice';
import {fitWindow} from '../../../shared/windowGeometry';
import type {MapAnalysisRegion} from '../../../shared/mapAnalysisRegions';
import {MapAnalysisRegionPicker} from './MapAnalysisRegionPicker';

const steps:MapSetupStep[]=['walls','doors','windows','lights'];
const names={walls:'Walls',doors:'Doors',windows:'Windows',lights:'Lights'};
const endpoints={walls:'wall-draft',doors:'door-draft',windows:'window-draft',lights:'light-draft'};
type Progress={state:'waiting'|'running'|'ready'|'error'|'skipped';error?:string};
const emptySelection=():MapSetupSelection=>({walls:[],doors:[],windows:[],lights:[]});

/** One launch, four independent workflows, and one reviewed map update. */
export function MapSetupDraft({map,onClose,scope='full'}:{map:MapState;onClose:()=>void;scope?:'full'|'regions'}){
  const [drafts,setDrafts]=useState<MapSetupDrafts>({});
  const [selected,setSelected]=useState<MapSetupSelection>(emptySelection);
  const [progress,setProgress]=useState<Record<MapSetupStep,Progress>>({walls:{state:'waiting'},doors:{state:'waiting'},windows:{state:'waiting'},lights:{state:'waiting'}});
  const [tab,setTab]=useState<MapSetupStep>('walls'),[mask,setMask]=useState(false),[applying,setApplying]=useState(false),[error,setError]=useState('');
  const [wallMaskStage,setWallMaskStage]=useState('combined');
  const [started,setStarted]=useState(false),[enabled,setEnabled]=useState<Record<MapSetupStep,boolean>>({walls:true,doors:true,windows:true,lights:true});
  const [naturalBoundaries,setNaturalBoundaries]=useState(true),[regions,setRegions]=useState<MapAnalysisRegion[]>([]);
  const running=started&&steps.some(s=>enabled[s]&&(progress[s].state==='running'||progress[s].state==='waiting')),busy=running||applying;
  const runStep=async(step:MapSetupStep)=>{
    setProgress(old=>({...old,[step]:{state:'running'}}));setError('');
    setDrafts(old=>({...old,[step]:undefined}));setSelected(old=>({...old,[step]:[]}));
    try{
      const regionOptions=scope==='regions'?{regions}:{};
      const response=await apiFetch(`/api/maps/${map.id}/${endpoints[step]}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(step==='walls'?{method:'ai',options:{naturalBoundaries,...regionOptions}}:regionOptions)});
      const data=await response.json();if(!response.ok)throw Error(data.error||`${names[step]} analysis failed.`);
      setDrafts(old=>({...old,[step]:data}));
      const ids=step==='walls'?data.items.filter((i:{kind:string;confidence:number})=>i.kind==='wall'&&i.confidence>=.75):step==='doors'?data.doors:step==='windows'?data.windows:data.lights;
      setSelected(old=>({...old,[step]:ids.map((i:{id:string})=>i.id)}));
      setProgress(old=>({...old,[step]:{state:'ready'}}));
    }catch(e){setProgress(old=>({...old,[step]:{state:'error',error:e instanceof Error?e.message:'Analysis failed.'}}));}
  };
  const runAll=()=>{
    setStarted(true);setDrafts({});setSelected(emptySelection());setProgress(Object.fromEntries(steps.map(s=>[s,{state:enabled[s]?'waiting':'skipped'}])) as Record<MapSetupStep,Progress>);
    return Promise.allSettled(steps.filter(s=>enabled[s]).map(runStep));
  };

  const wallShapes=useMemo(()=>drafts.walls?.items.filter(i=>i.kind==='wall').map(i=>({item:i,wall:draftWallShape(i,drafts.walls!.source)}))??[],[drafts.walls]);
  const fittedDoors=useMemo(()=>{
    const walls=[...(map.walls??[]),...wallShapes.filter(w=>selected.walls.includes(w.item.id)).map(w=>w.wall)];
    return drafts.doors?.doors.map(d=>{
      const fit=fitDoorMarker(d,walls,map.gridSizePx);
      if(fit.wall&&selected.doors.includes(d.id))walls.push(fit.wall);
      return {...d,wall:fit.wall,issue:fit.issue};
    })??[];
  },[map.walls,map.gridSizePx,wallShapes,selected.walls,selected.doors,drafts.doors]);
  const fittedWindows=useMemo(()=>{
    const walls=[...(map.walls??[]),...wallShapes.filter(w=>selected.walls.includes(w.item.id)).map(w=>w.wall)];
    return drafts.windows?.windows.map(marker=>{
      const fit=fitWindow(marker,walls,map.gridSizePx);
      if(fit.wall&&selected.windows?.includes(marker.id))walls.push(fit.wall);
      return {marker,...fit};
    })??[];
  },[map.walls,map.gridSizePx,wallShapes,selected.walls,selected.windows,drafts.windows]);
  const effective:MapSetupSelection={...selected,doors:fittedDoors.filter(d=>selected.doors.includes(d.id)&&d.wall&&!d.issue).map(d=>d.id),windows:fittedWindows.filter(d=>selected.windows?.includes(d.marker.id)&&d.wall&&!d.issue).map(d=>d.marker.id)};
  const counts={walls:wallShapes.length,doors:fittedDoors.length,windows:fittedWindows.length,lights:drafts.lights?.lights.length??0};
  const total=steps.reduce((n,s)=>n+(effective[s]?.length??0),0);
  const source=drafts.walls?.source??drafts.doors?.source??drafts.windows?.source??drafts.lights?.source;
  const wallMaskPath=wallMaskStage==='walls'?drafts.walls?.wallMaskImagePath:wallMaskStage==='natural'?drafts.walls?.naturalMaskImagePath:drafts.walls?.maskImagePath;
  const imagePath=mask?(tab==='walls'?wallMaskPath??drafts.walls?.maskImagePath:drafts[tab]?.maskImagePath)??map.imagePath:map.imagePath;
  const toggle=(step:MapSetupStep,id:string)=>setSelected(old=>({...old,[step]:(old[step]??[]).includes(id)?old[step]!.filter(i=>i!==id):[...(old[step]??[]),id]}));
  const apply=async()=>{
    setApplying(true);setError('');
    try{
      const response=await apiFetch(`/api/maps/${map.id}/setup-draft/apply`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({drafts,selected:effective})});
      const data=await response.json();if(!response.ok)throw Error(data.error||'Could not apply map setup.');onClose();
    }catch(e){setError(e instanceof Error?e.message:'Could not apply map setup.');}finally{setApplying(false);}
  };
  if(!started)return createPortal(<div role="dialog" aria-modal="true" aria-label="Map analysis options" style={{position:'fixed',inset:16,zIndex:1100,background:'#131820',border:'1px solid #aa8550',borderRadius:8,padding:16,display:'flex',flexDirection:'column',gap:10,boxShadow:'0 0 0 100vmax #000b'}}>
    <div style={{display:'flex',justifyContent:'space-between',gap:12}}><strong>{scope==='regions'?'Analyze selected regions':'Analyze full map'} - {map.name}</strong><button className="btn" onClick={onClose}>Close</button></div>
    <p style={{margin:0}}>Choose what to generate before starting. Unchecked features make no API requests. Review all suggestions before applying.</p>
    <div style={{display:'flex',gap:16,flexWrap:'wrap'}}>{steps.map(s=><label key={s}><input type="checkbox" checked={enabled[s]} onChange={e=>setEnabled(old=>({...old,[s]:e.target.checked}))}/>{names[s]}</label>)}
      <label><input type="checkbox" checked={naturalBoundaries} disabled={!enabled.walls} onChange={e=>setNaturalBoundaries(e.target.checked)}/>Cave boundaries (second wall pass)</label>
    </div>
    {!enabled.walls&&(enabled.doors||enabled.windows)&&<p style={{margin:0,color:'#ffd39a'}}>Doors and windows will fit to existing walls. Add walls first if this map has none.</p>}
    <div style={{flex:1,minHeight:0,overflow:'auto'}}>{scope==='regions'?<MapAnalysisRegionPicker image={map.imagePath!} regions={regions} onChange={setRegions}/>:<img src={map.imagePath!} alt="Map to analyze" style={{display:'block',maxWidth:'100%',maxHeight:'100%',margin:'auto'}}/>}</div>
    <div style={{display:'flex',gap:12,alignItems:'center',flexWrap:'wrap'}}><button className="btn" disabled={!steps.some(s=>enabled[s])||scope==='regions'&&!regions.length} onClick={()=>void runAll()}>Analyze selected features</button><span>{scope==='regions'?`${regions.length} regions selected`:'Full map selected'}</span></div>
  </div>,document.body);
  return createPortal(<div role="dialog" aria-modal="true" aria-label="Map setup draft" style={{position:'fixed',inset:16,zIndex:1100,background:'#131820',border:'1px solid #aa8550',borderRadius:8,padding:16,display:'flex',flexDirection:'column',gap:10,boxShadow:'0 0 0 100vmax #000b'}}>
    <div style={{display:'flex',justifyContent:'space-between',gap:12}}><strong>Walls, doors, windows & lights - {map.name}</strong><button className="btn" disabled={busy} onClick={onClose}>Close</button></div>
    <p style={{margin:0}}>Separate wall, door, window and light workflows. Windows let sight and light through but block movement. Deselect mistaken windows here, or remove them afterward in the Walls menu.</p>
    <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>{steps.map(step=><button key={step} className={`btn ${tab===step?'on':''}`} aria-label={`${names[step]} draft`} aria-pressed={tab===step} onClick={()=>setTab(step)}>{names[step]}: {progress[step].state==='ready'?`${counts[step]} found`:progress[step].state==='error'?'Needs attention':progress[step].state==='skipped'?'Skipped':progress[step].state==='running'?'Analyzing...':'Starting...'}</button>)}</div>
    <div role="status">{applying?'Saving selected walls, doors, windows and lights...':running?'Analyzing the map. Completed results appear below while the other masks finish.':'Review complete masks below. Doors and windows fit to your selected walls; lights use the existing map art.'}</div>
    {steps.filter(s=>progress[s].state==='error').map(step=><div key={step} role="alert" style={{color:'#ffd39a'}}>{names[step]}: {progress[step].error} <button className="btn tiny" disabled={busy} onClick={()=>void runStep(step)}>Retry {names[step].toLowerCase()}</button></div>)}
    {error&&<div role="alert" style={{color:'#ffb6a1'}}>{error}</div>}
    <WallPerformanceNotice walls={[...(map.walls??[]),...wallShapes.filter(w=>effective.walls.includes(w.item.id)).map(w=>w.wall),...fittedDoors.filter(d=>effective.doors.includes(d.id)&&d.wall).map(d=>d.wall!)]}/>
    {drafts.walls?.maskWarnings?.map(warning=><div key={warning} role="alert" style={{color:'#ffd39a'}}>{warning}</div>)}
    <div style={{display:'flex',gap:10,flexWrap:'wrap',alignItems:'center'}}>
      <button className="btn" disabled={busy||!total} onClick={apply}>Apply selected setup</button>
      <span>{effective.walls.length} walls · {effective.doors.length} doors · {effective.windows?.length??0} windows · {effective.lights.length} lights selected</span>
      <button className="btn" disabled={busy} onClick={()=>void runAll()}>Run all again</button>
      <button className="btn" disabled={busy} onClick={()=>setStarted(false)}>Change analysis options</button>
      <button className="btn" disabled={busy||!drafts[tab]} onClick={()=>setSelected(old=>({...old,[tab]:[]}))}>Deselect {tab}</button>
      <label><input type="checkbox" disabled={!drafts[tab]?.maskImagePath} checked={mask} onChange={e=>setMask(e.target.checked)}/>Show {tab} mask</label>
      {mask&&tab==='walls'&&drafts.walls?.wallMaskImagePath&&<label>Mask view <select aria-label="Wall mask stage" value={wallMaskStage} onChange={e=>setWallMaskStage(e.target.value)}><option value="combined">Combined mask used for walls</option><option value="walls">Pass 1: structural walls (raw API)</option>{drafts.walls.naturalMaskImagePath&&<option value="natural">Pass 2: natural boundaries (raw API)</option>}</select></label>}
    </div>
    <p className="muted" style={{margin:0}}>{tab==='walls'?'Check wall alignment and keep real passages open. Deselecting a wall updates opening fitting.':tab==='doors'?'Check that each suggestion is a real door. Doors without both adjoining walls are skipped. Applied doors start closed and unlocked.':tab==='windows'?'Check each blue opening. Remove false positives individually; removing a window restores the opaque wall.':'Check emitter positions. Lights start warm, with a 20 ft radius, gentle flicker and no added 3D fixture.'}</p>
    <div style={{display:'flex',gap:16,flex:1,minHeight:0,overflow:'auto',flexWrap:'wrap'}}>
      <div style={{flex:'1 1 500px',minWidth:0,minHeight:300,position:'relative'}}>
        {source?<svg aria-label="Combined map draft overlay" viewBox={`0 0 ${source.width} ${source.height}`} style={{position:'absolute',inset:0,width:'100%',height:'100%'}}>
          <image href={imagePath!} width={source.width} height={source.height} preserveAspectRatio="none"/>
          {!mask&&<>
            {(map.walls??[]).map(w=><path key={w.id} d={wallSvgPath(w)} fill="none" stroke="#aaa" strokeWidth={2} fillRule="evenodd"/>)}
            {wallShapes.map(({item,wall})=>{const active=selected.walls.includes(item.id);return <path key={item.id} d={wallSvgPath(wall)} fillRule="evenodd" fill={active?'#ffe068':'#ff974d'} fillOpacity={active?.25:.08} stroke={active?'#ffe068':'#ff974d'} strokeWidth={2} strokeDasharray={active?undefined:'6 3'} style={{cursor:tab==='walls'&&!busy?'pointer':'default'}} onClick={()=>tab==='walls'&&!busy&&toggle('walls',item.id)}/>;})}
            {fittedDoors.map((d,i)=>{const color=d.issue?'#ff974d':effective.doors.includes(d.id)?'#00ffff':'#999';return <g key={d.id} onClick={()=>tab==='doors'&&!busy&&!d.issue&&toggle('doors',d.id)} style={{cursor:tab==='doors'&&!busy&&!d.issue?'pointer':'default'}}>
              {d.footprint&&<polygon points={d.footprint.map(p=>`${p.x},${p.y}`).join(' ')} fill={color} fillOpacity={.18} stroke={color} strokeWidth={1}/>}
              {d.wall?<path d={wallSvgPath(d.wall)} fill={color} fillOpacity={.5} stroke={color} strokeWidth={2}/>:<line x1={d.ax} y1={d.ay} x2={d.bx} y2={d.by} stroke={color} strokeWidth={d.thickness}/>}
              {tab==='doors'&&<text x={(d.ax+d.bx)/2+source.width*.009} y={(d.ay+d.by)/2-source.width*.01} fill={color} stroke="#000" strokeWidth={4} paintOrder="stroke" fontSize={source.width*.016}>{i+1}</text>}
            </g>;})}
            {drafts.lights?.lights.map((l,i)=><g key={l.id} onClick={()=>tab==='lights'&&!busy&&toggle('lights',l.id)} style={{cursor:tab==='lights'&&!busy?'pointer':'default'}}><circle cx={l.x} cy={l.y} r={source.width*.009} fill={selected.lights.includes(l.id)?'#ff78ee':'#777'} fillOpacity={.8} stroke="white" strokeWidth={2}/>{tab==='lights'&&<text x={l.x} y={l.y} textAnchor="middle" dominantBaseline="central" fill="#000" fontSize={source.width*.012}>{i+1}</text>}</g>)}
            {fittedWindows.map(({marker,wall,issue},i)=><g key={marker.id} onClick={()=>tab==='windows'&&!busy&&!issue&&toggle('windows',marker.id)} style={{cursor:tab==='windows'&&!busy&&!issue?'pointer':'default'}}><path d={wallSvgPath(wall??marker)} fill={issue?'#ff974d':effective.windows?.includes(marker.id)?'#398cff':'#999'} fillOpacity={.5} stroke="#73bbff" strokeWidth={2}/>{tab==='windows'&&<text x={(marker.ax+marker.bx)/2} y={marker.ay-8} fill="white" stroke="black" strokeWidth={3} paintOrder="stroke" fontSize={source.width*.016}>W{i+1}</text>}</g>)}
          </>}
        </svg>:<img src={map.imagePath!} alt="Map to analyze" style={{position:'absolute',inset:0,width:'100%',height:'100%',objectFit:'contain'}}/>}
      </div>
      <div style={{flex:'0 1 260px',overflow:'auto'}}>
        {progress[tab].state==='ready'&&counts[tab]===0&&<p>No new {tab} found.</p>}
        {tab==='walls'&&wallShapes.map(({item})=><label key={item.id} style={{display:'block',padding:8}}><input type="checkbox" disabled={busy} checked={selected.walls.includes(item.id)} onChange={()=>toggle('walls',item.id)}/>{item.label}</label>)}
        {tab==='doors'&&fittedDoors.map((d,i)=><label key={d.id} style={{display:'block',padding:8}}><input type="checkbox" disabled={busy||!!d.issue} checked={effective.doors.includes(d.id)} onChange={()=>toggle('doors',d.id)}/>Door {i+1}{d.issue&&<small style={{display:'block',color:'#ffd39a'}}>{d.issue}</small>}</label>)}
        {tab==='lights'&&drafts.lights?.lights.map((l,i)=><label key={l.id} style={{display:'block',padding:8}}><input type="checkbox" disabled={busy} checked={selected.lights.includes(l.id)} onChange={()=>toggle('lights',l.id)}/>Light source {i+1}</label>)}
        {tab==='windows'&&fittedWindows.map(({marker,issue},i)=><label key={marker.id} style={{display:'block',padding:8}}><input type="checkbox" disabled={busy||!!issue} checked={effective.windows?.includes(marker.id)??false} onChange={()=>toggle('windows',marker.id)}/>Window {i+1}{issue&&<small style={{display:'block',color:'#ffd39a'}}>{issue}</small>}</label>)}
      </div>
    </div>
  </div>,document.body);
}
