import { describe, it, expect } from 'vitest';
import {
  createSession,
  createMap,
  setActiveMap,
  createToken,
  createCharacter,
  createMonsterTemplate,
  instantiateMonster,
  applyDamage,
  setDeathSaves,
  setCondition,
  setConcentration,
  setSheetAbility,
  setTempHp,
  setItem,
  getCharacter,
  getMonster,
  listRollLog,
  setManualDamage,
  isDeadEntity,
} from './sessions.js';
import {
  noteConcentration,
  resolveAttack,
  resolveAbilityRoll,
  useConsumable,
} from './combat.js';
import type { Condition } from '../../shared/types.js';

/**
 * Regression tests for the 25 Sep review's "trust" bugs. Each recreates the bug
 * as reported and pins the rules-correct result, including the side effects
 * that must NOT happen.
 */

const labels = (conds: Condition[]) => conds.map((c) => c.label).sort();
let condSeq = 0;
const cond = (label: string, extra: Partial<Condition> = {}): Condition => ({
  id: `cond-${++condSeq}`,
  label,
  aura: 'red',
  isConcentration: false,
  ...extra,
});

function world() {
  const s = createSession('Trust');
  const map = createMap(s.id, { name: 'Hall' });
  setActiveMap(s.id, map.id);
  setManualDamage(s.id, false); // damage lands with the attack in these tests
  return { sid: s.id, mapId: map.id };
}

/** A fresh PC at full HP. */
const hero = (sid: string, maxHp = 20, extra = {}) =>
  createCharacter(sid, { name: 'Hero', maxHp, ...extra });

/** Kill a PC the normal way: three failed death saves. */
function killPc(id: string) {
  applyDamage('pc', id, getCharacter(id)!.curHp); // exactly to 0 — down, not massive
  setDeathSaves(id, 0, 3);
}

// ---------------------------------------------------------------------------
describe('A1. the dead stay dead — ordinary healing never revives', () => {
  it('a PC with three failed death saves is not healed, and their saves are not reset', () => {
    const { sid } = world();
    const pc = hero(sid);
    killPc(pc.id);
    expect(isDeadEntity('pc', getCharacter(pc.id)!)).toBe(true);

    applyDamage('pc', pc.id, -10); // e.g. a Cure Wounds landing on the body
    const after = getCharacter(pc.id)!;
    expect(after.curHp).toBe(0);
    expect(after.deathSaves).toEqual({ successes: 0, failures: 3 });
  });

  it('a PC marked Dead (with saves to spare) is not healed either', () => {
    const { sid } = world();
    const pc = hero(sid);
    applyDamage('pc', pc.id, 20);
    setCondition('pc', pc.id, cond('Dead'));
    applyDamage('pc', pc.id, -10);
    expect(getCharacter(pc.id)!.curHp).toBe(0);
  });

  it("a creature at 0 HP isn't revived by a heal", () => {
    const { sid } = world();
    const t = createMonsterTemplate(sid, { name: 'Goblin', maxHp: 7 });
    const m = instantiateMonster(t.id)!;
    applyDamage('monster', m.id, 7);
    applyDamage('monster', m.id, -5);
    expect(getMonster(m.id)!.curHp).toBe(0);
  });

  it("the DM's correction revives a PC and reconciles the WHOLE death state", () => {
    const { sid } = world();
    const pc = hero(sid);
    killPc(pc.id);
    setCondition('pc', pc.id, cond('Dead'));

    applyDamage('pc', pc.id, -8, undefined, false, undefined, { correction: true });
    const after = getCharacter(pc.id)!;
    expect(after.curHp).toBe(8);
    expect(after.deathSaves).toEqual({ successes: 0, failures: 0 });
    expect(labels(after.conditions)).not.toContain('Dead');
    expect(labels(after.conditions)).not.toContain('Unconscious');
    expect(isDeadEntity('pc', after)).toBe(false);
  });

  it("the DM's correction still undoes an accidental monster kill", () => {
    const { sid } = world();
    const t = createMonsterTemplate(sid, { name: 'Ogre', maxHp: 59 });
    const m = instantiateMonster(t.id)!;
    applyDamage('monster', m.id, 59);
    setCondition('monster', m.id, cond('Dead'));
    applyDamage('monster', m.id, -30, undefined, false, undefined, { correction: true });
    expect(getMonster(m.id)!.curHp).toBe(30);
    expect(labels(getMonster(m.id)!.conditions)).not.toContain('Dead');
  });

  it('a healing spell on a dead target says so instead of claiming +HP', () => {
    const { sid, mapId } = world();
    const cleric = hero(sid, 20, { className: 'Cleric', level: 3, stats: { WIS: 16 } });
    const victim = hero(sid);
    const vTok = createToken({ mapId, kind: 'pc', refId: victim.id, x: 1, y: 1 });
    killPc(victim.id);
    const cure = {
      id: 'cw', name: 'Cure Wounds', type: 'spell' as const, level: 1, description: '',
      roll: { kind: 'heal' as const, dice: '2d8' },
    };
    setSheetAbility('pc', cleric.id, cure);
    resolveAbilityRoll(sid, 'Cleric', getCharacter(cleric.id)!, cure, 1, undefined, vTok.id);
    expect(getCharacter(victim.id)!.curHp).toBe(0);
    expect(listRollLog(sid).at(-1)!.detail).toMatch(/is dead; healing has no effect/);
  });

  it('a dead PC cannot drink a potion — and keeps it', () => {
    const { sid } = world();
    const pc = hero(sid);
    setItem(pc.id, { id: 'p1', name: 'Potion of Healing', qty: 1, note: 'Restores 2d4 + 2 hit points.' });
    killPc(pc.id);
    expect(useConsumable(sid, 'Hero', pc.id, 'p1')).toBe(false);
    expect(getCharacter(pc.id)!.items).toHaveLength(1);
    expect(getCharacter(pc.id)!.curHp).toBe(0);
  });
});

