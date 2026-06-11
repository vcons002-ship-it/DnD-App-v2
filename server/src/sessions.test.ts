import { describe, it, expect } from 'vitest';
import {
  createSession,
  normalizeSessionCode,
  SessionCodeError,
  changeSessionCode,
  deleteSession,
  getSessionByCode,
  listMaps,
  listTokens,
  importMaps,
  createMap,
  createMonsterTemplate,
  instantiateMonster,
  createToken,
  resizeToken,
  rollAllInitiative,
  rollMissingInitiative,
  advanceTurn,
  clearInitiative,
  setActiveTurn,
  setCombatRound,
  setTokenInitiative,
  setActiveMap,
  getSessionById,
  getToken,
  getMonster,
  applyDamage,
  setDeathSaves,
  deleteToken,
  deleteMonster,
  createCharacter,
  listCharacters,
  deleteCharacter,
  previewImportCharacters,
  claimCharacter,
  getCharacter,
  setCharacterOwner,
} from './sessions.js';

describe('custom session codes', () => {
  it('normalizes a human-typed code (uppercase, A–Z/0–9 only)', () => {
    expect(normalizeSessionCode('tavern!!')).toBe('TAVERN');
    expect(normalizeSessionCode(' my-game 7 ')).toBe('MYGAME7');
  });

  it('creates a session under a chosen memorable code', () => {
    const code = `T${Date.now().toString(36).toUpperCase()}`.slice(0, 10);
    const s = createSession('Campaign', code);
    expect(s.code).toBe(normalizeSessionCode(code));
  });

  it('rejects a duplicate custom code and a too-short one', () => {
    const code = `D${Date.now().toString(36).toUpperCase()}`.slice(0, 10);
    createSession('First', code);
    expect(() => createSession('Second', code)).toThrow(SessionCodeError);
    expect(() => createSession('Tiny', 'A')).toThrow(SessionCodeError);
  });
});

describe('editing & deleting saved sessions', () => {
  const uniq = (p: string) =>
    `${p}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`
      .toUpperCase()
      .slice(0, 12);

  it('changes the join code in place, preserving all data', () => {
    const s = createSession('Campaign');
    const map = createMap(s.id, { name: 'Cavern' });
    const newCode = uniq('R');
    const result = changeSessionCode(s.id, newCode);
    expect(result).toBe(normalizeSessionCode(newCode));
    // The old code no longer resolves; the new code resolves to the SAME session
    // and the SAME data (data is keyed by session id, not code).
    expect(getSessionByCode(s.code)).toBeNull();
    const moved = getSessionByCode(newCode);
    expect(moved?.id).toBe(s.id);
    expect(listMaps(s.id).map((m) => m.id)).toContain(map.id);
  });

  it('rejects a duplicate or too-short new code', () => {
    const a = createSession('A', uniq('X'));
    const b = createSession('B');
    expect(() => changeSessionCode(b.id, a.code)).toThrow(SessionCodeError);
    expect(() => changeSessionCode(b.id, 'A')).toThrow(SessionCodeError);
  });

  it('deletes a session and cascades to its maps/tokens', () => {
    const s = createSession('Doomed');
    const map = createMap(s.id, { name: 'Field' });
    const tmpl = createMonsterTemplate(s.id, { name: 'Rat', maxHp: 1 });
    const tok = createToken({
      mapId: map.id,
      kind: 'monster',
      refId: instantiateMonster(tmpl.id)!.id,
      x: 0,
      y: 0,
    });
    deleteSession(s.id);
    expect(getSessionByCode(s.code)).toBeNull();
    expect(listMaps(s.id)).toHaveLength(0);
    expect(getToken(tok.id)).toBeFalsy();
  });
});

