import { it, expect, vi, afterEach } from 'vitest';
import {
  createSession, createMap, setActiveMap, createCharacter, createToken,
  setManualDamage, setSheetAbility, applyDamage, getCharacter, listRollLog,
  setConcentration, setTempHp, getRollEntry, setRollPending, updateCharacter,
} from './sessions.js';
import { resolveAttack, resolveAttackDamage, resolveSmite } from './combat.js';
import { getSpell } from './spells/srd.js';

afterEach(() => vi.restoreAllMocks());

function arena(manual: boolean, damage = '19d1', maxHp = 20) {
  const s = createSession('Combined hit');
  const map = createMap(s.id, { name: 'Arena' });
  setActiveMap(s.id, map.id);
  setManualDamage(s.id, manual);
  const paladin = createCharacter(s.id, {
    name: 'Paladin', className: 'Paladin', level: 3, stats: { STR: 10 },
    weapons: [{ name: 'Sword', kind: 'melee', damage, damageType: 'slashing', attackBonus: 100 }],
  });
  const target = createCharacter(s.id, { name: 'Target', maxHp, armorClass: 1 });
  setSheetAbility('pc', paladin.id, { ...getSpell('Divine Smite')!, id: 'smite' });
  const a = createToken({ mapId: map.id, kind: 'pc', refId: paladin.id, x: 0, y: 0 });
  const b = createToken({ mapId: map.id, kind: 'pc', refId: target.id, x: 60, y: 0 });
  vi.spyOn(Math, 'random').mockReturnValue(0.5); // Hit; each d8 is 5.
  const hit = () => {
    resolveAttack(s.id, 'DM', a.id, b.id, 0);
    return listRollLog(s.id).filter(e => e.smite).at(-1)!;
  };
  return { sid: s.id, paladin, target, hit };
}

for (const manual of [false, true]) {
  it(`Smite counts toward massive damage (${manual ? 'manual' : 'automatic'})`, () => {
    const f = arena(manual);
    applyDamage('pc', f.target.id, 19);
    const hit = f.hit();
    expect(getCharacter(f.target.id)!.curHp).toBe(1); // No partial damage.
    expect(resolveSmite(f.sid, 'DM', hit.id, 'free')).toEqual({ ok: true });
    expect(getCharacter(f.target.id)!.deathSaves.failures).toBe(3);
    expect(getRollEntry(hit.id)!.pending!.done).toBe(true);
    expect(resolveAttackDamage(f.sid, 'DM', hit.id)).toBe(false);
    expect(resolveSmite(f.sid, 'DM', hit.id, 1).ok).toBe(false);
    expect(getCharacter(f.paladin.id)!.spellSlots.L1.used).toBe(0);
  });

  it(`Smite generates one combined concentration check (manual=${manual})`, () => {
    const f = arena(manual, '30d1', 200);
    setConcentration('pc', f.target.id, 'Bless');
    const hit = f.hit();
    resolveSmite(f.sid, 'DM', hit.id, 'free');
    const checks = listRollLog(f.sid).filter(e => e.label === 'Concentration');
    expect(checks).toHaveLength(1);
    expect(checks[0].total).toBe(20); // (30 slashing + 10 radiant) / 2.
    expect(getCharacter(f.target.id)!.curHp).toBe(160);
    expect(listRollLog(f.sid).filter(e => e.label === 'Damage')).toHaveLength(1);
  });

  it(`declining Smite resolves only weapon damage and closes the choice (manual=${manual})`, () => {
    const f = arena(manual, '1d1');
    const hit = f.hit();
    expect(resolveAttackDamage(f.sid, 'DM', hit.id)).toBe(true);
    expect(getCharacter(f.target.id)!.curHp).toBe(19);
    expect(resolveSmite(f.sid, 'DM', hit.id, 'free').ok).toBe(false);
    expect(getCharacter(f.paladin.id)!.resources['Divine Smite (free)'].used).toBe(0);
  });
}

it('a crit that drops a conscious PC does not add a second hit worth of death failures', () => {
  const f = arena(true, '1d1', 100);
  applyDamage('pc', f.target.id, 99);
  vi.mocked(Math.random).mockReturnValue(0.999);
  resolveSmite(f.sid, 'DM', f.hit().id, 'free');
  expect(getCharacter(f.target.id)!.curHp).toBe(0);
  expect(getCharacter(f.target.id)!.deathSaves.failures).toBe(0);
});

it('temporary HP absorbs the combined hit before massive-damage accounting', () => {
  const f = arena(false);
  applyDamage('pc', f.target.id, 19);
  setTempHp('pc', f.target.id, 10);
  resolveSmite(f.sid, 'DM', f.hit().id, 'free');
  const after = getCharacter(f.target.id)!;
  expect(after.tempHp).toBe(0);
  expect(after.curHp).toBe(0);
  expect(after.deathSaves.failures).toBe(0);
});

it('legacy opportunities without a pending hit cannot spend or damage again', () => {
  const f = arena(false);
  const hit = f.hit();
  setRollPending(hit.id, undefined);
  expect(resolveSmite(f.sid, 'DM', hit.id, 'free').ok).toBe(false);
  expect(getCharacter(f.target.id)!.curHp).toBe(20);
  expect(getCharacter(f.paladin.id)!.resources['Divine Smite (free)'].used).toBe(0);
});

it('resists each damage type separately and reconciles an immune weapon in the combined reveal', () => {
  const f = arena(false, '10d1', 100);
  updateCharacter(f.target.id, { immunities: ['slashing'], resistances: ['radiant'] });
  resolveSmite(f.sid, 'DM', f.hit().id, 'free');
  expect(getCharacter(f.target.id)!.curHp).toBe(95);
  const reveal = listRollLog(f.sid).filter(e => e.label === 'Damage').at(-1)!.reveal!;
  expect([...(reveal.damageDice ?? []), ...(reveal.damageMods ?? [])].reduce((n, step) => n + step.value, 0)).toBe(5);
  expect(reveal.damage).toBe(5);
});
