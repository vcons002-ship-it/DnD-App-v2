import { setTimeout as delay } from 'node:timers/promises';
import { reportAi } from './status.js';
const TRANSIENT = new Set([408,429,500,502,503,504]);
/** Three total attempts, including response-body connection failures. */
export async function apiRequest<T>(url: string, init: RequestInit, options: {
  signal?: AbortSignal; timeoutMs?: number; label?: string;
} = {}): Promise<{status:number;data:T|null}|null> {
  const label=options.label ?? 'Gemini API';
  for(let attempt=1;attempt<=3;attempt++) {
    if(options.signal?.aborted) return null;
    let reason='connection failed or timed out';
    try {
      const timeout=AbortSignal.timeout(options.timeoutMs ?? 20000);
      const signal=options.signal ? AbortSignal.any([timeout,options.signal]) : timeout;
      const res=await fetch(url,{...init,signal});
      if(!TRANSIENT.has(res.status)) {
        if(!res.ok) {
          reportAi(`${label} rejected the request (HTTP ${res.status}); this error will not be retried.`);
          return {status:res.status,data:null};
        }
        const data=await res.json() as T;
        if(attempt>1) reportAi(`${label} connection recovered on attempt ${attempt}/3.`);
        return {status:res.status,data};
      }
      reason=`temporary HTTP ${res.status}`;
      await res.body?.cancel();
    } catch(error) {
      if(options.signal?.aborted) return null;
      if(error instanceof SyntaxError) {
        reportAi(`${label} returned an invalid response.`);
        return null;
      }
    }
    if(attempt===3) {
      reportAi(`${label} failed after 3 attempts (${reason}).`);
      return null;
    }
    reportAi(`${label} ${reason}. Retrying (${attempt+1}/3) in ${2**(attempt-1)} seconds.`);
    try { await delay(1000*2**(attempt-1),undefined,{signal:options.signal}); }
    catch { return null; }
  }
  return null;
}
