import type {Character,Condition,Monster,SheetAbility,Token,TokenKind} from '../../shared/types.js';
import type {SpellAreaPlacement} from '../../shared/spellAreas.js';
import {linkedSpellProfile,linkedSpellRoll,mirrorImageCount,spellKey,type LinkedSpellContext} from '../../shared/linkedSpells.js';
import {effectiveStats,saveExtra} from '../../shared/modifiers.js';
import {effectiveDice,spellcastingMod} from '../../shared/spellMath.js';
import {spellcastingKeyFor} from '../../shared/spellExecution.js';
import {saveAdvantage,saveAutoFail} from '../../shared/conditionEffects.js';
import {damageMultiplier} from '../../shared/combatMath.js';
import {rollDice,rollDicePool,withDiceMetadata,usingPhysicalDice} from '../../shared/dice.js';
import {tokenDistanceFt} from '../../shared/distance.js';
import {hasLineOfSight} from '../../shared/mapWalls.js';
import {newId} from './db.js';
import {rollSaveBatch} from './saveDiceBatch.js';
import {applyDamageNoted,noteConcentration,resolveForcedSave,resolveAbilityRoll,resolveMonsterSheetAbility,stanceResistances} from './combat.js';
import {hitEffectSave,turnKey} from './hitFeatures.js';
import {getCharacter,getMonster,getMap,getToken,getSessionById,listTokens,setCondition,clearCondition,setConcentration,addRollLog,queueSpellImpact,isDeadEntity,createSpiritualWeapon,moveToken,wallLimitedMove,faceTokenToward} from './sessions.js';

const entity=(kind:TokenKind,id:string)=>kind==='pc'?getCharacter(id):getMonster(id);
type Fx=NonNullable<Condition['combatEffect']>;

export function spellCondition(ctx:LinkedSpellContext,kind:TokenKind,id:string,label:string,extra:Partial<Fx>={}) {
  const round=getSessionById(entity(kind,id)!.sessionId)?.combatRound??0;
  // A recast replaces this caster's same effect, without removing other spells.
  for(const c of entity(kind,id)?.conditions??[])if(c.combatEffect?.spell===ctx.spell&&c.combatEffect.casterId===ctx.casterId&&!c.isConcentration)clearCondition(kind,id,c.id);
  const c:Condition={id:newId(),label,aura:kind===ctx.casterKind&&id===ctx.casterId?'green':'red',isConcentration:false,
    combatEffect:{casterKind:ctx.casterKind,casterId:ctx.casterId,spell:ctx.spell,castLevel:ctx.castLevel,abilityId:ctx.abilityId,castId:newId(),dc:ctx.dc,
      expiresAt:Date.now()+60000,...(round?{expiresRound:round+10}:{}),...extra}};
  setCondition(kind,id,c);return c;
}

export function startSpellUse(ctx:LinkedSpellContext,a:SheetAbility,targetTokenId?:string) {
  const p=linkedSpellProfile(a)!;
  if(p.concentration)setConcentration(ctx.casterKind,ctx.casterId,a.name);
  const caster=entity(ctx.casterKind,ctx.casterId)!;
  const conc=caster.conditions.find(c=>c.isConcentration);
  const rounds=p.rounds??10,round=getSessionById(caster.sessionId)?.combatRound??0;
  if(p.concentration&&conc)setCondition(ctx.casterKind,ctx.casterId,{...conc,combatEffect:{casterKind:ctx.casterKind,casterId:ctx.casterId,spell:a.name,castLevel:ctx.castLevel,castId:conc.id,expiresAt:Date.now()+rounds*6000,...(round?{expiresRound:round+rounds}:{})}});
  return spellCondition(ctx,ctx.casterKind,ctx.casterId,a.name,{abilityId:a.id,castLevel:ctx.castLevel,targetTokenId,
    spellAction:p.action,concentration:p.concentration,castId:p.concentration?conc!.id:newId(),
    expiresAt:Date.now()+rounds*6000,...(round?{expiresRound:round+rounds}:{}),lastUseTurn:turnKey(caster.sessionId)});
}

export function spiritualWeaponPlacementError(sid:string,kind:TokenKind,id:string,mapId:string,x:number,y:number):string|undefined {
  const map=getMap(mapId),actor=listTokens(mapId).find(t=>t.kind===kind&&t.refId===id);
  if(!map||map.sessionId!==sid||!actor||!Number.isFinite(x)||!Number.isFinite(y))return 'Place your caster on this map first.';
  if(tokenDistanceFt({...actor,widthFt:0},{x,y,widthFt:0},map)>60+1e-6||!hasLineOfSight(actor,{x,y},map.walls))return 'Place Spiritual Weapon within 60 feet and outside Total Cover.';
}

