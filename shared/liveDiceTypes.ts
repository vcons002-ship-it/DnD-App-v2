export type LiveDiceFrame = {
 id:string;seq:number;label:string;roller:string;className:string;
 target?:string;
 dmDice?:boolean;affinity?:'friendly'|'neutral'|'enemy';
 mode?:'adv'|'dis';sets:number[];critical:boolean[];percentile:('tens'|'ones'|null)[];kept?:number;
 sides:number[];radius:number;poses:number[];values:(number|null)[];rerolls:number[];
 elapsed:number;done:boolean;
};
/** Shared presentation cadence; physics still advances live with fixed steps. */
export const LIVE_DICE_PRESENTATION_RATE=.75;
