import {advancedSpell,isInvisible,spikeInterval,subtractIntervals} from '../../shared/advancedSpells.js';
import type {AbilityRollPayload,Condition,SheetAbility,Token,TokenKind} from '../../shared/types.js';
import {tokenDistanceFt} from '../../shared/distance.js';
import {hasLineOfSight} from '../../shared/mapWalls.js';
import {rollDicePool,withDiceMetadata} from '../../shared/dice.js';
import {damageMultiplier} from '../../shared/combatMath.js';
import {newId} from './db.js';
import {timedConcentration,applyDamageNoted,noteConcentration,stanceResistances} from './combat.js';
import {getCharacter,getMonster,getMap,listTokens,listCharacters,listMonsters,setCondition,clearCondition,endConcentration,addRollLog,queueSpellImpact,isDeadEntity} from './sessions.js';

const entity=(kind:TokenKind,id:string)=>kind==='pc'?getCharacter(id):getMonster(id);
export function invisibilityError(sid:string,kind:TokenKind,id:string,level:number,ids:string[]):string|undefined {
  const caster=entity(kind,id);if(!caster||caster.sessionId!==sid)return 'The caster is unavailable.';
  if(!Number.isInteger(level)||level<2||level>9||!ids.length||new Set(ids).size!==ids.length||ids.length>level-1)return `Choose up to ${Math.max(1,level-1)} willing creatures for Invisibility.`;
  for(const tokenId of ids){
    const token=listSessionTokens(sid).find(t=>t.id===tokenId),e=token&&entity(token.kind,token.refId),map=token&&getMap(token.mapId),actor=map&&listTokens(map.id).find(t=>t.kind===kind&&t.refId===id);
    if(!token||!e||!actor||!map||isDeadEntity(token.kind,e)||e.curHp<=0||('objectKind'in e&&e.objectKind))return 'Choose living creatures on the caster’s map.';
    if(tokenDistanceFt(actor,token,map)>5+1e-6||!hasLineOfSight(actor,token,map.walls))return 'Invisibility requires touching each target (within 5 ft).';
  }
}
import {listMaps} from './sessions.js';
const listSessionTokens=(sid:string)=>listMaps(sid).flatMap(m=>listTokens(m.id));

export function castInvisibility(sid:string,roller:string,kind:TokenKind,id:string,level:number,ids:string[]){
  const error=invisibilityError(sid,kind,id,level,ids);if(error)return error;
  const effect=timedConcentration(kind,id,'Invisibility',600);if(!effect)return 'The caster cannot concentrate.';
  const tokens=listSessionTokens(sid);
  for(const tokenId of ids){const t=tokens.find(t=>t.id===tokenId)!;
    setCondition(t.kind,t.refId,{id:newId(),label:'Invisible',aura:'green',isConcentration:false,combatEffect:{...effect,concentration:true}});
    queueSpellImpact(sid,t.kind,t.refId,'Invisibility');
  }
  addRollLog(sid,{roller,label:'Invisibility',expr:'Invisibility',total:0,detail:`Invisibility → ${ids.map(id=>{const t=tokens.find(t=>t.id===id)!;return entity(t.kind,t.refId)!.name;}).join(', ')}. Concentration, up to 1 hour. An attack roll, dealing damage, or casting a spell ends it for that creature.`});
}

/** End only this recipient's ordinary Invisibility; other recipients stay invisible. */
export function breakInvisibility(kind:TokenKind,id:string,reason:string){
  const e=entity(kind,id);if(!isInvisible(e))return;
  for(const c of e!.conditions){const fx=c.combatEffect;if(c.label.toLowerCase()!=='invisible'||fx?.spell!=='Invisibility')continue;
    clearCondition(kind,id,c.id);
    addRollLog(e!.sessionId,{roller:e!.name,label:'Invisibility ended',expr:reason,total:0,detail:`${e!.name} becomes visible after ${reason}.`});
    const remains=[...listCharacters(e!.sessionId),...listMonsters(e!.sessionId)].some(v=>v.conditions.some(v=>!v.isConcentration&&v.label.toLowerCase()==='invisible'&&v.combatEffect?.castId===fx.castId));
    if(!remains)endConcentration(fx.casterKind,fx.casterId,'last invisible target became visible');
  }
}

