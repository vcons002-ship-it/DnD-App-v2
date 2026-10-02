import {afterEach,describe,expect,it,vi} from 'vitest';
import {withDiceSource} from '../../shared/dice.js';
import type {SheetAbility} from '../../shared/types.js';
import {activeHasteCondition,hasHasteLethargy} from '../../shared/spellBuffs.js';
import {registerSocketHandlers} from './socketHandlers.js';
import {dropConn,setConn,type IOServer} from './connections.js';
import {getSpell} from './spells/srd.js';
import {runLiveCommand} from './liveRolls.js';
import {resolveAbilityRoll,resolveForcedSave,resolveAttackDamage} from './combat.js';
import {expireTimedSpellEffects} from './hitEffectTurns.js';
import {
  createSession,createMap,setActiveMap,createCharacter,createToken,createMonsterTemplate,instantiateMonster,
  setSheetAbility,claimCharacter,getCharacter,getMonster,listRollLog,getRollEntry,setCondition,clearCondition,
  setActiveTurn,setCombatRound,setTokenInitiative,endConcentration,applyDamage,setManualDamage,getToken,updateCharacter,clearTokensConditions,listTokens,
} from './sessions.js';

const sockets:string[]=[];
afterEach(()=>{for(const id of sockets.splice(0))dropConn(id);vi.restoreAllMocks();});
function client(sid:string,map:string,role:'player'|'dm'='player') {
  let connect!:(s:unknown)=>void;
  const io={on:(_:string,handler:typeof connect)=>{connect=handler;},to:()=>({emit:()=>{}})};
  registerSocketHandlers(io as unknown as IOServer,{livePhysics:false});
  const handlers=new Map<string,(p:unknown)=>void>(),id=`control-${Math.random()}`,emit=vi.fn();sockets.push(id);
  connect({id,on:(event:string,fn:(p:unknown)=>void)=>handlers.set(event,fn),emit});
  setConn(id,{sessionId:sid,role,viewMapId:map,playerId:null});
  return {id,emit,send:(event:string,p:unknown={})=>handlers.get(event)!(p)};
}
function setup(name='Hold Person',overrides:Partial<SheetAbility>={}) {
  const session=createSession('Controlled spell lifecycle'),map=createMap(session.id,{name:'Arena'});setActiveMap(session.id,map.id);
  setManualDamage(session.id,false);
  const caster=createCharacter(session.id,{name:'Mage',className:'Wizard',level:7,maxHp:30,
    stats:{STR:10,DEX:10,CON:10,INT:16,WIS:10,CHA:10}});
  const actor=createToken({mapId:map.id,kind:'pc',refId:caster.id,x:50,y:50});
  const template=createMonsterTemplate(session.id,{name:'Bandit',creatureType:'Humanoid',maxHp:100,armorClass:12,
    stats:{STR:10,DEX:10,CON:10,INT:10,WIS:10,CHA:10},weapons:[{name:'Sword',kind:'melee',damage:'1d6',attackBonus:100}]});
  const one=instantiateMonster(template.id)!,two=instantiateMonster(template.id)!;
  const a=createToken({mapId:map.id,kind:'monster',refId:one.id,x:100,y:50});
  const b=createToken({mapId:map.id,kind:'monster',refId:two.id,x:150,y:50});
  const spell:SheetAbility={...getSpell(name)!,id:'spell',source:'srd',...overrides};setSheetAbility('pc',caster.id,spell);
  const player=client(session.id,map.id),dm=client(session.id,map.id,'dm');claimCharacter(caster.id,player.id);
  const cast=(p={})=>player.send('ability:roll',{kind:'pc',refId:caster.id,abilityId:spell.id,...p});
  const first=()=>listRollLog(session.id).find(e=>e.apply?.effect?.spell==='Hold Person')!;
  return {session,map,caster,actor,one,two,a,b,spell,player,dm,cast,first};
}
const labels=(id:string)=>getMonster(id)!.conditions.map(c=>c.label);

