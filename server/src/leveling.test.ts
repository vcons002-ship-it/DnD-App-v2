import { afterEach, describe, expect, it } from 'vitest';
import { db } from './db.js';
import {
  applyDamage, claimCharacter, createCharacter, createMap, createSession, getCharacter,
  listRollLog, setActiveMap, setCondition, setResource, setSheetAbility, updateCharacter,
} from './sessions.js';
import { applyLevelUp, cancelLevelUp, getLevelUpPlan, grantLevelUp, previewLevelUp, rollLevelUpHp } from './leveling.js';
import { registerSocketHandlers } from './socketHandlers.js';
import { dropConn, setConn, type IOServer } from './connections.js';
import { withDiceSource } from '../../shared/dice.js';
import { runLiveCommand } from './liveRolls.js';
import { permanentStats2024 } from '../../shared/characterProgression.js';
import { applyRulesUpdate, isOutdated } from '../../shared/rulesUpdate.js';
import { getManeuver } from './maneuvers/srd.js';
import type { Character } from '../../shared/types.js';
import type { LevelUpChoices, LevelUpCommitRequest, LevelUpPlan } from '../../shared/levelingTypes.js';

const stats = { STR: 16, DEX: 14, CON: 14, INT: 12, WIS: 12, CHA: 14 };
function setup(className = 'Fighter', level = 1, subclass = '') {
  const s = createSession('Level-up test');
  const c = createCharacter(s.id, { name: 'Adventurer', className, level, subclass, stats, maxHp: 30 });
  return { s, c };
}
function pending(sid: string, c: Character) {
  const result = grantLevelUp(sid, c.id); if (!result.ok) throw new Error(result.error);
  return result.value.leveling!.pending!;
}
const request = (sid: string, c: Character, choices: LevelUpChoices = { hpMethod: 'fixed' }): LevelUpCommitRequest => ({
  characterId: c.id, expectedLevel: c.level, grantId: pending(sid, c).id, choices,
});
function plan(sid: string, c: Character, subclass?: string): LevelUpPlan {
  const r = getLevelUpPlan(sid, c.id, subclass); if (!r.ok) throw new Error(r.error); return r.value;
}
function apply(sid: string, req: LevelUpCommitRequest): Character {
  const r = applyLevelUp(sid, req); if (!r.ok) throw new Error(r.error); return r.value;
}
const fixed = <T>(face: number, run: () => T): T => withDiceSource(sides => sides.map(() => face), run);

