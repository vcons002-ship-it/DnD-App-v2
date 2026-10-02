import { afterEach, describe, expect, it } from 'vitest';
import {
  createSession, createCharacter, createMap, setActiveMap, setManualDamage,
  createToken, createMonsterTemplate, instantiateMonster, getCharacter, getMonster,
  listRollLog, setResource, setSheetAbility, updateCharacter, spendSpellSlot,
  spendResourceForAbility,
} from './sessions.js';
import { applyLevelUp, configureLevelUpClasses, getLevelUpPlan, grantLevelUp } from './leveling.js';
import { resolveAbilityRoll, resolveAttack, resolveSmite } from './combat.js';
import { resolveHitFeature } from './hitFeatures.js';
import { restCharacter, spendHitDice } from './rests.js';
import { getFeature } from './features/srd.js';
import { getSpell } from './spells/srd.js';
import { db } from './db.js';
import { registerSocketHandlers } from './socketHandlers.js';
import { dropConn, setConn, type IOServer } from './connections.js';
import { withDiceSource } from '../../shared/dice.js';
import { spellSlotOptions, selectSpellSlot } from '../../shared/spellSlotPools.js';
import { hitDicePoolsFor } from '../../shared/rests.js';
import type { ClassRosterEntry } from '../../shared/multiclass.js';
import type { SheetAbility } from '../../shared/types.js';

// Vitest config always selects a throwaway DB. These are actual server writes,
// reloads, attacks and rests, not clients supplying computed rule numbers.
const allStats = { STR: 16, DEX: 14, CON: 14, INT: 20, WIS: 16, CHA: 16 };
const row = (className: ClassRosterEntry['className'], level: number, subclass?: string): ClassRosterEntry => ({ className, level, ...(subclass ? { subclass } : {}) });
const fixed = <T>(run: () => T): T => withDiceSource(sides => sides.map(die => die === 20 ? 10 : 1), run);
function character(classes: ClassRosterEntry[], overrides = {}) {
  const session = createSession('Multiclass runtime'), level = classes.reduce((n, c) => n + c.level, 0);
  const hero = createCharacter(session.id, {
    name: 'Adventurer', className: classes[0].className, level, subclass: classes[0].subclass,
    stats: allStats, maxHp: 80, leveling: { rules: '2024', classes, history: [] },
    weapons: [{ name: 'Shortsword', kind: 'melee', damage: '1d6', damageType: 'piercing', tags: ['finesse'] }],
    ...overrides,
  });
  return { session, hero };
}
function arena(classes: ClassRosterEntry[], overrides = {}) {
  const f = character(classes, overrides), map = createMap(f.session.id, { name: 'Arena' });
  setActiveMap(f.session.id, map.id); setManualDamage(f.session.id, false);
  const monster = instantiateMonster(createMonsterTemplate(f.session.id, { name: 'Target', creatureType:'Humanoid', maxHp: 200, armorClass: 1 }).id)!;
  const attacker = createToken({ mapId: map.id, kind: 'pc', refId: f.hero.id, x: 100, y: 100 });
  const target = createToken({ mapId: map.id, kind: 'monster', refId: monster.id, x: 150, y: 100 });
  return { ...f, map, monster, attacker, target };
}
function feature(name: string, sourceClass: SheetAbility['sourceClass'], id = name): SheetAbility {
  const source = getFeature(name) ?? getSpell(name); if (!source) throw new Error(`Missing feature ${name}`);
  return { ...source, id, sourceClass, source: 'srd' };
}

const connected: string[] = [];
afterEach(() => { for (const id of connected.splice(0)) dropConn(id); });
function dmSocket(sessionId: string, mapId: string) {
  let connect!: (socket: unknown) => void;
  const io = { on: (_: string, cb: typeof connect) => { connect = cb; }, to: () => ({ emit: () => {} }) };
  registerSocketHandlers(io as unknown as IOServer, { livePhysics: false });
  const handlers = new Map<string, (...args: unknown[]) => void>(), id = `multiclass-${Math.random()}`;
  connected.push(id);
  connect({ id, on: (event: string, handler: (...args: unknown[]) => void) => handlers.set(event, handler), emit: () => {} });
  setConn(id, { sessionId, role: 'dm', viewMapId: mapId, playerId: null });
  return { send: (event: string, payload: unknown) => handlers.get(event)!(payload) };
}