export function castSpikeGrowth(sid:string,roller:string,kind:TokenKind,id:string,a:SheetAbility,p:NonNullable<AbilityRollPayload['area']>){
  if(advancedSpell(a)!=='spike growth')return false;
  const effect=timedConcentration(kind,id,'Spike Growth',100);if(!effect)return false;
  const caster=entity(kind,id)!,conc=caster.conditions.find(c=>c.id===effect.castId)!;
  setCondition(kind,id,{...conc,combatEffect:{...conc.combatEffect!,spikeArea:{mapId:p.mapId,...p.points[0],radiusFt:20,remainders:{}}}});
  addRollLog(sid,{roller,label:'Spike Growth',expr:'Area placed',total:0,detail:'Spike Growth: 20 ft radius of difficult terrain. Moving into or within it deals 2d4 Piercing per 5 ft traveled; shorter moves accumulate. No damage on placement. Concentration, up to 10 minutes.'});
  return true;
}

export function spikeConditions(sid:string):Condition[]{return [...listCharacters(sid),...listMonsters(sid)].flatMap(e=>e.conditions.filter(c=>c.isConcentration&&c.combatEffect?.spikeArea));}
export function spikeMovement(previous:Token,next:Token){
  const map=getMap(previous.mapId),victim=entity(previous.kind,previous.refId);
  if(!map||!victim||isDeadEntity(previous.kind,victim)||'objectKind'in victim&&victim.objectKind)return;
  const px=map.gridSizePx/map.feetPerSquare;
  const covered:[number,number][]=[];
  for(const condition of spikeConditions(map.sessionId)){
    const fx=condition.combatEffect!,zone=fx.spikeArea!;if(zone.mapId!==map.id)continue;
    const interval=spikeInterval(previous,next,zone,zone.radiusFt*px);if(!interval)continue;
    const traveled=subtractIntervals(interval,covered).reduce((n,[lo,hi])=>n+(hi-lo)*Math.max(Math.abs(next.x-previous.x),Math.abs(next.y-previous.y))/px,0);
    covered.push(interval);if(traveled<1e-7)continue;
    const progress=(zone.remainders[previous.id]??0)+traveled,count=Math.floor((progress+1e-6)/5);
    setCondition(fx.casterKind,fx.casterId,{...condition,combatEffect:{...fx,spikeArea:{...zone,remainders:{...zone.remainders,[previous.id]:Math.max(0,progress-count*5)}}}});
    if(!count)continue;
    // Bound each term to the dice parser limit; all dice still share one throw.
    const terms:string[]=[];for(let remaining=count*2;remaining>0;remaining-=100)terms.push(`${Math.min(100,remaining)}d4`);
    const rolls=withDiceMetadata({label:'Spike Growth — Piercing Damage',target:previous},()=>rollDicePool(terms.map(expr=>({expr}))))!;
    const raw=rolls.reduce((n,r)=>n+(r?.total??0),0),current=entity(previous.kind,previous.refId)!,mult=damageMultiplier('piercing',[...current.resistances,...stanceResistances(previous.kind,previous.refId)],current.weaknesses,current.immunities,{magical:true});
    const damage=Math.floor(raw*mult),rollId=newId(),hpNote=applyDamageNoted(previous.kind,previous.refId,damage,'piercing',{kind:fx.casterKind,refId:fx.casterId},false,rollId,'Spike Growth');
    noteConcentration(map.sessionId,previous.kind,previous.refId,damage);
    if(damage>0)breakInvisibility(fx.casterKind,fx.casterId,'dealing Spike Growth damage');
    addRollLog(map.sessionId,{roller:entity(fx.casterKind,fx.casterId)?.name??'Spike Growth',label:'Spike Growth damage',expr:terms.join('+'),total:damage,hpNote,
      detail:`${current.name} travels ${count*5} ft through Spike Growth: ${raw} Piercing${mult!==1?` × ${mult} = ${damage}`:''}. Difficult terrain costs twice the movement.`,
      reveal:{kind:'damage',title:'Spike Growth — Movement Damage',attacker:'Spike Growth',target:current.name,outcome:'none',damage,damageType:'piercing',damageDice:rolls.map(r=>({label:'Spike Growth',value:r!.total,faces:r!.rolls,diceExpression:r!.expr})),damageMods:mult!==1?[{label:'Piercing defense',value:damage-raw}]:[],visibilityTarget:{kind:previous.kind,refId:previous.refId}}},rollId);
  }
}
