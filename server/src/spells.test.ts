import { describe, it, expect } from 'vitest';
import {
  applyDamage,
  createSession,
  createMap,
  setActiveMap,
  createToken,
  createCharacter,
  getCharacter,
  listRollLog,
  setSheetAbility,
  removeSheetAbility,
  reorderSheetAbilities,
  spendSpellSlot,
} from './sessions.js';
import { resolveAbilityRoll } from './combat.js';
import { buildSnapshot } from './visibility.js';
import { searchSpells, getSpell, getAllSpells } from './spells/srd.js';
import { searchFeatures, getFeature } from './features/srd.js';
import type { SheetAbility } from '../../shared/types.js';

describe('concentration spells auto-set concentration', () => {
  const conc = (id: string, name: string, extra: Partial<SheetAbility> = {}): SheetAbility => ({
    id,
    name,
    type: 'spell',
    level: 1,
    description: '',
    tags: ['concentration'],
    ...extra,
  });
  const concConds = (id: string) =>
    getCharacter(id)!.conditions.filter((c) => c.isConcentration);

  it('starts concentration when a no-roll concentration spell is cast', () => {
    const s = createSession('Conc');
    const c = createCharacter(s.id, { name: 'Cleric', className: 'Cleric', level: 5, stats: { WIS: 16 } });
    expect(resolveAbilityRoll(s.id, 'Cleric', c, conc('b', 'Bless'))).toBe(true);
    expect(concConds(c.id).some((x) => x.label.includes('Bless'))).toBe(true);
    expect(listRollLog(s.id).at(-1)!.detail).toContain('concentrating');
  });

  it('keeps only one concentration — a new cast replaces the old', () => {
    const s = createSession('Conc2');
    const c = createCharacter(s.id, { name: 'Druid', className: 'Druid', level: 5, stats: { WIS: 16 } });
    resolveAbilityRoll(s.id, 'Druid', c, conc('b', 'Bless'));
    resolveAbilityRoll(s.id, 'Druid', c, conc('h', 'Hex'));
    const conds = concConds(c.id);
    expect(conds).toHaveLength(1);
    expect(conds[0].label).toContain('Hex');
  });

  it('sets concentration even for a concentration spell with a damage roll', () => {
    const s = createSession('Conc3');
    const c = createCharacter(s.id, { name: 'Mage', className: 'Wizard', level: 5, stats: { INT: 16 } });
    resolveAbilityRoll(s.id, 'Mage', c, conc('m', 'Moonbeam', {
      level: 2,
      roll: { kind: 'save', dice: '2d10', save: 'CON', baseLevel: 2 },
    }));
    expect(concConds(c.id).some((x) => x.label.includes('Moonbeam'))).toBe(true);
  });

  it("a concentration STANCE (Hunter's Mark) also starts concentration when cast", () => {
    const s = createSession('ConcStance');
    const c = createCharacter(s.id, { name: 'Ranger', className: 'Ranger', level: 5, stats: { DEX: 16 } });
    const hm: SheetAbility = {
      id: 'hm',
      name: "Hunter's Mark",
      type: 'stance',
      level: 1,
      description: '',
      tags: ['concentration'],
      stance: { active: true, appliesTo: 'all', bonusDamage: '1d6', targeted: true },
    };
    expect(resolveAbilityRoll(s.id, 'Ranger', c, hm)).toBe(true);
    expect(concConds(c.id).some((x) => x.label.includes("Hunter's Mark"))).toBe(true);
  });

  it('a non-concentration spell does not set concentration', () => {
    const s = createSession('Conc4');
    const c = createCharacter(s.id, { name: 'Mage', className: 'Wizard', level: 5, stats: { INT: 16 } });
    resolveAbilityRoll(s.id, 'Mage', c, {
      id: 'f',
      name: 'Fireball',
      type: 'spell',
      level: 3,
      description: '',
      tags: ['fire'],
      roll: { kind: 'save', dice: '8d6', save: 'DEX', baseLevel: 3 },
    });
    expect(concConds(c.id)).toHaveLength(0);
  });
});

