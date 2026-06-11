import { describe, it, expect } from 'vitest';
import {
  effectiveStats,
  effectiveAc,
  saveExtra,
  skillExtra,
  activeModifiers,
  sanitizeModifiers,
} from '../../shared/modifiers.js';
import type { SheetModifier } from '../../shared/types.js';
import {
  createSession,
  createMap,
  setActiveMap,
  createToken,
  createCharacter,
  updateCharacter,
  getCharacter,
  setItem,
  listRollLog,
} from './sessions.js';
import { resolveSave, resolveSkillRoll } from './combat.js';

const mod = (
  source: string,
  target: SheetModifier['target'],
  value: number,
): SheetModifier => ({ id: `${source}-${target.kind}`, source, target, value });

describe('modifier helpers (pure)', () => {
  it('effectiveStats layers ability modifiers over the base with a breakdown', () => {
    const c = {
      stats: { STR: 16, DEX: 14 },
      modifiers: [mod('Belt', { kind: 'ability', ability: 'STR' }, 2)],
    };
    const eff = effectiveStats(c);
    expect(eff.scores.STR).toBe(18);
    expect(eff.scores.DEX).toBe(14); // untouched
    expect(eff.breakdown.STR).toEqual({
      base: 16,
      parts: [{ source: 'Belt', value: 2 }],
      total: 18,
    });
    expect(eff.breakdown.DEX.parts).toHaveLength(0);
  });

  it('only EQUIPPED items contribute; an item modifier defaults its source to the item name', () => {
    const belt = {
      id: 'i1',
      name: 'Belt of Hill Giant Strength',
      qty: 1,
      note: '',
      modifiers: [mod('', { kind: 'ability', ability: 'STR' }, 2)],
    };
    const unequipped = { stats: { STR: 10 }, items: [{ ...belt, equipped: false }] };
    expect(effectiveStats(unequipped).scores.STR).toBe(10);

    const equipped = { stats: { STR: 10 }, items: [{ ...belt, equipped: true }] };
    expect(effectiveStats(equipped).scores.STR).toBe(12);
    expect(activeModifiers(equipped)[0].source).toBe('Belt of Hill Giant Strength');
  });

  it('a set-score modifier floors the ability ("your Strength is 19")', () => {
    const gauntlets = (str: number, extra: SheetModifier[] = []) =>
      effectiveStats({
        stats: { STR: str },
        modifiers: [
          { ...mod('Gauntlets of Ogre Power', { kind: 'ability', ability: 'STR' }, 19), set: true },
          ...extra,
        ],
      });
    // Raises a lower score and shows up in the breakdown as a set part.
    expect(gauntlets(12).scores.STR).toBe(19);
    expect(gauntlets(12).breakdown.STR.parts).toEqual([
      { source: 'Gauntlets of Ogre Power', value: 19, set: true },
    ]);
    // Inert when the score is already higher (and stays out of the tooltip).
    expect(gauntlets(20).scores.STR).toBe(20);
    expect(gauntlets(20).breakdown.STR.parts).toHaveLength(0);
    // Floors AFTER flat bonuses; the higher of bonus-total vs floor wins.
    const belt = mod('Belt', { kind: 'ability', ability: 'STR' }, 2);
    expect(gauntlets(18, [belt]).scores.STR).toBe(20); // 18+2 beats the 19 floor
    expect(gauntlets(10, [belt]).scores.STR).toBe(19); // 10+2 floored up to 19
  });

  it('sanitizeModifiers validates untrusted (AI/REST) data, keeping multiples', () => {
    const clean = sanitizeModifiers([
      { target: { kind: 'ac' }, value: 1, source: 'Cloak' },
      { target: { kind: 'save' }, value: '1' }, // numeric string ok
      { target: { kind: 'ability', ability: 'wis' }, value: 2 }, // case-fixed
      { target: { kind: 'ability', ability: 'STR' }, value: 19, set: true },
      { target: { kind: 'skill', skill: 'Stealth' }, value: 99 }, // clamped
      { target: { kind: 'attack' }, value: 1, set: true }, // set only for abilities
      { target: { kind: 'luck' }, value: 3 }, // unknown kind dropped
      { target: { kind: 'ability', ability: 'XYZ' }, value: 2 }, // bad ability dropped
      { target: { kind: 'ac' }, value: 0 }, // no-op dropped
      'garbage',
    ]);
    expect(clean).toHaveLength(6);
    expect(clean.map((m) => m.target.kind)).toEqual([
      'ac', 'save', 'ability', 'ability', 'skill', 'attack',
    ]);
    expect(clean[1].value).toBe(1);
    expect(clean[2].target).toEqual({ kind: 'ability', ability: 'WIS' });
    expect(clean[3].set).toBe(true);
    expect(clean[4].value).toBe(30);
    expect(clean[5].set).toBeUndefined();
    expect(clean.every((m) => m.id)).toBe(true);
    expect(sanitizeModifiers('not an array')).toEqual([]);
    expect(sanitizeModifiers(undefined)).toEqual([]);
  });

  it('effectiveAc and save/skill extras (all-save + specific-skill)', () => {
    const cloak = {
      armorClass: 15,
      modifiers: [
        mod('Cloak of Protection', { kind: 'ac' }, 1),
        mod('Cloak of Protection', { kind: 'save' }, 1), // all saves
        mod('Boots', { kind: 'skill', skill: 'Stealth' }, 5),
      ],
    };
    expect(effectiveAc(cloak)).toBe(16);
    expect(saveExtra(cloak, 'STR').total).toBe(1); // all-saves applies
    expect(saveExtra(cloak, 'wis').total).toBe(1); // case-insensitive
    expect(skillExtra(cloak, 'Stealth').total).toBe(5);
    expect(skillExtra(cloak, 'Arcana').total).toBe(0); // specific skill only
  });
});

