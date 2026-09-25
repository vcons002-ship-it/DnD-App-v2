import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  createSession,
  createMap,
  setActiveMap,
  createToken,
  createCharacter,
  createMonsterTemplate,
  instantiateMonster,
  updateCharacter,
  updateMonster,
  getCharacter,
  getMonster,
  listRollLog,
  getRollEntry,
  setManualDamage,
  setSheetAbility,
  setResource,
  spendSpellSlot,
  pactSlotLevel,
} from './sessions.js';
import { resolveAttack, resolveSave, resolveSmite, castSlotLevel } from './combat.js';
import { getFeature } from './features/srd.js';
import { getSpell } from './spells/srd.js';
import { classFeatureUses } from '../../shared/classFeatureUses.js';
import { applyRulesUpdate, isOutdated } from '../../shared/rulesUpdate.js';
import type { SheetAbility, Weapon } from '../../shared/types.js';

/** Group C of the 25 Sep review: class features and spell slots. */

afterEach(() => vi.restoreAllMocks());

function arena() {
  const s = createSession('Features');
  const map = createMap(s.id, { name: 'Yard' });
  setActiveMap(s.id, map.id);
  setManualDamage(s.id, false);
  return { sid: s.id, mapId: map.id };
}

/** Add a DB entry to a sheet (as the picker would). */
const fromDb = (entry: Omit<SheetAbility, 'id'> | null, id: string): SheetAbility => {
  if (!entry) throw new Error('missing DB entry');
  return { ...(entry as SheetAbility), id };
};

/** Swing until a plain HIT (not a crit) lands; returns the log entry. */
function hitOnce(sid: string, atk: string, tgt: string, crit = false) {
  for (let i = 0; i < 400; i++) {
    resolveAttack(sid, 'X', atk, tgt, 0);
    const e = listRollLog(sid).filter((x) => x.label === 'Attack').at(-1)!;
    if (crit ? /— CRIT/.test(e.detail) : /— HIT/.test(e.detail)) return e;
  }
  throw new Error('never landed');
}

// ---------------------------------------------------------------------------
describe('Rage (current definition)', () => {
  const rager = (level: number) => {
    const { sid, mapId } = arena();
    const b = createCharacter(sid, {
      name: 'Grog', className: 'Barbarian', level, stats: { STR: 10 },
      weapons: [{ name: 'Club', kind: 'melee', damage: '1d1', damageType: 'bludgeoning', attackBonus: 50 }],
    });
    const rage = fromDb(getFeature('Rage'), 'rage');
    setSheetAbility('pc', b.id, { ...rage, stance: { ...rage.stance!, active: true } });
    const bTok = createToken({ mapId, kind: 'pc', refId: b.id, x: 0, y: 0 });
    const t = instantiateMonster(createMonsterTemplate(sid, { name: 'Dummy', maxHp: 9999, armorClass: 1,
      weapons: [{ name: 'Blade', kind: 'melee', damage: '10d1', damageType: 'slashing', attackBonus: 50 }] }).id)!;
    const tTok = createToken({ mapId, kind: 'monster', refId: t.id, x: 60, y: 0 });
    return { sid, b, bTok: bTok.id, t, tTok: tTok.id };
  };

  it('adds +2 / +3 / +4 damage at levels 1 / 9 / 16', () => {
    for (const [level, bonus] of [[1, 2], [9, 3], [16, 4]] as const) {
      const f = rager(level);
      const before = getMonster(f.t.id)!.curHp;
      hitOnce(f.sid, f.bTok, f.tTok);
      expect(before - getMonster(f.t.id)!.curHp, `level ${level}`).toBe(1 + bonus);
    }
  });

  it('resists bludgeoning, piercing and slashing while raging', () => {
    const f = rager(3);
    const before = getCharacter(f.b.id)!.curHp;
    hitOnce(f.sid, f.tTok, f.bTok); // 10 slashing → 5
    expect(before - getCharacter(f.b.id)!.curHp).toBe(5);
  });

  it('gives advantage on a Strength save — and cancels against requested disadvantage', () => {
    const f = rager(3);
    resolveSave(f.sid, 'X', 'pc', f.b.id, 'STR');
    expect(listRollLog(f.sid).at(-1)!.detail).toMatch(/Rage/);
    resolveSave(f.sid, 'X', 'pc', f.b.id, 'STR', 'dis');
    expect(listRollLog(f.sid).at(-1)!.detail).toMatch(/cancel|straight/i);
  });
});

