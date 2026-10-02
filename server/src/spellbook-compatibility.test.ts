import { afterEach, describe, expect, it } from 'vitest';
import { spellCombatSupport } from '../../shared/spellSupport.js';
import { effectiveSheetAbility } from '../../shared/spellExecution.js';
import { abilityKey } from '../../shared/hitFeatures.js';
import { withDiceSource, type PhysicalDiceInfo } from '../../shared/dice.js';
import type { ClassRosterEntry } from '../../shared/multiclass.js';
import type { SheetAbility } from '../../shared/types.js';
import { getAllSpells } from './spells/srd.js';
import {
  createSession, createCharacter, createMap, setActiveMap, setManualDamage,
  createToken, createMonsterTemplate, instantiateMonster, getCharacter,
  getMonster, listRollLog, setSheetAbility, updateCharacter,
} from './sessions.js';
import { resolveAbilityRoll, resolveAttackDamage, resolveForcedSave } from './combat.js';
import { registerSocketHandlers } from './socketHandlers.js';
import { dropConn, setConn, type IOServer } from './connections.js';
import { runLiveCommand } from './liveRolls.js';

// Tests run on vitest.config.ts's disposable database. Use real catalogue entries
// and server actions so a label cannot substitute for correct combat behavior.
const spell = (name: string, sourceClass?: SheetAbility['sourceClass']): SheetAbility => {
  const found = getAllSpells().find(entry => abilityKey(entry) === name.toLowerCase());
  if (!found) throw new Error(`Missing spell: ${name}`);
  return { ...found, id: `compat-${name}`, ...(sourceClass ? { sourceClass } : {}) };
};
const row = (className: ClassRosterEntry['className'], level: number): ClassRosterEntry => ({ className, level });
const connections: string[] = [];
afterEach(() => { for (const id of connections.splice(0)) dropConn(id); });
function arena(classes: ClassRosterEntry[]) {
  const session = createSession('Spellbook compatibility');
  const map = createMap(session.id, { name: 'Spell arena' });
  setActiveMap(session.id, map.id); setManualDamage(session.id, true);
  const caster = createCharacter(session.id, {
    name: 'Caster', className: classes[0].className,
    level: classes.reduce((total, entry) => total + entry.level, 0),
    stats: { STR: 14, DEX: 16, CON: 14, INT: 20, WIS: 16, CHA: 14 }, maxHp: 80,
    leveling: { rules: '2024', classes, history: [] },
    weapons: [{ name: 'Bow', kind: 'ranged', damage: '1d8', damageType: 'piercing', attackBonus: 50 }],
  });
  const self = createToken({ mapId: map.id, kind: 'pc', refId: caster.id, x: 100, y: 100 });
  const monster = instantiateMonster(createMonsterTemplate(session.id, {
    name: 'Target', maxHp: 120, armorClass: 15, stats: { DEX: 10, WIS: 10 },
  }).id)!;
  const target = createToken({ mapId: map.id, kind: 'monster', refId: monster.id, x: 150, y: 100 });
  return { session, map, caster, self, monster, target };
}
function dmSocket(sessionId: string, mapId: string) {
  let connect!: (socket: unknown) => void;
  const io = { on: (_: string, cb: typeof connect) => { connect = cb; }, to: () => ({ emit: () => {} }) };
  registerSocketHandlers(io as unknown as IOServer, { livePhysics: false });
  const handlers = new Map<string, (...args: unknown[]) => void>(), id = `compat-${Math.random()}`;
  connections.push(id);
  connect({ id, on: (event: string, handler: (...args: unknown[]) => void) => handlers.set(event, handler), emit: () => {} });
  setConn(id, { sessionId, role: 'dm', viewMapId: mapId, playerId: null });
  return { send: (event: string, payload: unknown) => handlers.get(event)!(payload) };
}

