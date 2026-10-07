import type {HpFxEvent} from '../../../shared/types.js';

export const HP_NUMBER_HOLD_MS = 2400;
export const HP_NUMBER_FADE_MS = 1600;
export const HP_COMPONENT_HOLD_MS = 400;
export const HP_COMPONENT_FADE_MS = 200;
export const HP_NUMBER_GAP_MS = 40;
const colors:Record<string,string>={
  piercing:'#ff9987',slashing:'#ff7185',bludgeoning:'#ffc18b',fire:'#ffad55',cold:'#8fe4ff',
  lightning:'#fff078',thunder:'#b9b5ff',acid:'#c9f775',poison:'#7ae291',necrotic:'#c49aef',
  radiant:'#ffe8a0',force:'#d1b1ff',psychic:'#ff9ce4',
};
export type HpNumber = {delta:number;label:string;color:string;total?:boolean};
/** Parts are only a visual breakdown of the already-applied full delta. */
export function hpNumbers(event:HpFxEvent):HpNumber[]{
  if(!event.delta)return [];
  if(event.delta>0)return [{delta:event.delta,label:'Healing',color:'#62efa0'}];
  const valid=event.damageParts?.filter(p=>Number.isFinite(p.amount)&&p.amount>0);
  const parts=valid?.length&&valid.reduce((sum,p)=>sum+p.amount,0)===-event.delta
    ?valid:[{amount:-event.delta,damageType:event.damageType,spell:event.spell}];
  const combined=new Map<string,typeof parts[number]>();
  for(const part of parts){
    const key=`${part.damageType??''}:${part.spell??''}`,old=combined.get(key);
    combined.set(key,{...part,amount:part.amount+(old?.amount??0)});
  }
  return [...combined.values()].map(p=>{
    const type=p.damageType?.toLowerCase(),name=type?type[0].toUpperCase()+type.slice(1):'Damage';
    return {delta:-p.amount,label:p.spell?`${p.spell}${type?` · ${type}`:''}`:name,
      color:p.spell==='Hail of Thorns'?'#b4f47e':colors[type??'']??'#ff8585'};
  });
}

/** One red total per creature/impact, including both a hit and its AoE rider.
 * Colored parts explain that total; they never apply more HP damage. */
export function hpNumberStacks<T extends HpFxEvent&{id:number}>(events:T[]){
  const groups=new Map<string,{event:T;parts:HpNumber[]}>();
  for(const event of events){
    if(!event.delta)continue;
    const id=event.delta<0?`${event.kind}:${event.refId}:${event.rollId??event.id}`:`heal:${event.id}`;
    const group=groups.get(id)??{event,parts:[]};
    group.parts.push(...hpNumbers(event));groups.set(id,group);
  }
  return [...groups].map(([id,{event,parts}])=>{
    if(event.delta>0)return {id,event,numbers:parts};
    const total:HpNumber={delta:parts.reduce((sum,p)=>sum+p.delta,0),label:'Total',color:'#ff5a60',total:true};
    return {id,event,numbers:[...parts,total]};
  });
}

/** Each colored part rises into the persistent running total above the head. */
export function hpNumberSequence(numbers:HpNumber[]){
  let delayMs=0;
  return numbers.filter(number=>!number.total).map(number=>{
    const holdMs=number.total||number.delta>0?HP_NUMBER_HOLD_MS:HP_COMPONENT_HOLD_MS;
    const fadeMs=number.total||number.delta>0?HP_NUMBER_FADE_MS:HP_COMPONENT_FADE_MS;
    const item={number,delayMs,holdMs,fadeMs};delayMs+=holdMs+fadeMs+HP_NUMBER_GAP_MS;
    return item;
  });
}

export const HP_TOTAL_ARRIVAL_MS = 220;
/** Milestones use defended amounts already applied by the server, never extra HP changes. */
export function hpTotalTimeline(numbers:HpNumber[]){
  let delta=0;
  return hpNumberSequence(numbers).filter(item=>item.number.delta<0).map(item=>({
    delta:delta+=item.number.delta,delayMs:item.delayMs+HP_TOTAL_ARRIVAL_MS,
  }));
}
export function hpFeedbackDuration(numbers:HpNumber[]){
  const total=hpTotalTimeline(numbers).at(-1);
  if(total)return total.delayMs+HP_NUMBER_HOLD_MS+HP_NUMBER_FADE_MS;
  const last=hpNumberSequence(numbers).at(-1);
  return last?last.delayMs+last.holdMs+last.fadeMs:0;
}

/** Queue repeated hits on one creature without delaying other AoE victims. */
export function scheduleHpFeedback<T extends HpFxEvent&{id:number;numberStartAt?:number}>(events:T[],now:number,existing:(HpFxEvent&{id:number;numberStartAt?:number})[]=[]){
  const available=new Map<string,number>(),starts=new Map<string,number>();
  let expiresAt=now;
  for(const {id,event,numbers} of [...hpNumberStacks(existing),...hpNumberStacks(events)]){
    const target=`${event.kind}:${event.refId}`;
    const start=event.numberStartAt??Math.max(now,available.get(target)??now);
    const end=start+hpFeedbackDuration(numbers);
    available.set(target,Math.max(available.get(target)??0,end+HP_NUMBER_GAP_MS));
    starts.set(id,start);expiresAt=Math.max(expiresAt,end);
  }
  return {events:events.map(event=>({...event,numberStartAt:starts.get(event.delta<0?`${event.kind}:${event.refId}:${event.rollId??event.id}`:`heal:${event.id}`)??now})),
    expiryMs:expiresAt-now+300};
}