describe('Reckless Attack (current definition)', () => {
  it('attackers get advantage against a creature with it on', () => {
    const { sid, mapId } = arena();
    const b = createCharacter(sid, { name: 'Grog', className: 'Barbarian', level: 3 });
    const reckless = fromDb(getFeature('Reckless Attack'), 'ra');
    setSheetAbility('pc', b.id, { ...reckless, stance: { ...reckless.stance!, active: true } });
    const bTok = createToken({ mapId, kind: 'pc', refId: b.id, x: 60, y: 0 });
    const m = instantiateMonster(createMonsterTemplate(sid, { name: 'Orc', maxHp: 15,
      weapons: [{ name: 'Axe', kind: 'melee', damage: '1d1', attackBonus: 0 }] }).id)!;
    const mTok = createToken({ mapId, kind: 'monster', refId: m.id, x: 0, y: 0 });
    resolveAttack(sid, 'DM', mTok.id, bTok.id, 0);
    expect(listRollLog(sid).at(-1)!.detail).toMatch(/adv: .*target Reckless Attack/);
  });
});

// ---------------------------------------------------------------------------
describe('Divine Smite (2024): chosen after a qualifying hit', () => {
  const paladin = (level = 3, weapon: Weapon = { name: 'Longsword', kind: 'melee', damage: '1d1',
    damageType: 'slashing', attackBonus: 50 }, targetType = 'humanoid') => {
    const { sid, mapId } = arena();
    const p = createCharacter(sid, { name: 'Aria', className: 'Paladin', level, stats: { STR: 10 }, weapons: [weapon] });
    setSheetAbility('pc', p.id, fromDb(getSpell('Divine Smite'), 'smite'));
    const pTok = createToken({ mapId, kind: 'pc', refId: p.id, x: 0, y: 0 });
    const t = instantiateMonster(createMonsterTemplate(sid, { name: 'Foe', maxHp: 9999, armorClass: 1 }).id)!;
    updateMonster(t.id, { creatureType: targetType } as never);
    const tTok = createToken({ mapId, kind: 'monster', refId: t.id, x: 60, y: 0 });
    return { sid, p, pTok: pTok.id, t, tTok: tTok.id };
  };
  const slotsUsed = (id: string, key = 'L1') => getCharacter(id)!.spellSlots[key]?.used ?? 0;

  it('a melee hit records the chance — nothing is spent until the player chooses', () => {
    const f = paladin();
    const hit = hitOnce(f.sid, f.pTok, f.tTok);
    expect(hit.smite).toMatchObject({ owner: f.p.id, crit: false });
    expect(hit.smite!.used).toBeUndefined();
    expect(slotsUsed(f.p.id)).toBe(0);
  });

  it('a ranged hit offers no smite', () => {
    const f = paladin(3, { name: 'Bow', kind: 'ranged', damage: '1d1', attackBonus: 50 });
    expect(hitOnce(f.sid, f.pTok, f.tTok).smite).toBeUndefined();
  });

  it('with a level-1 slot: spends it ONCE and deals 2d8 radiant', () => {
    const f = paladin();
    const hit = hitOnce(f.sid, f.pTok, f.tTok);
    vi.spyOn(Math, 'random').mockReturnValue(0.999); // every die rolls max
    const before = getMonster(f.t.id)!.curHp;
    expect(resolveSmite(f.sid, 'Aria', hit.id, 1)).toEqual({ ok: true });
    expect(before - getMonster(f.t.id)!.curHp).toBe(16);
    expect(slotsUsed(f.p.id)).toBe(1);
  });

  it('a repeated request neither spends again nor damages again', () => {
    const f = paladin();
    const hit = hitOnce(f.sid, f.pTok, f.tTok);
    resolveSmite(f.sid, 'Aria', hit.id, 1);
    const hp = getMonster(f.t.id)!.curHp;
    const res = resolveSmite(f.sid, 'Aria', hit.id, 1);
    expect(res.ok).toBe(false);
    expect(getMonster(f.t.id)!.curHp).toBe(hp);
    expect(slotsUsed(f.p.id)).toBe(1);
    expect(getRollEntry(hit.id)!.smite!.used).toBe(true);
  });

  it('upcasts +1d8 per level, adds 1d8 vs undead, and doubles every die on a crit', () => {
    const f = paladin(5, undefined, 'undead');
    const crit = hitOnce(f.sid, f.pTok, f.tTok, true);
    expect(crit.smite!.crit).toBe(true);
    vi.spyOn(Math, 'random').mockReturnValue(0.999);
    const before = getMonster(f.t.id)!.curHp;
    resolveSmite(f.sid, 'Aria', crit.id, 2);
    // L2: 3d8 + 1d8 undead = 4d8, doubled on the crit = 8d8 → 64 at max.
    expect(before - getMonster(f.t.id)!.curHp).toBe(64);
  });

  it("the free casting (Paladin 2+) spends its counter, not a slot, and isn't offered twice", () => {
    const f = paladin(3);
    const first = hitOnce(f.sid, f.pTok, f.tTok);
    expect(resolveSmite(f.sid, 'Aria', first.id, 'free')).toEqual({ ok: true });
    expect(slotsUsed(f.p.id)).toBe(0);
    expect(getCharacter(f.p.id)!.resources['Divine Smite (free)'].used).toBe(1);
    const second = hitOnce(f.sid, f.pTok, f.tTok);
    expect(resolveSmite(f.sid, 'Aria', second.id, 'free').ok).toBe(false);
  });

  it('a level-1 Paladin has no free casting', () => {
    const f = paladin(1);
    const hit = hitOnce(f.sid, f.pTok, f.tTok);
    expect(resolveSmite(f.sid, 'Aria', hit.id, 'free').ok).toBe(false);
    expect(getRollEntry(hit.id)!.smite!.used).toBeUndefined(); // refusal consumes nothing
  });

  it('no slot and no free casting → no smite is offered at all', () => {
    const f = paladin(1);
    setResource(f.p.id, 'spellSlots', 'L1', { max: 2, used: 2 });
    expect(hitOnce(f.sid, f.pTok, f.tTok).smite).toBeUndefined();
  });

  it("the paladin's next swing closes an earlier smite window", () => {
    const f = paladin();
    const first = hitOnce(f.sid, f.pTok, f.tTok);
    hitOnce(f.sid, f.pTok, f.tTok);
    expect(getRollEntry(first.id)!.smite!.used).toBe(true);
  });

  it('radiant immunity stops it', () => {
    const f = paladin();
    updateMonster(f.t.id, { immunities: ['radiant'] });
    const hit = hitOnce(f.sid, f.pTok, f.tTok);
    const before = getMonster(f.t.id)!.curHp;
    resolveSmite(f.sid, 'Aria', hit.id, 1);
    expect(getMonster(f.t.id)!.curHp).toBe(before);
    expect(listRollLog(f.sid).at(-1)!.detail).toMatch(/immune/);
  });
});

