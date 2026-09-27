import {it,expect} from 'vitest';
import {liveDieResult} from '../../shared/liveDieResult.js';
import {dieResultStrength,dieResultTier} from '../../shared/diceTrayTypes.js';
import type {LiveDiceFrame} from '../../shared/liveDiceTypes.js';
const frame=(sides:number[],values:number[],percentile:LiveDiceFrame['percentile']=sides.map(()=>null)):LiveDiceFrame=>({id:'test',seq:1,label:'Damage',roller:'Druk',className:'Fighter',sets:sides.map(()=>0),critical:sides.map((_,i)=>i>0),percentile,sides,radius:1,poses:[],values,rerolls:sides.map(()=>0),elapsed:1,done:true});
it('scores each result relative to its die, including gold critical dice',()=>{
 const f=frame([6,6,20,6,6],[6,6,6,5,4]);
 expect(f.sides.map((_,i)=>dieResultTier(liveDieResult(f,i)))).toEqual(['max','max','normal','high','normal']);
 expect(dieResultStrength(liveDieResult(f,0))).toBe(1);
 expect(dieResultStrength(liveDieResult(f,2))).toBeCloseTo(5/19);
 expect(dieResultTier(liveDieResult({...f,done:false},0))).toBe('normal');
});
it('scores both percentile dice by their combined result',()=>{
 for(const [values,tier] of [[[1,1],'max'],[[10,7],'high'],[[7,2],'normal']] as const){
  const f=frame([10,10],[...values],['tens','ones']);
  expect([0,1].map(i=>dieResultTier(liveDieResult(f,i)))).toEqual([tier,tier]);
 }
});

it('reserves d20 outcomes and highlights low faces on every other die',()=>{
 for(const sides of [4,6,8,10,12,100]){
  const f=frame([sides,sides],[1,sides]);
  expect(dieResultTier(liveDieResult(f,0))).toBe('min');
  expect(dieResultTier(liveDieResult(f,1))).toBe('max');
 }
 const f=frame([6,6,8,20,20],[2,3,2,1,20]);
 expect(f.sides.map((_,i)=>dieResultTier(liveDieResult(f,i)))).toEqual(['low','normal','low','normal','normal']);
 const percentile=frame([10,10],[1,2],['tens','ones']);
 expect([0,1].map(i=>dieResultTier(liveDieResult(percentile,i)))).toEqual(['min','min']);
 expect(dieResultTier(liveDieResult({...percentile,done:false},0))).toBe('normal');
});
