import {AsyncLocalStorage} from 'node:async_hooks';
type Move={id:string;receivedAt:number;appliedAt?:number};
const context=new AsyncLocalStorage<Move>();
export const timingClock=()=>performance.timeOrigin+performance.now();
export const currentMovementTiming=()=>context.getStore();
/** No diagnostics or payload changes on normal startup. An ID conveys no game authority. */
export function traceMovement<T>(payload:unknown,run:()=>T):T{
 const id=payload&&typeof payload==='object'?(payload as {performanceId?:unknown}).performanceId:undefined;
 if(process.env.E2E_PERFORMANCE_METRICS!=='1'||typeof id!=='string'||!/^[a-zA-Z0-9_-]{1,80}$/.test(id))return run();
 return context.run({id,receivedAt:timingClock()},run);
}
export function movementApplied(){const trace=context.getStore();if(trace)trace.appliedAt=timingClock();}
