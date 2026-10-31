import {useEffect,useLayoutEffect,useMemo,useRef,useState} from 'react';
import type {StateSnapshot} from '../../../shared/types';
import type {LegacyMotion,LegacyPlayback} from '../../../shared/legacyMotion';
import {legacyMotionIndex} from '../../../shared/legacyMotion';
/** Positions and image atlases use the shared presentation clock; React only
 * switches authorized token membership or appearance, never atlas pixels. */
export function useLegacyMovement(source:StateSnapshot,enabled:boolean){
 const [tick,setTick]=useState(0);
 const state=useRef<{source?:StateSnapshot;lastId?:string;plan?:LegacyMotion;start:number}>({start:0});
 const previous=state.current;
 if(previous.source!==source){
  const plan=source.legacyMotion,now=performance.now(),oldTokens=new Map(previous.source?.tokens.map(t=>[t.id,t]));
  const continuous=plan&&Object.entries(plan.moves).every(([id,m])=>oldTokens.get(id)?.x===m.from.x&&oldTokens.get(id)?.y===m.from.y);
  state.current={source,lastId:plan?.id,start:now,plan:enabled&&previous.source?.map?.id===source.map?.id&&previous.source?.role===source.role&&plan?.id!==previous.lastId&&continuous&&(!previous.plan||now>=previous.start+previous.plan.durationMs)?plan:undefined};
 }
 if(!enabled||window.matchMedia('(prefers-reduced-motion: reduce)').matches)state.current.plan=undefined;
 const active=state.current,plan=active.plan,elapsed=performance.now()-active.start,stage=!plan?0:legacyMotionIndex(performance.now(),active.start,plan.durationMs,plan.frames.length),complete=!plan||elapsed>=plan.durationMs;
 useLayoutEffect(()=>{
  if(!plan)return;
  const signature=(f:LegacyMotion['frames'][number])=>JSON.stringify([f.tokenIds,f.tokens,f.monsters,f.tokenSprites,f.legacyGeometry?.affinity]);
  const times=plan.frames.flatMap((f,i)=>i&&(!plan.atlas||signature(f)!==signature(plan.frames[i-1]))?[f.at]:[]);times.push(1);
  const timers=new Set<ReturnType<typeof setTimeout>>();let cancelled=false;
  for(const at of new Set(times)){
   const deadline=active.start+plan.durationMs*at;
   const wake=()=>{if(cancelled)return;const remaining=deadline-performance.now();if(remaining>0){timers.add(setTimeout(wake,Math.max(1,remaining)));return;}setTick(n=>n+1);};
   timers.add(setTimeout(wake,Math.max(1,deadline-performance.now())));
  }
  return()=>{cancelled=true;timers.forEach(clearTimeout);};
 },[plan,active.start]);
 useEffect(()=>{const media=window.matchMedia('(prefers-reduced-motion: reduce)'),changed=()=>setTick(n=>n+1);media.addEventListener('change',changed);return()=>media.removeEventListener('change',changed);},[]);
 const snapshot=useMemo(()=>{
  if(!plan||complete)return source;
  const frame=plan.frames[stage],tokensById=new Map(source.tokens.map(t=>[t.id,t]));
  for(const token of frame.tokens??[])tokensById.set(token.id,plan.moves[token.id]?{...token,...plan.moves[token.id].to}:token);
  const tokens=frame.tokenIds.flatMap(id=>tokensById.has(id)?[tokensById.get(id)!]:[]),monsterIds=new Set(tokens.filter(t=>t.kind==='monster').map(t=>t.refId));
  const monstersById=new Map(source.monsters.map(m=>[m.id,m]));for(const monster of frame.monsters??[])monstersById.set(monster.id,monster);
  // Keep destination coordinates for the shared presentation clock. Stationary
  // creatures may exist only in this authorized intermediate frame.
  return {...source,tokens,monsters:[...monstersById.values()].filter(m=>monsterIds.has(m.id)),tokenSprites:frame.tokenSprites?{...source.tokenSprites,...frame.tokenSprites}:source.tokenSprites,legacyGeometry:source.separatedMask&&frame.legacyGeometry?{...frame.legacyGeometry,outlines:source.legacyGeometry?.outlines}:frame.legacyGeometry,visionRaster:frame.visionRaster,visionTiles:frame.visionTiles};
 },[source,plan,stage,complete]);
 const playback=useMemo<LegacyPlayback|undefined>(()=>plan&&!complete?{id:plan.id,start:active.start,durationMs:plan.durationMs,moves:plan.moves,atlas:plan.atlas}:undefined,[plan,complete,active.start]);
 return {snapshot,playback,stage,tick};
}
