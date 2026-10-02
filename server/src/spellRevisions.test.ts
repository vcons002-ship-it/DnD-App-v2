import { describe, expect, it } from 'vitest';
import { SPELL_REVISIONS_2024, matchesRevisedSpell2024, revisedSpellAbility2024 } from '../../shared/spellRevisions.js';
import { effectiveSheetAbility, isCanonicalHasteProfile, isMultiTargetSpell, spellDamageTypeChoices } from '../../shared/spellExecution.js';
import { effectiveDice } from '../../shared/spellMath.js';
import { withDiceSource } from '../../shared/dice.js';
import type { AbilityRoll, SheetAbility } from '../../shared/types.js';
import { getAllSpells } from './spells/srd.js';
import { SPELL_LIST } from './spells/spellList.js';
import { resolveAbilityRoll, resolveAttackDamage, resolveForcedSave } from './combat.js';
import { createSession, createMap, setActiveMap, createCharacter, createToken, createMonsterTemplate,
  instantiateMonster, getCharacter, getMonster, listRollLog, getRollEntry, setManualDamage, setTempHp,
  updateCharacter, updateMonster } from './sessions.js';

const key = (name: string) => name.toLowerCase().replace(/[’‘]/g, "'");
const spell = (name: string): SheetAbility => {
  const entry = getAllSpells().find(entry => key(entry.name) === name);
  if (!entry) throw new Error(`Missing spell ${name}`);
  return { ...entry, id: `revision-${name}` };
};

describe('reviewed 2024 catalogue corrections reach the full spell library', () => {
  it.each(SPELL_REVISIONS_2024)('corrects the actual comprehensive entry for $key', revision => {
    const comprehensive = SPELL_LIST.find(entry => key(entry.name) === revision.key)!;
    expect(comprehensive, revision.key).toBeTruthy();
    expect(comprehensive.roll).toEqual(revision.roll);
    expect(comprehensive.description).toBe(revision.description);
    expect(spell(revision.key).roll).toEqual(revision.roll);
    expect(matchesRevisedSpell2024(spell(revision.key))).toBe(true);
  });
  it('uses the verified Mass Cure Wounds scaling of one extra d8, not two', () => {
    const roll = effectiveSheetAbility(spell('mass cure wounds')).roll!;
    expect(roll).toMatchObject({ dice: '5d8', scaleDice: '1d8', targetMode: 'multiple', maxTargets: 6, healingBonus: 'spellcasting' });
    expect(effectiveDice(roll, { castLevel: 6 })).toBe('5d8+1d8');
    expect(isMultiTargetSpell(spell('mass cure wounds'))).toBe(true);
    const word = effectiveSheetAbility(spell('mass healing word')).roll!;
    expect(effectiveDice(word, { castLevel: 4 })).toBe('2d4+1d4');
    expect(word.maxTargets).toBe(6);
  });
  it('records both correct damage types without collapsing a mixed spell into a single type', () => {
    const expected = [
      ['ice storm', [{ dice: '2d10', damageType: 'bludgeoning', scaleDice: '1d10' }, { dice: '4d6', damageType: 'cold' }]],
      ['flame strike', [{ dice: '5d6', damageType: 'fire', scaleDice: '1d6' }, { dice: '5d6', damageType: 'radiant', scaleDice: '1d6' }]],
      ['meteor swarm', [{ dice: '20d6', damageType: 'fire' }, { dice: '20d6', damageType: 'bludgeoning' }]],
    ] as const;
    for (const [name, components] of expected) {
      expect(SPELL_REVISIONS_2024.find(entry => entry.key === name)?.components).toEqual(components);
      expect(effectiveSheetAbility(spell(name)).roll).toBeUndefined();
    }
  });
  it('offers the seven legal Sorcerous Burst damage types without Force', () => {
    expect(spellDamageTypeChoices(spell('sorcerous burst'))).toEqual(['acid', 'cold', 'fire', 'lightning', 'poison', 'psychic', 'thunder']);
    expect(spell('sorcerous burst').description).toMatch(/extra.*manually/);
  });
  it('keeps the revised Conjure spirit areas manual without obsolete creature placeholders', () => {
    for (const name of ['conjure animals', 'conjure woodland beings']) {
      const entry = spell(name);
      expect(entry.summon).toBeUndefined(); expect(entry.roll).toBeUndefined();
      expect(entry.meta).toContain('10 minutes');
      expect(entry.description).toMatch(/manually/);
    }
    expect(spell('conjure animals').description).toContain('3d10 Slashing');
    expect(spell('conjure woodland beings').description).toContain('5d8 Force');
    expect(spell('flame blade').classes).toContain('sorcerer');
  });
  it('uses 2024 concentration, ranges, and spellcasting damage bonuses', () => {
    expect(spell('spiritual weapon').tags).toContain('concentration');
    expect(spell('mordenkainen\'s sword').tags).not.toContain('concentration');
    expect(spell('mordenkainen\'s sword').meta).toContain('90 ft');
    expect(spell('witch bolt').meta).toContain('60 ft');
    for (const name of ['flame blade', 'spiritual weapon', 'mordenkainen\'s sword'])
      expect(spell(name).roll?.damageBonus).toBe('spellcasting');
    expect(effectiveDice(spell('flame blade').roll!, { castLevel: 4 })).toBe('3d6+1d6+1d6');
    expect(effectiveDice(spell('spiritual weapon').roll!, { castLevel: 4 })).toBe('1d8+1d8+1d8');
  });
});

