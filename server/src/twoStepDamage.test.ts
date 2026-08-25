import { describe, it, expect } from 'vitest';
import { resolveAttack, resolveAttackDamage } from './combat.js';
import {
  createSession,
  createMap,
  setActiveMap,
  createToken,
  createCharacter,
  createMonsterTemplate,
  instantiateMonster,
  claimCharacter,
  getMonster,
  getCharacter,
  listRollLog,
  getRollEntry,
  setManualDamage,
  updateMonster,
} from './sessions.js';
import { buildSnapshot } from './visibility.js';
import type { StateSnapshot } from '../../shared/types.js';

/**
 * Two-step attacks: a hit parks its damage on the roll entry instead of applying
 * it, and a second click ("Roll damage") plays the reveal and takes the HP off.
 * The numbers are computed at HIT time, so these tests check that the parked
 * amount is exactly what lands — and that it can only land once.
 */

/** A fighter who always hits a 999-HP dummy, so the outcome is never a miss. */
function fight(opts?: { manual?: boolean; damage?: string; ac?: number; damageType?: string }) {
  const s = createSession('TwoStep');
  const map = createMap(s.id, { name: 'Pit' });
  setActiveMap(s.id, map.id);
  setManualDamage(s.id, opts?.manual ?? true);
  const ch = createCharacter(s.id, {
    name: 'Striker',
    className: 'Fighter',
    level: 1,
    stats: { STR: 16 },
    weapons: [
      {
        name: 'Greatsword',
        kind: 'melee',
        damage: opts?.damage ?? '2d6',
        attackBonus: 50,
        ...(opts?.damageType ? { damageType: opts.damageType } : {}),
      },
    ],
  });
  const atk = createToken({ mapId: map.id, kind: 'pc', refId: ch.id, x: 0, y: 0 });
  const tmpl = createMonsterTemplate(s.id, {
    name: 'Dummy',
    maxHp: 999,
    armorClass: opts?.ac ?? 1,
  });
  const inst = instantiateMonster(tmpl.id)!;
  const tgt = createToken({ mapId: map.id, kind: 'monster', refId: inst.id, x: 1, y: 1 });
  return { sid: s.id, ch, atk: atk.id, tgt: tgt.id, mon: inst.id };
}

/** Attack until it lands a NON-critical hit (a nat 1 always misses even at +50,
 *  and a nat 20 crit doubles the dice — which would make the fixed-damage
 *  assertions below flap). */
function hitOnce(f: ReturnType<typeof fight>, owner?: string): string {
  for (let i = 0; i < 60; i++) {
    resolveAttack(f.sid, 'Striker', f.atk, f.tgt, 0, undefined, false, false, owner);
    const last = listRollLog(f.sid).at(-1)!;
    if (last.pending && !last.pending.crit) return last.id;
  }
  throw new Error('never hit');
}

