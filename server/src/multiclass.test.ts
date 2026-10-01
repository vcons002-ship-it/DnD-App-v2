import { describe, expect, it } from 'vitest';
import { CORE_CLASSES_2024, classProgression2024, type CoreClass } from '../../shared/characterProgression.js';
import { slotReference2024 } from '../../shared/resourceDisplay.js';
import {
  allocateHitDiceUsed, checkMulticlassPrerequisites, classEntryRequirements,
  classLevelFor, mergeProgressionCounters, multiclassCasterLevel, multiclassHitDice,
  multiclassProficiencies2024, multiclassProficiencyBonus, multiclassResourceMaxima,
  multiclassSpellSlots2024, normalizeClassRoster, resolveClassRoster,
  resourceNameForClass, spellcastingAbilityForClass, totalClassLevel, type ClassRosterEntry,
} from '../../shared/multiclass.js';

// Expected facts below come from the official 2024 Free Rules, not the helper:
// https://www.dndbeyond.com/sources/dnd/br-2024/creating-a-character#Multiclassing
// https://www.dndbeyond.com/sources/dnd/br-2024/character-classes
const row = (className: CoreClass, level: number, subclass?: string): ClassRosterEntry => ({ className, level, ...(subclass ? { subclass } : {}) });
const scores = { STR: 13, DEX: 13, CON: 13, INT: 13, WIS: 13, CHA: 13 };

describe('explicit multiclass roster', () => {
  it('uses exact legacy core-class fallback and never guesses a free-text split', () => {
    expect(resolveClassRoster({ className: ' Fighter ', level: 5, subclass: 'Champion' })).toEqual([row('fighter', 5, 'Champion')]);
    for (const className of ['Fighter / Wizard', 'Fighter 3 Wizard 2', 'Blood Hunter', '']) expect(resolveClassRoster({ className, level: 5 })).toBeNull();
    expect(resolveClassRoster({ level: 5 })).toBeNull();
    expect(resolveClassRoster({ className: 'fighter' })).toBeNull();
  });
  it('validates imported levels, uniqueness, core names, total and subclass types', () => {
    for (const value of [null, {}, [], [row('fighter', 0)], [row('fighter', 1.5)], [row('fighter', 21)], [row('fighter', 2), row('fighter', 2)], [row('fighter', 11), row('wizard', 10)], [{ className: 'artificer', level: 1 }], [{ className: 'wizard', level: 1, subclass: 5 }]]) expect(normalizeClassRoster(value)).toBeNull();
    expect(resolveClassRoster({ className: 'fighter', level: 5, leveling: { classes: [row('fighter', 3), row('wizard', 1)] } })).toBeNull();
    expect(resolveClassRoster({ className: 'fighter', level: 5, leveling: { classes: [] } })).toBeNull();
  });
  it('preserves starting-class order, custom subclass and independent class levels', () => {
    const classes = [row('wizard', 2, 'Custom School'), row('fighter', 3, 'Battle Master')];
    const c = { className: 'Wizard', level: 5, leveling: { classes } };
    expect(resolveClassRoster(c)).toEqual(classes);
    expect(totalClassLevel(classes)).toBe(5);
    expect(classLevelFor(c, 'Wizard')).toBe(2);
    expect(classLevelFor(c, 'fighter')).toBe(3);
    expect(classLevelFor(c, 'cleric')).toBe(0);
    expect(multiclassProficiencyBonus(classes)).toBe(3);
    const normalized = normalizeClassRoster(classes)!;
    normalized[0].level = 1;
    expect(classes[0].level).toBe(2);
  });
  it('uses total character level for every proficiency threshold', () => {
    for (let total = 2; total <= 20; total++) expect(multiclassProficiencyBonus([row('fighter', 1), row('wizard', total - 1)])).toBe(2 + Math.floor((total - 1) / 4));
  });
});

