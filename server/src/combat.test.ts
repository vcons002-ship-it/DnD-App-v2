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
  getCharacter,
  updateMonster,
  getMonster,
  getToken,
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
  damage?: string;
  magicBonus?: number;
  tags?: string[];
}) {
  const { s, map } = arena();
  const ch = createCharacter(s.id, {
    name: 'Striker',
    className: 'Fighter',
    level: 1,
    stats: { STR: opts.str ?? 16 },
    weapons: [{
      name: opts.weapon,
      kind: 'melee',
      damage: opts.damage ?? '2d6',
      attackBonus: opts.attackBonus,
      magicBonus: opts.magicBonus,
      tags: opts.tags ?? ['test'],
    }],
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
      mastery: { appliesToTags: ['test'], active: true, effect: { grazeOnMiss: true } },
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
      mastery: { appliesToTags: ['test'], active: true, effect: { bonusDamage: '5d1' } },
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
      mastery: { appliesToTags: ['test'], active: false, effect: { grazeOnMiss: true } },
    });
    for (let i = 0; i < 20; i++) resolveAttack(s, 'Striker', atk, tgt, 0);
    expect(listRollLog(s).every((e) => !e.detail.includes('graze'))).toBe(true);
  });

  it('Cleave toggles itself off after an attack (hit or miss)', () => {
    const { s, atk, tgt } = masteryFight({
      weapon: 'Greataxe',
      attackBonus: 50,
      targetAc: 1,
      damage: '1d6+3',
      mastery: { appliesToTags: ['test'], active: true, effect: { cleave: true } },
    });
    const chId = getToken(atk)!.refId;
    expect(getCharacter(chId)!.sheetAbilities[0].mastery!.active).toBe(true);
    resolveAttack(s, 'Striker', atk, tgt, 0);
    expect(getCharacter(chId)!.sheetAbilities[0].mastery!.active).toBe(false);
  });

  it('Cleave applies the weapon damage to the target without the ability modifier', () => {
    // "2d1" = constant 2 dice, +1 magic; STR 16 → +3 added at roll. Normal hit =
    // 2 + 3 + 1 = 6; Cleave omits the +3 ability mod → 3 applied (dice 2 + magic
    // 1). Re-enable each loop since Cleave one-shots itself off.
    const { s, atk, tgt } = masteryFight({
      weapon: 'Greataxe',
      attackBonus: 50,
      targetAc: 1,
      damage: '2d1',
      magicBonus: 1,
      str: 16,
      mastery: { appliesToTags: ['test'], active: true, effect: { cleave: true } },
    });
    const chId = getToken(atk)!.refId;
    const ref = getToken(tgt)!.refId;
    let checked = false;
    for (let i = 0; i < 100 && !checked; i++) {
      const ab = getCharacter(chId)!.sheetAbilities[0];
      setSheetAbility(chId, { ...ab, mastery: { ...ab.mastery!, active: true } });
      const before = getMonster(ref)!.curHp;
      resolveAttack(s, 'Striker', atk, tgt, 0);
      const last = listRollLog(s).at(-1)!;
      if (/\bHIT\b/.test(last.detail) && !/CRIT/.test(last.detail)) {
        checked = true;
        expect(last.detail).toContain('no ability modifier');
        expect(before - getMonster(ref)!.curHp).toBe(3); // 6 normal − 3 ability mod
      }
    }
    expect(checked).toBe(true);
  });

  it('Hew adds the attacker proficiency bonus to damage on a hit', () => {
    // STR 10 (mod 0) isolates the prof bonus: "2d1" = 2, level-1 prof +2 → 4.
    const { s, atk, tgt } = masteryFight({
      weapon: 'Greataxe',
      attackBonus: 50,
      targetAc: 1,
      damage: '2d1',
      str: 10,
      mastery: { appliesToTags: ['test'], active: true, effect: { profBonusDamage: true } },
    });
    const ref = getToken(tgt)!.refId;
    let checked = false;
    for (let i = 0; i < 80 && !checked; i++) {
      const before = getMonster(ref)!.curHp;
      resolveAttack(s, 'Striker', atk, tgt, 0);
      const last = listRollLog(s).at(-1)!;
      if (/\bHIT\b/.test(last.detail) && !/CRIT/.test(last.detail)) {
        checked = true;
        expect(last.detail).toContain('+2 (prof)');
        expect(before - getMonster(ref)!.curHp).toBe(4); // 2 weapon + 2 prof
      }
    }
    expect(checked).toBe(true);
  });

  it('stacks multiple masteries bound to the same weapon', () => {
    // One weapon, two active masteries: Hew (+prof) and a custom +5 — both apply.
    const { s, atk, tgt } = masteryFight({
      weapon: 'Greataxe',
      attackBonus: 50,
      targetAc: 1,
      damage: '2d1', // constant 2
      str: 10, // mod 0, so the bonuses are isolated
      mastery: { appliesToTags: ['test'], active: true, effect: { profBonusDamage: true } },
    });
    const chId = getToken(atk)!.refId;
    setSheetAbility(chId, {
      id: 'm2',
      name: 'Crusher',
      type: 'mastery',
      description: '',
      mastery: { appliesToTags: ['test'], active: true, effect: { bonusDamage: '5d1' } },
    });
    const ref = getToken(tgt)!.refId;
    let checked = false;
    for (let i = 0; i < 80 && !checked; i++) {
      const before = getMonster(ref)!.curHp;
      resolveAttack(s, 'Striker', atk, tgt, 0);
      const last = listRollLog(s).at(-1)!;
      if (/\bHIT\b/.test(last.detail) && !/CRIT/.test(last.detail)) {
        checked = true;
        // 2 weapon + 2 prof (Hew) + 5 (Crusher) = 9, and both notes appear.
        expect(before - getMonster(ref)!.curHp).toBe(9);
        expect(last.detail).toContain('+2 (prof)');
        expect(last.detail).toContain('Crusher +5');
      }
    }
    expect(checked).toBe(true);
  });

  it('triggers by tag on any matching weapon (and not on unmatched ones)', () => {
    const { s: sid, map } = arena();
    const ch = createCharacter(sid.id, {
      name: 'Striker',
      className: 'Fighter',
      level: 1,
      stats: { STR: 16 },
      weapons: [
        { name: 'Magic Halberd +1', kind: 'melee', damage: '2d1', attackBonus: 50, tags: ['halberd', 'heavy'] },
        { name: 'Battered Greatsword', kind: 'melee', damage: '2d1', attackBonus: 50, tags: ['greatsword', 'heavy'] },
        { name: 'Dagger', kind: 'melee', damage: '2d1', attackBonus: 50, tags: ['dagger', 'light'] },
      ],
    });
    // One Hew entry (no per-weapon binding): triggers on any weapon tagged "heavy".
    setSheetAbility(ch.id, {
      id: 'm1',
      name: 'Hew',
      type: 'mastery',
      description: '',
      mastery: { appliesToTags: ['heavy'], active: true, effect: { profBonusDamage: true } },
    });
    const atk = createToken({ mapId: map.id, kind: 'pc', refId: ch.id, x: 0, y: 0 });
    const tmpl = createMonsterTemplate(sid.id, { name: 'Dummy', maxHp: 9999, armorClass: 1 });
    const tgt = createToken({ mapId: map.id, kind: 'monster', refId: instantiateMonster(tmpl.id)!.id, x: 1, y: 1 });

    // Heavy weapons (index 0, 1) get +2 prof; the light Dagger (index 2) does not.
    const expectProf = (idx: number, want: boolean) => {
      let hit = false;
      for (let i = 0; i < 80 && !hit; i++) {
        resolveAttack(sid.id, 'Striker', atk.id, tgt.id, idx);
        const last = listRollLog(sid.id).at(-1)!;
        if (/\bHIT\b/.test(last.detail) && !/CRIT/.test(last.detail)) {
          hit = true;
          expect(last.detail.includes('(prof)')).toBe(want);
        }
      }
      expect(hit).toBe(true);
    };
    expectProf(0, true); // Magic Halberd +1 — heavy
    expectProf(1, true); // Battered Greatsword — heavy
    expectProf(2, false); // Dagger — not heavy
  });
});

