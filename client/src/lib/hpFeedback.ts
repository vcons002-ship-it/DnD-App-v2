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

export type HpNumberPosition={x:number;y:number};
/** Keep each live label in its own space, including adjacent AoE victims.
 * Existing positions stay fixed while later feedback arrives or expires. */
export function placeHpNumbers(items:{id:string;x:number;y:number}[],fontSize:number,
  previous:ReadonlyMap<string,HpNumberPosition>):Map<string,HpNumberPosition>{
  const positions=new Map<string,HpNumberPosition>(),active=new Set(items.map(i=>i.id));
  for(const [id,p] of previous)if(active.has(id))positions.set(id,p);
  const width=fontSize*5.4,height=fontSize*3;
  for(const item of items){
    if(positions.has(item.id))continue;
    let position={x:item.x,y:item.y};
    outer:for(let row=0;row<40;row++)for(const col of [0,-1,1,-2,2]){
      const candidate={x:item.x+col*width,y:item.y-row*height};
      if([...positions.values()].every(p=>Math.abs(p.x-candidate.x)>=width||Math.abs(p.y-candidate.y)>=height)){
        position=candidate;break outer;
      }
    }
    positions.set(item.id,position);
  }
  return positions;
}
