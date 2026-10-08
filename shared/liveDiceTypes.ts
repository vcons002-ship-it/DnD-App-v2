export type LiveDiceFrame = {
 /** Confirmed dice-dependent effect, published on the first settled frame. */
 diceTrigger?:import('./types.js').RollReveal['diceTrigger'];
 /** Extra d8s already rolled and their per-cast limit; excludes base/crit dice. */
 /** Reserved capacity and parent-to-child indices for one continuous Burst tray. */
 burstCapacity?:number;burstLinks?:{from:number;to:number}[];
 burstProgress?:{used:number;limit:number};
 /** Calculation presented on this settled throw before the next throw starts. */
 calculation?:import('./types.js').RollReveal;
 /** Server-held reading/effects phase for a throw with no calculation card. */
 resultHoldMs?:number;
 id:string;seq:number;label:string;roller:string;className:string;
 target?:string;
 /** Offset is used only by the server to match a chunk to private save metadata. */
 dieOffset?:number;
 saveDice?:{rollKind?:'initiative';label:string;name?:string;modifier?:number;dc?:number;group:string;mode?:'adv'|'dis';autoFail?:boolean;passEffect?:string;failEffect?:string;hideModifiers?:boolean;outcome?:'pass'|'fail'}[];
 dmDice?:boolean;affinity?:'friendly'|'neutral'|'enemy';
 mode?:'adv'|'dis';sets:number[];critical:boolean[];percentile:('tens'|'ones'|null)[];kept?:number;
 sides:number[];radius:number;trayScale?:number;poses:number[];values:(number|null)[];rerolls:number[];
 elapsed:number;done:boolean;
 /** Collisions since the previous frame (physics seconds) — the dice sounds. */
 impacts?:import('./diceImpacts.js').DiceImpact[];
};
/** Shared presentation cadence; physics still advances live with fixed steps. */
export const LIVE_DICE_PRESENTATION_RATE=.75;
/** Wall-clock wait per throw, including the slower presentation cadence. */
export const LIVE_DICE_REROLL_WAIT_SECONDS=4;
