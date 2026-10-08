import {useEffect,useRef} from 'react';
import {useStore} from '../state/socket';
import './HiddenRollReview.css';

/** DM-only approval of a fully calculated, still-uncommitted private command. */
export function HiddenRollReview(){
 const review=useStore(s=>s.hiddenRollReview),submitting=useStore(s=>s.hiddenRollSubmitting);
 const connected=useStore(s=>s.status==='connected'),confirm=useStore(s=>s.confirmHiddenRoll);
 const role=useStore(s=>s.snapshot?.role),dialog=useRef<HTMLDialogElement>(null);
 useEffect(()=>{
  const node=dialog.current;if(!node||!review||role!=='dm')return;
  node.showModal();return()=>node.close();
 },[review?.id,role]);
 if(!review||role!=='dm')return null;
 const outcomes={hit:'Hit',miss:'Miss',crit:'Critical hit',fumble:'Fumble',pass:'Pass',fail:'Fail',none:''};
 return <dialog ref={dialog} className="hidden-roll-review" data-review-id={review.id} aria-labelledby="hidden-roll-title" onCancel={event=>{event.preventDefault();if(!submitting)confirm(false);}}>
  <header><span className="hidden-roll-private">DM ONLY · PRIVATE RESULT</span><h2 id="hidden-roll-title">Approve hidden result</h2>
   <p>The correct dice and modifiers have been calculated. Players have received no roll notification. Nothing is applied until you approve.</p></header>
  <div className="hidden-roll-results">{review.results.map((result,i)=><section key={i}>
   <h3>{result.reveal?.title??result.label}</h3>
   {result.reveal&&<p className="hidden-roll-who">{result.reveal.attacker}{result.reveal.target?` → ${result.reveal.target}`:''}</p>}
   <div className="hidden-roll-verdict"><strong data-outcome={result.reveal?.outcome}>{result.reveal?outcomes[result.reveal.outcome]:''}</strong><b>Total {result.total}</b></div>
   <p className="hidden-roll-equation">{result.detail}</p>
   {result.reveal?.effectOutcome&&<p>{result.reveal.effectOutcome}</p>}
  </section>)}</div>
  <footer><span>Apply publishes the outcome, not the private dice.</span><div>
   <button className="btn" disabled={submitting||!connected} onClick={()=>confirm(false)}>Discard result</button>
   <button className="btn primary" disabled={submitting||!connected} onClick={()=>confirm(true)}>{submitting?'Finishing…':'Apply result'}</button>
  </div></footer>
 </dialog>;
}
