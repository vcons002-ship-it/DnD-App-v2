import { describe, expect, it } from 'vitest';
import { CHALLENGE_RATINGS, creatureBaseline, scaleCreature, scaleDice, scaledCurrentHp } from '../../shared/creatureScaling.js';
import { createSession, createMonsterTemplate, getMonster, instantiateMonster, copyMonster, updateMonster, listRollLog } from './sessions.js';
import { resolveMonsterSheetAbility } from './combat.js';
import { saveLibraryCreature, getLibraryCreature } from './library.js';
import { rollDice } from '../../shared/dice.js';
import { db } from './db.js';

const make = () => createMonsterTemplate(createSession('CR test').id, {
  name:'CR sentinel',level:4,maxHp:60,armorClass:17,stats:{STR:16,DEX:12,CON:14,INT:10,WIS:14,CHA:8},
  weapons:[{name:'Blade',kind:'melee',damage:'2d6+3',attackBonus:5,extraDamage:'1d6',extraDamageType:'fire'}],
  sheetAbilities:[{id:'breath',name:'Breath',type:'ability',description:'DC 14 Dexterity saving throw. 21 (6d6) fire damage. Recharge 5–6. Range 30 ft.',roll:{kind:'save',dice:'6d6',dc:14,save:'DEX'}},
    {id:'ray',name:'Ray',type:'ability',description:'',roll:{kind:'attack',dice:'2d6'}}],
  abilities:[{name:'Multiattack',description:'Makes two attacks.'}],
});

describe('baseline CR scaling',()=>{
  it('follows DMG ratios and offsets, preserving creature identity and HP fraction',()=>{
    const m=make(); updateMonster(m.id,{curHp:30});
    const scaled=updateMonster(m.id,{level:5,maxHp:999,armorClass:99})!;
    expect(scaled.maxHp).toBe(67); // 60 * 138/123
    expect(scaled.curHp).toBe(34);
    expect(scaled.armorClass).toBe(18);
    expect(scaled.weapons[0].attackBonus).toBe(6);
    expect(scaled.weapons[0].damage).toBe('3d6+2'); // ~12 damage, from 10 * 35.5/29.5
    expect(scaled.stats).toEqual(m.stats);
    expect(scaled.abilities).toEqual(m.abilities);
    expect(scaled.sheetAbilities[0].roll?.dc).toBe(15);
    expect(scaled.sheetAbilities[0].description).toContain('DC 15');
    expect(scaled.sheetAbilities[0].description).toContain('Range 30 ft.');
    expect(scaled.sheetAbilities[1].roll?.attackBonus).toBe(5);
  });
  it('uses the original persisted baseline after edits, reload, spawn, copy and library save',()=>{
    const m=make();const original=creatureBaseline(m);
    updateMonster(m.id,{level:8});updateMonster(m.id,{level:3});
    const restored=updateMonster(m.id,{level:4})!;
    expect(creatureBaseline(restored)).toEqual(original);
    expect(JSON.parse((db.prepare('SELECT cr_baseline FROM monsters WHERE id = ?').get(m.id) as {cr_baseline:string}).cr_baseline)).toEqual(original);
    updateMonster(m.id,{level:7});
    const spawned=instantiateMonster(m.id)!;
    expect(creatureBaseline(updateMonster(spawned.id,{level:4})!)).toEqual(original);
    const copy=copyMonster(m.id)!;
    expect(copy.crBaseline).toEqual(original);
    saveLibraryCreature({...getMonster(m.id)!,name:'CR test reusable'},true);
    const lib=getLibraryCreature('CR test reusable')!;
    expect(lib.crBaseline).toEqual(original);
    const reimport=createMonsterTemplate(m.sessionId,{...lib,source:'manual'});
    expect(creatureBaseline(updateMonster(reimport.id,{level:4})!)).toEqual(original);
  });
  it('direct and stepped changes match across fractional and high CRs',()=>{
    const m=make();const base=creatureBaseline(m);
    for(const cr of CHALLENGE_RATINGS){
      const expected=scaleCreature(base,cr);
      const actual=updateMonster(m.id,{level:cr})!;
      expect(actual.maxHp).toBe(expected.maxHp);
      expect(actual.weapons).toEqual(expected.weapons);
      for(const w of actual.weapons) expect(rollDice(w.damage!)).not.toBeNull();
    }
  });
  it('does not resurrect dead creatures or scale temporary HP',()=>{
    const m=make();updateMonster(m.id,{curHp:0,tempHp:5});
    const scaled=updateMonster(m.id,{level:10})!;
    expect(scaled.curHp).toBe(0);expect(scaled.tempHp).toBe(5);
    expect(scaledCurrentHp(1,100,1)).toBe(1);
  });
  it('rejects invalid ratings without changing the monster and leaves objects alone',()=>{
    const m=make();
    for(const level of [-1,.3,31,NaN,Infinity]) expect(updateMonster(m.id,{level})).toBeNull();
    expect(getMonster(m.id)?.level).toBe(4);
    const object=createMonsterTemplate(m.sessionId,{name:'Chest',maxHp:10,objectKind:'chest'});
    expect(updateMonster(object.id,{level:5})?.maxHp).toBe(10);
  });
  it('round trips zero CR and keeps unsupported expressions unchanged',()=>{
    const base={...creatureBaseline(make()),level:0};
    expect(scaleCreature(base,0)).toEqual(base);
    expect(scaleDice('special',3)).toBe('special');
    expect(scaleDice('0',2)).toBe('0');
  });
  it('uses scaled spell attack bonuses in real combat and preserves original cantrip tiers',()=>{
    const m=make();
    updateMonster(m.id,{sheetAbilities:[...m.sheetAbilities,{id:'spark',name:'Spark',type:'spell',level:0,
      description:'',roll:{kind:'damage',dice:'1d6',scaleDice:'1d6',baseLevel:0}}]});
    const scaled=updateMonster(m.id,{level:5})!;
    expect(resolveMonsterSheetAbility(m.sessionId,'DM',scaled,scaled.sheetAbilities[1])).toBe(true);
    expect(listRollLog(m.sessionId).at(-1)?.detail).toContain('+5[CR-scaled]');
    expect(resolveMonsterSheetAbility(m.sessionId,'DM',scaled,scaled.sheetAbilities[2])).toBe(true);
    expect(listRollLog(m.sessionId).at(-1)?.detail).toContain('[1d6+1[');
    expect(listRollLog(m.sessionId).at(-1)?.detail).not.toContain('1d6+1+1d6');
  });
  it('scales compound dice and bakes ability-based weapon damage once',()=>{
    expect(scaleDice('1d6+1d4+2',2)).toBe('4d6+2');
    const b=creatureBaseline(make());b.weapons=[{name:'Axe',kind:'melee',damage:'1d8',diceOnly:true}];
    const scaled=scaleCreature(b,5);
    expect(scaled.weapons[0].diceOnly).toBeUndefined();
    expect(scaled.weapons[0].damage).toBe('2d8');
  });
  it('keeps internal AI completion separate from a DM CR adjustment',()=>{
    const m=make();
    const filled=updateMonster(m.id,{level:5,maxHp:100},{scaleCR:false})!;
    expect(filled.maxHp).toBe(100);
    expect(filled.crBaseline).toBeUndefined();
    expect(updateMonster(m.id,{level:6})?.maxHp).toBe(111);
  });
});
