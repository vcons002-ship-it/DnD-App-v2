import { createHash } from 'node:crypto';
import { db, newId } from './db.js';
import { addRollLog, getCharacter, updateCharacter } from './sessions.js';
import { getAllSpells, getSpell } from './spells/srd.js';
import { diceReveal } from '../../shared/rollReveal.js';
import { rollDice } from '../../shared/dice.js';
import { abilityMod, SKILLS, type AbilityKey } from '../../shared/skills.js';
import {
  classProgression2024, hpIncrease2024, permanentStats2024, subclassChoices2024,
  subclassFeatures2024, alwaysPreparedSpells2024,
} from '../../shared/characterProgression.js';
import type { Character, SheetAbility, SheetModifier } from '../../shared/types.js';
import type {
  CharacterLeveling, LevelUpChoices, LevelUpCommitRequest, LevelUpPlan,
  LevelUpPreview, LevelUpResult, PendingLevelUp,
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
  if (!classProgression2024(c.className, c.level))
    return fail('The 2024 guide supports a single core class. Use the DM sheet editor for multiclass or homebrew advancement.');
  if (c.level >= 20) return fail(`${c.name} is already level 20.`);
  const leveling = state(c);
  if (leveling.pending && leveling.pending.fromLevel === c.level) return success(c);
  return success(putState(c.id, { ...leveling, pending: {
    id: newId(), fromLevel: c.level, toLevel: c.level + 1,
    approvedAt: Date.now(), baseFingerprint: levelUpFingerprint(c),
  } }));
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
export function getLevelUpPlan(sessionId: string, characterId: string, subclass?: string): LevelUpResult<LevelUpPlan> {
  const found = characterInSession(sessionId, characterId); if (!found.ok) return found;
  const c = found.value, grant = pendingGrant(c); if (!grant.ok) return grant;
  // Before choosing a new level-3 subclass the initial plan must remain usable.
  const selected = !c.subclass && !subclass ? success('') : chosenSubclass(c, subclass, grant.value.toLevel);
  if (!selected.ok) return selected;
  const candidate = { ...c, subclass: selected.value };
  const scores = permanentStats2024(c);
  const progression = classProgression2024(c.className, grant.value.toLevel, selected.value, scores);
  const previous = classProgression2024(c.className, c.level, c.subclass, scores);
  if (!progression || !previous) return fail('This class or level needs manual advancement in the DM sheet editor.');
  const owned = new Set([...c.sheetAbilities, ...c.abilities].map(a => key(a.name)));
  const classList = progression.classKey === 'fighter' || progression.classKey === 'rogue' ? 'wizard' : progression.classKey;
  const grantedSpellNames = new Set(alwaysPreparedSpells2024(c.className, selected.value, progression.level).map(key));
  const spellLists = progression.classKey === 'bard' && progression.level >= 10 ? ['bard', 'cleric', 'druid', 'wizard'] : [classList];
  const all = getAllSpells().filter(s => s.type === 'spell' && (s.classes ?? []).some(list => ((s.level ?? 0) === 0 ? [classList] : spellLists).includes(list)) && (s.level ?? 0) <= progression.maxSpellLevel);
  const spells = all.filter(s => !owned.has(key(s.name)) && !grantedSpellNames.has(key(s.name))).map(s => ({ name: s.name, level: s.level ?? 0, school: s.school, description: s.description }));
  const newCantrips = Math.max(0, progression.cantrips - previous.cantrips);
  const inheritedCasters = ['bard', 'sorcerer', 'ranger', 'warlock'].includes(progression.classKey) || /eldritch knight|arcane trickster/i.test(selected.value);
  let newSpells = progression.classKey === 'wizard' ? 2 : Math.max(0, progression.preparedSpells - previous.preparedSpells);
  // The Evoker's two starting Savant spells are additional to normal level-up spells.
  if (progression.features.includes('Evocation Savant')) newSpells += 2;
  const savantExtra = progression.classKey === 'wizard' && key(selected.value) === 'evoker' && progression.level > 3 && progression.maxSpellLevel > previous.maxSpellLevel;
  if (savantExtra) newSpells++;
  const warnings = [...progression.choiceNotes,
    'Situational class features are recorded as 2024 notes. Existing customized abilities are preserved; only reviewed numeric effects are applied automatically.'];
  if (c.weapons.some(w => w.attackBonus !== undefined || /\d\s*[+-]\s*\d/.test(w.damage ?? '')))
    warnings.push('Saved fixed weapon attack bonuses or flat damage remain unchanged. Review those weapons after proficiency or ability scores increase; automatic weapons use the new live modifiers.');
  if (selected.value && !subclassChoices2024(c.className).some(s => key(s) === key(selected.value)))
    warnings.push(`The saved ${selected.value} subclass is preserved. Review its level-${progression.level} features with the DM.`);
  else if (selected.value && progression.features.some(n => n === 'Subclass feature' || /Subclass$/.test(n)) && !subclassFeatures2024(c.className, selected.value, progression.level).length)
    warnings.push(`${selected.value} has additional subclass choices to review with the DM; the guide does not invent unlisted features.`);
  const features = progression.features.filter(n => !['Ability Score Improvement', 'Epic Boon', 'Subclass feature'].includes(n) && !/Subclass$/.test(n))
    .map(name => ({ name, description: levelingFeature(name, candidate, progression).description, existing: owned.has(key(name)) }));
  return success({ grant: grant.value, progression, previous, features,
    feats: eligibleLevelingFeats(c, progression, scores), spells,
    featureChoices: featureChoices2024(candidate, progression), warnings,
    spellChoices: { newSpells, newCantrips, replacementLimit: inheritedCasters ? 1 : 0,
      spellSelectionRequired: progression.classKey === 'wizard' || inheritedCasters,
      cantripSelectionRequired: true } });
}

/** One physical HP roll per grant. The face is durable before the player confirms. */
export function rollLevelUpHp(sessionId: string, roller: string, characterId: string, grantId: string): LevelUpResult<Character> {
  const found = characterInSession(sessionId, characterId); if (!found.ok) return found;
  const c = found.value, pending = pendingGrant(c, grantId); if (!pending.ok) return pending;
  if (pending.value.hpRoll !== undefined) return success(c);
  const p = classProgression2024(c.className, pending.value.toLevel, c.subclass);
  if (!p) return fail('The HP die could not be determined for this class.');
  const rolled = rollDice(`1d${p.hitDie}`); if (!rolled) return fail('The HP die could not be rolled.');
  const con = abilityMod(permanentStats2024(c).CON ?? 10), gain = Math.max(1, rolled.total + con);
  const entry = addRollLog(sessionId, { roller, label: 'Level-up HP', expr: rolled.expr, total: gain,
    detail: `${c.name} — level ${p.level} HP: ${rolled.total} ${con >= 0 ? '+' : '−'} ${Math.abs(con)} CON = ${gain} (minimum 1). Confirm the level-up to apply it.`,
    reveal: { ...diceReveal(c.name, rolled, `Level ${p.level} — Hit Point Increase`), damage: gain,
      damageMods: [{ label: 'Constitution', value: con }, ...(gain !== rolled.total + con ? [{ label: 'Minimum 1 HP', value: gain - rolled.total - con }] : [])] } });
  return success(putState(c.id, { ...state(c), pending: { ...pending.value, hpRoll: rolled.total, hpRollId: entry.id } }));
}

type Prepared = { patch: Parameters<typeof updateCharacter>[1]; plan: LevelUpPlan; choices: LevelUpChoices; additions: string[]; hpGain: number; resources: Character['resources'] };
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
  const subclass = chosenSubclass(c, choices.subclass, grant.value.toLevel); if (!subclass.ok) return subclass;
  const planned = getLevelUpPlan(sessionId, c.id, subclass.value); if (!planned.ok) return planned;
  const plan = planned.value, p = plan.progression;
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
  const added: SheetAbility[] = [], owned = new Set([...c.sheetAbilities, ...c.abilities].map(a => key(a.name)));
  const add = (a: SheetAbility) => { if (!owned.has(key(a.name))) { owned.add(key(a.name)); added.push({ ...a, id: newId() }); } };
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
    if (amount) boost(capstone.ability, amount, `${c.className} level 20`);
  }
  for (const feature of plan.features) add(levelingFeature(feature.name, { ...c, subclass: subclass.value }, p));
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
      if (['studentOfWar', 'bonusProficiencies', 'skilled', 'primalKnowledge'].includes(choice.key)) { if (!skills.includes(name)) skills.push(name); }
      else if (choice.key === 'warriorCantrips') {
        const spell = getSpell(name)!;
        add({ ...spell, id: '', source: 'srd', prepared: false, classes: [p.classKey], tags: [...(spell.tags ?? []), 'bonus-cantrip', '2024', 'leveling-2024'],
          ...(spell.roll ? { roll: { ...spell.roll, castingAbility: p.classKey === 'paladin' ? 'CHA' : 'WIS' } } : {}) });
      } else add({ ...selectedFeatureAbility(choice.key, name, c), description: choice.options.find(o => o.name === name)!.description });
      if (choice.key === 'expertise') modifiers.push({ id: newId(), source: `Expertise: ${name} (2024 level-up)`, target: { kind: 'skill', skill: name }, value: p.proficiencyBonus });
    }
  }
  // Refresh only passives created by this guide; a customized modifier keeps its value.
  for (const m of modifiers) if (/^Expertise: .+ \(2024 level-up\)$/.test(m.source) && m.target.kind === 'skill' && m.value === plan.previous.proficiencyBonus) m.value = p.proficiencyBonus;
  const learned = choices.spellNames ?? [], cantrips = choices.cantripNames ?? [], replacements = choices.replaceSpellIds ?? [];
  if (!strings(learned) || !strings(cantrips) || !strings(replacements)) return fail('Choose unique spell names and replacement IDs.');
  if (replacements.length > plan.spellChoices.replacementLimit) return fail('You can replace at most one existing class spell at this level.');
  const spellClass = ['fighter', 'rogue'].includes(p.classKey) ? 'wizard' : p.classKey;
  const alwaysPrepared = alwaysPreparedSpells2024(c.className, subclass.value, p.level);
  for (const id of replacements) {
    const a = c.sheetAbilities.find(s => s.id === id);
    const lists = p.classKey === 'bard' && p.level >= 10 ? ['bard', 'cleric', 'druid', 'wizard'] : [spellClass];
    if (!a || a.type !== 'spell' || (a.level ?? 0) === 0 || !(a.classes ?? []).some(list => lists.includes(list)) || alwaysPrepared.some(name => key(name) === key(a.name)) || a.tags?.some(t => ['feat', 'always-prepared', 'subclass-spell'].includes(t))) return fail('Only an eligible existing class spell can be replaced.');
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
  const resources = { ...c.resources };
  const previousResources = classProgression2024(c.className, c.level, c.subclass, beforeScores)?.resourceMaxima ?? {};
  const nextResources = classProgression2024(c.className, p.level, subclass.value, afterScores)!.resourceMaxima;
  for (const [name, max] of Object.entries(nextResources)) {
    const cur = resources[name];
    if (!cur || !cur.maxOverride && (cur.maxOverride === false || cur.max === previousResources[name]))
      resources[name] = { ...cur, max, used: Math.min(cur?.used ?? 0, max) };
  }
  if (choices.featName === 'Boon of Recovery') {
    resources['Boon of Recovery (Last Stand)'] ??= { max: 1, used: 0, recharge: 'long' };
    resources['Boon of Recovery (d10s)'] ??= { max: 10, used: 0, recharge: 'long' };
  }
  const keptAbilities = c.sheetAbilities.filter(a => !replacements.includes(a.id)).map(a => {
    if (alwaysPrepared.some(name => key(name) === key(a.name)) && a.type === 'spell')
      return { ...a, prepared: true, tags: [...new Set([...(a.tags ?? []), 'always-prepared'])] };
    return a;
  });
  const maxHp = Math.max(1, c.maxHp + hpGain), curHp = c.curHp > 0 ? Math.max(1, Math.min(maxHp, c.curHp + hpGain)) : 0;
  return success({ patch: { level: p.level, subclass: subclass.value, maxHp, curHp, modifiers,
    sheetAbilities: [...keptAbilities, ...added], proficientSkills: skills, saveProficiencies },
    plan, choices: structuredClone(choices), additions: added.map(a => a.name), hpGain: maxHp - c.maxHp, resources });
}

