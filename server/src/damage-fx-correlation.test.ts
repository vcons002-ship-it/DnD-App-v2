import { afterEach, describe, expect, it, vi } from 'vitest';
import type { HpFxEvent, SheetAbility, StateSnapshot } from '../../shared/types.js';
import { resolveAbilityRoll, resolveAttack, resolveAttackDamage, resolveForcedSave } from './combat.js';
import { broadcastSnapshots, dropConn, setConn, type IOServer } from './connections.js';
import {
  addRollLog, applyDamage, createCharacter, createMap, createMonsterTemplate, createSession,
  createToken, drainHpFx, getMonster, instantiateMonster, listRollLog,
  setActiveMap, setFogLayer, setHideDmRolls, setManualDamage, setTokenHidden,
} from './sessions.js';

const sockets: string[] = [];
afterEach(() => { vi.restoreAllMocks(); sockets.splice(0).forEach(dropConn); });

function fixture(manual = true) {
  const session = createSession('Damage FX correlation');
  const map = createMap(session.id, { name: 'FX test map' });
  setActiveMap(session.id, map.id);
  setFogLayer(map.id, 'map', false);
  setFogLayer(map.id, 'tokens', false);
  setManualDamage(session.id, manual);
  const attacker = createCharacter(session.id, {
    name: 'Striker', className: 'Sorcerer', level: 6, maxHp: 50,
    stats: { STR: 16, CHA: 18 },
    weapons: [{ name: 'Sword', kind: 'melee', damage: '2d6', attackBonus: 50 }],
  });
  const attackToken = createToken({ mapId: map.id, kind: 'pc', refId: attacker.id, x: 0, y: 0 });
  const template = createMonsterTemplate(session.id, { name: 'Target', maxHp: 200, armorClass: 1 });
  const target = instantiateMonster(template.id)!;
  const targetToken = createToken({ mapId: map.id, kind: 'monster', refId: target.id, x: 50, y: 50 });
  drainHpFx(session.id);
  vi.spyOn(Math, 'random').mockReturnValue(.5); // Real formulas, deterministic non-critical hit.
  return { session, map, attacker, attackToken, target, targetToken };
}

function attack(f: ReturnType<typeof fixture>, roller = 'Striker') {
  expect(resolveAttack(f.session.id, roller, f.attackToken.id, f.targetToken.id, 0)).toBe(true);
  return listRollLog(f.session.id).at(-1)!;
}

function views(f: ReturnType<typeof fixture>) {
  const messages: { socketId: string; event: string; payload: unknown }[] = [];
  for (const role of ['player', 'dm'] as const) {
    const id = `${f.session.id}-${role}`;
    sockets.push(id);
    setConn(id, { sessionId: f.session.id, role, viewMapId: null, playerId: null });
  }
  const io = { to: (socketId: string) => ({ emit: (event: string, payload: unknown) => {
    messages.push({ socketId, event, payload });
  } }) } as unknown as IOServer;
  broadcastSnapshots(io, f.session.id);
  const forRole = (role: 'dm' | 'player') => {
    const list = messages.filter((message) => message.socketId === `${f.session.id}-${role}`);
    return {
      snapshot: list.find((message) => message.event === 'state:snapshot')!.payload as StateSnapshot,
      events: (list.find((message) => message.event === 'fx:hp')?.payload as { events: HpFxEvent[] } | undefined)?.events ?? [],
      order: list.map((message) => message.event),
    };
  };
  return { dm: forRole('dm'), player: forRole('player') };
}

