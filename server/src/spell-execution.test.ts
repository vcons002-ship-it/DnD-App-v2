import { afterEach, describe, expect, it, vi } from 'vitest';
import { criticalDiceExpression, effectiveSheetAbility, isMultiTargetSpell, spellcastingKeyFor, spellInstanceCount, spellDamageTypeChoices } from '../../shared/spellExecution.js';
import { spellAttackBonus, spellSaveDC } from '../../shared/spellMath.js';
import type { SheetAbility } from '../../shared/types.js';
import { resolveAbilityRoll, resolveAttackDamage, resolveForcedSave } from './combat.js';
import {
  createSession, createMap, setActiveMap, createCharacter, createToken,
  createMonsterTemplate, instantiateMonster, getMonster, getCharacter,
  getRollEntry, listRollLog, setManualDamage, setSheetAbility, addRollLog,
  applyDamage,
  updateMonster,
} from './sessions.js';
import { getSpell } from './spells/srd.js';

afterEach(() => vi.restoreAllMocks());

const spell = (name: string): SheetAbility => ({ ...getSpell(name)!, id: `test-${name}` });
function fixture() {
  const session = createSession('Spell execution');
  const map = createMap(session.id, { name: 'Test map' });
  setActiveMap(session.id, map.id);
  const caster = createCharacter(session.id, { name: 'Caster', className: 'Sorcerer', level: 6,
    stats: { INT: 20, WIS: 10, CHA: 16 } });
  const target = (name = 'Target') => {
    const template = createMonsterTemplate(session.id, { name, maxHp: 100, armorClass: 1, stats: { DEX: 10, WIS: 10 } });
    const monster = instantiateMonster(template.id)!;
    const token = createToken({ mapId: map.id, kind: 'monster', refId: monster.id, x: 100, y: 100 });
    return { monster, token };
  };
  return { session, map, caster, target };
}

describe('reviewed runtime spell profiles preserve authored sheets', () => {
  it('fills control spell saves without changing saved entries or automating conditions', () => {
    const raw = spell('Hold Person');
    const before = structuredClone(raw);
    expect(raw.roll).toBeUndefined();
    expect(effectiveSheetAbility(raw).roll).toMatchObject({ kind: 'save', save: 'WIS', saveDamage: 'none', targetMode: 'single' });
    expect(effectiveSheetAbility(raw, 3).roll?.targetMode).toBe('multiple');
    expect(isMultiTargetSpell(raw, 3)).toBe(true);
    expect(raw).toEqual(before);
    expect(effectiveSheetAbility(spell('Hypnotic Pattern')).roll).toMatchObject({ save: 'WIS', targetMode: 'multiple' });
    expect(effectiveSheetAbility(spell('Command')).roll).toMatchObject({ save: 'WIS', targetMode: 'single' });
  });
  it('respects manual opt-out, custom source, different levels/kinds, and explicit fields', () => {
    for (const changed of [
      { ...spell('Hold Person'), executionProfile: 'manual' as const },
      { ...spell('Hold Person'), source: 'custom' as const },
      { ...spell('Hold Person'), level: 5 },
      { ...spell('Hold Person'), roll: { kind: 'damage' as const, dice: '1d6' } },
    ]) expect(effectiveSheetAbility(changed)).toBe(changed);
    const edited: SheetAbility = { ...spell('Sacred Flame'), roll: { kind: 'save', dice: '7d6', save: 'DEX', saveDamage: 'half', targetMode: 'multiple', castingAbility: 'INT' } };
    expect(effectiveSheetAbility(edited).roll).toMatchObject(edited.roll!);
    const differentSave = { ...edited, roll: { ...edited.roll!, save: 'STR' } };
    expect(effectiveSheetAbility(differentSave)).toBe(differentSave);
  });
  it('keeps area spells multi-target and distinguishes no-damage saves', () => {
    expect(isMultiTargetSpell(spell('Fireball'))).toBe(true);
    expect(isMultiTargetSpell(spell('Magic Missile'))).toBe(true);
    expect(isMultiTargetSpell(spell('Sacred Flame'))).toBe(false);
    expect(effectiveSheetAbility(spell('Sacred Flame')).roll?.saveDamage).toBe('none');
    expect(effectiveSheetAbility(spell('Disintegrate')).roll?.saveDamage).toBe('none');
    expect(effectiveSheetAbility(spell('Fireball')).roll?.saveDamage).toBe('half');
    expect(isMultiTargetSpell({ id: 'feature', type: 'ability', name: 'Feature', description: '', roll: { kind: 'damage', dice: '1d6' } })).toBe(false);
  });
  it('uses explicit or unambiguous class casting ability; unknown multiclass remains legacy', () => {
    const fire = spell('Fire Bolt');
    expect(spellcastingKeyFor({ className: 'Sorcerer' }, fire)).toBe('CHA');
    expect(spellcastingKeyFor({ className: 'Ranger' }, fire)).toBe('WIS');
    expect(spellcastingKeyFor({ className: 'Fighter', subclass: 'Eldritch Knight' }, fire)).toBe('INT');
    expect(spellcastingKeyFor({ className: 'Wizard / Sorcerer' }, fire)).toBeUndefined();
    expect(spellcastingKeyFor({ className: 'Sorcerer' }, { ...fire, roll: { ...fire.roll!, castingAbility: 'WIS' } })).toBe('WIS');
    const stats = { INT: 20, WIS: 10, CHA: 16 };
    expect(spellSaveDC(6, stats, 'CHA')).toBe(14);
    expect(spellAttackBonus(6, stats, 'CHA')).toBe(6);
    expect(spellSaveDC(6, stats)).toBe(16); // existing fallback is retained
  });
});