describe('class-specific combat with total-character proficiency', () => {
  it('Fighter 4 / Wizard 1 attacks with total-level +3 proficiency, not Fighter +2', () => {
    const f = arena([row('fighter', 4, 'Champion'), row('wizard', 1)]);
    expect(f.hero.level).toBe(5);
    fixed(() => expect(resolveAttack(f.session.id, f.hero.name, f.attacker.id, f.target.id, 0)).toBe(true));
    const attack = listRollLog(f.session.id).find(entry => entry.reveal?.kind === 'attack')!;
    expect(attack.reveal?.attackTotal).toBe(16); // d20[10] + STR3 + total-level PB3
    expect(getCharacter(f.hero.id)!.leveling!.classes).toEqual([row('fighter', 4, 'Champion'), row('wizard', 1)]);
    expect(getCharacter(f.hero.id)!.spellSlots.L1.max).toBe(2);
  });
  it('Rogue 1 / Fighter 8 gets one Sneak Attack d6 rather than five from total level', () => {
    const f = arena([row('rogue', 1), row('fighter', 8, 'Champion')]);
    const sneak: SheetAbility = { id: 'sneak', name: 'Sneak Attack', type: 'ability', description: '', sourceClass: 'rogue' };
    setSheetAbility('pc', f.hero.id, sneak);
    fixed(() => {
      expect(resolveAttack(f.session.id, f.hero.name, f.attacker.id, f.target.id, 0, 'adv')).toBe(true);
      const hit = listRollLog(f.session.id).find(entry => entry.pending)!;
      expect(hit.pending!.hitOptions!.abilityIds).toContain(sneak.id);
      expect(resolveHitFeature(f.session.id, f.hero.name, hit.id, sneak.id).ok).toBe(true);
    });
    const damage = listRollLog(f.session.id).find(entry => entry.reveal?.kind === 'damage')!.reveal!;
    const rider = damage.damageDice?.filter(die => die.label.includes('Sneak Attack'));
    expect(rider).toHaveLength(1);
    expect(rider![0].faces).toEqual([1]);
    expect(getMonster(f.monster.id)!.curHp).toBe(195); // weapon1 + STR3 + Sneak1
  });
  it('Barbarian 1 / Fighter 8 receives Rage +2, not the level-9 Barbarian bonus', () => {
    const f = arena([row('barbarian', 1), row('fighter', 8, 'Champion')]);
    const rage = feature('Rage', 'barbarian'); rage.stance = { ...rage.stance!, active: true };
    setSheetAbility('pc', f.hero.id, rage);
    fixed(() => resolveAttack(f.session.id, f.hero.name, f.attacker.id, f.target.id, 0));
    const attack = listRollLog(f.session.id).find(entry => entry.reveal?.kind === 'attack')!.reveal!;
    expect(attack.damageMods).toContainEqual({ label: 'Rage', value: 2 });
    expect(getMonster(f.monster.id)!.curHp).toBe(194); // weapon1 + STR3 + Rage2
    expect(getCharacter(f.hero.id)!.resources.Rage.max).toBe(2);
  });
  it('Second Wind adds the Fighter level even when another class is primary', () => {
    const f = character([row('wizard', 7, 'Evoker'), row('fighter', 2)]);
    const wind = feature('Second Wind', 'fighter'); setSheetAbility('pc', f.hero.id, wind);
    updateCharacter(f.hero.id, { curHp: 10 });
    // The socket action spends the counter before calling the roll resolver.
    expect(spendResourceForAbility(f.hero.id, wind.name, wind.sourceClass).spent).toBe(true);
    fixed(() => expect(resolveAbilityRoll(f.session.id, f.hero.name, getCharacter(f.hero.id)!, wind)).toBe(true));
    expect(getCharacter(f.hero.id)!.curHp).toBe(13); // d10[1] + Fighter2, not total9 or INT
    expect(getCharacter(f.hero.id)!.resources['Second Wind'].used).toBe(1);
    expect(listRollLog(f.session.id).at(-1)!.detail).toContain('+ 2 Fighter level');
  });
  it('Cleric and Wizard spells use their own casting scores with the same total-level proficiency', () => {
    const f = arena([row('cleric', 3, 'Life Domain'), row('wizard', 5, 'Evoker')]);
    const cleric = { ...getSpell('Guiding Bolt')!, id: 'guiding', sourceClass: 'cleric' as const };
    const wizard = { ...getSpell('Fire Bolt')!, id: 'firebolt', sourceClass: 'wizard' as const };
    fixed(() => {
      expect(resolveAbilityRoll(f.session.id, f.hero.name, getCharacter(f.hero.id)!, cleric, 1, undefined, f.target.id)).toBe(true);
      expect(resolveAbilityRoll(f.session.id, f.hero.name, getCharacter(f.hero.id)!, wizard, undefined, undefined, f.target.id)).toBe(true);
    });
    const rolls = listRollLog(f.session.id).filter(entry => entry.reveal?.kind === 'attack');
    expect(rolls.map(entry => entry.reveal!.attackTotal)).toEqual([16, 18]); // WIS3/PB3 vs INT5/PB3
  });
  it('a text-only Warlock Hold Person profile uses Charisma and total-level proficiency for its actual target save', () => {
    const f = arena([row('wizard', 5, 'Evoker'), row('warlock', 3, 'Fiend Patron')], { stats: { ...allStats, CHA: 14 } });
    const hold = { ...getSpell('Hold Person')!, id: 'hold', sourceClass: 'warlock' as const };
    expect(hold.roll).toBeUndefined(); // The runtime creates the save profile; the saved spell has no casting override.
    setSheetAbility('pc', f.hero.id, hold);
    const dm = dmSocket(f.session.id, f.map.id);
    withDiceSource(sides => sides.map(die => die === 20 ? 13 : 1), () => dm.send('ability:roll', {
      kind: 'pc', refId: f.hero.id, abilityId: hold.id, castLevel: 2, slotPool: 'spellcasting', targetTokenId: f.target.id,
    }));
    const entries = listRollLog(f.session.id), cast = entries.find(entry => entry.label === 'Hold Person')!;
    expect(cast.apply).toMatchObject({ dc: 13, save: 'WIS' }); // 8 + total-level PB3 + CHA2, not INT5 or Warlock-only PB2.
    const save = entries.find(entry => entry.label === 'WIS save')!;
    expect(save.expr).toBe('DC 13');
    expect(save.reveal).toMatchObject({ attackTotal: 13, outcome: 'pass', effectOutcome: 'Hold Person resisted - not Paralyzed.' });
    expect(getCharacter(f.hero.id)!.sheetAbilities.find(a => a.id === hold.id)!.roll).toBeUndefined();
    expect(getCharacter(f.hero.id)!.spellSlots.L2.used).toBe(1);
  });
});

