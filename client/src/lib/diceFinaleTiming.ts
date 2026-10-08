import type {RollReveal} from '../../../shared/types';
import type {LiveDiceFrame} from '../../../shared/liveDiceTypes';
import {ROLL_MODIFIER_STEP_MS,ROLL_MODIFIER_COMPLETE_MS,LIVE_DICE_RESULT_HOLD_MS} from '../../../shared/dicePresentationTiming';
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
 const complete=Math.max(reveal.diceTrigger?DICE_TRIGGER_HOLD_MS:0,burst&&!adjustments.length?LIVE_DICE_RESULT_HOLD_MS:adjustments.length*ROLL_MODIFIER_STEP_MS+ROLL_MODIFIER_COMPLETE_MS);
 return {complete,impact:Math.max(complete+(!burst&&reveal.outcome!=='none'?1200:0),drukMaximum?1200:0)};
}