describe('Hold Person live combat lifecycle',()=>{
  it('initial save paralyzes a Humanoid, spends one slot, and repeats at the end of its turn without recasting',()=>{
    const f=setup();withDiceSource(s=>s.map(()=>1),()=>f.cast({castLevel:2,targetTokenId:f.a.id}));
    expect(getCharacter(f.caster.id)!.spellSlots.L2.used).toBe(1);
    expect(labels(f.one.id)).toEqual(expect.arrayContaining(['Paralyzed','Incapacitated']));
    const parent=getMonster(f.one.id)!.conditions.find(c=>c.label==='Paralyzed')!;
    expect(parent.combatEffect).toMatchObject({casterId:f.caster.id,spell:'Hold Person',save:'WIS',phase:'end',dc:14});
    expect(f.first().apply?.consumedTargets).toEqual([f.a.id]);
    expect(listRollLog(f.session.id).at(-1)!.reveal?.effectOutcome).toMatch(/Paralyzed/);
    setCombatRound(f.session.id,1);setTokenInitiative(f.a.id,20);setTokenInitiative(f.actor.id,10);setActiveTurn(f.session.id,f.a.id);
    withDiceSource(s=>s.map(()=>20),()=>f.dm.send('initiative:next'));
    expect(labels(f.one.id)).not.toContain('Paralyzed');expect(labels(f.one.id)).not.toContain('Incapacitated');
    expect(getCharacter(f.caster.id)!.spellSlots.L2.used).toBe(1);
    expect(listRollLog(f.session.id).at(-1)!.reveal).toMatchObject({outcome:'pass',title:'Hold Person - WIS Saving Throw'});
    expect(listRollLog(f.session.id).at(-1)!.reveal?.effectOutcome).toMatch(/ends/);
  });

  it('upcasting caps distinct targets and a second token for one creature cannot grant another save',()=>{
    const f=setup();withDiceSource(s=>s.map(()=>1),()=>f.cast({castLevel:3,targetTokenId:f.a.id}));
    const roll=f.first();expect(roll.apply?.maxTargets).toBe(2);
    const duplicate=createToken({mapId:f.map.id,kind:'monster',refId:f.one.id,x:250,y:50});
    f.player.send('save:resolve',{rollId:roll.id,tokenId:duplicate.id});
    expect(getRollEntry(roll.id,f.session.id)!.apply?.consumedTargets).toEqual([f.a.id]);
    expect(f.player.emit).toHaveBeenCalledWith('notice',expect.objectContaining({message:expect.stringContaining('already saved')}));
    withDiceSource(s=>s.map(()=>20),()=>f.player.send('save:resolve',{rollId:roll.id,tokenId:f.b.id}));
    expect(getRollEntry(roll.id,f.session.id)!.apply?.consumedTargets).toEqual([f.a.id,f.b.id]);
    expect(labels(f.two.id)).not.toContain('Paralyzed');
    const third=instantiateMonster(createMonsterTemplate(f.session.id,{name:'Third',creatureType:'Humanoid',maxHp:20}).id)!;
    const t=createToken({mapId:f.map.id,kind:'monster',refId:third.id,x:300,y:50});
    withDiceSource(()=>{throw new Error('spent casting must not roll');},()=>f.player.send('save:resolve',{rollId:roll.id,tokenId:t.id}));
    expect(getMonster(third.id)!.conditions).toEqual([]);expect(getCharacter(f.caster.id)!.spellSlots.L3.used).toBe(1);
  });

  it('rejects beasts and objects before rolling, concentrating, or spending slots',()=>{
    const f=setup(),beast=instantiateMonster(createMonsterTemplate(f.session.id,{name:'Wolf',creatureType:'Beast',maxHp:20}).id)!;
    const target=createToken({mapId:f.map.id,kind:'monster',refId:beast.id,x:200,y:50});
    withDiceSource(()=>{throw new Error('ineligible creature must not roll');},()=>f.cast({castLevel:2,targetTokenId:target.id}));
    expect(getCharacter(f.caster.id)!.spellSlots.L2.used).toBe(0);expect(getCharacter(f.caster.id)!.conditions).toEqual([]);
    expect(listRollLog(f.session.id)).toEqual([]);
    expect(f.player.emit).toHaveBeenCalledWith('notice',expect.objectContaining({message:expect.stringContaining('Humanoids')}));
  });

  it('keeps an independent Incapacitated chip when a repeated save removes the spell bundle',()=>{
    const f=setup();setCondition('monster',f.one.id,{id:'independent',label:'Incapacitated',aura:'red',isConcentration:false});
    withDiceSource(s=>s.map(()=>1),()=>f.cast({castLevel:2,targetTokenId:f.a.id}));
    setCombatRound(f.session.id,1);setActiveTurn(f.session.id,f.a.id);
    withDiceSource(s=>s.map(()=>20),()=>setActiveTurn(f.session.id,f.actor.id));
    expect(getMonster(f.one.id)!.conditions).toEqual([expect.objectContaining({id:'independent',label:'Incapacitated'})]);
  });

  it('cleans up on concentration loss and blocks stale targeting buttons even after recasting the same spell',()=>{
    const f=setup();withDiceSource(s=>s.map(()=>1),()=>f.cast({castLevel:3,targetTokenId:f.a.id}));
    const old=f.first();withDiceSource(s=>s.map(()=>1),()=>f.cast({castLevel:3,targetTokenId:f.b.id}));
    expect(labels(f.one.id)).not.toContain('Paralyzed');expect(labels(f.two.id)).toContain('Paralyzed');
    withDiceSource(()=>{throw new Error('old cast must not roll');},()=>f.player.send('save:resolve',{rollId:old.id,tokenId:f.a.id}));
    expect(labels(f.one.id)).not.toContain('Paralyzed');
    applyDamage('pc',f.caster.id,30);
    expect(labels(f.two.id)).not.toContain('Paralyzed');expect(labels(f.two.id)).not.toContain('Incapacitated');
  });

  it('expires after ten combat rounds and outside combat after a minute',()=>{
    const f=setup();setCombatRound(f.session.id,2);
    withDiceSource(s=>s.map(()=>1),()=>f.cast({castLevel:2,targetTokenId:f.a.id}));
    setCombatRound(f.session.id,12);expireTimedSpellEffects(f.session.id);
    expect(labels(f.one.id)).not.toContain('Paralyzed');expect(getCharacter(f.caster.id)!.conditions.some(c=>c.isConcentration)).toBe(false);
    const g=setup(),now=Date.now();vi.spyOn(Date,'now').mockReturnValue(now);
    withDiceSource(s=>s.map(()=>1),()=>g.cast({castLevel:2,targetTokenId:g.a.id}));
    vi.spyOn(Date,'now').mockReturnValue(now+60_001);expireTimedSpellEffects(g.session.id);
    expect(labels(g.one.id)).not.toContain('Paralyzed');
  });

  it('a live repeat save holds its condition writes until authoritative faces settle, then removes the bundle once',async()=>{
    const f=setup();withDiceSource(s=>s.map(()=>1),()=>f.cast({castLevel:2,targetTokenId:f.a.id}));
    setCombatRound(f.session.id,1);setActiveTurn(f.session.id,f.a.id);
    const requests:number[][]=[];
    await runLiveCommand(()=>setActiveTurn(f.session.id,f.actor.id),()=>{},
      {label:'Next turn',roller:'DM',className:''},async sides=>{
        requests.push(sides);expect(labels(f.one.id)).toContain('Paralyzed');return sides.map(()=>20);
      });
    expect(requests).toEqual([[20]]);expect(labels(f.one.id)).not.toContain('Paralyzed');
    expect(listRollLog(f.session.id).filter(e=>e.reveal?.title==='Hold Person - WIS Saving Throw')).toHaveLength(1);
    expect(getCharacter(f.caster.id)!.spellSlots.L2.used).toBe(1);
  });

  it('preserves custom Hold Person rolls rather than forcing Humanoid control mechanics',()=>{
    const f=setup('Hold Person',{source:'custom',roll:{kind:'damage',dice:'1d6',targetMode:'single'}});
    withDiceSource(s=>s.map(()=>4),()=>f.cast({castLevel:2,targetTokenId:f.a.id}));
    expect(getMonster(f.one.id)!.curHp).toBe(96);expect(labels(f.one.id)).not.toContain('Paralyzed');
  });

  it('a downed living PC remains paralyzed; ending concentration preserves the separately owned downed bundle',()=>{
    const f=setup(),ally=createCharacter(f.session.id,{name:'Ally',className:'Fighter',level:3,maxHp:20,curHp:20,stats:{WIS:10}});
    const token=createToken({mapId:f.map.id,kind:'pc',refId:ally.id,x:250,y:100});
    withDiceSource(s=>s.map(()=>1),()=>f.cast({castLevel:2,targetTokenId:token.id}));
    applyDamage('pc',ally.id,20);expireTimedSpellEffects(f.session.id);
    expect(getCharacter(ally.id)!.deathSaves.failures).toBe(0);
    expect(getCharacter(ally.id)!.conditions.map(c=>c.label)).toContain('Paralyzed');
    endConcentration('pc',f.caster.id,'ended');
    const after=getCharacter(ally.id)!;
    expect(after.conditions.map(c=>c.label)).not.toContain('Paralyzed');
    expect(after.conditions).toEqual(expect.arrayContaining([
      expect.objectContaining({label:'Unconscious',source:'down'}),expect.objectContaining({label:'Incapacitated',source:'down'}),
      expect.objectContaining({label:'Prone',source:'down'}),
    ]));
  });

  it('clearing all caster conditions releases the linked target spell, including across maps',()=>{
    const f=setup();withDiceSource(s=>s.map(()=>1),()=>f.cast({castLevel:2,targetTokenId:f.a.id}));
    const another=createMap(f.session.id,{name:'Different room'});setActiveMap(f.session.id,another.id);
    clearTokensConditions([f.actor.id]);
    expect(getCharacter(f.caster.id)!.conditions).toEqual([]);expect(labels(f.one.id)).not.toContain('Paralyzed');
  });

  it('blocks linked-paralysis attacks, casts, summons, and player movement while preserving checks and the repeated save',()=>{
    const f=setup(),victim=createCharacter(f.session.id,{name:'Held wizard',className:'Wizard',level:3,maxHp:20,stats:{INT:16,WIS:10},
      weapons:[{name:'Sword',kind:'melee',damage:'1d6',attackBonus:100}]});
    const token=createToken({mapId:f.map.id,kind:'pc',refId:victim.id,x:300,y:150});
    const owner=client(f.session.id,f.map.id);claimCharacter(victim.id,owner.id);
    setSheetAbility('pc',victim.id,{...getSpell('Misty Step')!,id:'misty',source:'srd'});
    setSheetAbility('pc',victim.id,{...getSpell('Mage Hand')!,id:'hand',source:'srd'});
    const stance:SheetAbility={id:'stance',name:'Test stance',type:'stance',source:'custom',description:'',stance:{active:false,appliesTo:'all'}};
    setSheetAbility('pc',victim.id,stance);
    withDiceSource(s=>s.map(()=>1),()=>f.cast({castLevel:2,targetTokenId:token.id}));
    const count=listRollLog(f.session.id).length,tokenCount=listTokens(f.map.id).length,before=getToken(token.id)!;
    withDiceSource(()=>{throw new Error('Paralysis cannot start an attack or cast');},()=>{
      owner.send('combat:attack',{attackerTokenId:token.id,targetTokenId:f.a.id,weaponIndex:0});
      owner.send('ability:roll',{kind:'pc',refId:victim.id,abilityId:'misty',castLevel:2});
      owner.send('summon:cast',{kind:'pc',refId:victim.id,abilityId:'hand',mapId:f.map.id,x:400,y:400});
      owner.send('token:move',{tokenId:token.id,x:400,y:400});
      owner.send('token:drag',{tokenId:token.id,x:400,y:400});
      owner.send('ability:set',{kind:'pc',refId:victim.id,ability:{...stance,stance:{active:true}}});
    });
    expect(listRollLog(f.session.id)).toHaveLength(count);expect(listTokens(f.map.id)).toHaveLength(tokenCount);
    expect(getCharacter(victim.id)!.spellSlots.L2.used).toBe(0);expect(getToken(token.id)).toMatchObject({x:before.x,y:before.y});
    expect(getCharacter(victim.id)!.sheetAbilities.find(a=>a.id===stance.id)?.stance?.active).toBe(false);
    expect(owner.emit).toHaveBeenCalledWith('notice',expect.objectContaining({message:expect.stringContaining('Hold Person')}));
    withDiceSource(s=>s.map(()=>10),()=>owner.send('check:roll',{kind:'pc',refId:victim.id,ability:'INT'}));
    expect(listRollLog(f.session.id).at(-1)!).toMatchObject({label:'INT check',total:13});
    // The DM can still correct placement, and the victim can end their turn to
    // make its normal end-of-turn Wisdom save despite being unable to act.
    f.dm.send('token:move',{tokenId:token.id,x:400,y:400});expect(getToken(token.id)).toMatchObject({x:400,y:400});
    setCombatRound(f.session.id,1);setTokenInitiative(token.id,20);setTokenInitiative(f.actor.id,10);setActiveTurn(f.session.id,token.id);
    withDiceSource(s=>s.map(()=>20),()=>owner.send('initiative:endTurn'));
    expect(getCharacter(victim.id)!.conditions.map(c=>c.label)).not.toContain('Paralyzed');
    expect(listRollLog(f.session.id).at(-1)!.reveal?.outcome).toBe('pass');
  });
});