describe('two-step damage', () => {
  it('parks the damage on a hit instead of applying it', () => {
    const f = fight();
    const before = getMonster(f.mon)!.curHp;
    const rollId = hitOnce(f);
    expect(getMonster(f.mon)!.curHp).toBe(before); // nothing applied yet
    const p = getRollEntry(rollId)!.pending!;
    expect(p.amount).toBeGreaterThan(0);
    expect(p.target.refId).toBe(f.mon);
    expect(p.weapon).toBe('Greatsword');
    expect(p.done).toBeUndefined();
    // The attack line must not spoil the damage that hasn't been rolled yet.
    expect(getRollEntry(rollId)!.detail).toMatch(/roll damage/);
    expect(getRollEntry(rollId)!.reveal?.damage).toBeUndefined();
  });

  it('applies exactly the parked amount when the damage is rolled', () => {
    const f = fight();
    const before = getMonster(f.mon)!.curHp;
    const rollId = hitOnce(f);
    const amount = getRollEntry(rollId)!.pending!.amount;
    expect(resolveAttackDamage(f.sid, 'Striker', rollId)).toBe(true);
    expect(getMonster(f.mon)!.curHp).toBe(before - amount);
    const dmg = listRollLog(f.sid).at(-1)!;
    expect(dmg.label).toBe('Damage');
    expect(dmg.total).toBe(amount);
    expect(dmg.reveal?.kind).toBe('damage');
    expect(dmg.reveal?.damage).toBe(amount);
    expect(dmg.hpNote?.refId).toBe(f.mon);
  });

  it('cannot be rolled twice (a double-click never double-damages)', () => {
    const f = fight();
    const rollId = hitOnce(f);
    expect(resolveAttackDamage(f.sid, 'Striker', rollId)).toBe(true);
    const hp = getMonster(f.mon)!.curHp;
    expect(resolveAttackDamage(f.sid, 'Striker', rollId)).toBe(false);
    expect(getMonster(f.mon)!.curHp).toBe(hp);
    expect(getRollEntry(rollId)!.pending!.done).toBe(true);
  });

  it('is off when the session opts out — damage lands with the attack', () => {
    const f = fight({ manual: false });
    const before = getMonster(f.mon)!.curHp;
    let hit = false;
    for (let i = 0; i < 40 && !hit; i++) {
      resolveAttack(f.sid, 'Striker', f.atk, f.tgt, 0);
      const last = listRollLog(f.sid).at(-1)!;
      hit = /HIT|CRIT/.test(last.detail);
      expect(last.pending).toBeUndefined();
    }
    expect(hit).toBe(true);
    expect(getMonster(f.mon)!.curHp).toBeLessThan(before);
  });

  it('a miss is unaffected — nothing is parked', () => {
    const s = createSession('Miss');
    const map = createMap(s.id, { name: 'Pit' });
    setActiveMap(s.id, map.id);
    const ch = createCharacter(s.id, {
      name: 'Fumbler',
      stats: { STR: 10 },
      weapons: [{ name: 'Club', kind: 'melee', damage: '1d4', attackBonus: -20 }],
    });
    const atk = createToken({ mapId: map.id, kind: 'pc', refId: ch.id, x: 0, y: 0 });
    const tmpl = createMonsterTemplate(s.id, { name: 'Wall', maxHp: 50, armorClass: 40 });
    const inst = instantiateMonster(tmpl.id)!;
    const tgt = createToken({ mapId: map.id, kind: 'monster', refId: inst.id, x: 1, y: 1 });
    resolveAttack(s.id, 'Fumbler', atk.id, tgt.id, 0);
    const last = listRollLog(s.id).at(-1)!;
    expect(last.pending).toBeUndefined();
    expect(getMonster(inst.id)!.curHp).toBe(50);
  });

  it('bakes resistance into the parked number', () => {
    // 4d1 is deterministic: 4 dice + STR 16's +3 = 7, halved to 3 by resistance.
    const plain = fight({ damage: '4d1', damageType: 'slashing' });
    expect(getRollEntry(hitOnce(plain))!.pending!.amount).toBe(7);
    const resisted = fight({ damage: '4d1', damageType: 'slashing' });
    updateMonster(resisted.mon, { resistances: ['slashing'] });
    const rid = hitOnce(resisted);
    expect(getRollEntry(rid)!.pending!.amount).toBe(3);
    const before = getMonster(resisted.mon)!.curHp;
    resolveAttackDamage(resisted.sid, 'Striker', rid);
    expect(getMonster(resisted.mon)!.curHp).toBe(before - 3);
  });

  it('is stripped from other players and kept for the attacker', () => {
    const f = fight();
    claimCharacter(f.ch.id, 'sock-mine');
    const rollId = hitOnce(f, f.ch.id);
    const mine = buildSnapshot(f.sid, 'player', null, 'sock-mine')!;
    const theirs = buildSnapshot(f.sid, 'player', null, 'sock-other')!;
    const dm = buildSnapshot(f.sid, 'dm')!;
    const find = (snap: StateSnapshot) => snap.rollLog.find((e) => e.id === rollId);
    expect(find(mine)?.pending?.amount).toBeGreaterThan(0);
    expect(find(theirs)?.pending).toBeUndefined();
    expect(find(dm)?.pending?.amount).toBeGreaterThan(0);
    expect(getCharacter(f.ch.id)!.claimedBy).toBe('sock-mine');
  });
});
