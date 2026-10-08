import {liveDiceResultWaitMs,liveCalculationWaitMs,LIVE_DICE_RESULT_HOLD_MS} from '../../shared/dicePresentationTiming.js';
import {randomInt,randomUUID} from 'node:crypto';
import {createLiveWorld} from '../../shared/liveDicePhysics.js';
import {withDiceSource,rollDice,type PhysicalDiceInfo} from '../../shared/dice.js';
import {db} from './db.js';
import {checkpointHpFx,faceTokenToward} from './sessions.js';
import {checkpointReactions} from './reactions.js';
import {stageRollEffects,stagedRollFacing,withLiveCalculationPresenter,resetLiveRollReveal,hasLiveRollReveal,type RollFacing} from './liveRollContext.js';
import type {RollReveal} from '../../shared/types.js';
import type {LiveDiceFrame} from '../../shared/liveDiceTypes.js';
import {LIVE_DICE_PRESENTATION_RATE} from '../../shared/liveDiceTypes.js';
import {matchingDiceTrigger,sorcerousDiceTrigger} from '../../shared/diceTriggers.js';

class NeedDice extends Error {constructor(public sides:number[],public info:PhysicalDiceInfo,public facing:RollFacing[]){super('Waiting for physical dice');}}
class NeedCalculation extends Error {constructor(public key:string,public reveal:RollReveal){super('Waiting for roll calculation');}}
class NeedReading extends Error {}
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

type BurstTray={world:ReturnType<typeof createLiveWorld>;id:string;seq:number;sides:number[];critical:boolean[];capacity:number;parents:number[];links:{from:number;to:number}[]};
type LiveRollMeta={burstTray?:{current?:BurstTray};label:string;roller:string;className:string;dmDice?:boolean;affinity?:'friendly'|'neutral'|'enemy';ready?:(id:string)=>Promise<void>;waitForPresentation?:(id:string,ms:number)=>Promise<void>;onFacing?:()=>void};

