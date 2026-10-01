import { afterEach, describe, expect, it, vi } from 'vitest';
import { registerSocketHandlers } from './socketHandlers.js';
import { dropConn, setConn, type IOServer } from './connections.js';
import {
  claimCharacter, createCharacter, createMap, createMonsterTemplate, createSession, createToken,
  getCharacter, getMonster, instantiateMonster, listRollLog, listTokens, setActiveMap,
  setConcentration, setSheetAbility, updateCharacter,
} from './sessions.js';
import { resolveAbilityRoll } from './combat.js';
import { getSpell } from './spells/srd.js';
import { withDiceSource } from '../../shared/dice.js';
import type { SheetAbility } from '../../shared/types.js';

// Vitest always allocates its own temporary database, never the campaign save.
const connections: string[] = [];
afterEach(() => { for (const id of connections.splice(0)) dropConn(id); vi.restoreAllMocks(); });

function socketFor(sessionId: string, mapId: string) {
  let connect!: (socket: unknown) => void;
  const io = { on: (_: string, handler: typeof connect) => { connect = handler; }, to: () => ({ emit: () => {} }) };
  registerSocketHandlers(io as unknown as IOServer, { livePhysics: false });
  const handlers = new Map<string, (payload: unknown) => void>(), id = `manual-spell-${Math.random()}`;
  connections.push(id);
  const emit = vi.fn();
  connect({ id, on: (event: string, handler: (payload: unknown) => void) => handlers.set(event, handler), emit });
  setConn(id, { sessionId, role: 'player', viewMapId: mapId, playerId: null });
  return { id, emit, send: (event: string, payload: unknown) => handlers.get(event)!(payload) };
}

function fixture(name: string, overrides: Partial<SheetAbility> = {}, multiclass = false) {
  const session = createSession('Manual spell casts'), map = createMap(session.id, { name: 'Arena' });
  setActiveMap(session.id, map.id);
  const caster = createCharacter(session.id, {
    name: 'Caster', className: 'Wizard', level: multiclass ? 8 : 5, maxHp: 30, curHp: 7,
    stats: { STR: 10, DEX: 12, CON: 12, INT: 16, WIS: 12, CHA: 16 },
    ...(multiclass ? { leveling: { rules: '2024' as const, classes: [{ className: 'wizard' as const, level: 3 }, { className: 'warlock' as const, level: 5 }], history: [] } } : {}),
  });
  const monster = instantiateMonster(createMonsterTemplate(session.id, { name: 'Recipient', maxHp: 40 }).id)!;
  const target = createToken({ mapId: map.id, kind: 'monster', refId: monster.id, x: 150, y: 100 });
  createToken({ mapId: map.id, kind: 'pc', refId: caster.id, x: 100, y: 100 });
  const ability: SheetAbility = { ...getSpell(name)!, id: 'spell', source: 'srd', ...overrides };
  if (!ability.name) throw new Error(`Missing catalog spell: ${name}`);
  setSheetAbility('pc', caster.id, ability);
  const client = socketFor(session.id, map.id); claimCharacter(caster.id, client.id);
  const cast = (extra = {}) => client.send('ability:roll', { kind: 'pc', refId: caster.id, abilityId: ability.id, ...extra });
  return { session, map, caster, monster, target, ability, client, cast };
}

