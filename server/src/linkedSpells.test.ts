import {describe,it,expect,vi,afterEach} from 'vitest';
import {withDiceSource} from '../../shared/dice.js';
import {effectiveSheetAbility} from '../../shared/spellExecution.js';
import {linkedSpellProfile,mirrorImageCount} from '../../shared/linkedSpells.js';
import {effectiveSpeed,spellActionBlock} from '../../shared/spellBuffs.js';
import type {SheetAbility} from '../../shared/types.js';
import {getSpell} from './spells/srd.js';
import {resolveAbilityRoll,resolveAttack,resolveForcedSave,resolveAttackDamage,resolveCheck} from './combat.js';
import {repeatSpell,moveSpiritualWeapon,spiritualWeaponPlacementError,spiritualWeaponOwner} from './linkedSpells.js';
import {expireTimedSpellEffects,processHitEffects,expireOnCasterTurn} from './hitEffectTurns.js';
import {runLiveCommand} from './liveRolls.js';
import {drainHpFx} from './sessions.js';
import {createSession,createMap,setActiveMap,setManualDamage,createCharacter,createToken,createMonsterTemplate,instantiateMonster,getCharacter,getMonster,getToken,listTokens,listRollLog,setSheetAbility,setCondition,setCombatRound,setActiveTurn,applyDamage,endConcentration,updateMonster,moveToken} from './sessions.js';

afterEach(()=>vi.restoreAllMocks());
const dice=(value:number,fn:()=>unknown)=>withDiceSource(s=>s.map(n=>Math.min(n,value)),fn);
function setup(name:string){
  const session=createSession('Linked spells'),map=createMap(session.id,{name:'Arena'});setActiveMap(session.id,map.id);setManualDamage(session.id,false);
  const caster=createCharacter(session.id,{name:'Mage',className:'Wizard',level:17,maxHp:100,curHp:20,speed:'30 ft.',stats:{STR:10,DEX:10,CON:10,INT:18,WIS:10,CHA:10}});
  const actor=createToken({mapId:map.id,kind:'pc',refId:caster.id,x:100,y:100});
  const template=createMonsterTemplate(session.id,{name:'Enemy',creatureType:'Undead',maxHp:500,armorClass:12,stats:{STR:10,DEX:10,CON:10,INT:10,WIS:10,CHA:10},weapons:[{name:'Sword',kind:'melee',damage:'1d6',attackBonus:100}]});
  const monster=instantiateMonster(template.id)!,target=createToken({mapId:map.id,kind:'monster',refId:monster.id,x:200,y:100});
  const second=instantiateMonster(template.id)!,nearby=createToken({mapId:map.id,kind:'monster',refId:second.id,x:250,y:100});
  const spell:SheetAbility={...getSpell(name)!,id:'spell',source:'srd'};setSheetAbility('pc',caster.id,spell);
  return {session,map,caster,actor,monster,target,second,nearby,spell,cast:(level=spell.level??0,choice?:string)=>resolveAbilityRoll(session.id,'Mage',getCharacter(caster.id)!,spell,level,undefined,target.id,choice),
    fx:()=>getCharacter(caster.id)!.conditions.find(c=>c.combatEffect?.spellAction)!};
}
const monsterHp=(f:ReturnType<typeof setup>)=>getMonster(f.monster.id)!.curHp;
const casterNow=(f:ReturnType<typeof setup>)=>getCharacter(f.caster.id)!;