describe('multi-ray spells reuse the cast while resolving separate attacks', () => {
  it('scales ray counts instead of per-ray dice, without rewriting saved formulae', () => {
    const scorching = spell('Scorching Ray'), blast = spell('Eldritch Blast');
    const original = structuredClone(blast);
    expect(spellInstanceCount(effectiveSheetAbility(scorching).roll!, 2, 6)).toBe(3);
    expect(spellInstanceCount(effectiveSheetAbility(scorching).roll!, 4, 6)).toBe(5);
    expect(effectiveSheetAbility(blast).roll?.scaleDice).toBeUndefined();
    for (const [level, beams] of [[1, 1], [5, 2], [11, 3], [17, 4]])
      expect(spellInstanceCount(effectiveSheetAbility(blast).roll!, 0, level)).toBe(beams);
    expect(blast).toEqual(original);
    expect(isMultiTargetSpell(scorching)).toBe(true);
    expect(isMultiTargetSpell(blast)).toBe(true);
    expect(effectiveSheetAbility({ ...blast, source: 'custom' }).roll).toEqual(blast.roll);
    const changed = { ...scorching, roll: { ...scorching.roll!, dice: '7d6' } };
    expect(effectiveSheetAbility(changed)).toBe(changed);
  });
  it('assigns rays to multiple or repeated targets with a server-owned budget', () => {
    const f = fixture(), a = f.target('A'), b = f.target('B');
    setManualDamage(f.session.id, false);
    vi.spyOn(Math, 'random').mockReturnValue(.5);
    resolveAbilityRoll(f.session.id, 'Caster', f.caster, spell('Scorching Ray'), 2, undefined, a.token.id);
    const cast = listRollLog(f.session.id).at(-1)!;
    expect(cast.apply).toMatchObject({ attacks: 3, dice: '2d6', owner: f.caster.id });
    expect(getMonster(a.monster.id)!.curHp).toBe(100); // target selection is deliberate per ray
    for (const [index, target] of [a, b, a].entries()) resolveForcedSave(f.session.id, cast.id, target.token.id, undefined, index);
    expect(getMonster(a.monster.id)!.curHp).toBe(84);
    expect(getMonster(b.monster.id)!.curHp).toBe(92);
    expect(getRollEntry(cast.id)?.apply?.consumedAttacks).toBe(3);
    const length = listRollLog(f.session.id).length;
    resolveForcedSave(f.session.id, cast.id, a.token.id, undefined, 3);
    expect(listRollLog(f.session.id)).toHaveLength(length);
  });
  it('waits for each pending damage step and rejects replayed ray indexes', () => {
    const f = fixture(), t = f.target();
    vi.spyOn(Math, 'random').mockReturnValue(.5);
    resolveAbilityRoll(f.session.id, 'Caster', f.caster, spell('Scorching Ray'), 2);
    const cast = listRollLog(f.session.id).at(-1)!;
    resolveForcedSave(f.session.id, cast.id, t.token.id, undefined, 0);
    const hit = listRollLog(f.session.id).at(-1)!;
    expect(hit.pending).toMatchObject({ amount: 8, sourceRollId: cast.id });
    resolveForcedSave(f.session.id, cast.id, t.token.id, undefined, 1);
    expect(getRollEntry(cast.id)?.apply?.consumedAttacks).toBe(1);
    expect(getMonster(t.monster.id)!.curHp).toBe(100);
    resolveAttackDamage(f.session.id, 'Caster', hit.id);
    expect(getMonster(t.monster.id)!.curHp).toBe(92);
    resolveForcedSave(f.session.id, cast.id, t.token.id, undefined, 0);
    expect(getRollEntry(cast.id)?.apply?.consumedAttacks).toBe(1);
    resolveForcedSave(f.session.id, cast.id, t.token.id, undefined, 1);
    expect(getRollEntry(cast.id)?.apply?.consumedAttacks).toBe(2);
    expect(listRollLog(f.session.id).at(-1)?.pending?.sourceRollId).toBe(cast.id);
  });
  it('uses the initially armed advantage only for the first ray, with fresh overrides after that', () => {
    const f = fixture(), t = f.target();
    setManualDamage(f.session.id, false);
    const random = vi.spyOn(Math, 'random').mockReturnValue(.5);
    resolveAbilityRoll(f.session.id, 'Caster', f.caster, spell('Scorching Ray'), 2, 'adv');
    const cast = listRollLog(f.session.id).at(-1)!;
    resolveForcedSave(f.session.id, cast.id, t.token.id, undefined, 0);
    expect(listRollLog(f.session.id).at(-1)?.detail).toContain('adv');
    random.mockClear();
    resolveForcedSave(f.session.id, cast.id, t.token.id, undefined, 1);
    expect(listRollLog(f.session.id).at(-1)?.detail).not.toContain('adv');
    expect(random).toHaveBeenCalledTimes(3); // one d20 and two d6, not two d20s
    resolveForcedSave(f.session.id, cast.id, t.token.id, 'dis', 2);
    expect(listRollLog(f.session.id).at(-1)?.detail).toContain('dis');
  });
});

