import {it,expect} from 'vitest';
import {dicePreloadPlan} from './dicePreloadPlan';

it('warms party dice before a player claims a character, including DM saves',()=>{
 expect(dicePreloadPlan(['Fighter','Ranger','Sorcerer'],undefined,false).map(t=>t.id))
  .toEqual(['fighter','ranger','sorcerer','dm-neutral-roll']);
});
it('prioritizes the selected character and deduplicates multiclass themes',()=>{
 expect(dicePreloadPlan(['Fighter','Fighter / Wizard','Ranger','Sorcerer','Druid'],'Druid',false).map(t=>t.id))
  .toEqual(['druid','fighter','ranger','dm-neutral-roll']);
});
it('only prepares the DM material for the DM and remains bounded',()=>{
 expect(dicePreloadPlan(['Fighter','Ranger'],'Fighter',true).map(t=>t.id)).toEqual(['dm-neutral-roll']);
 expect(dicePreloadPlan([],undefined,false).map(t=>t.id)).toEqual(['dm-neutral-roll']);
});