describe('the legacy Divine Smite ability spends a slot, as its own text says', () => {
  it('castSlotLevel: a non-spell ability declaring a spell level is slot-fuelled', () => {
    const legacy: SheetAbility = { id: 'l', name: 'Divine Smite', type: 'ability', description: '',
      roll: { kind: 'damage', dice: '2d8', scaleDice: '1d8', baseLevel: 1, damageType: 'radiant' } };
    expect(castSlotLevel(legacy)).toBe(1);
    expect(castSlotLevel(legacy, 3)).toBe(3);
  });
  it('touches nothing else', () => {
    expect(castSlotLevel({ id: 'a', name: 'Second Wind', type: 'ability', description: '',
      roll: { kind: 'heal', dice: '1d10' } })).toBeNull();
    expect(castSlotLevel({ id: 'c', name: 'Fire Bolt', type: 'spell', level: 0, description: '' })).toBeNull();
    expect(castSlotLevel({ id: 's', name: 'Bless', type: 'spell', level: 1, description: '' }, 2)).toBe(2);
    expect(castSlotLevel({ id: 'h', name: "Hunter's Mark", type: 'stance', level: 1, description: '' })).toBe(1);
  });
});

// ---------------------------------------------------------------------------
describe('Warlock, Artificer, and one slot table for create and level-up', () => {
  it('a Warlock gets Pact Magic: two level-3 slots at Warlock 5', () => {
    const { sid } = arena();
    const w = createCharacter(sid, { name: 'Vex', className: 'Warlock', level: 5 });
    // (creation stamps maxOverride:false on 2024-derived slots — by design)
    expect(Object.keys(w.spellSlots)).toEqual(['L3']);
    expect(w.spellSlots.L3).toMatchObject({ max: 2, used: 0 });
    expect(pactSlotLevel(w)).toBe(3);
  });

  it('a level-1 spell spends a pact slot, at the pact level', () => {
    const { sid } = arena();
    const w = createCharacter(sid, { name: 'Vex', className: 'Warlock', level: 5 });
    expect(spendSpellSlot(w.id, 1)).toEqual({ hasSlot: true, spent: true, level: 3 });
    expect(getCharacter(w.id)!.spellSlots.L3.used).toBe(1);
  });

  it("pact slots move up a level on level-up — the old ones don't linger", () => {
    const { sid } = arena();
    const w = createCharacter(sid, { name: 'Vex', className: 'Warlock', level: 6 });
    updateCharacter(w.id, { level: 7 });
    expect(getCharacter(w.id)!.spellSlots).toEqual({ L4: { max: 2, used: 0 } });
  });

  it('a customised pact slot is left alone', () => {
    const { sid } = arena();
    const w = createCharacter(sid, { name: 'Vex', className: 'Warlock', level: 6 });
    setResource(w.id, 'spellSlots', 'L3', { max: 5 });
    updateCharacter(w.id, { level: 7 });
    expect(getCharacter(w.id)!.spellSlots.L3.max).toBe(5);
  });

  it('an Artificer starts with two level-1 slots', () => {
    const { sid } = arena();
    const t = createCharacter(sid, { name: 'Tink', className: 'Artificer', level: 1 });
    expect(Object.keys(t.spellSlots)).toEqual(['L1']);
    expect(t.spellSlots.L1).toMatchObject({ max: 2, used: 0 });
  });

  it('a character changed to Paladin at level 1 gets what a new level-1 Paladin gets', () => {
    // The two tables only differ at half-caster level 1 (2024: two slots; 2014:
    // none) — so that is where "2024 on create, 2014 on edit" showed.
    const { sid } = arena();
    const changed = createCharacter(sid, { name: 'A', className: 'Fighter', level: 1 });
    updateCharacter(changed.id, { className: 'Paladin' });
    const fresh = createCharacter(sid, { name: 'B', className: 'Paladin', level: 1 });
    const maxes = (id: string) =>
      Object.fromEntries(Object.entries(getCharacter(id)!.spellSlots).map(([k, v]) => [k, v.max]));
    expect(maxes(fresh.id)).toEqual({ L1: 2 });
    expect(maxes(changed.id)).toEqual(maxes(fresh.id));
  });
});

