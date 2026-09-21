import { afterEach, describe, expect, it, vi } from 'vitest';
import { registerSocketHandlers } from './socketHandlers.js';
import { dropConn, setConn, type IOServer } from './connections.js';
import {
  addRollLog, claimCharacter, createCharacter, createMap, createMonsterTemplate, createSession,
  createToken, getCharacter, getMonster, getRollEntry, instantiateMonster, listRollLog,
  setActiveMap, setSheetAbility, setTokenHidden,
  setManualDamage, setFogLayer,
} from './sessions.js';
import { getSpell } from './spells/srd.js';
import type { SheetAbility } from '../../shared/types.js';

const connected: string[] = [];
afterEach(() => { for (const id of connected.splice(0)) dropConn(id); vi.restoreAllMocks(); });

/** Exercise the actual registered, wrapped handlers without listening on a port
 * or using any production process/storage. Vitest owns a throwaway DATA_ROOT. */
function harness(sessionId: string, mapId: string, role: 'player' | 'dm' = 'player') {
  let connect!: (socket: unknown) => void;
  const routed: Array<{ socketId: string; event: string; payload: any }> = [];
  const io = { on: (_: string, cb: typeof connect) => { connect = cb; }, to: (socketId: string) => ({
    emit: (event: string, payload: unknown) => routed.push({ socketId, event, payload }),
  }) };
  registerSocketHandlers(io as unknown as IOServer);
  const handlers = new Map<string, (...args: unknown[]) => void>();
  const id = `spell-test-socket-${connected.length}-${Math.random()}`;
  connected.push(id);
  const emit = vi.fn();
  connect({ id, on: (event: string, handler: (...args: unknown[]) => void) => handlers.set(event, handler), emit });
  setConn(id, { sessionId, role, viewMapId: mapId, playerId: null });
  return { id, emit, routed, send: (event: string, payload: unknown) => handlers.get(event)!(payload) };
}

function fixture() {
  const session = createSession('Socket spell guards');
  const map = createMap(session.id, { name: 'Active' });
  setActiveMap(session.id, map.id);
  const caster = createCharacter(session.id, { name: 'Sorcerer', className: 'Sorcerer', level: 6, stats: { CHA: 16 } });
  const ability: SheetAbility = { ...getSpell('Command')!, id: 'command' };
  setSheetAbility('pc', caster.id, ability);
  const target = (onMap = map.id) => {
    const template = createMonsterTemplate(session.id, { name: 'Target', maxHp: 40, stats: { WIS: 10 } });
    const monster = instantiateMonster(template.id)!;
    const token = createToken({ mapId: onMap, kind: 'monster', refId: monster.id, x: 100, y: 100 });
    return { monster, token };
  };
  return { session, map, caster, target, ability };
}

