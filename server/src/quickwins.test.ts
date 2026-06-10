import { describe, it, expect } from 'vitest';
import {
  addRollLog,
  applyDamage,
  createCharacter,
  createMonsterTemplate,
  createSession,
  getCharacter,
  instantiateMonster,
  listRollLog,
  monsterInSession,
  ROLL_LOG_CAP,
} from './sessions.js';

// Regression tests for the review quick-wins batch: cross-session guards,
// damage clamping, and roll-log pruning.

describe('monsterInSession', () => {
  it('accepts a monster from the same session and rejects other sessions', () => {
    const s1 = createSession('Mine');
    const s2 = createSession('Other');
    const tmpl = createMonsterTemplate(s1.id, { name: 'Goblin', maxHp: 7 });
    const inst = instantiateMonster(tmpl.id)!;

    expect(monsterInSession(inst.id, s1.id)).toBe(true);
    expect(monsterInSession(inst.id, s2.id)).toBe(false);
    expect(monsterInSession('nope', s1.id)).toBe(false);
  });
});

describe('applyDamage clamping', () => {
  it('clamps absurd magnitudes and truncates fractions', () => {
    const s = createSession('Clamp');
    const ch = createCharacter(s.id, { name: 'Tank', maxHp: 30 });

    // A clamped mega-hit still just floors HP at 0 — no NaN/negative HP.
    applyDamage('pc', ch.id, 1e9);
    expect(getCharacter(ch.id)!.curHp).toBe(0);

    // Healing is clamped the same way: back up, but never past max.
    applyDamage('pc', ch.id, -1e9);
    expect(getCharacter(ch.id)!.curHp).toBe(30);

    // Fractional amounts truncate to whole HP.
    applyDamage('pc', ch.id, 5.7);
    expect(getCharacter(ch.id)!.curHp).toBe(25);

    // Non-finite input is rejected outright (no state change).
    expect(applyDamage('pc', ch.id, Number.POSITIVE_INFINITY)).toBeNull();
    expect(applyDamage('pc', ch.id, Number.NaN)).toBeNull();
    expect(getCharacter(ch.id)!.curHp).toBe(25);
  });
});

describe('roll log pruning', () => {
  it(`keeps only the newest ${ROLL_LOG_CAP} rolls per session`, () => {
    const s = createSession('LongCampaign');
    const other = createSession('Bystander');
    addRollLog(other.id, {
      roller: 'DM',
      label: 'keep me',
      expr: '1d4',
      total: 1,
      detail: '1d4[1] = 1',
    });

    const extra = 100;
    for (let i = 0; i < ROLL_LOG_CAP + extra; i++) {
      addRollLog(s.id, {
        roller: 'DM',
        label: `roll ${i}`,
        expr: '1d6',
        total: 3,
        detail: '1d6[3] = 3',
      });
    }

    const all = listRollLog(s.id, ROLL_LOG_CAP * 2);
    expect(all).toHaveLength(ROLL_LOG_CAP);
    // The newest entries survive; the oldest were pruned.
    expect(all[all.length - 1].label).toBe(`roll ${ROLL_LOG_CAP + extra - 1}`);
    expect(all[0].label).toBe(`roll ${extra}`);
    // Pruning is per session — the other session's log is untouched.
    expect(listRollLog(other.id, 10)).toHaveLength(1);
  });
});
