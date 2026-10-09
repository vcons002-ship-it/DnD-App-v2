import {useEffect,useState} from 'react';
import {useStore} from '../state/socket';
import './HiddenRollReview.css';

/** DM-only approval of a fully calculated, still-uncommitted private command. */
export function HiddenRollReview(){
 const review=useStore(s=>s.hiddenRollReview),submitting=useStore(s=>s.hiddenRollSubmitting);
 const connected=useStore(s=>s.status==='connected'),confirm=useStore(s=>s.confirmHiddenRoll);
 const role=useStore(s=>s.snapshot?.role);
 const [editing,setEditing]=useState(false),[values,setValues]=useState<Record<string,string>>({});
 const [working,setWorking]=useState('');
 useEffect(()=>{setEditing(false);setValues({});setWorking('');},[review?.id]);
 if(!review||role!=='dm')return null;
 // A zero-damage cast summary is context, not a second result to accept.
 // The server still approves the complete atomic command and its effects.
 const hasReveals=review.results.some(result=>!!result.reveal);
 const results=review.results.filter(result=>result.reveal||result.total!==0||!hasReveals);
 const inputs=review.dice.flatMap(d=>d.bonus!==undefined
  ?[{key:String(d.index),label:'Final total (includes modifiers)',min:1+d.bonus,max:20+d.bonus,initial:d.total!}]
  :d.sides.map((s,i)=>({key:`${d.index}:${i}`,label:`${d.expr} · die ${i+1} (d${s})`,min:1,max:s,initial:d.faces[i]})));
 const valid=inputs.every(input=>{const n=Number(values[input.key]??input.initial);return Number.isInteger(n)&&n>=input.min&&n<=input.max;});
 const enter=()=>{
  if(!valid)return;
  setEditing(false);
  setWorking('Recalculating the entered result…');
  confirm({action:'manual',faces:review.dice.map(d=>({index:d.index,values:d.bonus!==undefined
   ?d.faces.map(()=>Number(values[String(d.index)]??d.total!)-d.bonus!)
   :d.faces.map((f,i)=>Number(values[`${d.index}:${i}`]??f))}))});
 };
 const outcomes={hit:'Hit',miss:'Miss',crit:'Critical hit',fumble:'Fumble',pass:'Save passed',fail:'Save failed',none:''};
 return <section className="hidden-roll-review" role="region" data-review-id={review.id} data-grouped={results.length>1} aria-label="Approve hidden result" onClick={event=>event.stopPropagation()}>
  <header><span className="hidden-roll-private">DM ONLY · NOT APPLIED YET</span>
   {review.manual&&<p className="hidden-roll-manual-note">DM-entered result</p>}
   {submitting&&<p role="status">{working||'Applying the approved result…'}</p>}</header>
  <div className="hidden-roll-results">{results.map((result,i)=><section key={i}>
   <h3>{result.reveal?.title??result.label}</h3>
   {result.reveal&&<p className="hidden-roll-who">{result.reveal.attacker}{result.reveal.target?` → ${result.reveal.target}`:''}</p>}
   <div className="hidden-roll-verdict"><strong data-outcome={result.reveal?.outcome}>{result.reveal
    ?result.reveal.kind==='damage'?'Damage':result.reveal.kind==='check'&&!/save|saving throw/i.test(result.reveal.title??'')
     ?result.reveal.outcome==='pass'?'Success':result.reveal.outcome==='fail'?'Failed':outcomes[result.reveal.outcome]
     :outcomes[result.reveal.outcome]:''}</strong><b>Total {result.total}</b></div>
   {result.reveal?.effectOutcome&&<p className="hidden-roll-effect">{results.length>1&&result.reveal.kind==='check'&&result.reveal.damage!==undefined
    ?`${result.reveal.damage} ${result.reveal.damageType??''} damage`:result.reveal.effectOutcome}</p>}
   <details className="hidden-roll-details"><summary>Roll details</summary><p className="hidden-roll-equation">{result.detail}</p></details>
  </section>)}</div>
  {editing&&<form className="hidden-roll-entry" onSubmit={e=>{e.preventDefault();enter();}}>
   <p>{review.dice.every(d=>d.bonus!==undefined)?'Enter the total, including modifiers.':'Enter each die face; modifiers are added automatically.'}</p>
   {inputs.map(input=><label key={input.key}>{input.label}<input type="number" min={input.min} max={input.max} step="1" required disabled={submitting} value={values[input.key]??input.initial} onChange={e=>setValues({...values,[input.key]:e.target.value})}/></label>)}
   <button className="btn" disabled={!valid||submitting||!connected}>Review entered result</button>
  </form>}
  <footer><div className="hidden-roll-secondary">
   {!!review.dice.length&&<><button className="btn" disabled={submitting||!connected} onClick={()=>{setWorking('Rerolling the correct dice for this step…');confirm({action:'reroll'});}}>Reject &amp; reroll</button>
    <button className="btn" disabled={submitting||!connected} onClick={()=>setEditing(!editing)}>Enter result</button></>}
   <button className="btn" disabled={submitting||!connected} onClick={()=>confirm(false)}>Discard result</button>
  </div><button className="btn primary hidden-roll-accept" disabled={submitting||!connected} onClick={()=>confirm(true)}>{submitting?'Finishing…':'Apply result'}</button>
  <span>Players see the outcome only after you apply it.</span></footer>
 </section>;
}