describe('2024 multiclass entry prerequisites', () => {
  const requirements: Record<CoreClass, string[][]> = {
    barbarian: [['STR']], bard: [['CHA']], cleric: [['WIS']], druid: [['WIS']],
    fighter: [['STR', 'DEX']], monk: [['DEX'], ['WIS']], paladin: [['STR'], ['CHA']],
    ranger: [['DEX'], ['WIS']], rogue: [['DEX']], sorcerer: [['CHA']], warlock: [['CHA']], wizard: [['INT']],
  };
  it('covers all 12 primary abilities, including Fighter OR and three dual requirements', () => {
    for (const className of CORE_CLASSES_2024) expect(classEntryRequirements(className)).toEqual(requirements[className].map(anyOf => ({ anyOf, minimum: 13 })));
  });
  it('checks every existing class and the new class at the 12/13 boundary', () => {
    for (const existing of CORE_CLASSES_2024) for (const next of CORE_CLASSES_2024) {
      if (existing === next) continue;
      const classes = [row(existing, 1)];
      expect(checkMulticlassPrerequisites(classes, next, scores).ok).toBe(true);
      for (const group of [...requirements[existing], ...requirements[next]]) {
        const below = { ...scores, ...Object.fromEntries(group.map(ab => [ab, 12])) };
        expect(checkMulticlassPrerequisites(classes, next, below).ok).toBe(false);
      }
    }
  });
  it('accepts either Fighter ability, rejects missing scores, and rechecks all prior classes', () => {
    expect(checkMulticlassPrerequisites([row('fighter', 2)], 'wizard', { DEX: 13, INT: 13 }).ok).toBe(true);
    expect(checkMulticlassPrerequisites([row('fighter', 2)], 'wizard', { STR: 13, INT: 13 }).ok).toBe(true);
    expect(checkMulticlassPrerequisites([row('fighter', 2)], 'wizard', { STR: 13 }).ok).toBe(false);
    expect(checkMulticlassPrerequisites([row('fighter', 1), row('wizard', 1)], 'cleric', { STR: 13, WIS: 13 }).missing).toContain('Wizard requires INT 13+.');
    expect(checkMulticlassPrerequisites([row('fighter', 1)], 'homebrew', scores).ok).toBe(false);
  });
  it('does not retroactively prohibit further levels in an already-owned class', () => {
    expect(checkMulticlassPrerequisites([row('monk', 3)], 'monk', {}).ok).toBe(true);
  });
});

describe('limited starting proficiencies', () => {
  const traits: Record<CoreClass, { armor: string[]; weapons: string[]; skillChoices: number; tools: string[] }> = {
    barbarian: { armor: ['Shields'], weapons: ['Martial weapons'], skillChoices: 0, tools: [] },
    bard: { armor: ['Light armor'], weapons: [], skillChoices: 1, tools: [] },
    cleric: { armor: ['Light armor', 'Medium armor', 'Shields'], weapons: [], skillChoices: 0, tools: [] },
    druid: { armor: ['Light armor', 'Shields'], weapons: [], skillChoices: 0, tools: [] },
    fighter: { armor: ['Light armor', 'Medium armor', 'Shields'], weapons: ['Martial weapons'], skillChoices: 0, tools: [] },
    monk: { armor: [], weapons: [], skillChoices: 0, tools: [] },
    paladin: { armor: ['Light armor', 'Medium armor', 'Shields'], weapons: ['Martial weapons'], skillChoices: 0, tools: [] },
    ranger: { armor: ['Light armor', 'Medium armor', 'Shields'], weapons: ['Martial weapons'], skillChoices: 1, tools: [] },
    rogue: { armor: ['Light armor'], weapons: [], skillChoices: 1, tools: ["Thieves' Tools"] },
    sorcerer: { armor: [], weapons: [], skillChoices: 0, tools: [] },
    warlock: { armor: ['Light armor'], weapons: [], skillChoices: 0, tools: [] },
    wizard: { armor: [], weapons: [], skillChoices: 0, tools: [] },
  };
  it('matches all 12 classes without importing full starting proficiencies', () => {
    for (const className of CORE_CLASSES_2024) expect(multiclassProficiencies2024(className)).toMatchObject(traits[className]);
    expect(multiclassProficiencies2024('bard').skills).toHaveLength(18);
    expect(multiclassProficiencies2024('bard').toolChoices).toHaveLength(10);
    expect(multiclassProficiencies2024('ranger').skills).not.toContain('Arcana');
    expect(multiclassProficiencies2024('rogue').skills).toContain('Sleight of Hand');
    expect(multiclassProficiencies2024('rogue').skills).not.toContain('Survival');
    for (const className of CORE_CLASSES_2024) expect(multiclassProficiencies2024(className).armor).not.toContain('Heavy armor');
  });
  it('returns fresh arrays so modifying one plan cannot corrupt future grants', () => {
    const p = multiclassProficiencies2024('ranger'); p.skills.length = 0;
    expect(multiclassProficiencies2024('ranger').skills).toHaveLength(8);
  });
});

