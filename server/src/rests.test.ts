import { describe, it, expect, afterEach } from 'vitest';
import {
  createSession, createCharacter, getCharacter, updateCharacter, setResource, setSheetAbility,
  applyDamage, listRollLog, listChat, createMap, setActiveMap, claimCharacter,
} from './sessions.js';
import { restCharacter, partyRest, spendHitDice, describeRest } from './rests.js';
import { hitDieFor, hitDiceLeft, hitDieHealing, shortRestRecovery, restCounters } from '../../shared/rests.js';
import { withDiceSource } from '../../shared/dice.js';
import { registerSocketHandlers } from './socketHandlers.js';
import { dropConn, setConn, type IOServer } from './connections.js';

/** Short / Long Rest + Hit Dice (2024 PHB). */

const fixed = <T>(faces: number[], run: () => T) => withDiceSource((sides) => sides.map((_, i) => faces[i] ?? 1), run);

describe('rest rules (shared)', () => {
  it('hit die by class, multiclass takes the first named', () => {
    expect(hitDieFor('Barbarian')).toBe(12);
    expect(hitDieFor('Fighter')).toBe(10);
    expect(hitDieFor('Wizard')).toBe(6);
    expect(hitDieFor('Warlock')).toBe(8);
    expect(hitDieFor('Paladin / Warlock')).toBe(10);
    expect(hitDieFor('Homebrew Gunslinger')).toBe(8);
  });

  it('a spent Hit Die heals face + CON, minimum 1', () => {
    expect(hitDieHealing(6, 2)).toBe(8);
    expect(hitDieHealing(1, -3)).toBe(1);
  });

  it('short-rest recovery follows each feature (2024)', () => {
    const c = (used: number, max = 3) => ({ max, used });
    expect(shortRestRecovery('Ki', c(2), 'Monk', 5)).toBe('all');
    expect(shortRestRecovery('Action Surge', c(1, 1), 'Fighter', 5)).toBe('all');
    expect(shortRestRecovery('Superiority Dice', c(4, 4), 'Fighter', 5)).toBe('all');
    expect(shortRestRecovery('Second Wind', c(2), 'Fighter', 5)).toBe('one');
    expect(shortRestRecovery('Rage', c(2), 'Barbarian', 5)).toBe('one');
    expect(shortRestRecovery('Channel Divinity', c(2), 'Cleric', 6)).toBe('one');
    expect(shortRestRecovery('Bardic Inspiration', c(2), 'Bard', 4)).toBe('none');
    expect(shortRestRecovery('Bardic Inspiration', c(2), 'Bard', 5)).toBe('all');
    expect(shortRestRecovery('Lay on Hands', c(10, 25), 'Paladin', 5)).toBe('none');
    expect(shortRestRecovery('Sorcery Points', c(3, 5), 'Sorcerer', 5)).toBe('none');
    // A custom counter's own setting wins; an unknown one waits for a Long Rest.
    expect(shortRestRecovery('Luck Charm', { ...c(1), recharge: 'short' }, 'Rogue', 5)).toBe('all');
    expect(shortRestRecovery('Luck Charm', c(1), 'Rogue', 5)).toBe('none');
  });

  it('restCounters returns only what changes', () => {
    const out = restCounters({ Rage: { max: 3, used: 3 }, 'Second Wind': { max: 2, used: 0 } }, 'short', 'Barbarian', 5);
    expect(out).toEqual({ Rage: { max: 3, used: 2 } });
  });
});