describe('Haste lifecycle and restricted action',()=>{
  it('provides derived benefits, tracks one extra action, and resets that action on the target turn',()=>{
    const f=setup('Haste');f.cast({castLevel:3,targetTokenId:f.a.id});
    setCombatRound(f.session.id,1);setActiveTurn(f.session.id,f.a.id);
    f.dm.send('haste:action',{kind:'monster',refId:f.one.id,action:'dash'});
    expect(activeHasteCondition(getMonster(f.one.id)!)?.combatEffect?.hasteActionUsed).toBe('dash');
    const before=listRollLog(f.session.id).length;
    f.dm.send('haste:action',{kind:'monster',refId:f.one.id,action:'hide'});
    expect(listRollLog(f.session.id)).toHaveLength(before);
    setActiveTurn(f.session.id,f.actor.id);setActiveTurn(f.session.id,f.a.id);
    expect(activeHasteCondition(getMonster(f.one.id)!)?.combatEffect?.hasteActionUsed).toBeUndefined();
    withDiceSource(s=>s.map(()=>1),()=>f.dm.send('combat:attack',{attackerTokenId:f.a.id,targetTokenId:f.b.id,weaponIndex:0,hasteAction:true}));
    expect(activeHasteCondition(getMonster(f.one.id)!)?.combatEffect?.hasteActionUsed).toBe('attack');
    expect(listRollLog(f.session.id).at(-1)!.reveal?.outcome).toBe('fumble');
  });

  it('ending Haste during the target turn keeps lethargy through the end of its next turn',()=>{
    const f=setup('Haste');f.cast({castLevel:3,targetTokenId:f.a.id});
    setCombatRound(f.session.id,1);setActiveTurn(f.session.id,f.a.id);
    endConcentration('pc',f.caster.id,'ended');
    expect(activeHasteCondition(getMonster(f.one.id)!)).toBeUndefined();expect(hasHasteLethargy(getMonster(f.one.id)!)).toBe(true);
    setActiveTurn(f.session.id,f.actor.id);expect(hasHasteLethargy(getMonster(f.one.id)!)).toBe(true);
    setActiveTurn(f.session.id,f.a.id);expect(hasHasteLethargy(getMonster(f.one.id)!)).toBe(true);
    setActiveTurn(f.session.id,f.actor.id);expect(hasHasteLethargy(getMonster(f.one.id)!)).toBe(false);
    expect(labels(f.one.id)).not.toContain('Incapacitated');
  });

  it('blocks attacks and movement while lethargic and preserves independent conditions when it ends',()=>{
    const f=setup('Haste');f.cast({castLevel:3,targetTokenId:f.actor.id});
    setCondition('pc',f.caster.id,{id:'independent',label:'Incapacitated',aura:'red',isConcentration:false});
    // Applying Incapacitated ends concentration, which also ends the linked Haste.
    expect(hasHasteLethargy(getCharacter(f.caster.id)!)).toBe(true);
    const before=getToken(f.actor.id)!,count=listRollLog(f.session.id).length;
    f.player.send('token:move',{tokenId:f.actor.id,x:400,y:400});
    f.player.send('combat:attack',{attackerTokenId:f.actor.id,targetTokenId:f.a.id,weaponIndex:0});
    expect(getToken(f.actor.id)).toMatchObject({x:before.x,y:before.y});expect(listRollLog(f.session.id)).toHaveLength(count);
    setCombatRound(f.session.id,1);setActiveTurn(f.session.id,f.actor.id);setActiveTurn(f.session.id,f.a.id);
    expect(hasHasteLethargy(getCharacter(f.caster.id)!)).toBe(false);
    expect(getCharacter(f.caster.id)!.conditions).toContainEqual(expect.objectContaining({id:'independent',label:'Incapacitated'}));
  });

  it('rejects another player and off-turn extra-action requests without spending the affected creature action',()=>{
    const f=setup('Haste');f.cast({castLevel:3,targetTokenId:f.actor.id});setCombatRound(f.session.id,1);setActiveTurn(f.session.id,f.a.id);
    f.player.send('haste:action',{kind:'pc',refId:f.caster.id,action:'hide'});
    expect(activeHasteCondition(getCharacter(f.caster.id)!)?.combatEffect?.hasteActionUsed).toBeUndefined();
    setActiveTurn(f.session.id,f.actor.id);const stranger=client(f.session.id,f.map.id);
    stranger.send('haste:action',{kind:'pc',refId:f.caster.id,action:'dash'});
    expect(activeHasteCondition(getCharacter(f.caster.id)!)?.combatEffect?.hasteActionUsed).toBeUndefined();
    f.player.send('haste:action',{kind:'pc',refId:f.caster.id,action:'disengage'});
    expect(activeHasteCondition(getCharacter(f.caster.id)!)?.combatEffect?.hasteActionUsed).toBe('disengage');
  });

  it('does not resurrect a Haste buff if its extra attack drops the concentrating caster',()=>{
    const f=setup('Haste');updateCharacter(f.caster.id,{curHp:1});f.cast({castLevel:3,targetTokenId:f.a.id});
    setCombatRound(f.session.id,1);setActiveTurn(f.session.id,f.a.id);
    withDiceSource(s=>s.map(v=>v===20?10:4),()=>f.dm.send('combat:attack',{attackerTokenId:f.a.id,targetTokenId:f.actor.id,weaponIndex:0,hasteAction:true}));
    expect(getCharacter(f.caster.id)!.curHp).toBe(0);
    expect(activeHasteCondition(getMonster(f.one.id)!)).toBeUndefined();expect(hasHasteLethargy(getMonster(f.one.id)!)).toBe(true);
  });

  it('expires before an incoming action reads AC or attempts to spend the extra action',()=>{
    const f=setup('Haste'),now=Date.now();vi.spyOn(Date,'now').mockReturnValue(now);
    f.cast({castLevel:3,targetTokenId:f.a.id});setActiveTurn(f.session.id,f.a.id);
    vi.spyOn(Date,'now').mockReturnValue(now+60_001);
    f.dm.send('haste:action',{kind:'monster',refId:f.one.id,action:'dash'});
    expect(activeHasteCondition(getMonster(f.one.id)!)).toBeUndefined();expect(hasHasteLethargy(getMonster(f.one.id)!)).toBe(true);
    setSheetAbility('pc',f.caster.id,{id:'spell',name:'Arcane Test',type:'spell',level:0,source:'custom',description:'',
      roll:{kind:'attack',dice:'1d6',damageType:'force',castingAbility:'INT'}});
    // d20 7 + INT3 + PB3 = 13 hits the base AC12, but would miss Haste's AC14.
    withDiceSource(s=>s.map(v=>v===20?7:4),()=>f.cast({targetTokenId:f.a.id}));
    expect(getMonster(f.one.id)!.curHp).toBe(96);expect(listRollLog(f.session.id).at(-1)!.reveal?.outcome).toBe('hit');
  });

  it('never attaches an orphan concentration buff when the caster is already incapacitated',()=>{
    const f=setup('Haste');setCondition('pc',f.caster.id,{id:'incap',label:'Incapacitated',aura:'red',isConcentration:false});
    expect(resolveAbilityRoll(f.session.id,'Mage',getCharacter(f.caster.id)!,f.spell,3,undefined,f.a.id)).toBe(false);
    expect(labels(f.one.id)).not.toContain('Haste');expect(getCharacter(f.caster.id)!.conditions.some(c=>c.isConcentration)).toBe(false);
  });
});