describe('token footprint width (feet)', () => {
  it('defaults a new token to 5ft and resizes in feet (clamped)', () => {
    const s = createSession('Sized');
    const map = createMap(s.id, { name: 'Yard' });
    const tmpl = createMonsterTemplate(s.id, { name: 'Ogre', maxHp: 59 });
    const tok = createToken({
      mapId: map.id,
      kind: 'monster',
      refId: instantiateMonster(tmpl.id)!.id,
      x: 0,
      y: 0,
    });
    expect(tok.widthFt).toBe(5); // Medium default

    resizeToken(tok.id, 10); // Large
    expect(getToken(tok.id)!.widthFt).toBe(10);

    resizeToken(tok.id, 7.5); // snaps to half-foot steps
    expect(getToken(tok.id)!.widthFt).toBe(7.5);

    resizeToken(tok.id, 0); // clamps to the 0.5ft minimum
    expect(getToken(tok.id)!.widthFt).toBe(0.5);
  });
});

describe('importing maps from another session', () => {
  it('deep-copies picked maps + their tokens + referenced creatures', () => {
    const src = createSession('Source');
    const map = createMap(src.id, { name: 'Crypt' });
    const tmpl = createMonsterTemplate(src.id, { name: 'Skeleton', maxHp: 13 });
    createToken({
      mapId: map.id,
      kind: 'monster',
      refId: instantiateMonster(tmpl.id)!.id,
      x: 10,
      y: 20,
    });

    const dest = createSession('Dest');
    const n = importMaps(dest.id, src.code, [map.id]);
    expect(n).toBe(1);

    // Dest gained a NEW map (different id) carrying a copied token.
    const destMaps = listMaps(dest.id);
    expect(destMaps).toHaveLength(1);
    expect(destMaps[0].id).not.toBe(map.id);
    expect(destMaps[0].name).toBe('Crypt');
    const destTokens = listTokens(destMaps[0].id);
    expect(destTokens).toHaveLength(1);
    expect(destTokens[0].x).toBe(10);

    // The source is untouched, and the copy references a NEW creature row.
    expect(listMaps(src.id)).toHaveLength(1);
    expect(destTokens[0].refId).not.toBe(listTokens(map.id)[0].refId);
  });

  it('ignores map ids that do not belong to the source session', () => {
    const src = createSession('S2');
    const dest = createSession('D2');
    expect(importMaps(dest.id, src.code, ['nope'])).toBe(0);
    expect(listMaps(dest.id)).toHaveLength(0);
  });

  it('resolves same-named character conflicts (reuse / overwrite / new)', () => {
    // (createSession seeds a default party, so we measure the "Conf Hero" rows.)
    const named = (sid: string) =>
      listCharacters(sid).filter((c) => c.name === 'Conf Hero');

    const mkSource = (suffix: string, level: number) => {
      const src = createSession('Src-' + suffix);
      const map = createMap(src.id, { name: 'Hall' });
      const c = createCharacter(src.id, { name: 'Conf Hero', className: 'Bard', level });
      createToken({ mapId: map.id, kind: 'pc', refId: c.id, x: 1, y: 1 });
      return { src, map };
    };

    // Target already has a "Conf Hero" (level 1).
    const dest = createSession('Dest-conf');
    createCharacter(dest.id, { name: 'Conf Hero', className: 'Bard', level: 1 });

    // Preview flags the collision.
    const a = mkSource('a', 5);
    const conflicts = previewImportCharacters(dest.id, a.src.code, [a.map.id]);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].exists).toBe(true);

    // reuse → no new character; token links to the existing (still level 1) hero.
    importMaps(dest.id, a.src.code, [a.map.id], {
      resolutions: { [conflicts[0].sourceId]: 'reuse' },
    });
    expect(named(dest.id)).toHaveLength(1);
    expect(named(dest.id)[0].level).toBe(1);

    // overwrite → still one hero, but now updated to the source's level 5.
    const b = mkSource('b', 5);
    const bc = previewImportCharacters(dest.id, b.src.code, [b.map.id]);
    importMaps(dest.id, b.src.code, [b.map.id], {
      resolutions: { [bc[0].sourceId]: 'overwrite' },
    });
    expect(named(dest.id)).toHaveLength(1);
    expect(named(dest.id)[0].level).toBe(5);

    // new → a second, separate hero is created.
    const c = mkSource('c', 3);
    const cc = previewImportCharacters(dest.id, c.src.code, [c.map.id]);
    importMaps(dest.id, c.src.code, [c.map.id], {
      resolutions: { [cc[0].sourceId]: 'new' },
    });
    expect(named(dest.id)).toHaveLength(2);
  });

  it('never overwrites a character claimed by an active player', () => {
    const named = (sid: string) =>
      listCharacters(sid).filter((c) => c.name === 'Claim Hero');
    const dest = createSession('Dest-claim');
    createCharacter(dest.id, { name: 'Claim Hero', level: 1 });

    const src = createSession('Src-claim');
    const map = createMap(src.id, { name: 'Cave' });
    const c = createCharacter(src.id, { name: 'Claim Hero', level: 9 });
    createToken({ mapId: map.id, kind: 'pc', refId: c.id, x: 0, y: 0 });
    const pre = previewImportCharacters(dest.id, src.code, [map.id]);

    importMaps(dest.id, src.code, [map.id], {
      resolutions: { [pre[0].sourceId]: 'overwrite' },
      isClaimActive: () => true, // pretend the existing hero is actively claimed
    });
    // Overwrite fell back to reuse: still one hero, unchanged at level 1.
    expect(named(dest.id)).toHaveLength(1);
    expect(named(dest.id)[0].level).toBe(1);
  });
});