describe('Spellbook capabilities cover the actual catalogue without promising unsupported mechanics', () => {
  it('classifies every spell, including entries that have no saved roll or id', () => {
    const spells = getAllSpells().filter(entry => entry.type === 'spell');
    expect(spells.length).toBeGreaterThan(300);
    expect(spells.some(entry => !entry.roll)).toBe(true);
    for (const entry of spells) {
      const support = spellCombatSupport(entry);
      expect(support, entry.name).not.toBeNull();
      expect(['ready', 'partial', 'manual'], entry.name).toContain(support!.status);
      expect(support!.label, entry.name).toBeTruthy();
      expect(support!.automated.length, entry.name).toBeGreaterThan(0);
      if (support!.status === 'ready') {
        expect(support!.manual, entry.name).toEqual([]);
        expect(support!.manualCastOnly, entry.name).toBe(false);
      } else expect(support!.manual.length, entry.name).toBeGreaterThan(0);
      if (support!.manualCastOnly) expect(support!.status, entry.name).toBe('manual');
    }
    expect(spellCombatSupport({ name: 'Second Wind', type: 'ability' })).toBeNull();
  });
  it.each([
    'Aid', 'Armor of Agathys', 'True Strike', 'Ice Knife', 'Ice Storm', 'Flame Strike', 'Meteor Swarm',
    'Mass Heal', 'Prayer of Healing', 'Conjure Animals',
    'Conjure Woodland Beings', 'Elemental Weapon', 'Bestow Curse',
    'Dream', 'Earthquake', 'Glyph of Warding',
    'Feeblemind', 'Hunger of Hadar',
  ])('blocks the incomplete catalogue effect for %s while retaining the saved spell', name => {
    const entry = spell(name), before = structuredClone(entry);
    expect(spellCombatSupport(entry)).toMatchObject({ status: 'manual', manualCastOnly: true });
    expect(entry).toEqual(before);
  });
  it('preserves authored roll variants instead of forcing catalogue rules onto homebrew', () => {
    for (const flag of [{ source: 'custom' as const }, { executionProfile: 'manual' as const }]) {
      const entry: SheetAbility = { ...spell('Inflict Wounds'), ...flag,
        roll: { kind: 'attack', dice: '7d6+2', damageType: 'cold', castingAbility: 'INT' } };
      const before = structuredClone(entry);
      expect(spellCombatSupport(entry)).toMatchObject({ status: 'partial', manualCastOnly: false });
      expect(effectiveSheetAbility(entry)).toBe(entry);
      expect(entry).toEqual(before);
    }
  });
  it('retains an edited saved SRD formula even when its unchanged namesake requires manual casting', () => {
    const edited: SheetAbility = { ...spell('Ice Storm'), source: 'srd',
      roll: { ...spell('Ice Storm').roll!, dice: '7d6', scaleDice: '2d6', damageType: 'cold' } };
    const before = structuredClone(edited);
    expect(spellCombatSupport(edited)).toMatchObject({ status: 'partial', manualCastOnly: false });
    expect(effectiveSheetAbility(edited).roll).toEqual(before.roll);
    expect(edited).toEqual(before);
  });
  it('retains added authored mechanics even when the older dice formula is unchanged', () => {
    const edited: SheetAbility = { ...spell('False Life'), source: 'srd',
      roll: { kind: 'heal', dice: '1d4+4', baseLevel: 1, damageType: 'healing', healingBonus: 'none' } };
    const before = structuredClone(edited);
    expect(effectiveSheetAbility(edited)).toBe(edited);
    expect(spellCombatSupport(edited)).toMatchObject({ status: 'partial', manualCastOnly: false });
    expect(edited).toEqual(before);
  });
  it('labels edited damage, save and instance metadata as unreviewed rather than combat ready', () => {
    const edits: SheetAbility[] = [
      { ...spell('Cure Wounds'), roll: { ...spell('Cure Wounds').roll!, dice: '7d6' } },
      { ...spell('Cure Wounds'), roll: { ...spell('Cure Wounds').roll!, healingBonus: 'none' } },
      { ...spell('Sacred Flame'), roll: { ...spell('Sacred Flame').roll!, save: 'CON' } },
      { ...spell('Sacred Flame'), roll: { ...spell('Sacred Flame').roll!, saveDamage: 'half' } },
      { ...spell('Sacred Flame'), roll: { ...spell('Sacred Flame').roll!, targetMode: 'multiple' } },
      { ...spell('Magic Missile'), roll: { ...spell('Magic Missile').roll!, instances: 100 } },
      { ...spell('Scorching Ray'), roll: { ...spell('Scorching Ray').roll!, instances: 1 } },
      { ...spell('Eldritch Blast'), roll: { ...spell('Eldritch Blast').roll!, instances: 12 } },
      { ...spell('Chromatic Orb'), roll: { ...spell('Chromatic Orb').roll!, damageType: 'force' } },
    ];
    for (const edited of edits) {
      const before = structuredClone(edited);
      expect(spellCombatSupport(edited), JSON.stringify(edited.roll)).toMatchObject({ status: 'partial', manualCastOnly: false });
      expect(edited).toEqual(before);
    }
  });
  it('distinguishes post-hit spells, marks and buff markers from fully automated effects', () => {
    for (const name of ["Hunter's Mark", 'Hex', 'Hail of Thorns', 'Ensnaring Strike'])
      expect(spellCombatSupport(spell(name)), name).toMatchObject({ status: 'partial', manualCastOnly: false });
    for (const name of ['Hypnotic Pattern', 'Command']) {
      const support = spellCombatSupport(spell(name))!;
      expect(support).toMatchObject({ status: 'partial', manualCastOnly: false });
      expect(support.manual.length).toBeGreaterThan(0);
    }
    expect(spellCombatSupport(spell('Divine Smite'))).toMatchObject({ status: 'ready', manualCastOnly: false });
    for (const name of ['Haste', 'Hold Person'])
      expect(spellCombatSupport(spell(name))).toMatchObject({ status: 'ready', manualCastOnly: false });
  });
  it('does not label all attacks or heals combat ready merely because they have dice', () => {
    expect(spellCombatSupport(spell('Guiding Bolt'))?.status).toBe('partial');
    expect(spellCombatSupport(spell('Mass Healing Word'))?.status).toBe('partial');
    expect(spellCombatSupport(spell('Regenerate'))?.status).toBe('partial');
    expect(spellCombatSupport(spell('Haste'))!.automated.join(' ')).toMatch(/AC.*speed.*Dexterity/i);
    expect(spellCombatSupport(spell('Shield'))).toMatchObject({ status: 'manual', manualCastOnly: true });
  });
  it.each(['Eldritch Blast', 'Chromatic Orb', 'Magic Missile', 'Scorching Ray',
    'Cure Wounds', 'Healing Word', 'Sacred Flame', 'Divine Smite', 'False Life', 'Poison Spray', 'Inflict Wounds'])
  ('retains the reviewed core combat path for %s', name => {
    expect(spellCombatSupport(spell(name))).toMatchObject({ status: 'ready', manualCastOnly: false });
  });
});