describe('class-feature library', () => {
  it('finds features by name or class and exposes stance/counter config', () => {
    expect(searchFeatures('rage').some((f) => f.name === 'Rage')).toBe(true);
    // Searchable by class tag too.
    expect(searchFeatures('barbarian').length).toBeGreaterThanOrEqual(2);
    const rage = getFeature('Rage');
    expect(rage?.type).toBe('stance');
    expect(rage?.stance?.appliesTo).toBe('melee');
    expect(rage?.useCounter?.name).toBe('Rage');
  });

  it('groups subclass/variant features under a family search term', () => {
    // A "rage" search surfaces the base feature AND variants (e.g. Frenzy/totem).
    const rage = searchFeatures('rage', 50);
    expect(rage.some((f) => f.name === 'Rage')).toBe(true);
    expect(rage.filter((f) => (f.tags ?? []).includes('variant')).length).toBeGreaterThan(0);
    // Family keywords group their options without truncation.
    expect(searchFeatures('metamagic', 50).length).toBeGreaterThanOrEqual(4);
    expect(searchFeatures('channel divinity', 50).length).toBeGreaterThanOrEqual(2);
  });

  it("Hunter's Mark is a spell-backed concentration stance (uses a slot)", () => {
    const hm = getFeature("Hunter's Mark");
    expect(hm?.type).toBe('stance');
    expect(hm?.level).toBe(1); // a 1st-level spell → spends a slot on activation
    expect(hm?.stance?.targeted).toBe(true);
    expect((hm?.tags ?? []).map((t) => t.toLowerCase())).toContain('concentration');
  });
});

describe('local spell/ability database', () => {
  it('searches prefix-first and looks up exact names', () => {
    const hits = searchSpells('fire');
    expect(hits.some((s) => s.name === 'Fire Bolt')).toBe(true);
    expect(hits.some((s) => s.name === 'Fireball')).toBe(true);
    const fb = getSpell('fireball');
    expect(fb?.roll?.kind).toBe('save');
    expect(fb?.roll?.save).toBe('DEX');
    expect(getSpell('Nonexistent Spell')).toBeNull();
  });

  it('bundles the full SRD list with no duplicate names', () => {
    const all = getAllSpells();
    expect(all.length).toBeGreaterThan(300);
    const names = all.map((s) => s.name.toLowerCase());
    expect(new Set(names).size).toBe(names.length); // deduped
    // The curated class abilities survive the merge.
    expect(all.some((s) => s.name === 'Divine Smite')).toBe(true);
  });

  it('includes Sorcerous Burst as a rollable sorcerer cantrip', () => {
    const sb = getSpell('Sorcerous Burst');
    expect(sb).not.toBeNull();
    expect(sb?.level).toBe(0);
    expect(sb?.classes).toContain('sorcerer');
    expect(sb?.roll?.kind).toBe('attack');
    expect(sb?.roll?.scaleDice).toBe('1d8'); // cantrip scaling by caster level
  });

  it('finds entries by tag/class, not just by name', () => {
    // By class membership…
    expect(searchSpells('wizard', 100).length).toBeGreaterThan(5);
    // …by damage type/tag…
    expect(searchSpells('fire', 100).some((s) => s.name === 'Fireball')).toBe(true);
    // …and by the cantrip flag (all results are actually cantrips).
    const cantrips = searchSpells('cantrip', 100);
    expect(cantrips.length).toBeGreaterThan(5);
    expect(cantrips.every((s) => s.level === 0)).toBe(true);
  });
});