describe('off-hand & versatile attacks', () => {
  function pcFight(weapon: { name: string; damage?: string; versatileDamage?: string; attackBonus?: number }) {
    const { s, map } = arena();
    const ch = createCharacter(s.id, {
      name: 'Duelist',
      className: 'Fighter',
      level: 1,
      stats: { STR: 16 },
      weapons: [{ kind: 'melee', ...weapon }],
    });
    const atk = createToken({ mapId: map.id, kind: 'pc', refId: ch.id, x: 0, y: 0 });
    const tmpl = createMonsterTemplate(s.id, { name: 'Dummy', maxHp: 9999, armorClass: 1 });
    const tgt = createToken({ mapId: map.id, kind: 'monster', refId: instantiateMonster(tmpl.id)!.id, x: 1, y: 1 });
    return { sid: s.id, atk: atk.id, tgt: tgt.id, ref: getToken(tgt.id)!.refId };
  }

  it('off-hand attack drops the ability modifier from damage', () => {
    // "2d1" = 2 dice; STR 16 → +3 added at roll. Normal hit = 5; off-hand omits
    // the +3 → 2.
    const { sid, atk, tgt, ref } = pcFight({ name: 'Shortsword', damage: '2d1', attackBonus: 50 });
    let checked = false;
    for (let i = 0; i < 80 && !checked; i++) {
      const before = getMonster(ref)!.curHp;
      resolveAttack(sid, 'Duelist', atk, tgt, 0, undefined, true); // offhand
      const last = listRollLog(sid).at(-1)!;
      if (/\bHIT\b/.test(last.detail) && !/CRIT/.test(last.detail)) {
        checked = true;
        expect(last.detail).toContain('Off-hand (no ability modifier −3)');
        expect(before - getMonster(ref)!.curHp).toBe(2);
      }
    }
    expect(checked).toBe(true);
  });

  it('two-handed attack uses the versatile damage dice', () => {
    // 1H "2d1" = 2; 2H "6d1" = 6, plus STR 16 → +3. So a 2H non-crit hit = 9
    // (vs 5 one-handed), proving the 2H dice were used.
    const { sid, atk, tgt, ref } = pcFight({
      name: 'Longsword', damage: '2d1', versatileDamage: '6d1', attackBonus: 50,
    });
    let checked = false;
    for (let i = 0; i < 80 && !checked; i++) {
      const before = getMonster(ref)!.curHp;
      resolveAttack(sid, 'Duelist', atk, tgt, 0, undefined, false, true); // twoHanded
      const last = listRollLog(sid).at(-1)!;
      if (/\bHIT\b/.test(last.detail) && !/CRIT/.test(last.detail)) {
        checked = true;
        expect(last.detail).toContain('(2H)');
        expect(before - getMonster(ref)!.curHp).toBe(9);
      }
    }
    expect(checked).toBe(true);
  });
});
