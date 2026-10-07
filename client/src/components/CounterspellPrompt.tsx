import {useEffect} from 'react';
import {spellSlotOptions} from '../../../shared/spellSlotPools';
import {useStore} from '../state/socket';
export function CounterspellPrompt(){
 const snapshot=useStore(s=>s.snapshot),socket=useStore(s=>s.socket),live=useStore(s=>s.liveDice);
 const offer=snapshot?.counterspellCasts?.[0];
 useEffect(()=>{
   if(!offer||!socket||!offer.mine&&snapshot?.role!=='dm')return;
   const timer=setTimeout(()=>socket.emit('spell:counterspell',{castId:offer.id,continueCast:true}),Math.max(0,offer.expiresAt-Date.now())+100);
   return ()=>clearTimeout(timer);
 },[offer?.id,offer?.expiresAt,offer?.mine,snapshot?.role,socket]);
 if(!offer||live)return null;
 return <div className="riposte-prompt" role="region" aria-label="Counterspell reaction">
  <strong>{offer.reactors.length?'Counterspell?':'Casting spell…'}</strong>
  <span>{offer.casterName} is casting {offer.spell}.</span>
  <small>Reaction · 60 ft · caster makes a CON save. A countered spell has no effect and keeps its spell slot.</small>
  {offer.reactors.map(r=>{
   const caster=r.kind==='pc'?snapshot!.characters.find(c=>c.id===r.refId):undefined;
   const slots=caster?spellSlotOptions(caster,3).filter(s=>s.remaining>0):[];
   return <div key={r.tokenId}><span>{r.name}: </span>{r.kind==='monster'?<button className="btn" onClick={()=>socket?.emit('spell:counterspell',{castId:offer.id,reactorTokenId:r.tokenId})}>Counterspell</button>:slots.map(s=><button key={s.key} className="btn" onClick={()=>socket?.emit('spell:counterspell',{castId:offer.id,reactorTokenId:r.tokenId,level:s.level,slotPool:s.pool})}>Counterspell · {s.label}</button>)}
   <button className="btn" onClick={()=>socket?.emit('spell:counterspell',{castId:offer.id,reactorTokenId:r.tokenId,pass:true})}>Pass</button></div>;
  })}
  {snapshot?.role==='dm'?<button className="btn tiny" onClick={()=>socket?.emit('spell:counterspell',{castId:offer.id,continueCast:true})}>Continue without Counterspell</button>:offer.mine&&<small>Waiting for reactions; continues after 30 seconds.</small>}
 </div>;
}