// ---------------------------------------------------------------------------
describe('A2. 0 HP means Unconscious — owned by the drop', () => {
  it('dropping to 0 applies Unconscious, Incapacitated and Prone', () => {
    const { sid } = world();
    const pc = hero(sid);
    applyDamage('pc', pc.id, 20);
    const c = getCharacter(pc.id)!;
    expect(labels(c.conditions)).toEqual(['Incapacitated', 'Prone', 'Unconscious']);
    expect(c.conditions.every((x) => x.source === 'down')).toBe(true);
  });

  it('healing clears the drop-caused unconsciousness; Prone and unrelated conditions stay', () => {
    const { sid } = world();
    const pc = hero(sid);
    setCondition('pc', pc.id, cond('Poisoned'));
    applyDamage('pc', pc.id, 20);
    applyDamage('pc', pc.id, -5);
    const c = getCharacter(pc.id)!;
    expect(labels(c.conditions)).toEqual(['Poisoned', 'Prone']);
    // Prone is an ordinary condition from here on (tag dropped).
    expect(c.conditions.find((x) => x.label === 'Prone')!.source).toBeUndefined();
  });

  it('an independently applied Unconscious survives the heal', () => {
    const { sid } = world();
    const pc = hero(sid);
    setCondition('pc', pc.id, cond('Unconscious')); // e.g. a Sleep spell (cascades its bundle)
    applyDamage('pc', pc.id, 20);
    applyDamage('pc', pc.id, -5);
    expect(labels(getCharacter(pc.id)!.conditions)).toContain('Unconscious');
  });

  it('a client cannot forge the engine tag onto a condition', () => {
    const { sid } = world();
    const pc = hero(sid);
    setCondition('pc', pc.id, cond('Restrained', { source: 'down' }));
    expect(getCharacter(pc.id)!.conditions[0].source).toBeUndefined();
  });

  it('a melee hit on a downed PC auto-crits (two death-save failures)', () => {
    const { sid, mapId } = world();
    const pc = hero(sid);
    const pcTok = createToken({ mapId, kind: 'pc', refId: pc.id, x: 60, y: 60 });
    const t = createMonsterTemplate(sid, {
      name: 'Brute', maxHp: 30,
      weapons: [{ name: 'Club', kind: 'melee', damage: '1d4', attackBonus: 50 }],
    });
    const m = instantiateMonster(t.id)!;
    const mTok = createToken({ mapId, kind: 'monster', refId: m.id, x: 70, y: 60 }); // adjacent
    applyDamage('pc', pc.id, 20);
    // +50 lands on anything but a nat 1; re-roll until it does.
    for (let i = 0; i < 40 && getCharacter(pc.id)!.deathSaves.failures === 0; i++)
      resolveAttack(sid, 'DM', mTok.id, pcTok.id, 0);
    expect(getCharacter(pc.id)!.deathSaves.failures).toBe(2);
    expect(listRollLog(sid).at(-1)!.detail).toMatch(/auto-crit \(unconscious\)/);
  });
});