describe('2024 combined spell slots', () => {
  it('matches the official Ranger 4 / Sorcerer 3 example without granting level-3 spells', () => {
    const classes = [row('ranger', 4), row('sorcerer', 3)];
    expect(multiclassCasterLevel(classes)).toBe(5);
    expect(multiclassSpellSlots2024(classes)).toEqual({ L1: 4, L2: 3, L3: 2 });
    expect(classProgression2024('ranger', 4)!.maxSpellLevel).toBe(1);
    expect(classProgression2024('sorcerer', 3)!.maxSpellLevel).toBe(2);
  });
  it('rounds each half caster up, including a level-1 Paladin or Ranger', () => {
    expect(multiclassSpellSlots2024([row('wizard', 1), row('paladin', 1)])).toEqual({ L1: 3 });
    expect(multiclassSpellSlots2024([row('paladin', 1), row('ranger', 7)])).toEqual({ L1: 4, L2: 3, L3: 2 });
    expect(multiclassCasterLevel([row('paladin', 3), row('ranger', 3)])).toBe(4);
  });
  it('rounds EK / AT down only for combined slots, keeping their own single-caster table', () => {
    expect(multiclassSpellSlots2024([row('fighter', 4, 'Eldritch Knight'), row('wizard', 1)])).toEqual({ L1: 3 });
    expect(multiclassSpellSlots2024([row('fighter', 4, 'Eldritch Knight'), row('barbarian', 1)])).toEqual({ L1: 3 });
    expect(multiclassSpellSlots2024([row('rogue', 3, 'Arcane Trickster'), row('fighter', 3, 'Eldritch Knight')])).toEqual({ L1: 3 });
    expect(multiclassSpellSlots2024([row('fighter', 3, 'Champion'), row('rogue', 3, 'Thief')])).toEqual({});
  });
  it('uses total slot progression for every combination of the five full casters', () => {
    const full: CoreClass[] = ['bard', 'cleric', 'druid', 'sorcerer', 'wizard'];
    for (let i = 0; i < full.length; i++) for (let j = i + 1; j < full.length; j++) for (let a = 1; a < 20; a++) for (let b = 1; a + b <= 20; b++) {
      expect(multiclassSpellSlots2024([row(full[i], a), row(full[j], b)])).toEqual(slotReference2024('wizard', a + b));
    }
  });
  it('keeps the 2024 half/third rounding rules across every legal mixed-class level pair', () => {
    for (const half of ['paladin', 'ranger'] as const) for (let a = 1; a < 20; a++) for (let b = 1; a + b <= 20; b++) {
      expect(multiclassSpellSlots2024([row(half, a), row('wizard', b)])).toEqual(slotReference2024('wizard', Math.ceil(a / 2) + b));
    }
    for (const [className, subclass] of [['fighter', 'Eldritch Knight'], ['rogue', 'Arcane Trickster']] as const) for (let a = 3; a < 20; a++) for (let b = 1; a + b <= 20; b++) {
      expect(multiclassSpellSlots2024([row(className, a, subclass), row('wizard', b)])).toEqual(slotReference2024('wizard', Math.floor(a / 3) + b));
    }
  });
  it('preserves all single-class tables and one-caster multiclass tables', () => {
    for (const className of CORE_CLASSES_2024) for (let level = 1; level <= 20; level++) {
      expect(multiclassSpellSlots2024([row(className, level)])).toEqual(classProgression2024(className, level)!.spellSlots);
    }
    for (let level = 1; level < 20; level++) expect(multiclassSpellSlots2024([row('paladin', level), row('fighter', 1)])).toEqual(classProgression2024('paladin', level)!.spellSlots);
  });
  it('keeps Pact Magic separate, including identical levels and all Warlock slot thresholds', () => {
    for (let warlock = 1; warlock < 20; warlock++) {
      const level = Math.min(5, Math.ceil(warlock / 2)), count = warlock >= 17 ? 4 : warlock >= 11 ? 3 : warlock >= 2 ? 2 : 1;
      expect(multiclassSpellSlots2024([row('warlock', warlock), row('wizard', 1)])).toEqual({ L1: 2, [`P${level}`]: count });
      expect(multiclassCasterLevel([row('warlock', warlock), row('wizard', 1)])).toBe(1);
    }
    expect(multiclassSpellSlots2024([row('warlock', 3), row('barbarian', 1)])).toEqual({ P2: 2 });
    expect(multiclassSpellSlots2024([row('warlock', 2)])).toEqual({ L1: 2 });
  });
  it('associates each spell with its own class casting ability', () => {
    const expected = { bard: 'CHA', cleric: 'WIS', druid: 'WIS', fighter: 'INT', paladin: 'CHA', ranger: 'WIS', rogue: 'INT', sorcerer: 'CHA', warlock: 'CHA', wizard: 'INT' };
    for (const [className, ability] of Object.entries(expected)) expect(spellcastingAbilityForClass(className)).toBe(ability);
    expect(spellcastingAbilityForClass('monk')).toBeNull();
    expect(spellcastingAbilityForClass('Wizard / Cleric')).toBeNull();
  });
});