export function summonSpiritualWeapon(ctx:LinkedSpellContext,a:SheetAbility,mapId:string,x:number,y:number){
  const condition=startSpellUse(ctx,a),caster=entity(ctx.casterKind,ctx.casterId)!;
  const token=createSpiritualWeapon(caster.sessionId,mapId,x,y);
  setCondition(ctx.casterKind,ctx.casterId,{...condition,combatEffect:{...condition.combatEffect!,summonTokenId:token.id,lastUseTurn:undefined,
    weaponMoveTurn:turnKey(caster.sessionId),weaponMovedFt:20}});
  setCondition('monster',token.refId,{id:newId(),label:'Spectral force',aura:'blue',isConcentration:false,
    combatEffect:{casterKind:ctx.casterKind,casterId:ctx.casterId,spell:a.name,castLevel:ctx.castLevel,castId:condition.combatEffect!.castId}});
  addRollLog(caster.sessionId,{roller:caster.name,label:a.name,expr:'Summon',total:0,
    detail:'Spiritual Weapon appears. Choose a creature within 5 ft for its immediate attack. On later turns, drag the weapon up to 20 ft and use its Bonus Action attack; no new slot.'});
  return token;
}

/** Ownership comes from a live caster condition, never a client-supplied name. */
export function spiritualWeaponOwner(token:Token){
  const weapon=token.kind==='monster'?getMonster(token.refId):null;
  if(weapon?.modelType!=='spiritual-weapon'||weapon.objectKind!=='other')return;
  const fx=weapon.conditions.find(c=>c.combatEffect?.spell==='Spiritual Weapon')?.combatEffect;
  if(!fx)return;const caster=entity(fx.casterKind,fx.casterId);
  const condition=caster?.conditions.find(c=>c.combatEffect?.summonTokenId===token.id&&c.combatEffect?.castId===fx.castId);
  if(caster&&condition&&caster.conditions.some(c=>c.isConcentration&&c.id===fx.castId)&&caster.sessionId===getMap(token.mapId)?.sessionId)return {caster,kind:fx.casterKind,condition};
}

export function moveSpiritualWeapon(token:Token,x:number,y:number,preview=false){
  const owner=spiritualWeaponOwner(token);if(!owner)return {error:'That spell has ended.'};
  const {caster,condition,kind}=owner,fx=condition.combatEffect!,session=getSessionById(caster.sessionId)!,map=getMap(token.mapId)!;
  if(!Number.isFinite(x)||!Number.isFinite(y))return {error:'Choose a point on the map.'};
  const actor=listTokens(map.id).find(t=>t.kind===kind&&t.refId===caster.id),turn=turnKey(caster.sessionId);
  if(session.activeTurnTokenId&&session.activeTurnTokenId!==actor?.id)return {error:'Move Spiritual Weapon on its caster’s turn.'};
  if(session.activeTurnTokenId&&fx.lastUseTurn===turn)return {error:'The Spiritual Weapon Bonus Action was already used this turn.'};
  const spent=session.activeTurnTokenId&&fx.weaponMoveTurn===turn?fx.weaponMovedFt??0:0;
  const remaining=Math.max(0,20-spent),distance=tokenDistanceFt({...token,widthFt:0},{x,y,widthFt:0},map);
  const factor=distance>remaining?remaining/distance:1,point=wallLimitedMove(token,token.x+(x-token.x)*factor,token.y+(y-token.y)*factor);
  if(preview)return {point};
  const moved=moveToken(token.id,point.x,point.y,true)!;
  setCondition(kind,caster.id,{...condition,combatEffect:{...fx,weaponMoveTurn:turn,weaponMovedFt:spent+tokenDistanceFt({...token,widthFt:0},{...moved,widthFt:0},map)}});
  return {point:moved};
}

