import {afterEach,it,expect,vi} from 'vitest';
import {traceMovement,currentMovementTiming,movementApplied} from './movementTiming.js';
import {deliverState,resetDelivery} from './stateDelivery.js';
import type {StateSnapshot} from '../../shared/types.js';
import {visibilityWorkers} from './visibilityWorkers.js';
afterEach(async()=>{vi.unstubAllEnvs();resetDelivery('timing');await visibilityWorkers.close();});
it('does not allocate a trace on ordinary startup or accept malformed diagnostic IDs',()=>{
 vi.stubEnv('E2E_PERFORMANCE_METRICS','0');expect(traceMovement({performanceId:'test'},currentMovementTiming)).toBeUndefined();
 vi.stubEnv('E2E_PERFORMANCE_METRICS','1');expect(traceMovement({performanceId:{id:'test'}},currentMovementTiming)).toBeUndefined();expect(traceMovement({performanceId:'x'.repeat(81)},currentMovementTiming)).toBeUndefined();
});
it('keeps concurrent movement contexts separate across asynchronous work',async()=>{
 vi.stubEnv('E2E_PERFORMANCE_METRICS','1');
 const results=await Promise.all(['a','b'].map(id=>traceMovement({performanceId:id},async()=>{await Promise.resolve();movementApplied();return {...currentMovementTiming()!};})));
 expect(results.map(r=>r.id)).toEqual(['a','b']);for(const r of results)expect(r.appliedAt).toBeGreaterThanOrEqual(r.receivedAt);
 expect(currentMovementTiming()).toBeUndefined();
});
it('keeps timing correlated to the newest queued state when delivery coalesces',async()=>{
 vi.stubEnv('E2E_PERFORMANCE_METRICS','1');
 const snapshot={map:null,tokens:[],characters:[],monsters:[],chat:[],rollLog:[]} as unknown as StateSnapshot;
 const frames:any[]=[];const io={to:()=>({emit:(event:string,frame:any)=>{if(event==='state:frame')frames.push(frame);}})};
 const send=(id:string)=>traceMovement({performanceId:id},()=>{movementApplied();deliverState(io,'timing',{...snapshot,chat:[{id} as any]},{stateProtocol:1,renderProtocol:2,legacyRendering:true,serverRendering:true});});
 send('first');send('second');send('newest');await expect.poll(()=>frames.length).toBe(1);
 expect(frames[0].timing.id).toBe('newest');expect(frames[0].full.chat[0].id).toBe('newest');expect(frames[0].timing.emittedAt).toBeGreaterThanOrEqual(frames[0].timing.queuedAt);
});
it('observes worker timing without altering its output',async()=>{
 const spans:any[]=[];const result=await visibilityWorkers.run({maskTiles:{svg:'<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><rect width="8" height="8"/></svg>',width:16,height:16,tileSize:8}},span=>spans.push(span));
 expect(result.tiles).toHaveLength(4);expect(spans).toHaveLength(1);expect(spans[0].kind).toBe('maskTiles');expect(spans[0].queueMs).toBeGreaterThanOrEqual(0);expect(spans[0].roundTripMs).toBeGreaterThanOrEqual(spans[0].computeMs);expect(spans[0].detail.tiles).toBe(4);expect(spans[0].detail.rasterMs).toBeGreaterThan(0);
});