describe('durable level-up grants and authoritative HP', () => {
  it('retains portable rules and receipts on import without replacing or completing the current pending grant', () => {
    const { s, c } = setup();
    const advanced = apply(s.id, request(s.id, c));
    const grant = pending(s.id, advanced), receipt = advanced.leveling!.history[0];
    const incoming = { rules: '2024' as const,
      pending: { ...grant, id: 'client-supplied-grant', hpRoll: 10 },
      history: [ { ...receipt, hpGain: 100 }, { ...receipt, id: grant.id, fromLevel: 2, toLevel: 3 } ] };
    updateCharacter(c.id, { leveling: incoming });
    const imported = getCharacter(c.id)!;
    expect(imported.leveling!.pending).toEqual(grant);
    expect(imported.leveling!.history).toEqual([receipt]);
    const committed = apply(s.id, { characterId: c.id, expectedLevel: 2, grantId: grant.id,
      choices: { hpMethod: 'fixed', subclass: 'Champion' } });
    expect(committed.level).toBe(3);
    expect(committed.leveling!.history).toHaveLength(2);
    expect(committed.maxHp).toBe(46);
    const fresh = createCharacter(s.id, { name: 'Imported copy', className: 'Fighter', stats, level: 3,
      leveling: committed.leveling });
    expect(fresh.leveling).toEqual({ rules: '2024', classes: committed.leveling!.classes, history: committed.leveling!.history });
    expect(fresh.leveling!.pending).toBeUndefined();
  });
  it('grants one level without changing HP or resource spending; repeating the grant is idempotent', () => {
    const { s, c } = setup();
    updateCharacter(c.id, { curHp: 9, tempHp: 7 }); setResource(c.id, 'resources', 'Second Wind', { used: 1 });
    const one = pending(s.id, c), two = pending(s.id, getCharacter(c.id)!);
    expect(two.id).toBe(one.id);
    expect(getCharacter(c.id)).toMatchObject({ level: 1, maxHp: 30, curHp: 9, tempHp: 7, resources: { 'Second Wind': { used: 1 } } });
  });
  it('rejects level 20, unsupported multiclass and incomplete old sheets without mutating them', () => {
    for (const [className, level] of [['Fighter', 20], ['Fighter / Wizard', 3], ['Artificer', 3]] as const) {
      const { s, c } = setup(className, level); expect(grantLevelUp(s.id, c.id).ok).toBe(false); expect(getCharacter(c.id)?.leveling).toBeUndefined();
    }
    const s = createSession('Old sheet'), c = createCharacter(s.id, { name: 'No scores', className: 'Fighter' });
    expect(grantLevelUp(s.id, c.id)).toMatchObject({ ok: false, error: expect.stringContaining('CON') });
  });
  it('previews on a rollback-only transaction then applies once, preserving wounds and spent counters', () => {
    const { s, c } = setup(); updateCharacter(c.id, { curHp: 9 }); setResource(c.id, 'resources', 'Second Wind', { used: 1 });
    const req = request(s.id, c), before = getCharacter(c.id)!;
    const preview = previewLevelUp(s.id, req); expect(preview).toMatchObject({ ok: true, value: { hpGain: 8, maxHpAfter: 38, curHpAfter: 17, resources: { 'Second Wind': { used: 1 } } } });
    expect(getCharacter(c.id)).toEqual(before);
    const after = apply(s.id, req); expect(after).toMatchObject({ level: 2, maxHp: 38, curHp: 17, resources: { 'Second Wind': { used: 1 }, 'Action Surge': { max: 1, used: 0 } } });
    expect(after.sheetAbilities.map(a => a.name)).toContain('Action Surge');
    expect(apply(s.id, req)).toEqual(after); expect(after.leveling!.history).toHaveLength(1);
  });
  it('rolls one authoritative Hit Die, stores it durably, and cannot reroll or switch to fixed HP', () => {
    const { s, c } = setup(); const grant = pending(s.id, c);
    expect(fixed(4, () => rollLevelUpHp(s.id, c.name, c.id, grant.id))).toMatchObject({ ok: true, value: { leveling: { pending: { hpRoll: 4 } } } });
    const recorded = getCharacter(c.id)!; expect(recorded.level).toBe(1); expect(recorded.maxHp).toBe(30);
    expect(listRollLog(s.id)).toHaveLength(1); expect(listRollLog(s.id)[0].reveal?.damageDice?.[0]).toMatchObject({ label: '1d10', faces: [4] });
    fixed(10, () => rollLevelUpHp(s.id, c.name, c.id, grant.id)); expect(listRollLog(s.id)).toHaveLength(1);
    expect(applyLevelUp(s.id, { characterId: c.id, grantId: grant.id, expectedLevel: 1, choices: { hpMethod: 'fixed' } }).ok).toBe(false);
    expect(apply(s.id, { characterId: c.id, grantId: grant.id, expectedLevel: 1, choices: { hpMethod: 'roll' } }).maxHp).toBe(36);
  });
  it('requires a recorded HP roll and enforces a minimum 1 HP increase', () => {
    const { s, c } = setup(); updateCharacter(c.id, { stats: { ...stats, CON: 3 } });
    const current = getCharacter(c.id)!, req = request(s.id, current, { hpMethod: 'roll' });
    expect(applyLevelUp(s.id, req).ok).toBe(false);
    fixed(1, () => rollLevelUpHp(s.id, current.name, c.id, req.grantId)); expect(apply(s.id, req).maxHp).toBe(31);
  });
  it('preserves 0 HP and dead state while max HP grows; no rest or revival is granted', () => {
    for (const damage of [30, 200]) {
      const { s, c } = setup(); applyDamage('pc', c.id, damage);
      db.prepare('UPDATE characters SET hit_dice_used = 1 WHERE id = ?').run(c.id);
      const before = getCharacter(c.id)!, after = apply(s.id, request(s.id, before));
      expect(after.curHp).toBe(0); expect(after.maxHp).toBe(38); expect(after.deathSaves).toEqual(before.deathSaves);
      expect(after.conditions).toEqual(before.conditions); expect(after.hitDiceUsed).toBe(1);
    }
  });
  it('rejects cross-campaign, stale grants, old levels and malformed intent', () => {
    const { s, c } = setup(), req = request(s.id, c), other = createSession('Other');
    expect(applyLevelUp(other.id, req).ok).toBe(false);
    expect(applyLevelUp(s.id, { ...req, expectedLevel: 9 }).ok).toBe(false);
    expect(applyLevelUp(s.id, { ...req, expectedLevel: undefined } as unknown as LevelUpCommitRequest).ok).toBe(false);
    updateCharacter(c.id, { stats: { ...stats, CON: 16 } }); expect(applyLevelUp(s.id, req)).toMatchObject({ ok: false, error: expect.stringContaining('sheet changed') });
    expect(cancelLevelUp(s.id, c.id, req.grantId).ok).toBe(true); expect(getCharacter(c.id)?.leveling?.pending).toBeUndefined();
  });
  it('does not make a pending level stale when wounds, spending or stance toggles change', () => {
    const { s, c } = setup();
    setSheetAbility('pc', c.id, { id: 'rage', name: 'Rage', type: 'stance', description: 'Custom', stance: { active: false, appliesTo: 'melee' } });
    const current = getCharacter(c.id)!, req = request(s.id, current);
    const abilities = getCharacter(c.id)!.sheetAbilities.map(a => ({ ...a, stance: a.stance ? { ...a.stance, active: true } : undefined }));
    updateCharacter(c.id, { sheetAbilities: abilities, curHp: 5, tempHp: 4 }); setResource(c.id, 'resources', 'Second Wind', { used: 2 });
    expect(applyLevelUp(s.id, req).ok).toBe(true);
    expect(getCharacter(c.id)).toMatchObject({ curHp: 13, tempHp: 4, resources: { 'Second Wind': { used: 2 } } });
  });
  it('rolls HP through the same rollback/replay command as live physical dice without applying speculative HP', async () => {
    const { s, c } = setup(), grant = pending(s.id, c);
    let physicalRolls = 0;
    await runLiveCommand(() => {
      const result = rollLevelUpHp(s.id, c.name, c.id, grant.id); expect(result.ok).toBe(true);
    }, () => {}, { roller: c.name, className: c.className, label: 'Level-up HP' }, async sides => {
      physicalRolls++; expect(sides).toEqual([10]);
      expect(getCharacter(c.id)!.leveling!.pending!.hpRoll).toBeUndefined();
      expect(getCharacter(c.id)!.maxHp).toBe(30); expect(listRollLog(s.id)).toHaveLength(0);
      return [5];
    });
    expect(physicalRolls).toBe(1); expect(getCharacter(c.id)!.leveling!.pending!.hpRoll).toBe(5);
    expect(listRollLog(s.id)).toHaveLength(1); expect(listRollLog(s.id)[0].reveal?.physical).toBe(true);
    expect(getCharacter(c.id)!.maxHp).toBe(30);
  });
});