describe('reviewed healing formula fixes', () => {
  it('Second Wind heals the Fighter, includes Fighter level, and leaves authored dice intact', () => {
    const f = fixture();
    const fighter = createCharacter(f.session.id, { name: 'Druk', className: 'Fighter', level: 6, maxHp: 50 });
    const original = spell('Second Wind');
    setSheetAbility('pc', fighter.id, original);
    applyDamage('pc', fighter.id, 30);
    const other = f.target();
    vi.spyOn(Math, 'random').mockReturnValue(0);
    resolveAbilityRoll(f.session.id, 'Druk', getCharacter(fighter.id)!, original, undefined, undefined, other.token.id);
    expect(getCharacter(fighter.id)!.curHp).toBe(27); // 20 + 1d10[1] + Fighter 6
    expect(getMonster(other.monster.id)!.curHp).toBe(100);
    expect(listRollLog(f.session.id).at(-1)?.detail).toContain('+ 6 Fighter level');
    expect(getCharacter(fighter.id)!.sheetAbilities[0]).toEqual(original);
    const custom = { ...original, source: 'custom' as const };
    expect(effectiveSheetAbility(custom)).toBe(custom);
    const baked = { ...original, roll: { kind: 'heal' as const, dice: '1d10+6' } };
    expect(effectiveSheetAbility(baked)).toBe(baked); // never adds level twice
  });
  it('known fixed healing omits casting modifier; Cure Wounds still includes the class casting modifier', () => {
    const f = fixture(), t = f.target();
    applyDamage('monster', t.monster.id, 95);
    vi.spyOn(Math, 'random').mockReturnValue(0);
    resolveAbilityRoll(f.session.id, 'Caster', f.caster, spell('Heal'), 6, undefined, t.token.id);
    expect(getMonster(t.monster.id)!.curHp).toBe(75); // +70, not +CHA or highest INT
    resolveAbilityRoll(f.session.id, 'Caster', f.caster, spell('Regenerate'), 7, undefined, t.token.id);
    expect(getMonster(t.monster.id)!.curHp).toBe(94); // +4d8[1,1,1,1]+15
    resolveAbilityRoll(f.session.id, 'Caster', f.caster, spell('Cure Wounds'), 1, undefined, t.token.id);
    expect(getMonster(t.monster.id)!.curHp).toBe(99); // +2d8[1,1] +CHA3
    expect(effectiveSheetAbility(spell('Prayer of Healing')).roll?.healingBonus).toBe('none');
    const edited = { ...spell('Heal'), roll: { ...spell('Heal').roll!, healingBonus: 'spellcasting' as const } };
    expect(effectiveSheetAbility(edited).roll?.healingBonus).toBe('spellcasting');
  });
});

