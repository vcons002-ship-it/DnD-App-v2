import {describe,it,expect} from 'vitest';
import type {LiveDiceFrame} from '../../../shared/liveDiceTypes';
import {saveRollHeading} from './saveRollHeading';
const frame={label:'Trip Attack — STR Saving Throw',roller:'Druk',saveDice:[{label:'G1',name:'Goblin G1',group:'0',dc:14,hideModifiers:true}]} as LiveDiceFrame;
describe('saving throw headings',()=>{
 it('names the saving creature, not the caster, and keeps a known DC despite hidden creature modifiers',()=>{
  expect(saveRollHeading(frame)).toBe('Goblin G1 — Trip Attack — STR Saving Throw · DC 14');
  expect(saveRollHeading(frame,frame.label,'Druk')).toBe(saveRollHeading(frame));
 });
 it('keeps hidden DCs hidden and deduplicates advantage dice',()=>{
  const save={label:'G1',name:'Goblin G1',group:'0',hideModifiers:true};
  expect(saveRollHeading({...frame,saveDice:[save,save]})).toBe('Goblin G1 — Trip Attack — STR Saving Throw');
 });
 it('identifies grouped saves and does not claim a single DC for different difficulties',()=>{
  expect(saveRollHeading({...frame,label:'Hail of Thorns — DEX Saving Throws',saveDice:[frame.saveDice![0],{label:'G2',name:'Goblin G2',group:'1',dc:15}]})).toBe('Goblin G1, Goblin G2 — Hail of Thorns — DEX Saving Throws');
 });
 it('names direct saves and secondary save targets without altering initiative/attack headings',()=>{
  expect(saveRollHeading({...frame,saveDice:undefined,roller:'Varis',label:'DEX save'})).toBe('Varis — DEX Saving Throw');
  expect(saveRollHeading({...frame,saveDice:undefined,target:'Vanec'})).toContain('Vanec —');
  expect(saveRollHeading({...frame,label:'Roll initiative!',saveDice:[{label:'G1',group:'0',rollKind:'initiative'}]})).toBe('Roll initiative!');
  expect(saveRollHeading({...frame,label:'Greatsword — Attack Roll',saveDice:undefined})).toBe('Greatsword — Attack Roll');
 });
});