describe('deleting a player character', () => {
  it('removes the character and its placed tokens', () => {
    const s = createSession('Del-PC');
    const map = createMap(s.id, { name: 'Yard' });
    const c = createCharacter(s.id, { name: 'Temp Hero', level: 2 });
    const tok = createToken({ mapId: map.id, kind: 'pc', refId: c.id, x: 0, y: 0 });
    deleteCharacter(c.id);
    expect(listCharacters(s.id).some((x) => x.id === c.id)).toBe(false);
    expect(getToken(tok.id)).toBeFalsy();
  });
});

describe('character ownership (durable player id)', () => {
  it('first identified claim takes ownership; later claims never overwrite it', () => {
    const s = createSession('Own');
    const c = createCharacter(s.id, { name: 'Druk' });
    expect(getCharacter(c.id)!.ownerId).toBeNull();

    claimCharacter(c.id, 'sock-A', 'player-A');
    expect(getCharacter(c.id)!.ownerId).toBe('player-A');
    expect(getCharacter(c.id)!.claimedBy).toBe('sock-A');

    // A reconnect (new socket, same player) re-claims; owner unchanged.
    claimCharacter(c.id, 'sock-A2', 'player-A');
    expect(getCharacter(c.id)!.ownerId).toBe('player-A');
    expect(getCharacter(c.id)!.claimedBy).toBe('sock-A2');

    // Even if a different player somehow claims, the OWNER never flips
    // (the socket handler rejects such claims before this point anyway).
    claimCharacter(c.id, 'sock-B', 'player-B');
    expect(getCharacter(c.id)!.ownerId).toBe('player-A');
  });

  it('claims without a player id (legacy clients) leave the character unowned', () => {
    const s = createSession('OwnLegacy');
    const c = createCharacter(s.id, { name: 'Old Hand' });
    claimCharacter(c.id, 'sock-X', null);
    expect(getCharacter(c.id)!.ownerId).toBeNull();
  });

  it('DM unlock clears the owner AND the live claim', () => {
    const s = createSession('OwnUnlock');
    const c = createCharacter(s.id, { name: 'Varis' });
    claimCharacter(c.id, 'sock-A', 'player-A');
    setCharacterOwner(c.id, null);
    const after = getCharacter(c.id)!;
    expect(after.ownerId).toBeNull();
    expect(after.claimedBy).toBeNull();
  });
});

