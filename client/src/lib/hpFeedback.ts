import type {HpFxEvent} from '../../../shared/types.js';

export const HP_NUMBER_HOLD_MS = 2400;
export const HP_NUMBER_FADE_MS = 1600;
// Read each damage component on the map, then leave the accumulated total up.
// These are cosmetic lifetimes; they do not delay HP or lock the next action.
export const HP_TOTAL_HOLD_MS = 3200;
export const HP_COMPONENT_HOLD_MS = 1000;
export const HP_COMPONENT_FADE_MS = 400;
export const HP_NUMBER_GAP_MS = 40;
const colors:Record<string,string>={
  piercing:'#ff9987',slashing:'#ff7185',bludgeoning:'#ffc18b',fire:'#ffad55',cold:'#8fe4ff',
  lightning:'#fff078',thunder:'#b9b5ff',acid:'#c9f775',poison:'#7ae291',necrotic:'#c49aef',
  radiant:'#ffe8a0',force:'#d1b1ff',psychic:'#ff9ce4',
};
export type HpNumber = {delta:number;label:string;color:string;total?:boolean;startAt?:number};
export type ScheduledHpEvent=HpFxEvent&{id:number;numberStartAt?:number;componentStarts?:number[]};
export const hpImpactId=(event:ScheduledHpEvent)=>event.impact?.id??event.rollId??String(event.id);
const stackId=(event:ScheduledHpEvent)=>event.delta<0?`${event.kind}:${event.refId}:${hpImpactId(event)}`:`heal:${event.id}`;
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
export function hpNumberStacks<T extends ScheduledHpEvent>(events:T[]){
  const groups=new Map<string,{event:T;parts:HpNumber[];events:T[]}>();
  for(const event of events){
    if(!event.delta)continue;
    const id=stackId(event);
    const group=groups.get(id)??{event,parts:[],events:[]};
    group.events.push(event);
    group.parts.push(...hpNumbers(event).map((part,i)=>({...part,...(event.componentStarts?.[i]!==undefined?{startAt:event.componentStarts[i]}:{})})));
    groups.set(id,group);
  }
  return [...groups].map(([id,{event,parts,events}])=>{
    parts.sort((a,b)=>(a.startAt??0)-(b.startAt??0));
    if(event.delta>0)return {id,event,events,numbers:parts};
    const total:HpNumber={delta:parts.reduce((sum,p)=>sum+p.delta,0),label:'Total',color:'#ff5a60',total:true};
    return {id,event,events,numbers:[...parts,total]};
  });
}

/** Each colored part rises into the persistent running total above the head. */
export function hpNumberSequence(numbers:HpNumber[]){
  let delayMs=0;
  const starts=numbers.flatMap(n=>n.startAt===undefined?[]:[n.startAt]);
  const origin=starts.length?Math.min(...starts):0;
  return numbers.filter(number=>!number.total).map(number=>{
    const holdMs=number.total||number.delta>0?HP_NUMBER_HOLD_MS:HP_COMPONENT_HOLD_MS;
    const fadeMs=number.total||number.delta>0?HP_NUMBER_FADE_MS:HP_COMPONENT_FADE_MS;
    if(number.startAt!==undefined)delayMs=number.startAt-origin;
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
  if(total)return total.delayMs+HP_TOTAL_HOLD_MS+HP_NUMBER_FADE_MS;
  const last=hpNumberSequence(numbers).at(-1);
  return last?last.delayMs+last.holdMs+last.fadeMs:0;
}

export function hpStackStart(numbers:HpNumber[],fallback:number){
  const starts=numbers.flatMap(n=>n.startAt===undefined?[]:[n.startAt]);
  return starts.length?Math.min(...starts):fallback;
}
export function hpStackEnd(group:ReturnType<typeof hpNumberStacks>[number]){
  return hpStackStart(group.numbers,group.event.numberStartAt??0)+hpFeedbackDuration(group.numbers);
}
const beatKey=(event:ScheduledHpEvent,number:HpNumber)=>event.impact?.order!==undefined
  ?`strike:${event.impact.order}:${number.label}`:`part:${number.label}`;
/** Shared impacts use shared beats, even when one victim also took a weapon hit.
 * Separately clicked strikes use their authoritative order across all targets. */
export function scheduleHpFeedback<T extends ScheduledHpEvent>(events:T[],now:number,existing:ScheduledHpEvent[]=[]){
  const available=new Map<string,number>(),plans=new Map<string,Map<string,number>>();
  for(const group of hpNumberStacks(existing))available.set(`${group.event.kind}:${group.event.refId}`,
    Math.max(available.get(`${group.event.kind}:${group.event.refId}`)??0,hpStackEnd(group)+HP_NUMBER_GAP_MS));
  for(const event of existing){
    const plan=plans.get(hpImpactId(event))??new Map<string,number>();
    hpNumbers(event).forEach((n,i)=>plan.set(beatKey(event,n),event.componentStarts?.[i]??event.numberStartAt??now));
    plans.set(hpImpactId(event),plan);
  }
  const batches=new Map<string,T[]>();
  for(const event of events){const id=hpImpactId(event),batch=batches.get(id)??[];batch.push(event);batches.set(id,batch);}
  const scheduled=new Map<number,T&{numberStartAt:number;componentStarts:number[]}>();
  for(const [id,batch] of batches){
    const plan=plans.get(id)??new Map<string,number>();
    const base=plan.size?Math.min(...plan.values()):Math.max(now,...batch.map(e=>available.get(`${e.kind}:${e.refId}`)??now));
    // Later manual AoE applications must not reuse a beat that already played.
    // Keep past individual strike beats intact for cumulative click ordering.
    for(const event of batch)for(const part of hpNumbers(event)){
      const key=beatKey(event,part),previous=plan.get(key);
      if(event.impact?.order===undefined&&previous!==undefined&&previous<now-50)plan.set(key,now);
    }
    const ordered=[...batch].sort((a,b)=>(a.impact?.order??0)-(b.impact?.order??0));
    for(const event of ordered)for(const n of hpNumbers(event)){
      const key=beatKey(event,n);
      if(plan.has(key))continue;
      plan.set(key,plan.size?Math.max(now,Math.max(...plan.values())+HP_COMPONENT_HOLD_MS+HP_COMPONENT_FADE_MS+HP_NUMBER_GAP_MS):base);
    }
    for(const event of batch){
      const componentStarts=hpNumbers(event).map(n=>plan.get(beatKey(event,n))!);
      // Area-only geometry uses the same beat as its colored damage components.
      const matching=[...plan].find(([key])=>event.spell&&key.toLowerCase().includes(event.spell.toLowerCase()));
      scheduled.set(event.id,{...event,numberStartAt:componentStarts[0]??matching?.[1]??base,componentStarts});
    }
    plans.set(id,plan);
    for(const group of hpNumberStacks(batch.map(e=>scheduled.get(e.id)!)))available.set(`${group.event.kind}:${group.event.refId}`,hpStackEnd(group)+HP_NUMBER_GAP_MS);
  }
  const result=events.map(event=>scheduled.get(event.id)!);
  const expiresAt=Math.max(now,...hpNumberStacks([...existing,...result]).map(hpStackEnd));
  return {events:result,expiryMs:expiresAt-now+300};
}
