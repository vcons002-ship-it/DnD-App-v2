import { describe, it, expect } from 'vitest';
import {
  createSession,
  createCharacter,
  getCharacter,
  updateCharacter,
  applyDamage,
  setTempHp,
} from './sessions.js';

/**
 * Temporary HP follows the 2024 D&D rules: it is a flat buffer pool with no
 * maximum, damage drains it before real HP, and healing never refills it.
 * applyDamage is the single chokepoint for direct, AOE, and combat damage, so
 * exercising it here covers all of those paths.
 */
describe('temporary HP', () => {
  const newPc = (maxHp: number, tempHp: number) => {
    const s = createSession('TempHP');
    const ch = createCharacter(s.id, { name: 'Hero', maxHp });
    updateCharacter(ch.id, { tempHp });
    return ch.id;
  };

  it('updateCharacter sets the temp-HP pool (clamped to >= 0)', () => {
    const id = newPc(20, 0);
    updateCharacter(id, { tempHp: 8 });
    expect(getCharacter(id)!.tempHp).toBe(8);
    updateCharacter(id, { tempHp: -5 });
    expect(getCharacter(id)!.tempHp).toBe(0);
  });

  it('damage below the buffer only drains temp HP', () => {
    const id = newPc(20, 10);
    applyDamage('pc', id, 6);
    const c = getCharacter(id)!;
    expect(c.tempHp).toBe(4);
    expect(c.curHp).toBe(20);
  });

  it('damage equal to the buffer empties temp HP and leaves real HP', () => {
    const id = newPc(20, 10);
    applyDamage('pc', id, 10);
    const c = getCharacter(id)!;
    expect(c.tempHp).toBe(0);
    expect(c.curHp).toBe(20);
  });

  it('damage above the buffer drains temp first, overflow hits real HP', () => {
    const id = newPc(20, 10);
    applyDamage('pc', id, 13);
    const c = getCharacter(id)!;
    expect(c.tempHp).toBe(0);
    expect(c.curHp).toBe(17); // 3 overflow past the 10-point buffer
  });

  it('healing restores real HP only and never refills temp HP', () => {
    const id = newPc(20, 5);
    applyDamage('pc', id, 12); // temp -> 0, curHp 20 -> 13
    expect(getCharacter(id)!.curHp).toBe(13);
    applyDamage('pc', id, -4); // heal 4
    const c = getCharacter(id)!;
    expect(c.curHp).toBe(17);
    expect(c.tempHp).toBe(0); // heal did not touch the (now empty) buffer
  });

  it('setTempHp grants the buffer as an exact (non-additive) amount', () => {
    const id = newPc(20, 0);
    setTempHp('pc', id, 8);
    expect(getCharacter(id)!.tempHp).toBe(8);
    // Granting again sets (not stacks) the buffer, and never touches real HP.
    setTempHp('pc', id, 5);
    const c = getCharacter(id)!;
    expect(c.tempHp).toBe(5);
    expect(c.curHp).toBe(20);
    setTempHp('pc', id, -3); // clamped to 0
    expect(getCharacter(id)!.tempHp).toBe(0);
  });

  it('healing leaves an existing temp-HP buffer untouched', () => {
    const id = newPc(20, 7);
    applyDamage('pc', id, 5); // 5 real damage first? no — drains temp to 2
    expect(getCharacter(id)!.tempHp).toBe(2);
    applyDamage('pc', id, -10); // heal while still at full real HP
    const c = getCharacter(id)!;
    expect(c.curHp).toBe(20); // capped at max
    expect(c.tempHp).toBe(2); // buffer unchanged by healing
  });
});
