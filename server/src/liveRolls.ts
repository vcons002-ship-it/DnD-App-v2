import {randomInt,randomUUID} from 'node:crypto';
import {createLiveWorld} from '../../shared/liveDicePhysics.js';
import {withDiceSource,rollDice,type PhysicalDiceInfo} from '../../shared/dice.js';
import {db} from './db.js';
import {checkpointHpFx,faceTokenToward} from './sessions.js';
import {checkpointReactions} from './reactions.js';
import {stageRollEffects,stagedRollFacing,type RollFacing} from './liveRollContext.js';
import type {LiveDiceFrame} from '../../shared/liveDiceTypes.js';
import {LIVE_DICE_PRESENTATION_RATE} from '../../shared/liveDiceTypes.js';

class NeedDice extends Error {constructor(public sides:number[],public info:PhysicalDiceInfo,public facing:RollFacing[]){super('Waiting for physical dice');}}
const queues=new Map<string,Promise<void>>();
export const rollInProgress=(sid:string)=>queues.has(sid);
export function enqueueRoll(sid:string,run:()=>Promise<void>|void,onError:(e:unknown)=>void){
 const previous=queues.get(sid)??Promise.resolve();
 const task=previous.then(run).catch(onError);
 queues.set(sid,task);void task.finally(()=>{if(queues.get(sid)===task)queues.delete(sid);});
}
export class UnsupportedPhysicalDice extends Error {}

export function keptPhysicalSet(values:number[],info:PhysicalDiceInfo):number|undefined {
  if (!info.advantage) return undefined;
  const half=values.length/2;
  const totals=[values.slice(0,half),values.slice(half)].map(faces=>
    withDiceSource(()=>faces,()=>rollDice(info.expr)!.total));
  return info.advantage==='adv' ? (totals[0]>=totals[1]?0:1) : (totals[0]<=totals[1]?0:1);
}

type LiveRollMeta={label:string;roller:string;className:string;ready?:(id:string)=>Promise<void>;onFacing?:()=>void};

export async function physicalFaces(
  sides:number[], publish:(frame:LiveDiceFrame)=>void,
  meta:LiveRollMeta, seed=randomInt(0,0xffffffff), info?:PhysicalDiceInfo,
) {
  if(sides.some(s=>![4,6,8,10,12,20,100].includes(s)))
    throw new UnsupportedPhysicalDice('Live rolls support d4, d6, d8, d10, d12, d20 and d100. Choose one of these dice.');
  const {ready,onFacing,...displayMeta}=meta;
  const result:number[]=[];
  // Bound each live world to forty physical bodies; keep percentile pairs together.
  for(let offset=0;offset<sides.length;) {
    const logical:number[]=[]; let count=0;
    while(offset+logical.length<sides.length) {
      const side=sides[offset+logical.length], next=side===100?2:1;
      if(count+next>40) break;
      logical.push(side); count+=next;
    }
    const expanded=logical.flatMap(s=>s===100?[10,10]:[s]);
    const world=createLiveWorld(expanded.map((sides,index)=>({sides,value:1,index,set:0})),seed+offset,'bottom');
    const id=randomUUID(); let seq=0;
    const sets=logical.flatMap((s,i)=>Array(s===100?2:1).fill(info?.advantage && offset+i>=sides.length/2?1:0));
    const critical=logical.flatMap((s,i)=>Array(s===100?2:1).fill(!!info?.criticalDice?.[offset+i] || !!info?.critical || info?.criticalFrom!==undefined && offset+i>=info.criticalFrom));
    const percentile:('tens'|'ones'|null)[]=logical.flatMap(s=>s===100?['tens','ones'] as const:[null]);
    const decode=(values:number[])=>{
      let i=0;
      return logical.map(side=>{
        if(side!==100) return values[i++];
        const tens=values[i++]-1, ones=values[i++]-1;
        return tens*10+ones||100;
      });
    };
    const emit=()=>{
      const state=world.snapshot();
      const kept=state.done&&info?.advantage&&offset+logical.length===sides.length
        ? keptPhysicalSet([...result,...decode(state.values as number[])],info) : undefined;
      publish({...state,poses:state.poses.map(v=>Math.round(v*10000)/10000),id,seq:seq++,sides:expanded,sets,critical,percentile,mode:info?.advantage,kept,...displayMeta});
      return state;
    };
    const prepared=ready?.(id);
    emit();
    await prepared;
    const values=await new Promise<number[]>((resolve,reject)=>{
      let last=performance.now(),credit=0;
      const timer=setInterval(()=>{
        try {
          const now=performance.now(); credit+=Math.min(.1,(now-last)/1000)*LIVE_DICE_PRESENTATION_RATE; last=now;
          while(credit>=1/120) {
            world.advance(1/120); credit-=1/120;
            if(world.snapshot().done) break;
          }
          const state=emit();
          if(state.done) { clearInterval(timer); resolve(state.values as number[]); }
        } catch(e) { clearInterval(timer); reject(e); }
      },1000/30);
    });
    // Allow the visible face-to-result animation to finish before publishing damage.
    await new Promise(resolve=>setTimeout(resolve,1500+expanded.length*80));
    result.push(...decode(values)); offset+=logical.length;
  }
  return result;
}
/** Each synchronous pass is atomic. An unresolved die suspends the command,
 * rolls back DB/transient effects, and resumes with the actual settled faces.
 * No transaction or database lock is held while the physics runs. */
export async function runLiveCommand(run:()=>void,publish:(f:LiveDiceFrame)=>void,meta:LiveRollMeta,roll=physicalFaces){
 const tape:{sides:number[];faces:number[]}[]=[];
 for(;;){
  let cursor=0;const undoHp=checkpointHpFx(),undoReactions=checkpointReactions();
  try{
   const pass=db.transaction(()=>stageRollEffects(()=>withDiceSource((sides,info)=>{
    if(!sides.length)return [];
    const recorded=tape[cursor++];
    if(!recorded)throw new NeedDice(sides,info,stagedRollFacing());
    if(recorded.sides.join(',')!==sides.join(','))throw new Error('Roll context changed before completion');
    return recorded.faces.slice();
   },()=>{run();if(cursor!==tape.length)throw new Error('Roll context changed before completion');})))();
   for(const effect of pass.effects)effect();return;
  }catch(e){
   undoHp();undoReactions();
   if(!(e instanceof NeedDice))throw e;
   // The validated roll is about to start. Persist only its presentation turn;
   // HP, slots and dice outcomes remain rolled back until the command commits.
   let turned=false;
   for(const facing of e.facing)turned=faceTokenToward(facing.sessionId,facing.attackerTokenId,facing.targetTokenId)||turned;
   if(turned)meta.onFacing?.();
   tape.push({sides:e.sides,faces:await roll(e.sides,publish,meta,undefined,e.info)});
  }
 }
}
