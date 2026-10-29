import {describe,it,expect} from 'vitest';
import type {Character,SheetAbility} from '../../../shared/types';
import {spellCastCost,spellCastRestriction} from './spellcasting';
const spell=(level=1):SheetAbility=>({id:'spell',name:'Detect Magic',type:'spell',level,description:'Utility spell'});
const caster=(spellSlots:Character['spellSlots'],className='Wizard')=>({className,spellSlots} as Character);
describe('displayed spell casting cost',()=>{
 it('selects the lowest available higher slot, while respecting an explicit exhausted selection',()=>{
  const c=caster({L1:{max:4,used:4},L2:{max:3,used:1},L3:{max:2,used:0}});
  expect(spellCastCost(c,spell())).toMatchObject({level:2,label:'Level 2 slot',remaining:'2 remaining',unavailable:false});
  expect(spellCastCost(c,spell(),1)).toMatchObject({level:1,unavailable:true});
 });
 it('shows the actual Pact casting level and keeps an explicit ordinary pool separate',()=>{
  const c=caster({L1:{max:3,used:0},P3:{max:2,used:0}});
  expect(spellCastCost(c,spell(),1,'pact')).toMatchObject({level:3,label:'Pact Level 3 slot',slot:{key:'P3',pool:'pact'}});
  expect(spellCastCost(c,spell(),1,'spellcasting')).toMatchObject({level:1,label:'Level 1 slot',slot:{key:'L1'}});
  expect(spellCastCost(caster({L3:{max:2,used:0}},'Warlock'),spell())).toMatchObject({level:3,label:'Pact Level 3 slot'});
 });
 it('keeps cantrips free and does not mistake roll scaling metadata for a spell slot',()=>{
  const c=caster({L1:{max:2,used:0}});
  expect(spellCastCost(c,{...spell(0),roll:{kind:'damage',dice:'1d6',baseLevel:1}})).toMatchObject({level:0,label:'Cantrip · no spell slot',unavailable:false,slot:undefined});
  expect(spellCastCost(c,{...spell(2),roll:{kind:'damage',dice:'1d6',baseLevel:1}},1)).toMatchObject({level:2,unavailable:true});
 });
 it('reports exhausted pools without inventing a free cast',()=>{
  expect(spellCastCost(caster({}),spell())).toMatchObject({unavailable:true});
  expect(spellCastCost(caster({P3:{max:2,used:2}}),spell(),1,'pact')).toMatchObject({unavailable:true,label:'Pact Level 3 slot'});
 });
 it('explains reaction and post-hit spells instead of offering a premature cast',()=>{
  expect(spellCastRestriction({...spell(),name:'Shield'})).toMatch(/reaction/);
  expect(spellCastRestriction({...spell(),name:'Hail of Thorns'})).toMatch(/qualifying hit/);
  expect(spellCastRestriction({...spell(),prepared:false})).toMatch(/Prepare/);
  expect(spellCastRestriction(spell())).toBeUndefined();
 });
});