describe('2024 linked spell profiles',()=>{
  it('presents area damage and save bonuses once in the live group before applying HP',async()=>{
    const f=setup('Call Lightning'),rolls:{sides:number[];label?:string}[]=[];
    await runLiveCommand(()=>{expect(f.cast()).toBe(true);},()=>{}, {label:'Call Lightning',roller:'Mage',className:'Wizard'},async(sides,_publish,_meta,_seed,info)=>{
      expect(monsterHp(f)).toBe(500);
      rolls.push({sides,label:info?.label});return sides.map(s=>s===20?10:4);
    });
    expect(rolls[0]).toMatchObject({sides:[10,10,10],label:expect.stringContaining('Damage')});
    expect(rolls[1]).toMatchObject({sides:[20,20],label:expect.stringContaining('DEX Saving Throws')});
    const log=listRollLog(f.session.id).filter(e=>e.reveal);
    expect(log).toHaveLength(3);expect(log.every(e=>e.reveal?.presentedLive)).toBe(true);
    expect(monsterHp(f)).toBe(488);
  });
  it.each(['Mirror Image','Flame Blade'])('%s emits a casting effect without changing HP',name=>{
    const f=setup(name);expect(f.cast()).toBe(true);
    expect(drainHpFx(f.session.id)).toContainEqual(expect.objectContaining({spell:name,delta:0,refId:f.caster.id}));
    expect(casterNow(f).curHp).toBe(20);
  });
  it('ties Hold Monster restraints to its saving throw and removes them when concentration ends',()=>{
    const f=setup('Hold Monster');dice(1,()=>f.cast());
    const held=getMonster(f.monster.id)!.conditions.find(c=>c.label==='Paralyzed')!;
    const save=listRollLog(f.session.id).find(r=>r.reveal?.kind==='check')!;
    expect(held.combatEffect?.visualRollId).toBe(save.id);
    expect(drainHpFx(f.session.id)).toContainEqual(expect.objectContaining({spell:'Hold Monster',delta:0,rollId:save.id}));
    endConcentration('pc',f.caster.id,'Test concentration ends');
    expect(getMonster(f.monster.id)!.conditions.some(c=>c.label==='Paralyzed')).toBe(false);
  });
  it.each(['Ice Storm','Flame Strike','Meteor Swarm'])('%s keeps its animation identity when typed pools are applied',name=>{
    const f=setup(name);dice(3,()=>f.cast());
    const source=listRollLog(f.session.id).find(r=>r.apply?.damagePools)!;
    dice(1,()=>resolveForcedSave(f.session.id,source.id,f.target.id));
    expect(drainHpFx(f.session.id)).toContainEqual(expect.objectContaining({spell:name,refId:f.monster.id,delta:expect.any(Number),rollId:expect.any(String)}));
  });
  it('a passed Hold Monster save creates no restraint or cosmetic impact',()=>{
    const f=setup('Hold Monster');dice(20,()=>f.cast());
    expect(getMonster(f.monster.id)!.conditions.some(c=>c.label==='Paralyzed')).toBe(false);
    expect(drainHpFx(f.session.id).some(e=>e.spell==='Hold Monster')).toBe(false);
  });
  it.each(['Sorcerous Burst','Ice Knife',"Melf’s Acid Arrow",'Vampiric Touch','Hold Monster','Mirror Image','Heat Metal','Phantasmal Killer','Witch Bolt','Spiritual Weapon','Flame Blade','Call Lightning','Ice Storm','Flame Strike','Meteor Swarm','Guiding Bolt','Ray of Frost','Ray of Sickness','Chill Touch','Shocking Grasp'])('%s is usable from the shipped catalog',name=>{
    const spell={...getSpell(name)!,id:'catalog'};expect(spell.name).toBeTruthy();expect(linkedSpellProfile(spell)).toBeTruthy();expect(effectiveSheetAbility(spell).roll).toBeTruthy();
    expect(linkedSpellProfile({...spell,source:'custom'})).toBeUndefined();expect(linkedSpellProfile({...spell,executionProfile:'manual'})).toBeUndefined();
  });
  it('does not replace authored alternative damage',()=>{
    const f=setup('Vampiric Touch');expect(linkedSpellProfile({...f.spell,roll:{kind:'attack',dice:'8d20',damageType:'fire'}})).toBeUndefined();
  });
  it('preserves authored upcast formulas even for spells with recognized legacy dice',()=>{
    const f=setup('Flame Blade');expect(linkedSpellProfile({...f.spell,roll:{...f.spell.roll!,scaleDice:'8d20'}})).toBeUndefined();
  });
});