// ---------------------------------------------------------------------------
describe('A3. massive damage', () => {
  it('kills outright when leftover damage reaches max HP', () => {
    const { sid } = world();
    const pc = hero(sid, 20);
    applyDamage('pc', pc.id, 5); // 15 left
    applyDamage('pc', pc.id, 35); // 15 to drop, 20 left over = max HP
    const c = getCharacter(pc.id)!;
    expect(c.deathSaves.failures).toBe(3);
    // Dead, not unconscious.
    expect(labels(c.conditions)).not.toContain('Unconscious');
  });

  it('is one point short of lethal without the full leftover', () => {
    const { sid } = world();
    const pc = hero(sid, 20);
    applyDamage('pc', pc.id, 39); // 20 to drop, 19 over
    expect(getCharacter(pc.id)!.deathSaves.failures).toBe(0);
  });

  it('temp HP soaks damage before the massive-damage check', () => {
    const { sid } = world();
    const pc = hero(sid, 20);
    setTempHp('pc', pc.id, 5);
    applyDamage('pc', pc.id, 44); // 5 temp, 20 real, 19 over — survives
    expect(getCharacter(pc.id)!.deathSaves.failures).toBe(0);
  });

  it('a hit of max HP or more while already at 0 kills', () => {
    const { sid } = world();
    const pc = hero(sid, 20);
    applyDamage('pc', pc.id, 20);
    applyDamage('pc', pc.id, 20);
    expect(getCharacter(pc.id)!.deathSaves.failures).toBe(3);
  });
});

// ---------------------------------------------------------------------------
describe('A4. concentration', () => {
  it('caps the save DC at 30', () => {
    const { sid } = world();
    const pc = hero(sid, 500);
    setConcentration('pc', pc.id, 'Bless');
    noteConcentration(sid, 'pc', pc.id, 200);
    expect(listRollLog(sid).at(-1)!.total).toBe(30);
  });

  it('ends at 0 HP — and takes ONLY its own stance and mark with it', () => {
    const { sid, mapId } = world();
    const ranger = hero(sid, 20);
    const t = createMonsterTemplate(sid, { name: 'Wolf', maxHp: 11 });
    const wolf = instantiateMonster(t.id)!;
    const wolfTok = createToken({ mapId, kind: 'monster', refId: wolf.id, x: 1, y: 1 });
    setSheetAbility('pc', ranger.id, {
      id: 'hm', name: "Hunter's Mark", type: 'stance', level: 1, description: '',
      stance: { active: true, appliesTo: 'all', bonusDamage: '1d6', targeted: true,
        targetId: wolfTok.id, marksTargetWith: 'Marked' },
    });
    setSheetAbility('pc', ranger.id, {
      id: 'rage', name: 'Rage', type: 'stance', description: '',
      stance: { active: true, appliesTo: 'melee', bonusDamage: '2' },
    });
    setConcentration('pc', ranger.id, "Hunter's Mark");
    setCondition('monster', wolf.id, cond('Marked', { aura: 'blue' }));
    setCondition('monster', wolf.id, cond('Frightened'));

    applyDamage('pc', ranger.id, 20);

    const r = getCharacter(ranger.id)!;
    expect(r.conditions.some((c) => c.isConcentration)).toBe(false);
    expect(r.sheetAbilities.find((a) => a.id === 'hm')!.stance!.active).toBe(false);
    // An unrelated stance is untouched.
    expect(r.sheetAbilities.find((a) => a.id === 'rage')!.stance!.active).toBe(true);
    // Its own mark is lifted; the wolf's other condition stays.
    expect(labels(getMonster(wolf.id)!.conditions)).toEqual(['Frightened']);
    expect(listRollLog(sid).some((e) => /loses concentration on Hunter's Mark \(dropped to 0 HP\)/.test(e.detail))).toBe(true);
  });

  it('ends when the creature becomes incapacitated', () => {
    const { sid } = world();
    const pc = hero(sid);
    setConcentration('pc', pc.id, 'Bless');
    setCondition('pc', pc.id, cond('Stunned')); // implies Incapacitated
    expect(getCharacter(pc.id)!.conditions.some((c) => c.isConcentration)).toBe(false);
  });

  it('is kept through ordinary conditions', () => {
    const { sid } = world();
    const pc = hero(sid);
    setConcentration('pc', pc.id, 'Bless');
    setCondition('pc', pc.id, cond('Poisoned'));
    expect(getCharacter(pc.id)!.conditions.some((c) => c.isConcentration)).toBe(true);
  });
});
