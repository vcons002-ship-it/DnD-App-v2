export type LiveDiceFrame = {
 /** Calculation presented on this settled throw before the next throw starts. */
 calculation?:import('./types.js').RollReveal;
 id:string;seq:number;label:string;roller:string;className:string;
 target?:string;
 /** Offset is used only by the server to match a chunk to private save metadata. */
 dieOffset?:number;
 saveDice?:{rollKind?:'initiative';label:string;modifier?:number;dc?:number;group:string;mode?:'adv'|'dis';autoFail?:boolean;passEffect?:string;failEffect?:string;hideModifiers?:boolean;outcome?:'pass'|'fail'}[];
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
