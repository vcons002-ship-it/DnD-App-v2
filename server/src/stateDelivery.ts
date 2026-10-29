import type {StateSnapshot} from '../../shared/types.js';
import {diffSnapshot,type StateFrame} from '../../shared/stateDelta.js';
import {needsVisibilityLayer,usesMapVision} from '../../shared/playerVision.js';
import {visibilityWorkers} from './visibilityWorkers.js';
import {renderedSnapshot,renderingInputKey,reuseRenderedSnapshot} from './renderedSnapshot.js';
import {currentMovementTiming,timingClock} from './movementTiming.js';
import type {MovementFrameTiming} from '../../shared/movementTiming.js';
import {prepareLegacyMotion} from './legacyMotion.js';
type Emitter={to:(id:string)=>{emit:(event:any,payload:any)=>unknown}};
type Delivery={serial:number;revision:number;active:boolean;wake?:()=>void;pending?:StateSnapshot;pendingTiming?:MovementFrameTiming;previous?:StateSnapshot;previousSource?:StateSnapshot;inputKey?:string;ready?:StateSnapshot;readySource?:StateSnapshot;forceFull:boolean;legacy:boolean;managed:boolean;lastAt:number;effects:(()=>void)[]};
const deliveries=new Map<string,Delivery>();
export const deliveryMetrics={full:0,delta:0,fullBytes:0,wireBytes:0,coalesced:0,stale:0,failed:0};
export function resetDelivery(id:string){const d=deliveries.get(id);deliveries.delete(id);d?.wake?.();}
export function resyncDelivery(id:string){const d=deliveries.get(id);if(d){d.forceFull=true;d.inputKey=undefined;d.ready=undefined;d.readySource=undefined;d.wake?.();}}
function positionsChanged(before:StateSnapshot|undefined,after:StateSnapshot){
 if(!before)return true;
 const changed=(a:Pick<StateSnapshot,'map'|'tokens'>|undefined,b:Pick<StateSnapshot,'map'|'tokens'>|undefined)=>{
  if(!a||!b)return a!==b;if(a.map?.id!==b.map?.id||a.tokens.length!==b.tokens.length)return true;
  const old=new Map(a.tokens.map(t=>[t.id,t]));return b.tokens.some(t=>{const previous=old.get(t.id);return !previous||previous.x!==t.x||previous.y!==t.y;});
 };
 return changed(before,after)||changed(before.partyView,after.partyView);
}
/** Join can show a fail-closed mask until its first atomic server frame is ready. */
const clearGeometry=(s:Pick<StateSnapshot,'tokens'>)=>({sight:[],near:[],lights:[],memory:[],affinity:s.tokens.filter(t=>!t.sharedSightOnly).map(t=>t.id)});
export const pendingGeometry=(snapshot:StateSnapshot):StateSnapshot=>({...snapshot,legacyGeometry:needsVisibilityLayer(snapshot.map,snapshot.playerVision)?null:clearGeometry(snapshot),...(snapshot.partyView?{partyView:{...snapshot.partyView,legacyGeometry:needsVisibilityLayer(snapshot.partyView.map,snapshot.partyView.playerVision)?null:clearGeometry(snapshot.partyView)}}:{})});
async function addGeometry(snapshot:StateSnapshot,detailed=false,timing?:MovementFrameTiming):Promise<StateSnapshot>{
 const layer=async(s:Pick<StateSnapshot,'map'|'playerVision'|'exploredTerrain'|'tokens'>)=>!s.map?undefined:s.playerVision&&needsVisibilityLayer(s.map,s.playerVision)?visibilityWorkers.run({mapId:s.map.id,vision:s.playerVision,wallFog:usesMapVision(s.map),detailed,explored:s.exploredTerrain,tokens:s.tokens.map(({id,x,y,sharedSightOnly})=>({id,x,y,sharedSightOnly}))},timing?span=>timing.workers.push(span):undefined):clearGeometry(s);
 const [legacyGeometry,party]=await Promise.all([layer(snapshot),snapshot.partyView?layer(snapshot.partyView):undefined]);
 return {...snapshot,legacyGeometry,...(snapshot.partyView?{partyView:{...snapshot.partyView,legacyGeometry:party}}:{})};
}
/** Legacy geometry and its accepted positions travel in one revision. Old clients
 * retain synchronous full snapshots. A busy connection keeps only its newest state. */
