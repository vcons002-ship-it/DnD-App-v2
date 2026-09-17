import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RollReveal, SheetAbility } from '../../shared/types.js';
import { resolveAttack, resolveAttackDamage } from './combat.js';
import {
  addRollLog, claimCharacter, createCharacter, createMap, createMonsterTemplate,
  createSession, createToken, getCharacter, getMonster, getRollEntry,
  instantiateMonster, listRollLog, setActiveMap, setManualDamage, updateCharacter,
} from './sessions.js';
import { buildSnapshot } from './visibility.js';

afterEach(() => vi.restoreAllMocks());

const abilities: SheetAbility[] = [
  { id: 'gwm', name: 'Great Weapon Master', type: 'mastery', description: '', mastery: {
    active: true, appliesToTags: ['heavy'], effect: { profBonusDamage: true },
  } },
  { id: 'rune', name: 'Rune edge', type: 'mastery', description: '', mastery: {
    active: true, appliesToTags: ['heavy'], effect: { bonusDamage: '1d6+2' },
  } },
  { id: 'trip', name: 'Trip Attack', type: 'maneuver', description: '', maneuver: {
    active: true, addDieTo: 'damage',
  } },
  { id: 'rage', name: 'Rage', type: 'stance', description: '', stance: {
    active: true, appliesTo: 'melee', bonusDamage: '2',
  } },
  { id: 'mark', name: "Hunter's Mark", type: 'stance', description: '', stance: {
    active: true, appliesTo: 'melee', bonusDamage: '1d4',
  } },
];

function fixture(manual = true) {
  const session = createSession('Damage log detail');
  const map = createMap(session.id, { name: 'Accounting test' });
  setActiveMap(session.id, map.id);
  setManualDamage(session.id, manual);
  const attacker = createCharacter(session.id, {
    name: 'Fighter', className: 'Fighter', level: 5, stats: { STR: 16 },
    weapons: [{ name: 'Flaming greatsword', kind: 'melee', damage: '2d6',
      damageType: 'slashing', magicBonus: 1, tags: ['heavy'], attackBonus: 50,
      extraDamage: '1d4+1', extraDamageType: 'fire' }],
    resources: { 'Superiority Dice': { max: 4, used: 0 } },
    sheetAbilities: abilities,
  });
  const attackToken = createToken({ mapId: map.id, kind: 'pc', refId: attacker.id, x: 0, y: 0 });
  const template = createMonsterTemplate(session.id, { name: 'Target', maxHp: 200,
    armorClass: 1, resistances: ['slashing'], weaknesses: ['fire'] });
  const target = instantiateMonster(template.id)!;
  const targetToken = createToken({ mapId: map.id, kind: 'monster', refId: target.id, x: 50, y: 50 });
  return { session, map, attacker, attackToken, target, targetToken };
}

const total = (value: NonNullable<RollReveal['damageBreakdown']>) =>
  [...value.dice, ...value.mods].reduce((sum, step) => sum + step.value, 0);