describe('independent Pact and Spellcasting pools through the server', () => {
  it('spends the selected Pact pool when an exhausted low-level ordinary slot automatically falls back to Pact upcasting', () => {
    const f = arena([row('wizard', 5, 'Evoker'), row('warlock', 5, 'Fiend Patron')]);
    const missile = { ...getSpell('Magic Missile')!, id: 'missile', sourceClass: 'wizard' as const };
    setSheetAbility('pc', f.hero.id, missile);
    setResource(f.hero.id, 'spellSlots', 'L1', { used: 4 });
    expect(selectSpellSlot(getCharacter(f.hero.id)!, 1)).toMatchObject({ key: 'P3', pool: 'pact', level: 3 });
    const dm = dmSocket(f.session.id, f.map.id);
    fixed(() => dm.send('ability:roll', { kind: 'pc', refId: f.hero.id, abilityId: missile.id, castLevel: 1, targetTokenId: f.target.id }));
    expect(getCharacter(f.hero.id)!.spellSlots).toMatchObject({ L1: { used: 4 }, L3: { used: 0 }, P3: { used: 1 } });
  });
  it('spends the same Pact pool selected for a post-hit spell when the ordinary low-level pool is empty', () => {
    const f = arena([row('wizard', 5, 'Evoker'), row('warlock', 5, 'Fiend Patron')]);
    const searing: SheetAbility = { id: 'searing', name: 'Searing Smite', type: 'spell', level: 1, sourceClass: 'warlock', description: '' };
    setSheetAbility('pc', f.hero.id, searing);
    setResource(f.hero.id, 'spellSlots', 'L1', { used: 4 });
    fixed(() => {
      expect(resolveAttack(f.session.id, f.hero.name, f.attacker.id, f.target.id, 0)).toBe(true);
      const hit = listRollLog(f.session.id).find(entry => entry.pending)!;
      expect(hit.pending!.hitOptions!.abilityIds).toContain(searing.id);
      expect(resolveHitFeature(f.session.id, f.hero.name, hit.id, searing.id, 1).ok).toBe(true);
    });
    expect(getCharacter(f.hero.id)!.spellSlots).toMatchObject({ L1: { used: 4 }, L3: { used: 0 }, P3: { used: 1 } });
  });
  it('preserves spent L2 Pact uses when a Warlock actually levels into Wizard through the guide', () => {
    const f = character([row('warlock', 4, 'Fiend Patron')]);
    setResource(f.hero.id, 'spellSlots', 'L2', { used: 2 });
    const grant = grantLevelUp(f.session.id, f.hero.id); expect(grant.ok).toBe(true);
    const plan = getLevelUpPlan(f.session.id, f.hero.id, undefined, 'wizard');
    if (!plan.ok || !grant.ok) throw new Error('Wizard multiclass plan unavailable.');
    expect(plan.value).toMatchObject({ fromClassLevel: 0, toClassLevel: 1, newClass: true, spellChoices: { newSpells: 6, newCantrips: 3 } });
    const result = applyLevelUp(f.session.id, { characterId: f.hero.id, grantId: grant.value.leveling!.pending!.id,
      expectedLevel: 4, choices: { className: 'wizard', hpMethod: 'fixed',
        spellNames: plan.value.spells.filter(s => s.level === 1).slice(0, 6).map(s => s.name),
        cantripNames: plan.value.spells.filter(s => s.level === 0).slice(0, 3).map(s => s.name) } });
    expect(result.ok).toBe(true);
    const loaded = getCharacter(f.hero.id)!;
    expect(loaded).toMatchObject({ level: 5, maxHp: 86, spellSlots: { P2: { max: 2, used: 2 }, L1: { max: 2, used: 0 } } });
    expect(loaded.leveling!.classes).toEqual([row('warlock', 4, 'Fiend Patron'), row('wizard', 1)]);
    expect(loaded.spellSlots.L2).toBeUndefined();
  });
  it('preserves spent legacy L2 Pact uses when the DM records a second class', () => {
    const session = createSession('Pact baseline');
    const hero = createCharacter(session.id, { name: 'Warlock', className: 'Warlock', level: 4, stats: allStats });
    setResource(hero.id, 'spellSlots', 'L2', { used: 2 });
    const result = configureLevelUpClasses(session.id, hero.id, [row('warlock', 3, 'Fiend Patron'), row('wizard', 1)]);
    expect(result.ok).toBe(true);
    const loaded = getCharacter(hero.id)!;
    expect(loaded.spellSlots).toMatchObject({ P2: { max: 2, used: 2 }, L1: { max: 2, used: 0 } });
    expect(loaded.spellSlots.L2).toBeUndefined();
    restCharacter(session.id, hero.id, 'short');
    expect(getCharacter(hero.id)!.spellSlots.P2.used).toBe(0);
  });
  it('can choose regular L2 or Pact P3 casting without merging them and refills only Pact on a Short Rest', () => {
    const f = character([row('wizard', 3, 'Evoker'), row('warlock', 5, 'Fiend Patron')]);
    expect(selectSpellSlot(f.hero, 2, 'spellcasting')).toMatchObject({ key: 'L2', level: 2 });
    expect(selectSpellSlot(f.hero, 2, 'pact')).toMatchObject({ key: 'P3', level: 3 });
    expect(spellSlotOptions(f.hero, 1).some(option => option.key === 'P3')).toBe(true);
    expect(spendSpellSlot(f.hero.id, 2, 'spellcasting')).toEqual({ hasSlot: true, spent: true, level: 2 });
    expect(spendSpellSlot(f.hero.id, 2, 'pact')).toEqual({ hasSlot: true, spent: true, level: 3 });
    expect(getCharacter(f.hero.id)!.spellSlots).toMatchObject({ L2: { used: 1 }, P3: { used: 1 } });
    restCharacter(f.session.id, f.hero.id, 'short');
    expect(getCharacter(f.hero.id)!.spellSlots).toMatchObject({ L2: { used: 1 }, P3: { used: 0 } });
    restCharacter(f.session.id, f.hero.id, 'long');
    expect(getCharacter(f.hero.id)!.spellSlots).toMatchObject({ L2: { used: 0 }, P3: { used: 0 } });
  });
  it('does not grant Bard 1 Font of Inspiration merely because total level is 5', () => {
    const f = character([row('bard', 1), row('fighter', 4, 'Champion')]);
    setResource(f.hero.id, 'resources', 'Bardic Inspiration', { used: 2 });
    restCharacter(f.session.id, f.hero.id, 'short');
    expect(getCharacter(f.hero.id)!.resources['Bardic Inspiration'].used).toBe(2);
    restCharacter(f.session.id, f.hero.id, 'long');
    expect(getCharacter(f.hero.id)!.resources['Bardic Inspiration'].used).toBe(0);
  });
  it('spends Cleric and Paladin Channel Divinity independently', () => {
    const f = character([row('cleric', 6, 'Life Domain'), row('paladin', 3, 'Oath of Devotion')]);
    expect(spendResourceForAbility(f.hero.id, 'Channel Divinity', 'cleric')).toEqual({ matched: true, spent: true });
    expect(getCharacter(f.hero.id)!.resources).toMatchObject({ 'Cleric Channel Divinity': { max: 3, used: 1 }, 'Paladin Channel Divinity': { max: 2, used: 0 } });
    expect(spendResourceForAbility(f.hero.id, 'Channel Divinity', 'paladin')).toEqual({ matched: true, spent: true });
    expect(getCharacter(f.hero.id)!.resources['Paladin Channel Divinity'].used).toBe(1);
  });
  it('distinguishes ordinary and Pact Smite slots at the same level without spending the other pool', () => {
    for (const choice of [3, 'pact:3'] as const) {
      const f = arena([row('paladin', 2), row('wizard', 5, 'Evoker'), row('warlock', 5, 'Fiend Patron')]);
      setSheetAbility('pc', f.hero.id, feature('Divine Smite', 'paladin', 'smite'));
      fixed(() => {
        expect(resolveAttack(f.session.id, f.hero.name, f.attacker.id, f.target.id, 0)).toBe(true);
        const hit = listRollLog(f.session.id).find(entry => entry.smite)!;
        expect(resolveSmite(f.session.id, f.hero.name, hit.id, choice)).toEqual({ ok: true });
      });
      expect(getCharacter(f.hero.id)!.spellSlots).toMatchObject({ L3: { used: choice === 3 ? 1 : 0 }, P3: { used: choice === 3 ? 0 : 1 } });
    }
  });
});

