import { describe, it, expect, vi, beforeEach } from 'vitest';

// The AI gateway is mocked: these tests pin what the creature prompt ASKS for and
// how its answer lands, without a network call.
const gateway = vi.hoisted(() => ({ prompts: [] as string[], reply: '' }));
vi.mock('./ai/gateway.js', async (orig) => ({
  ...(await orig<typeof import('./ai/gateway.js')>()),
  aiAvailable: () => true,
  generateJson: async (prompt: string) => { gateway.prompts.push(prompt); return gateway.reply; },
}));

import {
  createSession, createMonsterTemplate, getMonster, setAbilityRechargeSpent,
  createMap, setActiveMap, instantiateMonster, createToken, listRollLog,
} from './sessions.js';
import { registerSocketHandlers } from './socketHandlers.js';
import { dropConn, setConn, type IOServer } from './connections.js';
import { afterEach } from 'vitest';
import { getSrd } from './creatures/srd.js';
import { aiFillCreature, missingRechargeActions } from './creatures/fill.js';
import { lookupCreatureAI } from './creatures/gemini.js';
import {
  actionsToSheetAbilities, effectiveRecharge, parseRecharge, rechargeLabel, weaponsFromActions,
} from '../../shared/monsterAttacks.js';

let n = 0;
const makeId = () => `id-${++n}`;
const ability = (id: string, name: string) => getMonster(id)!.sheetAbilities.find((a) => a.name.startsWith(name));

beforeEach(() => { gateway.prompts.length = 0; gateway.reply = ''; });

describe('parseRecharge', () => {
  it.each([
    ['Fire Breath (Recharge 5–6)', '', { min: 5 }],
    ['Fire Breath (Recharge 5-6)', '', { min: 5 }],
    ['Spores (Recharge 6)', '', { min: 6 }],
    ['Whelm', 'Recharge 4–6. Engulfs creatures', { min: 4 }],
    ['Wind Burst (Recharges after a Short or Long Rest)', '', { rest: 'short' }],
    ['Petrifying Gaze', 'Recharges after a Long Rest.', { rest: 'long' }],
    ['Fear Aura (1/Day)', '', { rest: 'long' }],
  ])('%s → %o', (name, desc, want) => {
    expect(parseRecharge(name, desc)).toEqual(want);
  });

  it('an at-will action has none', () => {
    expect(parseRecharge('Bite', '+5 to hit, 2d6+3 piercing.')).toBeNull();
    expect(parseRecharge('Multiattack', 'Makes two claw attacks.')).toBeNull();
  });

  it('labels the chip', () => {
    expect(rechargeLabel({ min: 5 })).toBe('⟳ 5–6');
    expect(rechargeLabel({ min: 6 })).toBe('⟳ 6');
    expect(rechargeLabel({ rest: 'long' })).toBe('⟳ long rest');
  });
});

describe('recharge actions land as limited-use abilities', () => {
  it('an SRD dragon arrives with its breath as a Ready recharge ability', () => {
    const s = createSession('Dragon');
    const m = createMonsterTemplate(s.id, { ...getSrd('Young Red Dragon')!, source: 'srd' });
    const breath = ability(m.id, 'Fire Breath')!;
    expect(breath.recharge).toEqual({ min: 5 });
    expect(breath.roll?.kind).toBe('save'); // still rollable
    expect(getMonster(m.id)!.weapons.map((w) => w.name)).toEqual(['Bite', 'Claw']);
  });

  it('a recharge ATTACK stays an ability (not an at-will weapon) and keeps an attack roll', () => {
    const action = { name: 'Tail Spike (Recharge 5–6)', description: '+7 to hit, range 100/200 ft., 2d8+4 piercing.' };
    expect(weaponsFromActions([action]).weapons).toEqual([]);
    const [ab] = actionsToSheetAbilities([action], { makeId, source: 'srd' });
    expect(ab.recharge).toEqual({ min: 5 });
    expect(ab.roll).toMatchObject({ kind: 'attack', dice: '2d8+4', damageType: 'piercing', attackBonus: 7 });
  });

  it('a creature saved before the field existed still reads its marker from the name', () => {
    expect(effectiveRecharge({ name: 'Fire Breath (Recharge 5–6)', description: '' })).toEqual({ min: 5 });
  });
});

