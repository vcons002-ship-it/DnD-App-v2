import { describe, it, expect } from 'vitest';
import { deriveClassResources } from './data/classTables.js';
import { createSession, createCharacter, getCharacter, updateCharacter } from './sessions.js';
import { cantripsKnown, spellCapacity } from '../../shared/spellPrep.js';
import {
  spellAllowances,
  featSpellBonus,
  allowanceLabel,
} from '../../shared/spellLists.js';
import { parseSheetText, parseSheetJSON } from '../../shared/sheetIO.js';

describe('subclass-aware resources & slots', () => {
  it('third-caster subclasses (EK / Arcane Trickster) gain wizard-style slots', () => {
    const ek = deriveClassResources('Fighter', 7, {}, 'Eldritch Knight');
    expect(ek.spellSlots.L1.max).toBe(4);
    expect(ek.spellSlots.L2.max).toBe(2);
    expect(ek.spellSlots.L3).toBeUndefined();

    const at = deriveClassResources('Rogue', 3, {}, 'Arcane Trickster');
    expect(at.spellSlots.L1.max).toBe(2);

    // No subclass / non-caster subclass → no slots.
    expect(Object.keys(deriveClassResources('Fighter', 7).spellSlots)).toHaveLength(0);
    expect(
      Object.keys(deriveClassResources('Fighter', 7, {}, 'Champion').spellSlots),
    ).toHaveLength(0);
  });

  it('Battle Master gets Superiority Dice scaling 4/5/6', () => {
    expect(
      deriveClassResources('Fighter', 3, {}, 'Battle Master').resources[
        'Superiority Dice'
      ].max,
    ).toBe(4);
    expect(
      deriveClassResources('Fighter', 7, {}, 'Battle Master').resources[
        'Superiority Dice'
      ].max,
    ).toBe(5);
    expect(
      deriveClassResources('Fighter', 15, {}, 'Battle Master').resources[
        'Superiority Dice'
      ].max,
    ).toBe(6);
    // Base fighter resources still present.
    expect(
      deriveClassResources('Fighter', 3, {}, 'Battle Master').resources['Second Wind']
        .max,
    ).toBe(2);
  });

  it('setting a subclass on a character re-derives slots/resources', () => {
    const s = createSession('Sub');
    const c = createCharacter(s.id, { name: 'Eldra', className: 'Fighter', level: 7 });
    expect(Object.keys(c.spellSlots)).toHaveLength(0);
    updateCharacter(c.id, { subclass: 'Eldritch Knight' });
    const after = getCharacter(c.id)!;
    expect(after.subclass).toBe('Eldritch Knight');
    expect(after.spellSlots.L1.max).toBe(4);
    expect(after.spellSlots.L2.max).toBe(2);
  });

  it('spell limits honor third-caster subclasses', () => {
    expect(cantripsKnown('Fighter', 2, 'Eldritch Knight')).toBe(0);
    expect(cantripsKnown('Fighter', 3, 'Eldritch Knight')).toBe(2);
    expect(cantripsKnown('Fighter', 10, 'Eldritch Knight')).toBe(3);
    expect(cantripsKnown('Fighter', 10)).toBe(0);

    expect(spellCapacity('Rogue', 3, {}, 'Arcane Trickster')).toEqual({
      kind: 'known',
      max: 3,
    });
    expect(spellCapacity('Fighter', 7, {}, 'Eldritch Knight')).toEqual({
      kind: 'known',
      max: 5,
    });
    expect(spellCapacity('Fighter', 7, {})).toBeNull();
    // Casters keep their class capacity regardless of subclass.
    expect(spellCapacity('Wizard', 5, { INT: 18 }, 'School of Evocation')).toEqual({
      kind: 'prepared',
      max: 9,
    });
  });
});

describe('spell-list allowances (class + subclass + feats)', () => {
  it('caster class contributes its own list; martials none', () => {
    expect(spellAllowances('Wizard', '', [])).toEqual([
      { list: 'wizard', source: 'class' },
    ]);
    expect(spellAllowances('Fighter', '', [])).toEqual([]);
  });

  it('subclasses that cast off another list add it', () => {
    const ek = spellAllowances('Fighter', 'Eldritch Knight', []);
    expect(ek).toEqual([{ list: 'wizard', source: 'Eldritch Knight' }]);
    const ds = spellAllowances('Sorcerer', 'Divine Soul', []);
    expect(ds).toEqual([
      { list: 'sorcerer', source: 'class' },
      { list: 'cleric', source: 'Divine Soul' },
    ]);
  });

  it('Magic Initiate grants 2 cantrips + 1 spell from the named list', () => {
    const a = spellAllowances('Wizard', '', ['Magic Initiate (Druid)']);
    expect(a).toHaveLength(2);
    expect(a[1]).toEqual({
      list: 'druid',
      source: 'Magic Initiate (Druid)',
      cantrips: 2,
      leveled: 1,
    });
    // Alternate name shapes parse too, and a duplicate counts once.
    const b = spellAllowances('Fighter', '', [
      'Magic Initiate: Cleric',
      'magic initiate cleric',
    ]);
    expect(b).toHaveLength(1);
    expect(b[0].list).toBe('cleric');
    expect(featSpellBonus(a)).toEqual({ cantrips: 2, leveled: 1 });
  });

  it('Fey/Shadow Touched grant 2 always-prepared leveled spells', () => {
    const a = spellAllowances('Bard', '', ['Fey Touched', 'Shadow Touched']);
    expect(featSpellBonus(a)).toEqual({ cantrips: 0, leveled: 4 });
    expect(allowanceLabel(a[1])).toBe('Any list +2 spells (Fey Touched)');
  });
});

describe('subclass on the sheet I/O', () => {
  it('scrapes a subclass from text (label or known name)', () => {
    expect(parseSheetText('Borin, Fighter 7\nSubclass: Rune Knight').subclass).toBe(
      'Rune Knight',
    );
    expect(
      parseSheetText('Level 3 fighter, battle master, STR 16').subclass,
    ).toBe('Battle Master');
    expect(parseSheetText('Level 3 fighter, STR 16').subclass).toBeUndefined();
  });

  it('round-trips subclass through JSON', () => {
    const p = parseSheetJSON('{"className":"Rogue","subclass":"Arcane Trickster"}');
    expect(p?.subclass).toBe('Arcane Trickster');
  });
});
