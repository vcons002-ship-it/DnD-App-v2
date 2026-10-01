import { createHash } from 'node:crypto';
import { db, newId } from './db.js';
import { addRollLog, getCharacter, updateCharacter } from './sessions.js';
import { getAllSpells, getSpell } from './spells/srd.js';
import { diceReveal } from '../../shared/rollReveal.js';
import { rollDice } from '../../shared/dice.js';
import { abilityMod, proficiencyBonus, SKILLS, type AbilityKey } from '../../shared/skills.js';
import {
  classProgression2024, hpIncrease2024, permanentStats2024, subclassChoices2024,
  subclassFeatures2024, alwaysPreparedSpells2024, resolveProgressionClass, type CoreClass, type ClassProgression,
} from '../../shared/characterProgression.js';
import { resolveClassRoster, normalizeClassRoster, totalClassLevel, checkMulticlassPrerequisites,
  multiclassProficiencies2024, multiclassSpellSlots2024, multiclassResourceMaxima, mergeProgressionCounters, resourceNameForClass, allocateHitDiceUsed,
} from '../../shared/multiclass.js';
import type { Character, SheetAbility, SheetModifier } from '../../shared/types.js';
import type {
  CharacterLeveling, LevelUpChoices, LevelUpCommitRequest, LevelUpPlan,
  LevelUpPreview, LevelUpResult, PendingLevelUp, ClassRosterEntry,
} from '../../shared/levelingTypes.js';
import { eligibleLevelingFeats, featureChoices2024, levelingFeature, selectedFeatureAbility } from './levelingCatalog.js';

const fail = <T>(error: string): LevelUpResult<T> => ({ ok: false, error });
const success = <T>(value: T): LevelUpResult<T> => ({ ok: true, value });
const key = (s: string) => s.trim().toLowerCase().replace(/[\u2018\u2019]/g, "'");
const ABILITIES: AbilityKey[] = ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'];
const mutableAbilityKeys = new Set(['active', 'castLevel', 'mark', 'hitUsedTurn', 'spent', 'expiresAt']);
function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value)
    .filter(([k]) => !mutableAbilityKeys.has(k)).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, stable(v)]));
  return value;
}
/** Combat spending, wounds and live claims do not invalidate a level grant. */
export function levelUpFingerprint(c: Character): string {
  return createHash('sha256').update(JSON.stringify(stable({
    level: c.level, className: c.className, subclass: c.subclass, maxHp: c.maxHp,
    stats: c.stats, modifiers: c.modifiers, sheetAbilities: c.sheetAbilities,
    abilities: c.abilities, proficientSkills: c.proficientSkills, saveProficiencies: c.saveProficiencies,
    classes: c.leveling?.classes,
  }))).digest('hex');
}
const state = (c: Character): CharacterLeveling => c.leveling ?? { rules: '2024', history: [] };
function putState(id: string, leveling: CharacterLeveling): Character {
  db.prepare('UPDATE characters SET leveling = ? WHERE id = ?').run(JSON.stringify(leveling), id);
  return getCharacter(id)!;
}
function characterInSession(sessionId: string, id: string): LevelUpResult<Character> {
  const c = typeof id === 'string' ? getCharacter(id) : null;
  return c?.sessionId === sessionId ? success(c) : fail('Character not found in this campaign.');
}

export function grantLevelUp(sessionId: string, characterId: string): LevelUpResult<Character> {
  const found = characterInSession(sessionId, characterId); if (!found.ok) return found;
  const c = found.value;
  const missingScores = ABILITIES.filter(ab => !Number.isFinite(c.stats[ab]));
  if (missingScores.length) return fail(`Fill in ${missingScores.join(', ')} on ${c.name}’s sheet before granting a level-up.`);
  const classes = resolveClassRoster(c);
  if (!classes) return fail('Ask the DM to configure the exact class levels before using the 2024 guide. Multiclass level splits are never guessed from the class name.');
  if (c.level >= 20) return fail(`${c.name} is already level 20.`);
  const leveling = state(c);
  if (leveling.pending && leveling.pending.fromLevel === c.level) return success(c);
  const nextState = { ...leveling, classes };
  return success(putState(c.id, { ...nextState, pending: {
    id: newId(), fromLevel: c.level, toLevel: c.level + 1,
    approvedAt: Date.now(), baseFingerprint: levelUpFingerprint({ ...c, leveling: nextState }),
  } }));
}
/** The DM supplies an explicit baseline for an ambiguous legacy multiclass sheet. */
export function configureLevelUpClasses(sessionId: string, characterId: string, input: unknown): LevelUpResult<Character> {
  const found = characterInSession(sessionId, characterId); if (!found.ok) return found;
  const c = found.value, classes = normalizeClassRoster(input);
  if (!classes || totalClassLevel(classes) !== c.level) return fail('Class levels must be valid core classes and add up to the character\'s current total level.');
  if (state(c).pending) return fail('Cancel the pending level-up before changing its class levels.');
  const oldClasses = resolveClassRoster(c) ?? classes, scores = permanentStats2024(c);
  return db.transaction(() => {
    const spellSlots = mergeProgressionCounters(c.spellSlots, multiclassSpellSlots2024(classes), multiclassSpellSlots2024(oldClasses), pactTransfer(c, oldClasses, classes));
    const resources = mergeProgressionCounters(c.resources, multiclassResourceMaxima(classes, scores), multiclassResourceMaxima(oldClasses, scores), { renames: resourceRenames(oldClasses, classes) });
    updateCharacter(c.id, { className: classTitle(classes[0].className), subclass: classes[0].subclass ?? '', spellSlots, resources }, { skipRosterSync: true });
    const oldSpent = allocateHitDiceUsed(oldClasses, c.hitDiceUsed ?? 0, c.hitDiceUsedByDie);
    db.prepare('UPDATE characters SET hit_dice_used_by_die = ? WHERE id = ?').run(JSON.stringify(allocateHitDiceUsed(classes, c.hitDiceUsed ?? 0, oldSpent)), c.id);
    return success(putState(c.id, { ...state(c), classes }));
  })();
}
export function cancelLevelUp(sessionId: string, characterId: string, grantId: string): LevelUpResult<Character> {
  const found = characterInSession(sessionId, characterId); if (!found.ok) return found;
  const c = found.value, leveling = state(c);
  if (leveling.pending?.id !== grantId) return fail('That level-up is no longer pending.');
  const { pending: _pending, ...remaining } = leveling;
  return success(putState(c.id, remaining));
}
function pendingGrant(c: Character, id?: string, expectedLevel?: number): LevelUpResult<PendingLevelUp> {
  const grant = state(c).pending;
  if (!grant || id !== undefined && grant.id !== id) return fail('Ask the DM to grant a level-up first.');
  if (expectedLevel !== undefined && expectedLevel !== c.level || grant.fromLevel !== c.level || grant.toLevel !== c.level + 1)
    return fail('This sheet has already changed level. Reopen the level-up guide.');
  if (grant.baseFingerprint !== levelUpFingerprint(c))
    return fail('The sheet changed after this level-up was granted. Ask the DM to cancel and grant it again.');
  return success(grant);
}

