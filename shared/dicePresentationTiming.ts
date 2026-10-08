import {diceThemeForRoll} from './diceThemes.js';
import type {LiveDiceFrame} from './liveDiceTypes.js';
import {liveDieResult} from './liveDieResult.js';
/** Wall-clock presentation timing, shared by the server and visible tray. */
export const DIE_FLASH_MS = 460;
export const DIE_FLIGHT_MS = 650;
export const DIE_REVEAL_MS = DIE_FLASH_MS + DIE_FLIGHT_MS;
export const DIE_REVEAL_STAGGER_MS = 80;
/** Reading time belongs after arithmetic, not between faces and modifiers. */
export const LIVE_DICE_RESULT_HOLD_MS = 2500;
export const ROLL_MODIFIER_STEP_MS = 550;
export const ROLL_MODIFIER_COMPLETE_MS = 900;
export const ROLL_TOTAL_TWEEN_MS = 260;
/** A maximum has one finale clock, measured after its final displayed total. */
export const DRUK_EXPLOSION_AFTER_TOTAL_MS = 750;
export function drukFinaleTimeline(modifiers:number){
  const complete=modifiers ? modifiers*ROLL_MODIFIER_STEP_MS+ROLL_TOTAL_TWEEN_MS : 0;
  return {complete,explosion:complete+DRUK_EXPLOSION_AFTER_TOTAL_MS,impact:complete+LIVE_DICE_RESULT_HOLD_MS};
}
export function hasDrukMaximum(frame:LiveDiceFrame){
  return diceThemeForRoll(frame.className,frame.dmDice).id==='fighter' && frame.values.some((value,i)=>{
    const maximum=frame.percentile?.[i]?liveDieResult(frame,i).percentileValue===100:value===frame.sides[i];
    return maximum && (!frame.mode || frame.kept!==undefined && frame.sets[i]===frame.kept);
  });
}
export const liveCalculationWaitMs=(modifiers:number,drukMaximum=false)=>
  drukMaximum ? drukFinaleTimeline(modifiers).impact : (modifiers ? modifiers*ROLL_MODIFIER_STEP_MS+ROLL_MODIFIER_COMPLETE_MS : LIVE_DICE_RESULT_HOLD_MS)+500;
export function liveDiceResultWaitMs(diceCount: number, groupedSave = false, readingHold = groupedSave) {
  // Cover interpolation/first-painted-frame latency as well as number flights.
  return 250 + DIE_REVEAL_MS + Math.max(0, diceCount - 1) * DIE_REVEAL_STAGGER_MS
    + (readingHold ? LIVE_DICE_RESULT_HOLD_MS : 0) + (groupedSave ? 1800 : 0);
}