describe('log-only damage accounting', () => {
  it('preserves the original RNG order across maneuver, attack, weapon and each rider', () => {
    const f = fixture(false);
    const sequence = [.125, .5, .1, .7, .3, .9, .2];
    const random = vi.spyOn(Math, 'random').mockImplementation(() => {
      const next = sequence.shift();
      if (next === undefined) throw new Error('Unexpected additional random roll');
      return next;
    });
    resolveAttack(f.session.id, 'Fighter', f.attackToken.id, f.targetToken.id, 0);
    const reveal = listRollLog(f.session.id).at(-1)!.reveal!;
    expect(random).toHaveBeenCalledTimes(7);
    expect(reveal.d20).toBe(11);
    expect(reveal.damageBreakdown?.dice.map((step) => step.faces)).toEqual([[1, 5], [2], [2], [4], [1]]);
    expect(reveal.damage).toBe(16);
    expect(total(reveal.damageBreakdown!)).toBe(16);
    expect(getMonster(f.target.id)?.curHp).toBe(184);
  });

  it('retains every existing rider roll without adding RNG calls or changing animation steps', () => {
    const f = fixture(false);
    const random = vi.spyOn(Math, 'random').mockReturnValue(.5);
    resolveAttack(f.session.id, 'Fighter', f.attackToken.id, f.targetToken.id, 0);
    const entry = listRollLog(f.session.id).at(-1)!;
    const reveal = entry.reveal!;
    expect(random).toHaveBeenCalledTimes(7); // maneuver, d20, 2 weapon, mastery, stance, secondary
    expect(reveal.damage).toBe(23);
    expect(getMonster(f.target.id)?.curHp).toBe(177);
    expect(reveal.damageDice).toEqual([{ label: '2d6', value: 8, faces: [4, 4] }]);
    expect(reveal.damageMods).toEqual([
      { label: 'STR', value: 3 }, { label: 'MAGIC', value: 1 },
      { label: 'Great Weapon Master+Trip Attack+Rage', value: 10 }, { label: 'bonus', value: 1 },
    ]);
    const detail = reveal.damageBreakdown!;
    expect(detail.dice).toEqual([
      { label: '2d6', value: 8, faces: [4, 4] },
      { label: '1d8 (Trip Attack)', value: 5, faces: [5] },
      { label: '1d6 (Rune edge)', value: 4, faces: [4] },
      { label: "1d4 (Hunter's Mark)", value: 3, faces: [3] },
      { label: '1d4 (fire rider)', value: 3, faces: [3] },
    ]);
    expect(detail.mods).toEqual([
      { label: 'STR', value: 3 }, { label: 'MAGIC', value: 1 },
      { label: 'Great Weapon Master', value: 3 }, { label: 'Rage', value: 2 },
      { label: 'Rune edge', value: 2 }, { label: 'slashing resisted', value: -16 },
      { label: 'fire rider', value: 1 }, { label: 'fire vulnerable', value: 4 },
    ]);
    expect(detail.mixedTypes).toBe(true);
    expect(total(detail)).toBe(23);
    expect(getCharacter(f.attacker.id)?.resources['Superiority Dice'].used).toBe(1);
    expect(getCharacter(f.attacker.id)?.sheetAbilities.find((ability) => ability.id === 'trip')?.maneuver?.active).toBe(false);
  });

  it('persists critical rider faces with pending damage, revealing only after the manual click', () => {
    const f = fixture();
    claimCharacter(f.attacker.id, 'damage-detail-owner');
    const random = vi.spyOn(Math, 'random').mockReturnValue(.999);
    resolveAttack(f.session.id, 'Fighter', f.attackToken.id, f.targetToken.id, 0, undefined, false, false, f.attacker.id);
    const hit = listRollLog(f.session.id).at(-1)!;
    expect(random).toHaveBeenCalledTimes(11);
    expect(hit.reveal?.damageBreakdown).toBeUndefined();
    expect(getMonster(f.target.id)?.curHp).toBe(200);
    expect(hit.pending?.amount).toBe(42);
    const pending = getRollEntry(hit.id)!.pending!;
    expect(total(pending.damageBreakdown!)).toBe(42);
    expect(pending.damageBreakdown?.dice.filter((step) => step.label.includes('CRIT'))).toEqual([
      { label: 'CRIT', value: 12, faces: [6, 6] },
      { label: '1d6 (Rune edge CRIT)', value: 6, faces: [6] },
      { label: "1d4 (Hunter's Mark CRIT)", value: 4, faces: [4] },
    ]);
    const other = buildSnapshot(f.session.id, 'player', null, 'other')!.rollLog.at(-1)!;
    expect(other.pending).toBeUndefined();
    expect(other.reveal?.damageBreakdown).toBeUndefined();
    expect(resolveAttackDamage(f.session.id, 'Fighter', hit.id)).toBe(true);
    expect(random).toHaveBeenCalledTimes(11); // no reroll on resolution
    const resolved = listRollLog(f.session.id).at(-1)!;
    expect(resolved.reveal?.damageBreakdown).toEqual(pending.damageBreakdown);
    expect(getRollEntry(resolved.id)?.reveal?.damageBreakdown).toEqual(pending.damageBreakdown);
    expect(getMonster(f.target.id)?.curHp).toBe(158);
    expect(resolveAttackDamage(f.session.id, 'Fighter', hit.id)).toBe(false);
  });

  it('keeps negative homebrew rider faces and minimum damage arithmetic truthful', () => {
    const f = fixture(false);
    updateCharacter(f.attacker.id, { stats: { STR: 1 }, weapons: [
      { name: 'Weak blade', kind: 'melee', damage: '1d1', damageType: 'slashing', attackBonus: 50 },
    ], sheetAbilities: [{ id: 'signed', name: 'Signed rider', type: 'stance', description: '',
      stance: { active: true, appliesTo: 'melee', bonusDamage: '1d6-1d4-5' } }] });
    const random = vi.spyOn(Math, 'random').mockReturnValue(.5);
    resolveAttack(f.session.id, 'Fighter', f.attackToken.id, f.targetToken.id, 0);
    const reveal = listRollLog(f.session.id).at(-1)!.reveal!;
    expect(random).toHaveBeenCalledTimes(4);
    expect(reveal.damage).toBe(1);
    expect(total(reveal.damageBreakdown!)).toBe(1);
    expect(reveal.damageBreakdown?.mods).toContainEqual({ label: '1d4 (Signed rider)', value: -3, faces: [3] });
    expect(reveal.damageBreakdown?.mods).toContainEqual({ label: 'Signed rider not applied', value: 4 });
    expect(reveal.damageBreakdown?.mods.filter((step) => step.label === 'minimum damage').map((step) => step.value)).toEqual([5, 1]);
  });

  for (const disposition of ['enemy', 'neutral'] as const) {
    it(`does not disclose named ${disposition} damage modifiers or riders`, () => {
      const f = fixture(false);
      const hostile = createMonsterTemplate(f.session.id, { name: 'Secret creature', disposition,
        maxHp: 50, stats: { STR: 16 }, weapons: [{ name: 'Bite', kind: 'melee',
          damage: '2d6+4', magicBonus: 2, extraDamage: '1d4+1', extraDamageType: 'fire', attackBonus: 50 }] });
      const creature = instantiateMonster(hostile.id)!;
      const token = createToken({ mapId: f.map.id, kind: 'monster', refId: creature.id, x: 0, y: 0 });
      vi.spyOn(Math, 'random').mockReturnValue(.5);
      resolveAttack(f.session.id, 'Creature', token.id, f.targetToken.id, 0);
      const dm = buildSnapshot(f.session.id, 'dm')!.rollLog.at(-1)!.reveal!;
      const player = buildSnapshot(f.session.id, 'player')!.rollLog.at(-1)!.reveal!;
      expect(dm.damageBreakdown?.mods.map((step) => step.label)).toContain('MAGIC');
      expect(JSON.stringify(player.damageBreakdown)).not.toMatch(/MAGIC|flat|rider|fire|STR|vulnerable/);
      expect(player.damageBreakdown?.dice.map((step) => step.label)).toEqual(['2d6', '1d4']);
      expect(player.damageBreakdown?.mods.every((step) => step.label === '')).toBe(true);
      expect(total(player.damageBreakdown!)).toBe(player.damage);
      expect(total(dm.damageBreakdown!)).toBe(dm.damage);
    });
  }

  it('leaves old pending rolls without detailed metadata compatible', () => {
    const f = fixture();
    const entry = addRollLog(f.session.id, { roller: 'Fighter', label: 'Attack', expr: 'Old sword', total: 20,
      detail: 'Historical hit — roll damage', pending: {
        target: { kind: 'monster', refId: f.target.id, name: f.target.name },
        attacker: { kind: 'pc', refId: f.attacker.id }, weapon: 'Old sword', amount: 5,
        crit: false, dice: [{ label: '1d6', value: 2, faces: [2] }], mods: [{ label: 'STR', value: 3 }],
      } });
    expect(resolveAttackDamage(f.session.id, 'Fighter', entry.id)).toBe(true);
    const reveal = listRollLog(f.session.id).at(-1)!.reveal!;
    expect(reveal.damageBreakdown).toBeUndefined();
    expect(reveal.damageDice).toEqual([{ label: '1d6', value: 2, faces: [2] }]);
    expect(reveal.damageMods).toEqual([{ label: 'STR', value: 3 }]);
    expect(getMonster(f.target.id)?.curHp).toBe(195);
  });

  it('does not return new secret pending detail even to the action owner', () => {
    const f = fixture();
    claimCharacter(f.attacker.id, 'secret-detail-owner');
    const entry = addRollLog(f.session.id, { roller: 'Companion', label: 'Attack', expr: 'Secret hit', total: 20,
      detail: 'Hit — roll damage', hideMods: true, pending: {
        target: { kind: 'monster', refId: f.target.id, name: f.target.name },
        attacker: { kind: 'pc', refId: f.attacker.id }, weapon: 'Secret hit', amount: 5, owner: f.attacker.id,
        crit: false, dice: [{ label: '1d6', value: 2, faces: [2] }], mods: [{ label: 'STR', value: 3 }],
        damageBreakdown: { dice: [{ label: '1d6 (secret feature)', value: 2, faces: [2] }],
          mods: [{ label: 'secret source', value: 3 }] },
      } });
    const mine = buildSnapshot(f.session.id, 'player', null, 'secret-detail-owner')!.rollLog.find((roll) => roll.id === entry.id)!;
    expect(mine.pending).toBeDefined();
    expect(mine.pending?.damageBreakdown).toBeUndefined();
    expect(buildSnapshot(f.session.id, 'dm')!.rollLog.find((roll) => roll.id === entry.id)?.pending?.damageBreakdown).toBeDefined();
  });
});