describe('spellcasting damage modifier',()=>{
  it('adds a casting modifier exactly once on a critical spell attack and shows it in damage modifiers',()=>{
    const f=setup('Fire Bolt',{name:'Arcane Blade',source:'custom',roll:{kind:'attack',dice:'1d6',damageType:'force',castingAbility:'INT',damageBonus:'spellcasting'}});
    withDiceSource(s=>s.map(v=>v===20?20:4),()=>f.cast({targetTokenId:f.a.id}));
    expect(getMonster(f.one.id)!.curHp).toBe(89);
    const result=listRollLog(f.session.id).at(-1)!;
    expect(result.reveal?.damageDice?.map(d=>d.value)).toEqual([4,4]);
    expect(result.reveal?.damageMods).toContainEqual({label:'INT modifier',value:3});
  });
  it('carries the flat casting modifier into live deferred spell damage without doubling or rerolling the hit',async()=>{
    const f=setup('Fire Bolt',{name:'Arcane Blade',source:'custom',roll:{kind:'attack',dice:'1d6',damageType:'force',castingAbility:'INT',damageBonus:'spellcasting'}});
    setManualDamage(f.session.id,true);const requests:number[][]=[];
    const dice=async(sides:number[])=>{requests.push(sides);return sides.map(s=>s===20?20:4);};
    const meta={label:'Arcane Blade',roller:'Mage',className:'Wizard'};
    await runLiveCommand(()=>resolveAbilityRoll(f.session.id,'Mage',getCharacter(f.caster.id)!,f.spell,undefined,undefined,f.a.id),()=>{},meta,dice);
    const hit=listRollLog(f.session.id).at(-1)!;expect(hit.pending?.live).toBeTruthy();expect(getMonster(f.one.id)!.curHp).toBe(100);
    await runLiveCommand(()=>resolveAttackDamage(f.session.id,'Mage',hit.id),()=>{},meta,dice);
    expect(requests).toEqual([[20],[6,6]]);expect(getMonster(f.one.id)!.curHp).toBe(89);
    expect(listRollLog(f.session.id).at(-1)!.reveal?.damageMods).toContainEqual({label:'INT modifier',value:3});
  });
});
