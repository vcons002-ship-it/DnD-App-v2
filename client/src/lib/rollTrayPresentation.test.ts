import {describe,it,expect} from 'vitest';
import type {LiveDiceFrame} from '../../../shared/liveDiceTypes';
import type {RollReveal} from '../../../shared/types';
import {resultTrayFor,diceTriggerForTray,rollThemeForPresentation} from './rollTrayPresentation';

const frame=(id:string,sides:number[],values:number[],extra:Partial<LiveDiceFrame>={}):LiveDiceFrame=>({
  id,seq:1,label:id,roller:'Varis',className:'Ranger',sides,values,poses:[],radius:1,elapsed:3,done:true,
  sets:sides.map(()=>0),critical:sides.map(()=>false),percentile:sides.map(()=>null),rerolls:sides.map(()=>0),...extra,
});
const damage=(expr:string,faces:number[]):RollReveal=>({physical:true,kind:'damage',attacker:'Varis',outcome:'none',damageDice:[{label:expr,value:faces.reduce((a,b)=>a+b,0),faces}]});

describe('authoritative dice appearance at the result handoff',()=>{
 it('retains Vanec percentile art without relying on a local roll log or roster',()=>{
  const percentile=frame('percentile',[10,10],[4,8],{roller:'Vanec',className:'Sorcerer',percentile:['tens','ones']});
  const reveal={...damage('1d100',[37]),attacker:'Vanec'};
  const retained=resultTrayFor([percentile],reveal);
  expect(retained).toBe(percentile);
  expect(rollThemeForPresentation(retained,reveal,undefined,[],[]).id).toBe('sorcerer');
  // A similarly named creature cannot override the server's player material.
  expect(rollThemeForPresentation(retained,reveal,'Vanec',[],[{name:'Vanec'}]).id).toBe('sorcerer');
 });
 it('keeps DM and creature percentile trays purple even when a name matches a PC',()=>{
  for(const roller of ['DM','Goblin']){
   const percentile=frame('dm-percentile',[10,10],[1,1],{roller,className:'',dmDice:true,percentile:['tens','ones']});
   expect(rollThemeForPresentation(percentile,{...damage('1d100',[100]),attacker:roller},roller,[{name:roller,className:'Fighter'}],[]).id).toBe('dm-neutral-roll');
  }
 });
 it('preserves explicit gold art and supports historical rolls without a retained tray',()=>{
  expect(rollThemeForPresentation(frame('gold',[6],[4],{diceTheme:'gold'}),undefined,undefined,[],[]).id).toBe('gold-roll');
  expect(rollThemeForPresentation(undefined,{...damage('1d100',[37]),attacker:'Vanec'},'Vanec',[{name:'Vanec',className:'Sorcerer'}],[]).id).toBe('sorcerer');
  expect(rollThemeForPresentation(undefined,undefined,'DM',[],[]).id).toBe('dm-neutral-roll');
 });
});
describe('retained live result trays',()=>{
  it('uses the damage tray rather than the later saving-throw batch',()=>{
    const hit=frame('damage',[6,6],[3,5]),save=frame('save',[20],[12],{saveDice:[{label:'Goblin G1',group:'G1',modifier:3,dc:14}]});
    expect(resultTrayFor([hit,save],damage('2d6',[3,5]))).toBe(hit);
  });
  it('matches distinct damage-type throws to their own recorded dice',()=>{
    const bludgeoning=frame('bludgeoning',[8,8],[2,6]),cold=frame('cold',[6,6,6,6],[3,4,5,6]);
    expect(resultTrayFor([bludgeoning,cold],damage('2d8',[2,6]))).toBe(bludgeoning);
    expect(resultTrayFor([bludgeoning,cold],damage('4d6',[3,4,5,6]))).toBe(cold);
  });
  it('matches the kept advantage die and decodes the percentile pair',()=>{
    const advantage=frame('advantage',[20,20],[4,17],{mode:'adv',sets:[0,1],kept:1});
    expect(resultTrayFor([advantage],{physical:true,kind:'check',attacker:'Varis',outcome:'none',d20:17})).toBe(advantage);
    const percentile=frame('percentile',[10,10],[1,1],{percentile:['tens','ones']});
    expect(resultTrayFor([percentile],damage('1d100',[100]))).toBe(percentile);
  });
  it('keeps the latest rider tray for a compound roll and ignores unfinished/nonphysical rolls',()=>{
    const weapon=frame('weapon',[8],[5]),mark=frame('mark',[6],[3]),unfinished=frame('unfinished',[6],[2],{done:false});
    expect(resultTrayFor([weapon,mark,unfinished],{...damage('1d8',[5]),damageDice:[{label:'1d8',value:5,faces:[5]},{label:'1d6',value:3,faces:[3]}]})).toBe(mark);
    expect(resultTrayFor([weapon],{...damage('1d8',[5]),physical:false})).toBeUndefined();
    expect(resultTrayFor([],damage('1d8',[5]))).toBeUndefined();
  });
  it('keeps the matching rider rather than a subsequent Hail of Thorns burst',()=>{
    const weapon=frame('weapon',[10],[5]),mark=frame('mark',[6],[3]),thorns=frame('thorns',[10],[3]);
    const combined={...damage('1d10',[5]),damageDice:[{label:'1d10',value:5,faces:[5]},{label:'Hunter’s Mark',diceExpression:'1d6',value:3,faces:[3]}]};
    expect(resultTrayFor([weapon,mark,thorns],combined)).toBe(mark);
  });
});

it('keeps triggering spell dice visible instead of highlighting an unrelated later rider',()=>{
 const orb=frame('orb',[8,8,8],[7,2,7]),rider=frame('mark',[6],[4]);
 const reveal={...damage('3d8',[7,2,7]),damageDice:[{label:'3d8',value:16,faces:[7,2,7]},{label:'1d6',value:4,faces:[4]}],diceTrigger:{title:'Orb can leap!',detail:'Matching damage dice',diceCount:3,groups:[{value:7,indices:[0,2]}]}};
 expect(resultTrayFor([orb,rider],reveal)).toBe(orb);
 expect(diceTriggerForTray(orb,reveal)).toBe(reveal.diceTrigger);
 expect(diceTriggerForTray(rider,reveal)).toBeUndefined();
});

it('retains the full Burst tray and its parent links for the combined damage summary',()=>{
 const burst=frame('burst',[8,8,8],[8,8,5],{burstCapacity:4,burstProgress:{used:2,limit:3},burstLinks:[{from:0,to:1},{from:1,to:2}]});
 const reveal={...damage('1d8',[8]),damageDice:[{label:'1d8',value:8,faces:[8]},{label:'Sorcerous Burst bonus',diceExpression:'1d8',value:8,faces:[8]},{label:'Sorcerous Burst bonus',diceExpression:'1d8',value:5,faces:[5]}]};
 expect(resultTrayFor([frame('attack',[20],[15]),burst],reveal)).toBe(burst);
});
