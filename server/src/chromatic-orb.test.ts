import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveAbilityRoll, resolveAttackDamage, resolveOrbLeap, resolveForcedSave } from './combat.js';
import { createSession, createMap, setActiveMap, createCharacter, createToken, createMonsterTemplate,
  instantiateMonster, listRollLog, setManualDamage, getRollEntry, getMonster, updateMonster } from './sessions.js';
import { getSpell } from './spells/srd.js';

afterEach(() => vi.restoreAllMocks());
function setup(manual = false) {
  const session = createSession('Orb test'), map = createMap(session.id,{name:'Orb map'});
  setActiveMap(session.id,map.id); setManualDamage(session.id,manual);
  const caster = createCharacter(session.id,{name:'Caster',className:'Sorcerer',level:9,stats:{CHA:20}});
  createToken({mapId:map.id,kind:'pc',refId:caster.id,x:50,y:100});
  const target = (x = 100) => {
    const template = createMonsterTemplate(session.id,{name:'Target',armorClass:1,maxHp:1000});
    const monster = instantiateMonster(template.id)!;
    return createToken({mapId:map.id,kind:'monster',refId:monster.id,x,y:100});
  };
  const last = () => listRollLog(session.id).filter(r=>r.apply?.orb).at(-1)!;
  const cast = (id?: string, level = 1) => resolveAbilityRoll(session.id,'Caster',caster,
    {...getSpell('Chromatic Orb')!,id:'orb'},level,undefined,id,'lightning');
  return {session,map,caster,target,last,cast};
}
describe('Chromatic Orb leaps', () => {
  it.each([1,2,3,9])('permits exactly %i leaps with matches, using fresh attacks and damage', level => {
    vi.spyOn(Math,'random').mockReturnValue(.5);
    const f=setup(); f.cast(f.target().id,level);
    for(let n=0;n<level;n++) {
      const previous=f.last(), target=f.target();
      expect(previous.apply?.orb).toMatchObject({available:true,leapsUsed:n,slotLevel:level});
      expect(resolveOrbLeap(f.session.id,previous.id,target.id)).toEqual({ok:true});
      expect(getMonster(target.refId)!.curHp).toBe(1000-(level+2)*5);
      expect(resolveOrbLeap(f.session.id,previous.id,f.target().id).ok).toBe(false);
    }
    expect(f.last().apply?.orb).toMatchObject({available:false,leapsUsed:level});
    expect(f.last().apply?.orb?.visited).toHaveLength(level+1);
  });
  it('waits for manual damage, rejects generic apply, repeats, objects and out-of-range targets', () => {
    vi.spyOn(Math,'random').mockReturnValue(.5);
    const f=setup(true),first=f.target(),near=f.target(200),far=f.target(10000);
    f.cast(first.id,3); const entry=f.last();
    expect(resolveOrbLeap(f.session.id,entry.id,near.id).ok).toBe(false);
    resolveForcedSave(f.session.id,entry.id,near.id);
    expect(getMonster(near.refId)!.curHp).toBe(1000);
    expect(resolveAttackDamage(f.session.id,'Caster',entry.id)).toBe(true);
    const duplicate=createToken({mapId:f.map.id,kind:'monster',refId:first.refId,x:200,y:100});
    expect(resolveOrbLeap(f.session.id,entry.id,duplicate.id).ok).toBe(false);
    expect(resolveOrbLeap(f.session.id,entry.id,far.id).ok).toBe(false);
    updateMonster(near.refId,{objectKind:'chest'});
    expect(resolveOrbLeap(f.session.id,entry.id,near.id).ok).toBe(false);
    expect(getRollEntry(entry.id)?.apply?.orb?.available).toBe(true);
    expect(resolveOrbLeap(f.session.id,entry.id,f.target().id)).toEqual({ok:true});
    expect(f.last().pending?.done).toBeUndefined();
  });
  it('ends on a miss or nonmatching damage, but immunity keeps matches', () => {
    const random=vi.spyOn(Math,'random').mockReturnValue(0);
    const f=setup(),t=f.target(); f.cast(t.id);
    expect(f.last().apply?.orb?.available).toBe(false);
    random.mockReturnValue(.5).mockReturnValueOnce(.5).mockReturnValueOnce(.01).mockReturnValueOnce(.2).mockReturnValueOnce(.3);
    f.cast(t.id); expect(f.last().apply?.orb?.available).toBe(false);
    updateMonster(t.refId,{immunities:['lightning']}); f.cast(t.id);
    expect(f.last().apply?.orb?.available).toBe(true);
    expect(f.last().pending).toBeUndefined();
  });
  it('includes critical damage dice, supports an untargeted cast, and persists ending the spell', () => {
    vi.spyOn(Math,'random').mockReturnValue(.999);
    const f=setup(); f.cast(undefined,3);
    expect(f.last().apply?.orb?.initial).toBe(true);
    expect(resolveOrbLeap(f.session.id,f.last().id,f.target().id).ok).toBe(true);
    expect(f.last().apply?.orb?.leapsUsed).toBe(0);
    expect(f.last().apply?.orb?.matches).toHaveLength(10);
    expect(resolveOrbLeap(f.session.id,f.last().id,undefined,true).ok).toBe(true);
    expect(f.last().apply?.orb?.available).toBe(false);
  });
});
