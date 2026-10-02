import { describe, expect, it } from 'vitest';
import { withDiceSource } from '../../shared/dice.js';
import type { SheetAbility } from '../../shared/types.js';
import { getSpell } from './spells/srd.js';
import { resolveAbilityRoll, resolveForcedSave } from './combat.js';
import {
  createSession, createCharacter, createMap, createToken, getCharacter,
  createMonsterTemplate, instantiateMonster, getMonster,
  listRollLog, setActiveMap, setConcentration, setTempHp, setDeathSaves, updateCharacter,
} from './sessions.js';

function arena() {
  const session = createSession('2024 healing'), map = createMap(session.id, { name: 'Healing arena' });
  setActiveMap(session.id, map.id);
  const caster = createCharacter(session.id, { name: 'Healer', className: 'Cleric', level: 13,
    maxHp: 100, curHp: 7, stats: { STR: 10, DEX: 10, CON: 10, WIS: 18, INT: 10, CHA: 10 } });
  const self = createToken({ mapId: map.id, kind: 'pc', refId: caster.id, x: 100, y: 100 });
  const recipients = Array.from({ length: 7 }, (_, index) => {
    const character = createCharacter(session.id, { name: `Ally ${index + 1}`, maxHp: 100, curHp: 1 });
    return { character, token: createToken({ mapId: map.id, kind: 'pc', refId: character.id, x: 150 + 50 * index, y: 100 }) };
  });
  const cast = (name: string, level?: number, targetId?: string, overrides: Partial<SheetAbility> = {}) => {
    const ability: SheetAbility = { ...getSpell(name)!, id: name, source: 'srd', sourceClass: 'cleric', ...overrides };
    expect(resolveAbilityRoll(session.id, caster.name, getCharacter(caster.id)!, ability, level ?? ability.level, undefined, targetId)).toBe(true);
    return [...listRollLog(session.id)].reverse().find(entry => entry.label === name)!;
  };
  return { session, map, caster, self, recipients, cast };
}

describe('temporary HP and shared healing rolls', () => {
  it('False Life upcasts temporary HP, keeps the larger pool, and never heals wounds', () => {
    const f = arena(); setTempHp('pc', f.caster.id, 30);
    const requests: number[][] = [];
    withDiceSource(sides => { requests.push(sides); return sides.map(() => 3); }, () => {
      const roll = f.cast('False Life', 3, f.recipients[0].token.id);
      expect(roll.total).toBe(20); // 2d4[3] + 4 + 10; never add WIS4.
      expect(roll.reveal?.title).toMatch(/Temporary HP/);
      expect(roll.apply).toBeUndefined();
    });
    expect(requests).toEqual([[4, 4]]);
    expect(getCharacter(f.caster.id)).toMatchObject({ curHp: 7, maxHp: 100, tempHp: 30 });
    expect(getCharacter(f.recipients[0].character.id)!.tempHp).toBe(0);
    setTempHp('pc', f.caster.id, 2);
    withDiceSource(sides => sides.map(() => 3), () => f.cast('False Life', 3));
    expect(getCharacter(f.caster.id)).toMatchObject({ curHp: 7, tempHp: 20 });
  });

  it.each([
    { name: 'Mass Healing Word', level: 4, sides: [4, 4, 4], total: 13 },
    { name: 'Mass Cure Wounds', level: 6, sides: [8, 8, 8, 8, 8, 8], total: 22 },
  ])('$name rolls once and applies the same total to six distinct creatures', ({ name, level, sides, total }) => {
    const f = arena(), requests: number[][] = [];
    setConcentration('pc', f.recipients[0].character.id, 'Bless');
    withDiceSource(pool => { requests.push(pool); return pool.map(() => 3); }, () => {
      const roll = f.cast(name, level, f.recipients[0].token.id);
      expect(roll.total).toBe(total);
      expect(roll.apply).toMatchObject({ healing: true, amount: total, maxTargets: 6, owner: f.caster.id });
      expect(getCharacter(f.recipients[0].character.id)!.curHp).toBe(1); // choose recipients after the one roll.
      expect(roll.reveal?.damageMods).toContainEqual({ label: 'WIS modifier', value: 4 });
      for (const { token } of f.recipients) resolveForcedSave(f.session.id, roll.id, token.id);
      resolveForcedSave(f.session.id, roll.id, f.recipients[0].token.id);
      expect(listRollLog(f.session.id).filter(entry => entry.label === 'Healing')).toHaveLength(6);
      expect(listRollLog(f.session.id).find(entry => entry.id === roll.id)!.apply?.consumedTargets).toHaveLength(6);
    });
    expect(requests).toEqual([sides]); // target clicks never roll another healing pool or save.
    for (const { character } of f.recipients.slice(0, 6)) expect(getCharacter(character.id)!.curHp).toBe(1 + total);
    expect(getCharacter(f.recipients[6].character.id)!.curHp).toBe(1);
    expect(getCharacter(f.recipients[0].character.id)!.conditions.some(condition => condition.isConcentration)).toBe(true);
  });

  it('rejects duplicate creature copies and foreign tokens, and cannot heal dead PCs', () => {
    const f = arena(), ally = f.recipients[0];
    const duplicate = createToken({ mapId: f.map.id, kind: 'pc', refId: ally.character.id, x: 200, y: 200 });
    const other = arena();
    const chest = instantiateMonster(createMonsterTemplate(f.session.id, { name: 'Chest', objectKind: 'chest', maxHp: 20 }).id)!;
    const object = createToken({ mapId: f.map.id, kind: 'monster', refId: chest.id, x: 250, y: 200 });
    updateCharacter(f.recipients[1].character.id, { curHp: 0 });
    setDeathSaves(f.recipients[1].character.id, 0, 3);
    withDiceSource(pool => pool.map(() => 3), () => {
      const roll = f.cast('Mass Healing Word', 3);
      resolveForcedSave(f.session.id, roll.id, ally.token.id);
      resolveForcedSave(f.session.id, roll.id, duplicate.id);
      resolveForcedSave(f.session.id, roll.id, other.self.id);
      resolveForcedSave(f.session.id, roll.id, object.id);
      resolveForcedSave(f.session.id, roll.id, f.recipients[1].token.id);
      expect(listRollLog(f.session.id).find(entry => entry.id === roll.id)!.apply?.consumedTargets).toEqual([ally.token.id, f.recipients[1].token.id]);
    });
    expect(getCharacter(ally.character.id)!.curHp).toBe(11);
    expect(getMonster(chest.id)!.curHp).toBe(20);
    expect(getCharacter(f.recipients[1].character.id)).toMatchObject({ curHp: 0, deathSaves: { failures: 3 } });
    expect(listRollLog(f.session.id).at(-1)!.detail).toMatch(/dead; healing has no effect/);
  });
});
