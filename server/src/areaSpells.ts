import {partySpell} from '../../shared/partySpells.js';
import {syncPassWithoutTrace} from './partySpellEffects.js';
import {spellAreaFor,pointInSpellArea,areaOrigin,type SpellAreaPlacement} from '../../shared/spellAreas.js';
import type {Character,Monster,SheetAbility,TokenKind} from '../../shared/types.js';
import {tokenDistanceFt} from '../../shared/distance.js';
import {hasLineOfSight} from '../../shared/mapWalls.js';
import {withDiceSource,usingPhysicalDice} from '../../shared/dice.js';
import {getMap,getCharacter,getMonster,getSessionById,listTokens,listRollLog,setRollApply,setRollReveal,isDeadEntity,addMeasurement,addRollLog} from './sessions.js';
import {resolveForcedSave,areaSaveRequest} from './combat.js';
import {rollSaveBatch} from './saveDiceBatch.js';

export function areaPlacementError(sid:string,kind:TokenKind,id:string,a:SheetAbility,level:number|undefined,p:SpellAreaPlacement):string|undefined{
 const spec=spellAreaFor(a,level),map=p&&getMap(p.mapId);
 if(!spec||!map||map.sessionId!==sid||getSessionById(sid)?.activeMapId!==map.id)return 'Choose an area on the active map.';
 const actor=listTokens(map.id).find(t=>t.kind===kind&&t.refId===id);
 if(!actor)return 'Place your caster on this map first.';
 if(!Array.isArray(p.points)||!p.points.length||p.points.length>(spec.count??1)||!Number.isFinite(p.angle)||
   p.points.some(q=>!q||!Number.isFinite(q.x)||!Number.isFinite(q.y))||
   [p.excluded,p.selected].some(ids=>ids!==undefined&&(!Array.isArray(ids)||ids.length>10000||ids.some(id=>typeof id!=='string'))))return 'Invalid spell area.';
 if(((p.excluded?.length??0)>0||p.selected!==undefined)&&!spec.selective)return 'This spell affects every creature in its area.';
 for(const q of p.points)if(!spec.self&&(tokenDistanceFt({...actor,widthFt:0},{...q,widthFt:0},map)>spec.rangeFt+1e-6||!hasLineOfSight(actor,q,map.walls)))return `Place ${a.name} within ${spec.rangeFt} feet and outside Total Cover.`;
 if(a.name.trim().toLowerCase()==='fire storm'){
  const px=spec.sizeFt*map.gridSizePx/map.feetPerSquare,visited=new Set([0]);
  for(let changed=true;changed;){changed=false;p.points.forEach((q,i)=>{if(!visited.has(i)&&[...visited].some(j=>{
    const dx=q.x-p.points[j].x,dy=q.y-p.points[j].y,x=Math.abs(dx*Math.cos(p.angle)+dy*Math.sin(p.angle)),y=Math.abs(-dx*Math.sin(p.angle)+dy*Math.cos(p.angle));
    return Math.abs(x-px)<1e-5&&y<1e-5||Math.abs(y-px)<1e-5&&x<1e-5;
  })){visited.add(i);changed=true;}});}
  if(visited.size!==p.points.length)return 'Connect the cubes so they form one continuous area.';
 }
}

/** One confirmed placement, authoritative occupants, one shared save pool.
 * Existing resolution handles each damage type, conditions and HP atomically. */
export function resolvePlacedSpell(sid:string,roller:string,kind:TokenKind,caster:Character|Monster,a:SheetAbility,level:number|undefined,p:SpellAreaPlacement,cast:(placementOnly:boolean)=>boolean):boolean{
 if(areaPlacementError(sid,kind,caster.id,a,level,p))return false;
 const spec=spellAreaFor(a,level)!,map=getMap(p.mapId)!,actor=listTokens(map.id).find(t=>t.kind===kind&&t.refId===caster.id)!,px=map.gridSizePx/map.feetPerSquare;
 const seen=new Set<string>();
 const targets=listTokens(map.id).filter(t=>{
   const e=t.kind==='pc'?getCharacter(t.refId):getMonster(t.refId),key=`${t.kind}:${t.refId}`;
   if(!e||('objectKind'in e&&e.objectKind)||isDeadEntity(t.kind,e)||seen.has(key)||
     spec.excludeCaster&&t.kind===kind&&t.refId===caster.id||p.excluded?.includes(t.id)||spec.selective&&p.selected&&!p.selected.includes(t.id)||!pointInSpellArea(spec,p,actor,t,px))return false;
   if(!p.points.some((_,i)=>hasLineOfSight(areaOrigin(spec,p,actor,px,i),t,map.walls)))return false;
   seen.add(key);return true;
 });
 if(spec.maxTargets&&targets.length>spec.maxTargets)return false;
 const before=new Set(listRollLog(sid).map(r=>r.id));
 if(!cast(!!spec.ongoing&&!spec.initialEffect))return false;
 const entries=listRollLog(sid).filter(r=>!before.has(r.id)),source=[...entries].reverse().find(r=>r.apply);
 const automated=!!source?.apply&&(!spec.ongoing||spec.initialEffect);
 if(partySpell(a)==='pass without trace'){syncPassWithoutTrace(sid);return true;}
 if(automated&&source?.apply){
   const apply=source.apply;
   const requests=apply.save?targets.map(t=>areaSaveRequest(t,apply.save!,apply.dc)).filter((r):r is NonNullable<typeof r>=>!!r):[];
   const saves=requests.length?rollSaveBatch(requests,`${a.name} — ${apply.save} Saving Throws`):[];
   const live=usingPhysicalDice();
   targets.forEach((t,i)=>{
     const out=saves[i];
     if(out)withDiceSource(()=>out.faces,()=>resolveForcedSave(sid,source.id,t.id,undefined,undefined,live));
     else resolveForcedSave(sid,source.id,t.id,undefined,undefined,usingPhysicalDice());
   });
   setRollApply(source.id,undefined);
   if(source.reveal&&!source.reveal.damageMods?.length)setRollReveal(source.id,{...source.reveal,presentedLive:usingPhysicalDice()});
 }
 if(!automated||spec.ongoing){
   // An area is useful for utility/ongoing spells too; do not invent an
   // immediate hit for damage that triggers only on entry or a later turn.
   for(const point of p.points){const origin=spec.self?areaOrigin(spec,p,actor,px):point,len=(spec.kind==='cube'?spec.sizeFt/2:spec.sizeFt)*px;
     addMeasurement(sid,{mapId:map.id,kind:spec.kind==='cone'?'cone':spec.kind==='line'?'line':spec.kind==='cube'?'square':spec.self?'emanation':'circle',
       origin,target:{x:origin.x+Math.cos(p.angle)*len,y:origin.y+Math.sin(p.angle)*len},createdBy:roller,tokenId:spec.self&&spec.kind==='emanation'?actor.id:undefined,
       spellArea:{spec:{...spec,self:false},angle:p.angle}});
   }
   if(source?.apply)setRollApply(source.id,undefined);
   addRollLog(sid,{roller,label:`${a.name} — Area placed`,expr:'Area',total:0,detail:`${a.name}: measured area placed. ${spec.ongoing?'Resolve its entry, turn, movement and ongoing triggers with the DM.':'Resolve any remaining spell effects with the DM.'}`});
 }
 return true;
}