describe('sheet abilities', () => {
  it('upserts and removes spells/abilities on a character', () => {
    const s = createSession('Spells');
    const c = createCharacter(s.id, { name: 'Mage', className: 'Wizard', level: 5 });
    expect(c.sheetAbilities).toHaveLength(0);

    const entry = { ...getSpell('Fireball')!, id: 'sp1' } as SheetAbility;
    setSheetAbility('pc', c.id, entry);
    let got = getCharacter(c.id)!;
    expect(got.sheetAbilities).toHaveLength(1);
    expect(got.sheetAbilities[0].name).toBe('Fireball');

    // Upsert by id replaces rather than duplicates.
    setSheetAbility('pc', c.id, { ...entry, name: 'Fireball (homebrew)' });
    got = getCharacter(c.id)!;
    expect(got.sheetAbilities).toHaveLength(1);
    expect(got.sheetAbilities[0].name).toBe('Fireball (homebrew)');

    removeSheetAbility('pc', c.id, 'sp1');
    expect(getCharacter(c.id)!.sheetAbilities).toHaveLength(0);
  });

  it('reorders sheet abilities and keeps unnamed entries (durable across reload)', () => {
    const s = createSession('Reorder');
    const c = createCharacter(s.id, { name: 'Mage', className: 'Wizard', level: 5 });
    for (const id of ['a', 'b', 'c']) {
      setSheetAbility('pc', c.id, {
        id,
        name: id.toUpperCase(),
        type: 'spell',
        level: 1,
      } as SheetAbility);
    }
    // Move 'c' to the front; 'a' is omitted from the order → appended after.
    reorderSheetAbilities('pc', c.id, ['c', 'b']);
    const order = getCharacter(c.id)!.sheetAbilities.map((x) => x.id);
    expect(order).toEqual(['c', 'b', 'a']);
    // Unknown ids are ignored without dropping anything.
    reorderSheetAbilities('pc', c.id, ['zzz', 'a', 'b', 'c']);
    expect(getCharacter(c.id)!.sheetAbilities.map((x) => x.id)).toEqual(['a', 'b', 'c']);
  });

  it('resolves an attack roll into the shared log', () => {
    const s = createSession('Cast');
    const c = createCharacter(s.id, {
      name: 'Cleric',
      className: 'Cleric',
      level: 5,
      stats: { WIS: 18 },
    });
    const guidingBolt = { ...getSpell('Guiding Bolt')!, id: 'gb' } as SheetAbility;
    const ok = resolveAbilityRoll(s.id, 'Cleric', c, guidingBolt);
    expect(ok).toBe(true);
    const log = listRollLog(s.id);
    const last = log[log.length - 1];
    expect(last.label).toBe('Attack'); // gets the attack color-coding
    expect(last.detail).toContain('to hit');
    expect(last.detail).toContain('dmg');
  });

  it('resolves a save-spell roll and notes the DC, upcasting the dice', () => {
    const s = createSession('Boom');
    const c = createCharacter(s.id, {
      name: 'Mage',
      className: 'Wizard',
      level: 9,
      stats: { INT: 18 },
    });
    const fireball = { ...getSpell('Fireball')!, id: 'fb' } as SheetAbility;
    // Cast at 5th level (2 above base) → at least 10d6, so total ≥ 10.
    resolveAbilityRoll(s.id, 'Mage', c, fireball, 5);
    const last = listRollLog(s.id).at(-1)!;
    expect(last.label).toBe('Fireball');
    expect(last.detail).toContain('DEX save');
    expect(last.detail).toContain('L5');
    expect(last.total).toBeGreaterThanOrEqual(10);
  });

  it('spends spell slots and reports availability', () => {
    const s = createSession('Slots');
    const c = createCharacter(s.id, { name: 'Wiz', className: 'Wizard', level: 3 });
    expect(c.spellSlots.L2.max).toBe(2); // full caster has 2nd-level slots at L3

    expect(spendSpellSlot(c.id, 2)).toEqual({ hasSlot: true, spent: true });
    expect(getCharacter(c.id)!.spellSlots.L2.used).toBe(1);

    spendSpellSlot(c.id, 2); // now 2/2 used
    expect(spendSpellSlot(c.id, 2)).toEqual({ hasSlot: true, spent: false }); // tapped out
    // A level-3 wizard has no 9th-level slot at all.
    expect(spendSpellSlot(c.id, 9)).toEqual({ hasSlot: false, spent: false });
  });

  it('returns false for a descriptive ability with no roll', () => {
    const s = createSession('Desc');
    const c = createCharacter(s.id, { name: 'Bob', className: 'Fighter', level: 1 });
    const before = listRollLog(s.id).length;
    const ok = resolveAbilityRoll(s.id, 'Bob', c, {
      id: 'x',
      name: 'Lucky',
      type: 'ability',
      description: 'Reroll a 1.',
    });
    expect(ok).toBe(false);
    expect(listRollLog(s.id).length).toBe(before);
  });
});