describe('spell save workflow', () => {
  it('base Hold Person targets and logs a save without any damage or new target condition', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const f = fixture(), t = f.target();
    const ability = spell('Hold Person');
    setSheetAbility('pc', f.caster.id, ability);
    expect(resolveAbilityRoll(f.session.id, 'Caster', f.caster, ability, 2, undefined, t.token.id)).toBe(true);
    const logs = listRollLog(f.session.id), cast = logs.find((e) => e.apply)!;
    expect(cast.apply).toMatchObject({ amount: 0, save: 'WIS', dc: 14, saveDamage: 'none', targetMode: 'single', owner: f.caster.id, consumedTargets: [t.token.id] });
    expect(logs.at(-1)?.detail).toContain('FAIL');
    expect(getMonster(t.monster.id)!.curHp).toBe(100);
    expect(getMonster(t.monster.id)!.conditions).toEqual([]);
    expect(getCharacter(f.caster.id)!.sheetAbilities[0]).toEqual(ability);
    expect(getCharacter(f.caster.id)!.conditions.some((c) => c.isConcentration)).toBe(true); // existing behavior
    const other = f.target('Other');
    const count = logs.length;
    resolveForcedSave(f.session.id, cast.id, other.token.id);
    expect(listRollLog(f.session.id)).toHaveLength(count); // no second target from one base cast
  });
  it('upcast Hold Person and Hypnotic Pattern keep a reusable save-only multi-target payload', () => {
    vi.spyOn(Math, 'random').mockReturnValue(.99);
    const f = fixture(), a = f.target('A'), b = f.target('B');
    for (const [name, level] of [['Hold Person', 3], ['Hypnotic Pattern', 3]] as const) {
      resolveAbilityRoll(f.session.id, 'Caster', f.caster, spell(name), level, undefined, a.token.id);
      const cast = listRollLog(f.session.id).at(-1)!;
      expect(cast.apply).toMatchObject({ amount: 0, targetMode: 'multiple' });
      expect(cast.apply?.consumedTargets).toBeUndefined();
      resolveForcedSave(f.session.id, cast.id, a.token.id);
      resolveForcedSave(f.session.id, cast.id, b.token.id);
      expect(getRollEntry(cast.id)?.apply?.consumedTargets).toEqual([a.token.id, b.token.id]);
      const length = listRollLog(f.session.id).length;
      resolveForcedSave(f.session.id, cast.id, a.token.id);
      expect(listRollLog(f.session.id)).toHaveLength(length);
    }
    expect(getMonster(a.monster.id)!.curHp).toBe(100);
    expect(getMonster(b.monster.id)!.conditions).toEqual([]);
  });
  it('successful Sacred Flame does no damage; Fireball still halves the one rolled total', () => {
    vi.spyOn(Math, 'random').mockReturnValue(.99);
    const f = fixture(), t = f.target();
    resolveAbilityRoll(f.session.id, 'Caster', f.caster, spell('Sacred Flame'), 0, undefined, t.token.id);
    expect(listRollLog(f.session.id).at(-1)?.detail).toContain('PASS');
    expect(getMonster(t.monster.id)!.curHp).toBe(100);
    resolveAbilityRoll(f.session.id, 'Caster', f.caster, spell('Fireball'), 3, undefined, t.token.id);
    const cast = listRollLog(f.session.id).at(-1)!;
    expect(cast.total).toBe(48);
    expect(getMonster(t.monster.id)!.curHp).toBe(100); // no automatic area application
    resolveForcedSave(f.session.id, cast.id, t.token.id);
    expect(getMonster(t.monster.id)!.curHp).toBe(76);
  });
  it('failed no-damage-on-success save still takes full damage, and authored save-only rolls work', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const f = fixture(), t = f.target();
    resolveAbilityRoll(f.session.id, 'Caster', f.caster, spell('Sacred Flame'), 0, undefined, t.token.id);
    expect(getMonster(t.monster.id)!.curHp).toBe(98); // two minimum d8s at level 6
    const authored: SheetAbility = { id: 'custom', name: 'Custom save', type: 'spell', level: 1, description: '', source: 'custom',
      roll: { kind: 'save', save: 'CON', dc: 22, targetMode: 'single', saveDamage: 'none' } };
    expect(resolveAbilityRoll(f.session.id, 'Caster', f.caster, authored, 1, undefined, t.token.id)).toBe(true);
    const cast = listRollLog(f.session.id).find((e) => e.expr === 'Custom save' && e.apply)!;
    expect(cast.apply?.dc).toBe(22);
    expect(getMonster(t.monster.id)!.curHp).toBe(98);
  });
  it('rejects cross-session caster, target, source roll and pending damage without changing either session', () => {
    const a = fixture(), b = fixture(), ta = a.target(), tb = b.target();
    expect(resolveAbilityRoll(a.session.id, 'Caster', a.caster, spell('Hold Person'), 2, undefined, tb.token.id)).toBe(false);
    expect(resolveAbilityRoll(a.session.id, 'Caster', b.caster, spell('Fireball'))).toBe(false);
    expect(getCharacter(a.caster.id)!.conditions).toEqual([]);
    const source = addRollLog(a.session.id, { roller: 'Caster', label: 'Damage', expr: 'test', total: 10, detail: '', apply: { amount: 10, dc: 1 } });
    expect(getRollEntry(source.id, b.session.id)).toBeNull();
    resolveForcedSave(b.session.id, source.id, tb.token.id);
    resolveForcedSave(a.session.id, source.id, tb.token.id);
    expect(getMonster(tb.monster.id)!.curHp).toBe(100);
    expect(getRollEntry(source.id)?.apply?.consumedTargets).toBeUndefined();
    const pending = addRollLog(a.session.id, { roller: 'Caster', label: 'Attack', expr: 'test', total: 20, detail: '', pending: {
      target: { kind: 'monster', refId: ta.monster.id, name: 'Target' }, attacker: { kind: 'pc', refId: a.caster.id }, weapon: 'test', amount: 10, crit: false, dice: [], mods: [],
    } });
    expect(resolveAttackDamage(b.session.id, 'Caster', pending.id)).toBe(false);
    expect(getMonster(ta.monster.id)!.curHp).toBe(100);
    expect(getRollEntry(pending.id)?.pending?.done).toBeUndefined();
  });
});