const classTitle = (name: string) => name.charAt(0).toUpperCase() + name.slice(1);
function pactTransfer(c: Character, previous: ClassRosterEntry[], next: ClassRosterEntry[]) {
  const pact = previous.find(e => e.className === 'warlock'), current = next.find(e => e.className === 'warlock');
  if (!pact || !current || previous.length !== 1) return undefined;
  const oldKey = `L${Math.min(5, Math.ceil(pact.level / 2))}`, nextKey = `${next.length === 1 ? 'L' : 'P'}${Math.min(5, Math.ceil(current.level / 2))}`;
  return c.spellSlots[oldKey] && !Object.keys(c.spellSlots).some(k => /^P[1-5]$/.test(k)) ? { pactKeys: { previous: oldKey, next: nextKey } } : undefined;
}
function resourceRenames(previous: ClassRosterEntry[], next: ClassRosterEntry[]): Record<string, string> {
  const before = previous.filter(e => ['cleric', 'paladin'].includes(e.className) && e.level >= (e.className === 'cleric' ? 2 : 3));
  if (before.length !== 1) return {};
  const name = resourceNameForClass(next, before[0].className, 'Channel Divinity');
  return name === 'Channel Divinity' ? {} : { 'Channel Divinity': name };
}
const CORE_CLASSES: CoreClass[] = ['barbarian', 'bard', 'cleric', 'druid', 'fighter', 'monk', 'paladin', 'ranger', 'rogue', 'sorcerer', 'warlock', 'wizard'];
function selectedClass(c: Character, className: unknown, grant?: PendingLevelUp): LevelUpResult<{ classes: ClassRosterEntry[]; entry: ClassRosterEntry; newClass: boolean }> {
  const classes = resolveClassRoster(c); if (!classes) return fail('Ask the DM to configure this character\'s class levels first.');
  if (className !== undefined && typeof className !== 'string') return fail('Choose a valid class for this level.');
  const name = resolveProgressionClass((className as string | undefined) ?? grant?.hpClassName ?? classes[0].className);
  if (!name) return fail('Choose one of the supported 2024 core classes.');
  if (grant?.hpClassName && name !== grant.hpClassName) return fail('The rolled Hit Die belongs to the selected class. Keep that class for this level-up.');
  const existing = classes.find(entry => entry.className === name);
  if (!existing) {
    const prerequisite = checkMulticlassPrerequisites(classes, name, permanentStats2024(c));
    if (!prerequisite.ok) return fail(`Multiclass prerequisites are not met: ${prerequisite.missing.join('; ')}.`);
  }
  return success({ classes, entry: existing ?? { className: name, level: 0 }, newClass: !existing });
}
function classCharacter(c: Character, entry: ClassRosterEntry): Character { return { ...c, className: classTitle(entry.className), subclass: entry.subclass ?? '', level: entry.level }; }
function belongsToClass(a: SheetAbility, className: CoreClass, legacyClass?: CoreClass): boolean {
  return resolveProgressionClass(a.sourceClass ?? legacyClass ?? '') === className;
}
function chosenSubclass(c: Character, subclass: unknown, level: number): LevelUpResult<string> {
  if (subclass !== undefined && typeof subclass !== 'string') return fail('Choose a valid subclass.');
  const selected = (subclass as string | undefined)?.trim() ?? c.subclass;
  if (c.subclass && key(selected) !== key(c.subclass)) return fail('An existing subclass is preserved. The DM can change it in the sheet editor.');
  if (level < 3 && selected && !c.subclass) return fail('Choose your subclass at level 3.');
  if (level >= 3 && !selected) return fail('Choose a subclass to continue.');
  if (selected && !c.subclass && !subclassChoices2024(c.className).some(s => key(s) === key(selected)))
    return fail('Choose one of the available 2024 subclasses. Set a custom subclass in the DM sheet editor.');
  return success(selected);
}
export function getLevelUpPlan(sessionId: string, characterId: string, subclass?: string, className?: string): LevelUpResult<LevelUpPlan> {
  const found = characterInSession(sessionId, characterId); if (!found.ok) return found;
  const c = found.value, grant = pendingGrant(c); if (!grant.ok) return grant;
  const selection = selectedClass(c, className, grant.value); if (!selection.ok) return selection;
  const { classes, entry, newClass } = selection.value;
  const classSheet = classCharacter(c, entry), nextClassLevel = entry.level + 1;
  // Before choosing a new class-level-3 subclass the initial plan remains usable.
  const selected = !classSheet.subclass && !subclass ? success('') : chosenSubclass(classSheet, subclass, nextClassLevel);
  if (!selected.ok) return selected;
  const candidate = { ...classSheet, subclass: selected.value };
  const scores = permanentStats2024(c);
  const rawProgression = classProgression2024(entry.className, nextClassLevel, selected.value, scores);
  if (!rawProgression) return fail('This class or level needs manual advancement in the DM sheet editor.');
  const progression = { ...rawProgression, proficiencyBonus: proficiencyBonus(c.level + 1) };
  const previous: ClassProgression = { ...(classProgression2024(entry.className, entry.level, entry.subclass, scores) ?? {
    ...progression, level: 0, features: [], cantrips: 0, preparedSpells: 0, maxSpellLevel: 0, spellbookAdditions: 0, spellSlots: {}, resourceMaxima: {}, featChoice: null,
  }), proficiencyBonus: proficiencyBonus(c.level) };
  const legacyClass = classes.length === 1 ? classes[0].className : undefined;
  const owned = new Set([...c.sheetAbilities.filter(a => belongsToClass(a, entry.className, legacyClass)), ...c.abilities].map(a => key(a.name)));
  const classList = progression.classKey === 'fighter' || progression.classKey === 'rogue' ? 'wizard' : progression.classKey;
  const grantedSpellNames = new Set(alwaysPreparedSpells2024(entry.className, selected.value, progression.level).map(key));
  const spellLists = progression.classKey === 'bard' && progression.level >= 10 ? ['bard', 'cleric', 'druid', 'wizard'] : [classList];
  const all = getAllSpells().filter(s => s.type === 'spell' && (s.classes ?? []).some(list => ((s.level ?? 0) === 0 ? [classList] : spellLists).includes(list)) && (s.level ?? 0) <= progression.maxSpellLevel);
  const spells = all.filter(s => !owned.has(key(s.name)) && !grantedSpellNames.has(key(s.name))).map(s => ({ name: s.name, level: s.level ?? 0, school: s.school, description: s.description }));
  const newCantrips = Math.max(0, progression.cantrips - previous.cantrips);
  const inheritedCasters = ['bard', 'sorcerer', 'ranger', 'warlock'].includes(progression.classKey) || /eldritch knight|arcane trickster/i.test(selected.value);
  let newSpells = progression.classKey === 'wizard' ? progression.spellbookAdditions : Math.max(0, progression.preparedSpells - previous.preparedSpells);
  // The Evoker's two starting Savant spells are additional to normal level-up spells.
  if (progression.features.includes('Evocation Savant')) newSpells += 2;
  const savantExtra = progression.classKey === 'wizard' && key(selected.value) === 'evoker' && progression.level > 3 && progression.maxSpellLevel > previous.maxSpellLevel;
  if (savantExtra) newSpells++;
  const warnings = [...progression.choiceNotes,
    'Situational class features are recorded as 2024 notes. Existing customized abilities are preserved; only reviewed numeric effects are applied automatically.'];
  if (classes.length > 1 && c.sheetAbilities.some(a => a.type === 'spell' && !a.sourceClass)) warnings.push('Some legacy spells have no class assigned. Assign their Spell class before replacing them or counting class preparation; the guide does not guess their origin.');
  if (c.weapons.some(w => w.attackBonus !== undefined || /\d\s*[+-]\s*\d/.test(w.damage ?? '')))
    warnings.push('Saved fixed weapon attack bonuses or flat damage remain unchanged. Review those weapons after proficiency or ability scores increase; automatic weapons use the new live modifiers.');
  if (selected.value && !subclassChoices2024(entry.className).some(s => key(s) === key(selected.value)))
    warnings.push(`The saved ${selected.value} subclass is preserved. Review its level-${progression.level} features with the DM.`);
  else if (selected.value && progression.features.some(n => n === 'Subclass feature' || /Subclass$/.test(n)) && !subclassFeatures2024(entry.className, selected.value, progression.level).length)
    warnings.push(`${selected.value} has additional subclass choices to review with the DM; the guide does not invent unlisted features.`);
  const features = progression.features.filter(n => !['Ability Score Improvement', 'Epic Boon', 'Subclass feature'].includes(n) && !/Subclass$/.test(n))
    .map(name => ({ name, description: levelingFeature(name, candidate, progression).description, existing: owned.has(key(name)) }));
  const grantedProficiencies = newClass ? multiclassProficiencies2024(entry.className) : null;
  const proficiencies = grantedProficiencies ? [...grantedProficiencies.armor, ...grantedProficiencies.weapons, ...grantedProficiencies.tools] : [];
  const featureChoices = featureChoices2024({ ...candidate, sheetAbilities: c.sheetAbilities.filter(a => a.type !== 'spell' || belongsToClass(a, entry.className, legacyClass)) }, progression);
  if (grantedProficiencies?.skillChoices) featureChoices.unshift({ key: 'multiclassSkills', label: `${classTitle(entry.className)} multiclass skill`, count: grantedProficiencies.skillChoices,
    options: grantedProficiencies.skills.filter(name => !c.proficientSkills.includes(name)).map(name => ({ name, description: `Gain ${name} proficiency.` })) });
  if (grantedProficiencies?.toolChoices.length) featureChoices.unshift({ key: 'multiclassTool', label: 'Musical instrument proficiency', count: 1,
    options: grantedProficiencies.toolChoices.map(name => ({ name, description: `Gain ${name} proficiency.` })) });
  if (grantedProficiencies?.skillChoices) {
    const expertise = featureChoices.find(choice => choice.key === 'expertise');
    if (expertise) for (const name of grantedProficiencies.skills) if (!expertise.options.some(option => option.name === name)) expertise.options.push({ name, description: `Choose this only if you also gain its proficiency in this level-up.` });
  }
  if (newClass) warnings.push('A new class grants only its multiclass proficiencies, with no new saving-throw proficiencies, equipment, or full first-level Hit Points. Existing Extra Attack and Unarmored Defense features do not stack.');
  const classOptions = CORE_CLASSES.map(className => { const current = classes.find(e => e.className === className); const check = current ? { ok: true, missing: [] } : checkMulticlassPrerequisites(classes, className, scores); return { className, level: current?.level ?? 0, eligible: check.ok && (!grant.value.hpClassName || grant.value.hpClassName === className), ...(!check.ok ? { reason: check.missing.join('; ') } : grant.value.hpClassName && grant.value.hpClassName !== className ? { reason: 'The HP roll is locked to its class.' } : {}) }; });
  return success({ grant: grant.value, progression, previous, features, classes, classOptions, fromClassLevel: entry.level, toClassLevel: nextClassLevel, newClass, proficiencies,
    feats: eligibleLevelingFeats(c, progression, scores), spells,
    featureChoices, warnings,
    spellChoices: { newSpells, newCantrips, replacementLimit: inheritedCasters && !newClass ? 1 : 0,
      spellSelectionRequired: progression.classKey === 'wizard' || inheritedCasters,
      cantripSelectionRequired: true } });
}

