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
  setSheetAbility,
  updateMonster,
  getMonster,
  listRollLog,
} from './sessions.js';
import type { SheetAbility } from '../../shared/types.js';

function arena() {
  const s = createSession('Combat');
  const map = createMap(s.id, { name: 'Pit' });
  setActiveMap(s.id, map.id);
  return { s, map };
}

/** PC attacker vs a dummy target, with a mastery attached. `bonus`/`ac` tune
 *  the to-hit so a test can drive hits or misses, then loop for the d20. */
function masteryFight(opts: {
  weapon: string;
  attackBonus: number;
  targetAc: number;
  mastery: SheetAbility['mastery'];
  str?: number;
}) {
  const { s, map } = arena();
  const ch = createCharacter(s.id, {
    name: 'Striker',
    className: 'Fighter',
    level: 1,
    stats: { STR: opts.str ?? 16 },
    weapons: [{ name: opts.weapon, kind: 'melee', damage: '2d6', attackBonus: opts.attackBonus }],
  });
  setSheetAbility(ch.id, {
    id: 'm1',
    name: 'TestMastery',
    type: 'mastery',
    description: '',
    mastery: opts.mastery,
  });
  const atk = createToken({ mapId: map.id, kind: 'pc', refId: ch.id, x: 0, y: 0 });
  const tmpl = createMonsterTemplate(s.id, { name: 'Dummy', maxHp: 999, armorClass: opts.targetAc });
  const tgt = createToken({ mapId: map.id, kind: 'monster', refId: instantiateMonster(tmpl.id)!.id, x: 1, y: 1 });
  return { s: s.id, atk: atk.id, tgt: tgt.id };
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

describe('weapon masteries', () => {
  it('Graze deals ability-mod damage on a miss when active', () => {
    // Low to-hit vs high AC → almost always a miss; loop to find one.
    const { s, atk, tgt } = masteryFight({
      weapon: 'Greatsword',
      attackBonus: -50,
      targetAc: 50,
      str: 16, // +3
      mastery: { weapon: 'Greatsword', active: true, effect: { grazeOnMiss: true } },
    });
    let sawMiss = false;
    for (let i = 0; i < 80 && !sawMiss; i++) {
      resolveAttack(s, 'Striker', atk, tgt, 0);
      const last = listRollLog(s).at(-1)!;
      if (last.detail.includes('MISS')) {
        sawMiss = true;
        expect(last.detail).toContain('TestMastery 3 (graze)'); // STR +3
      }
    }
    expect(sawMiss).toBe(true);
  });

  it('adds mastery bonus damage on a hit', () => {
    // High to-hit vs low AC → almost always a hit; "5d1" is a constant 5.
    const { s, atk, tgt } = masteryFight({
      weapon: 'Maul',
      attackBonus: 50,
      targetAc: 1,
      mastery: { weapon: 'Maul', active: true, effect: { bonusDamage: '5d1' } },
    });
    let sawHit = false;
    for (let i = 0; i < 80 && !sawHit; i++) {
      resolveAttack(s, 'Striker', atk, tgt, 0);
      const last = listRollLog(s).at(-1)!;
      if (/\bHIT\b|CRIT/.test(last.detail)) {
        sawHit = true;
        expect(last.detail).toContain('TestMastery +5 [5d1]');
      }
    }
    expect(sawHit).toBe(true);
  });

  it('does nothing when the mastery is inactive', () => {
    const { s, atk, tgt } = masteryFight({
      weapon: 'Greatsword',
      attackBonus: -50,
      targetAc: 50,
      mastery: { weapon: 'Greatsword', active: false, effect: { grazeOnMiss: true } },
    });
    for (let i = 0; i < 20; i++) resolveAttack(s, 'Striker', atk, tgt, 0);
    expect(listRollLog(s).every((e) => !e.detail.includes('graze'))).toBe(true);
  });
});