describe('modifiers flow through the server roll math', () => {
  const pc = (stats: Record<string, number>) => {
    const s = createSession('Mods');
    const map = createMap(s.id, { name: 'M' });
    setActiveMap(s.id, map.id);
    const ch = createCharacter(s.id, { name: 'Hero', level: 1, stats });
    const tok = createToken({ mapId: map.id, kind: 'pc', refId: ch.id, x: 0, y: 0 });
    return { s, ch, tok };
  };
  // The logged save detail shows "(+<mod>...)" — the ability mod, independent of
  // the random d20 — so we can assert the effective modifier deterministically.

  it('an equipped +2 STR belt raises the STR save modifier (and unequipping reverts it)', () => {
    const { s, ch } = pc({ STR: 16 });
    resolveSave(s.id, 'DM', 'pc', ch.id, 'STR');
    expect(listRollLog(s.id).at(-1)!.detail).toContain('(+3'); // 16 → +3

    const belt = {
      id: 'belt',
      name: 'Belt',
      qty: 1,
      note: '',
      modifiers: [mod('Belt', { kind: 'ability', ability: 'STR' }, 2)],
      equipped: true,
    };
    setItem(ch.id, belt);
    resolveSave(s.id, 'DM', 'pc', ch.id, 'STR');
    expect(listRollLog(s.id).at(-1)!.detail).toContain('(+4'); // 18 → +4

    setItem(ch.id, { ...belt, equipped: false });
    resolveSave(s.id, 'DM', 'pc', ch.id, 'STR');
    expect(listRollLog(s.id).at(-1)!.detail).toContain('(+3'); // reverted
  });

  it('a flat all-saves modifier is added and named in the save log', () => {
    const { s, ch } = pc({ DEX: 10 });
    updateCharacter(ch.id, {
      modifiers: [mod('Cloak of Protection', { kind: 'save' }, 1)],
    });
    resolveSave(s.id, 'DM', 'pc', ch.id, 'DEX');
    const detail = listRollLog(s.id).at(-1)!.detail;
    expect(detail).toContain('Cloak of Protection');
  });

  it('a flat skill modifier is folded into a skill check', () => {
    const { s, ch } = pc({ DEX: 10 });
    updateCharacter(ch.id, {
      modifiers: [mod('Boots of Elvenkind', { kind: 'skill', skill: 'Stealth' }, 5)],
    });
    resolveSkillRoll(s.id, 'Hero', getCharacter(ch.id)!, 'Stealth');
    const detail = listRollLog(s.id).at(-1)!.detail;
    expect(detail).toContain('+5');
    expect(detail).toContain('Boots of Elvenkind');
  });
});
