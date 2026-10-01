import { describe, expect, it } from 'vitest';
import {
  CORE_CLASSES_2024,
  alwaysPreparedSpells2024,
  classProgression2024,
  hpIncrease2024,
  permanentStats2024,
  resolveProgressionClass,
  subclassChoices2024,
  subclassFeatures2024,
} from '../../shared/characterProgression.js';
import { spellCapacity } from '../../shared/spellPrep.js';

const progression = (name: string, level: number, subclass = '', stats: Record<string, number> = {}) => {
  const row = classProgression2024(name, level, subclass, stats);
  expect(row).not.toBeNull();
  return row!;
};

describe('2024 guided class progression', () => {
  it('recognizes exactly the twelve core classes and declines ambiguous or homebrew labels', () => {
    expect(CORE_CLASSES_2024).toHaveLength(12);
    expect(resolveProgressionClass('  FiGhTeR  ')).toBe('fighter');
    for (const name of ['Fighter / Wizard', 'Warlock 4 / Bard 1', 'Fighter (Eldritch Knight)', 'Fighter 5', 'Artificer', 'Blood Hunter', '']) {
      expect(resolveProgressionClass(name)).toBeNull();
      expect(classProgression2024(name, 5)).toBeNull();
    }
    for (const level of [0, 21, 2.5, NaN, Infinity]) expect(classProgression2024('Fighter', level)).toBeNull();
  });

  it('offers valid progression and the correct hit die for every level of each core class', () => {
    const hitDice = { barbarian: 12, bard: 8, cleric: 8, druid: 8, fighter: 10, monk: 8, paladin: 10, ranger: 10, rogue: 8, sorcerer: 6, warlock: 8, wizard: 6 };
    for (const className of CORE_CLASSES_2024) {
      for (let level = 1; level <= 20; level += 1) {
        const row = progression(className, level);
        expect(row.hitDie).toBe(hitDice[className]);
        expect(row.fixedHp).toBe(hitDice[className] / 2 + 1);
        expect(row.subclassDue).toBe(level === 3);
        expect(row.proficiencyBonus).toBe([2, 3, 4, 5, 6][Math.floor((level - 1) / 4)]);
      }
    }
  });

  it('distinguishes ASI levels, extra martial choices and level-19 Epic Boons', () => {
    for (const name of CORE_CLASSES_2024) {
      for (const level of [4, 8, 12, 16]) expect(progression(name, level).featChoice).toBe('asiOrFeat');
      expect(progression(name, 19)).toMatchObject({ featChoice: 'epicBoonOrFeat', abilityScoreCap: 20, epicAbilityScoreCap: 30 });
      expect(progression(name, 20).featChoice).toBeNull();
    }
    expect(progression('Fighter', 6).featChoice).toBe('asiOrFeat');
    expect(progression('Fighter', 14).featChoice).toBe('asiOrFeat');
    expect(progression('Rogue', 10).featChoice).toBe('asiOrFeat');
    expect(progression('Wizard', 6).featChoice).toBeNull();
    expect(progression('Wizard', 14).featChoice).toBeNull();
    expect(progression('Fighter', 10).featChoice).toBeNull();
  });

  it('uses fixed 2024 prepared allowances while leaving legacy spell counters untouched', () => {
    expect(progression('Wizard', 4, '', { INT: 10 }).preparedSpells).toBe(7);
    expect(progression('Wizard', 4, '', { INT: 20 }).preparedSpells).toBe(7);
    expect(progression('Sorcerer', 2).preparedSpells).toBe(4);
    expect(progression('Sorcerer', 3).preparedSpells).toBe(6);
    expect(progression('Ranger', 1)).toMatchObject({ preparedSpells: 2, spellSlots: { L1: 2 } });
    expect(progression('Paladin', 1)).toMatchObject({ preparedSpells: 2, spellSlots: { L1: 2 } });
    expect(progression('Wizard', 16).preparedSpells).toBe(21);
    expect(progression('Wizard', 20).preparedSpells).toBe(25);
    expect(progression('Cleric', 20).preparedSpells).toBe(22);
    expect(progression('Druid', 14).preparedSpells).toBe(17);
    expect(progression('Bard', 16).preparedSpells).toBe(18);
    expect(progression('Warlock', 20).preparedSpells).toBe(15);
    // Existing manual sheets deliberately retain the old advisory helper until
    // they enter the explicit 2024 workflow.
    expect(spellCapacity('Wizard', 4, { INT: 10 })).toEqual({ kind: 'prepared', max: 4 });
  });

  it('tracks cantrips, spellbook additions and higher-level spell access', () => {
    expect(progression('Wizard', 1)).toMatchObject({ cantrips: 3, spellbookAdditions: 6 });
    expect(progression('Wizard', 2)).toMatchObject({ cantrips: 3, spellbookAdditions: 2 });
    expect(progression('Wizard', 4).cantrips).toBe(4);
    expect(progression('Wizard', 10).cantrips).toBe(5);
    expect(progression('Sorcerer', 10).cantrips).toBe(6);
    expect(progression('Cleric', 10).cantrips).toBe(5);
    expect(progression('Bard', 10).cantrips).toBe(4);
    expect(progression('Druid', 10).cantrips).toBe(4);
    expect(progression('Warlock', 10).cantrips).toBe(4);
    expect(progression('Wizard', 5)).toMatchObject({ maxSpellLevel: 3, spellSlots: { L1: 4, L2: 3, L3: 2 } });
    expect(progression('Wizard', 17).maxSpellLevel).toBe(9);
    expect(progression('Paladin', 17).maxSpellLevel).toBe(5);
    expect(progression('Fighter', 5)).toMatchObject({ cantrips: 0, preparedSpells: 0, spellSlots: {}, maxSpellLevel: 0 });
  });

  it('keeps Pact Magic at its own slot level and Mystic Arcanum separate', () => {
    expect(progression('Warlock', 4)).toMatchObject({ spellSlots: { L2: 2 }, maxSpellLevel: 2 });
    expect(progression('Warlock', 5)).toMatchObject({ spellSlots: { L3: 2 }, maxSpellLevel: 3 });
    expect(progression('Warlock', 11)).toMatchObject({ spellSlots: { L5: 3 }, maxSpellLevel: 5 });
    expect(progression('Warlock', 17)).toMatchObject({ spellSlots: { L5: 4 }, maxSpellLevel: 5 });
    expect(progression('Warlock', 11).choiceNotes.some((note) => note.includes('level 6 Mystic Arcanum'))).toBe(true);
  });

  it('uses the 2024 third-caster table with Arcane Trickster’s additional Mage Hand', () => {
    expect(progression('Fighter', 2, 'Eldritch Knight')).toMatchObject({ cantrips: 0, preparedSpells: 0, spellSlots: {} });
    expect(progression('Fighter', 3, 'Eldritch Knight')).toMatchObject({ cantrips: 2, preparedSpells: 3, spellSlots: { L1: 2 } });
    expect(progression('Rogue', 3, 'Arcane Trickster')).toMatchObject({ cantrips: 3, preparedSpells: 3, spellSlots: { L1: 2 } });
    expect(progression('Fighter', 4, 'Eldritch Knight').spellSlots).toEqual({ L1: 3 });
    expect(progression('Fighter', 7, 'Eldritch Knight')).toMatchObject({ preparedSpells: 5, spellSlots: { L1: 4, L2: 2 } });
    expect(progression('Fighter', 11, 'Eldritch Knight').preparedSpells).toBe(8);
    expect(progression('Rogue', 10, 'Arcane Trickster').cantrips).toBe(4);
    expect(progression('Fighter', 10, 'Eldritch Knight').cantrips).toBe(3);
    expect(progression('Rogue', 19, 'Arcane Trickster').spellSlots).toEqual({ L1: 4, L2: 3, L3: 3, L4: 1 });
    // A subclass name alone must never turn the wrong class into a caster.
    expect(progression('Barbarian', 7, 'Eldritch Knight').spellSlots).toEqual({});
  });

  it('names new features and supported subclass features at their 2024 levels', () => {
    expect(progression('Fighter', 5).features).toEqual(['Extra Attack', 'Tactical Shift']);
    expect(progression('Fighter', 10, 'Champion').features).toEqual(['Heroic Warrior']);
    expect(progression('Rogue', 7).features).toEqual(['Evasion', 'Reliable Talent']);
    expect(subclassFeatures2024('Wizard', 'Evoker', 3)).toEqual(['Evocation Savant', 'Potent Cantrip']);
    expect(subclassFeatures2024('Wizard', 'Evoker', 6)).toEqual(['Sculpt Spells']);
    expect(subclassFeatures2024('Fighter', 'Battle Master', 18)).toEqual(['Ultimate Combat Superiority']);
    expect(subclassFeatures2024('Fighter', 'Champion', 4)).toEqual([]);
    expect(subclassFeatures2024('Wizard', 'My Homebrew School', 3)).toEqual([]);
    expect(progression('Wizard', 3, 'My Homebrew School').choiceNotes.some((note) => note.includes('rulebook'))).toBe(true);
    expect(progression('Wizard', 5, 'My Homebrew School').features).toEqual(['Memorize Spell']);
  });

  it('offers the 48 PHB subclasses without exposing or mutating its internal data', () => {
    expect(CORE_CLASSES_2024.flatMap(subclassChoices2024)).toHaveLength(48);
    expect(subclassChoices2024('Fighter')).toContain('Eldritch Knight');
    expect(subclassChoices2024('Monk')).toContain('Warrior of the Elements');
    expect(subclassChoices2024('Artificer')).toEqual([]);
    const choices = subclassChoices2024('Fighter');
    choices.splice(0);
    expect(subclassChoices2024('Fighter')).toHaveLength(4);
    const row = progression('Fighter', 5);
    row.features.splice(0);
    expect(progression('Fighter', 5).features).toContain('Extra Attack');
  });

  it('supplies class resource maxima and Battle Master die changes without creating duplicate Focus pools', () => {
    expect(progression('Barbarian', 6).resourceMaxima).toEqual({ Rage: 4 });
    expect(progression('Fighter', 4).resourceMaxima).toEqual({ 'Second Wind': 3, 'Action Surge': 1 });
    expect(progression('Fighter', 17).resourceMaxima).toMatchObject({ 'Second Wind': 4, 'Action Surge': 2, Indomitable: 3 });
    expect(progression('Fighter', 7, 'Battle Master').resourceMaxima).toMatchObject({ 'Superiority Dice': 5, 'Know Your Enemy': 1 });
    expect(progression('Fighter', 15, 'Battle Master').resourceMaxima['Superiority Dice']).toBe(6);
    expect(progression('Fighter', 9, 'Battle Master').superiorityDie).toBe('d8');
    expect(progression('Fighter', 10, 'Battle Master').superiorityDie).toBe('d10');
    expect(progression('Fighter', 18, 'Battle Master').superiorityDie).toBe('d12');
    expect(progression('Monk', 5).resourceMaxima).toEqual({ Ki: 5 });
    expect(progression('Paladin', 11).resourceMaxima).toEqual({ 'Lay on Hands': 55, 'Divine Smite (free)': 1, 'Channel Divinity': 3 });
    expect(progression('Bard', 5, '', { CHA: 18 }).resourceMaxima['Bardic Inspiration']).toBe(4);
    expect(progression('Druid', 17).resourceMaxima['Wild Shape']).toBe(4);
    expect(progression('Cleric', 18).resourceMaxima['Channel Divinity']).toBe(4);
    expect(progression('Ranger', 17).resourceMaxima['Favored Enemy']).toBe(6);
  });

  it('marks automatic capstone boosts separately from ordinary feat choices', () => {
    expect(progression('Barbarian', 20).capstoneBoosts).toEqual([
      { ability: 'STR', value: 4, max: 25 }, { ability: 'CON', value: 4, max: 25 },
    ]);
    expect(progression('Monk', 20).capstoneBoosts).toEqual([
      { ability: 'DEX', value: 4, max: 25 }, { ability: 'WIS', value: 4, max: 25 },
    ]);
    expect(progression('Fighter', 20).capstoneBoosts).toEqual([]);
    expect(progression('Barbarian', 19).capstoneBoosts).toEqual([]);
  });

  it('gains subclass resources at their own levels and scales ability-based uses', () => {
    expect(progression('Monk', 5, 'Warrior of the Open Hand', { WIS: 18 }).resourceMaxima['Wholeness of Body']).toBeUndefined();
    expect(progression('Monk', 6, 'Warrior of the Open Hand', { WIS: 18 }).resourceMaxima).toMatchObject({ Ki: 6, 'Wholeness of Body': 4 });
    expect(progression('Monk', 8, 'Warrior of the Open Hand', { WIS: 20 }).resourceMaxima['Wholeness of Body']).toBe(5);
    expect(progression('Monk', 6, 'Warrior of the Open Hand', { WIS: 8 }).resourceMaxima['Wholeness of Body']).toBe(1);
    expect(progression('Warlock', 5, 'Fiend Patron', { CHA: 18 }).resourceMaxima["Dark One's Own Luck"]).toBeUndefined();
    expect(progression('Warlock', 6, 'Fiend Patron', { CHA: 18 }).resourceMaxima["Dark One's Own Luck"]).toBe(4);
    expect(progression('Warlock', 8, 'Fiend Patron', { CHA: 8 }).resourceMaxima["Dark One's Own Luck"]).toBe(1);
    expect(progression('Warlock', 14, 'Fiend Patron').resourceMaxima['Hurl Through Hell']).toBe(1);
    expect(progression('Sorcerer', 13, 'Draconic Sorcery').resourceMaxima['Dragon Wings']).toBeUndefined();
    expect(progression('Sorcerer', 14, 'Draconic Sorcery').resourceMaxima['Dragon Wings']).toBe(1);
    expect(progression('Sorcerer', 18, 'Draconic Sorcery').resourceMaxima['Dragon Companion']).toBe(1);
    expect(progression('Barbarian', 14, 'Path of the Berserker').resourceMaxima['Intimidating Presence']).toBe(1);
    expect(progression('Paladin', 19, 'Oath of Devotion').resourceMaxima['Holy Nimbus']).toBeUndefined();
    expect(progression('Paladin', 20, 'Oath of Devotion').resourceMaxima['Holy Nimbus']).toBe(1);
    expect(progression('Monk', 20, 'Fiend Patron').resourceMaxima["Dark One's Own Luck"]).toBeUndefined();
    expect(progression('Monk', 20, 'Custom Open Hand').resourceMaxima['Wholeness of Body']).toBeUndefined();
  });

  it('keeps independent free-casting and recovery pools separate from ordinary spell slots', () => {
    const land = progression('Druid', 6, 'Circle of the Land');
    expect(land.resourceMaxima).toMatchObject({ 'Natural Recovery (free spell)': 1, 'Natural Recovery (slots)': 1 });
    expect(progression('Druid', 5, 'Circle of the Land').resourceMaxima['Natural Recovery (slots)']).toBeUndefined();
    expect(land.spellSlots).toEqual(progression('Druid', 6).spellSlots);
    expect(progression('Warlock', 10).resourceMaxima['Mystic Arcanum (level 6)']).toBeUndefined();
    for (const [atLevel, spellLevel] of [[11, 6], [13, 7], [15, 8], [17, 9]]) {
      expect(progression('Warlock', atLevel - 1).resourceMaxima[`Mystic Arcanum (level ${spellLevel})`]).toBeUndefined();
      const row = progression('Warlock', atLevel);
      expect(row.resourceMaxima[`Mystic Arcanum (level ${spellLevel})`]).toBe(1);
      expect(row.spellSlots[`L${spellLevel}`]).toBeUndefined();
      expect(row.maxSpellLevel).toBe(5);
    }
    expect(progression('Warlock', 20).resourceMaxima).toMatchObject({
      'Mystic Arcanum (level 6)': 1, 'Mystic Arcanum (level 7)': 1,
      'Mystic Arcanum (level 8)': 1, 'Mystic Arcanum (level 9)': 1,
    });
  });

  it('grants fixed always-prepared spells at the verified class and subclass levels', () => {
    expect(alwaysPreparedSpells2024('Cleric', 'Life Domain', 3)).toEqual(['Aid', 'Bless', 'Cure Wounds', 'Lesser Restoration']);
    expect(alwaysPreparedSpells2024('Cleric', 'Life Domain', 7)).toEqual(['Aura of Life', 'Death Ward']);
    expect(alwaysPreparedSpells2024('Paladin', 'Oath of Devotion', 5)).toEqual(['Find Steed', 'Aid', 'Zone of Truth']);
    expect(alwaysPreparedSpells2024('Paladin', 'Oath of Devotion', 9)).toEqual(['Beacon of Hope', 'Dispel Magic']);
    expect(alwaysPreparedSpells2024('Paladin', 'Oath of Devotion', 7)).toEqual([]);
    expect(alwaysPreparedSpells2024('Paladin', 'Oath of Devotion', 17)).toEqual(['Commune', 'Flame Strike']);
    expect(alwaysPreparedSpells2024('Sorcerer', 'Draconic Sorcery', 3)).toEqual(['Alter Self', 'Chromatic Orb', 'Command', "Dragon's Breath"]);
    expect(alwaysPreparedSpells2024('Sorcerer', 'Draconic Sorcery', 9)).toEqual(['Legend Lore', 'Summon Dragon']);
    expect(alwaysPreparedSpells2024('Warlock', 'Fiend Patron', 9)).toEqual(['Contact Other Plane', 'Geas', 'Insect Plague']);
    expect(alwaysPreparedSpells2024('Ranger', 'Hunter', 1)).toEqual(["Hunter's Mark"]);
    expect(alwaysPreparedSpells2024('Paladin', '', 2)).toEqual(['Divine Smite']);
    expect(alwaysPreparedSpells2024('Druid', '', 1)).toEqual(['Speak with Animals']);
    expect(alwaysPreparedSpells2024('Bard', '', 20)).toEqual(['Power Word Heal', 'Power Word Kill']);
    const copy = alwaysPreparedSpells2024('Cleric', 'Life Domain', 3);
    copy.splice(0);
    expect(alwaysPreparedSpells2024('Cleric', 'Life Domain', 3)).toHaveLength(4);
  });

  it('does not invent fixed spells for a spell choice, special casting feature or unreviewed subclass', () => {
    expect(alwaysPreparedSpells2024('Druid', 'Circle of the Land', 3)).toEqual([]);
    expect(alwaysPreparedSpells2024('Druid', '', 2)).toEqual([]); // Wild Companion is special casting, not always prepared.
    expect(alwaysPreparedSpells2024('Wizard', 'Evoker', 3)).toEqual([]); // Savant adds book spells, not prepared spells.
    expect(alwaysPreparedSpells2024('Wizard', '', 18)).toEqual([]); // Mastery requires a choice.
    expect(alwaysPreparedSpells2024('Warlock', '', 11)).toEqual([]); // Arcanum requires a choice.
    expect(alwaysPreparedSpells2024('Fighter', 'Life Domain', 3)).toEqual([]);
    expect(alwaysPreparedSpells2024('Cleric / Druid', 'Life Domain', 3)).toEqual([]);
    expect(alwaysPreparedSpells2024('Cleric', 'Custom Life', 3)).toEqual([]);
    expect(progression('Druid', 5, 'Circle of the Land').choiceNotes.some(n => n.includes('arid, polar'))).toBe(true);
    expect(progression('Wizard', 18).choiceNotes.some(n => n.includes('Spell Mastery'))).toBe(true);
    expect(progression('Bard', 6, 'College of Lore').choiceNotes.some(n => n.includes('Magical Discoveries'))).toBe(true);
  });
});