/** One physical HP roll per grant. The face is durable before the player confirms. */
export function rollLevelUpHp(sessionId: string, roller: string, characterId: string, grantId: string, className?: string): LevelUpResult<Character> {
  const found = characterInSession(sessionId, characterId); if (!found.ok) return found;
  const c = found.value, pending = pendingGrant(c, grantId); if (!pending.ok) return pending;
  const selected = selectedClass(c, className, pending.value); if (!selected.ok) return selected;
  if (pending.value.hpRoll !== undefined) return success(c);
  const p = classProgression2024(selected.value.entry.className, selected.value.entry.level + 1, selected.value.entry.subclass);
  if (!p) return fail('The HP die could not be determined for this class.');
  const rolled = rollDice(`1d${p.hitDie}`); if (!rolled) return fail('The HP die could not be rolled.');
  const con = abilityMod(permanentStats2024(c).CON ?? 10), gain = Math.max(1, rolled.total + con);
  const entry = addRollLog(sessionId, { roller, label: 'Level-up HP', expr: rolled.expr, total: gain,
    detail: `${c.name} — ${classTitle(p.classKey)} level ${p.level} HP: ${rolled.total} ${con >= 0 ? '+' : '−'} ${Math.abs(con)} CON = ${gain} (minimum 1). Confirm the level-up to apply it.`,
    reveal: { ...diceReveal(c.name, rolled, `Level ${p.level} — Hit Point Increase`), damage: gain,
      damageMods: [{ label: 'Constitution', value: con }, ...(gain !== rolled.total + con ? [{ label: 'Minimum 1 HP', value: gain - rolled.total - con }] : [])] } });
  return success(putState(c.id, { ...state(c), pending: { ...pending.value, hpRoll: rolled.total, hpRollId: entry.id, hpClassName: p.classKey } }));
}

