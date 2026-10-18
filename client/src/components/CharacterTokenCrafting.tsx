import {useEffect,useState,useRef} from 'react';
import type {Character} from '../../../shared/types';
import type {AssetJob,SourceArtView} from '../../../shared/assetProduction';
import {useStore} from '../state/socket';
import {apiFetch} from '../lib/api';
import {ModelUploadControl} from './ModelUploadControl';
import {SourceArtReview} from './SourceArtReview';
import {assetJobPending} from '../../../shared/assetProduction';
import {CharacterHeightControl} from './CharacterHeightControl';
import {suggestedCharacterHeight} from '../../../shared/characterHeight';

export function CharacterTokenCrafting({character}:{character:Character}) {
  const craft=useStore(s=>s.craftCharacterToken),getStatus=useStore(s=>s.characterTokenStatus);
  const review=useStore(s=>s.reviewCharacterToken);
  const isDm=useStore(s=>s.snapshot?.role==='dm');
  const [job,setJob]=useState<AssetJob|null>(null),[paused,setPaused]=useState(false),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const [heldWeapon,setHeldWeapon]=useState('Unarmed');
  const [appearance,setAppearance]=useState(character.appearance??'');
  const [height,setHeight]=useState(character.heightInches??suggestedCharacterHeight(character.race));
  const [now,setNow]=useState(Date.now());const operation=useRef(0),request=useRef(0),applied=useRef(0);
  useEffect(()=>{setJob(null);setError('');setHeight(character.heightInches??suggestedCharacterHeight(character.race));operation.current++;},[character.id]);
  useEffect(()=>{setHeldWeapon('Unarmed');},[character.id]);
  useEffect(()=>{if(job?.heldWeapon)setHeldWeapon(job.heldWeapon);},[job?.id,job?.heldWeapon]);
  useEffect(()=>{setAppearance(character.appearance??'');},[character.id,character.appearance]);
  useEffect(()=>{let alive=true;const refresh=async()=>{const version=operation.current,seq=++request.current;const r=await getStatus(character.id);if(!alive||version!==operation.current||seq<applied.current)return;applied.current=seq;if(r.ok){setJob(r.job);setPaused(r.paused);}else setError(r.error);};void refresh();const timer=setInterval(refresh,2500);return()=>{alive=false;clearInterval(timer);};},[character.id,getStatus]);
  useEffect(()=>{if(!job||!['queued','running','cancelling'].includes(job.state))return;const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer);},[job?.state]);
  const submit=async(retry=false)=>{operation.current++;setBusy(true);setError('');const r=await craft(character.id,appearance,retry,heldWeapon,height);if(r.ok)setJob(r.job);else setError(r.error);setBusy(false);};
  const reviewArt=async(action:'approve'|'regenerate'|'cancel',view?:SourceArtView)=>{if(!job)return;operation.current++;setBusy(true);setError('');const r=await review(character.id,job.id,action,job.sourceArt?.sha256??'',appearance,heldWeapon,height,view);if(r.ok)setJob(r.job);else setError(r.error);setBusy(false);};
  const resume=async()=>{setBusy(true);try{const r=await apiFetch('/api/assets/pause',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({paused:false})});if(!r.ok)throw new Error();setPaused(false);}catch{setError('Could not resume crafting. Check your DM connection and try again.');}finally{setBusy(false);}};
  const pending=job&&assetJobPending(job),working=job&&['queued','running'].includes(job.state);
  const elapsed=job?Math.max(0,Math.floor((now-Date.parse(job.updatedAt))/1000)):0;
  return <details className="hero-token-crafting" open={!!job}><summary>Personal token & miniature</summary>
    <p role="status">{job?`${job.state==='awaiting_approval'?'Source art ready for approval':job.state==='ready'?'Miniature ready':job.state==='cancelled'?'Craft cancelled':job.state==='cancelling'?'Cancelling craft':job.state==='failed'?'Crafting needs attention':'Crafting in progress'} · ${job.stage}`:character.modelType?'Personal model available':'Describe your hero to create source art, then approve it to craft a 3D miniature.'}</p>
    {working&&<small>Current step: {Math.floor(elapsed/60)}m {elapsed%60}s. Building and texturing a 3D model can take several minutes; you can keep playing.</small>}
    {job?.state==='cancelling'&&<small>A submitted 3D operation may need to finish before the worker is free. Its result will not replace your token.</small>}
    {paused&&<p className="hint">The shared crafting queue is paused.{!isDm&&' Ask your DM to resume it.'}</p>}
    {job?.error&&<p className="hint">{job.error}</p>}{error&&<p role="alert">{error}</p>}
    {character.icon?.startsWith('/uploads/')&&<img src={character.icon} alt={`${character.name} token art`} width={120} height={120}/>}
    <label>Appearance<textarea maxLength={600} rows={4} value={appearance} disabled={!!working||busy} onChange={e=>setAppearance(e.target.value)}/></label>
    <CharacterHeightControl value={height} species={character.race} onChange={setHeight} disabled={!!working||busy}/>
    <label>Weapon held by your token<select aria-label="Weapon held by your token" value={heldWeapon} disabled={!!working||busy} onChange={e=>setHeldWeapon(e.target.value)}>{[...new Set(['Unarmed',...character.weapons.map(w=>w.name)])].map(n=><option key={n}>{n}</option>)}</select></label>
    <small>Includes species, class, weapons, and clothing from your sheet. Review all four source views before 3D generation. You can play while generation runs.</small>
    {job&&<SourceArtReview job={job} busy={busy} onApprove={()=>void reviewArt('approve')} onRegenerate={()=>void reviewArt('regenerate')} onRefresh={view=>void reviewArt('regenerate',view)}/>}
    <div>{isDm&&paused&&<button className="btn" disabled={busy} onClick={()=>void resume()}>Resume crafting queue</button>}{job?.state==='failed'&&<button className="btn" disabled={busy} onClick={()=>void submit(true)}>Retry token crafting</button>}
    {job&&(assetJobPending(job)||job.state==='failed')&&<button className="btn" disabled={busy} onClick={()=>void reviewArt('cancel')}>Cancel crafting</button>}
    <button className="btn" disabled={busy||!!pending||!appearance.trim()} onClick={()=>void submit()}>{busy?'Submitting…':character.modelType?'Craft a new token':'Craft token & miniature'}</button></div>
    <ModelUploadControl key={character.id} kind="character" id={character.id}/>
  </details>;
}
