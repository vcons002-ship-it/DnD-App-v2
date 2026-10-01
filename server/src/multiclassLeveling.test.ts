import { describe, expect, it } from 'vitest';
import { createCharacter, createSession, getCharacter, setResource, setSheetAbility, updateCharacter } from './sessions.js';
import { applyLevelUp, cancelLevelUp, configureLevelUpClasses, getLevelUpPlan, grantLevelUp, previewLevelUp, rollLevelUpHp } from './leveling.js';
import { withDiceSource } from '../../shared/dice.js';
import { db } from './db.js';
import { allocateHitDiceUsed } from '../../shared/multiclass.js';
import type { Character } from '../../shared/types.js';
import type { ClassRosterEntry, LevelUpChoices, LevelUpResult } from '../../shared/levelingTypes.js';

const stats = { STR: 16, DEX: 14, CON: 14, INT: 16, WIS: 14, CHA: 14 };
const wizardSpells = ['Magic Missile', 'Shield', 'Mage Armor', 'Detect Magic', 'Sleep', 'Feather Fall'];
const wizardCantrips = ['Fire Bolt', 'Mage Hand', 'Prestidigitation'];
function value<T>(result: LevelUpResult<T>): T { if (!result.ok) throw Error(result.error); return result.value; }
function setup(className = 'Fighter', level = 3, subclass = 'Champion') {
  const s = createSession('Multiclass progression');
  const c = createCharacter(s.id, { name: 'Multiclass adventurer', className, level, subclass, stats, maxHp: 30,
    proficientSkills: ['Arcana', 'Athletics', 'History'], saveProficiencies: ['STR', 'CON'] });
  return { s, c };
}
function configure(sid: string, c: Character, classes: ClassRosterEntry[]): Character { return value(configureLevelUpClasses(sid, c.id, classes)); }
function request(sid: string, c: Character, choices: LevelUpChoices) {
  const pending = value(grantLevelUp(sid, c.id)).leveling!.pending!;
  return { characterId: c.id, expectedLevel: c.level, grantId: pending.id, choices };
}

