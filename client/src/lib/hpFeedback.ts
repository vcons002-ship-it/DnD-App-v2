import type {HpFxEvent} from '../../../shared/types.js';

export const HP_NUMBER_HOLD_MS = 2400;
export const HP_NUMBER_FADE_MS = 1600;
export const HP_NUMBER_EXPIRY_MS = HP_NUMBER_HOLD_MS + HP_NUMBER_FADE_MS + 300;
const colors:Record<string,string>={
  piercing:'#ff9987',slashing:'#ff7185',bludgeoning:'#ffc18b',fire:'#ffad55',cold:'#8fe4ff',
  lightning:'#fff078',thunder:'#b9b5ff',acid:'#c9f775',poison:'#7ae291',necrotic:'#c49aef',
  radiant:'#ffe8a0',force:'#d1b1ff',psychic:'#ff9ce4',
};
export type HpNumber = {delta:number;label:string;color:string};
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

export type HpNumberPosition={x:number;y:number;slot:number};
/** Small, token-local offsets. Nearby victims never push feedback away from
 * its own creature; live numbers keep their slot as earlier hits expire. */
export function placeHpNumbers(items:{id:string;target:string;x:number;y:number}[],fontSize:number,
  previous:ReadonlyMap<string,HpNumberPosition>):Map<string,HpNumberPosition>{
  const positions=new Map<string,HpNumberPosition>(),slots=new Map<string,Set<number>>();
  for(const item of items){
    const used=slots.get(item.target)??new Set<number>();slots.set(item.target,used);
    const old=previous.get(item.id);if(old)used.add(old.slot);
  }
  for(const item of items){
    const used=slots.get(item.target)!;
    let slot=previous.get(item.id)?.slot??0;
    if(!previous.has(item.id)){while(used.has(slot))slot++;used.add(slot);}
    positions.set(item.id,{slot,x:item.x+[0,-.4,.4][slot%3]*fontSize,
      y:item.y-slot*fontSize*1.05});
  }
  return positions;
}