describe('initiative includes the DEX modifier', () => {
  it('a high-DEX creature never rolls below 1 + its DEX modifier', () => {
    const s = createSession('Init');
    const map = createMap(s.id, { name: 'Field' });
    const tmpl = createMonsterTemplate(s.id, { name: 'Cat', maxHp: 2, stats: { DEX: 20 } });
    const tok = createToken({
      mapId: map.id,
      kind: 'monster',
      refId: instantiateMonster(tmpl.id)!.id,
      x: 0,
      y: 0,
    });
    // DEX 20 → +5, so a d20 + 5 is always between 6 and 25 (never a bare d20).
    for (let i = 0; i < 50; i++) {
      rollAllInitiative(map.id);
      const init = getToken(tok.id)!.initiative!;
      expect(init).toBeGreaterThanOrEqual(6);
      expect(init).toBeLessThanOrEqual(25);
    }
  });
});

describe('combat rounds + objects sit out of initiative', () => {
  const arena = () => {
    const s = createSession('Rounds');
    const map = createMap(s.id, { name: 'Pit' });
    setActiveMap(s.id, map.id);
    return { s, map };
  };
  const fighter = (s: { id: string }, map: { id: string }, name: string) => {
    const tmpl = createMonsterTemplate(s.id, { name, maxHp: 10 });
    return createToken({
      mapId: map.id,
      kind: 'monster',
      refId: instantiateMonster(tmpl.id)!.id,
      x: 0,
      y: 0,
    });
  };

  it('objects (chests/doors/traps) never roll initiative', () => {
    const { s, map } = arena();
    const orc = fighter(s, map, 'Orc');
    const chest = createToken({
      mapId: map.id,
      kind: 'monster',
      refId: instantiateMonster(
        createMonsterTemplate(s.id, { name: 'Chest', maxHp: 1, objectKind: 'chest' }).id,
      )!.id,
      x: 1,
      y: 1,
    });
    // A stray roll on an object (old saves) is cleared by Roll all.
    setTokenInitiative(chest.id, 15);

    rollAllInitiative(map.id);
    expect(getToken(orc.id)!.initiative).not.toBeNull();
    expect(getToken(chest.id)!.initiative).toBeNull();

    setTokenInitiative(orc.id, null);
    rollMissingInitiative(map.id);
    expect(getToken(orc.id)!.initiative).not.toBeNull();
    expect(getToken(chest.id)!.initiative).toBeNull();
  });

  it('the round counter advances on a wrap, survives latecomers, and resets', () => {
    const { s, map } = arena();
    const a = fighter(s, map, 'A');
    const b = fighter(s, map, 'B');
    setTokenInitiative(a.id, 20);
    setTokenInitiative(b.id, 10);
    setActiveTurn(s.id, a.id);
    setCombatRound(s.id, 1);

    advanceTurn(s.id); // A → B (same round)
    expect(getSessionById(s.id)!.combatRound).toBe(1);
    advanceTurn(s.id); // B wraps → A, round 2
    expect(getSessionById(s.id)!.combatRound).toBe(2);

    // A latecomer rolls in mid-round (top of the order) — counter untouched,
    // and the next wrap still counts exactly one new round.
    const c = fighter(s, map, 'C');
    setTokenInitiative(c.id, 30);
    expect(getSessionById(s.id)!.combatRound).toBe(2);
    advanceTurn(s.id); // A → B
    advanceTurn(s.id); // B wraps → C, round 3
    expect(getSessionById(s.id)!.combatRound).toBe(3);

    setCombatRound(s.id, 1); // the reset button
    expect(getSessionById(s.id)!.combatRound).toBe(1);
    clearInitiative(s.id); // ending combat zeroes it
    expect(getSessionById(s.id)!.combatRound).toBe(0);
  });
});

