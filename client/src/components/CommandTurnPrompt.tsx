import {commandInstruction,isStandardCommand} from '../../../shared/commandSpell';
import {useStore} from '../state/socket';

export function CommandTurnPrompt(){
  const snapshot=useStore(s=>s.snapshot),socket=useStore(s=>s.socket),busy=useStore(s=>!!s.liveDice||!!s.rollFx);
  if(!snapshot||busy)return null;
  const token=snapshot.tokens.find(t=>t.id===snapshot.activeTurnTokenId);
  const e=token&&(token.kind==='pc'?snapshot.characters.find(c=>c.id===token.refId):snapshot.monsters.find(m=>m.id===token.refId));
  const c=e?.conditions.find(c=>c.combatEffect?.spell==='Command'&&c.combatEffect.commandStarted&&!c.combatEffect.commandResolved);
  if(!token||!e||!c||snapshot.role!=='dm'&&(token.kind!=='pc'||!('claimedBy'in e)||e.claimedBy!==socket?.id))return null;
  const word=c.combatEffect!.commandWord!,custom=!isStandardCommand(word);
  return <div className="riposte-prompt" role="region" aria-label="Command turn reminder">
    <strong>{e.name} · Command: {word}</strong><span>{commandInstruction(word)}</span>
    <small>Ends after this turn. {custom?'Custom command: DM adjudication.':'Resolve this instruction, then end the turn.'}</small>
    {(!custom||snapshot.role==='dm')&&<button className="btn" onClick={()=>socket?.emit('spell:commandResolve',{kind:token.kind,refId:token.refId,conditionId:c.id})}>Mark command resolved</button>}
  </div>;
}
