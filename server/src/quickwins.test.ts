import { describe, it, expect } from 'vitest';
import {
  addRollLog,
  applyDamage,
  createCharacter,
  createMonsterTemplate,
  createSession,
  drainHpFx,
  getCharacter,
  updateCharacter,
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

describe('HP-change FX queue (floating ±X)', () => {
  it('queues deltas for damage/heal/temp absorption and drains per session', () => {
    const s = createSession('Fx');
    const other = createSession('FxOther');
    drainHpFx(s.id); // start clean (shared module queue)
    drainHpFx(other.id);

    const ch = createCharacter(s.id, { name: 'Druk', maxHp: 42 });
    applyDamage('pc', ch.id, 4); // 42 → 38
    applyDamage('pc', ch.id, -4); // heal back
    updateCharacter(ch.id, { tempHp: 5 });
    applyDamage('pc', ch.id, 7); // 5 temp absorbs, 2 real — full −7 floats
    applyDamage('pc', ch.id, 0); // no change → no event
    applyDamage('pc', ch.id, 999); // 40 → 0 (the effective −40 floats)
    applyDamage('pc', ch.id, 6); // already at 0 — still floats the full hit

    const bystander = createCharacter(other.id, { name: 'B', maxHp: 10 });
    applyDamage('pc', bystander.id, 3);

    const events = drainHpFx(s.id);
    expect(events.map((e) => e.delta)).toEqual([-4, 4, -7, -40, -6]);
    expect(events.every((e) => e.kind === 'pc' && e.refId === ch.id)).toBe(true);
    // Drained: a second call returns nothing; the other session keeps its own.
    expect(drainHpFx(s.id)).toEqual([]);
    expect(drainHpFx(other.id).map((e) => e.delta)).toEqual([-3]);
  });

  it('carries the damage type for the elemental burst (damage only, canonical only)', () => {
    const s = createSession('FxType');
    drainHpFx(s.id);
    const ch = createCharacter(s.id, { name: 'Torch', maxHp: 30 });
    applyDamage('pc', ch.id, 5, 'fire');
    applyDamage('pc', ch.id, 5, 'Fire '); // normalized (case/space)
    applyDamage('pc', ch.id, 5, 'banana'); // not a 5e type → dropped
    applyDamage('pc', ch.id, 5); // untyped
    applyDamage('pc', ch.id, -10, 'fire'); // heals never carry a type
    const types = drainHpFx(s.id).map((e) => e.damageType);
    expect(types).toEqual(['fire', 'fire', undefined, undefined, undefined]);
  });

  it("flags a creature's drop to 0 as a death effect (monsters only, once)", async () => {
    const { createMonsterTemplate, instantiateMonster } = await import('./sessions.js');
    const s = createSession('FxDeath');
    drainHpFx(s.id);
    const goblin = instantiateMonster(
      createMonsterTemplate(s.id, { name: 'Goblin', maxHp: 7 }).id,
    )!;
    applyDamage('monster', goblin.id, 99); // 7 → 0: dies
    applyDamage('monster', goblin.id, 5); // already dead — no second puff
    const chest = instantiateMonster(
      createMonsterTemplate(s.id, { name: 'Chest', maxHp: 10, objectKind: 'chest' }).id,
    )!;
    applyDamage('monster', chest.id, 99); // objects never "die"
    const pc = createCharacter(s.id, { name: 'Downed', maxHp: 10 });
    applyDamage('pc', pc.id, 99); // PCs go DOWN (death saves), no skull
    expect(drainHpFx(s.id).map((e) => e.effect)).toEqual([
      'death',
      undefined,
      undefined,
      undefined,
    ]);
  });

  it('queues a gold-sparkle loot effect when something is actually taken', async () => {
    const { createMonsterTemplate, instantiateMonster, setLoot, takeLoot } =
      await import('./sessions.js');
    const s = createSession('FxLoot');
    drainHpFx(s.id);
    const chest = instantiateMonster(
      createMonsterTemplate(s.id, { name: 'Chest', maxHp: 10, objectKind: 'chest' }).id,
    )!;
    setLoot(chest.id, { gold: 10, items: [{ id: 'i1', name: 'Gem', qty: 1, note: '' }] });
    const hero = createCharacter(s.id, { name: 'Taker', maxHp: 10 });
    takeLoot(chest.id, hero.id, { gold: 0 }); // nothing moved → no sparkle
    takeLoot(chest.id, hero.id, { all: true }); // everything → sparkle
    const events = drainHpFx(s.id).filter((e) => e.effect === 'loot');
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ kind: 'monster', refId: chest.id, delta: 0 });
  });
});

describe('hide DM rolls from players', () => {
  it('flags DM rolls dmOnly while on and filters them from player snapshots', async () => {
    const { setHideDmRolls } = await import('./sessions.js');
    const { buildSnapshot } = await import('./visibility.js');
    const s = createSession('HideRolls');

    // Off by default: a DM roll reaches players.
    addRollLog(s.id, { roller: 'DM', label: 'Attack', expr: '1d20', total: 14, detail: 'hit' });
    expect(buildSnapshot(s.id, 'dm')!.rollLog).toHaveLength(1);
    expect(buildSnapshot(s.id, 'player')!.rollLog).toHaveLength(1);
    expect(buildSnapshot(s.id, 'player')!.hideDmRolls).toBe(false);

    // On: new DM rolls are dmOnly → present for the DM, gone for players.
    setHideDmRolls(s.id, true);
    addRollLog(s.id, { roller: 'DM', label: 'Save', expr: '1d20', total: 8, detail: 'fail' });
    addRollLog(s.id, { roller: 'Druk', label: 'Attack', expr: '1d20', total: 19, detail: 'hit' });
    const dm = buildSnapshot(s.id, 'dm')!.rollLog;
    const player = buildSnapshot(s.id, 'player')!.rollLog;
    expect(dm).toHaveLength(3); // DM sees everything
    expect(player.map((e) => e.roller)).toEqual(['DM', 'Druk']); // the hidden DM Save is gone
    expect(buildSnapshot(s.id, 'player')!.hideDmRolls).toBe(true);
  });
});