describe('restCharacter / partyRest', () => {
  const party = () => {
    const s = createSession('Camp');
    const fighter = createCharacter(s.id, { name: 'Druk', className: 'Fighter', level: 5, maxHp: 44, stats: { CON: 14 } });
    const lock = createCharacter(s.id, { name: 'Vanec', className: 'Warlock', level: 5, maxHp: 33, stats: { CON: 12 } });
    return { s, fighter, lock };
  };

  it('a Short Rest refills short-rest counters and pact slots, one use of Second Wind, nothing else', () => {
    const { s, fighter, lock } = party();
    setResource(fighter.id, 'resources', 'Action Surge', { used: 1 });
    setResource(fighter.id, 'resources', 'Second Wind', { used: 3 });
    const pactKey = Object.keys(getCharacter(lock.id)!.spellSlots)[0];
    setResource(lock.id, 'spellSlots', pactKey, { used: 2 });
    updateCharacter(fighter.id, { curHp: 10 });
    const out = partyRest(s.id, 'short');
    const f = getCharacter(fighter.id)!;
    expect(f.resources['Action Surge'].used).toBe(0);
    expect(f.resources['Second Wind'].used).toBe(2);
    expect(f.curHp).toBe(10); // a Short Rest heals only through Hit Dice
    expect(getCharacter(lock.id)!.spellSlots[pactKey].used).toBe(0);
    expect(describeRest('short', out)).toMatch(/Short Rest[\s\S]*Druk: .*Action Surge 0→1/);
  });

  it('a non-Warlock keeps spent slots through a Short Rest', () => {
    const s = createSession('Wiz');
    const w = createCharacter(s.id, { name: 'Varis', className: 'Wizard', level: 5, maxHp: 28 });
    setResource(w.id, 'spellSlots', 'L1', { used: 2 });
    restCharacter(s.id, w.id, 'short');
    expect(getCharacter(w.id)!.spellSlots.L1.used).toBe(2);
    restCharacter(s.id, w.id, 'long');
    expect(getCharacter(w.id)!.spellSlots.L1.used).toBe(0);
  });

  it('a Long Rest restores HP, all Hit Dice, everything, and ends temp HP', () => {
    const { s, fighter } = party();
    updateCharacter(fighter.id, { curHp: 9, tempHp: 5 });
    setResource(fighter.id, 'resources', 'Second Wind', { used: 3 });
    fixed([4, 4], () => spendHitDice(s.id, 'Druk', fighter.id, 2));
    expect(hitDiceLeft(getCharacter(fighter.id)!)).toBe(3);
    restCharacter(s.id, fighter.id, 'long');
    const f = getCharacter(fighter.id)!;
    expect(f.curHp).toBe(44);
    expect(f.tempHp).toBe(0);
    expect(f.hitDiceUsed).toBe(0);
    expect(f.resources['Second Wind'].used).toBe(0);
  });

  it('nobody rests from the dead; a Long Rest needs at least 1 HP', () => {
    const { s, fighter, lock } = party();
    applyDamage('pc', fighter.id, 44); // drops to 0 (not massive)
    updateCharacter(lock.id, { curHp: 1 });
    applyDamage('pc', lock.id, 200); // massive damage → dead
    const out = partyRest(s.id, 'long');
    expect(out.find((o) => o.characterId === fighter.id)!.skipped).toBe('down');
    expect(out.find((o) => o.characterId === lock.id)!.skipped).toBe('dead');
    expect(getCharacter(fighter.id)!.curHp).toBe(0);
    expect(getCharacter(lock.id)!.curHp).toBe(0);
  });

  it('readies limited-use abilities by their rest', () => {
    const { s, fighter } = party();
    setSheetAbility('pc', fighter.id, { id: 'a', name: 'Shadow Step', type: 'ability', description: '', recharge: { rest: 'short', spent: true } });
    setSheetAbility('pc', fighter.id, { id: 'b', name: 'Dragon Gift', type: 'ability', description: '', recharge: { rest: 'long', spent: true } });
    restCharacter(s.id, fighter.id, 'short');
    const after = () => Object.fromEntries(getCharacter(fighter.id)!.sheetAbilities.map((a) => [a.id, !!a.recharge?.spent]));
    expect(after()).toEqual({ a: false, b: true });
    restCharacter(s.id, fighter.id, 'long');
    expect(after()).toEqual({ a: false, b: false });
  });
});

describe('spendHitDice', () => {
  it('rolls, heals face + CON (min 1) per die, logs it, and never overspends', () => {
    const s = createSession('HD');
    const c = createCharacter(s.id, { name: 'Druk', className: 'Fighter', level: 2, maxHp: 30, stats: { CON: 14 } });
    updateCharacter(c.id, { curHp: 5 });
    const r = fixed([7, 1], () => spendHitDice(s.id, 'Druk', c.id, 5)); // only 2 left at level 2
    expect(r).toEqual({ ok: true, healed: 9 + 3, spent: 2 });
    expect(getCharacter(c.id)!.curHp).toBe(17);
    expect(listRollLog(s.id).at(-1)!.detail).toMatch(/spends 2 Hit Dice \(d10\): 7 \+ 1 \+ 2 CON each → \+12 HP · 0\/2 left/);
    expect(spendHitDice(s.id, 'Druk', c.id, 1)).toMatchObject({ ok: false, reason: expect.stringMatching(/no Hit Dice left/) });
  });

  it('refuses at full HP and for the dead', () => {
    const s = createSession('HD2');
    const c = createCharacter(s.id, { name: 'Varis', className: 'Wizard', level: 3, maxHp: 18 });
    expect(spendHitDice(s.id, 'Varis', c.id, 1)).toMatchObject({ ok: false, reason: expect.stringMatching(/full HP/) });
    updateCharacter(c.id, { curHp: 1 });
    applyDamage('pc', c.id, 100);
    expect(spendHitDice(s.id, 'Varis', c.id, 1)).toMatchObject({ ok: false, reason: expect.stringMatching(/dead/) });
    expect(getCharacter(c.id)!.hitDiceUsed).toBe(0);
  });
});

