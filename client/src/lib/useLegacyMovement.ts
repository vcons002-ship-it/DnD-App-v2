import {useEffect,useLayoutEffect,useMemo,useRef,useState} from 'react';
import type {StateSnapshot} from '../../../shared/types';
import type {LegacyMotion,LegacyPlayback} from '../../../shared/legacyMotion';
import {createMotionSnapshots} from './motionSnapshots';
import {legacyMotionIndex} from '../../../shared/legacyMotion';
/** Positions and image atlases use the shared presentation clock; React only
 * switches authorized token membership or appearance, never atlas pixels. */
export function useLegacyMovement(source:StateSnapshot,enabled:boolean){
 const [tick,setTick]=useState(0);
 const state=useRef<{source?:StateSnapshot;lastId?:string;plan?:LegacyMotion;start:number}>({start:0});
 const previous=state.current;
 if(previous.source!==source){
  const plan=source.legacyMotion,now=performance.now(),oldTokens=new Map(previous.source?.tokens.map(t=>[t.id,t])),curTokens=new Map(source.tokens.map(t=>[t.id,t]));
  const sameView=enabled&&previous.source?.map?.id===source.map?.id&&previous.source?.role===source.role;
  const continuous=plan&&Object.entries(plan.moves).every(([id,m])=>oldTokens.get(id)?.x===m.from.x&&oldTokens.get(id)?.y===m.from.y);
  const startNew=Boolean(sameView&&plan&&plan.id!==previous.lastId&&continuous);
  // A replacement snapshot without a plan may revoke an intermediate creature
  // (hide/delete/fog change). Never carry those extra permissions forward.
  const keepOld=Boolean(!startNew&&sameView&&previous.plan&&now<previous.start+previous.plan.durationMs&&(plan?.id===previous.lastId)&&previous.source?.explorationEpoch===source.explorationEpoch&&previous.source?.map?.mapFogEnabled===source.map?.mapFogEnabled&&JSON.stringify(previous.source?.map?.mapFogRevealed)===JSON.stringify(source.map?.mapFogRevealed)&&Object.entries(previous.plan.moves).every(([id,m])=>{const cur=curTokens.get(id),old=oldTokens.get(id);return cur&&cur.x===m.to.x&&cur.y===m.to.y&&cur.teleportedAt===old?.teleportedAt;}));
  state.current={source,lastId:plan?.id??(keepOld?previous.lastId:undefined),start:keepOld?previous.start:now,plan:startNew?plan:keepOld?previous.plan:undefined};
 }
 if(!enabled||window.matchMedia('(prefers-reduced-motion: reduce)').matches)state.current.plan=undefined;
 const active=state.current,plan=active.plan,elapsed=performance.now()-active.start,stage=!plan?0:legacyMotionIndex(performance.now(),active.start,plan.durationMs,plan.frames.length),complete=!plan||elapsed>=plan.durationMs;
 const frames=useMemo(()=>plan?createMotionSnapshots(source,plan):undefined,[source,plan]);
 useLayoutEffect(()=>{
  if(!plan||!frames)return;
  // Membership-only plans also use the presentation clock for every position;
  // unchanged authorization poses do not need additional React renders.
  const hasMotionFrames=plan.membershipOnly||!!plan.atlas||plan.frames.some(f=>!!f.legacyGeometry);
  const sameAffinity=(a:string[]|undefined,b:string[]|undefined)=>a===b||(!!a&&!!b&&a.length===b.length&&a.every((v,i)=>v===b[i]));
  const samePose=(i:number)=>frames[i].tokens===frames[i-1].tokens&&frames[i].monsters===frames[i-1].monsters&&frames[i].tokenSprites===frames[i-1].tokenSprites&&sameAffinity(plan.frames[i].legacyGeometry?.affinity,plan.frames[i-1].legacyGeometry?.affinity);
  const times=plan.frames.flatMap((f,i)=>i&&(!hasMotionFrames||!samePose(i))?[f.at]:[]);times.push(1);
  const timers=new Set<ReturnType<typeof setTimeout>>();let cancelled=false;
  for(const at of new Set(times)){
   const deadline=active.start+plan.durationMs*at;
   const wake=()=>{if(cancelled)return;const remaining=deadline-performance.now();if(remaining>0){timers.add(setTimeout(wake,Math.max(1,remaining)));return;}setTick(n=>n+1);};
   timers.add(setTimeout(wake,Math.max(1,deadline-performance.now())));
  }
  return()=>{cancelled=true;timers.forEach(clearTimeout);};
 },[plan,frames,active.start]);
 useEffect(()=>{const media=window.matchMedia('(prefers-reduced-motion: reduce)'),changed=()=>setTick(n=>n+1);media.addEventListener('change',changed);return()=>media.removeEventListener('change',changed);},[]);
 const snapshot=plan&&!complete?frames![stage]:source;
 const playback=useMemo<LegacyPlayback|undefined>(()=>plan&&!complete?{id:plan.id,start:active.start,durationMs:plan.durationMs,moves:plan.moves,atlas:plan.atlas,frames:plan.membershipOnly?undefined:plan.frames.map(f=>f.legacyGeometry)}:undefined,[plan,complete,active.start]);
 return {snapshot,playback,stage,tick};
}