describe('reviewed catalogue entries execute through current combat paths', () => {
  it('uses the spell source class for a multiclass attack and does not roll damage on a miss', () => {
    const f = arena([row('wizard', 1), row('sorcerer', 4)]), bolt = spell('Fire Bolt', 'sorcerer');
    const calls: number[][] = [];
    withDiceSource(sides => { calls.push(sides); return sides.map(() => 9); }, () => {
      expect(resolveAbilityRoll(f.session.id, 'Caster', f.caster, bolt, 0, undefined, f.target.id)).toBe(true);
    });
    const result = listRollLog(f.session.id).at(-1)!;
    expect(calls).toEqual([[20]]);
    expect(result.reveal).toMatchObject({ attackTotal: 14, outcome: 'miss' }); // 9 + total-level PB3 + CHA2
    expect(result.pending).toBeUndefined();
    expect(getMonster(f.monster.id)!.curHp).toBe(120);
  });
  it('shows a critical cantrip hit first and doubles every damage die at total-character level', async () => {
    const f = arena([row('wizard', 1), row('sorcerer', 4)]), bolt = spell('Fire Bolt', 'sorcerer');
    const requests: { sides: number[]; info?: PhysicalDiceInfo }[] = [];
    const live = (run: () => void) => runLiveCommand(run, () => {},
      { label: 'Fire Bolt', roller: 'Caster', className: 'Sorcerer' },
      async (sides, _publish, _meta, _seed, info) => {
        requests.push({ sides, info }); return sides.map(die => die === 20 ? 20 : 4);
      });
    await live(() => {
      resolveAbilityRoll(f.session.id, 'Caster', f.caster, bolt, 0, undefined, f.target.id);
    });
    const hit = listRollLog(f.session.id).at(-1)!;
    expect(requests.map(r => r.sides)).toEqual([[20]]);
    expect(hit.reveal?.outcome).toBe('crit'); expect(hit.pending).toBeTruthy();
    expect(getMonster(f.monster.id)!.curHp).toBe(120);
    await live(() => { resolveAttackDamage(f.session.id, 'Caster', hit.id); });
    expect(requests.flatMap(r => r.sides)).toEqual([20, 10, 10, 10, 10]); // 2d10 at total5, then the extra crit2d10
    expect(requests.flatMap(r => r.info?.criticalDice ?? [])).toEqual([false, false, true, true]);
    const result = listRollLog(f.session.id).at(-1)!;
    expect(result.reveal).toMatchObject({ damage: 16, target: f.monster.name });
    expect(getMonster(f.monster.id)!.curHp).toBe(104);
  });
  it('upcasts Cure Wounds through the selected Pact pool while using its Cleric Wisdom bonus', () => {
    const f = arena([row('warlock', 3), row('cleric', 1)]), cure = spell('Cure Wounds', 'cleric');
    setSheetAbility('pc', f.caster.id, cure); updateCharacter(f.caster.id, { curHp: 10 });
    const dm = dmSocket(f.session.id, f.map.id), calls: number[][] = [];
    withDiceSource(sides => { calls.push(sides); return sides.map(() => 4); }, () => dm.send('ability:roll', {
      kind: 'pc', refId: f.caster.id, abilityId: cure.id, castLevel: 1, slotPool: 'pact', targetTokenId: f.self.id,
    }));
    expect(calls).toEqual([[8, 8, 8, 8]]);
    const loaded = getCharacter(f.caster.id)!;
    expect(loaded.curHp).toBe(29); // 4d8[4] + WIS3; neither INT5 nor Warlock CHA2
    expect(loaded.spellSlots).toMatchObject({ P2: { used: 1 }, L1: { used: 0 } });
    const result = listRollLog(f.session.id).at(-1)!;
    expect(result.reveal).toMatchObject({ damage: 19, target: 'Caster', damageMods: [{ label: 'WIS modifier', value: 3 }] });
  });
  it('Sacred Flame reports a successful Dexterity save without damaging the target', () => {
    const f = arena([row('cleric', 5)]), sacred = spell('Sacred Flame', 'cleric');
    withDiceSource(sides => sides.map(die => die === 20 ? 20 : 4), () => {
      resolveAbilityRoll(f.session.id, 'Caster', f.caster, sacred, 0);
      const cast = listRollLog(f.session.id).at(-1)!;
      expect(cast.apply).toMatchObject({ dc: 14, save: 'DEX', saveDamage: 'none', amount: 8 });
      resolveForcedSave(f.session.id, cast.id, f.target.id);
    });
    expect(getMonster(f.monster.id)!.curHp).toBe(120);
    expect(listRollLog(f.session.id).at(-1)?.reveal).toMatchObject({ outcome: 'pass' });
  });
});