/** A hit check destroys exactly one duplicate. Area damage never calls this. */
export function mirrorIntercept(sid:string,attacker:Token,target:Token,roller:string):boolean {
  const defender=entity(target.kind,target.refId),source=entity(attacker.kind,attacker.refId);
  const n=mirrorImageCount(defender?.conditions??[]);if(!n||!defender||!source)return false;
  // Senses are currently prose traits. Only explicit positive ranges bypass.
  const traits=source.abilities.map(a=>`${a.name} ${a.description}`).join(' ');
  const distance=tokenDistanceFt(attacker,target,getMap(target.mapId));
  const sense=/(?:blindsight|truesight)\s*:?\s*(\d+)\s*(?:ft|feet)/ig;
  if(source.conditions.some(c=>spellKey(c.label)==='blinded')||defender.conditions.some(c=>spellKey(c.label)==='invisible')&&!/see invisibility/i.test(traits)||[...traits.matchAll(sense)].some(m=>distance<=Number(m[1])))return false;
  const dice=withDiceMetadata({label:`Mirror Image — ${defender.name}: Duplicate Check`,target:{kind:target.kind,refId:target.refId}},()=>rollDice(`${n}d6`))!;
  const diverted=dice.rolls.some(v=>v>=3),condition=defender.conditions.find(c=>spellKey(c.label)==='mirror image')!;
  if(diverted){if(n===1)clearCondition(target.kind,target.refId,condition.id);else setCondition(target.kind,target.refId,{...condition,combatEffect:{...condition.combatEffect!,duplicates:n-1}});}
  const checkId=newId();
  if(diverted)queueSpellImpact(sid,target.kind,target.refId,'Mirror Image',checkId);
  addRollLog(sid,{roller,label:'Mirror Image',expr:`${n}d6`,total:dice.total,
    detail:`${defender.name}: ${dice.rolls.join(' + ')} — ${diverted?'duplicate takes the hit and disappears':'attack hits the real creature'}; ${n-(diverted?1:0)} duplicates remain.`,
    reveal:{kind:'damage',title:'Mirror Image — Duplicate Check',attacker:source.name,target:defender.name,outcome:'none',
      effectOutcome:diverted?'Duplicate destroyed — no damage to the caster.':'No duplicate intercepts — roll damage normally.',
      damageDice:[{label:'Duplicate checks (3+ intercepts)',value:dice.total,faces:dice.rolls,diceExpression:dice.expr}],damage:dice.total,
      visibilityTarget:{kind:target.kind,refId:target.refId}}},checkId);return diverted;
}

export function sorcerousBonus(ctx:LinkedSpellContext,faces:number[]) {
  const rolls:NonNullable<ReturnType<typeof rollDice>>[]=[];
  let triggers=faces.filter(v=>v===8).length;
  while(triggers>0&&rolls.length<Math.max(0,ctx.modifier)){
    triggers--;const r=withDiceMetadata({label:'Sorcerous Burst — Bonus d8'},()=>rollDice('1d8'))!;rolls.push(r);
    if(r.rolls[0]===8)triggers++;
  }
  return rolls;
}

export function linkedHit(ctx:LinkedSpellContext,target:Token,visualRollId?:string) {
  const key=spellKey(ctx.spell);
  const extra:Partial<Fx>=key==='guiding bolt'?{nextAttackAdvantage:true,untilCasterEnd:true}
    :key==='ray of frost'?{speedReduction:10,untilCasterTurn:true}
    :key==='ray of sickness'?{untilCasterEnd:true}
    :key==='chill touch'?{preventsHealing:true,untilCasterEnd:true}
    :key==='shocking grasp'?{noOpportunityAttacks:true,untilTargetStart:true}:{};
  if(Object.keys(extra).length)spellCondition(ctx,target.kind,target.refId,key==='ray of sickness'?'Poisoned':ctx.spell,{...extra,visualRollId});
  if(key==="melf's acid arrow")spellCondition(ctx,target.kind,target.refId,ctx.spell,{visualRollId,phase:'end',dice:`${ctx.castLevel}d4`,damageType:'acid',once:true});
}

export function linkedDamageComplete(sid:string,roller:string,ctx:LinkedSpellContext,target:Token,amount:number) {
  if(spellKey(ctx.spell)==='vampiric touch'&&amount>0){
    const caster=entity(ctx.casterKind,ctx.casterId)!;
    const heal=Math.floor(amount/2),id=newId();
    const hpNote=heal?applyDamageNoted(ctx.casterKind,ctx.casterId,-heal,undefined,undefined,false,id,ctx.spell):undefined;
    addRollLog(sid,{roller,label:'Vampiric Touch — Healing',expr:'Half Necrotic damage dealt',total:heal,hpNote,
      detail:`${caster.name} regains ${heal} HP from ${amount} Necrotic damage dealt.`,
      reveal:{kind:'damage',title:'Vampiric Touch — Healing',attacker:caster.name,target:caster.name,outcome:'none',damage:heal,damageMods:[{label:'Half Necrotic damage dealt',value:heal}]}} ,id);
  }
  if(spellKey(ctx.spell)==='ice knife')resolveSpellArea(sid,roller,ctx,target,5,`${ctx.castLevel+1}d6`,'cold','DEX','none');
}