describe('Mirror Image hit interception',()=>{
  it('generic spell expiration cannot end Haste recovery before the affected creature completes its next turn',()=>{
    const f=setup('Mirror Image');setCombatRound(f.session.id,1);
    setCondition('pc',f.caster.id,{id:'recovery',label:'Haste lethargy',aura:'red',isConcentration:false,
      combatEffect:{spell:'Haste',casterKind:'pc',casterId:f.caster.id,castId:'previous-haste',lethargyTurnStarted:false,expiresAt:Date.now()+6000}});
    expireTimedSpellEffects(f.session.id);setCombatRound(f.session.id,2);expireTimedSpellEffects(f.session.id);
    expect(casterNow(f).conditions.some(c=>c.label==='Haste lethargy')).toBe(true);
    processHitEffects(f.session.id,f.actor,'start');
    expect(casterNow(f).conditions.some(c=>c.label==='Haste lethargy')).toBe(true);
    processHitEffects(f.session.id,f.actor,'end');
    expect(casterNow(f).conditions.some(c=>c.label==='Haste lethargy')).toBe(false);
  });
  function mirrors(){const f=setup('Mirror Image');expect(f.cast()).toBe(true);return f;}
  it('creates three duplicates without concentration and redirects exactly one per hit',()=>{
    const f=mirrors();expect(mirrorImageCount(casterNow(f).conditions)).toBe(3);expect(casterNow(f).conditions.some(c=>c.isConcentration)).toBe(false);
    dice(6,()=>resolveAttack(f.session.id,'DM',f.target.id,f.actor.id,0));
    expect(mirrorImageCount(casterNow(f).conditions)).toBe(2);expect(casterNow(f).curHp).toBe(20);
    dice(6,()=>resolveAttack(f.session.id,'DM',f.target.id,f.actor.id,0));dice(6,()=>resolveAttack(f.session.id,'DM',f.target.id,f.actor.id,0));
    expect(mirrorImageCount(casterNow(f).conditions)).toBe(0);expect(casterNow(f).curHp).toBe(20);
  });
  it('misses and area/direct damage do not remove duplicates',()=>{
    const f=mirrors();dice(1,()=>resolveAttack(f.session.id,'DM',f.target.id,f.actor.id,0));expect(mirrorImageCount(casterNow(f).conditions)).toBe(3);
    applyDamage('pc',f.caster.id,2);expect(mirrorImageCount(casterNow(f).conditions)).toBe(3);expect(casterNow(f).curHp).toBe(18);
  });
  it('all failed duplicate checks allow normal attack damage',()=>{
    const f=mirrors();withDiceSource(s=>s.map(n=>n===20?10:n===6?2:1),()=>resolveAttack(f.session.id,'DM',f.target.id,f.actor.id,0));
    expect(mirrorImageCount(casterNow(f).conditions)).toBe(3);expect(casterNow(f).curHp).toBe(18);
  });
  it.each(['Blinded','Blindsight','Truesight'])('does not interfere with %s attacks',sense=>{
    const f=mirrors();if(sense==='Blinded')setCondition('monster',f.monster.id,{id:'blind',label:'Blinded',aura:'red',isConcentration:false});
    else updateMonster(f.monster.id,{abilities:[{name:sense,description:`${sense} 60 ft.`}]});
    dice(6,()=>resolveAttack(f.session.id,'DM',f.target.id,f.actor.id,0));expect(mirrorImageCount(casterNow(f).conditions)).toBe(3);expect(casterNow(f).curHp).toBeLessThan(20);
  });
  it('rolls interception live after the hit and commits removal only after those dice settle',async()=>{
    const f=mirrors(),requests:number[][]=[];setManualDamage(f.session.id,true);
    await runLiveCommand(()=>resolveAttack(f.session.id,'DM',f.target.id,f.actor.id,0),()=>{}, {label:'Attack',roller:'DM',className:''},async sides=>{
      requests.push(sides);expect(mirrorImageCount(casterNow(f).conditions)).toBe(3);return sides.map(n=>n===20?15:6);
    });expect(requests).toEqual([[20],[6,6,6]]);expect(mirrorImageCount(casterNow(f).conditions)).toBe(2);expect(listRollLog(f.session.id).some(r=>r.pending)).toBe(false);
  });
  it('expires after a minute even when initiative begins after casting',()=>{
    const f=mirrors();setCombatRound(f.session.id,1);expireTimedSpellEffects(f.session.id);setCombatRound(f.session.id,11);expireTimedSpellEffects(f.session.id);expect(mirrorImageCount(casterNow(f).conditions)).toBe(0);
  });
});

