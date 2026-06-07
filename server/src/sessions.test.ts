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
  getToken,
  createCharacter,
  listCharacters,
  deleteCharacter,
  previewImportCharacters,
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

    resizeToken(tok.id, 0); // clamps to the 2.5ft minimum
    expect(getToken(tok.id)!.widthFt).toBe(2.5);
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