describe('mixed Hit Dice and independent class resources', () => {
  it('pools matching dice and keeps different dice separate', () => {
    expect(multiclassHitDice([row('fighter', 5), row('paladin', 5)])).toEqual({ d10: 10 });
    expect(multiclassHitDice([row('cleric', 5), row('paladin', 5)])).toEqual({ d8: 5, d10: 5 });
    expect(multiclassHitDice([row('barbarian', 2), row('wizard', 1), row('rogue', 3), row('fighter', 4)])).toEqual({ d12: 2, d6: 1, d8: 3, d10: 4 });
  });
  it('preserves legacy spent dice, allocating the larger pools first including an empty new database field', () => {
    const classes = [row('wizard', 3), row('fighter', 2), row('barbarian', 1)];
    expect(allocateHitDiceUsed(classes, 4)).toEqual({ d12: 1, d10: 2, d6: 1 });
    expect(allocateHitDiceUsed(classes, 4, {})).toEqual({ d12: 1, d10: 2, d6: 1 });
    expect(allocateHitDiceUsed(classes, 99)).toEqual({ d12: 1, d10: 2, d6: 3 });
    expect(allocateHitDiceUsed(classes, -5)).toEqual({ d12: 0, d10: 0, d6: 0 });
  });
  it('uses the explicit per-die breakdown after it has been recorded', () => {
    expect(allocateHitDiceUsed([row('fighter', 2), row('wizard', 3)], 3, { d10: 1, d6: 2 })).toEqual({ d10: 1, d6: 2 });
    expect(allocateHitDiceUsed([row('fighter', 2), row('wizard', 3)], 0, { d10: 99, d6: -1 })).toEqual({ d10: 2, d6: 0 });
  });
  it('preserves the spent total when a changed class split shrinks or removes a recorded pool', () => {
    const classes = [row('fighter', 2), row('wizard', 3)];
    expect(allocateHitDiceUsed(classes, 4, { d10: 4 })).toEqual({ d10: 2, d6: 2 });
    expect(allocateHitDiceUsed(classes, 4, { d12: 4 })).toEqual({ d10: 2, d6: 2 });
    expect(allocateHitDiceUsed(classes, 5, { d10: 1, d6: 2 })).toEqual({ d10: 2, d6: 3 });
    expect(allocateHitDiceUsed(classes, 0, { d10: 1, d6: 2 })).toEqual({ d10: 1, d6: 2 });
  });
  it('derives feature uses from each class level rather than total level', () => {
    const classes = [row('fighter', 2), row('sorcerer', 5), row('monk', 3), row('bard', 2)];
    expect(multiclassResourceMaxima(classes, { CHA: 16 })).toMatchObject({ 'Action Surge': 1, 'Second Wind': 2, 'Sorcery Points': 5, Ki: 3, 'Bardic Inspiration': 3 });
  });
  it('keeps Cleric and Paladin Channel Divinity separate with their own capacities', () => {
    const classes = [row('cleric', 6), row('paladin', 3)];
    expect(multiclassResourceMaxima(classes)).toMatchObject({ 'Cleric Channel Divinity': 3, 'Paladin Channel Divinity': 2 });
    expect(multiclassResourceMaxima(classes)['Channel Divinity']).toBeUndefined();
    expect(resourceNameForClass(classes, 'cleric', 'Channel Divinity')).toBe('Cleric Channel Divinity');
    expect(resourceNameForClass([row('cleric', 2), row('paladin', 1)], 'cleric', 'Channel Divinity')).toBe('Channel Divinity');
    expect(multiclassResourceMaxima([row('cleric', 2), row('paladin', 11)])).toMatchObject({ 'Cleric Channel Divinity': 2, 'Paladin Channel Divinity': 3 });
  });
});