export async function physicalFaces(
  sides:number[], publish:(frame:LiveDiceFrame)=>void,
  meta:LiveRollMeta, seed=randomInt(0,0xffffffff), info?:PhysicalDiceInfo,
) {
  if(sides.some(s=>![4,6,8,10,12,20,100].includes(s)))
    throw new UnsupportedPhysicalDice('Live rolls support d4, d6, d8, d10, d12, d20 and d100. Choose one of these dice.');
  const {ready,onFacing,waitForPresentation,burstTray,...displayMeta}=meta;
  if(typeof info?.triggerRule==='object'&&burstTray)return burstFaces(sides,publish,meta,seed,info);
  // A caster initiates these commands, but the saved creatures own the dice.
  // Batches containing NPC saves use the shared DM tray rather than the caster.
  if(info?.saveDice?.some(save=>save.target.kind==='monster')){
    displayMeta.dmDice=true;displayMeta.className='';displayMeta.affinity=undefined;
  }
  const result:number[]=[];
  // Bound each live world to forty physical bodies; keep percentile pairs together.
  for(let offset=0;offset<sides.length;) {
    const logical:number[]=[]; let count=0;
    while(offset+logical.length<sides.length) {
      const side=sides[offset+logical.length], next=side===100?2:1;
      const save=info?.saveDice?.[offset+logical.length];
      if(save&&info?.saveDice&&count>0&&info.saveDice[offset+logical.length-1]?.group!==save.group){
        const groupSize=info.saveDice.slice(offset+logical.length).findIndex(d=>d.group!==save.group);
        if(count+(groupSize<0?info.saveDice.length-offset-logical.length:groupSize)>40)break;
      }
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
      const impacts=world.drainImpacts();
      // Announce on settlement, before the reading hold and command commit.
      // Orb pools fit one tray; never treat a partial chunk as the whole spell.
      const burst=typeof info?.triggerRule==='object'?info.triggerRule:undefined;
      const diceTrigger=state.done&&offset===0&&logical.length===sides.length
        ?info?.triggerRule==='orb-matches'?matchingDiceTrigger(state.values as number[]):burst?sorcerousDiceTrigger(state.values as number[],burst.used,burst.limit,burst.queued):undefined:undefined;
      publish({...state,...(burst?{burstProgress:{used:burst.used,limit:burst.limit}}:{}),...(diceTrigger?{diceTrigger}:{}),poses:state.poses.map(v=>Math.round(v*10000)/10000),...(impacts.length?{impacts}:{}),id,seq:seq++,sides:expanded,sets,critical,percentile,mode:info?.advantage,kept,...(info?.saveDice?{dieOffset:offset}:{}),...displayMeta});
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
    const readingMs=liveDiceResultWaitMs(expanded.length, !!info?.saveDice);
    if(waitForPresentation)await waitForPresentation(id,readingMs);
    else await new Promise(resolve=>setTimeout(resolve,readingMs));
    result.push(...decode(values)); offset+=logical.length;
  }
  return result;
}
/** Sorcerous Burst continues in one authoritative world and one rendered tray. */
async function burstFaces(sides:number[],publish:(frame:LiveDiceFrame)=>void,meta:LiveRollMeta,seed:number,info:PhysicalDiceInfo){
 const burst=info.triggerRule;if(typeof burst!=='object')throw new Error('Missing burst rule');
 const {ready,onFacing,waitForPresentation,burstTray,...display}=meta;
 let tray=burstTray!.current;
 if(burst.used===0){
  const capacity=Math.min(40,sides.length+burst.limit);
  tray={world:createLiveWorld(sides.map((sides,index)=>({sides,value:1,index,set:0})),seed,'bottom',capacity),id:randomUUID(),seq:0,sides:[...sides],critical:sides.map((_,i)=>!!info.criticalDice?.[i]||!!info.critical||info.criticalFrom!==undefined&&i>=info.criticalFrom),capacity,parents:[],links:[]};
  burstTray!.current=tray;
 }
 if(!tray)throw new Error('Missing original burst tray');
 const start=burst.used===0?0:tray.sides.length;
 if(start){
  if(sides.some(side=>side!==8)||sides.length>tray.parents.length)throw new Error('Missing triggering burst dice');
  const parents=tray.parents.splice(0,sides.length);
  parents.forEach((from,i)=>tray.links.push({from,to:start+i}));
  tray.world.appendDice(sides.map((sides,i)=>({sides,value:1,index:start+i,set:0})));
  tray.sides.push(...sides);tray.critical.push(...sides.map(()=>false));
 }
 const current=tray;
 const emit=()=>{
  const state=current.world.snapshot(),faces=state.values.slice(start) as number[];
  const trigger=state.done?sorcerousDiceTrigger(faces,burst.used,burst.limit,burst.queued):undefined;
  const impacts=current.world.drainImpacts();
  publish({...state,...display,id:current.id,seq:current.seq++,sides:[...current.sides],sets:current.sides.map(()=>0),critical:[...current.critical],percentile:current.sides.map(()=>null),burstCapacity:current.capacity,burstLinks:[...current.links],burstProgress:{used:burst.used,limit:burst.limit},...(trigger?{diceTrigger:{...trigger,groups:trigger.groups.map(g=>({...g,indices:g.indices.map(i=>i+start)}))}}:{}),...(impacts.length?{impacts}:{})});
  return state;
 };
 const prepared=start?undefined:ready?.(current.id);emit();await prepared;
 const faces=await new Promise<number[]>((resolve,reject)=>{
  let last=performance.now(),credit=0;
  const timer=setInterval(()=>{try{
   const now=performance.now();credit+=Math.min(.1,(now-last)/1000)*LIVE_DICE_PRESENTATION_RATE;last=now;
   while(credit>=1/120){current.world.advance(1/120);credit-=1/120;if(current.world.snapshot().done)break;}
   const state=emit();if(state.done){clearInterval(timer);resolve(state.values.slice(start) as number[]);}
  }catch(e){clearInterval(timer);reject(e);}},1000/30);
 });
 faces.forEach((face,i)=>{if(face===8)current.parents.push(start+i);});
 // Bursting dice need time to show the link before the next live dice enter.
 const readingMs=liveDiceResultWaitMs(faces.length,false,true);
 if(waitForPresentation)await waitForPresentation(current.id,readingMs);else await new Promise(resolve=>setTimeout(resolve,readingMs));
 return faces;
}
/** Each synchronous pass is atomic. An unresolved die suspends the command,
 * rolls back DB/transient effects, and resumes with the actual settled faces.
 * No transaction or database lock is held while the physics runs. */
export async function runLiveCommand(run:()=>void,publish:(f:LiveDiceFrame,info?:PhysicalDiceInfo)=>void,meta:LiveRollMeta,roll=physicalFaces){
 meta={...meta,burstTray:{}};
 const tape:{sides:number[];faces:number[]}[]=[];
 const calculated=new Set<string>();let lastFrame:LiveDiceFrame|undefined,lastInfo:PhysicalDiceInfo|undefined;
 const needsReading=()=>!!lastFrame?.done&&!lastFrame.calculation&&lastFrame.resultHoldMs===undefined&&!lastInfo?.saveDice&&!lastFrame.burstProgress;
 const holdResult=async()=>{
  if(!needsReading())return;
  lastFrame={...lastFrame!,seq:lastFrame!.seq+1,resultHoldMs:LIVE_DICE_RESULT_HOLD_MS};
  publish(lastFrame,lastInfo);
  if(meta.waitForPresentation)await meta.waitForPresentation(lastFrame.id,LIVE_DICE_RESULT_HOLD_MS);
  else if(roll===physicalFaces)await new Promise(resolve=>setTimeout(resolve,LIVE_DICE_RESULT_HOLD_MS));
 };
 for(;;){
  let cursor=0;const undoHp=checkpointHpFx(),undoReactions=checkpointReactions();
  try{
   const pass=db.transaction(()=>stageRollEffects(()=>withLiveCalculationPresenter((key,reveal)=>{
    if(!lastFrame)return false;
    if(!calculated.has(key))throw new NeedCalculation(key,reveal);
    return true;
   },()=>withDiceSource((sides,info)=>{
    if(!sides.length)return [];
    const recorded=tape[cursor++];
    if(!recorded)throw new NeedDice(sides,info,stagedRollFacing());
    if(recorded.sides.join(',')!==sides.join(','))throw new Error('Roll context changed before completion');
    if(cursor===tape.length)resetLiveRollReveal();
    return recorded.faces.slice();
   },()=>{run();if(cursor!==tape.length)throw new Error('Roll context changed before completion');
    // A rider may have no final reveal (the combined hit was already shown).
    // Roll back before waiting, just as for explicit calculation stages.
    if(needsReading()&&!hasLiveRollReveal())throw new NeedReading();
   }))))();
   for(const effect of pass.effects)effect();return;
  }catch(e){
   undoHp();undoReactions();
   if(e instanceof NeedReading){await holdResult();continue;}
   if(e instanceof NeedCalculation){
    if(lastFrame){
     lastFrame={...lastFrame,seq:lastFrame.seq+1,calculation:{...e.reveal,physical:true}};
     if(meta.burstTray?.current?.id===lastFrame.id)meta.burstTray.current.seq=Math.max(meta.burstTray.current.seq,lastFrame.seq+1);
     publish(lastFrame,lastInfo);
     const ms=liveCalculationWaitMs(e.reveal.damageMods?.length??0);
     if(meta.waitForPresentation)await meta.waitForPresentation(lastFrame.id,ms);
     else if(roll===physicalFaces)await new Promise(resolve=>setTimeout(resolve,ms));
    }
    calculated.add(e.key);continue;
   }
   if(!(e instanceof NeedDice))throw e;
   // Never replace an unmodified throw with a save/rider before it was read.
   await holdResult();
   // The validated roll is about to start. Persist only its presentation turn;
   // HP, slots and dice outcomes remain rolled back until the command commits.
   let turned=false;
   for(const facing of e.facing)turned=faceTokenToward(facing.sessionId,facing.attackerTokenId,facing.targetTokenId)||turned;
   if(turned)meta.onFacing?.();
   tape.push({sides:e.sides,faces:await roll(e.sides,frame=>{lastFrame=frame;lastInfo=e.info;publish(frame,e.info);},{...meta,...(e.info.label?{label:e.info.label}:{})},undefined,e.info)});
  }
 }
}
