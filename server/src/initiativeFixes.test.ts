import { describe, it, expect } from 'vitest';
import {
  createSession,
  createMap,
  setActiveMap,
  createToken,
  createCharacter,
  createMonsterTemplate,
  instantiateMonster,
  rollAllInitiative,
  firstInInitiative,
  setTokenInCombat,
  setTokenInitiative,
  setActiveTurn,
  getToken,
  getSessionById,
  applyDamage,
  advanceTurn,
  setTokensDisposition,
  getMonster,
} from './sessions.js';

/**
 * Two reports from the table: "on an initiative roll, a dead guard was chosen",
 * and "occasionally the marker for the current player doesn't show".
 */
function arena() {
  const s = createSession('Init');
  const map = createMap(s.id, { name: 'Hall' });
  setActiveMap(s.id, map.id);
  return { sid: s.id, mapId: map.id };
}

/** A creature token; `hp: 0` makes it a corpse. */
function guard(sid: string, mapId: string, name: string, hp = 10) {
  const tmpl = createMonsterTemplate(sid, { name, maxHp: Math.max(1, hp) });
  const inst = instantiateMonster(tmpl.id)!;
  if (hp <= 0) applyDamage('monster', inst.id, 9999);
  return {
    token: createToken({ mapId, kind: 'monster', refId: inst.id, x: 0, y: 0 }),
    monsterId: inst.id,
  };
}

describe('dead creatures and initiative', () => {
  it('leaves a corpse out of "Roll all" on auto', () => {
    const { sid, mapId } = arena();
    const dead = guard(sid, mapId, 'Dead Guard', 0);
    const alive = guard(sid, mapId, 'Live Guard');
    rollAllInitiative(mapId);
    expect(getToken(dead.token.id)!.initiative).toBeNull();
    expect(getToken(alive.token.id)!.initiative).not.toBeNull();
  });

  it('but an explicit tick still drags it in — the DM always wins', () => {
    const { sid, mapId } = arena();
    const dead = guard(sid, mapId, 'Dead Guard', 0);
    setTokenInCombat(dead.token.id, true);
    rollAllInitiative(mapId);
    expect(getToken(dead.token.id)!.initiative).not.toBeNull();
  });

  it('never starts the fight ON a corpse', () => {
    const { sid, mapId } = arena();
    const dead = guard(sid, mapId, 'Dead Guard', 0);
    const alive = guard(sid, mapId, 'Live Guard');
    // Force both into the order with the corpse on top.
    setTokenInitiative(dead.token.id, 30);
    setTokenInitiative(alive.token.id, 5);
    expect(firstInInitiative(mapId)).toBe(alive.token.id);
  });

  it('returns nothing when everyone in the order is dead', () => {
    const { sid, mapId } = arena();
    const a = guard(sid, mapId, 'Corpse A', 0);
    const b = guard(sid, mapId, 'Corpse B', 0);
    setTokenInitiative(a.token.id, 12);
    setTokenInitiative(b.token.id, 8);
    expect(firstInInitiative(mapId)).toBeNull();
  });

  it('a PC at 0 HP is NOT dead — they keep their turn for death saves', () => {
    const { sid, mapId } = arena();
    const ch = createCharacter(sid, { name: 'Downed', maxHp: 10 });
    applyDamage('pc', ch.id, 50);
    const tok = createToken({ mapId, kind: 'pc', refId: ch.id, x: 1, y: 1 });
    rollAllInitiative(mapId);
    expect(getToken(tok.id)!.initiative).not.toBeNull();
    expect(firstInInitiative(mapId)).toBe(tok.id);
  });
});

describe('the current-turn marker is never orphaned', () => {
  it('unticking the active creature passes the turn on instead of losing it', () => {
    const { sid, mapId } = arena();
    const a = guard(sid, mapId, 'A');
    const b = guard(sid, mapId, 'B');
    setTokenInitiative(a.token.id, 20);
    setTokenInitiative(b.token.id, 10);
    setActiveTurn(sid, a.token.id);

    setTokenInCombat(a.token.id, false);
    // Its roll is gone…
    expect(getToken(a.token.id)!.initiative).toBeNull();
    // …and the marker moved on rather than pointing at a non-combatant.
    expect(getSessionById(sid)!.activeTurnTokenId).toBe(b.token.id);
  });

  it('clears the marker when the last combatant is unticked', () => {
    const { sid, mapId } = arena();
    const only = guard(sid, mapId, 'Solo');
    setTokenInitiative(only.token.id, 15);
    setActiveTurn(sid, only.token.id);
    const roundBefore = getSessionById(sid)!.combatRound;

    setTokenInCombat(only.token.id, false);
    expect(getSessionById(sid)!.activeTurnTokenId).toBeNull();
    // …without spuriously opening a new round on the way out.
    expect(getSessionById(sid)!.combatRound).toBe(roundBefore);
  });

  it('leaves the marker alone when a DIFFERENT creature is unticked', () => {
    const { sid, mapId } = arena();
    const a = guard(sid, mapId, 'A');
    const b = guard(sid, mapId, 'B');
    setTokenInitiative(a.token.id, 20);
    setTokenInitiative(b.token.id, 10);
    setActiveTurn(sid, a.token.id);

    setTokenInCombat(b.token.id, false);
    expect(getSessionById(sid)!.activeTurnTokenId).toBe(a.token.id);
  });

  it('still skips the dead when advancing normally', () => {
    const { sid, mapId } = arena();
    const a = guard(sid, mapId, 'A');
    const dead = guard(sid, mapId, 'Corpse', 0);
    const c = guard(sid, mapId, 'C');
    setTokenInitiative(a.token.id, 30);
    setTokenInitiative(dead.token.id, 20);
    setTokenInitiative(c.token.id, 10);
    setActiveTurn(sid, a.token.id);
    advanceTurn(sid);
    expect(getSessionById(sid)!.activeTurnTokenId).toBe(c.token.id);
  });
});

describe('bulk disposition', () => {
  it('flips every selected creature at once', () => {
    const { sid, mapId } = arena();
    const a = guard(sid, mapId, 'Bandit A');
    const b = guard(sid, mapId, 'Bandit B');
    expect(getMonster(a.monsterId)!.disposition).toBe('enemy'); // the default
    const changed = setTokensDisposition([a.token.id, b.token.id], 'friendly');
    expect(changed).toBe(2);
    expect(getMonster(a.monsterId)!.disposition).toBe('friendly');
    expect(getMonster(b.monsterId)!.disposition).toBe('friendly');
  });

  it('skips PC tokens (they have no disposition) and unknown ids', () => {
    const { sid, mapId } = arena();
    const ch = createCharacter(sid, { name: 'Hero', maxHp: 10 });
    const pc = createToken({ mapId, kind: 'pc', refId: ch.id, x: 0, y: 0 });
    const mon = guard(sid, mapId, 'Wolf');
    const changed = setTokensDisposition([pc.id, 'not-a-token', mon.token.id], 'neutral');
    expect(changed).toBe(1);
    expect(getMonster(mon.monsterId)!.disposition).toBe('neutral');
    // The PC token is untouched and still resolvable.
    expect(getToken(pc.id)!.kind).toBe('pc');
  });
});
