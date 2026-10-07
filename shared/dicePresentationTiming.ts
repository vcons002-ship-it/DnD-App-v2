/** Wall-clock presentation timing, shared by the server and visible tray. */
export const DIE_FLASH_MS = 460;
export const DIE_FLIGHT_MS = 650;
export const DIE_REVEAL_MS = DIE_FLASH_MS + DIE_FLIGHT_MS;
export const DIE_REVEAL_STAGGER_MS = 80;
/** Keep filled boxes and animated settled dice visible before the roll commits. */
export const LIVE_DICE_RESULT_HOLD_MS = 2000;
export const ROLL_MODIFIER_STEP_MS = 550;
export const ROLL_MODIFIER_COMPLETE_MS = 900;
export const liveCalculationWaitMs=(modifiers:number)=>modifiers*ROLL_MODIFIER_STEP_MS+ROLL_MODIFIER_COMPLETE_MS+500;
export function liveDiceResultWaitMs(diceCount: number, groupedSave = false) {
  // Cover interpolation/first-painted-frame latency as well as number flights.
  return 250 + DIE_REVEAL_MS + Math.max(0, diceCount - 1) * DIE_REVEAL_STAGGER_MS
    + LIVE_DICE_RESULT_HOLD_MS + (groupedSave ? 1800 : 0);
}