type Prepared = { patch: Parameters<typeof updateCharacter>[1]; plan: LevelUpPlan; choices: LevelUpChoices; additions: string[]; hpGain: number; resources: Character['resources']; classes: ClassRosterEntry[]; hitDiceUsedByDie: Record<string, number> };
function strings(value: unknown): value is string[] {
  return Array.isArray(value) && value.length <= 100 && value.every(s => typeof s === 'string' && s.length <= 160) && new Set(value.map(key)).size === value.length;
}
function prepareLevelUp(sessionId: string, req: LevelUpCommitRequest): LevelUpResult<Prepared> {
  if (!req || typeof req !== 'object' || typeof req.characterId !== 'string' || typeof req.grantId !== 'string' || !Number.isInteger(req.expectedLevel))
    return fail('Reopen the level-up guide before confirming this advancement.');
  const found = characterInSession(sessionId, req.characterId); if (!found.ok) return found;
  const c = found.value, grant = pendingGrant(c, req.grantId, req.expectedLevel); if (!grant.ok) return grant;
  const choices = req.choices;
  if (!choices || typeof choices !== 'object' || !['fixed', 'roll'].includes(choices.hpMethod)) return fail('Choose fixed HP or roll your Hit Die.');
  const selection = selectedClass(c, choices.className, grant.value); if (!selection.ok) return selection;
  const { classes, entry } = selection.value, classSheet = classCharacter(c, entry);
  const subclass = chosenSubclass(classSheet, choices.subclass, entry.level + 1); if (!subclass.ok) return subclass;
  const planned = getLevelUpPlan(sessionId, c.id, subclass.value, entry.className); if (!planned.ok) return planned;
  const plan = planned.value, p = plan.progression;
  const nextClasses: ClassRosterEntry[] = plan.newClass ? [...classes, { className: p.classKey, level: 1 }] : classes.map(e => e.className === p.classKey ? { ...e, level: e.level + 1, ...(subclass.value ? { subclass: subclass.value } : {}) } : e);
  const candidate = { ...classSheet, level: p.level, subclass: subclass.value };
  if (grant.value.hpRoll !== undefined && choices.hpMethod !== 'roll') return fail('This Hit Die was already rolled. Use its recorded result for this level-up.');
  if (choices.hpMethod === 'roll' && grant.value.hpRoll === undefined) return fail('Roll the level-up Hit Die before continuing.');
  const beforeScores = permanentStats2024(c), modifiers = [...c.modifiers];
  const boost = (ability: AbilityKey, value: number, source: string, slot = false) => modifiers.push({
    id: newId(), source, target: { kind: 'ability', ability }, value, ...(slot ? { slot: true } : {}) });
  const asi = choices.asi ?? {}, entries = Object.entries(asi);
  if (entries.some(([ab, n]) => !ABILITIES.includes(ab as AbilityKey) || !Number.isInteger(n) || ![1, 2].includes(n!))) return fail('An ASI must be +2 to one score or +1 to two different scores.');
  const totalAsi = entries.reduce((sum, [, n]) => sum + n!, 0);
  if (p.featChoice) {
    if (totalAsi && choices.featName) return fail('Choose an ASI or one feat, not both.');
    if (!totalAsi && !choices.featName) return fail('Choose your ability score improvement or feat.');
    if (totalAsi !== 0 && totalAsi !== 2) return fail('Use both ASI points.');
  } else if (totalAsi || choices.featName) return fail('This level does not grant an ASI or feat.');
  for (const [ab, amount] of entries) {
    if (beforeScores[ab] === undefined || beforeScores[ab] + amount! > 20) return fail(`An ASI cannot raise ${ab} above 20. Fill in its base score first if it is missing.`);
    boost(ab as AbilityKey, amount!, `Level ${p.level} Ability Score Improvement`, true);
  }
  const legacyClass = classes.length === 1 ? classes[0].className : undefined;
  const added: SheetAbility[] = [], owned = new Set([...c.sheetAbilities.filter(a => belongsToClass(a, p.classKey, legacyClass)), ...c.abilities].map(a => key(a.name)));
  const add = (a: SheetAbility) => {
    const shared = a.tags?.includes('feat') || ['Unarmored Defense', 'Extra Attack'].includes(a.name);
    const existing = shared ? [...c.sheetAbilities, ...c.abilities].some(old => key(old.name) === key(a.name)) : owned.has(key(a.name));
    if (!existing) { owned.add(key(a.name)); added.push({ ...a, id: newId(), ...(!a.tags?.includes('feat') ? { sourceClass: p.classKey } : {}) }); }
  };
  let newTough = false, extraHp = 0;
  const saveProficiencies = [...c.saveProficiencies], skills = [...c.proficientSkills];
  if (choices.featName) {
    const feat = plan.feats.find(f => f.name === choices.featName);
    if (!feat) return fail('That feat is already owned or its 2024 prerequisites are not met.');
    if (feat.abilityChoices?.length) {
      if (!choices.featAbility || !feat.abilityChoices.includes(choices.featAbility)) return fail('Choose the feat’s ability score increase.');
      const score = beforeScores[choices.featAbility], cap = feat.category === 'Epic Boon' ? 30 : 20;
      if (score === undefined || score + (feat.abilityIncrease ?? 1) > cap) return fail(`${feat.name} cannot raise ${choices.featAbility} above ${cap}.`);
      boost(choices.featAbility, feat.abilityIncrease ?? 1, feat.name);
    } else if (choices.featAbility) return fail('This feat has no ability score increase.');
    if (feat.name === 'Resilient' && choices.featAbility && !saveProficiencies.includes(choices.featAbility)) saveProficiencies.push(choices.featAbility);
    newTough = feat.name === 'Tough';
    if (feat.name === 'Boon of Fortitude') extraHp += 40;
    const profile = feat.name === 'Savage Attacker' ? levelingFeature('Savage Attacker', c, p) : null;
    add({ ...(profile ?? {}), id: '', name: feat.name, type: profile?.type ?? 'ability', source: 'srd',
      school: 'Feat', tags: ['feat', feat.category, '2024', 'leveling-2024'], description: feat.description });
  }
  for (const capstone of p.capstoneBoosts) {
    const now = permanentStats2024({ ...c, modifiers })[capstone.ability] ?? 10;
    const amount = Math.max(0, Math.min(capstone.value, capstone.max - now));
    if (amount) boost(capstone.ability, amount, `${classTitle(p.classKey)} level 20`);
  }
  for (const feature of plan.features) {
    const ability = levelingFeature(feature.name, candidate, p);
    if (feature.name === 'Unarmored Defense' && [...c.sheetAbilities, ...c.abilities].some(a => /unarmored defense$/i.test(a.name))) {
      ability.name = `${classTitle(p.classKey)} Unarmored Defense`;
      ability.description = p.classKey === 'monk' ? 'While wearing no armor and wielding no Shield, choose AC 10 + Dexterity + Wisdom modifiers. Use only one AC calculation at a time; review the saved Armor Class with the DM.' : 'While wearing no armor, choose AC 10 + Dexterity + Constitution modifiers; a Shield may still be used. Use only one AC calculation at a time; review the saved Armor Class with the DM.';
    }
    add(ability);
  }
  for (const proficiency of plan.proficiencies) add({ id: '', name: `Proficiency: ${proficiency}`, type: 'ability', description: `Gained on entering ${classTitle(p.classKey)}.`, tags: ['proficiency', '2024', 'leveling-2024'] });
  const selections = choices.featureSelections ?? {};
  if (typeof selections !== 'object' || Array.isArray(selections)) return fail('Choose valid class features.');
  if (Object.values(selections).some(selected => !strings(selected))) return fail('Choose valid class feature option names.');
  const required = plan.featureChoices.filter(choice => !choice.when || selections[choice.when.key]?.includes(choice.when.option));
  if (choices.featName === 'Skilled') required.push({ key: 'skilled', label: 'Skilled proficiencies', count: 3,
    options: SKILLS.filter(s => !skills.includes(s.name)).map(s => ({ name: s.name, description: `Gain ${s.name} proficiency.` })) });
  if (Object.keys(selections).some(k => !required.some(r => r.key === k) && (selections[k]?.length ?? 0) > 0)) return fail('A class feature choice does not belong to this level.');
  for (const choice of required) {
    const selected = selections[choice.key] ?? [];
    if (!strings(selected) || selected.length !== choice.count || selected.some(n => !choice.options.some(o => o.name === n))) return fail(`Choose ${choice.count} valid ${choice.label} option${choice.count === 1 ? '' : 's'}.`);
    for (const name of selected) {
      if (['studentOfWar', 'bonusProficiencies', 'skilled', 'primalKnowledge', 'multiclassSkills'].includes(choice.key)) { if (!skills.includes(name)) skills.push(name); }
      else if (choice.key === 'multiclassTool') add({ id: '', name: `Proficiency: ${name}`, type: 'ability', description: `Gained on entering Bard.`, tags: ['proficiency', '2024', 'leveling-2024'] });
      else if (['warriorCantrips', 'orderCantrip'].includes(choice.key)) {
        if ((choices.cantripNames ?? []).some(selected => key(selected) === key(name))) return fail('Choose different cantrips for your class allowance and bonus cantrip feature.');
        const spell = getSpell(name)!;
        add({ ...spell, id: '', source: 'srd', prepared: false, classes: [p.classKey], tags: [...(spell.tags ?? []), 'bonus-cantrip', '2024', 'leveling-2024'],
          ...(spell.roll ? { roll: { ...spell.roll, castingAbility: p.classKey === 'paladin' ? 'CHA' : 'WIS' } } : {}) });
      } else add({ ...selectedFeatureAbility(choice.key, name, candidate), description: choice.options.find(o => o.name === name)!.description });
      if (choice.key === 'order') {
        if (['Thaumaturge', 'Magician'].includes(name)) for (const skill of name === 'Thaumaturge' ? ['Arcana', 'Religion'] : ['Arcana', 'Nature']) modifiers.push({ id: newId(), source: `${classTitle(p.classKey)} ${name} (2024 level-up)`, target: { kind: 'skill', skill }, value: Math.max(1, abilityMod(beforeScores.WIS)) });
        else for (const proficiency of ['Martial weapons', name === 'Protector' ? 'Heavy armor' : 'Medium armor']) add({ id: '', name: `Proficiency: ${proficiency}`, type: 'ability', description: `Gained from ${name}.`, tags: ['proficiency', '2024', 'leveling-2024'] });
      }
      if (choice.key === 'expertise') {
        if (!skills.includes(name)) return fail('Expertise requires proficiency in the selected skill.');
        modifiers.push({ id: newId(), source: `Expertise: ${name} (2024 level-up)`, target: { kind: 'skill', skill: name }, value: p.proficiencyBonus });
      }
    }
  }
  // Refresh only passives created by this guide; a customized modifier keeps its value.
  for (const m of modifiers) if (/^Expertise: .+ \(2024 level-up\)$/.test(m.source) && m.target.kind === 'skill' && m.value === plan.previous.proficiencyBonus) m.value = p.proficiencyBonus;
  const learned = choices.spellNames ?? [], cantrips = choices.cantripNames ?? [], replacements = choices.replaceSpellIds ?? [];
  if (!strings(learned) || !strings(cantrips) || !strings(replacements)) return fail('Choose unique spell names and replacement IDs.');
  if (replacements.length > plan.spellChoices.replacementLimit) return fail('You can replace at most one existing class spell at this level.');
  const spellClass = ['fighter', 'rogue'].includes(p.classKey) ? 'wizard' : p.classKey;
  const alwaysPrepared = alwaysPreparedSpells2024(p.classKey, subclass.value, p.level);
  for (const id of replacements) {
    const a = c.sheetAbilities.find(s => s.id === id);
    const lists = p.classKey === 'bard' && p.level >= 10 ? ['bard', 'cleric', 'druid', 'wizard'] : [spellClass];
    if (!a || !belongsToClass(a, p.classKey, legacyClass) || a.type !== 'spell' || (a.level ?? 0) === 0 || !(a.classes ?? []).some(list => lists.includes(list)) || alwaysPrepared.some(name => key(name) === key(a.name)) || a.tags?.some(t => ['feat', 'always-prepared', 'subclass-spell'].includes(t))) return fail('Only an eligible existing class spell can be replaced.');
  }
  const budget = plan.spellChoices.newSpells + replacements.length;
  if (learned.length < replacements.length || learned.length > budget || plan.spellChoices.spellSelectionRequired && learned.length !== budget) return fail(`Choose ${budget} new leveled spell${budget === 1 ? '' : 's'} for this level.`);
  if (cantrips.length !== plan.spellChoices.newCantrips) return fail(`Choose ${plan.spellChoices.newCantrips} new cantrip${plan.spellChoices.newCantrips === 1 ? '' : 's'}.`);
  for (const [names, isCantrip] of [[learned, false], [cantrips, true]] as const) for (const name of names) {
    const available = plan.spells.find(s => key(s.name) === key(name) && ((s.level === 0) === isCantrip));
    const spell = available ? getSpell(available.name) : null;
    if (!spell) return fail(`${name} is not an available class spell at this level.`);
    const castingAbility = ['cleric', 'druid', 'ranger'].includes(p.classKey) ? 'WIS' : ['wizard', 'fighter', 'rogue'].includes(p.classKey) ? 'INT' : 'CHA';
    add({ ...spell, id: '', source: 'srd', prepared: !isCantrip && p.classKey !== 'wizard', tags: [...new Set([...(spell.tags ?? []), '2024', 'leveling-2024'])],
      ...(spell.roll ? { roll: { ...spell.roll, castingAbility } } : {}) });
  }
  if (p.features.includes('Evocation Savant') && learned.filter(n => getSpell(n)?.school === 'Evocation' && (getSpell(n)?.level ?? 0) <= 2).length < 2) return fail('Evocation Savant requires two added Evocation Wizard spells of level 1 or 2.');
  if (p.classKey === 'wizard' && key(subclass.value) === 'evoker' && p.level > 3 && p.maxSpellLevel > plan.previous.maxSpellLevel && !learned.some(n => getSpell(n)?.school === 'Evocation')) return fail('Evocation Savant requires one additional Evocation Wizard spell when you gain access to a new slot level.');
  if (p.classKey === 'rogue' && key(subclass.value) === 'arcane trickster' && p.level === 3 && !owned.has(key('Mage Hand'))) return fail('An Arcane Trickster must choose Mage Hand among their new cantrips.');
  const afterScores = permanentStats2024({ ...c, modifiers });
  for (const modifier of modifiers) if (/^(Cleric Thaumaturge|Druid Magician) \(2024 level-up\)$/.test(modifier.source) && modifier.target.kind === 'skill' && modifier.value === Math.max(1, abilityMod(beforeScores.WIS))) modifier.value = Math.max(1, abilityMod(afterScores.WIS));
  const existingTough = [...c.sheetAbilities, ...c.abilities].some(a => key(a.name) === 'tough') || c.modifiers.some(m => key(m.source) === 'tough');
  for (const name of alwaysPrepared) {
    const spell = getSpell(name) ?? getAllSpells().find(s => key(s.name) === key(name));
    if (!spell) { plan.warnings.push(`${name} is always prepared but is not in the bundled spell catalog. Add its 2024 definition from your rules source.`); continue; }
    const castingAbility = ['cleric', 'druid', 'ranger'].includes(p.classKey) ? 'WIS' : ['wizard', 'fighter', 'rogue'].includes(p.classKey) ? 'INT' : 'CHA';
    add({ ...spell, id: '', source: 'srd', prepared: true, classes: [p.classKey],
      tags: [...new Set([...(spell.tags ?? []), 'always-prepared', 'subclass-spell', '2024', 'leveling-2024'])],
      ...(spell.roll ? { roll: { ...spell.roll, castingAbility } } : {}) });
  }
  let hpGain = hpIncrease2024({ oldLevel: c.level, hitDieFace: choices.hpMethod === 'roll' ? grant.value.hpRoll! : p.fixedHp,
    oldConMod: abilityMod(beforeScores.CON ?? 10), newConMod: abilityMod(afterScores.CON ?? 10), existingTough, newTough }) + extraHp;
  if (p.classKey === 'sorcerer' && key(subclass.value) === 'draconic sorcery' && p.level >= 3) hpGain += p.level === 3 ? 3 : 1;
  const resources = mergeProgressionCounters(c.resources, multiclassResourceMaxima(nextClasses, afterScores), multiclassResourceMaxima(classes, beforeScores), { renames: resourceRenames(classes, nextClasses) });
  const spellSlots = mergeProgressionCounters(c.spellSlots, multiclassSpellSlots2024(nextClasses), multiclassSpellSlots2024(classes), pactTransfer(c, classes, nextClasses));
  if (choices.featName === 'Boon of Recovery') {
    resources['Boon of Recovery (Last Stand)'] ??= { max: 1, used: 0, recharge: 'long' };
    resources['Boon of Recovery (d10s)'] ??= { max: 10, used: 0, recharge: 'long' };
  }
  const keptAbilities = c.sheetAbilities.filter(a => !replacements.includes(a.id)).map(a => {
    const oldChannelOwners = classes.filter(e => (classProgression2024(e.className, e.level, e.subclass)?.resourceMaxima['Channel Divinity'] ?? 0) > 0);
    const counterOwner = a.useCounter?.name === 'Channel Divinity' && oldChannelOwners.length === 1 ? oldChannelOwners[0].className : undefined;
    const sourceClass = a.sourceClass ?? counterOwner ?? (nextClasses.length > 1 ? legacyClass : undefined);
    const withSource = { ...a, ...(sourceClass && !a.tags?.includes('feat') ? { sourceClass } : {}) };
    const counterName = a.useCounter && sourceClass ? resourceNameForClass(nextClasses, sourceClass, a.useCounter.name) : undefined;
    const preparedAbility = counterName ? { ...withSource, useCounter: { ...a.useCounter!, name: counterName } } : withSource;
    if (belongsToClass(a, p.classKey, legacyClass) && alwaysPrepared.some(name => key(name) === key(a.name)) && a.type === 'spell')
      return { ...preparedAbility, prepared: true, tags: [...new Set([...(a.tags ?? []), 'always-prepared'])] };
    return preparedAbility;
  });
  const addedAbilities = added.map(a => a.useCounter ? { ...a, useCounter: { ...a.useCounter, name: resourceNameForClass(nextClasses, p.classKey, a.useCounter.name) } } : a);
  const maxHp = Math.max(1, c.maxHp + hpGain), curHp = c.curHp > 0 ? Math.max(1, Math.min(maxHp, c.curHp + hpGain)) : 0;
  return success({ patch: { level: grant.value.toLevel, subclass: nextClasses[0].subclass ?? c.subclass, maxHp, curHp, modifiers, spellSlots, resources,
    sheetAbilities: [...keptAbilities, ...addedAbilities], proficientSkills: skills, saveProficiencies },
    plan, choices: structuredClone({ ...choices, className: p.classKey }), additions: added.map(a => a.name), hpGain: maxHp - c.maxHp, resources, classes: nextClasses,
    hitDiceUsedByDie: allocateHitDiceUsed(classes, c.hitDiceUsed ?? 0, c.hitDiceUsedByDie) });
}

