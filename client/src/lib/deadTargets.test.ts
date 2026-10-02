import {describe,it,expect} from 'vitest';
import type {StateSnapshot,Token,Character,Monster,MonsterPublic} from '../../../shared/types';
import {resolveToken,sameTokenDisplay} from './entities';
import {validTargets,healTargets} from './targets';

function fixture(role:'player'|'dm'='dm') {
  const token=(id:string,kind:'pc'|'monster',x=50,extra:Partial<Token>={}):Token=>({id,kind,refId:id,mapId:'map',x,y:50,widthFt:5,isHidden:false,...extra} as Token);
  const pc=(id:string,hp:number,failures=0):Character=>({id,name:id,curHp:hp,maxHp:20,deathSaves:{successes:0,failures},conditions:[],icon:''} as unknown as Character);
  const monster=(id:string,hp:number,extra:Partial<Monster>={}):Monster=>({id,name:id,curHp:hp,maxHp:20,conditions:[],icon:'',disposition:'enemy',...extra} as Monster);
  const tokens=[token('caster','pc',0),token('downed','pc'),token('dead-pc','pc',100),token('living','monster',150),token('dead','monster'),token('dead-mark','monster',50),token('chest','monster'),token('shared','monster',50,{sharedSightOnly:true}),token('elsewhere','monster',0,{mapId:'other'})];
  const snapshot={role,map:{gridSizePx:50,feetPerSquare:5},tokens,characters:[pc('caster',20),pc('downed',0),pc('dead-pc',0,3)],monsters:[monster('living',10),monster('dead',0),monster('dead-mark',10,{conditions:[{id:'d',label:'Dead',aura:'red',isConcentration:false}]}),monster('chest',0,{objectKind:'chest'}),monster('shared',10),monster('elsewhere',10)]} as StateSnapshot;
  return {snapshot,caster:tokens[0]};
}
describe('confirmed death and target lists',()=>{
  it('distinguishes downed PCs, confirmed death, manual death and objects',()=>{
    const {snapshot}=fixture();const dead=(id:string)=>resolveToken(snapshot,snapshot.tokens.find(t=>t.id===id)!).dead;
    expect(dead('downed')).toBe(false);expect(dead('dead-pc')).toBe(true);expect(dead('dead')).toBe(true);expect(dead('dead-mark')).toBe(true);expect(dead('chest')).toBe(false);
    const alive=resolveToken(snapshot,snapshot.tokens[1]);snapshot.characters[1].deathSaves.failures=3;
    expect(sameTokenDisplay(alive,resolveToken(snapshot,snapshot.tokens[1]))).toBe(false);
  });
  it('honors public death without requiring private enemy HP',()=>{
    const {snapshot}=fixture('player');snapshot.monsters=[{id:'dead',name:'Goblin',dead:true,conditions:[],icon:'',disposition:'enemy'} as unknown as MonsterPublic];
    const t=snapshot.tokens.find(t=>t.id==='dead')!;expect(resolveToken(snapshot,t).dead).toBe(true);expect(resolveToken(snapshot,t).curHp).toBeUndefined();
  });
  it('defaults to living targets, opts into dead and keeps distance order and map scope',()=>{
    const {snapshot,caster}=fixture();const ids=(show=false)=>validTargets(snapshot,caster,show).map(t=>t.id);
    expect(ids()).not.toContain('dead');expect(ids()).not.toContain('dead-pc');expect(ids()).not.toContain('dead-mark');expect(ids()).toContain('downed');expect(ids()).not.toContain('elsewhere');
    expect(ids(true)).toContain('dead');expect(ids(true)).toContain('dead-pc');expect(ids(true).indexOf('dead')).toBeLessThan(ids(true).indexOf('living'));
  });
  it('Show Dead never exposes shared-only sight or permits hidden friendlies in player attack lists',()=>{
    const {snapshot,caster}=fixture('player');expect(validTargets(snapshot,caster,true).map(t=>t.id)).toEqual(['chest','dead','dead-mark','living']);
  });
  it('healing and buff lists still include downed allies but filter dead, including the caster',()=>{
    const {snapshot,caster}=fixture('player');const ids=(show=false)=>healTargets(snapshot,caster,show).map(t=>t.id);
    expect(ids()).toEqual(['caster','downed']);expect(ids(true)).toEqual(['caster','downed','dead-pc']);snapshot.characters[0].deathSaves.failures=3;expect(ids()).toEqual(['downed']);
  });
});
