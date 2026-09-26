import { describe, it, expect, vi } from 'vitest';
import { flattenDamageDice } from '../../shared/diceVisuals.js';

describe('mixed damage dice presentation',()=>{
 it('keeps a weapon d8 and named Hunter mark d6 even when both roll 1',()=>{
  expect(flattenDamageDice([{label:'1d8',value:1,faces:[1]}, {label:"Hunter's Mark (force)",value:1,faces:[1],diceExpression:'1d6'}])).toEqual([
   {sides:8,value:1,crit:false},{sides:6,value:1,crit:false}]);
 });
 it('preserves every term of compound expressions, independently of labels',()=>{
  expect(flattenDamageDice([{label:'Elemental weapon',value:12,faces:[1,2,3,6],diceExpression:'1d8+2d6+1d12'}]).map(d=>d.sides)).toEqual([8,6,6,12]);
 });
 it('keeps smite crit d8s beside weapon d6s and named rider crit d4s',()=>{
  expect(flattenDamageDice([{label:'2d6',value:2,faces:[1,1]}, {label:'CRIT',value:2,faces:[1,1],diceExpression:'2d8'}, {label:'Rider CRIT',value:1,faces:[1],diceExpression:'1d4'}])).toEqual([
   {sides:6,value:1,crit:false},{sides:6,value:1,crit:false},{sides:8,value:1,crit:true},{sides:8,value:1,crit:true},{sides:4,value:1,crit:true}]);
 });
 it('supports labelled historical compound rolls and their crits',()=>{
  expect(flattenDamageDice([{label:'1d8+1d4',value:3,faces:[1,2]}, {label:'CRIT',value:3,faces:[1,2]}]).map(d=>d.sides)).toEqual([8,4,8,4]);
 });
 it('does not reroll values while selecting a mesh',()=>{
  const random=vi.spyOn(Math,'random');
  const steps=[{label:'Superiority',value:7,faces:[7],diceExpression:'d10'},{label:'Sneak Attack',value:9,faces:[2,3,4],diceExpression:'3d6'}];
  expect(flattenDamageDice(steps).map(d=>[d.sides,d.value])).toEqual([[10,7],[6,2],[6,3],[6,4]]);
  expect(random).not.toHaveBeenCalled(); random.mockRestore();
 });
});