describe('Channel Divinity and Wild Shape scale with level', () => {
  it('the 2024 counts', () => {
    expect([2, 6, 18].map((l) => classFeatureUses('Channel Divinity', 'Cleric', l))).toEqual([2, 3, 4]);
    expect([3, 11].map((l) => classFeatureUses('Channel Divinity', 'Paladin', l))).toEqual([2, 3]);
    expect([2, 6, 17].map((l) => classFeatureUses('Wild Shape', 'Druid', l))).toEqual([2, 3, 4]);
    expect(classFeatureUses('Channel Divinity', 'Cleric', 1)).toBe(0);
    expect(classFeatureUses('Rage', 'Barbarian', 5)).toBeNull();
  });
  it('a new character gets the right counter', () => {
    const { sid } = arena();
    expect(createCharacter(sid, { name: 'C', className: 'Cleric', level: 6 }).resources['Channel Divinity'])
      .toEqual({ max: 3, used: 0 });
    expect(createCharacter(sid, { name: 'D', className: 'Druid', level: 17 }).resources['Wild Shape'])
      .toEqual({ max: 4, used: 0 });
  });
  it('an existing hand-set counter survives a level-up', () => {
    const { sid } = arena();
    const c = createCharacter(sid, { name: 'C', className: 'Cleric', level: 6 });
    setResource(c.id, 'resources', 'Channel Divinity', { max: 1 });
    updateCharacter(c.id, { level: 7 });
    expect(getCharacter(c.id)!.resources['Channel Divinity'].max).toBe(1);
  });
});

