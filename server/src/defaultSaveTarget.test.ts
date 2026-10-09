import {describe,it,expect} from 'vitest';
import {createSession,createMap,setActiveMap,createCharacter,createToken,createMonsterTemplate,instantiateMonster,getCharacter,listRollLog} from './sessions.js';
import {resolveMonsterSheetAbility,resolveForcedSave} from './combat.js';
import {withDiceSource} from '../../shared/dice.js';
import {isMultiTargetSpell} from '../../shared/spellExecution.js';
import type {SheetAbility} from '../../shared/types.js';
function fixture(type:'spell'|'ability'='spell'){
 const s=createSession('Ice breath target'),map=createMap(s.id,{name:'Hall'});setActiveMap(s.id,map.id);
 const pc=createCharacter(s.id,{name:'Druk',race:'Half-Orc',className:'Fighter',maxHp:40,stats:{CON:10}});
 const target=createToken({mapId:map.id,kind:'pc',refId:pc.id,x:250,y:100});
 const ability:SheetAbility={id:'ice',name:'Ice Breath',type,level:0,description:'DC 15 Constitution saving throw. 3d6 cold damage, half on a success.',recharge:{min:5},roll:{kind:'save',save:'CON',dc:15,dice:'3d6',damageType:'cold'}};
 const caster=instantiateMonster(createMonsterTemplate(s.id,{name:'Frost Drake',maxHp:30,sheetAbilities:[ability]}).id)!;
 createToken({mapId:map.id,kind:'monster',refId:caster.id,x:100,y:100});
 return {s,pc,target,ability,caster};
}
describe('default save targeting',()=>{
 for(const type of ['spell','ability'] as const)for(const face of [1,20])it(`${type}: chosen target makes the save and receives ${face===1?'full':'half'} damage`,()=>{
  const f=fixture(type);expect(isMultiTargetSpell(f.ability)).toBe(false);
  withDiceSource(sides=>sides.map(s=>s===20?face:6),()=>expect(resolveMonsterSheetAbility(f.s.id,'DM',f.caster,f.ability,undefined,undefined,f.target.id)).toBe(true));
  expect(getCharacter(f.pc.id)!.curHp).toBe(face===1?22:31);
  const rolls=listRollLog(f.s.id);expect(rolls.some(r=>r.reveal?.kind==='check')).toBe(true);expect(rolls.find(r=>r.apply)?.apply?.consumedTargets).toContain(f.target.id);
 });
 it('keeps an untargeted cast available for choosing its target later',()=>{
  const f=fixture();withDiceSource(sides=>sides.map(s=>6),()=>resolveMonsterSheetAbility(f.s.id,'DM',f.caster,f.ability));
  const cast=listRollLog(f.s.id).find(r=>r.apply)!;expect(cast.apply?.save).toBe('CON');expect(getCharacter(f.pc.id)!.curHp).toBe(40);
  withDiceSource(sides=>sides.map(()=>1),()=>resolveForcedSave(f.s.id,cast.id,f.target.id));expect(getCharacter(f.pc.id)!.curHp).toBe(22);
 });
 it('retains defined area and explicitly multiple-target workflows',()=>{
  const a=fixture().ability;expect(isMultiTargetSpell({...a,name:'Fireball'})).toBe(true);
  expect(isMultiTargetSpell({...a,roll:{...a.roll!,targetMode:'multiple'}})).toBe(true);
 });
});
