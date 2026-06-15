import { describe, it, expect } from 'vitest';
import { allSrd, getSrd, findBaseCreature } from './creatures/srd.js';

describe('SRD creature database — completeness', () => {
  const all = allSrd();

  it('has a healthy roster', () => {
    expect(all.length).toBeGreaterThanOrEqual(35);
  });

  it('every creature has a FULL stat block + attacks at a real CR', () => {
    for (const c of all) {
      const where = c.name;
      expect(c.level, `${where} CR`).toBeGreaterThan(0); // intended power level set
      expect(c.maxHp, `${where} HP`).toBeGreaterThan(0);
      expect(c.armorClass, `${where} AC`).toBeGreaterThan(0);
      expect(c.speed, `${where} speed`).toBeTruthy();
      for (const ab of ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'])
        expect(c.stats[ab], `${where} ${ab}`).toBeGreaterThan(0);
      expect(c.actions.length, `${where} actions`).toBeGreaterThan(0);
    }
  });
});

describe('SRD creature database — canonical power levels', () => {
  it('keeps a Goblin weak (CR 1/4, low stats), never inflated', () => {
    const g = getSrd('Goblin')!;
    expect(g.level).toBe(0.25);
    expect(g.maxHp).toBe(7);
    expect(g.armorClass).toBe(15);
    expect(g.stats.STR).toBe(8); // a goblin is not strong
    expect(g.actions.some((a) => /scimitar/i.test(a.name))).toBe(true);
  });

  it('scales canonically across the roster (kobold << ogre << troll)', () => {
    expect(getSrd('Kobold')!.level).toBe(0.125);
    expect(getSrd('Ogre')!.level).toBe(2);
    expect(getSrd('Troll')!.level).toBe(5);
    expect(getSrd('Kobold')!.maxHp).toBeLessThan(getSrd('Ogre')!.maxHp);
    expect(getSrd('Ogre')!.maxHp).toBeLessThan(getSrd('Troll')!.maxHp);
  });
});

describe('findBaseCreature (variant grounding)', () => {
  it('maps a themed variant to its SRD base', () => {
    expect(findBaseCreature('Stone Goblin')?.name).toBe('Goblin');
    expect(findBaseCreature('Blood Goblin')?.name).toBe('Goblin');
    expect(findBaseCreature('Ancient Frost Troll')?.name).toBe('Troll');
  });

  it('prefers the LONGEST base name (Dire Wolf over Wolf)', () => {
    expect(findBaseCreature('Frost Dire Wolf')?.name).toBe('Dire Wolf');
  });

  it('returns null for an exact match (that is not a variant) or no match', () => {
    expect(findBaseCreature('Goblin')).toBeNull();
    expect(findBaseCreature('Beholder')).toBeNull();
  });
});