describe('2024 numeric advancement and preserved custom sheets', () => {
  it('applies a CON ASI to every gained level, excludes equipment CON, and preserves wound deficit', () => {
    const { s, c } = setup('Fighter', 3, 'Champion');
    updateCharacter(c.id, { curHp: 12, items: [{ id: 'amulet', name: 'Amulet', qty: 1, note: '', equipped: true, modifiers: [{ id: 'item-con', source: 'Amulet', target: { kind: 'ability', ability: 'CON' }, value: 19, set: true }] }] });
    const current = getCharacter(c.id)!, after = apply(s.id, request(s.id, current, { hpMethod: 'fixed', asi: { CON: 2 } }));
    expect(after.maxHp).toBe(42); expect(after.curHp).toBe(24); expect(permanentStats2024(after).CON).toBe(16);
    expect(after.modifiers).toContainEqual(expect.objectContaining({ source: 'Level 4 Ability Score Improvement', slot: true, value: 2 }));
    expect(after.items).toEqual(current.items);
  });
  it('enforces exactly two ASI points and the score cap; permits a valid split', () => {
    const { s, c } = setup('Fighter', 3, 'Champion'); updateCharacter(c.id, { stats: { ...stats, STR: 19 } });
    const current = getCharacter(c.id)!, req = request(s.id, current);
    for (const asi of [{ STR: 2 }, { DEX: 1 }, { STR: 3 }, { NOPE: 2 }]) expect(previewLevelUp(s.id, { ...req, choices: { hpMethod: 'fixed', asi } } as LevelUpCommitRequest).ok).toBe(false);
    const after = apply(s.id, { ...req, choices: { hpMethod: 'fixed', asi: { STR: 1, CON: 1 } } }); expect(permanentStats2024(after)).toMatchObject({ STR: 20, CON: 15 });
  });
  it('adds retroactive Tough HP once and 2 HP on each later advancement', () => {
    const { s, c } = setup('Fighter', 3, 'Champion');
    const tough = apply(s.id, request(s.id, c, { hpMethod: 'fixed', featName: 'Tough' })); expect(tough.maxHp).toBe(46);
    const next = apply(s.id, request(s.id, tough)); expect(next.maxHp).toBe(56); expect(next.sheetAbilities.filter(a => a.name === 'Tough')).toHaveLength(1);
  });
  it('adds Resilient score and saving-throw proficiency and rejects ineligible or duplicate feats', () => {
    const { s, c } = setup('Fighter', 3, 'Champion'), req = request(s.id, c);
    expect(previewLevelUp(s.id, { ...req, choices: { hpMethod: 'fixed', featName: 'War Caster', featAbility: 'INT' } }).ok).toBe(false);
    expect(previewLevelUp(s.id, { ...req, choices: { hpMethod: 'fixed', featName: 'Resilient' } }).ok).toBe(false);
    const after = apply(s.id, { ...req, choices: { hpMethod: 'fixed', featName: 'Resilient', featAbility: 'WIS' } });
    expect(permanentStats2024(after).WIS).toBe(13); expect(after.saveProficiencies).toContain('WIS');
    expect(after.sheetAbilities.find(a => a.name === 'Resilient')?.tags).toContain('feat');
  });
  it('offers Epic Boons at 19 with the 30 score cap and adds Fortitude max HP', () => {
    const { s, c } = setup('Fighter', 18, 'Champion'); updateCharacter(c.id, { stats: { ...stats, CHA: 29 } });
    const current = getCharacter(c.id)!, req = request(s.id, current, { hpMethod: 'fixed', featName: 'Boon of Fortitude', featAbility: 'CHA' });
    expect(plan(s.id, current).feats).toContainEqual(expect.objectContaining({ name: 'Boon of Fortitude', category: 'Epic Boon' }));
    const after = apply(s.id, req); expect(after.maxHp).toBe(78); expect(permanentStats2024(after).CHA).toBe(30);
  });
  it('tracks separate 2024 Boon of Recovery benefits and never revives a downed PC on level-up', () => {
    const { s, c } = setup('Fighter', 18, 'Champion'); applyDamage('pc', c.id, 30);
    const current = getCharacter(c.id)!, after = apply(s.id, request(s.id, current, { hpMethod: 'fixed', featName: 'Boon of Recovery', featAbility: 'CON' }));
    expect(after.resources).toMatchObject({ 'Boon of Recovery (Last Stand)': { max: 1, used: 0, recharge: 'long' }, 'Boon of Recovery (d10s)': { max: 10, used: 0, recharge: 'long' } });
    expect(after.curHp).toBe(0); expect(after.sheetAbilities.find(a => a.name === 'Boon of Recovery')?.description).toMatch(/ten d10s/);
  });
  it('applies Barbarian and Monk capstones without exceeding their cap', () => {
    const { s, c } = setup('Barbarian', 19, 'Path of the Berserker'); updateCharacter(c.id, { stats: { ...stats, STR: 23, CON: 20 } });
    const current = getCharacter(c.id)!, after = apply(s.id, request(s.id, current)); expect(permanentStats2024(after)).toMatchObject({ STR: 25, CON: 24 }); expect(after.maxHp).toBe(82);
    const monk = setup('Monk', 19, 'Warrior of the Open Hand'); const m = apply(monk.s.id, request(monk.s.id, monk.c)); expect(permanentStats2024(m)).toMatchObject({ DEX: 18, WIS: 16 });
  });
  it('preserves explicit custom counter totals and spent standard uses while increasing a standard maximum', () => {
    const { s, c } = setup('Fighter', 3, 'Champion'); setResource(c.id, 'resources', 'Second Wind', { used: 2 });
    setResource(c.id, 'resources', 'Action Surge', { max: 7, used: 6 }); setResource(c.id, 'resources', 'Homebrew Luck', { max: 5, used: 4, recharge: 'short' });
    const current = getCharacter(c.id)!, after = apply(s.id, request(s.id, current, { hpMethod: 'fixed', asi: { STR: 2 } }));
    expect(after.resources).toMatchObject({ 'Second Wind': { max: 3, used: 2 }, 'Action Surge': { max: 7, used: 6 }, 'Homebrew Luck': { max: 5, used: 4, recharge: 'short' } });
  });
  it('preserves a customized feature instead of replacing it with a shipped definition', () => {
    const { s, c } = setup(); setSheetAbility('pc', c.id, { id: 'custom-surge', name: 'Action Surge', type: 'ability', description: 'Homebrew extra movement', source: 'custom' });
    const current = getCharacter(c.id)!, after = apply(s.id, request(s.id, current));
    expect(after.sheetAbilities.filter(a => a.name === 'Action Surge')).toEqual([current.sheetAbilities[0]]);
  });
});

