/** Wall-clock presentation timing, shared by the server and visible tray. */
export const DIE_FLASH_MS = 460;
export const DIE_FLIGHT_MS = 650;
export const DIE_REVEAL_MS = DIE_FLASH_MS + DIE_FLIGHT_MS;
export const DIE_REVEAL_STAGGER_MS = 80;
/** Keep filled boxes and animated settled dice visible before the roll commits. */
export const LIVE_DICE_RESULT_HOLD_MS = 2000;
export function liveDiceResultWaitMs(diceCount: number, groupedSave = false) {
  // Cover interpolation/first-painted-frame latency as well as number flights.
  return 250 + DIE_REVEAL_MS + Math.max(0, diceCount - 1) * DIE_REVEAL_STAGGER_MS
    + LIVE_DICE_RESULT_HOLD_MS + (groupedSave ? 1800 : 0);
}
