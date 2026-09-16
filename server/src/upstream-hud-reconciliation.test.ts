import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveAttack, resolveAttackDamage } from './combat.js';
import { dropConn, setConn, type IOServer } from './connections.js';
import { getFeature } from './features/srd.js';
import { getRaceTrait } from './races/srd.js';
import {
  claimCharacter, createCharacter, createMap, createMonsterTemplate, createSession,
  createToken, getCharacter, getMonster, getRollEntry, instantiateMonster,
  listRollLog, setActiveMap, setManualDamage, setSheetAbility, setTokenHidden,
} from './sessions.js';
import { registerSocketHandlers } from './socketHandlers.js';
import { buildSnapshot } from './visibility.js';

const connected: string[] = [];
let nextSocket = 0;
afterEach(() => {
  for (const id of connected.splice(0)) dropConn(id);
  vi.restoreAllMocks();
});

/** Real wrapped socket handlers, no listener. Vitest provides throwaway storage. */
function harness(sessionId: string, mapId: string, role: 'player' | 'dm' = 'player') {
  let connect!: (socket: unknown) => void;
  const io = { on: (_: string, cb: typeof connect) => { connect = cb; }, to: () => ({ emit: vi.fn() }) };
  registerSocketHandlers(io as unknown as IOServer);
  const handlers = new Map<string, (...args: unknown[]) => void>();
  const id = `reconciliation-socket-${++nextSocket}`;
  connected.push(id);
  const emit = vi.fn();
  connect({ id, on: (event: string, handler: (...args: unknown[]) => void) => handlers.set(event, handler), emit });
  setConn(id, { sessionId, role, viewMapId: mapId, playerId: null });
  return { id, emit, send: (event: string, payload: unknown) => handlers.get(event)!(payload) };
}

function arena() {
  const session = createSession('Upstream and player HUD reconciliation');
  const map = createMap(session.id, { name: 'Active' });
  setActiveMap(session.id, map.id);
  setManualDamage(session.id, true);
  const character = createCharacter(session.id, {
    name: 'Half-Orc fighter', race: 'Half-Orc', className: 'Fighter', level: 6,
    stats: { STR: 16 },
    weapons: [{ name: 'Greataxe', kind: 'melee', damage: '1d12', attackBonus: 50 }],
  });
  const attacker = createToken({ mapId: map.id, kind: 'pc', refId: character.id, x: 0, y: 0 });
  const monster = (name = 'Target') => {
    const template = createMonsterTemplate(session.id, { name, maxHp: 999, armorClass: 1 });
    const creature = instantiateMonster(template.id)!;
    const token = createToken({ mapId: map.id, kind: 'monster', refId: creature.id, x: 100, y: 100 });
    return { creature, token };
  };
  return { session, map, character, attacker, monster };
}

function enableSavageAttacks(characterId: string) {
  const racial = getRaceTrait('Savage Attacks')!;
  setSheetAbility('pc', characterId, { ...racial, id: 'racial-savage-attacks', stance: { ...racial.stance!, active: true } });
}