function applyPrepared(c: Character, prepared: Prepared): Character {
  updateCharacter(c.id, prepared.patch, { skipRosterSync: true });
  db.prepare('UPDATE characters SET hit_dice_used_by_die = ? WHERE id = ?').run(JSON.stringify(prepared.hitDiceUsedByDie), c.id);
  putState(c.id, { ...state(c), classes: prepared.classes });
  const p = prepared.plan.progression;
  if (p.superiorityDie && (!c.superiorityDie || c.superiorityDie === prepared.plan.previous.superiorityDie))
    db.prepare('UPDATE characters SET superiority_die = ? WHERE id = ?').run(p.superiorityDie, c.id);
  return getCharacter(c.id)!;
}
function describePreview(before: Character, after: Character, prepared: Prepared): LevelUpPreview {
  const oldScores = permanentStats2024(before), newScores = permanentStats2024(after);
  const needsAcReview = oldScores.DEX !== newScores.DEX || prepared.plan.progression.classKey === 'barbarian' && oldScores.CON !== newScores.CON || prepared.plan.progression.classKey === 'monk' && oldScores.WIS !== newScores.WIS;
  return { classes: prepared.classes, fromLevel: before.level, toLevel: after.level, hpGain: prepared.hpGain,
    maxHpBefore: before.maxHp, maxHpAfter: after.maxHp, curHpAfter: after.curHp,
    proficiencyBefore: prepared.plan.previous.proficiencyBonus, proficiencyAfter: prepared.plan.progression.proficiencyBonus,
    statChanges: ABILITIES.filter(ab => oldScores[ab] !== newScores[ab]).map(ability => ({ ability, before: oldScores[ability] ?? 10, after: newScores[ability] ?? 10 })),
    addedAbilities: prepared.additions, spellSlots: after.spellSlots, resources: after.resources, warnings: [...prepared.plan.warnings, ...(needsAcReview ? ['An ability score used by some armor or Unarmored Defense formulas changed. Review Armor Class with the DM; the saved AC is preserved.'] : [])] };
}
class PreviewOnly extends Error { constructor(public value: LevelUpPreview) { super('Preview only'); } }
export function previewLevelUp(sessionId: string, req: LevelUpCommitRequest): LevelUpResult<LevelUpPreview> {
  const prepared = prepareLevelUp(sessionId, req); if (!prepared.ok) return prepared;
  const c = getCharacter(req.characterId)!;
  try { db.transaction(() => { const after = applyPrepared(c, prepared.value); throw new PreviewOnly(describePreview(c, after, prepared.value)); })(); }
  catch (e) { if (e instanceof PreviewOnly) return success(e.value); throw e; }
  return fail('The level-up preview could not be prepared.');
}
export function applyLevelUp(sessionId: string, req: LevelUpCommitRequest): LevelUpResult<Character> {
  if (!req || typeof req !== 'object' || typeof req.characterId !== 'string' || typeof req.grantId !== 'string') return fail('Reopen the level-up guide before confirming this advancement.');
  const found = characterInSession(sessionId, req.characterId); if (!found.ok) return found;
  if (state(found.value).history.some(h => h.id === req.grantId)) return found;
  return db.transaction(() => {
    const prepared = prepareLevelUp(sessionId, req); if (!prepared.ok) return prepared;
    const c = getCharacter(req.characterId)!, after = applyPrepared(c, prepared.value);
    const { pending: _pending, ...previous } = state(after);
    const updated = putState(c.id, { ...previous, history: [...previous.history, {
      id: req.grantId, fromLevel: c.level, toLevel: after.level, hpGain: prepared.value.hpGain,
      at: Date.now(), choices: prepared.value.choices,
    }] });
    return success(updated);
  })();
}
