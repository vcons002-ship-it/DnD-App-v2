import { describe, it, expect } from 'vitest';
import {
  RACE_TRAITS,
  searchRaceTraits,
  getRaceTrait,
  traitsForRace,
} from './races/srd.js';
import { getFeature } from './features/srd.js';

/**
 * Racial traits are a SEPARATE source from feats — the case that prompted them
 * is a Half-Orc's Savage Attacks, which is a different rule from the Savage
 * Attacker feat and was being found filed under "Feat".
 */
describe('racial traits', () => {
  it('every entry is labelled with its race and edition', () => {
    expect(RACE_TRAITS.length).toBeGreaterThan(15);
    for (const t of RACE_TRAITS) {
      expect(t.name, JSON.stringify(t)).toBeTruthy();
      expect(t.description.length, t.name).toBeGreaterThan(20);
      expect(t.school, t.name).toBe(`${t.race} trait (${t.edition})`);
      expect(['2014', '2024'], t.name).toContain(t.edition);
      // Searchable by race name and by the generic "racial" words.
      expect(t.tags, t.name).toContain('race');
      expect(t.tags, t.name).toContain(t.race.toLowerCase());
    }
  });

  it('covers both editions, including the species 2024 removed', () => {
    const races = new Set(RACE_TRAITS.map((t) => t.race));
    expect(races).toContain('Orc'); // 2024 promoted it to a full species
    expect(races).toContain('Half-Orc'); // 2014 only
    expect(races).toContain('Half-Elf'); // 2014 only
    expect(RACE_TRAITS.some((t) => t.edition === '2024')).toBe(true);
    expect(RACE_TRAITS.some((t) => t.edition === '2014')).toBe(true);
    // The 2024 Orc has no Savage trait — that belongs to the 2014 Half-Orc.
    const orc = traitsForRace('Orc').map((t) => t.name);
    expect(orc).toContain('Relentless Endurance');
    expect(orc.some((n) => /savage/i.test(n))).toBe(false);
  });

  it("Half-Orc's Savage Attacks adds a crit die — NOT the feat's reroll", () => {
    const trait = getRaceTrait('Savage Attacks');
    expect(trait).toBeTruthy();
    expect(trait!.race).toBe('Half-Orc');
    expect(trait!.type).toBe('stance');
    expect(trait!.stance?.extraCritDie).toBe(true);
    expect(trait!.stance?.rerollDamageDice).toBeUndefined();
    expect(trait!.stance?.appliesTo).toBe('melee'); // RAW: melee weapons only

    // …and the FEAT is still its own, different thing.
    const feat = getFeature('Savage Attacker');
    expect(feat!.school).toBe('Feat');
    expect(feat!.stance?.rerollDamageDice).toBe(true);
    expect(feat!.stance?.extraCritDie).toBeUndefined();
  });

  it('searching a race name lists that race first', () => {
    const hits = searchRaceTraits('half-orc');
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].race).toBe('Half-Orc');
    expect(hits.map((t) => t.name)).toContain('Savage Attacks');
  });

  it('finds traits by tag as well as name', () => {
    expect(searchRaceTraits('darkvision').length).toBeGreaterThan(0);
    expect(searchRaceTraits('crit').map((t) => t.name)).toContain('Savage Attacks');
    expect(getRaceTrait('nope')).toBeNull();
    expect(traitsForRace('')).toEqual([]);
  });
});