describe('Ready / Spent is manual and in place', () => {
  it('toggles without reordering, twice is a no-op, and at-will abilities refuse', () => {
    const s = createSession('Spent');
    const m = createMonsterTemplate(s.id, { ...getSrd('Young Red Dragon')!, source: 'srd' });
    const before = getMonster(m.id)!.sheetAbilities.map((a) => a.id);
    const breath = ability(m.id, 'Fire Breath')!;
    expect(setAbilityRechargeSpent('monster', m.id, breath.id, true)).toBe(true);
    expect(ability(m.id, 'Fire Breath')!.recharge).toEqual({ min: 5, spent: true });
    expect(getMonster(m.id)!.sheetAbilities.map((a) => a.id)).toEqual(before);
    const once = JSON.stringify(getMonster(m.id));
    setAbilityRechargeSpent('monster', m.id, breath.id, true);
    expect(JSON.stringify(getMonster(m.id))).toBe(once);
    setAbilityRechargeSpent('monster', m.id, breath.id, false);
    expect(ability(m.id, 'Fire Breath')!.recharge).toEqual({ min: 5 });
    const multi = ability(m.id, 'Multiattack')!;
    expect(setAbilityRechargeSpent('monster', m.id, multi.id, true)).toBe(false);
  });
});

describe('AI creature fill places recharge actions', () => {
  const dragonReply = JSON.stringify({
    name: 'Ash Drake', creatureType: 'Large dragon', level: 4, maxHp: 75, armorClass: 16, speed: '30 ft., fly 60 ft.',
    stats: { STR: 18, DEX: 12, CON: 16, INT: 8, WIS: 11, CHA: 10 },
    weapons: [{ name: 'Bite', kind: 'melee', damage: '2d8+4', attackBonus: 6 }],
    actions: [{ name: 'Ash Breath (Recharge 5–6)', description: '15-ft cone, DC 13 DEX saving throw, 6d6 fire damage.',
      recharge: { min: 5 }, roll: { kind: 'save', dice: '6d6', save: 'DEX', dc: 13, damageType: 'fire' } }],
    abilities: [], sheetAbilities: [],
  });

  it('the prompt asks for structured, manually-resolved recharge actions', async () => {
    gateway.reply = dragonReply;
    const tpl = await lookupCreatureAI('ash drake');
    expect(gateway.prompts[0]).toMatch(/"recharge":\{"min":number\}/);
    expect(gateway.prompts[0]).toMatch(/LIMITED-USE actions/);
    expect(gateway.prompts[0]).toMatch(/resolves recharge rolls manually/);
    expect(tpl!.actions[0].recharge).toEqual({ min: 5 });
  });

  it('a field-less JSON answer still gets the marker from the name', async () => {
    gateway.reply = JSON.stringify({ ...JSON.parse(dragonReply), actions: [{ name: 'Ash Breath (Recharge 6)', description: 'DC 13 DEX saving throw, 6d6 fire damage.' }] });
    const tpl = await lookupCreatureAI('ash drake');
    expect(tpl!.actions[0].recharge).toEqual({ min: 6 });
  });

  it('fills a MISSING breath weapon even when the creature already has weapons and abilities', async () => {
    const s = createSession('Fill');
    const m = createMonsterTemplate(s.id, {
      name: 'Ash Drake', maxHp: 75, armorClass: 16, level: 4, source: 'manual',
      weapons: [{ name: 'Bite', kind: 'melee', damage: '2d8+4', attackBonus: 6 }],
      sheetAbilities: [{ id: 'roar', name: 'Roar', type: 'ability', description: 'Frightening roar.' }],
    });
    gateway.reply = dragonReply;
    const res = await aiFillCreature(m.id);
    expect(res.ok).toBe(true);
    const breath = ability(m.id, 'Ash Breath')!;
    expect(breath.recharge).toEqual({ min: 5 });
    expect(breath.roll).toMatchObject({ kind: 'save', save: 'DEX', dc: 13 });
    expect(getMonster(m.id)!.sheetAbilities.map((a) => a.name)).toEqual(['Roar', 'Ash Breath (Recharge 5–6)']);
    // Never a second copy: a re-run (or a DM-named "Ash Breath") is matched without the marker.
    await aiFillCreature(m.id);
    expect(getMonster(m.id)!.sheetAbilities.filter((a) => a.name.startsWith('Ash Breath'))).toHaveLength(1);
  });

  it('matches names without the marker', () => {
    const tpl = { actions: [{ name: 'Fire Breath (Recharge 5–6)', description: 'x', recharge: { min: 5 } }], sheetAbilities: [] };
    expect(missingRechargeActions(tpl, { sheetAbilities: [{ name: 'Fire Breath' }], weapons: [] })).toEqual([]);
    expect(missingRechargeActions(tpl, { sheetAbilities: [], weapons: [] })).toHaveLength(1);
  });
});

