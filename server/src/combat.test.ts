import { describe, it, expect } from 'vitest';
import { resolveAttack, resolveSaves, resolveSkillRoll } from './combat.js';
import {
  createSession,
  createMap,
  setActiveMap,
  createToken,
  createCharacter,
  createMonsterTemplate,
  instantiateMonster,
  updateMonster,
  getMonster,
  listRollLog,
} from './sessions.js';

function arena() {
  const s = createSession('Combat');
  const map = createMap(s.id, { name: 'Pit' });
  setActiveMap(s.id, map.id);
  return { s, map };
}

describe('combat resolution', () => {
  it('logs an attack and applies damage on a hit', () => {
    const { s, map } = arena();
    const atkTmpl = createMonsterTemplate(s.id, {
      name: 'Brute',
      maxHp: 30,
      stats: { STR: 18 },
      weapons: [{ name: 'Slam', kind: 'melee', damage: '2d6+4', attackBonus: 50 }],
    });
    const target = createMonsterTemplate(s.id, { name: 'Dummy', maxHp: 40, armorClass: 1 });
    const a = createToken({ mapId: map.id, kind: 'monster', refId: instantiateMonster(atkTmpl.id)!.id, x: 0, y: 0 });
    const tInst = instantiateMonster(target.id)!;
    const t = createToken({ mapId: map.id, kind: 'monster', refId: tInst.id, x: 1, y: 1 });

    const before = getMonster(tInst.id)!.curHp;
    const ok = resolveAttack(s.id, 'DM', a.id, t.id, 0);
    expect(ok).toBe(true);
    const log = listRollLog(s.id);
    expect(log).toHaveLength(1);
    expect(log[0].detail).toMatch(/Brute.* → Dummy.*: Slam/);
    // +50 to hit vs AC 1 lands on anything but a nat 1, so usually damages.
    const after = getMonster(tInst.id)!.curHp;
    expect(after).toBeLessThanOrEqual(before);
  });

  it('rolls a save for each token and logs pass/fail', () => {
    const { s, map } = arena();
    const tmpl = createMonsterTemplate(s.id, { name: 'Goblin', maxHp: 7, stats: { DEX: 14 } });
    const a = createToken({ mapId: map.id, kind: 'monster', refId: instantiateMonster(tmpl.id)!.id, x: 0, y: 0 });
    const b = createToken({ mapId: map.id, kind: 'monster', refId: instantiateMonster(tmpl.id)!.id, x: 1, y: 1 });

    resolveSaves(s.id, 'DM', [a.id, b.id], 'DEX', 12);
    const log = listRollLog(s.id);
    expect(log).toHaveLength(2);
    expect(log.every((e) => e.label === 'DEX save')).toBe(true);
    expect(log.every((e) => /PASS|FAIL/.test(e.detail))).toBe(true);
  });

  it('rolls a skill check using the sheet ability mod + proficiency', () => {
    const s = createSession('Skills');
    // DEX 16 (+3); level 5 → proficiency +3. Stealth is a DEX skill.
    const c = createCharacter(s.id, {
      name: 'Rogue',
      className: 'Rogue',
      level: 5,
      stats: { DEX: 16 },
      proficientSkills: ['Stealth'],
    });

    expect(resolveSkillRoll(s.id, 'Rogue', c, 'Stealth')).toBe(true);
    const stealth = listRollLog(s.id).at(-1)!;
    expect(stealth.label).toBe('Stealth check'); // drives skill color-coding
    expect(stealth.detail).toContain('(proficient)');
    // d20 (1-20) + 3 mod + 3 prof = 7..26.
    expect(stealth.total).toBeGreaterThanOrEqual(7);
    expect(stealth.total).toBeLessThanOrEqual(26);

    // Non-proficient skill: ability mod only (+3), no proficiency note.
    resolveSkillRoll(s.id, 'Rogue', c, 'Arcana');
    const arcana = listRollLog(s.id).at(-1)!;
    expect(arcana.label).toBe('Arcana check');
    expect(arcana.detail).not.toContain('proficient');

    // Unknown skill name → no roll logged.
    const before = listRollLog(s.id).length;
    expect(resolveSkillRoll(s.id, 'Rogue', c, 'Juggling')).toBe(false);
    expect(listRollLog(s.id).length).toBe(before);
  });
});
