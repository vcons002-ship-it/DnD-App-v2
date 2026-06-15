import { describe, it, expect } from 'vitest';
import {
  parseSheet,
  parseSheetText,
  parseSheetJSON,
  exportSheetJSON,
} from '../../shared/sheetIO.js';
import { createSession, createCharacter, getCharacter } from './sessions.js';

describe('sheet text import', () => {
  it('scrapes core fields with label variants and x/y HP', () => {
    const text = `
      Aria Stormwind — Half-Elf Wizard 5
      Hit Points 22/30
      Armor Class 16
      Speed 30 ft.
      Strength 8   Dexterity 14   Constitution 13
      Intelligence 18  Wisdom 12  Charisma 10
      ● Arcana   ● Investigation   Stealth +2
    `;
    const p = parseSheetText(text);
    expect(p.race).toBe('Half-Elf');
    expect(p.className).toBe('Wizard');
    expect(p.level).toBe(5);
    expect(p.maxHp).toBe(30);
    expect(p.curHp).toBe(22);
    expect(p.armorClass).toBe(16);
    expect(p.speed).toBe('30 ft.');
    expect(p.stats).toMatchObject({ STR: 8, DEX: 14, INT: 18, CHA: 10 });
    // Only the marked (●) skills are imported as proficient.
    expect(p.proficientSkills).toEqual(
      expect.arrayContaining(['Arcana', 'Investigation']),
    );
    expect(p.proficientSkills).not.toContain('Stealth');
  });

  it('reads short abbreviations too (HP/AC/STR)', () => {
    const p = parseSheetText('HP 12  AC 13  STR 16  level 3');
    expect(p.maxHp).toBe(12);
    expect(p.armorClass).toBe(13);
    expect(p.stats!.STR).toBe(16);
    expect(p.level).toBe(3);
  });

  it('returns nothing for junk', () => {
    expect(Object.keys(parseSheetText('the quick brown fox'))).toHaveLength(0);
  });

  it('infers skill proficiency from a listed bonus (no marker needed)', () => {
    // Level 5 (prof +3), DEX 16 (+3). Stealth +6 = mod+prof → proficient;
    // Acrobatics +3 = mod only → not; Stealth +9 (expertise) also proficient.
    const p = parseSheetText(`
      Rookwood — Halfling Rogue 5
      Dexterity 16  Wisdom 12
      Acrobatics +3   Stealth +6   Perception +1
    `);
    expect(p.proficientSkills).toContain('Stealth');
    expect(p.proficientSkills).not.toContain('Acrobatics');
    expect(p.proficientSkills).not.toContain('Perception');
  });

  it('reads saving-throw proficiencies (marker and inferred)', () => {
    // Level 5 (prof +3), CON 14 (+2), WIS 12 (+1).
    const p = parseSheetText(`
      Bruenor — Dwarf Fighter 5
      Constitution 14  Wisdom 12  Strength 16
      Saving Throws: Strength Save +6, Constitution +5, Wisdom +1
    `);
    expect(p.saveProficiencies).toEqual(expect.arrayContaining(['STR', 'CON']));
    expect(p.saveProficiencies).not.toContain('WIS'); // +1 = mod only
  });

  it('pulls in feats and a Features & Traits block as trait entries', () => {
    const p = parseSheetText(`
      Kael — Human Fighter 6
      Feats: Sentinel, Lucky

      Features & Traits
      Great Weapon Master
      You can take a -5 penalty to hit for +10 damage with a heavy weapon.
      Second Wind
      Regain 1d10 + level hit points as a bonus action.

      Equipment
      Greatsword, Chain Mail
    `);
    const names = (p.abilities ?? []).map((a) => a.name.toLowerCase());
    expect(names).toContain('sentinel');
    expect(names).toContain('lucky');
    expect(names).toContain('great weapon master');
    expect(names).toContain('second wind');
    // The block's descriptions are captured under their names…
    const gwm = (p.abilities ?? []).find((a) => /great weapon master/i.test(a.name));
    expect(gwm?.description).toMatch(/-5 penalty|\+10 damage/i);
    // …and the next section (Equipment) is NOT swept into a trait.
    expect(names).not.toContain('greatsword, chain mail');
    expect(names).not.toContain('equipment');
  });
});

describe('sheet JSON round-trip', () => {
  it('exports then re-imports identically', () => {
    const s = createSession('IO');
    const c = createCharacter(s.id, {
      name: 'Mira',
      race: 'Tiefling',
      className: 'Sorcerer',
      level: 4,
      maxHp: 27,
      armorClass: 13,
      stats: { CHA: 16, DEX: 14 },
      proficientSkills: ['Deception', 'Persuasion'],
    });
    const json = exportSheetJSON(getCharacter(c.id)!);
    const p = parseSheetJSON(json)!;
    expect(p.name).toBe('Mira');
    expect(p.className).toBe('Sorcerer');
    expect(p.level).toBe(4);
    expect(p.stats).toMatchObject({ CHA: 16, DEX: 14 });
    expect(p.proficientSkills).toEqual(['Deception', 'Persuasion']);
    // Sorcerer L4 auto-slots survive the round-trip.
    expect(p.spellSlots!.L1.max).toBe(4);
  });

  it('auto-detects JSON vs text via parseSheet', () => {
    expect(parseSheet('{"level":7,"armorClass":18}')).toMatchObject({
      level: 7,
      armorClass: 18,
    });
    expect(parseSheet('AC 11')).toMatchObject({ armorClass: 11 });
    expect(parseSheetJSON('not json')).toBeNull();
  });
});
