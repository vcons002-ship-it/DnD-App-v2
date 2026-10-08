import type {RollReveal} from '../../../shared/types';
import type {LiveDiceFrame} from '../../../shared/liveDiceTypes';
import {rollResultTimeline} from '../../../shared/dicePresentationTiming';
import {DICE_TRIGGER_HOLD_MS} from '../../../shared/diceTriggers';

/** A kept, confirmed attack face, never a save, modifier total or discarded 20. */
export function liveNaturalCritical(frame:LiveDiceFrame){
 if(!frame.done||frame.saveDice||!/(?:spell )?attack roll$/i.test(frame.label.trim()))return false;
 return frame.sides.some((side,i)=>side===20&&frame.values[i]===20&&(!frame.mode||frame.kept!==undefined&&frame.sets[i]===frame.kept));
}
export function physicalRollTimeline(reveal:RollReveal,inlineTray:boolean,drukMaximum=false){
 const burst=reveal.kind==='damage'||reveal.kind==='dice';
 const attackDamage=inlineTray&&!burst&&!!reveal.damageDice?.length;
 const adjustments=burst?reveal.damageMods??[]:attackDamage?[...(reveal.toHit??[]),...(reveal.damageMods??[])]:reveal.toHit??[];
 const timing=rollResultTimeline(adjustments.length,drukMaximum);
 const complete=Math.max(timing.complete,reveal.diceTrigger?DICE_TRIGGER_HOLD_MS:0);
 return {...timing,complete,impact:timing.impact+(complete-timing.complete)};
}