describe('unchanged saved profiles update conservatively without rewriting sheets', () => {
  it.each(SPELL_REVISIONS_2024)('upgrades only the shipped $key profile and remains idempotent', revision => {
    const saved: SheetAbility = { ...spell(revision.key), source: 'srd',
      description: 'The saved spell text stays available.', meta: revision.legacyMeta ?? 'Authored range',
      roll: { ...revision.legacy, castingAbility: 'CHA' }, sourceClass: 'warlock' };
    const before = structuredClone(saved), next = revisedSpellAbility2024(saved);
    expect(next).not.toBe(saved);
    expect(next.roll).toEqual(revision.roll ? { ...revision.roll, castingAbility: 'CHA' } : undefined);
    expect(next.description).toBe(before.description);
    expect(next.sourceClass).toBe('warlock');
    expect(next.id).toBe(before.id);
    expect(revisedSpellAbility2024(next)).toBe(next);
    expect(saved).toEqual(before);
  });
  it('retains custom/manual, changed formula, level, save, and added authored mechanics', () => {
    const revision = SPELL_REVISIONS_2024.find(entry => entry.key === 'inflict wounds')!;
    const saved: SheetAbility = { ...spell('inflict wounds'), roll: { ...revision.legacy }, source: 'srd' };
    const variants: SheetAbility[] = [
      { ...saved, source: 'custom' }, { ...saved, executionProfile: 'manual' },
      { ...saved, level: 3 }, { ...saved, roll: { ...saved.roll!, dice: '7d6' } },
      { ...saved, roll: { ...saved.roll!, damageType: 'cold' } },
      { ...saved, roll: { ...saved.roll!, damageBonus: 'spellcasting' } },
      { ...saved, roll: { ...saved.roll!, targetMode: 'single' } },
      { ...saved, roll: { ...saved.roll!, kind: 'save', save: 'WIS' } },
    ];
    for (const variant of variants) {
      const before = structuredClone(variant);
      expect(revisedSpellAbility2024(variant)).toBe(variant);
      expect(effectiveSheetAbility(variant)).toBe(variant);
      expect(variant).toEqual(before);
    }
  });
  it('keeps an authored range while updating an unchanged old formula', () => {
    const revision = SPELL_REVISIONS_2024.find(entry => entry.key === 'witch bolt')!;
    const saved: SheetAbility = { ...spell('witch bolt'), meta: 'Range 120 ft', roll: { ...revision.legacy } };
    expect(revisedSpellAbility2024(saved).meta).toBe('Range 120 ft');
    expect(revisedSpellAbility2024(saved).roll?.dice).toBe('2d12');
  });
  it('normalizes Haste only when its saved profile is the canonical damage-free buff', () => {
    const haste = spell('haste');
    expect(effectiveSheetAbility(haste).roll).toMatchObject({ kind: 'damage', dice: '0', targetMode: 'single' });
    const rolls: AbilityRoll[] = [
      { kind: 'heal', dice: '2d8' }, { kind: 'damage', dice: '1d6' },
      { kind: 'attack', dice: '0' }, { kind: 'save', save: 'WIS' },
      { kind: 'damage', dice: '0', targetMode: 'multiple' }, { kind: 'damage', dice: '0', dc: 22 },
    ];
    for (const roll of rolls) {
      const edited = { ...haste, roll }, before = structuredClone(roll);
      expect(effectiveSheetAbility(edited)).toBe(edited);
      expect(edited.roll).toEqual(before);
    }
    const scoped: SheetAbility = { ...haste, roll: { kind: 'damage', dice: '0', baseLevel: 3, castingAbility: 'CHA' } };
    expect(effectiveSheetAbility(scoped).roll?.castingAbility).toBe('CHA');
    for (const notHaste of [spell('counterspell'), { ...haste, type: 'ability' as const },
      { ...haste, source: 'custom' as const }, { ...haste, executionProfile: 'manual' as const }]) {
      expect(isCanonicalHasteProfile(notHaste)).toBe(false);
      expect(effectiveSheetAbility(notHaste)).toBe(notHaste);
    }
  });
});