describe('upstream racial criticals and player HUD deferred damage', () => {
  it('parks the racial extra die with manual damage and the owner can apply it only once', () => {
    const f = arena(), target = f.monster(), owner = harness(f.session.id, f.map.id);
    enableSavageAttacks(f.character.id);
    claimCharacter(f.character.id, owner.id);
    vi.spyOn(Math, 'random').mockReturnValue(0.999);

    expect(resolveAttack(f.session.id, 'Fighter', f.attacker.id, target.token.id, 0, undefined, false, false, f.character.id)).toBe(true);
    const attack = listRollLog(f.session.id).find((entry) => entry.pending)!;
    expect(attack.pending).toMatchObject({ crit: true, amount: 39, owner: f.character.id });
    expect(attack.pending!.dice.map((die) => die.faces)).toEqual([[12], [12], [12]]);
    expect(attack.pending!.dice.at(-1)?.label).toBe('1d12');
    expect(attack.reveal?.damage).toBeUndefined();
    expect(getMonster(target.creature.id)!.curHp).toBe(999);

    owner.send('combat:damage', { rollId: attack.id });
    owner.send('combat:damage', { rollId: attack.id });
    expect(getMonster(target.creature.id)!.curHp).toBe(960);
    expect(getRollEntry(attack.id, f.session.id)!.pending?.done).toBe(true);
    const damage = listRollLog(f.session.id).filter((entry) => entry.label === 'Damage');
    expect(damage).toHaveLength(1);
    expect(damage[0].reveal?.damageDice).toEqual(attack.pending!.dice);
    expect(owner.emit).not.toHaveBeenCalledWith('error', expect.anything());
  });

  it('keeps Savage Attacks distinct from Savage Attacker when both are enabled', () => {
    const f = arena(), target = f.monster();
    enableSavageAttacks(f.character.id);
    const feat = getFeature('Savage Attacker')!;
    setSheetAbility('pc', f.character.id, { ...feat, id: 'feat-savage-attacker', stance: { ...feat.stance!, active: true } });
    // Natural 20; first damage set 1+1, better set 7+7, racial extra die 12.
    vi.spyOn(Math, 'random').mockReturnValue(0.5)
      .mockReturnValueOnce(0.999).mockReturnValueOnce(0).mockReturnValueOnce(0)
      .mockReturnValueOnce(0.5).mockReturnValueOnce(0.5).mockReturnValueOnce(0.999);

    resolveAttack(f.session.id, 'Fighter', f.attacker.id, target.token.id, 0);
    const attack = listRollLog(f.session.id).find((entry) => entry.pending)!;
    expect(attack.pending!.amount).toBe(29); // 7 + 7 + 12 + STR 3, no duplicate modifier.
    expect(attack.pending!.dice.map((die) => die.faces)).toEqual([[7], [7], [12]]);
    expect(getMonster(target.creature.id)!.curHp).toBe(999);
    expect(resolveAttackDamage(f.session.id, 'DM', attack.id)).toBe(true);
    expect(resolveAttackDamage(f.session.id, 'DM', attack.id)).toBe(false);
    expect(getMonster(target.creature.id)!.curHp).toBe(970);
    const abilities = getCharacter(f.character.id)!.sheetAbilities;
    expect(abilities.find((ability) => ability.id === 'racial-savage-attacks')!.stance).toMatchObject({ active: true, extraCritDie: true });
    expect(abilities.find((ability) => ability.id === 'feat-savage-attacker')!.stance).toMatchObject({ active: true, rerollDamageDice: true });
  });

  it('does not add the racial critical die to an ordinary hit or resolve it in another session', () => {
    const f = arena(), other = arena(), target = f.monster();
    enableSavageAttacks(f.character.id);
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    resolveAttack(f.session.id, 'Fighter', f.attacker.id, target.token.id, 0);
    const attack = listRollLog(f.session.id).find((entry) => entry.pending)!;
    expect(attack.pending).toMatchObject({ crit: false, amount: 10 });
    expect(attack.pending!.dice.map((die) => die.faces)).toEqual([[7]]);
    expect(getRollEntry(attack.id, other.session.id)).toBeNull();
    expect(resolveAttackDamage(other.session.id, 'Other DM', attack.id)).toBe(false);
    expect(getMonster(target.creature.id)!.curHp).toBe(999);
    expect(getRollEntry(attack.id, f.session.id)!.pending?.done).toBeUndefined();
  });
});

describe('upstream bulk disposition respects role, session and visibility boundaries', () => {
  it('a player cannot change even their own session creatures to friendly', () => {
    const f = arena(), target = f.monster(), player = harness(f.session.id, f.map.id);
    player.send('tokens:setDisposition', { tokenIds: [target.token.id], disposition: 'friendly' });
    expect(getMonster(target.creature.id)!.disposition).toBe('enemy');
    expect(buildSnapshot(f.session.id, 'player')!.monsters.find((m) => m.id === target.creature.id)).not.toHaveProperty('curHp');
  });

  it('a DM batch changes only local monsters and rejects invalid disposition values', () => {
    const f = arena(), other = arena(), first = f.monster('First'), second = f.monster('Second'), foreign = other.monster();
    const dm = harness(f.session.id, f.map.id, 'dm');
    const characterBefore = getCharacter(f.character.id);
    dm.send('tokens:setDisposition', {
      tokenIds: [first.token.id, second.token.id, foreign.token.id, f.attacker.id, 'missing', 123],
      disposition: 'friendly',
    });
    expect(getMonster(first.creature.id)!.disposition).toBe('friendly');
    expect(getMonster(second.creature.id)!.disposition).toBe('friendly');
    expect(getMonster(foreign.creature.id)!.disposition).toBe('enemy');
    expect(getCharacter(f.character.id)).toEqual(characterBefore);
    dm.send('tokens:setDisposition', { tokenIds: [first.token.id], disposition: 'hostile' });
    expect(getMonster(first.creature.id)!.disposition).toBe('friendly');
    expect(dm.emit).not.toHaveBeenCalledWith('error', expect.anything());
  });

  it('friendly batches expose only visible allies, and neutral changes redact their stats again', () => {
    const f = arena(), visible = f.monster('Ally'), hidden = f.monster('Hidden ally');
    setTokenHidden(hidden.token.id, true);
    const dm = harness(f.session.id, f.map.id, 'dm');
    dm.send('tokens:setDisposition', { tokenIds: [visible.token.id, hidden.token.id], disposition: 'friendly' });
    const friendly = buildSnapshot(f.session.id, 'player')!;
    expect(friendly.monsters.find((m) => m.id === visible.creature.id)).toMatchObject({ disposition: 'friendly', curHp: 999 });
    expect(friendly.monsters.find((m) => m.id === hidden.creature.id)).toBeUndefined();
    expect(friendly.tokens.find((t) => t.id === hidden.token.id)).toBeUndefined();
    dm.send('tokens:setDisposition', { tokenIds: [visible.token.id], disposition: 'neutral' });
    const neutral = buildSnapshot(f.session.id, 'player')!.monsters.find((m) => m.id === visible.creature.id)!;
    expect(neutral.disposition).toBe('neutral');
    expect(neutral).not.toHaveProperty('curHp');
    expect(neutral).not.toHaveProperty('armorClass');
  });
});