/** One shared damage pool and grouped save throw; Ice Knife saves before exploding. */
export function resolveSpellArea(sid:string,roller:string,ctx:LinkedSpellContext,center:Token,radius:number,expression:string,type:string,save:string,saveDamage:'half'|'none'='half') {
  const map=getMap(center.mapId)!,seen=new Set<string>();
  const targets=listTokens(center.mapId).filter(t=>{
    const e=entity(t.kind,t.refId),key=`${t.kind}:${t.refId}`;
    if(!e||('objectKind'in e&&e.objectKind)||seen.has(key)||tokenDistanceFt(t,center,map)>radius+1e-6||!hasLineOfSight(center,t,map.walls))return false;
    seen.add(key);return true;
  });
  const requests=targets.map(t=>{const e=entity(t.kind,t.refId)!,labels=e.conditions.map(c=>c.label);return {target:t,c:{stats:effectiveStats(e).scores,level:e.level,isMonster:t.kind==='monster'},ability:save,dc:ctx.dc,
    mode:saveAdvantage(labels,save).state,proficient:e.saveProficiencies.includes(save),extra:saveExtra(e,save).total,autoFail:!!saveAutoFail(labels,save)};});
  const saveFirst=spellKey(ctx.spell)==='ice knife';
  const rollSaves=()=>rollSaveBatch(requests,`${ctx.spell} — ${save} Saving Throws`);
  const before=saveFirst?rollSaves():undefined;
  const damage=withDiceMetadata({label:`${ctx.spell} — ${type} Damage`},()=>rollDice(expression))!,impactId=newId();
  const addDamageLog=()=>addRollLog(sid,{roller,label:ctx.spell,expr:expression,total:damage.total,detail:`${ctx.spell} → ${entity(center.kind,center.refId)!.name}: ${damage.detail}.`,
    reveal:{presentedLive:usingPhysicalDice(),kind:'damage',title:`${ctx.spell} — ${type} Damage`,attacker:ctx.spell,target:entity(center.kind,center.refId)!.name,outcome:'none',damage:damage.total,damageType:type,
      damageDice:[{label:type,value:damage.total,faces:damage.rolls,diceExpression:expression}]}},impactId);
  if(!saveFirst)addDamageLog();
  const saves=before??rollSaves();
  requests.forEach((r,i)=>{
    const e=entity(r.target.kind,r.target.refId)!,out=saves[i],total=out.total+r.extra,pass=!r.autoFail&&total>=ctx.dc;
    const amount=Math.floor((pass?(saveDamage==='none'?0:Math.floor(damage.total/2)):damage.total)*damageMultiplier(type,[...e.resistances,...stanceResistances(r.target.kind,e.id)],e.weaknesses,e.immunities,{magical:true}));
    const hpNote=applyDamageNoted(r.target.kind,e.id,amount,type,{kind:ctx.casterKind,refId:ctx.casterId},false,impactId,ctx.spell);noteConcentration(sid,r.target.kind,e.id,amount);
    addRollLog(sid,{roller,label:`${ctx.spell}: ${save} save`,expr:`${save} save`,total,hpNote,hideMods:r.target.kind==='monster'&&('disposition'in e&&e.disposition!=='friendly'),
      detail:`${e.name}: ${save} save ${total} — ${pass?'PASS':'FAIL'}; ${amount} ${type} damage.`,
      reveal:{presentedLive:usingPhysicalDice(),kind:'check',title:`${ctx.spell} — ${save} Saving Throw`,attacker:e.name,target:e.name,outcome:pass?'pass':'fail',d20:out.face,attackTotal:total,toHit:[{label:`${save} save modifiers`,value:total-out.face}],effectOutcome:`${pass?'Save passed':'Save failed'} — ${amount} ${type} damage.`,visibilityTarget:{kind:r.target.kind,refId:e.id}}});
  });if(saveFirst)addDamageLog();queueSpellImpact(sid,center.kind,center.refId,ctx.spell,impactId,Math.max(map.feetPerSquare,center.widthFt)+radius*2);
}