describe('recorded casts for spells with manual effects', () => {
  it('casts a utility spell once, spends its chosen slot, and logs the manual effect without a damage payload', () => {
    const f = fixture('Misty Step'), before = getCharacter(f.caster.id)!;
    f.cast({ castLevel: 2 });
    const after = getCharacter(f.caster.id)!, entries = listRollLog(f.session.id);
    expect(after.spellSlots.L2.used).toBe(before.spellSlots.L2.used + 1);
    expect(after.curHp).toBe(before.curHp);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ label: 'Misty Step', total: 0 });
    expect(entries[0].detail).toMatch(/manual/i);
    expect(entries[0].apply).toBeUndefined(); expect(entries[0].pending).toBeUndefined();
    expect(entries[0].reveal).toBeUndefined();
    expect(after.sheetAbilities.find(a => a.id === f.ability.id)).toEqual(f.ability);
  });

  it('starts concentration for a manual buff and replaces the previous spell without inventing target conditions', () => {
    const f = fixture('Bless'); setConcentration('pc', f.caster.id, 'Detect Magic');
    f.cast({ castLevel: 1, targetTokenId: f.target.id });
    const after = getCharacter(f.caster.id)!;
    expect(after.spellSlots.L1.used).toBe(1);
    expect(after.conditions.filter(c => c.isConcentration).map(c => c.label)).toEqual(['Concentration: Bless']);
    expect(getMonster(f.monster.id)!.conditions).toEqual([]);
    expect(listRollLog(f.session.id).find(entry => entry.label === 'Bless')!.detail).toMatch(/manual/i);
  });

  it.each(['False Life', 'Aid', 'Armor of Agathys', 'True Strike', 'Inflict Wounds', 'Poison Spray', 'Ice Storm', 'Sorcerous Burst'])
  ('%s records a manual cast instead of applying its misleading saved roll', name => {
    const f = fixture(name), before = getCharacter(f.caster.id)!, targetBefore = getMonster(f.monster.id)!;
    f.cast({ castLevel: f.ability.level, targetTokenId: f.target.id });
    const after = getCharacter(f.caster.id)!, targetAfter = getMonster(f.monster.id)!, entries = listRollLog(f.session.id);
    expect(after.curHp).toBe(before.curHp); expect(after.maxHp).toBe(before.maxHp); expect(after.tempHp).toBe(before.tempHp);
    expect(targetAfter.curHp).toBe(targetBefore.curHp); expect(targetAfter.maxHp).toBe(targetBefore.maxHp);
    expect(entries).toHaveLength(1); expect(entries[0].label).toBe(name); expect(entries[0].detail).toMatch(/manual/i);
    expect(entries[0].detail).toContain('Recipient');
    expect(entries[0].apply).toBeUndefined(); expect(entries[0].pending).toBeUndefined(); expect(entries[0].reveal).toBeUndefined();
    expect(after.sheetAbilities.find(a => a.id === f.ability.id)).toEqual(f.ability);
  });

  it('a manual cast spends the selected Pact pool and records the actual upcast level', () => {
    const f = fixture('Misty Step', {}, true), before = getCharacter(f.caster.id)!;
    f.cast({ castLevel: 2, slotPool: 'pact' });
    const after = getCharacter(f.caster.id)!;
    expect(after.spellSlots.P3.used).toBe(before.spellSlots.P3.used + 1);
    expect(after.spellSlots.L2.used).toBe(before.spellSlots.L2.used);
    expect(listRollLog(f.session.id)[0].detail).toMatch(/(?:level|L)\s*3/i);
  });

  it.each([{ source: 'custom' as const }, { executionProfile: 'manual' as const }])
  ('preserves an explicitly authored False Life roll with %j', optOut => {
    const f = fixture('False Life', { ...optOut, roll: { kind: 'heal', dice: '1d4', healingBonus: 'none', healTarget: 'self', baseLevel: 1 } });
    withDiceSource(sides => sides.map(() => 3), () => f.cast({ castLevel: 1 }));
    expect(getCharacter(f.caster.id)!.curHp).toBe(10);
    expect(listRollLog(f.session.id).at(-1)!.reveal?.kind).toBe('dice');
    expect(getCharacter(f.caster.id)!.sheetAbilities.find(a => a.id === f.ability.id)).toEqual(f.ability);
  });

  it('does not replace an explicitly authored Haste roll with the built-in buff marker', () => {
    const f = fixture('Haste', { executionProfile: 'manual', roll: { kind: 'heal', dice: '1d4', healingBonus: 'none', healTarget: 'self', baseLevel: 3 } });
    withDiceSource(sides => sides.map(() => 3), () => f.cast({ castLevel: 3 }));
    expect(getCharacter(f.caster.id)!.curHp).toBe(10);
    expect(getCharacter(f.caster.id)!.conditions.some(c => c.label === 'Haste')).toBe(false);
    expect(getMonster(f.monster.id)!.conditions).toEqual([]);
    expect(listRollLog(f.session.id).at(-1)!.reveal?.kind).toBe('dice');
  });

  it('records a manual cantrip without spending a slot and does not turn non-spell descriptions into casts', () => {
    const f = fixture('Light'), before = getCharacter(f.caster.id)!.spellSlots;
    f.cast(); expect(getCharacter(f.caster.id)!.spellSlots).toEqual(before);
    expect(listRollLog(f.session.id)[0].detail).toMatch(/manual/i);
    expect(resolveAbilityRoll(f.session.id, 'Caster', getCharacter(f.caster.id)!, { id: 'note', name: 'Story note', type: 'ability', description: 'A descriptive ability.' })).toBe(false);
    expect(listRollLog(f.session.id)).toHaveLength(1);
  });

  it('an explicitly authored companion tracks concentration and states that its stats and duration need DM handling', () => {
    const f = fixture('Conjure Animals', { name: 'Arcane Companion', source: 'custom', summon: { name: 'Companion' } });
    f.client.send('summon:cast', { kind: 'pc', refId: f.caster.id, abilityId: f.ability.id, mapId: f.map.id, x: 200, y: 100, castLevel: 3 });
    const after = getCharacter(f.caster.id)!;
    expect(after.spellSlots.L3.used).toBe(1);
    expect(after.conditions.filter(c => c.isConcentration).map(c => c.label)).toEqual(['Concentration: Arcane Companion']);
    expect(listTokens(f.map.id).filter(t => t.kind === 'monster')).toHaveLength(2);
    const entry = listRollLog(f.session.id).find(log => log.label === 'Arcane Companion')!;
    expect(entry.detail).toMatch(/manual/i); expect(entry.detail).toMatch(/stat/i); expect(entry.detail).toMatch(/duration/i);
    expect(entry.reveal).toBeUndefined(); expect(entry.apply).toBeUndefined();
  });

  it('blocks an older catalogue Conjure summon without spending a slot, then records the supported manual cast', () => {
    const f = fixture('Conjure Animals'), before = getCharacter(f.caster.id)!;
    f.client.send('summon:cast', { kind: 'pc', refId: f.caster.id, abilityId: f.ability.id, mapId: f.map.id, x: 200, y: 100, castLevel: 3 });
    expect(getCharacter(f.caster.id)!.spellSlots).toEqual(before.spellSlots);
    expect(getCharacter(f.caster.id)!.conditions).toEqual(before.conditions);
    expect(listTokens(f.map.id).filter(t => t.kind === 'monster')).toHaveLength(1);
    expect(f.client.emit).toHaveBeenCalledWith('notice', expect.objectContaining({ message: expect.stringContaining('Cast (manual)') }));
    expect(listRollLog(f.session.id)).toEqual([]);
    f.cast({ castLevel: 3 });
    expect(getCharacter(f.caster.id)!.spellSlots.L3.used).toBe(1);
    expect(getCharacter(f.caster.id)!.conditions.some(c => c.label === 'Concentration: Conjure Animals')).toBe(true);
    expect(listRollLog(f.session.id).at(-1)!.detail).toMatch(/manual/i);
    expect(listTokens(f.map.id).filter(t => t.kind === 'monster')).toHaveLength(1);
  });

  it('another player cannot record a manual cast or spend the owner slot', () => {
    const f = fixture('Misty Step'), stranger = socketFor(f.session.id, f.map.id), before = getCharacter(f.caster.id)!;
    stranger.send('ability:roll', { kind: 'pc', refId: f.caster.id, abilityId: f.ability.id, castLevel: 2 });
    expect(getCharacter(f.caster.id)!.spellSlots).toEqual(before.spellSlots);
    expect(listRollLog(f.session.id)).toEqual([]);
  });
});
