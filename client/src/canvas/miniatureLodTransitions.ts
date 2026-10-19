import type {MiniatureLod} from '../../../shared/miniatureLod.js';

/** Size hysteresis handles wheel jitter; this short dwell also handles a fast
 * zoom-out/zoom-in reversal. Off-screen figures downgrade immediately. */
export function createMiniatureLodTransitions(delayMs=350){
  const exits=new Map<string,{since:number;from:MiniatureLod}>();
  return {
    resolve(id:string,desired:MiniatureLod,current:MiniatureLod,onScreen:boolean,now:number,far:MiniatureLod='battlefield'){
      if(!onScreen||desired!==far||current===far){
        exits.delete(id);return{level:desired,pending:false};
      }
      let exit=exits.get(id);
      if(!exit||exit.from!==current){exit={since:now,from:current};exits.set(id,exit)}
      const pending=now-exit.since<delayMs;
      // Retain the elapsed entry until the visible model acknowledges the swap;
      // a second planning pass must not restart the downgrade timer.
      return{level:pending?current:desired,pending};
    },
    retain(ids:readonly string[]){const keep=new Set(ids);for(const id of exits.keys())if(!keep.has(id))exits.delete(id)},
  };
}