describe('mixed Hit Dice are durable separate pools', () => {
  it('spends the chosen die, persists both pools, prevents overspending and restores them on a Long Rest', () => {
    const f = character([row('fighter', 2), row('wizard', 3, 'Evoker')]);
    updateCharacter(f.hero.id, { curHp: 10 });
    withDiceSource(sides => sides.map(() => 7), () => expect(spendHitDice(f.session.id, f.hero.name, f.hero.id, 1, 10)).toEqual({ ok: true, spent: 1, healed: 9 }));
    expect(listRollLog(f.session.id).at(-1)!.detail).toContain('4/5 left');
    withDiceSource(sides => sides.map(() => 4), () => expect(spendHitDice(f.session.id, f.hero.name, f.hero.id, 1, 6)).toEqual({ ok: true, spent: 1, healed: 6 }));
    const loaded = getCharacter(f.hero.id)!;
    expect(loaded).toMatchObject({ curHp: 25, hitDiceUsed: 2, hitDiceUsedByDie: { d10: 1, d6: 1 } });
    expect(hitDicePoolsFor(loaded)).toEqual(expect.arrayContaining([expect.objectContaining({ die: 10, max: 2, used: 1, left: 1 }), expect.objectContaining({ die: 6, max: 3, used: 1, left: 2 })]));
    expect(JSON.parse((db.prepare('SELECT hit_dice_used_by_die AS used FROM characters WHERE id = ?').get(f.hero.id) as { used: string }).used)).toEqual({ d10: 1, d6: 1 });
    fixed(() => expect(spendHitDice(f.session.id, f.hero.name, f.hero.id, 99, 10)).toEqual({ ok: true, spent: 1, healed: 3 }));
    expect(spendHitDice(f.session.id, f.hero.name, f.hero.id, 1, 10).ok).toBe(false);
    expect(getCharacter(f.hero.id)!.hitDiceUsedByDie).toEqual({ d10: 2, d6: 1 });
    restCharacter(f.session.id, f.hero.id, 'long');
    expect(getCharacter(f.hero.id)).toMatchObject({ curHp: 80, hitDiceUsed: 0, hitDiceUsedByDie: {} });
    expect(hitDicePoolsFor(getCharacter(f.hero.id)!).every(pool => pool.left === pool.max)).toBe(true);
  });
  it('conservatively allocates a legacy spent total instead of restoring all dice after adding the new field', () => {
    const f = character([row('fighter', 2), row('wizard', 3, 'Evoker')]);
    db.prepare("UPDATE characters SET cur_hp = 10, hit_dice_used = 3, hit_dice_used_by_die = '{}' WHERE id = ?").run(f.hero.id);
    expect(hitDicePoolsFor(getCharacter(f.hero.id)!)).toEqual(expect.arrayContaining([expect.objectContaining({ die: 10, used: 2, left: 0 }), expect.objectContaining({ die: 6, used: 1, left: 2 })]));
    expect(spendHitDice(f.session.id, f.hero.name, f.hero.id, 1, 10).ok).toBe(false);
    fixed(() => expect(spendHitDice(f.session.id, f.hero.name, f.hero.id, 1, 6).ok).toBe(true));
    expect(getCharacter(f.hero.id)!.hitDiceUsed).toBe(4);
    expect(getCharacter(f.hero.id)!.hitDiceUsedByDie).toEqual({ d10: 2, d6: 2 });
  });
  it('preserves the spent total if the DM corrects a class split that shrinks its original die pool', () => {
    const f = character([row('wizard', 5, 'Evoker')]);
    db.prepare("UPDATE characters SET hit_dice_used = 4, hit_dice_used_by_die = '{\"d6\":4}' WHERE id = ?").run(f.hero.id);
    const configured = configureLevelUpClasses(f.session.id, f.hero.id, [row('wizard', 3, 'Evoker'), row('fighter', 2)]);
    expect(configured.ok).toBe(true);
    expect(getCharacter(f.hero.id)!).toMatchObject({ hitDiceUsed: 4, hitDiceUsedByDie: { d6: 3, d10: 1 } });
    expect(hitDicePoolsFor(getCharacter(f.hero.id)!).reduce((sum, pool) => sum + pool.left, 0)).toBe(1);
  });
});
