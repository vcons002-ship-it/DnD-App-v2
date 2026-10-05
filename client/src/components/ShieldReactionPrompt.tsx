import {spellSlotOptions} from '../../../shared/spellSlotPools';
import {useStore} from '../state/socket';

export function ShieldReactionPrompt(){
  const snapshot=useStore(s=>s.snapshot),socket=useStore(s=>s.socket),rollFx=useStore(s=>s.rollFx),live=useStore(s=>s.liveDice);
  const offer=snapshot?.shieldReactions?.[0];
  if(!offer||live||rollFx?.rollId===offer.rollId)return null;
  const caster=offer.kind==='pc'?snapshot!.characters.find(c=>c.id===offer.refId):undefined;
  const slots=caster?spellSlotOptions(caster,1).filter(s=>s.remaining>0):[];
  return <div className="riposte-prompt" role="region" aria-label="Shield reaction">
    <strong>Cast Shield?</strong><span>{offer.magicMissile?'Magic Missile targets':'An attack hits'} {offer.name}.</span>
    <small>Reaction · +5 AC until your next turn · blocks Magic Missile. A natural 20 still hits.</small>
    <div>{offer.kind==='monster'?<button className="btn" onClick={()=>socket?.emit('spell:shield',{rollId:offer.rollId})}>Cast Shield</button>:slots.map(slot=><button className="btn" key={slot.key} onClick={()=>socket?.emit('spell:shield',{rollId:offer.rollId,level:slot.level,slotPool:slot.pool})}>Shield · {slot.label}</button>)}
      <button className="btn" onClick={()=>socket?.emit('spell:shield',{rollId:offer.rollId,pass:true})}>Pass</button></div>
  </div>;
}