describe('2024 multiclass guided advancement', () => {
  it('canonicalizes an imported explicit roster instead of keeping unrelated primary class and subclass labels', () => {
    const s = createSession('Explicit imported classes');
    const imported = createCharacter(s.id, { name: 'Imported', className: 'Fighter / Wizard', subclass: 'Champion', level: 4, stats,
      leveling: { rules: '2024', history: [], classes: [{ className: 'wizard', level: 3, subclass: 'Evoker' }, { className: 'cleric', level: 1 }] } });
    expect(imported).toMatchObject({ className: 'Wizard', subclass: 'Evoker', level: 4, spellSlots: { L1: { max: 4 }, L2: { max: 3 } } });
    const withoutTotal = createCharacter(s.id, { name: 'Roster total', leveling: imported.leveling });
    expect(withoutTotal).toMatchObject({ className: 'Wizard', subclass: 'Evoker', level: 4 });
    expect(() => createCharacter(s.id, { name: 'Bad roster', level: 3, leveling: imported.leveling })).toThrow(/add up/);
  });
  it('keeps a sole-class roster and spent Pact Magic in sync during manual DM level corrections', () => {
    const { s, c } = setup('Warlock', 4, 'Fiend Patron');
    const granted = value(grantLevelUp(s.id, c.id)); value(cancelLevelUp(s.id, c.id, granted.leveling!.pending!.id));
    setResource(c.id, 'spellSlots', 'L2', { used: 2 });
    setResource(c.id, 'resources', 'Homebrew', { max: 7, used: 4 });
    const old = getCharacter(c.id)!, updated = updateCharacter(c.id, { level: 5 })!;
    expect(updated.leveling!.classes).toEqual([{ className: 'warlock', level: 5, subclass: 'Fiend Patron' }]);
    expect(updated.spellSlots).toMatchObject({ L3: { max: 2, used: 2 } }); expect(updated.spellSlots.L2).toBeUndefined();
    expect(updated.resources.Homebrew).toEqual(old.resources.Homebrew);
    expect(updated.leveling!.history).toEqual(old.leveling!.history); expect(updated.maxHp).toBe(old.maxHp); expect(updated.curHp).toBe(old.curHp);
    expect(grantLevelUp(s.id, c.id).ok).toBe(true);
  });
  it('keeps sole-class manual subclass/class corrections coherent and rejects ambiguous metadata atomically', () => {
    const { s, c } = setup('Fighter', 6, 'Champion');
    configure(s.id, c, [{ className: 'fighter', level: 6, subclass: 'Champion' }]);
    const battleMaster = updateCharacter(c.id, { subclass: 'Battle Master' })!;
    expect(battleMaster.leveling!.classes).toEqual([{ className: 'fighter', level: 6, subclass: 'Battle Master' }]);
    expect(battleMaster.resources['Superiority Dice']).toMatchObject({ max: 4, used: 0 });
    const corrected = updateCharacter(c.id, { className: 'Wizard', subclass: 'Evoker' })!;
    expect(corrected.leveling!.classes).toEqual([{ className: 'wizard', level: 6, subclass: 'Evoker' }]);
    expect(corrected.spellSlots).toMatchObject({ L3: { max: 3, used: 0 } });
    expect(() => updateCharacter(c.id, { name: 'Must not be saved', className: 'Wizard / Fighter' })).toThrow(/Configure class levels/);
    expect(getCharacter(c.id)).toEqual(corrected);
    expect(() => updateCharacter(c.id, { leveling: { rules: '2024', history: [], classes: [{ className: 'wizard', level: 3 }] } })).toThrow(/add up/);
    expect(getCharacter(c.id)).toEqual(corrected);
  });
  it('retains spent legacy Hit Dice in the original die pool when a larger Hit Die class is added', () => {
    const { s, c } = setup('Wizard', 3, 'Evoker');
    db.prepare("UPDATE characters SET hit_dice_used = 3, hit_dice_used_by_die = '{}' WHERE id = ?").run(c.id);
    const current = getCharacter(c.id)!, req = request(s.id, current, { className: 'fighter', hpMethod: 'fixed', featureSelections: { fightingStyle: ['Archery'] } });
    const after = value(applyLevelUp(s.id, req));
    expect(after.hitDiceUsed).toBe(3);
    expect(allocateHitDiceUsed(after.leveling!.classes!, after.hitDiceUsed!, after.hitDiceUsedByDie)).toEqual({ d10: 0, d6: 3 });
    const copy = setup('Wizard', 5, 'Evoker');
    db.prepare("UPDATE characters SET hit_dice_used = 4, hit_dice_used_by_die = '{}' WHERE id = ?").run(copy.c.id);
    const corrected = configure(copy.s.id, getCharacter(copy.c.id)!, [{ className: 'wizard', level: 3, subclass: 'Evoker' }, { className: 'fighter', level: 2 }]);
    expect(corrected.hitDiceUsedByDie).toEqual({ d10: 1, d6: 3 });
    expect(corrected.hitDiceUsed).toBe(4);
  });
  it('records a second Unarmored Defense formula without replacing or stacking the first', () => {
    const { s, c } = setup('Barbarian', 3, 'Path of the Berserker');
    setSheetAbility('pc', c.id, { id: 'barbarian-ac', name: 'Unarmored Defense', type: 'ability', description: 'My saved Barbarian armor formula' });
    const req = request(s.id, getCharacter(c.id)!, { className: 'monk', hpMethod: 'fixed' });
    const after = value(applyLevelUp(s.id, req));
    expect(after.sheetAbilities.find(a => a.id === 'barbarian-ac')!.description).toBe('My saved Barbarian armor formula');
    expect(after.sheetAbilities.find(a => a.name === 'Monk Unarmored Defense')).toMatchObject({ sourceClass: 'monk', description: expect.stringContaining('10 + Dexterity + Wisdom') });
    expect(after.armorClass).toBe(c.armorClass);
  });
  it('requires an explicit valid split for ambiguous legacy sheets, never guesses levels, and preserves the primary display class', () => {
    const { s, c } = setup('Fighter / Wizard', 7, '');
    expect(grantLevelUp(s.id, c.id)).toMatchObject({ ok: false, error: expect.stringContaining('configure') });
    expect(configureLevelUpClasses(s.id, c.id, [{ className: 'fighter', level: 3 }, { className: 'wizard', level: 3 }]).ok).toBe(false);
    expect(configureLevelUpClasses(s.id, c.id, [{ className: 'fighter', level: 4 }, { className: 'fighter', level: 3 }]).ok).toBe(false);
    const configured = configure(s.id, c, [{ className: 'fighter', level: 4, subclass: 'Champion' }, { className: 'wizard', level: 3, subclass: 'Evoker' }]);
    expect(configured).toMatchObject({ className: 'Fighter', subclass: 'Champion', level: 7, maxHp: 30 });
    expect(configured.leveling!.classes).toHaveLength(2);
    value(grantLevelUp(s.id, c.id));
    expect(configureLevelUpClasses(s.id, c.id, configured.leveling!.classes).ok).toBe(false);
    const plan = value(getLevelUpPlan(s.id, c.id, undefined, 'wizard'));
    expect(plan).toMatchObject({ fromClassLevel: 3, toClassLevel: 4, newClass: false, progression: { classKey: 'wizard', level: 4, featChoice: 'asiOrFeat' } });
  });
  it('grants a first Wizard level with six book spells, three cantrips, fixed d6 HP, and no total-level ASI or new saving throws', () => {
    const { s, c } = setup();
    const req = request(s.id, c, { className: 'wizard', hpMethod: 'fixed', spellNames: wizardSpells, cantripNames: wizardCantrips });
    const plan = value(getLevelUpPlan(s.id, c.id, undefined, 'wizard'));
    expect(plan).toMatchObject({ newClass: true, fromClassLevel: 0, toClassLevel: 1, progression: { hitDie: 6, fixedHp: 4, featChoice: null }, spellChoices: { newSpells: 6, newCantrips: 3 } });
    expect(previewLevelUp(s.id, { ...req, choices: { ...req.choices, asi: { STR: 2 } } }).ok).toBe(false);
    const before = getCharacter(c.id)!;
    const preview = value(previewLevelUp(s.id, req));
    expect(preview).toMatchObject({ hpGain: 6, toLevel: 4, maxHpAfter: 36, classes: [{ className: 'fighter', level: 3, subclass: 'Champion' }, { className: 'wizard', level: 1 }] });
    expect(getCharacter(c.id)).toEqual(before);
    const after = value(applyLevelUp(s.id, req));
    expect(after).toMatchObject({ className: 'Fighter', subclass: 'Champion', level: 4, maxHp: 36, spellSlots: { L1: { max: 2, used: 0 } } });
    expect(after.saveProficiencies).toEqual(c.saveProficiencies);
    expect(after.sheetAbilities.filter(a => a.type === 'spell')).toHaveLength(9);
    expect(after.sheetAbilities.find(a => a.name === 'Magic Missile')).toMatchObject({ sourceClass: 'wizard', prepared: false, roll: { castingAbility: 'INT' } });
    expect(value(applyLevelUp(s.id, req)).maxHp).toBe(36);
  });
  it('checks both the existing and new class prerequisites against permanent scores and exposes unavailable classes', () => {
    const { s, c } = setup(); updateCharacter(c.id, { stats: { ...stats, INT: 12, STR: 12, DEX: 12 } });
    const current = getCharacter(c.id)!, req = request(s.id, current, { className: 'wizard', hpMethod: 'fixed' });
    const plan = value(getLevelUpPlan(s.id, c.id));
    expect(plan.classOptions.find(option => option.className === 'wizard')).toMatchObject({ eligible: false, reason: expect.stringContaining('Wizard') });
    expect(getLevelUpPlan(s.id, c.id, undefined, 'wizard')).toMatchObject({ ok: false, error: expect.stringContaining('Fighter') });
    expect(applyLevelUp(s.id, req).ok).toBe(false);
    expect(getCharacter(c.id)!.level).toBe(3);
  });
  it('locks an authoritative HP roll to its class without a reroll or reuse as a larger Hit Die', () => {
    const { s, c } = setup(), req = request(s.id, c, { className: 'wizard', hpMethod: 'roll', spellNames: wizardSpells, cantripNames: wizardCantrips });
    const rolled = value(withDiceSource(sides => { expect(sides).toEqual([6]); return [5]; }, () => rollLevelUpHp(s.id, c.name, c.id, req.grantId, 'wizard')));
    expect(rolled.leveling!.pending).toMatchObject({ hpRoll: 5, hpClassName: 'wizard' });
    expect(rollLevelUpHp(s.id, c.name, c.id, req.grantId, 'fighter').ok).toBe(false);
    expect(getLevelUpPlan(s.id, c.id, undefined, 'fighter').ok).toBe(false);
    expect(applyLevelUp(s.id, { ...req, choices: { className: 'fighter', hpMethod: 'roll', asi: { STR: 2 } } }).ok).toBe(false);
    expect(value(applyLevelUp(s.id, req)).maxHp).toBe(37);
  });
  it('uses class level for learned spells but total level for proficiency and combined slots', () => {
    const { s, c } = setup('Wizard', 4, '');
    const configured = configure(s.id, c, [{ className: 'wizard', level: 3, subclass: 'Evoker' }, { className: 'cleric', level: 1 }]);
    setResource(c.id, 'spellSlots', 'L2', { used: 2 });
    const req = request(s.id, getCharacter(c.id)!, { className: 'wizard', hpMethod: 'fixed', asi: { INT: 2 }, spellNames: ['Misty Step', 'Mirror Image'], cantripNames: ['Fire Bolt'] });
    const plan = value(getLevelUpPlan(s.id, c.id, undefined, 'wizard'));
    expect(plan.progression).toMatchObject({ level: 4, maxSpellLevel: 2, proficiencyBonus: 3 });
    expect(plan.spells.some(spell => spell.name === 'Fireball')).toBe(false);
    expect(previewLevelUp(s.id, { ...req, choices: { ...req.choices, spellNames: ['Fireball', 'Shield'] } }).ok).toBe(false);
    const after = value(applyLevelUp(s.id, req));
    expect(after.level).toBe(5); expect(after.spellSlots).toMatchObject({ L2: { max: 3, used: 2 }, L3: { max: 2, used: 0 } });
    expect(after.leveling!.classes).toEqual([{ className: 'wizard', level: 4, subclass: 'Evoker' }, { className: 'cleric', level: 1 }]);
    expect(configured.leveling!.classes![1].level).toBe(1);
  });
  it('allows the same spell from two classes with different casting abilities and preserves existing custom definitions', () => {
    const { s, c } = setup('Sorcerer', 5, '');
    configure(s.id, c, [{ className: 'sorcerer', level: 4, subclass: 'Draconic Sorcery' }, { className: 'wizard', level: 1 }]);
    setSheetAbility('pc', c.id, { id: 'sorcerer-shield', name: 'Shield', type: 'spell', level: 1, sourceClass: 'sorcerer', classes: ['wizard', 'sorcerer'], prepared: true, description: 'My custom Shield', roll: { kind: 'damage', dice: '1d6', castingAbility: 'CHA' } });
    const req = request(s.id, getCharacter(c.id)!, { className: 'wizard', hpMethod: 'fixed', spellNames: ['Shield', 'Magic Missile'], featureSelections: { expertise: ['Arcana'] } });
    const after = value(applyLevelUp(s.id, req)), shields = after.sheetAbilities.filter(a => a.name === 'Shield');
    expect(shields).toHaveLength(2);
    expect(shields.find(a => a.sourceClass === 'sorcerer')).toMatchObject({ id: 'sorcerer-shield', description: 'My custom Shield', roll: { castingAbility: 'CHA' } });
    expect(shields.find(a => a.sourceClass === 'wizard')).toMatchObject({ sourceClass: 'wizard', prepared: false });
    expect(after.modifiers.find(m => m.source === 'Expertise: Arcana (2024 level-up)')?.value).toBe(3);
  });
  it('moves a spent solo Warlock Pact pool into its separate multiclass pool without refilling or mixing it with Wizard slots', () => {
    const { s, c } = setup('Warlock', 4, 'Fiend Patron'); setResource(c.id, 'spellSlots', 'L2', { used: 2 });
    const req = request(s.id, getCharacter(c.id)!, { className: 'wizard', hpMethod: 'fixed', spellNames: wizardSpells, cantripNames: wizardCantrips });
    const after = value(applyLevelUp(s.id, req));
    expect(after.spellSlots).toMatchObject({ L1: { max: 2, used: 0 }, P2: { max: 2, used: 2 } });
    expect(after.spellSlots.L2).toBeUndefined();
    const warlockReq = request(s.id, after, { className: 'warlock', hpMethod: 'fixed', spellNames: ['Counterspell'], featureSelections: { invocations: ['Eldritch Mind', 'Devil’s Sight'] } });
    const plan = value(getLevelUpPlan(s.id, after.id, undefined, 'warlock'));
    warlockReq.choices.featureSelections = { invocations: plan.featureChoices.find(choice => choice.key === 'invocations')!.options.slice(0, 2).map(option => option.name) };
    const evolved = value(applyLevelUp(s.id, warlockReq));
    expect(evolved.spellSlots).toMatchObject({ L1: { max: 2, used: 0 }, P3: { max: 2, used: 2 } });
    expect(evolved.spellSlots.P2).toBeUndefined();
  });
  it('adds only the new class skill and no save proficiencies, permits Expertise in that newly learned skill, and gives no equipment', () => {
    const { s, c } = setup();
    const req = request(s.id, c, { className: 'rogue', hpMethod: 'fixed', featureSelections: { multiclassSkills: ['Stealth'], expertise: ['Stealth', 'Athletics'] } });
    const after = value(applyLevelUp(s.id, req));
    expect(after.proficientSkills).toEqual([...c.proficientSkills, 'Stealth']);
    expect(after.saveProficiencies).toEqual(c.saveProficiencies); expect(after.items).toEqual(c.items); expect(after.weapons).toEqual(c.weapons);
    expect(after.sheetAbilities).toContainEqual(expect.objectContaining({ name: "Proficiency: Thieves' Tools", sourceClass: 'rogue' }));
    expect(after.modifiers.filter(modifier => /^Expertise/.test(modifier.source))).toHaveLength(2);
  });
  it('grants Divine Order numeric passives and bonus cantrip separately, while rejecting duplicated bonus and ordinary cantrips', () => {
    const { s, c } = setup();
    const req = request(s.id, c, { className: 'cleric', hpMethod: 'fixed', cantripNames: ['Guidance', 'Sacred Flame', 'Thaumaturgy'], featureSelections: { order: ['Thaumaturge'], orderCantrip: ['Light'] } });
    expect(previewLevelUp(s.id, { ...req, choices: { ...req.choices, featureSelections: { order: ['Thaumaturge'], orderCantrip: ['Guidance'] } } }).ok).toBe(false);
    const after = value(applyLevelUp(s.id, req));
    expect(after.sheetAbilities.find(a => a.name === 'Light')).toMatchObject({ sourceClass: 'cleric', tags: expect.arrayContaining(['bonus-cantrip']) });
    expect(after.modifiers.filter(m => m.source === 'Cleric Thaumaturge (2024 level-up)')).toEqual(expect.arrayContaining([
      expect.objectContaining({ target: { kind: 'skill', skill: 'Arcana' }, value: 2 }), expect.objectContaining({ target: { kind: 'skill', skill: 'Religion' }, value: 2 }),
    ]));
    expect(after.sheetAbilities.some(a => a.name === 'Proficiency: Heavy armor')).toBe(false);
  });
  it('separates Channel Divinity pools, preserves spent original uses, and scopes their feature counters', () => {
    const { s, c } = setup('Cleric', 4, '');
    configure(s.id, c, [{ className: 'cleric', level: 2 }, { className: 'paladin', level: 2 }]);
    setResource(c.id, 'resources', 'Channel Divinity', { used: 1 });
    setSheetAbility('pc', c.id, { id: 'cleric-channel', name: 'Channel Divinity', type: 'ability', description: 'My custom original pool', useCounter: { name: 'Channel Divinity', max: 2 } });
    const req = request(s.id, getCharacter(c.id)!, { className: 'paladin', hpMethod: 'fixed', subclass: 'Oath of Devotion' });
    const after = value(applyLevelUp(s.id, req));
    expect(after.resources).toMatchObject({ 'Cleric Channel Divinity': { max: 2, used: 1 }, 'Paladin Channel Divinity': { max: 2, used: 0 } });
    expect(after.resources['Channel Divinity']).toBeUndefined();
    expect(after.sheetAbilities.find(a => a.id === 'cleric-channel')!.useCounter!.name).toBe('Cleric Channel Divinity');
    expect(after.sheetAbilities.find(a => a.id === 'cleric-channel')).toMatchObject({ sourceClass: 'cleric', description: 'My custom original pool' });
    expect(after.sheetAbilities.find(a => a.name === 'Channel Divinity' && a.sourceClass === 'paladin')!.useCounter!.name).toBe('Paladin Channel Divinity');
  });
});