describe('linked damage and saving throws',()=>{
  it('Sorcerous Burst chains maximum rolls up to the casting modifier, including critical base dice',()=>{
    const f=setup('Sorcerous Burst');dice(20,()=>f.cast(0,'fire'));const attack=listRollLog(f.session.id).find(r=>r.label==='Attack')!;
    expect(attack.reveal?.damageDice?.filter(d=>d.label==='Sorcerous Burst bonus')).toHaveLength(4);expect(500-monsterHp(f)).toBe(96);
  });
  it.each([1,15])('Ice Knife explodes on a hit or miss (attack face %i), with grouped saves after damage',face=>{
    const f=setup('Ice Knife');withDiceSource(s=>s.map(n=>n===20?face:4),()=>f.cast(2));
    expect(getMonster(f.second.id)!.curHp).toBe(488); // 3d6, failed DEX; casting DC 18
    const logs=listRollLog(f.session.id);expect(logs.some(r=>r.reveal?.title?.includes('cold Damage'))).toBe(true);
    expect(logs.filter(r=>r.reveal?.title?.includes('DEX Saving Throw'))).toHaveLength(2);
  });
  it('Acid Arrow deals delayed damage once at the end of the target turn, and no delayed damage on a miss',()=>{
    const f=setup("Melf’s Acid Arrow");withDiceSource(s=>s.map(n=>n===20?15:2),()=>f.cast(2));expect(monsterHp(f)).toBe(492);
    dice(2,()=>processHitEffects(f.session.id,f.target,'start'));expect(monsterHp(f)).toBe(492);
    dice(2,()=>processHitEffects(f.session.id,f.target,'end'));expect(monsterHp(f)).toBe(488);
    dice(2,()=>processHitEffects(f.session.id,f.target,'end'));expect(monsterHp(f)).toBe(488);
    const g=setup("Melf’s Acid Arrow");withDiceSource(s=>s.map(n=>n===20?1:2),()=>g.cast(2));expect(monsterHp(g)).toBe(496);expect(getMonster(g.monster.id)!.conditions).toEqual([]);
  });
  it('Vampiric Touch heals half defended damage and repeats without recasting or spending another slot',()=>{
    const f=setup('Vampiric Touch');updateMonster(f.monster.id,{resistances:['necrotic']});withDiceSource(s=>s.map(n=>n===20?15:4),()=>f.cast(3));expect(monsterHp(f)).toBe(494);expect(casterNow(f).curHp).toBe(23);
    const slots=casterNow(f).spellSlots;dice(4,()=>expect(repeatSpell(f.session.id,'Mage','pc',f.caster.id,f.fx().id,f.target.id)).toBeUndefined());expect(casterNow(f).spellSlots).toEqual(slots);
    endConcentration('pc',f.caster.id,'test');expect(repeatSpell(f.session.id,'Mage','pc',f.caster.id,f.fx()?.id??'',f.target.id)).toBeTruthy();
  });
  it('Vampiric Touch deferred damage heals only after the damage click',()=>{
    const f=setup('Vampiric Touch');setManualDamage(f.session.id,true);withDiceSource(s=>s.map(n=>n===20?15:4),()=>f.cast());expect(casterNow(f).curHp).toBe(20);expect(monsterHp(f)).toBe(500);
    const pending=listRollLog(f.session.id).find(r=>r.pending)!;resolveAttackDamage(f.session.id,'Mage',pending.id);expect(casterNow(f).curHp).toBe(26);expect(monsterHp(f)).toBe(488);
  });
  it('Hold Monster affects Undead and releases paralysis after the repeated successful WIS save',()=>{
    const f=setup('Hold Monster');dice(1,()=>f.cast());expect(spellActionBlock(getMonster(f.monster.id)!)).toBe('Hold Monster paralysis');
    dice(20,()=>processHitEffects(f.session.id,f.target,'end'));expect(getMonster(f.monster.id)!.conditions).toEqual([]);
  });
  it('Phantasmal Killer saves before recurring damage; success ends it without another damage roll',()=>{
    const f=setup('Phantasmal Killer');dice(1,()=>f.cast());expect(monsterHp(f)).toBe(496);expect(getMonster(f.monster.id)!.conditions.some(c=>c.combatEffect?.checkDisadvantage)).toBe(true);
    const sides:number[]=[];withDiceSource(s=>{sides.push(...s);return s.map(()=>20);},()=>processHitEffects(f.session.id,f.target,'end'));expect(sides).toEqual([20]);expect(monsterHp(f)).toBe(496);expect(getMonster(f.monster.id)!.conditions).toEqual([]);
    expect(casterNow(f).conditions.some(c=>c.isConcentration)).toBe(false);
  });
  it.each([false,true])('Phantasmal Killer initial save precedes damage with manual damage %s',manual=>{
    const f=setup('Phantasmal Killer');setManualDamage(f.session.id,manual);
    const sides:number[]=[];withDiceSource(s=>{sides.push(...s);return s.map(()=>1);},()=>f.cast());
    expect(sides).toEqual([20,10,10,10,10]);expect(monsterHp(f)).toBe(496);
    expect(getMonster(f.monster.id)!.conditions.some(c=>c.label==='Frightened')).toBe(false);
    const reveals=listRollLog(f.session.id).filter(r=>r.reveal);
    expect(reveals.map(r=>r.reveal!.kind)).toEqual(['check','damage']);
    const source=listRollLog(f.session.id).find(r=>r.apply?.saveFirstDamage)!;
    dice(1,()=>resolveForcedSave(f.session.id,source.id,f.target.id));expect(monsterHp(f)).toBe(496);
    const recurring:number[]=[];withDiceSource(s=>{recurring.push(...s);return s.map(()=>1);},()=>processHitEffects(f.session.id,f.target,'end'));
    expect(recurring).toEqual([20,10,10,10,10]);expect(monsterHp(f)).toBe(492);
  });
  it('Phantasmal Killer initial success still rolls half damage and ends concentration',()=>{
    const f=setup('Phantasmal Killer'),sides:number[]=[];
    withDiceSource(s=>{sides.push(...s);return s.map(n=>n===20?20:3);},()=>f.cast());
    expect(sides).toEqual([20,10,10,10,10]);expect(monsterHp(f)).toBe(494);
    expect(getMonster(f.monster.id)!.conditions).toEqual([]);expect(casterNow(f).conditions.some(c=>c.isConcentration)).toBe(false);
  });
  it('Phantasmal Killer live save shows bonuses before requesting damage and keeps HP atomic',async()=>{
    const f=setup('Phantasmal Killer'),rolls:{sides:number[];label?:string;modifier?:number}[]=[];
    updateMonster(f.monster.id,{stats:{...f.monster.stats,WIS:14},resistances:['psychic']});
    await runLiveCommand(()=>{expect(f.cast(5)).toBe(true);},()=>{}, {label:'Phantasmal Killer',roller:'Mage',className:'Wizard'},async(sides,_publish,_meta,_seed,info)=>{
      expect(monsterHp(f)).toBe(500);rolls.push({sides,label:info?.label,modifier:info?.saveDice?.[0].modifier});
      return sides.map(n=>n===20?1:4);
    });
    expect(rolls).toEqual([{sides:[20],label:expect.stringContaining('Initial WIS Saving Throw'),modifier:2},{sides:[10,10,10,10,10],label:expect.stringContaining('Initial Psychic Damage'),modifier:undefined}]);
    expect(monsterHp(f)).toBe(490);expect(listRollLog(f.session.id).find(r=>r.reveal?.kind==='check')?.reveal?.presentedLive).toBe(true);
  });
  it.each(['Ice Storm','Flame Strike','Meteor Swarm'])('%s defends separate damage types and applies a creature only once',name=>{
    const f=setup(name);updateMonster(f.monster.id,{immunities:['fire'],resistances:['cold','radiant']});dice(2,()=>f.cast());const source=listRollLog(f.session.id).find(r=>r.apply?.damagePools)!;expect(source.apply?.damagePools).toHaveLength(2);
    dice(1,()=>resolveForcedSave(f.session.id,source.id,f.target.id));const hp=monsterHp(f);expect(hp).toBeLessThan(500);expect(hp).toBeGreaterThan(500-source.total);
    const copy=createToken({mapId:f.map.id,kind:'monster',refId:f.monster.id,x:500,y:100});dice(1,()=>resolveForcedSave(f.session.id,source.id,copy.id));expect(monsterHp(f)).toBe(hp);
  });
});

