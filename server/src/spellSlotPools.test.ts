import { describe,expect,it } from 'vitest';
import { selectSpellSlot,spellSlotOptions } from '../../shared/spellSlotPools.js';
import { freeSmiteAvailable,smiteChoices } from '../../shared/smite.js';
import type { Character,SheetAbility } from '../../shared/types.js';
const caster:Pick<Character,'className'|'level'|'leveling'|'resources'|'spellSlots'>={className:'Paladin',level:7,leveling:{rules:'2024',history:[],classes:[{className:'paladin',level:2},{className:'warlock',level:5}]},
  resources:{},spellSlots:{L1:{max:2,used:0},P3:{max:2,used:0}}};
describe('spellcasting and Pact pool selection',()=>{
  it('upcasts at the Pact level and can explicitly choose either available pool',()=>{
    expect(selectSpellSlot(caster,1)).toMatchObject({key:'L1',level:1,pool:'spellcasting'});
    expect(selectSpellSlot(caster,1,'pact')).toMatchObject({key:'P3',level:3,pool:'pact'});
    expect(selectSpellSlot(caster,4,'pact')).toBeUndefined();
    expect(spellSlotOptions(caster).map(o=>o.label)).toEqual(['L1','Pact L3']);
  });
  it('does not consume an unrelated higher ordinary spell slot or ignore a selected empty pool',()=>{
    const exhausted={...caster,spellSlots:{L1:{max:2,used:2},L2:{max:2,used:0},P3:{max:2,used:0}}};
    expect(selectSpellSlot(exhausted,1)).toMatchObject({key:'P3',remaining:2});
    expect(selectSpellSlot(exhausted,1,'spellcasting')).toMatchObject({key:'L1',remaining:0});
  });
  it('uses the legacy single-class Pact level before rolling or spending',()=>{
    const warlock={className:'Warlock',spellSlots:{L3:{max:2,used:0}}};
    expect(selectSpellSlot(warlock,1)).toMatchObject({key:'L3',level:3,pool:'pact'});
  });
  it('offers independent Smite pools and gates free Smite by Paladin class level',()=>{
    const ability={name:'Divine Smite',type:'spell',level:1,smite:{dice:'2d8',damageType:'radiant',freeUse:{counter:'Divine Smite (free)',className:'paladin',minLevel:2}}} as SheetAbility;
    expect(smiteChoices(caster,ability)).toEqual(['free',1,'pact:3']);
    expect(freeSmiteAvailable({...caster,leveling:{rules:'2024',history:[],classes:[{className:'paladin',level:1},{className:'warlock',level:6}]}},ability.smite!)).toBe(false);
  });
});
