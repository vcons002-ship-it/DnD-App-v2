import { describe, it, expect } from 'vitest';
import { checkReveal, diceReveal } from '../../shared/rollReveal.js';
import { rollDice } from '../../shared/dice.js';
import {
  createSession,
  createMap,
  setActiveMap,
  createCharacter,
  createToken,
  createMonsterTemplate,
  instantiateMonster,
  updateCharacter,
  getCharacter,
  getMonster,
  listRollLog,
} from './sessions.js';
import {
  resolveSkillRoll,
  resolveSave,
  resolveCheck,
  resolveSaves,
  resolveDeathSave,
  resolveObjectCheck,
} from './combat.js';
import type { RollReveal } from '../../shared/types.js';

const sum = (steps?: { value: number }[]): number =>
  (steps ?? []).reduce((a, b) => a + b.value, 0);
/** A 'check' reveal's count-up must land exactly on its total (d20 + chips). */
const checkReaches = (r: RollReveal): boolean =>
  (r.d20 ?? 0) + sum(r.toHit) === r.attackTotal;
/** A 'dice' reveal's dice faces + flat mods must land on the rolled total. */
const diceReaches = (r: RollReveal): boolean => {
  const faces = (r.damageDice ?? []).flatMap((d) => d.faces ?? [d.value]);
  return faces.reduce((a, b) => a + b, 0) + sum(r.damageMods) === r.damage;
};

describe('roll-reveal builders (pure)', () => {
  it('checkReveal drops zero-value chips and counts up to the total', () => {
    const r = checkReveal({
      who: 'Rogue',
      title: 'Stealth check',
      face: 14,
      total: 19,
      steps: [
        { label: 'DEX', value: 3 },
        { label: 'PROF', value: 2 },
        { label: 'nothing', value: 0 },
      ],
    });
    expect(r.kind).toBe('check');
    expect(r.d20).toBe(14);
    expect(r.toHit).toEqual([
      { label: 'DEX', value: 3 },
      { label: 'PROF', value: 2 },
    ]); // the +0 chip is dropped
    expect(r.attackTotal).toBe(19);
    expect(r.outcome).toBe('none'); // no DC → no stamp
    expect(checkReaches(r)).toBe(true);
  });

  it('checkReveal carries a pass/fail outcome and a target when given', () => {
    const r = checkReveal({
      who: 'Goblin',
      title: 'DEX save',
      face: 5,
      total: 7,
      steps: [{ label: 'DEX', value: 2 }],
      outcome: 'fail',
      target: 'Fire Trap',
    });
    expect(r.outcome).toBe('fail');
    expect(r.target).toBe('Fire Trap');
  });

  it('diceReveal splits an expression into dice + flat, reaching the total', () => {
    const res = rollDice('2d1+3')!; // 1d1 is deterministic → total 5
    const r = diceReveal('DM', res);
    expect(r.kind).toBe('dice');
    expect(r.title).toBe('2d1+3');
    expect(r.damageDice).toEqual([{ label: '2d1', value: 2, faces: [1, 1] }]);
    expect(r.damageMods).toEqual([{ label: 'flat', value: 3 }]);
    expect(r.damage).toBe(5);
    expect(diceReaches(r)).toBe(true);
  });

  it('diceReveal headlines with a supplied label instead of the expression', () => {
    const r = diceReveal('DM', rollDice('1d1')!, 'Initiative');
    expect(r.title).toBe('Initiative');
  });

  it('diceReveal folds a NEGATIVE dice term into a mod so the count-up matches', () => {
    const res = rollDice('1d1-1d1')!; // 1 - 1 = 0
    const r = diceReveal('DM', res);
    expect(r.damageDice).toEqual([{ label: '1d1', value: 1, faces: [1] }]);
    expect(r.damageMods).toEqual([{ label: '1d1', value: -1 }]);
    expect(r.damage).toBe(0);
    expect(diceReaches(r)).toBe(true);
  });

  it('diceReveal handles a flat-only roll (no dice terms)', () => {
    const r = diceReveal('DM', rollDice('7')!);
    expect(r.damageDice).toBeUndefined();
    expect(r.damageMods).toEqual([{ label: 'flat', value: 7 }]);
    expect(r.damage).toBe(7);
  });
});

describe('every d20 roll animates (server reveals)', () => {
  const pc = (stats: Record<string, number>) => {
    const s = createSession('Reveals');
    const map = createMap(s.id, { name: 'M' });
    setActiveMap(s.id, map.id);
    const ch = createCharacter(s.id, { name: 'Hero', level: 1, stats });
    const tok = createToken({ mapId: map.id, kind: 'pc', refId: ch.id, x: 0, y: 0 });
    return { s, ch, tok };
  };
  const lastReveal = (s: { id: string }): RollReveal =>
    listRollLog(s.id).at(-1)!.reveal!;

  it('a skill check animates as a check whose chips reach the total', () => {
    const { s, ch } = pc({ DEX: 14 });
    updateCharacter(ch.id, { proficientSkills: ['Stealth'] });
    resolveSkillRoll(s.id, 'Hero', getCharacter(ch.id)!, 'Stealth');
    const r = lastReveal(s);
    expect(r.kind).toBe('check');
    expect(r.title).toBe('Stealth check');
    expect(r.outcome).toBe('none'); // a skill check has no DC → no stamp
    expect(checkReaches(r)).toBe(true);
  });

  it('a standalone saving throw animates as a check', () => {
    const { s, ch } = pc({ CON: 16 });
    resolveSave(s.id, 'DM', 'pc', ch.id, 'CON');
    const r = lastReveal(s);
    expect(r.kind).toBe('check');
    expect(r.title).toBe('CON save');
    expect(checkReaches(r)).toBe(true);
  });

  it('a plain ability check animates as a check', () => {
    const { s, ch } = pc({ STR: 12 });
    resolveCheck(s.id, 'DM', 'pc', ch.id, 'STR');
    const r = lastReveal(s);
    expect(r.kind).toBe('check');
    expect(r.title).toBe('STR check');
    expect(checkReaches(r)).toBe(true);
  });

  it('a bulk save vs a DC animates with a pass/fail stamp', () => {
    const { s, tok } = pc({ DEX: 20 }); // +5 → beats DC 1 on any face
    resolveSaves(s.id, 'DM', [tok.id], 'DEX', 1);
    const r = lastReveal(s);
    expect(r.kind).toBe('check');
    expect(r.outcome).toBe('pass');
    expect(checkReaches(r)).toBe(true);
  });

  it('a death save animates as a check', () => {
    const { s, ch } = pc({ CON: 10 });
    updateCharacter(ch.id, { curHp: 0 });
    resolveDeathSave(s.id, ch.id);
    const r = lastReveal(s);
    expect(r.kind).toBe('check');
    expect(r.title).toBe('Death save');
    expect(['pass', 'fail']).toContain(r.outcome);
  });

  it('a lock-pick check animates with the object as the target', () => {
    const { s, ch } = pc({ DEX: 14 });
    const tmpl = createMonsterTemplate(s.id, { name: 'Chest', maxHp: 1, objectDc: 1 });
    const chest = getMonster(instantiateMonster(tmpl.id)!.id)!;
    resolveObjectCheck(s.id, 'Hero', getCharacter(ch.id)!, chest, 'unlock');
    const r = lastReveal(s);
    expect(r.kind).toBe('check');
    expect(r.title).toBe('Pick lock');
    expect(r.target).toBe(chest.name); // the numbered instance ("Chest 1")
    expect(['pass', 'fail']).toContain(r.outcome);
    expect(checkReaches(r)).toBe(true);
  });
});
