import {describe,it,expect,vi} from 'vitest';
import Database from 'better-sqlite3';
import {db,migrateCommandCustomWordDefault} from './db.js';
import {withDiceSource} from '../../shared/dice.js';
import {isCommandSpell,commandWord,activeCommand} from '../../shared/commandSpell.js';
import {spellActionBlock,effectiveSpeed} from '../../shared/spellBuffs.js';
import {castCommand,resolveCommandInstruction} from './commandSpell.js';
import {resolveForcedSave,spellApplyTargetError} from './combat.js';
import {expireTimedSpellEffects} from './hitEffectTurns.js';
import {getSpell} from './spells/srd.js';
import {createSession,createMap,setActiveMap,createCharacter,createToken,createMonsterTemplate,instantiateMonster,getCharacter,getMonster,getToken,listRollLog,setSheetAbility,setCombatRound,setActiveTurn,setCondition,endConcentration,claimCharacter,drainHpFx} from './sessions.js';
import {registerSocketHandlers} from './socketHandlers.js';
import {setConn,dropConn,type IOServer} from './connections.js';
import {buildSnapshot} from './visibility.js';
import type {SheetAbility} from '../../shared/types.js';
const spell:SheetAbility={...getSpell('Command')!,id:'command'};
function fixture(){
 const session=createSession('Command test'),map=createMap(session.id,{name:'Command arena'});setActiveMap(session.id,map.id);
 const caster=createCharacter(session.id,{name:'Caster',className:'Cleric',level:5,maxHp:40,stats:{WIS:18},spellSlots:{L1:{max:4,used:0},L2:{max:3,used:0}}});setSheetAbility('pc',caster.id,spell);
 const actor=createToken({mapId:map.id,kind:'pc',refId:caster.id,x:100,y:100});
 const template=createMonsterTemplate(session.id,{name:'Guard',maxHp:40,creatureType:'humanoid',stats:{WIS:10},speed:'30 ft.'}),monster=instantiateMonster(template.id)!,target=createToken({mapId:map.id,kind:'monster',refId:monster.id,x:200,y:100});
 setCombatRound(session.id,1);setActiveTurn(session.id,actor.id);
 const dice=(face:number,fn:()=>unknown)=>withDiceSource(s=>s.map(()=>face),fn);
 const cast=(word='Halt',level=1,face=1)=>dice(face,()=>castCommand(session.id,'Caster','pc',caster.id,spell,level,word,target.id));
 return {session,map,caster,actor,template,monster,target,dice,cast,now:()=>getMonster(monster.id)!};
}
function client(sid:string,mapId:string,id:string,role:'player'|'dm'='player'){
 let connect!:(s:unknown)=>void;const io={on:(_e:string,fn:typeof connect)=>connect=fn,to:()=>({emit:()=>{}})};
 registerSocketHandlers(io as unknown as IOServer,{livePhysics:false});const handlers=new Map<string,(p:unknown)=>void>(),emit=vi.fn();
 connect({id,on:(e:string,fn:(p:unknown)=>void)=>handlers.set(e,fn),emit});setConn(id,{sessionId:sid,role,viewMapId:mapId,playerId:null});
 return {send:(e:string,p:unknown)=>handlers.get(e)!(p),emit,close:()=>dropConn(id)};
}
describe('Command',()=>{
 it('recognizes standard saved spells but preserves manual/custom/authored entries and validates one word',()=>{
  expect(isCommandSpell(spell)).toBe(true);expect(isCommandSpell({...spell,executionProfile:'manual'})).toBe(false);expect(isCommandSpell({...spell,source:'custom'})).toBe(false);expect(isCommandSpell({...spell,roll:{kind:'save',save:'STR'}})).toBe(false);
  expect(commandWord(' halt ')).toBe('Halt');expect(commandWord('Dance')).toBe('Dance');expect(commandWord('Go away')).toBeUndefined();expect(commandWord('<script>')).toBeUndefined();
 });
 it('a failed save waits for the target next turn, blocks Halt, and clears at its end',()=>{
  const f=fixture();expect(f.cast()).toBeUndefined();expect(activeCommand(f.now())).toBeUndefined();expect(spellActionBlock(f.now())).toBeUndefined();
  expect(drainHpFx(f.session.id)).toEqual([expect.objectContaining({spell:'Command',refId:f.monster.id,delta:0,rollId:expect.any(String)})]);
  const pending=f.now().conditions.find(c=>c.combatEffect?.commandWord)!;
  expect(resolveCommandInstruction(f.session.id,'monster',f.monster.id,pending.id)).toMatch(/next turn/);
  setActiveTurn(f.session.id,f.target.id);expect(spellActionBlock(f.now())).toBe('Command: Halt');expect(effectiveSpeed(f.now())).toBe('0 ft.');
  expect(resolveCommandInstruction(f.session.id,'monster',f.monster.id,pending.id)).toBeUndefined();expect(spellActionBlock(f.now())).toBe('Command: Halt');
  setActiveTurn(f.session.id,f.actor.id);expect(f.now().conditions.some(c=>c.combatEffect?.spell==='Command')).toBe(false);
 });
 it('a successful save does not attach an effect and reports Command resisted',()=>{
  const f=fixture();f.cast('Halt',1,20);expect(f.now().conditions).toHaveLength(0);expect(listRollLog(f.session.id).find(r=>r.reveal)?.reveal?.effectOutcome).toBe('Command resisted.');
  expect(drainHpFx(f.session.id)).toEqual([]);
 });
 it('Grovel applies Prone on the target turn and leaves Prone after Command ends',()=>{
  const f=fixture();f.cast('Grovel');expect(f.now().conditions.some(c=>c.label==='Prone')).toBe(false);setActiveTurn(f.session.id,f.target.id);expect(f.now().conditions.some(c=>c.label==='Prone')).toBe(true);setActiveTurn(f.session.id,f.actor.id);expect(f.now().conditions.map(c=>c.label)).toEqual(['Prone']);
 });
 it.each(['Approach','Flee'])('%s retains movement while blocking attacks and spells',word=>{
  const f=fixture();f.cast(word);setActiveTurn(f.session.id,f.target.id);expect(effectiveSpeed(f.now())).toBe('30 ft.');expect(spellActionBlock(f.now())).toBe(`Command: ${word}`);
 });
 it('Command requires no concentration, keeps another concentration spell, and survives caster loss of concentration',()=>{
  const f=fixture();setCondition('pc',f.caster.id,{id:'bless',label:'Concentration: Bless',aura:'blue',isConcentration:true});f.cast();expect(getCharacter(f.caster.id)!.conditions.some(c=>c.id==='bless')).toBe(true);endConcentration('pc',f.caster.id,'Test');expireTimedSpellEffects(f.session.id);expect(f.now().conditions.some(c=>c.combatEffect?.spell==='Command')).toBe(true);
 });
 it('upcasting allows distinct targets once each and cannot exceed the target count',()=>{
  const f=fixture();const t2=instantiateMonster(f.template.id)!,tok2=createToken({mapId:f.map.id,kind:'monster',refId:t2.id,x:250,y:100});
  f.cast('Drop',2);const entry=listRollLog(f.session.id).find(r=>r.apply)!;expect(entry.apply!.maxTargets).toBe(2);
  f.dice(1,()=>resolveForcedSave(f.session.id,entry.id,tok2.id));expect(getMonster(t2.id)!.conditions.some(c=>c.label==='Command: Drop')).toBe(true);
  expect(spellApplyTargetError(f.session.id,listRollLog(f.session.id).find(r=>r.id===entry.id)!,tok2.id)).toMatch(/already saved/);
  expect(listRollLog(f.session.id).find(r=>r.id===entry.id)!.apply!.consumedTargets).toHaveLength(2);
 });
 it('rejects out-of-range or opaque-wall targets before creating a cast',()=>{
  const f=fixture();db.prepare('UPDATE tokens SET x=10000 WHERE id=?').run(f.target.id);expect(f.cast()).toMatch(/60 feet/);expect(listRollLog(f.session.id)).toHaveLength(0);
  db.prepare('UPDATE tokens SET x=200 WHERE id=?').run(f.target.id);db.prepare('UPDATE maps SET walls=? WHERE id=?').run(JSON.stringify([{id:'wall',ax:150,ay:0,bx:150,by:300}]),f.map.id);expect(f.cast()).toMatch(/visible/);
 });
 it('custom words are enabled by default and remain manual while carrying the next-turn reminder',()=>{
  const f=fixture();expect(f.session.commandCustomWords).toBe(true);expect(f.cast('Dance')).toBeUndefined();setActiveTurn(f.session.id,f.target.id);expect(f.now().conditions.find(c=>c.combatEffect?.commandWord==='Dance')?.combatEffect?.commandStarted).toBe(true);expect(spellActionBlock(f.now())).toBeUndefined();
 });
 it('adopts the new custom-word default once without overwriting later DM opt-outs',()=>{
  const legacy=new Database(':memory:');
  try{
   legacy.exec('CREATE TABLE sessions (id TEXT PRIMARY KEY, command_custom_words INTEGER DEFAULT 0); CREATE TABLE app_meta (key TEXT PRIMARY KEY, value TEXT); INSERT INTO sessions (id) VALUES (\'old\');');
   migrateCommandCustomWordDefault(legacy);expect(legacy.prepare('SELECT command_custom_words AS enabled FROM sessions').get()).toEqual({enabled:1});
   legacy.exec('UPDATE sessions SET command_custom_words=0');migrateCommandCustomWordDefault(legacy);expect(legacy.prepare('SELECT command_custom_words AS enabled FROM sessions').get()).toEqual({enabled:0});
  }finally{legacy.close();}
 });
 it('socket casting spends one slot, rejects forged words without spending, and keeps custom settings DM-only',()=>{
  const f=fixture(),p=client(f.session.id,f.map.id,'command-owner'),dm=client(f.session.id,f.map.id,'command-dm','dm');claimCharacter(f.caster.id,'command-owner');
  const payload={kind:'pc',refId:f.caster.id,abilityId:spell.id,targetTokenId:f.target.id,castLevel:1};
  dm.send('session:setCommandCustomWords',{enabled:false});expect(buildSnapshot(f.session.id,'player',null,'command-owner')!.commandCustomWords).toBe(false);
  p.send('session:setCommandCustomWords',{enabled:true});expect(buildSnapshot(f.session.id,'player',null,'command-owner')!.commandCustomWords).toBe(false);
  p.send('ability:roll',{...payload,commandWord:'Dance'});expect(getCharacter(f.caster.id)!.spellSlots.L1.used).toBe(0);expect(p.emit).toHaveBeenCalledWith('notice',expect.objectContaining({message:expect.stringMatching(/enable/)}));
  p.send('ability:roll',{...payload,commandWord:'two words'});expect(getCharacter(f.caster.id)!.spellSlots.L1.used).toBe(0);
  f.dice(1,()=>p.send('ability:roll',{...payload,commandWord:'Halt'}));expect(getCharacter(f.caster.id)!.spellSlots.L1.used).toBe(1);
  dm.send('session:setCommandCustomWords',{enabled:true});expect(buildSnapshot(f.session.id,'player',null,'command-owner')!.commandCustomWords).toBe(true);
  p.close();dm.close();
 });
});