describe('dead combatants keep their slot but lose their turn', () => {
  const arena2 = () => {
    const s = createSession('DeadSkip');
    const map = createMap(s.id, { name: 'Pit' });
    setActiveMap(s.id, map.id);
    return { s, map };
  };
  const mon = (s: { id: string }, map: { id: string }, name: string, init: number) => {
    const inst = instantiateMonster(
      createMonsterTemplate(s.id, { name, maxHp: 10 }).id,
    )!;
    const tok = createToken({ mapId: map.id, kind: 'monster', refId: inst.id, x: 0, y: 0 });
    setTokenInitiative(tok.id, init);
    return { tok, inst };
  };

  it('skips a dead monster mid-order and still counts the wrap past a dead LAST slot', () => {
    const { s, map } = arena2();
    const a = mon(s, map, 'A', 20);
    const b = mon(s, map, 'B', 10);
    const c = mon(s, map, 'C', 5);
    setActiveTurn(s.id, a.tok.id);
    setCombatRound(s.id, 1);

    applyDamage('monster', b.inst.id, 999); // B dies, keeps its roll + slot
    expect(getToken(b.tok.id)!.initiative).toBe(10);

    advanceTurn(s.id); // A → (skip B) → C, same round
    expect(getSessionById(s.id)!.activeTurnTokenId).toBe(c.tok.id);
    expect(getSessionById(s.id)!.combatRound).toBe(1);

    applyDamage('monster', c.inst.id, 999); // now the LAST slot is dead too
    advanceTurn(s.id); // C → wrap (skipping nothing live until A) → round 2
    expect(getSessionById(s.id)!.activeTurnTokenId).toBe(a.tok.id);
    expect(getSessionById(s.id)!.combatRound).toBe(2);
  });

  it('a downed PC keeps its turn; an actually-dead one (3 failures) is skipped', () => {
    const { s, map } = arena2();
    const a = mon(s, map, 'A', 20);
    const pc = createCharacter(s.id, { name: 'Hero', maxHp: 10 });
    const pcTok = createToken({ mapId: map.id, kind: 'pc', refId: pc.id, x: 1, y: 1 });
    setTokenInitiative(pcTok.id, 10);
    setActiveTurn(s.id, a.tok.id);
    setCombatRound(s.id, 1);

    applyDamage('pc', pc.id, 999); // down to 0 — dying, NOT dead
    advanceTurn(s.id);
    expect(getSessionById(s.id)!.activeTurnTokenId).toBe(pcTok.id); // death-save turn

    setActiveTurn(s.id, a.tok.id);
    setDeathSaves(pc.id, 0, 3); // three failures → dead → skipped
    advanceTurn(s.id);
    expect(getSessionById(s.id)!.activeTurnTokenId).toBe(a.tok.id); // wrapped back
    expect(getSessionById(s.id)!.combatRound).toBe(2);
  });

  it('deleting the current-turn token ticks to the next; a last-slot delete wraps the round', () => {
    const { s, map } = arena2();
    const a = mon(s, map, 'A', 20);
    const b = mon(s, map, 'B', 10);
    setCombatRound(s.id, 1);

    setActiveTurn(s.id, a.tok.id);
    deleteToken(a.tok.id); // mid-order: marker just ticks to B
    expect(getSessionById(s.id)!.activeTurnTokenId).toBe(b.tok.id);
    expect(getSessionById(s.id)!.combatRound).toBe(1);

    deleteToken(b.tok.id); // B was current AND the only living combatant left
    expect(getSessionById(s.id)!.activeTurnTokenId).toBeNull();
  });

  it('deleting the last-in-order current creature (via deleteMonster) wraps + counts', () => {
    const { s, map } = arena2();
    const a = mon(s, map, 'A', 20);
    const b = mon(s, map, 'B', 10);
    setCombatRound(s.id, 1);
    setActiveTurn(s.id, b.tok.id); // B is last in order
    deleteMonster(b.inst.id); // bulk path goes through the same guard
    expect(getSessionById(s.id)!.activeTurnTokenId).toBe(a.tok.id);
    expect(getSessionById(s.id)!.combatRound).toBe(2);
    expect(getMonster(b.inst.id)).toBeNull();
  });
});