function applyPrepared(c: Character, prepared: Prepared): Character {
  updateCharacter(c.id, prepared.patch);
  // updateCharacter handles automatic slot progression and Pact usage transfer.
  db.prepare('UPDATE characters SET resources = ? WHERE id = ?').run(JSON.stringify(prepared.resources), c.id);
  const p = prepared.plan.progression;
  if (p.superiorityDie && (!c.superiorityDie || c.superiorityDie === prepared.plan.previous.superiorityDie))
    db.prepare('UPDATE characters SET superiority_die = ? WHERE id = ?').run(p.superiorityDie, c.id);
  return getCharacter(c.id)!;
}
function describePreview(before: Character, after: Character, prepared: Prepared): LevelUpPreview {
  const oldScores = permanentStats2024(before), newScores = permanentStats2024(after);
  const needsAcReview = oldScores.DEX !== newScores.DEX || prepared.plan.progression.classKey === 'barbarian' && oldScores.CON !== newScores.CON || prepared.plan.progression.classKey === 'monk' && oldScores.WIS !== newScores.WIS;
  return { fromLevel: before.level, toLevel: after.level, hpGain: prepared.hpGain,
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
    const { pending: _pending, ...previous } = state(c);
    const updated = putState(c.id, { ...previous, history: [...previous.history, {
      id: req.grantId, fromLevel: c.level, toLevel: after.level, hpGain: prepared.value.hpGain,
      at: Date.now(), choices: prepared.value.choices,
    }] });
    return success(updated);
  })();
}