export function mixedSpellDamage(sid:string,roller:string,ctx:LinkedSpellContext) {
  const key=spellKey(ctx.spell),up=Math.max(0,ctx.castLevel-(key==='ice storm'?4:key==='flame strike'?5:9));
  const terms=key==='ice storm'?[{expr:`${2+up}d10`,type:'bludgeoning'},{expr:'4d6',type:'cold'}]
    :key==='flame strike'?[{expr:`${5+up}d6`,type:'fire'},{expr:`${5+up}d6`,type:'radiant'}]:[{expr:'20d6',type:'fire'},{expr:'20d6',type:'bludgeoning'}];
  const results=terms.map(t=>withDiceMetadata({label:`${ctx.spell} — ${t.type} Damage`},()=>rollDice(t.expr))!);
  const amount=results.reduce((n,r)=>n+r.total,0);
  addRollLog(sid,{roller,label:ctx.spell,expr:terms.map(t=>t.expr).join(' + '),total:amount,detail:`${ctx.spell}: ${terms.map((t,i)=>`${results[i].total} ${t.type}`).join(' + ')}; choose affected creatures, each once.`,
    apply:{amount,dc:ctx.dc,save:'DEX',saveDamage:'half',targetMode:'multiple',owner:ctx.casterKind==='pc'?ctx.casterId:undefined,damagePools:terms.map((t,i)=>({amount:results[i].total,damageType:t.type}))},
    reveal:{kind:'damage',title:`${ctx.spell} — Damage`,attacker:ctx.spell,outcome:'none',damage:amount,damageDice:terms.map((t,i)=>({label:t.type,value:results[i].total,faces:results[i].rolls,diceExpression:t.expr}))}});
}

export function heatMetalDamage(sid:string,roller:string,ctx:LinkedSpellContext,target:Token) {
  const e=entity(target.kind,target.refId)!;
  const dice=withDiceMetadata({label:'Heat Metal — Fire Damage'},()=>rollDice(`${ctx.castLevel}d8`))!,id=newId();
  const amount=Math.floor(dice.total*damageMultiplier('fire',[...e.resistances,...stanceResistances(target.kind,e.id)],e.weaknesses,e.immunities,{magical:true}));
  const hpNote=applyDamageNoted(target.kind,e.id,amount,'fire',{kind:ctx.casterKind,refId:ctx.casterId},false,id,'Heat Metal');noteConcentration(sid,target.kind,e.id,amount);
  addRollLog(sid,{roller,label:'Heat Metal — Damage',expr:dice.expr,total:amount,hpNote,detail:`Heat Metal → ${e.name}: ${amount} Fire damage.`,reveal:{kind:'damage',title:'Heat Metal — Fire Damage',attacker:'Heat Metal',target:e.name,outcome:'none',damage:amount,damageType:'fire',damageDice:[{label:dice.expr,value:dice.total,faces:dice.rolls,diceExpression:dice.expr}],damageMods:amount!==dice.total?[{label:'Fire defense',value:amount-dice.total}]:[]}},id);
  if(amount>0){
    const pass=hitEffectSave(sid,target,'CON',ctx.dc,'Heat Metal');
    const conc=entity(ctx.casterKind,ctx.casterId)!.conditions.find(c=>c.isConcentration)!;
    spellCondition(ctx,target.kind,e.id,'Heat Metal: Heated equipment',{concentration:true,castId:conc.id,attackDisadvantage:true,checkDisadvantage:true,untilCasterTurn:true});
    addRollLog(sid,{roller,label:'Heat Metal — Equipment',expr:'Equipment outcome',total:0,detail:`${e.name}: ${pass?'save passed; may keep holding the item':'save failed; must drop the item if possible'}. If it remains worn/held, attack rolls and ability checks have disadvantage. Use Drop heated item when it is dropped; worn armor cannot simply be dropped.`});
  }
}

