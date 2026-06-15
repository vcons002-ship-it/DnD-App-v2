import { describe, it, expect } from 'vitest';
import { groundAbilities, groundWeapons } from './creatures/fill.js';
import type { SheetAbility, Weapon } from '../../shared/types.js';

const spell = (name: string): SheetAbility => ({
  id: `id-${name}`,
  name,
  type: 'spell',
  description: '',
});

describe('groundAbilities (AI fill grounding)', () => {
  it('replaces a generated spell with the canonical local-DB version (rollable)', () => {
    const [fb] = groundAbilities([spell('Fire Bolt')]);
    expect(fb.roll?.kind).toBe('attack'); // came from the DB, not the empty AI stub
    expect(fb.source).toBe('srd');
    expect(fb.id).toBe('id-Fire Bolt'); // keeps the generated id (one entry)
  });

  it('keeps a non-DB (homebrew) ability as the AI produced it', () => {
    const custom = { ...spell('Zorblax Bolt'), description: 'homebrew' };
    const [out] = groundAbilities([custom]);
    expect(out).toEqual(custom);
  });

  it('drops anything already on the sheet — no duplicate versions', () => {
    const out = groundAbilities([spell('Fire Bolt'), spell('Cure Wounds')], [{ name: 'fire bolt' }]);
    expect(out.map((a) => a.name)).toEqual(['Cure Wounds']);
  });

  it('de-duplicates within the generated list itself', () => {
    expect(groundAbilities([spell('Bless'), spell('bless')]).length).toBe(1);
  });
});

describe('groundWeapons (AI fill grounding)', () => {
  it('grounds a generated weapon to the book: canonical dice + mastery tags', () => {
    const [w] = groundWeapons([{ name: 'Longsword', kind: 'melee' } as Weapon]);
    expect(w.diceOnly).toBe(true);
    expect(w.tags).toContain('longsword'); // tags drive weapon-mastery triggering
    expect(w.damage).toBeTruthy();
  });

  it('skips a weapon the character already has', () => {
    expect(groundWeapons([{ name: 'Longsword', kind: 'melee' } as Weapon], [{ name: 'Longsword' }])).toEqual([]);
  });
});