// ---------------------------------------------------------------------------
describe('"Update to current rules" — explicit, never silent', () => {
  const legacyRage: SheetAbility = { id: 'r1', name: 'Rage', type: 'stance', description: 'old text',
    stance: { active: true, appliesTo: 'melee', bonusDamage: '2' }, useCounter: { name: 'Rage', max: 2 } };

  it('flags an entry whose definition differs, ignoring runtime state', () => {
    const current = getFeature('Rage')!;
    expect(isOutdated(legacyRage, current)).toBe(true);
    // The same definition with different on/off state, marks and id is NOT outdated.
    const same = { ...(current as SheetAbility), id: 'x',
      stance: { ...current.stance!, active: true, targetId: 'tok' }, prepared: false };
    expect(isOutdated(same, current)).toBe(false);
  });

  it('keeps the id, takes the new definition, and comes back switched OFF', () => {
    const next = applyRulesUpdate(legacyRage, getFeature('Rage')!);
    expect(next.id).toBe('r1');
    expect(next.stance!.active).toBe(false);
    expect(next.stance!.grantsResistances).toEqual(['bludgeoning', 'piercing', 'slashing']);
  });

  it('a saved legacy entry keeps its legacy behaviour until the player updates it', () => {
    const { sid, mapId } = arena();
    const b = createCharacter(sid, { name: 'Grog', className: 'Barbarian', level: 3 });
    setSheetAbility('pc', b.id, legacyRage);
    const bTok = createToken({ mapId, kind: 'pc', refId: b.id, x: 60, y: 0 });
    const m = instantiateMonster(createMonsterTemplate(sid, { name: 'Orc', maxHp: 99,
      weapons: [{ name: 'Blade', kind: 'melee', damage: '10d1', damageType: 'slashing', attackBonus: 50 }] }).id)!;
    const mTok = createToken({ mapId, kind: 'monster', refId: m.id, x: 0, y: 0 });
    let before = getCharacter(b.id)!.curHp;
    hitOnce(sid, mTok.id, bTok.id);
    expect(before - getCharacter(b.id)!.curHp).toBe(10); // legacy: no resistance
    setSheetAbility('pc', b.id, { ...applyRulesUpdate(legacyRage, getFeature('Rage')!),
      stance: { ...applyRulesUpdate(legacyRage, getFeature('Rage')!).stance!, active: true } });
    updateCharacter(b.id, { curHp: 30 } as never);
    before = getCharacter(b.id)!.curHp;
    hitOnce(sid, mTok.id, bTok.id);
    expect(before - getCharacter(b.id)!.curHp).toBe(5); // updated + raging: resisted
  });
});