describe('repeat actions and hit riders',()=>{
  it.each([false,true])('Spiritual Weapon is a separate force with its own reach and concentration cleanup (manual damage %s)',manual=>{
    const f=setup('Spiritual Weapon');setManualDamage(f.session.id,manual);
    expect(effectiveSheetAbility(f.spell).summon?.name).toBe('Spiritual Weapon');
    expect(f.cast(3)).toBe(true);expect(monsterHp(f)).toBe(500);
    const token=getToken(f.fx().combatEffect!.summonTokenId!)!,weapon=getMonster(token.refId)!;
    expect(weapon).toMatchObject({objectKind:'other',modelType:'spiritual-weapon',disposition:'friendly'});
    expect(spiritualWeaponOwner(token)?.caster.id).toBe(f.caster.id);
    moveToken(f.target.id,1000,100);
    expect(repeatSpell(f.session.id,'Mage','pc',f.caster.id,f.fx().id,f.target.id)).toMatch(/within 5 feet/);
    expect(listRollLog(f.session.id).filter(r=>r.reveal?.kind==='attack')).toHaveLength(0);
    moveToken(f.target.id,token.x+30,token.y);
    dice(15,()=>expect(repeatSpell(f.session.id,'Mage','pc',f.caster.id,f.fx().id,f.target.id)).toBeUndefined());
    expect(listRollLog(f.session.id).some(r=>r.expr.includes('Spiritual Weapon')&&r.reveal?.kind==='attack')).toBe(true);
    endConcentration('pc',f.caster.id,'Test');expect(getToken(token.id)).toBeNull();expect(getMonster(weapon.id)).toBeNull();
    expect(listTokens(f.map.id).some(t=>t.id===token.id)).toBe(false);
  });
  it('Spiritual Weapon shares one 20-foot movement budget over multiple drags each turn',()=>{
    const f=setup('Spiritual Weapon');setCombatRound(f.session.id,1);setActiveTurn(f.session.id,f.actor.id);
    f.cast();const token=getToken(f.fx().combatEffect!.summonTokenId!)!;
    expect(moveSpiritualWeapon(token,token.x+100,token.y).point?.x).toBe(token.x); // casting turn: placement, not movement
    setCombatRound(f.session.id,2);
    const pxPerFt=f.map.gridSizePx/f.map.feetPerSquare;
    const first=moveSpiritualWeapon(token,token.x+12*pxPerFt,token.y).point!;
    const second=moveSpiritualWeapon(getToken(token.id)!,first.x+30*pxPerFt,first.y).point!;
    expect(second.x-token.x).toBeCloseTo(20*pxPerFt);
    setActiveTurn(f.session.id,f.target.id);
    expect(moveSpiritualWeapon(getToken(token.id)!,second.x+20,second.y).error).toMatch(/caster/);
    expect(spiritualWeaponPlacementError(f.session.id,'pc',f.caster.id,f.map.id,10000,100)).toMatch(/60 feet/);
  });
  it.each(['Witch Bolt','Spiritual Weapon','Flame Blade','Call Lightning','Heat Metal'])('%s exposes the correct repeat action without a new slot',name=>{
    const f=setup(name);dice(15,()=>expect(f.cast()).toBe(true));expect(f.fx()?.combatEffect?.spellAction).toBeTruthy();const slots=casterNow(f).spellSlots;
    dice(15,()=>expect(repeatSpell(f.session.id,'Mage','pc',f.caster.id,f.fx().id,f.target.id)).toBeUndefined());expect(casterNow(f).spellSlots).toEqual(slots);
  });
  it('Witch Bolt remains repeatable after its initial miss and ends if distance or Total Cover breaks the link',()=>{
    const f=setup('Witch Bolt');dice(1,()=>f.cast());expect(monsterHp(f)).toBe(500);dice(4,()=>repeatSpell(f.session.id,'Mage','pc',f.caster.id,f.fx().id));expect(monsterHp(f)).toBe(496);
    expect(drainHpFx(f.session.id)).toContainEqual(expect.objectContaining({spell:'Witch Bolt',delta:-4,refId:f.monster.id}));
    moveToken(f.target.id,900,100);expireTimedSpellEffects(f.session.id);expect(casterNow(f).conditions.some(c=>c.isConcentration)).toBe(false);
  });
  it('repeat actions are once on the caster turn, not on someone else turn',()=>{
    const f=setup('Witch Bolt');setCombatRound(f.session.id,1);setActiveTurn(f.session.id,f.actor.id);dice(1,()=>f.cast());const id=f.fx().id;
    expect(repeatSpell(f.session.id,'Mage','pc',f.caster.id,id)).toMatch(/already used/);setActiveTurn(f.session.id,f.target.id);expect(repeatSpell(f.session.id,'Mage','pc',f.caster.id,id)).toMatch(/your turn/);
    setActiveTurn(f.session.id,f.actor.id);setCombatRound(f.session.id,2);dice(4,()=>expect(repeatSpell(f.session.id,'Mage','pc',f.caster.id,id)).toBeUndefined());
  });
  it('Ray of Frost reduces speed until caster next turn, without permanently changing it',()=>{
    const f=setup('Ray of Frost');updateMonster(f.monster.id,{speed:'30 ft.'});dice(15,()=>f.cast());expect(effectiveSpeed(getMonster(f.monster.id)!)).toBe('20 ft.');expireOnCasterTurn(f.session.id,f.actor);expect(effectiveSpeed(getMonster(f.monster.id)!)).toBe('30 ft.');
  });
  it.each(['Guiding Bolt','Ray of Sickness','Chill Touch'])('%s rider remains through caster next turn, then expires',name=>{
    const f=setup(name);dice(15,()=>f.cast());expect(getMonster(f.monster.id)!.conditions).not.toHaveLength(0);processHitEffects(f.session.id,f.actor,'end');expect(getMonster(f.monster.id)!.conditions).not.toHaveLength(0);
    expireOnCasterTurn(f.session.id,f.actor);processHitEffects(f.session.id,f.actor,'end');expect(getMonster(f.monster.id)!.conditions).toEqual([]);
  });
  it('Chill Touch blocks healing but not an explicit DM correction',()=>{
    const f=setup('Chill Touch');dice(15,()=>f.cast());const hp=monsterHp(f);applyDamage('monster',f.monster.id,-10);expect(monsterHp(f)).toBe(hp);applyDamage('monster',f.monster.id,-10,undefined,false,undefined,{correction:true});expect(monsterHp(f)).toBe(hp+10);
  });
  it('Shocking Grasp blocks only opportunity attacks until target next turn',()=>{
    const f=setup('Shocking Grasp');dice(15,()=>f.cast());expect(getMonster(f.monster.id)!.conditions.some(c=>c.combatEffect?.noOpportunityAttacks)).toBe(true);expect(spellActionBlock(getMonster(f.monster.id)!)).toBeUndefined();processHitEffects(f.session.id,f.target,'start');expect(getMonster(f.monster.id)!.conditions).toEqual([]);
  });
  it('Heat Metal imposes attack/check disadvantage only until caster next turn, preserving the item link',()=>{
    const f=setup('Heat Metal');dice(1,()=>f.cast());const victim=()=>getMonster(f.monster.id)!;expect(victim().conditions.some(c=>c.combatEffect?.attackDisadvantage)).toBe(true);
    dice(10,()=>resolveCheck(f.session.id,'DM','monster',f.monster.id,'STR'));expect(listRollLog(f.session.id).at(-1)?.detail).toMatch(/dis/);
    expireOnCasterTurn(f.session.id,f.actor);expect(victim().conditions.some(c=>c.combatEffect?.attackDisadvantage)).toBe(false);expect(victim().conditions.some(c=>c.combatEffect?.spell==='Heat Metal')).toBe(true);
  });
});