export function deliverState(io:Emitter,id:string,snapshot:StateSnapshot,options:{stateProtocol?:1;renderProtocol?:1|2|3;legacyRendering?:boolean;serverRendering?:boolean;legacyMotion?:boolean;compactMotion?:boolean},after?:()=>void){
 if(options.stateProtocol!==1){io.to(id).emit('state:snapshot',snapshot);after?.();return;}
 let d=deliveries.get(id);
 const managed=options.serverRendering??!!options.legacyRendering;
 if(!d||d.legacy!==!!options.legacyRendering||d.managed!==managed){d={serial:0,revision:0,active:false,forceFull:true,legacy:!!options.legacyRendering,managed,lastAt:0,effects:[]};deliveries.set(id,d);}
 if(after)d.effects.push(after);
 if(d.pending)deliveryMetrics.coalesced++;d.pending=snapshot;d.serial++;
 const movement=currentMovementTiming();d.pendingTiming=movement?{...movement,queuedAt:timingClock(),workers:[]}:undefined;
 if(d.active){if(positionsChanged(d.previous,snapshot))d.wake?.();return;}
 const drain=async()=>{
  d!.active=true;
  while(d!.pending&&deliveries.get(id)===d){
   const delay=d!.legacy&&!d!.forceFull&&!positionsChanged(d!.previous,d!.pending)?500-(performance.now()-d!.lastAt):0;
   if(delay>0)await new Promise<void>(resolve=>{const done=()=>{clearTimeout(timer);d!.wake=undefined;resolve();},timer=setTimeout(done,delay);d!.wake=done;});
   if(deliveries.get(id)!==d)break;
   const next=d!.pending,serial=d!.serial;let timing=d!.pendingTiming;d!.pending=undefined;d!.pendingTiming=undefined;
   if(timing)timing.startedAt=timingClock();
   let prepared:StateSnapshot,source:StateSnapshot;
   const inputKey=d!.managed?renderingInputKey(next):undefined;
   const pending=()=>d!.pending;
   const current=()=>deliveries.get(id)===d&&(serial===d!.serial||!!inputKey&&!!pending()&&renderingInputKey(pending()!)===inputKey);
   const prepareMotion=async(sourceView:StateSnapshot,endpoint:()=>Promise<StateSnapshot>)=>{
    if(!d!.legacy||!d!.managed||!sourceView.serverRendering?.enabled||!options.legacyMotion||(options.renderProtocol??0)<3||d!.forceFull||!d!.previous||!positionsChanged(d!.previous,sourceView))return;
    try{
     if(timing)timing.motionStartAt=timingClock();
     const before=d!.previousSource?{...d!.previous,visionRaster:undefined,visionTiles:undefined,legacyGeometry:d!.previousSource.legacyGeometry,...(d!.previous.partyView&&d!.previousSource.partyView?{partyView:{...d!.previous.partyView,visionRaster:undefined,visionTiles:undefined,legacyGeometry:d!.previousSource.partyView.legacyGeometry}}:{})}:d!.previous;
     const [legacyMotion,party]=await Promise.all([
      prepareLegacyMotion(id,before,sourceView,timing,{current,endpoint,compact:options.compactMotion===true}),
      sourceView.partyView&&before.partyView?prepareLegacyMotion(id,{...before,...before.partyView,partyView:undefined,role:'player'},{...sourceView,...sourceView.partyView,partyView:undefined,role:'player'},timing,{current,compact:options.compactMotion===true,endpoint:async()=>{const rendered=await endpoint();return {...rendered,...rendered.partyView,partyView:undefined,role:'player'};}}):undefined,
     ]);
     if(timing)timing.motionEndAt=timingClock();
     return {legacyMotion,party};
    }catch(error){console.warn('Legacy movement falls back to snap:',String(error));}
   };
   try{
    if(inputKey&&inputKey===d!.inputKey&&d!.ready){prepared=reuseRenderedSnapshot(next,d!.ready);source=d!.readySource?{...next,legacyGeometry:d!.readySource.legacyGeometry,...(next.partyView&&d!.readySource.partyView?{partyView:{...next.partyView,legacyGeometry:d!.readySource.partyView.legacyGeometry}}:{})}:prepared;if(timing)timing.reused=true;}
    else{
     if(timing)timing.geometryStartAt=timingClock();
     prepared=d!.managed?await addGeometry(next,!d!.legacy&&options.renderProtocol!==undefined,timing):next;
     if(timing){timing.geometryEndAt=timingClock();timing.renderStartAt=timingClock();}
     source=prepared;
     if(d!.managed&&options.renderProtocol!==undefined&&next.serverRendering?.enabled){
      const rendering=renderedSnapshot(id,source,d!.legacy,undefined,options.renderProtocol>=2,timing,options.renderProtocol>=3).then(value=>{if(timing)timing.renderEndAt=timingClock();return value;});
      // Start independent work together; geometry/state shaping is read-only.
      // Obsolete plans stop enqueueing poses, without terminating worker jobs.
      const motion=prepareMotion(source,()=>rendering);
      const [rendered,plan]=await Promise.all([rendering,motion]);
      prepared=plan?{...rendered,legacyMotion:plan.legacyMotion,...(rendered.partyView?{partyView:{...rendered.partyView,legacyMotion:plan.party}}:{})}:rendered;
     }else if(timing)timing.renderEndAt=timingClock();
    }
   }
   catch(error){deliveryMetrics.failed++;console.error('[visibility]',String(error));if(deliveries.get(id)===d){io.to(id).emit('notice',{message:'Visibility calculation failed. Your last view is retained; reconnect to retry.'});}continue;}
   if(deliveries.get(id)!==d)break;
   if(inputKey){d!.inputKey=inputKey;d!.ready=prepared;d!.readySource=source;}
   if(serial!==d!.serial){
    const latest=pending(),latestTiming=d!.pendingTiming;
    if(inputKey&&latest&&renderingInputKey(latest)===inputKey){
     d!.pending=undefined;d!.pendingTiming=undefined;
     if(latestTiming)timing={...latestTiming,startedAt:timing?.startedAt??timingClock(),reused:true,workers:timing?.workers??latestTiming.workers};
     const merged=reuseRenderedSnapshot(latest,prepared);
     prepared={...merged,legacyMotion:prepared.legacyMotion,...(merged.partyView&&prepared.partyView?{partyView:{...merged.partyView,legacyMotion:prepared.partyView.legacyMotion}}:{})};
     source={...latest,legacyGeometry:source.legacyGeometry,...(latest.partyView&&source.partyView?{partyView:{...latest.partyView,legacyGeometry:source.partyView.legacyGeometry}}:{})};
    }else{deliveryMetrics.stale++;continue;}
   }
   d!.previousSource=source;
   const revision=++d!.revision,full:StateFrame={revision,full:prepared};let frame:StateFrame=full;
   const fullBytes=Buffer.byteLength(JSON.stringify(full));let wireBytes=fullBytes;
   if(d!.previous&&!d!.forceFull){const delta:StateFrame={revision,base:revision-1,delta:diffSnapshot(d!.previous,prepared)};const deltaBytes=Buffer.byteLength(JSON.stringify(delta));if(deltaBytes<fullBytes){frame=delta;wireBytes=deltaBytes;}}
   d!.previous=prepared;d!.forceFull=false;d!.lastAt=performance.now();deliveryMetrics.fullBytes+=fullBytes;deliveryMetrics.wireBytes+=wireBytes;deliveryMetrics['full' in frame?'full':'delta']++;
   if(timing){timing.emittedAt=timingClock();frame.timing=timing;}
   io.to(id).emit('state:frame',frame);
   for(const effect of d!.effects.splice(0))effect();
  }
  d!.active=false;
 };void drain();
}