describe('subclasses, spells and class choices', () => {
  it('allows an initial plan before subclass selection, then requires a valid level-3 subclass', () => {
    const { s, c } = setup('Fighter', 2), req = request(s.id, c);
    expect(plan(s.id, c).progression.subclassDue).toBe(true);
    expect(applyLevelUp(s.id, req).ok).toBe(false);
    expect(applyLevelUp(s.id, { ...req, choices: { hpMethod: 'fixed', subclass: 'Random invented subclass' } }).ok).toBe(false);
    const after = apply(s.id, { ...req, choices: { hpMethod: 'fixed', subclass: 'Champion' } });
    expect(after.subclass).toBe('Champion'); expect(after.sheetAbilities.map(a => a.name)).toContain('Improved Critical');
  });
  it('keeps an existing custom subclass and clearly warns that it needs manual feature review', () => {
    const { s, c } = setup('Fighter', 4, 'Rune Homebrew'), req = request(s.id, c);
    expect(plan(s.id, c).warnings.join(' ')).toMatch(/saved Rune Homebrew subclass/);
    expect(applyLevelUp(s.id, { ...req, choices: { hpMethod: 'fixed', subclass: 'Champion' } }).ok).toBe(false);
    expect(apply(s.id, req).subclass).toBe('Rune Homebrew');
  });
  it('requires three valid Battle Master maneuvers and a skill, creates usable maneuver profiles, and upgrades the die at 10', () => {
    const { s, c } = setup('Fighter', 2); updateCharacter(c.id, { proficientSkills: ['Athletics'] });
    const current = getCharacter(c.id)!, req = request(s.id, current, { hpMethod: 'fixed', subclass: 'Battle Master' });
    const p = plan(s.id, current, 'Battle Master'); expect(p.featureChoices.find(f => f.key === 'maneuvers')?.count).toBe(3);
    expect(applyLevelUp(s.id, req).ok).toBe(false);
    const after = apply(s.id, { ...req, choices: { ...req.choices, featureSelections: { maneuvers: ['Pushing Attack', 'Trip Attack', 'Riposte'], studentOfWar: ['Perception'] } } });
    expect(after.superiorityDie).toBe('d8'); expect(after.resources['Superiority Dice'].max).toBe(4); expect(after.proficientSkills).toContain('Perception');
    expect(after.sheetAbilities.find(a => a.name === 'Pushing Attack')?.type).toBe('maneuver');
    const high = setup('Fighter', 9, 'Battle Master'); const evolved = apply(high.s.id, request(high.s.id, high.c, { hpMethod: 'fixed', featureSelections: { maneuvers: ['Pushing Attack', 'Riposte'] } })); expect(evolved.superiorityDie).toBe('d10');
  });
  it('does not offer legacy rules updates for newly granted 2024 maneuvers, while legacy sheets still update', () => {
    const { s, c } = setup('Fighter', 2);
    const after = apply(s.id, request(s.id, c, { hpMethod: 'fixed', subclass: 'Battle Master',
      featureSelections: { maneuvers: ['Precision Attack', 'Lunging Attack', 'Riposte'], studentOfWar: ['Perception'] } }));
    for (const name of ['Precision Attack', 'Lunging Attack', 'Riposte']) {
      const granted = after.sheetAbilities.find(a => a.name === name)!;
      expect(granted.tags).toContain('leveling-2024');
      expect(isOutdated(granted, getManeuver(name)!)).toBe(false);
    }
    const precision = after.sheetAbilities.find(a => a.name === 'Precision Attack')!;
    const legacyPrecision = getManeuver('Precision Attack')!;
    // The definitions really differ: removing only the version tag exposes the
    // old pre-attack die mechanic that the update button must not restore.
    expect(precision.maneuver?.addDieTo).toBe('none');
    expect(legacyPrecision.maneuver?.addDieTo).toBe('attack');
    const unversioned = { ...precision, tags: precision.tags?.filter(t => t !== 'leveling-2024') };
    expect(isOutdated(unversioned, legacyPrecision)).toBe(true);
    const updated = applyRulesUpdate({ ...unversioned, maneuver: { ...unversioned.maneuver!, active: true } }, legacyPrecision);
    expect(updated.id).toBe(precision.id);
    expect(updated.maneuver).toMatchObject({ addDieTo: 'attack', active: false });
    // A future explicitly reviewed 2024 correction remains available.
    expect(isOutdated(precision, { ...legacyPrecision, tags: ['leveling-2024'] })).toBe(true);
  });
  it('applies expertise as an additional proficiency bonus and advances only guide-created expertise later', () => {
    const { s, c } = setup('Bard', 1); updateCharacter(c.id, { proficientSkills: ['Arcana', 'Persuasion'] });
    const current = getCharacter(c.id)!, req = request(s.id, current, { hpMethod: 'fixed', spellNames: ['Healing Word'], featureSelections: { expertise: ['Arcana', 'Persuasion'] } });
    const after = apply(s.id, req); expect(after.modifiers).toContainEqual(expect.objectContaining({ source: 'Expertise: Arcana (2024 level-up)', value: 2 }));
  });
  it('requires the Wizard’s two new class spells, rejects unavailable levels, and keeps preview non-mutating', () => {
    const { s, c } = setup('Wizard', 1); updateCharacter(c.id, { proficientSkills: ['Arcana'] });
    const current = getCharacter(c.id)!, req = request(s.id, current);
    expect(plan(s.id, c).spellChoices).toMatchObject({ newSpells: 2, spellSelectionRequired: true });
    expect(applyLevelUp(s.id, req).ok).toBe(false);
    expect(applyLevelUp(s.id, { ...req, choices: { hpMethod: 'fixed', spellNames: ['Fireball', 'Magic Missile'] } }).ok).toBe(false);
    const valid = { ...req, choices: { hpMethod: 'fixed' as const, spellNames: ['Mage Armor', 'Magic Missile'], featureSelections: { expertise: ['Arcana'] } } };
    expect(previewLevelUp(s.id, valid).ok).toBe(true); expect(getCharacter(c.id)!.sheetAbilities).toHaveLength(0);
    const after = apply(s.id, valid); expect(after.sheetAbilities.map(a => a.name)).toEqual(expect.arrayContaining(['Mage Armor', 'Magic Missile'])); expect(after.spellSlots.L1.max).toBe(3);
    expect(after.sheetAbilities.filter(a => a.type === 'spell').every(a => !a.prepared)).toBe(true);
  });
  it('transfers spent Pact Magic uses across slot levels and adds the new Warlock spell', () => {
    const { s, c } = setup('Warlock', 4, 'Fiend Patron'); setResource(c.id, 'spellSlots', 'L2', { used: 2 });
    const current = getCharacter(c.id)!, req = request(s.id, current), p = plan(s.id, current);
    const invocation = p.featureChoices.find(f => f.key === 'invocations')!;
    const after = apply(s.id, { ...req, choices: { hpMethod: 'fixed', spellNames: ['Counterspell'], featureSelections: { invocations: invocation.options.slice(0, invocation.count).map(o => o.name) } } });
    expect(after.spellSlots).toMatchObject({ L3: { max: 2, used: 2 } }); expect(Object.keys(after.spellSlots)).toEqual(['L3']); expect(after.sheetAbilities.map(a => a.name)).toContain('Counterspell');
  });
  it('does not discard a spell unless a valid replacement is selected', () => {
    const { s, c } = setup('Ranger', 4, 'Hunter');
    setSheetAbility('pc', c.id, { id: 'old-spell', name: 'Entangle', type: 'spell', level: 1, classes: ['ranger'], description: 'Saved custom text', source: 'custom' });
    const current = getCharacter(c.id)!, req = request(s.id, current);
    expect(applyLevelUp(s.id, { ...req, choices: { hpMethod: 'fixed', spellNames: ['Cure Wounds'], replaceSpellIds: ['old-spell'] } }).ok).toBe(false);
    const after = apply(s.id, { ...req, choices: { hpMethod: 'fixed', spellNames: ['Cure Wounds', 'Spike Growth'], replaceSpellIds: ['old-spell'] } });
    expect(after.sheetAbilities.some(a => a.id === 'old-spell')).toBe(false); expect(after.sheetAbilities.map(a => a.name)).toEqual(expect.arrayContaining(['Cure Wounds', 'Spike Growth']));
  });
  it('adds Life Domain spells as always prepared without charging normal preparation choices', () => {
    const { s, c } = setup('Cleric', 2), req = request(s.id, c, { hpMethod: 'fixed', subclass: 'Life Domain' });
    const p = plan(s.id, c, 'Life Domain'); expect(p.spells.map(sp => sp.name)).not.toContain('Cure Wounds');
    const after = apply(s.id, req);
    for (const name of ['Aid', 'Bless', 'Cure Wounds', 'Lesser Restoration']) {
      expect(after.sheetAbilities.find(a => a.name === name)).toMatchObject({ type: 'spell', prepared: true, tags: expect.arrayContaining(['always-prepared']) });
    }
  });
  it('promotes an existing subclass spell’s preparation metadata while preserving its ID, description and custom roll', () => {
    const { s, c } = setup('Cleric', 2);
    setSheetAbility('pc', c.id, { id: 'custom-bless', name: 'Bless', type: 'spell', classes: ['cleric'], level: 1, description: 'House wording', prepared: false, source: 'custom', roll: { kind: 'heal', dice: '1d4' } });
    const current = getCharacter(c.id)!, after = apply(s.id, request(s.id, current, { hpMethod: 'fixed', subclass: 'Life Domain' }));
    expect(after.sheetAbilities.filter(a => a.name === 'Bless')).toHaveLength(1);
    expect(after.sheetAbilities.find(a => a.name === 'Bless')).toMatchObject({ id: 'custom-bless', description: 'House wording', source: 'custom', prepared: true, roll: { kind: 'heal', dice: '1d4' }, tags: expect.arrayContaining(['always-prepared']) });
  });
  it('supports Blessed Warrior and rejects abandoned conditional cantrip selections', () => {
    const { s, c } = setup('Paladin', 1), req = request(s.id, c), p = plan(s.id, c);
    const cantripChoice = p.featureChoices.find(f => f.key === 'warriorCantrips')!;
    const names = cantripChoice.options.slice(0, 2).map(o => o.name);
    expect(cantripChoice.when).toEqual({ key: 'fightingStyle', option: 'Blessed Warrior' });
    const after = apply(s.id, { ...req, choices: { hpMethod: 'fixed', featureSelections: { fightingStyle: ['Blessed Warrior'], warriorCantrips: names } } });
    expect(after.sheetAbilities.filter(a => names.includes(a.name))).toHaveLength(2);
    expect(after.sheetAbilities.find(a => a.name === 'Divine Smite')?.smite).toBeDefined();
    for (const spell of after.sheetAbilities.filter(a => names.includes(a.name))) expect(spell.tags).toContain('bonus-cantrip');
    for (const spell of after.sheetAbilities.filter(a => names.includes(a.name) && a.roll)) expect(spell.roll?.castingAbility).toBe('CHA');
    const alt = setup('Paladin', 1), bad = request(alt.s.id, alt.c, { hpMethod: 'fixed', featureSelections: { fightingStyle: ['Defense'], warriorCantrips: names } });
    expect(applyLevelUp(alt.s.id, bad).ok).toBe(false);
  });
  it('supports Deft Explorer expertise and Primal Knowledge skill choices', () => {
    const ranger = setup('Ranger', 1); updateCharacter(ranger.c.id, { proficientSkills: ['Survival'] });
    const r = getCharacter(ranger.c.id)!, rp = pending(ranger.s.id, r), rplan = plan(ranger.s.id, r);
    expect(rplan.featureChoices.find(f => f.key === 'expertise')?.count).toBe(1);
    const spell = rplan.spells.find(sp => sp.level === 1)!.name;
    const advanced = apply(ranger.s.id, { characterId: r.id, grantId: rp.id, expectedLevel: 1, choices: { hpMethod: 'fixed', spellNames: [spell], featureSelections: { expertise: ['Survival'], fightingStyle: ['Archery'] } } });
    expect(advanced.modifiers.some(m => m.source === 'Expertise: Survival (2024 level-up)')).toBe(true);
    const barbarian = setup('Barbarian', 2); const bar = apply(barbarian.s.id, request(barbarian.s.id, barbarian.c, { hpMethod: 'fixed', subclass: 'Path of the Berserker', featureSelections: { primalKnowledge: ['Perception'] } }));
    expect(bar.proficientSkills).toContain('Perception');
  });
  it('offers Cleric Blessed Strikes and Druid Elemental Fury as explicit alternatives', () => {
    const cleric = setup('Cleric', 6, 'Life Domain'), cr = request(cleric.s.id, cleric.c);
    expect(applyLevelUp(cleric.s.id, cr).ok).toBe(false);
    const c = apply(cleric.s.id, { ...cr, choices: { hpMethod: 'fixed', featureSelections: { blessedStrikes: ['Divine Strike'] } } });
    expect(c.sheetAbilities.find(a => a.name === 'Divine Strike')?.description).toMatch(/1d8 radiant or necrotic/);
    const druid = setup('Druid', 6, 'Circle of the Land'), d = apply(druid.s.id, request(druid.s.id, druid.c, { hpMethod: 'fixed', featureSelections: { elementalFury: ['Primal Strike'] } }));
    expect(d.sheetAbilities.find(a => a.name === 'Primal Strike')?.description).toMatch(/cold, fire, lightning, or thunder/);
  });
  it('offers Bard Magical Secrets lists and the extra Evoker Savant spell on a new slot level', () => {
    const bard = setup('Bard', 9, 'College of Lore'); pending(bard.s.id, bard.c);
    const bp = plan(bard.s.id, bard.c); expect(bp.spells.map(sp => sp.name)).toContain('Fireball');
    const evoker = setup('Wizard', 4, 'Evoker'); const req = request(evoker.s.id, evoker.c);
    expect(plan(evoker.s.id, evoker.c).spellChoices.newSpells).toBe(3);
    const advanced = apply(evoker.s.id, { ...req, choices: { hpMethod: 'fixed', spellNames: ['Fireball', 'Haste', 'Counterspell'] } });
    expect(advanced.sheetAbilities.filter(a => a.type === 'spell')).toHaveLength(3);
  });
  it('allows a lower-level Evocation for the later Savant grant but rejects three spells with no Evocation', () => {
    const { s, c } = setup('Wizard', 4, 'Evoker'), req = request(s.id, c);
    expect(previewLevelUp(s.id, { ...req, choices: { hpMethod: 'fixed', spellNames: ['Haste', 'Shield', 'Misty Step'] } }).ok).toBe(false);
    // The 2024 rule requires a level for which the Wizard has slots, not the new highest level.
    expect(previewLevelUp(s.id, { ...req, choices: { hpMethod: 'fixed', spellNames: ['Magic Missile', 'Shield', 'Misty Step'] } }).ok).toBe(true);
    expect(previewLevelUp(s.id, { ...req, choices: { hpMethod: 'fixed', spellNames: ['Fireball', 'Shield', 'Misty Step'] } }).ok).toBe(true);
  });
  it('does not duplicate legacy feat modifier sources and filters Resilient to unproficient saves', () => {
    const { s, c } = setup('Fighter', 3, 'Champion'); updateCharacter(c.id, { saveProficiencies: ['CON'], modifiers: [{ id: 'legacy-tough', source: 'Tough', target: { kind: 'skill', skill: 'Athletics' }, value: 1 }] });
    const current = getCharacter(c.id)!, req = request(s.id, current), p = plan(s.id, current);
    expect(p.feats.map(f => f.name)).not.toContain('Tough'); expect(p.feats.find(f => f.name === 'Resilient')?.abilityChoices).not.toContain('CON');
    expect(applyLevelUp(s.id, { ...req, choices: { hpMethod: 'fixed', featName: 'Resilient', featAbility: 'CON' } }).ok).toBe(false);
  });
  it('filters Resilient when all saves are already proficient and checks Sentinel’s ability prerequisite', () => {
    const { s, c } = setup('Fighter', 3, 'Champion'); updateCharacter(c.id, { saveProficiencies: ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'], stats: { ...stats, STR: 8, DEX: 8 } });
    const current = getCharacter(c.id)!; pending(s.id, current);
    expect(plan(s.id, current).feats.map(f => f.name)).not.toContain('Resilient');
    expect(plan(s.id, current).feats.map(f => f.name)).not.toContain('Sentinel');
  });
});

const connected: string[] = [];
afterEach(() => { for (const id of connected.splice(0)) dropConn(id); });
function harness(sessionId: string, mapId: string, role: 'player' | 'dm') {
  let connect!: (socket: unknown) => void;
  const io = { on: (_: string, cb: typeof connect) => { connect = cb; }, to: () => ({ emit: () => {} }) };
  registerSocketHandlers(io as unknown as IOServer, { livePhysics: false });
  const handlers = new Map<string, (...args: unknown[]) => void>(), id = `level-${Math.random()}`;
  connected.push(id); const notices: string[] = [];
  connect({ id, on: (event: string, handler: (...args: unknown[]) => void) => handlers.set(event, handler), emit: (event: string, p: { message?: string }) => { if (event === 'notice') notices.push(p.message ?? ''); } });
  setConn(id, { sessionId, role, viewMapId: mapId, playerId: null });
  return { id, notices, send: (event: string, payload: unknown) => handlers.get(event)!(payload), call: (event: string, payload: unknown) => {
    let response: unknown; handlers.get(event)!(payload, (value: unknown) => { response = value; }); return response;
  } };
}
describe('level-up socket authorization', () => {
  it('sends a DM notice for an invalid roster import instead of throwing or saving a partial sheet edit', () => {
    const { s, c } = setup('Fighter', 3, 'Champion'), m = createMap(s.id, { name: 'Camp' }); setActiveMap(s.id, m.id);
    const dm = harness(s.id, m.id, 'dm');
    expect(dm.call('character:levelConfigureClasses', { characterId: c.id, classes: [{ className: 'fighter', level: 3, subclass: 'Champion' }] })).toMatchObject({ ok: true });
    const before = getCharacter(c.id)!;
    expect(() => dm.send('character:update', { characterId: c.id, name: 'Invalid import', leveling: { rules: '2024', history: [], classes: [{ className: 'fighter', level: 4 }] } })).not.toThrow();
    expect(getCharacter(c.id)).toEqual(before); expect(dm.notices.at(-1)).toMatch(/add up/);
    dm.send('character:update', { characterId: c.id, className: 'Fighter / Wizard' });
    expect(getCharacter(c.id)).toEqual(before); expect(dm.notices.at(-1)).toMatch(/Configure class levels/);
  });
  it('allows only DM class configuration and blocks raw multiclass progression changes even through the sheet editor', () => {
    const { s, c } = setup('Fighter', 4, 'Champion'), m = createMap(s.id, { name: 'Camp' }); setActiveMap(s.id, m.id);
    const player = harness(s.id, m.id, 'player'), dm = harness(s.id, m.id, 'dm'); claimCharacter(c.id, player.id);
    const classes = [{ className: 'fighter', level: 3, subclass: 'Champion' }, { className: 'wizard', level: 1 }];
    expect(player.call('character:levelConfigureClasses', { characterId: c.id, classes })).toMatchObject({ ok: false });
    expect(dm.call('character:levelConfigureClasses', { characterId: c.id, classes })).toMatchObject({ ok: true });
    const before = getCharacter(c.id)!;
    player.send('character:update', { characterId: c.id, leveling: { ...before.leveling, classes: [{ className: 'fighter', level: 4 }] } });
    expect(getCharacter(c.id)).toEqual(before);
    dm.send('character:update', { characterId: c.id, level: 5 });
    expect(getCharacter(c.id)).toEqual(before);
    dm.send('character:update', { characterId: c.id, className: 'Wizard', subclass: 'Evoker' });
    expect(getCharacter(c.id)).toEqual(before);
    player.send('character:update', { characterId: c.id, name: 'Still editable' });
    expect(getCharacter(c.id)!.name).toBe('Still editable');
    const other = createSession('Other'), otherMap = createMap(other.id, { name: 'Other camp' }); setActiveMap(other.id, otherMap.id);
    const otherDm = harness(other.id, otherMap.id, 'dm');
    expect(otherDm.call('character:levelConfigureClasses', { characterId: c.id, classes })).toMatchObject({ ok: false });
  });
  it('only a DM grants/cancels and only the claiming player or DM can preview, roll or apply', () => {
    const { s, c } = setup(), m = createMap(s.id, { name: 'Camp' }); setActiveMap(s.id, m.id);
    const player = harness(s.id, m.id, 'player'), other = harness(s.id, m.id, 'player'), dm = harness(s.id, m.id, 'dm'); claimCharacter(c.id, player.id);
    expect(player.call('character:levelGrant', { characterId: c.id })).toMatchObject({ ok: false });
    expect(dm.call('character:levelGrant', { characterId: c.id })).toMatchObject({ ok: true });
    const current = getCharacter(c.id)!, grant = current.leveling!.pending!;
    const req = { characterId: c.id, grantId: grant.id, expectedLevel: 1, choices: { hpMethod: 'fixed' } };
    expect(other.call('character:levelApply', req)).toMatchObject({ ok: false }); expect(getCharacter(c.id)!.level).toBe(1);
    expect(other.call('character:levelPreview', req)).toMatchObject({ ok: false });
    expect(other.call('character:levelPlan', { characterId: c.id })).toMatchObject({ ok: false });
    other.send('character:levelRollHp', { characterId: c.id, grantId: grant.id }); expect(getCharacter(c.id)!.leveling!.pending!.hpRoll).toBeUndefined();
    expect(player.call('character:levelCancel', { characterId: c.id, grantId: grant.id })).toMatchObject({ ok: false });
    expect(player.call('character:levelPreview', req)).toMatchObject({ ok: true }); expect(player.call('character:levelApply', req)).toMatchObject({ ok: true });
    expect(getCharacter(c.id)!.level).toBe(2);
  });
  it('redirects a player’s direct level change while allowing ordinary owned editing and the DM correction path', () => {
    const { s, c } = setup(), m = createMap(s.id, { name: 'Camp' }); setActiveMap(s.id, m.id);
    const player = harness(s.id, m.id, 'player'), dm = harness(s.id, m.id, 'dm'); claimCharacter(c.id, player.id);
    player.send('character:update', { characterId: c.id, level: 4 }); expect(getCharacter(c.id)?.level).toBe(1); expect(player.notices.at(-1)).toMatch(/Ask the DM/);
    player.send('character:update', { characterId: c.id, level: 1, name: 'New name' }); expect(getCharacter(c.id)?.name).toBe('New name');
    dm.send('character:update', { characterId: c.id, level: 4 }); expect(getCharacter(c.id)?.level).toBe(4);
  });
  it('acknowledges malformed level-up requests instead of leaving the caller waiting', () => {
    const { s, c } = setup(), m = createMap(s.id, { name: 'Camp' }); setActiveMap(s.id, m.id);
    const dm = harness(s.id, m.id, 'dm');
    for (const event of ['character:levelGrant', 'character:levelCancel', 'character:levelPlan', 'character:levelPreview', 'character:levelApply', 'character:levelConfigureClasses']) {
      expect(dm.call(event, null)).toMatchObject({ ok: false }); expect(dm.call(event, {})).toMatchObject({ ok: false });
    }
    expect(getCharacter(c.id)?.level).toBe(1);
  });
});