function arena() {
  const session = createSession('Spell revisions');
  const map = createMap(session.id, { name: 'Revision arena' }); setActiveMap(session.id, map.id);
  const caster = createCharacter(session.id, { name: 'Caster', className: 'Cleric', level: 9,
    stats: { STR: 12, DEX: 12, CON: 14, INT: 20, WIS: 16, CHA: 12 }, maxHp: 60 });
  const self = createToken({ mapId: map.id, kind: 'pc', refId: caster.id, x: 100, y: 100 });
  const target = (name: string) => {
    const monster = instantiateMonster(createMonsterTemplate(session.id, { name, maxHp: 120, armorClass: 1,
      stats: { STR: 10, CON: 10, WIS: 10, DEX: 10 } }).id)!;
    const token = createToken({ mapId: map.id, kind: 'monster', refId: monster.id, x: 150, y: 100 });
    return { monster, token };
  };
  return { session, map, caster, self, target };
}

describe('corrected spells run through the real server combat paths', () => {
  it('False Life gives temporary HP to its caster without healing, casting bonus, or smaller-pool replacement', () => {
    const f = arena(), target = f.target('Other'); updateCharacter(f.caster.id, { curHp: 10 });
    const calls: number[][] = [];
    withDiceSource(sides => { calls.push(sides); return sides.map(() => 2); }, () => {
      expect(resolveAbilityRoll(f.session.id, 'Caster', getCharacter(f.caster.id)!, spell('false life'), 2, undefined, target.token.id)).toBe(true);
    });
    expect(calls).toEqual([[4, 4]]);
    expect(getCharacter(f.caster.id)).toMatchObject({ curHp: 10, tempHp: 13 }); // 2+2+4+5; no WIS3
    expect(getMonster(target.monster.id)!.curHp).toBe(120);
    const result = listRollLog(f.session.id).at(-1)!;
    expect(result.reveal).toMatchObject({ damage: 13, target: 'Caster' });
    expect(result.reveal?.damageMods?.some(mod => /modifier/.test(mod.label))).toBe(false);
    setTempHp('pc', f.caster.id, 30);
    withDiceSource(sides => sides.map(() => 1), () => resolveAbilityRoll(f.session.id, 'Caster', getCharacter(f.caster.id)!, spell('false life'), 1));
    expect(getCharacter(f.caster.id)!.tempHp).toBe(30);
  });
  it('Inflict Wounds rolls Constitution and halves its corrected two-d10 damage on a successful save', () => {
    const f = arena(), target = f.target('Target'), calls: number[][] = [];
    withDiceSource(sides => { calls.push(sides); return sides.map(die => die === 20 ? 20 : 4); }, () => {
      expect(resolveAbilityRoll(f.session.id, 'Caster', f.caster, spell('inflict wounds'), 1, undefined, target.token.id)).toBe(true);
    });
    expect(calls).toEqual([[10, 10], [20]]);
    expect(getMonster(target.monster.id)!.curHp).toBe(116);
    const result = listRollLog(f.session.id).at(-1)!;
    expect(result.reveal?.outcome).toBe('pass');
    expect(result.label).toMatch(/CON.*save/i);
  });
  it('Poison Spray resolves an attack before damage instead of using the obsolete Constitution save', () => {
    const f = arena(), target = f.target('Target'), calls: number[][] = [];
    setManualDamage(f.session.id, true);
    withDiceSource(sides => { calls.push(sides); return sides.map(() => 9); }, () => {
      expect(resolveAbilityRoll(f.session.id, 'Caster', f.caster, spell('poison spray'), 0, undefined, target.token.id)).toBe(true);
    });
    expect(calls[0]).toEqual([20]);
    const hit = listRollLog(f.session.id).at(-1)!;
    expect(hit.pending).toBeTruthy(); expect(getMonster(target.monster.id)!.curHp).toBe(120);
    withDiceSource(sides => { calls.push(sides); return sides.map(() => 4); }, () => resolveAttackDamage(f.session.id, 'Caster', hit.id));
    expect(calls.flat()).toEqual([20, 12, 12]); // level 9 cantrip: 2d12
    expect(getMonster(target.monster.id)!.curHp).toBe(102); // queued damage retains the original two faces of 9
  });
  it('Mass Cure Wounds rolls once and applies the same healing to six distinct creatures at most', () => {
    const f = arena(), targets = Array.from({ length: 7 }, (_, i) => f.target(`Ally ${i}`));
    for (const { monster } of targets) updateMonster(monster.id, { curHp: 10 });
    const calls: number[][] = [];
    withDiceSource(sides => { calls.push(sides); return sides.map(() => 2); }, () => {
      expect(resolveAbilityRoll(f.session.id, 'Caster', f.caster, spell('mass cure wounds'), 5, undefined, f.self.id)).toBe(true);
      const cast = listRollLog(f.session.id).at(-1)!;
      expect(cast.apply).toMatchObject({ amount: 13, healing: true, maxTargets: 6 });
      expect(getCharacter(f.caster.id)!.curHp).toBe(60); // choosing a target on cast does not apply
      for (const { token } of targets) resolveForcedSave(f.session.id, cast.id, token.id);
      resolveForcedSave(f.session.id, cast.id, targets[0].token.id);
      expect(getRollEntry(cast.id)?.apply?.consumedTargets).toHaveLength(6);
    });
    expect(calls).toEqual([[8, 8, 8, 8, 8]]);
    expect(targets.map(({ monster }) => getMonster(monster.id)!.curHp)).toEqual([23, 23, 23, 23, 23, 23, 10]);
  });
  it('a spellcasting damage modifier is added once on a critical spell attack', () => {
    const f = arena(), target = f.target('Target'); setManualDamage(f.session.id, true);
    withDiceSource(sides => sides.map(die => die === 20 ? 20 : 2), () => {
      expect(resolveAbilityRoll(f.session.id, 'Caster', f.caster, spell('mordenkainen\'s sword'), 7, undefined, target.token.id)).toBe(true);
      const hit = listRollLog(f.session.id).at(-1)!;
      expect(hit.pending?.crit).toBe(true);
      expect(resolveAttackDamage(f.session.id, 'Caster', hit.id)).toBe(true);
    });
    expect(getMonster(target.monster.id)!.curHp).toBe(101); // 8d12[2] + WIS3, never +WIS6
    const result = listRollLog(f.session.id).at(-1)!;
    expect(result.reveal?.damageMods).toContainEqual({ label: 'WIS modifier', value: 3 });
  });
});