describe('exact attack damage-to-reveal correlation', () => {
  it('manual damage applies immediately on its second click and references the damage roll, not the attack', () => {
    const f = fixture();
    const hit = attack(f);
    expect(hit.pending).toBeDefined();
    expect(getMonster(f.target.id)!.curHp).toBe(200);
    expect(drainHpFx(f.session.id)).toEqual([]);

    expect(resolveAttackDamage(f.session.id, 'Striker', hit.id)).toBe(true);
    const damage = listRollLog(f.session.id).at(-1)!;
    expect(damage.reveal?.kind).toBe('damage');
    expect(getMonster(f.target.id)!.curHp).toBe(200 - hit.pending!.amount);
    expect(drainHpFx(f.session.id)).toEqual([{
      kind: 'monster', refId: f.target.id, delta: -hit.pending!.amount, rollId: damage.id,
    }]);
    expect(damage.id).not.toBe(hit.id);
    expect(resolveAttackDamage(f.session.id, 'Striker', hit.id)).toBe(false);
    expect(drainHpFx(f.session.id)).toEqual([]);
  });

  it('automatic attacks link each effect precisely without capturing unrelated direct damage or healing', () => {
    const f = fixture(false);
    applyDamage('monster', f.target.id, 3);
    const first = attack(f);
    applyDamage('monster', f.target.id, -2);
    const second = attack(f);
    const events = drainHpFx(f.session.id);
    expect(events.map((event) => event.rollId)).toEqual([undefined, first.id, undefined, second.id]);
    expect(events.map((event) => event.delta)).toEqual([-3, -first.reveal!.damage!, 2, -second.reveal!.damage!]);
    expect(getMonster(f.target.id)!.curHp).toBe(199 - first.reveal!.damage! - second.reveal!.damage!);
  });

  for (const manual of [false, true]) {
    it(`spell attacks keep exact damage correlation with manual mode ${manual}`, () => {
      const f = fixture(manual);
      const ability: SheetAbility = { id: 'bolt', name: 'Test bolt', type: 'spell', level: 0,
        description: '', roll: { kind: 'attack', dice: '2d6', damageType: 'fire' } };
      expect(resolveAbilityRoll(f.session.id, 'Striker', f.attacker, ability, 0, undefined, f.targetToken.id)).toBe(true);
      const hit = listRollLog(f.session.id).at(-1)!;
      if (manual) {
        expect(drainHpFx(f.session.id)).toEqual([]);
        expect(resolveAttackDamage(f.session.id, 'Striker', hit.id)).toBe(true);
      }
      const result = listRollLog(f.session.id).at(-1)!;
      expect(drainHpFx(f.session.id)).toEqual([{
        kind: 'monster', refId: f.target.id, delta: -result.reveal!.damage!, damageType: 'fire', rollId: result.id,
      }]);
    });
  }

  it('each Magic Missile dart references its own newly rolled damage, not the original cast', () => {
    const f = fixture();
    const cast = addRollLog(f.session.id, { roller: 'Striker', label: 'Magic Missile', expr: 'Magic Missile', total: 0,
      detail: 'Assign darts', apply: { amount: 0, dc: 0, darts: 3, dice: '1d4+1', damageType: 'force' } });
    resolveForcedSave(f.session.id, cast.id, f.targetToken.id);
    const first = listRollLog(f.session.id).at(-1)!;
    resolveForcedSave(f.session.id, cast.id, f.targetToken.id);
    const second = listRollLog(f.session.id).at(-1)!;
    expect(drainHpFx(f.session.id).map((event) => ({ delta: event.delta, rollId: event.rollId }))).toEqual([
      { delta: -4, rollId: first.id }, { delta: -4, rollId: second.id },
    ]);
    expect(first.id).not.toBe(cast.id);
    expect(second.id).not.toBe(first.id);
    expect(getMonster(f.target.id)!.curHp).toBe(192);
  });

  for (const dc of [5, 30]) {
    it(`saving-throw damage is linked to the target's actual save reveal at DC ${dc}`, () => {
      const f = fixture();
      const cast = addRollLog(f.session.id, { roller: 'Striker', label: 'Area spell', expr: 'Area spell', total: 12,
        detail: 'Choose targets', apply: { amount: 12, dc, save: 'DEX', damageType: 'fire' } });
      resolveForcedSave(f.session.id, cast.id, f.targetToken.id);
      const result = listRollLog(f.session.id).at(-1)!;
      expect(result.reveal?.kind).toBe('check');
      expect(drainHpFx(f.session.id)[0]).toMatchObject({ delta: dc === 5 ? -6 : -12, rollId: result.id });
    });
  }

  it('an auto-hit application without its own reveal references its cast, while unanimated sources remain untagged', () => {
    const f = fixture();
    for (const animated of [true, false]) {
      const cast = addRollLog(f.session.id, { roller: 'Striker', label: 'Direct spell', expr: 'Direct spell', total: 8,
        detail: 'Choose target', apply: { amount: 8, dc: 0 },
        ...(animated ? { reveal: { kind: 'damage' as const, attacker: 'Striker', outcome: 'none' as const, damage: 8,
          damageDice: [{ label: '2d6', value: 8, faces: [4, 4] }] } } : {}),
      });
      resolveForcedSave(f.session.id, cast.id, f.targetToken.id);
      const result = listRollLog(f.session.id).at(-1)!;
      expect(result.reveal).toBeUndefined();
      expect(drainHpFx(f.session.id)[0].rollId).toBe(animated ? cast.id : undefined);
    }
    expect(getMonster(f.target.id)!.curHp).toBe(184);
  });

  it('visible enemy damage keeps correlation even when its HP accounting note is redacted', () => {
    const f = fixture(false);
    const result = attack(f);
    const { player, dm } = views(f);
    expect(player.snapshot.rollLog.find((roll) => roll.id === result.id)?.hpNote).toBeUndefined();
    expect(player.events[0]?.rollId).toBe(result.id);
    expect(dm.events[0]?.rollId).toBe(result.id);
    expect(player.order).toEqual(['state:snapshot', 'fx:hp']);
  });

  it('hidden DM rolls never leak their ID or leave visible damage waiting for a hidden reveal', () => {
    const f = fixture(false);
    setHideDmRolls(f.session.id, true);
    const result = attack(f, 'DM');
    const { player, dm } = views(f);
    expect(player.snapshot.rollLog.some((roll) => roll.id === result.id)).toBe(false);
    expect(player.events).toHaveLength(1);
    expect(player.events[0].rollId).toBeUndefined();
    expect(dm.events[0].rollId).toBe(result.id);
  });

  it('hidden target tokens still emit no player damage feedback', () => {
    const f = fixture(false);
    setTokenHidden(f.targetToken.id, true);
    attack(f);
    const { player, dm } = views(f);
    expect(player.events).toEqual([]);
    expect(dm.events).toHaveLength(1);
  });
});