const connected: string[] = [];
afterEach(() => { for (const id of connected.splice(0)) dropConn(id); });
function harness(sessionId: string, mapId: string, role: 'player' | 'dm') {
  let connect!: (socket: unknown) => void;
  const rooms: { event: string; payload: unknown }[] = [];
  const io = { on: (_: string, cb: typeof connect) => { connect = cb; }, to: () => ({ emit: (event: string, payload: unknown) => rooms.push({ event, payload }) }) };
  registerSocketHandlers(io as unknown as IOServer, { livePhysics: false });
  const handlers = new Map<string, (...args: unknown[]) => void>();
  const id = `rest-socket-${connected.length}-${Math.random()}`;
  connected.push(id);
  const notices: string[] = [];
  connect({ id, on: (event: string, handler: (...args: unknown[]) => void) => handlers.set(event, handler),
    emit: (event: string, payload: { message?: string }) => { if (event === 'notice') notices.push(payload.message ?? ''); } });
  setConn(id, { sessionId, role, viewMapId: mapId, playerId: null });
  return { id, rooms, notices, send: (event: string, payload: unknown) => handlers.get(event)!(payload) };
}

describe('rests over the socket', () => {
  it('only the DM rests the party; it posts a summary and a banner', () => {
    const s = createSession('Socket rest');
    const map = createMap(s.id, { name: 'Camp' });
    setActiveMap(s.id, map.id);
    const c = createCharacter(s.id, { name: 'Druk', className: 'Fighter', level: 5, maxHp: 44 });
    setResource(c.id, 'resources', 'Action Surge', { used: 1 });
    const player = harness(s.id, map.id, 'player');
    player.send('rest:party', { kind: 'long' });
    expect(getCharacter(c.id)!.resources['Action Surge'].used).toBe(1);
    const dm = harness(s.id, map.id, 'dm');
    dm.send('rest:party', { kind: 'short' });
    expect(getCharacter(c.id)!.resources['Action Surge'].used).toBe(0);
    expect(listChat(s.id).at(-1)!.text).toMatch(/^☕ Short Rest/);
    expect(dm.rooms).toContainEqual({ event: 'fx:rest', payload: { kind: 'short' } });
  });

  it('a player spends only their own character\'s Hit Dice, and hears why when refused', () => {
    const s = createSession('Socket HD');
    const map = createMap(s.id, { name: 'Camp' });
    setActiveMap(s.id, map.id);
    const mine = createCharacter(s.id, { name: 'Mine', className: 'Fighter', level: 3, maxHp: 30 });
    const theirs = createCharacter(s.id, { name: 'Theirs', className: 'Fighter', level: 3, maxHp: 30 });
    updateCharacter(mine.id, { curHp: 10 });
    updateCharacter(theirs.id, { curHp: 10 });
    const player = harness(s.id, map.id, 'player');
    claimCharacter(mine.id, player.id);
    player.send('hitDice:spend', { characterId: theirs.id, count: 1 });
    expect(getCharacter(theirs.id)!.hitDiceUsed).toBe(0);
    player.send('hitDice:spend', { characterId: mine.id, count: 1 });
    expect(getCharacter(mine.id)!.hitDiceUsed).toBe(1);
    expect(getCharacter(mine.id)!.curHp).toBeGreaterThan(10);
    updateCharacter(mine.id, { curHp: 30 });
    player.send('hitDice:spend', { characterId: mine.id, count: 1 });
    expect(player.notices.at(-1)).toMatch(/full HP/);
  });
});