describe('counter progression never grants an accidental rest', () => {
  it('updates automatic totals and preserves spent uses and custom pools', () => {
    const current = { Rage: { max: 3, used: 2 }, Ki: { max: 7, used: 4, maxOverride: true }, Homebrew: { max: 9, used: 3 } };
    expect(mergeProgressionCounters(current, { Rage: 4, Ki: 8 }, { Rage: 3, Ki: 7 })).toEqual({ Rage: { max: 4, used: 2 }, Ki: { max: 7, used: 4, maxOverride: true }, Homebrew: { max: 9, used: 3 } });
    expect(current.Rage.max).toBe(3);
  });
  it('keeps unmarked custom totals but honors a deliberately automatic pool', () => {
    expect(mergeProgressionCounters({ Rage: { max: 8, used: 3 } }, { Rage: 4 }, { Rage: 3 }).Rage).toEqual({ max: 8, used: 3 });
    expect(mergeProgressionCounters({ Rage: { max: 8, used: 3, maxOverride: false } }, { Rage: 4 }, { Rage: 3 }).Rage).toEqual({ max: 4, used: 3, maxOverride: false });
  });
  it('transfers spent Pact uses across higher slot levels and clamps capacity', () => {
    expect(mergeProgressionCounters({ P2: { max: 2, used: 2 }, L1: { max: 2, used: 1 } }, { P3: 2, L1: 3 }, { P2: 2, L1: 2 })).toEqual({ P3: { max: 2, used: 2 }, L1: { max: 3, used: 1 } });
    expect(mergeProgressionCounters({ P5: { max: 4, used: 4 } }, { P5: 3 }, { P5: 4 })).toEqual({ P5: { max: 3, used: 3 } });
  });
  it('moves a legacy Warlock L pool into Pact keys when a second class is entered', () => {
    expect(mergeProgressionCounters({ L2: { max: 2, used: 2 } }, { P2: 2, L1: 2 }, { L2: 2 }, { pactKeys: { previous: 'L2', next: 'P2' } })).toEqual({ P2: { max: 2, used: 2 }, L1: { max: 2, used: 0 } });
  });
  it('retains a customized Pact capacity and spending through a level-key transition', () => {
    expect(mergeProgressionCounters({ P2: { max: 4, used: 3, maxOverride: true } }, { P3: 2 }, { P2: 2 })).toEqual({ P3: { max: 4, used: 3, maxOverride: true } });
  });
  it('moves the original Channel Divinity pool to its owner instead of clearing spent uses', () => {
    expect(mergeProgressionCounters({ 'Channel Divinity': { max: 3, used: 2 } }, { 'Cleric Channel Divinity': 3, 'Paladin Channel Divinity': 2 }, { 'Channel Divinity': 3 }, { renames: { 'Channel Divinity': 'Cleric Channel Divinity' } })).toEqual({ 'Cleric Channel Divinity': { max: 3, used: 2 }, 'Paladin Channel Divinity': { max: 2, used: 0 } });
  });
});
