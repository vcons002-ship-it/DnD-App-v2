import { useEffect } from 'react';
import { useStore } from '../state/socket';
import { markSpell, abilityKey } from '../../../shared/hitFeatures';
import { resolveToken } from '../lib/entities';
import { targetLabel } from '../lib/targets';
import { tokenDistanceFt } from '../../../shared/distance';

export function MarkTransferPrompt() {
  const snapshot=useStore(s=>s.snapshot), socket=useStore(s=>s.socket);
  const selection=useStore(s=>s.orbTarget), setSelection=useStore(s=>s.setOrbTarget);
  const transfer=useStore(s=>s.combatMoveMark);
  const offers=snapshot?.characters.filter(c=>snapshot.role==='dm'||c.claimedBy===socket?.id).flatMap(c=>c.sheetAbilities.filter(a=>{
    const mark=a.mark;
    if(!markSpell(a)||!mark?.active||mark.expiresAt<=Date.now()||!c.conditions.some(v=>v.isConcentration&&abilityKey({name:v.label.replace(/^Concentration:\s*/i,'')})===abilityKey(a))) return false;
    const t=snapshot.tokens.find(t=>t.kind===mark.kind&&t.refId===mark.refId);
    return t && (resolveToken(snapshot,t).curHp===0||resolveToken(snapshot,t).dead);
  }).map(a=>({c,a})))??[];
  const offer=offers.find(o=>o.a.id===selection?.mark?.abilityId&&o.c.id===selection.mark.refId)??offers[0];
  useEffect(()=>{
    if(selection?.mark&&!offers.some(o=>o.c.id===selection.mark!.refId&&o.a.id===selection.mark!.abilityId)) setSelection(null);
  },[selection,offers,setSelection]);
  if(!snapshot||!offer||selection&&!selection.mark) return null;
  const {c,a}=offer, source=snapshot.tokens.find(t=>t.kind==='pc'&&t.refId===c.id);
  const target=snapshot.tokens.find(t=>t.id===selection?.targetId);
  const valid=!!source&&!!target&&target.mapId===source.mapId&&!resolveToken(snapshot,target).objectKind&&!resolveToken(snapshot,target).dead&&resolveToken(snapshot,target).curHp!==0&&!(target.kind===a.mark?.kind&&target.refId===a.mark.refId)&&tokenDistanceFt(source,target,snapshot.map)<=90;
  const choose=()=>setSelection({rollId:`mark:${c.id}:${a.id}`,mark:{kind:'pc',refId:c.id,abilityId:a.id}});
  return <section className="orb-prompt orb-picking" aria-label="Move mark">
    <strong>{a.name}: target defeated</strong>
    <p>{c.name} can move the mark as a bonus action. No extra spell slot.</p>
    {!selection?.mark?<button className="btn" onClick={choose}>Move mark</button>:<>
      <p>{target?`${targetLabel(snapshot,target)} · ${source?Math.round(tokenDistanceFt(source,target,snapshot.map)):0} ft`:'Click a new creature within 90 feet.'}</p>
      {target&&!valid&&<p role="alert">Choose a creature within 90 feet.</p>}
      {valid&&<button className="btn" onClick={()=>{transfer('pc',c.id,a.id,target!.id);setSelection(null);}}>Confirm mark</button>}
      <button className="btn" onClick={choose}>Choose another</button>
      <button className="btn" onClick={()=>setSelection(null)}>Back</button>
    </>}
  </section>;
}