describe('spell socket target and ownership boundaries', () => {
  it('sends one visible cast pulse for a cantrip and a leveled spell, never for individual beam hits', () => {
    const f = fixture(), client = harness(f.session.id, f.map.id), target = f.target();
    claimCharacter(f.caster.id, client.id);
    setFogLayer(f.map.id, 'map', false); setFogLayer(f.map.id, 'tokens', false);
    const token = createToken({ mapId: f.map.id, kind: 'pc', refId: f.caster.id, x: 50, y: 50 });
    for (const name of ['Eldritch Blast', 'Scorching Ray']) {
      const ability = { ...getSpell(name)!, id: name };
      setSheetAbility('pc', f.caster.id, ability);
      client.send('ability:roll', { kind: 'pc', refId: f.caster.id, abilityId: name });
      const roll = listRollLog(f.session.id).at(-1)!;
      client.send('save:resolve', { rollId: roll.id, tokenId: target.token.id, instanceIndex: 0 });
    }
    const pulses = client.routed.filter(e => e.event === 'fx:spellCast' && e.socketId === client.id);
    expect(pulses.map(e => e.payload)).toEqual([{ tokenIds: [token.id] }, { tokenIds: [token.id] }]);
  });
  it('does not leak hidden, fog-covered, staged or foreign casters through cast effects', () => {
    const f = fixture(), dm = harness(f.session.id, f.map.id, 'dm');
    const viewer = harness(f.session.id, f.map.id), foreign = fixture();
    const outsider = harness(foreign.session.id, foreign.map.id);
    setFogLayer(f.map.id, 'map', false); setFogLayer(f.map.id, 'tokens', false);
    const token = createToken({ mapId: f.map.id, kind: 'pc', refId: f.caster.id, x: 50, y: 50 });
    const stagedMap = createMap(f.session.id, { name: 'Staged caster' });
    createToken({ mapId: stagedMap.id, kind: 'pc', refId: f.caster.id, x: 50, y: 50 });
    const ability = { ...getSpell('Eldritch Blast')!, id: 'blast' };
    setSheetAbility('pc', f.caster.id, ability);
    const cast = () => dm.send('ability:roll', { kind: 'pc', refId: f.caster.id, abilityId: ability.id });
    setTokenHidden(token.id, true); cast();
    setTokenHidden(token.id, false); setFogLayer(f.map.id, 'map', true); cast();
    expect(dm.routed.filter(e => e.event === 'fx:spellCast' && e.socketId === viewer.id)).toEqual([]);
    setFogLayer(f.map.id, 'map', false); cast();
    expect(dm.routed.filter(e => e.event === 'fx:spellCast' && e.socketId === viewer.id).map(e => e.payload))
      .toEqual([{ tokenIds: [token.id] }]);
    expect(dm.routed.filter(e => e.event === 'fx:spellCast' && e.socketId === outsider.id)).toEqual([]);
  });
  it('rejected casts and ordinary abilities never pulse; accepted summons do', () => {
    const f = fixture(), client = harness(f.session.id, f.map.id);
    claimCharacter(f.caster.id, client.id);
    setFogLayer(f.map.id, 'map', false); setFogLayer(f.map.id, 'tokens', false);
    const token = createToken({ mapId: f.map.id, kind: 'pc', refId: f.caster.id, x: 50, y: 50 });
    const orb = { ...getSpell('Chromatic Orb')!, id: 'orb' };
    setSheetAbility('pc', f.caster.id, orb);
    client.send('ability:roll', { kind: 'pc', refId: f.caster.id, abilityId: 'orb' });
    client.send('ability:roll', { kind: 'pc', refId: f.caster.id, abilityId: 'missing' });
    setSheetAbility('pc', f.caster.id, { id: 'ordinary', name: 'Ordinary', type: 'ability', description: '', roll: { kind: 'damage', dice: '1d4' } });
    client.send('ability:roll', { kind: 'pc', refId: f.caster.id, abilityId: 'ordinary' });
    expect(client.routed.filter(e => e.event === 'fx:spellCast')).toEqual([]);
    setSheetAbility('pc', f.caster.id, { id: 'summon', name: 'Mage Hand', type: 'spell', level: 0, description: '', summon: { name: 'Hand' } });
    client.send('summon:cast', { kind: 'pc', refId: f.caster.id, abilityId: 'summon', mapId: f.map.id, x: 150, y: 150 });
    expect(client.routed.filter(e => e.event === 'fx:spellCast').map(e => e.payload)).toEqual([{ tokenIds: [token.id] }]);
  });
  it('the owner casts the existing Command entry, spends one slot and forces the selected save once', () => {
    const f = fixture(), target = f.target(), client = harness(f.session.id, f.map.id);
    claimCharacter(f.caster.id, client.id);
    const before = getCharacter(f.caster.id)!.spellSlots.L1.used;
    client.send('ability:roll', { kind: 'pc', refId: f.caster.id, abilityId: f.ability.id, castLevel: 1, targetTokenId: target.token.id });
    const logs = listRollLog(f.session.id);
    expect(logs.filter((e) => e.apply)).toHaveLength(1);
    expect(logs.filter((e) => e.label === 'WIS save')).toHaveLength(1);
    expect(getCharacter(f.caster.id)!.spellSlots.L1.used).toBe(before + 1);
    expect(getMonster(target.monster.id)!.conditions).toEqual([]);
    expect(client.emit).not.toHaveBeenCalledWith('error', expect.anything());
  });
  it('rejects hidden, staged, cross-session and missing targets before any spell effect or slot spend', () => {
    const f = fixture(), other = fixture(), foreign = other.target();
    const hidden = f.target();
    setTokenHidden(hidden.token.id, true);
    const staged = f.target(createMap(f.session.id, { name: 'Staged' }).id);
    const client = harness(f.session.id, f.map.id);
    claimCharacter(f.caster.id, client.id);
    const before = getCharacter(f.caster.id)!;
    for (const targetTokenId of [hidden.token.id, staged.token.id, foreign.token.id, 'missing']) {
      client.send('ability:roll', { kind: 'pc', refId: f.caster.id, abilityId: f.ability.id, castLevel: 1, targetTokenId });
    }
    expect(listRollLog(f.session.id)).toEqual([]);
    expect(getCharacter(f.caster.id)!.spellSlots).toEqual(before.spellSlots);
    expect(getCharacter(f.caster.id)!.conditions).toEqual(before.conditions);
    expect(client.emit.mock.calls.filter((args) => args[0] === 'notice')).toHaveLength(4);
  });
  it('another player cannot cast the owner spell or apply their saved roll', () => {
    const f = fixture(), target = f.target(), owner = harness(f.session.id, f.map.id), stranger = harness(f.session.id, f.map.id);
    claimCharacter(f.caster.id, owner.id);
    stranger.send('ability:roll', { kind: 'pc', refId: f.caster.id, abilityId: f.ability.id, targetTokenId: target.token.id });
    expect(listRollLog(f.session.id)).toEqual([]);
    const roll = addRollLog(f.session.id, { roller: 'Caster', label: 'Test', expr: '', detail: '', total: 10,
      apply: { amount: 10, dc: 1, owner: f.caster.id } });
    stranger.send('save:resolve', { rollId: roll.id, tokenId: target.token.id });
    expect(getMonster(target.monster.id)!.curHp).toBe(40);
    owner.send('save:resolve', { rollId: roll.id, tokenId: target.token.id });
    owner.send('save:resolve', { rollId: roll.id, tokenId: target.token.id });
    expect(getMonster(target.monster.id)!.curHp).toBe(30);
  });
  it('applying a saved roll rejects foreign sources and invisible targets, even for a caller owning the caster', () => {
    const f = fixture(), other = fixture(), local = f.target(), foreign = other.target();
    const client = harness(f.session.id, f.map.id);
    claimCharacter(f.caster.id, client.id);
    const roll = addRollLog(f.session.id, { roller: 'Caster', label: 'Test', expr: '', detail: '', total: 10,
      apply: { amount: 10, dc: 1, owner: f.caster.id } });
    const foreignRoll = addRollLog(other.session.id, { roller: 'Caster', label: 'Test', expr: '', detail: '', total: 10,
      apply: { amount: 10, dc: 1, owner: f.caster.id } });
    client.send('save:resolve', { rollId: foreignRoll.id, tokenId: local.token.id });
    client.send('save:resolve', { rollId: roll.id, tokenId: foreign.token.id });
    setTokenHidden(local.token.id, true);
    client.send('save:resolve', { rollId: roll.id, tokenId: local.token.id });
    expect(getMonster(local.monster.id)!.curHp).toBe(40);
    expect(getMonster(foreign.monster.id)!.curHp).toBe(40);
    expect(getRollEntry(roll.id)!.apply?.consumedTargets).toBeUndefined();
  });
  it('a DM is also restricted to their own session for creature casts and pending damage', () => {
    const f = fixture(), other = fixture(), target = other.target(), dm = harness(f.session.id, f.map.id, 'dm');
    setSheetAbility('monster', target.monster.id, f.ability);
    dm.send('ability:roll', { kind: 'monster', refId: target.monster.id, abilityId: f.ability.id });
    const pending = addRollLog(other.session.id, { roller: 'DM', label: 'Attack', expr: '', detail: '', total: 20,
      pending: { target: { kind: 'monster', refId: target.monster.id, name: 'Target' },
        attacker: { kind: 'pc', refId: other.caster.id }, weapon: 'Test', amount: 10, crit: false, dice: [], mods: [] } });
    dm.send('combat:damage', { rollId: pending.id });
    expect(getMonster(target.monster.id)!.curHp).toBe(40);
    expect(getRollEntry(pending.id)!.pending?.done).toBeUndefined();
    expect(listRollLog(f.session.id)).toEqual([]);
  });
  it('spends one spell slot for all rays and no further slots for target clicks', () => {
    const f = fixture(), target = f.target(), client = harness(f.session.id, f.map.id);
    claimCharacter(f.caster.id, client.id);
    setManualDamage(f.session.id, false);
    const ability: SheetAbility = { ...getSpell('Scorching Ray')!, id: 'rays' };
    setSheetAbility('pc', f.caster.id, ability);
    const before = getCharacter(f.caster.id)!.spellSlots.L2.used;
    client.send('ability:roll', { kind: 'pc', refId: f.caster.id, abilityId: ability.id, castLevel: 2 });
    const cast = listRollLog(f.session.id).at(-1)!;
    expect(cast.apply?.attacks).toBe(3);
    for (let instanceIndex = 0; instanceIndex < 4; instanceIndex++)
      client.send('save:resolve', { rollId: cast.id, tokenId: target.token.id, instanceIndex });
    expect(getRollEntry(cast.id)?.apply?.consumedAttacks).toBe(3);
    expect(getCharacter(f.caster.id)!.spellSlots.L2.used).toBe(before + 1);
    expect(getCharacter(f.caster.id)!.sheetAbilities.find((a) => a.id === ability.id)).toEqual(ability);
  });
  it('rejects missing/invalid variable damage type before slot spend and accepts an allowed type', () => {
    const f = fixture(), target = f.target(), client = harness(f.session.id, f.map.id);
    claimCharacter(f.caster.id, client.id);
    const ability: SheetAbility = { ...getSpell('Chromatic Orb')!, id: 'orb' };
    setSheetAbility('pc', f.caster.id, ability);
    const before = getCharacter(f.caster.id)!.spellSlots.L1.used;
    const cast = { kind: 'pc', refId: f.caster.id, abilityId: ability.id, castLevel: 1, targetTokenId: target.token.id };
    client.send('ability:roll', cast);
    client.send('ability:roll', { ...cast, damageType: 'force' });
    expect(getCharacter(f.caster.id)!.spellSlots.L1.used).toBe(before);
    expect(listRollLog(f.session.id)).toEqual([]);
    expect(client.emit).toHaveBeenCalledWith('notice', expect.objectContaining({ message: expect.stringContaining('Choose a damage type') }));
    client.send('ability:roll', { ...cast, damageType: 'lightning' });
    expect(getCharacter(f.caster.id)!.spellSlots.L1.used).toBe(before + 1);
    expect(getCharacter(f.caster.id)!.sheetAbilities.find((a) => a.id === ability.id)).toEqual(ability);
  });
});