describe('heal abilities apply healing', () => {
  const cureWounds = (over: Partial<SheetAbility> = {}): SheetAbility => ({
    id: 'cw',
    name: 'Cure Wounds',
    type: 'spell',
    level: 1,
    description: '',
    roll: { kind: 'heal', dice: '10d1', baseLevel: 1 }, // 10 + casting mod
    ...over,
  });

  it('a targeted heal SPELL restores the target HP (dice + casting mod)', () => {
    const s = createSession('Heal1');
    const map = createMap(s.id, { name: 'Ward' });
    setActiveMap(s.id, map.id);
    const cleric = createCharacter(s.id, {
      name: 'Cleric', className: 'Cleric', level: 1, stats: { WIS: 16 }, // +3 mod
    });
    const ally = createCharacter(s.id, { name: 'Ally', maxHp: 30 });
    applyDamage('pc', ally.id, 20); // 30 → 10
    const tok = createToken({ mapId: map.id, kind: 'pc', refId: ally.id, x: 0, y: 0 });

    expect(
      resolveAbilityRoll(s.id, 'Cleric', cleric, cureWounds(), 1, undefined, tok.id),
    ).toBe(true);
    // 10 (10d1) + 3 (WIS mod) = 13 healing → 10 + 13 = 23 HP.
    expect(getCharacter(ally.id)!.curHp).toBe(23);
    const last = listRollLog(s.id).at(-1)!;
    expect(last.total).toBe(13);
    expect(last.detail).toContain('→ Ally +13 HP');
    // The HP accounting note rides the entry — and a PC's change is visible
    // to players too (only ENEMY creature changes are stripped).
    expect(last.hpNote).toMatchObject({ kind: 'pc', text: 'Ally HP 10→23' });
    const playerLog = buildSnapshot(s.id, 'player')!.rollLog;
    expect(playerLog.at(-1)!.hpNote?.text).toBe('Ally HP 10→23');
  });

  it('a plain heal ABILITY uses its dice as written (no casting mod)', () => {
    const s = createSession('Heal2');
    const map = createMap(s.id, { name: 'Camp' });
    setActiveMap(s.id, map.id);
    const fighter = createCharacter(s.id, {
      name: 'Fighter', className: 'Fighter', level: 1, maxHp: 30, stats: { WIS: 16 },
    });
    applyDamage('pc', fighter.id, 20);
    const tok = createToken({ mapId: map.id, kind: 'pc', refId: fighter.id, x: 0, y: 0 });

    const secondWind = cureWounds({
      id: 'sw', name: 'Second Wind', type: 'ability', level: undefined,
      roll: { kind: 'heal', dice: '10d1' },
    });
    resolveAbilityRoll(s.id, 'Fighter', fighter, secondWind, undefined, undefined, tok.id);
    expect(getCharacter(fighter.id)!.curHp).toBe(20); // +10, no mod
  });

  it('an untargeted heal only logs (nothing applied)', () => {
    const s = createSession('Heal3');
    const cleric = createCharacter(s.id, {
      name: 'Cleric', className: 'Cleric', level: 1, maxHp: 30, stats: { WIS: 16 },
    });
    applyDamage('pc', cleric.id, 20);
    resolveAbilityRoll(s.id, 'Cleric', cleric, cureWounds());
    expect(getCharacter(cleric.id)!.curHp).toBe(10); // unchanged
    expect(listRollLog(s.id).at(-1)!.detail).toContain('healing');
  });
});
