import { describe, it, expect } from 'vitest';
import {
  createSession,
  createCharacter,
  getCharacter,
  listRollLog,
  setSheetAbility,
  removeSheetAbility,
  spendSpellSlot,
} from './sessions.js';
import { resolveAbilityRoll } from './combat.js';
import { searchSpells, getSpell } from './spells/srd.js';
import type { SheetAbility } from '../../shared/types.js';

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
});

describe('sheet abilities', () => {
  it('upserts and removes spells/abilities on a character', () => {
    const s = createSession('Spells');
    const c = createCharacter(s.id, { name: 'Mage', className: 'Wizard', level: 5 });
    expect(c.sheetAbilities).toHaveLength(0);

    const entry = { ...getSpell('Fireball')!, id: 'sp1' } as SheetAbility;
    setSheetAbility(c.id, entry);
    let got = getCharacter(c.id)!;
    expect(got.sheetAbilities).toHaveLength(1);
    expect(got.sheetAbilities[0].name).toBe('Fireball');

    // Upsert by id replaces rather than duplicates.
    setSheetAbility(c.id, { ...entry, name: 'Fireball (homebrew)' });
    got = getCharacter(c.id)!;
    expect(got.sheetAbilities).toHaveLength(1);
    expect(got.sheetAbilities[0].name).toBe('Fireball (homebrew)');

    removeSheetAbility(c.id, 'sp1');
    expect(getCharacter(c.id)!.sheetAbilities).toHaveLength(0);
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