describe('spell attack damage follows the existing two-step setting', () => {
  it('requires a valid Chromatic Orb type and applies that type to resistance without editing the spell', () => {
    const f = fixture(), t = f.target();
    const orb = spell('Chromatic Orb'), original = structuredClone(orb);
    updateMonster(t.monster.id, { resistances: ['fire'] });
    vi.spyOn(Math, 'random').mockReturnValue(.5);
    expect(spellDamageTypeChoices(orb)).toEqual(['acid', 'cold', 'fire', 'lightning', 'poison', 'thunder']);
    expect(resolveAbilityRoll(f.session.id, 'Caster', f.caster, orb, 1, undefined, t.token.id)).toBe(false);
    expect(resolveAbilityRoll(f.session.id, 'Caster', f.caster, orb, 1, undefined, t.token.id, 'force')).toBe(false);
    expect(listRollLog(f.session.id)).toEqual([]);
    expect(resolveAbilityRoll(f.session.id, 'Caster', f.caster, orb, 1, undefined, t.token.id, 'fire')).toBe(true);
    expect(listRollLog(f.session.id).at(-1)?.pending).toMatchObject({ amount: 7, damageType: 'fire' }); // 3d8[5,5,5], resisted
    expect(orb).toEqual(original);
    const fixed = { ...orb, roll: { ...orb.roll!, damageType: 'cold' } };
    expect(spellDamageTypeChoices(fixed)).toEqual([]);
    resolveAbilityRoll(f.session.id, 'Caster', f.caster, fixed, 1, undefined, t.token.id, 'fire');
    expect(listRollLog(f.session.id).at(-1)?.pending).toMatchObject({ amount: 15, damageType: 'cold' });
    expect(spellDamageTypeChoices({ ...orb, source: 'custom' })).toEqual([]);
  });
  it('parks damage, applies once, and keeps flat bonuses single on a critical hit', () => {
    vi.spyOn(Math, 'random').mockReturnValue(.999);
    const f = fixture(), t = f.target();
    const ability: SheetAbility = { id: 'flat', name: 'Test bolt', type: 'spell', level: 0, description: '',
      roll: { kind: 'attack', dice: '2d1+5', damageType: 'fire' } };
    expect(criticalDiceExpression('2d1+5+1d6-2')).toBe('2d1+1d6');
    expect(criticalDiceExpression('10')).toBe('');
    resolveAbilityRoll(f.session.id, 'Caster', f.caster, ability, 0, undefined, t.token.id);
    const entry = listRollLog(f.session.id).at(-1)!;
    expect(entry.pending).toMatchObject({ amount: 9, crit: true, owner: f.caster.id });
    expect(entry.reveal?.damage).toBeUndefined();
    expect(getMonster(t.monster.id)!.curHp).toBe(100);
    expect(resolveAttackDamage(f.session.id, 'Caster', entry.id)).toBe(true);
    expect(getMonster(t.monster.id)!.curHp).toBe(91);
    expect(resolveAttackDamage(f.session.id, 'Caster', entry.id)).toBe(false);
    expect(getMonster(t.monster.id)!.curHp).toBe(91);
  });
  it('retains automatic damage when the setting is off and permits a genuine zero-damage hit', () => {
    vi.spyOn(Math, 'random').mockReturnValue(.5);
    const f = fixture(), t = f.target();
    setManualDamage(f.session.id, false);
    const ability: SheetAbility = { id: 'zero', name: 'Test attack', type: 'spell', description: '', roll: { kind: 'attack', dice: '0' } };
    resolveAbilityRoll(f.session.id, 'Caster', f.caster, ability, undefined, undefined, t.token.id);
    expect(getMonster(t.monster.id)!.curHp).toBe(100);
    expect(listRollLog(f.session.id).at(-1)?.pending).toBeUndefined();
    resolveAbilityRoll(f.session.id, 'Caster', f.caster, { ...ability, roll: { kind: 'attack', dice: '2d1+5' } }, undefined, undefined, t.token.id);
    expect(getMonster(t.monster.id)!.curHp).toBe(93);
  });
});