const connected: string[] = [];
afterEach(() => { for (const id of connected.splice(0)) dropConn(id); });
/** The real registered handlers, no port (same pattern as spell-socket-guards). */
function harness(sessionId: string, mapId: string, role: 'player' | 'dm') {
  let connect!: (socket: unknown) => void;
  const io = { on: (_: string, cb: typeof connect) => { connect = cb; }, to: () => ({ emit: () => {} }) };
  registerSocketHandlers(io as unknown as IOServer, { livePhysics: false });
  const handlers = new Map<string, (...args: unknown[]) => void>();
  const id = `recharge-socket-${connected.length}-${Math.random()}`;
  connected.push(id);
  connect({ id, on: (event: string, handler: (...args: unknown[]) => void) => handlers.set(event, handler), emit: () => {} });
  setConn(id, { sessionId, role, viewMapId: mapId, playerId: null });
  return { send: (event: string, payload: unknown) => handlers.get(event)!(payload) };
}

describe('recharge over the socket', () => {
  it('using the breath spends it; only its controller can ready it again', () => {
    const s = createSession('Breath');
    const map = createMap(s.id, { name: 'Lair' });
    setActiveMap(s.id, map.id);
    const tpl = createMonsterTemplate(s.id, { ...getSrd('Young Red Dragon')!, source: 'srd' });
    const dragon = instantiateMonster(tpl.id)!;
    createToken({ mapId: map.id, kind: 'monster', refId: dragon.id, x: 100, y: 100 });
    const breath = dragon.sheetAbilities.find((a) => a.name.startsWith('Fire Breath'))!;
    const dm = harness(s.id, map.id, 'dm');
    const player = harness(s.id, map.id, 'player');

    dm.send('ability:roll', { kind: 'monster', refId: dragon.id, abilityId: breath.id });
    expect(listRollLog(s.id).length).toBeGreaterThan(0);
    expect(getMonster(dragon.id)!.sheetAbilities.find((a) => a.id === breath.id)!.recharge?.spent).toBe(true);

    player.send('ability:setRecharge', { kind: 'monster', refId: dragon.id, abilityId: breath.id, spent: false });
    expect(getMonster(dragon.id)!.sheetAbilities.find((a) => a.id === breath.id)!.recharge?.spent).toBe(true);

    dm.send('ability:setRecharge', { kind: 'monster', refId: dragon.id, abilityId: breath.id, spent: false });
    expect(getMonster(dragon.id)!.sheetAbilities.find((a) => a.id === breath.id)!.recharge).toEqual({ min: 5 });
  });
});
