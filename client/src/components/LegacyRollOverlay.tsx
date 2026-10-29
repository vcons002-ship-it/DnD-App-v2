import {useEffect} from 'react';
import {useStore} from '../state/socket';
import {HiddenRollReview} from './HiddenRollReview';

/** Server dice and approval protocol, presented as text without a graphics lease. */
export function LegacyRollOverlay(){
 const frame=useStore(s=>s.liveDice),fx=useStore(s=>s.rollFx),review=useStore(s=>s.hiddenRollReview);
 const roll=useStore(s=>s.snapshot?.rollLog.find(r=>r.id===s.rollFx?.rollId));
 useEffect(()=>{if(frame)useStore.getState().socket?.emit('dice:ready',{id:frame.id});},[frame?.id]);
 useEffect(()=>{
   if(!fx)return;
   useStore.getState().releaseRollImpact(fx.rollId);
   const timer=setTimeout(()=>{if(useStore.getState().rollFx?.id===fx.id)useStore.getState().dismissRollFx();},6500);
   return()=>clearTimeout(timer);
 },[fx?.id]);
 if(!frame&&!fx&&!review)return null;
 const state=useStore.getState();
 return <section className="legacy-roll-card" data-testid="legacy-roll" aria-label="Roll result" role="status">
   <strong>{frame?.label??roll?.label??fx?.reveal.title??'Roll result'}</strong>
   {frame?.awaitingStart&&frame.elapsed===0?<button className="btn" onClick={()=>state.socket?.emit('dice:begin',{id:frame.id})}>Roll saving throw</button>:
     frame&&!frame.done?<span>Rolling…</span>:frame?<span>{frame.values.map((v,i)=>`d${frame.sides[i]}: ${v??'…'}`).join(' · ')}</span>:roll?<><span>{roll.expr}: <b>{roll.total}</b></span><span>{roll.detail}</span></>:<span>Roll resolved. See the roll log for details.</span>}
   {review?<HiddenRollReview/>:<button className="btn tiny" onClick={()=>frame?state.skipLiveDice():state.dismissRollFx()}>Close</button>}
 </section>;
}