export function repeatSpell(sid:string,roller:string,kind:TokenKind,id:string,conditionId:string,targetTokenId?:string,advantage?:'adv'|'dis',area?:SpellAreaPlacement):string|undefined {
  const caster=entity(kind,id),condition=caster?.conditions.find(c=>c.id===conditionId),fx=condition?.combatEffect;
  if(!caster||caster.sessionId!==sid||!fx?.spellAction||!fx.abilityId)return 'That spell is no longer active.';
  if(fx.concentration&&!caster.conditions.some(c=>c.isConcentration&&c.id===fx.castId))return 'Concentration ended.';
  const round=getSessionById(sid)?.combatRound??0;
  if(round?(fx.expiresRound??Infinity)<=round:(fx.expiresAt??Infinity)<=Date.now())return 'That spell has expired.';
  const ability=caster.sheetAbilities.find(a=>a.id===fx.abilityId),p=ability&&linkedSpellProfile(ability);
  if(!ability||!p)return 'The original spell is no longer available.';
  const key=spellKey(ability.name),locked=['witch bolt','heat metal'].includes(key);
  const token=getToken(key==='call lightning'&&area?listTokens(area.mapId).find(t=>t.kind===kind&&t.refId===id)?.id??'':locked?fx.targetTokenId??'':targetTokenId??fx.targetTokenId??'');
  if(!token||getMap(token.mapId)?.sessionId!==sid||token.mapId!==getSessionById(sid)?.activeMapId)return 'Choose a target on the active map.';
  const e=entity(token.kind,token.refId);if(!e||('objectKind'in e&&e.objectKind)||isDeadEntity(token.kind,e))return 'Choose a living creature.';
  const current=turnKey(sid),actor=listTokens(token.mapId).find(t=>t.kind===kind&&t.refId===id);
  if(getSessionById(sid)?.activeTurnTokenId){
    if(getSessionById(sid)?.activeTurnTokenId!==actor?.id)return 'Use this spell action on your turn.';
    if(fx.lastUseTurn===current)return 'This spell action was already used this turn.';
  }
  if(locked&&actor&&(tokenDistanceFt(actor,token,getMap(token.mapId))>60||key==='witch bolt'&&!hasLineOfSight(actor,token,getMap(token.mapId)!.walls)))return 'The linked target is beyond 60 feet or behind Total Cover.';
  if(key==='heat metal'&&fx.itemDropped)return 'The heated item was dropped; there is no creature touching it.';
  if(key==='spiritual weapon'){
    const weapon=getToken(fx.summonTokenId??'');
    if(!weapon||!spiritualWeaponOwner(weapon)||weapon.mapId!==token.mapId)return 'The spectral weapon is no longer on this map.';
    if(tokenDistanceFt(weapon,token,getMap(token.mapId))>5+1e-6||!hasLineOfSight(weapon,token,getMap(token.mapId)!.walls))return 'Choose a creature within 5 feet of Spiritual Weapon, outside Total Cover.';
    faceTokenToward(sid,weapon.id,token.id);
  }
  setCondition(kind,id,{...condition!,combatEffect:{...fx,lastUseTurn:current}});
  const ctx:LinkedSpellContext={spell:ability.name,abilityId:ability.id,casterKind:kind,casterId:id,castLevel:fx.castLevel??p.level,dc:fx.dc??10,modifier:spellcastingMod(effectiveStats(caster).scores,kind==='pc'?spellcastingKeyFor(caster as Character,ability):ability.roll?.castingAbility)};
  if(key==='witch bolt'){
    const r=rollDice('1d12')!,source=addRollLog(sid,{roller,label:'Witch Bolt — Repeat Damage',expr:'1d12',total:r.total,detail:`Witch Bolt → ${e.name}: ${r.detail}`,apply:{amount:r.total,dc:0,damageType:'lightning',targetMode:'single'},reveal:{kind:'damage',title:'Witch Bolt — Bonus Action Damage',attacker:caster.name,target:e.name,outcome:'none',damage:r.total,damageType:'lightning',damageDice:[{label:'1d12',value:r.total,faces:r.rolls,diceExpression:r.expr}]}});resolveForcedSave(sid,source.id,token.id);
  }else if(key==='heat metal')heatMetalDamage(sid,roller,ctx,token);
  else if(key==='call lightning'){
    if(area){const repeat={...ability,linkedReuse:conditionId} as SheetAbility&{linkedReuse:string};
      const ok=kind==='pc'?resolveAbilityRoll(sid,roller,caster as Character,repeat,ctx.castLevel,undefined,undefined,undefined,area):resolveMonsterSheetAbility(sid,roller,caster as Monster,repeat,ctx.castLevel,undefined,undefined,undefined,area);
      if(!ok)return 'Could not place Call Lightning there.';
    }else resolveSpellArea(sid,roller,ctx,token,5,`${ctx.castLevel}d10`,'lightning','DEX');
  }
  else {
    // Skip the initial casting branch and slot spend: this is the existing spell.
    const repeat={...ability,linkedReuse:conditionId} as SheetAbility & {linkedReuse:string};
    if(kind==='pc')resolveAbilityRoll(sid,roller,caster as Character,repeat,ctx.castLevel,advantage,token.id);
    else resolveMonsterSheetAbility(sid,roller,caster as Monster,repeat,ctx.castLevel,advantage,token.id);
  }
  return;
}
