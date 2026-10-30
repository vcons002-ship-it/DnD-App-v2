let lastAt=0;
/** Installed only by the opt-in benchmark before page startup. No buffer, timers
 * or payload inspection are allocated in ordinary clients. */
export function movementTiming(phase:string,detail:Record<string,unknown>){
 const hook=(window as unknown as {__dndMovementTiming?:(phase:string,at:number,detail:Record<string,unknown>)=>void}).__dndMovementTiming;
 if(!hook)return;
 const now=performance.timeOrigin+performance.now();lastAt=now>lastAt?now:lastAt+.001;
 hook(phase,lastAt,detail);
}
