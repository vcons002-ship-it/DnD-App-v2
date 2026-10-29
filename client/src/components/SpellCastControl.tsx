import {useLayoutEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import type {Character,Monster,SheetAbility,TokenKind} from '../../../shared/types';
import {useStore} from '../state/socket';
import {targetLists,targetLabel} from '../lib/targets';
import {spellCastCost,spellCastRestriction} from '../lib/spellcasting';
import {AbilityButtons} from './AbilityButtons';
import {effectiveSheetAbility} from '../../../shared/spellExecution';
import {spellCombatSupport} from '../../../shared/spellSupport';
import {isCanonicalHasteProfile} from '../../../shared/spellExecution';

/** A sheet/catalog entry opens setup; only its final Cast button submits. */
export function SpellCastControl({ability,caster,kind='pc',onMapRequest}:{ability:SheetAbility;caster:Character|Monster;kind?:TokenKind;onMapRequest?:()=>void}){
 const [open,setOpen]=useState(false),snapshot=useStore(s=>open?s.snapshot:null),showDead=useStore(s=>s.showDeadTargets);
 const candidate=(kind==='pc'?snapshot?.characters:snapshot?.monsters)?.find(c=>c.id===caster.id);
 const live=candidate&&'sheetAbilities'in candidate?candidate:caster;
 const spell=live.sheetAbilities.find(a=>a.id===ability.id)??ability;
 const cost=spellCastCost(live,spell),restriction=spellCastRestriction(spell);
 const execution=effectiveSheetAbility(spell,cost.level),manual=spellCombatSupport(spell)?.manualCastOnly;
 const allyTarget=!manual&&(isCanonicalHasteProfile(spell)||execution.roll?.kind==='heal'&&execution.roll.healTarget!=='self');
 const attackTarget=!manual&&!allyTarget&&!execution.summon&&!!execution.roll;
 const actor=snapshot?.tokens.find(t=>t.kind===kind&&t.refId===caster.id);
 const choices=snapshot&&actor?targetLists(snapshot,actor,showDead):{attack:[],heal:[]};
 const [target,setTarget]=useState(''),[ally,setAlly]=useState('');
 const dialog=useRef<HTMLDialogElement>(null);
 useLayoutEffect(()=>{if(!open)return;const node=dialog.current;node?.showModal();return()=>node?.close();},[open]);
 const close=()=>setOpen(false);
 return <><span className="spell-cast-control">
  <button type="button" className="btn tiny spell-cast-open" aria-label={`Cast ${spell.name}`} onClick={()=>setOpen(true)}>Cast {spell.name}…</button>
  <small>{restriction?'Requires preparation or a trigger':cost.label}{cost.remaining?` · ${cost.remaining}`:''}</small>
 </span>{open&&createPortal(<dialog ref={dialog} className="spell-cast-dialog" aria-label={`Cast ${spell.name}`} onKeyDown={e=>e.stopPropagation()} onCancel={e=>{e.preventDefault();e.stopPropagation();close();}}>
   <header><h3>Cast {spell.name}</h3><button type="button" className="btn tiny" onClick={close} aria-label="Cancel spell casting">Cancel</button></header>
   <p>{live.name}{spell.sourceClass?` · ${spell.sourceClass}`:''}</p>
   <p className="muted">Opening this window or changing the slot does not cast or spend anything.</p>
   {spell.meta&&<p>{spell.meta}</p>}
   {restriction?<p role="status">{restriction}</p>:<>
    {attackTarget&&choices.attack.length>0&&<label>Single target (if needed)<select aria-label="Cast spell target" value={choices.attack.some(t=>t.id===target)?target:choices.attack[0].id} onChange={e=>setTarget(e.target.value)}>{choices.attack.map(t=><option key={t.id} value={t.id}>{targetLabel(snapshot!,t,actor)}</option>)}</select></label>}
    {allyTarget&&choices.heal.length>0&&<label>Ally or self<select aria-label="Cast ally target" value={choices.heal.some(t=>t.id===ally)?ally:choices.heal[0].id} onChange={e=>setAlly(e.target.value)}>{choices.heal.map(t=><option key={t.id} value={t.id}>{targetLabel(snapshot!,t,actor)}</option>)}</select></label>}
    <AbilityButtons abilities={[spell]} kind={kind} caster={live} targetTokenId={choices.attack.some(t=>t.id===target)?target:choices.attack[0]?.id} healTargetId={choices.heal.some(t=>t.id===ally)?ally:choices.heal[0]?.id} buffTargetId={choices.heal.some(t=>t.id===ally)?ally:choices.heal[0]?.id} onAfter={()=>{close();const state=useStore.getState();if(state.areaCast||state.teleportCast)onMapRequest?.();}}/>
   </>}
   <details><summary>Spell description</summary><p>{spell.description}</p></details>
  </dialog>,document.body)}</>;
}