describe('level-up HP from the existing character baseline', () => {
  it('adds the new hit die and CON with the minimum of one', () => {
    expect(hpIncrease2024({ oldLevel: 4, hitDieFace: 6, oldConMod: 2, newConMod: 2 })).toBe(8);
    expect(hpIncrease2024({ oldLevel: 4, hitDieFace: 1, oldConMod: -3, newConMod: -3 })).toBe(1);
  });

  it('applies a changed Constitution modifier to old levels once, including the level-8 example', () => {
    // Level 7 -> 8, CON 17 -> 18: 6+4 for level 8, plus seven old levels.
    expect(hpIncrease2024({ oldLevel: 7, hitDieFace: 6, oldConMod: 3, newConMod: 4 })).toBe(17);
    // The minimum-one corner must not count the new CON change twice.
    expect(hpIncrease2024({ oldLevel: 3, hitDieFace: 1, oldConMod: -3, newConMod: -2 })).toBe(4);
  });

  it('adds Tough retroactively only when first acquired and per-level thereafter', () => {
    expect(hpIncrease2024({ oldLevel: 3, hitDieFace: 6, oldConMod: 2, newConMod: 2, newTough: true })).toBe(16);
    expect(hpIncrease2024({ oldLevel: 4, hitDieFace: 6, oldConMod: 2, newConMod: 2, existingTough: true })).toBe(10);
    expect(hpIncrease2024({ oldLevel: 4, hitDieFace: 6, oldConMod: 2, newConMod: 2, existingTough: true, newTough: true })).toBe(10);
  });

  it('uses permanent CON and ASIs rather than equipped-item score setters', () => {
    expect(permanentStats2024({
      stats: { CON: 15, STR: 17 },
      modifiers: [{ id: 'asi', source: 'ASI level 4', target: { kind: 'ability', ability: 'CON' }, value: 1 }],
      items: [{ id: 'amulet', name: 'Amulet of Health', qty: 1, note: '', equipped: true,
        modifiers: [{ id: 'amulet-con', source: 'Amulet of Health', target: { kind: 'ability', ability: 'CON' }, value: 19, set: true }],
      }],
    })).toEqual({ CON: 16, STR: 17 });
  });

  it('rejects invalid level-up and die inputs', () => {
    for (const oldLevel of [0, 20, 4.5]) expect(() => hpIncrease2024({ oldLevel, hitDieFace: 6, oldConMod: 2, newConMod: 2 })).toThrow(RangeError);
    expect(() => hpIncrease2024({ oldLevel: 4, hitDieFace: 0, oldConMod: 2, newConMod: 2 })).toThrow(RangeError);
    expect(() => hpIncrease2024({ oldLevel: 4, hitDieFace: 13, oldConMod: 2, newConMod: 2 })).toThrow(RangeError);
    expect(() => hpIncrease2024({ oldLevel: 4, hitDieFace: 6, oldConMod: NaN, newConMod: 2 })).toThrow(RangeError);
  });
});
