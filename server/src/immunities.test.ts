import { describe, it, expect } from 'vitest';
import {
  damageMultiplier,
  parseDamageTrait,
  traitApplies,
} from '../../shared/combatMath.js';
import {
  createSession,
  createMap,
  setActiveMap,
  createToken,
  createCharacter,
  createMonsterTemplate,
  instantiateMonster,
  updateMonster,
  getMonster,
  listRollLog,
  setManualDamage,
  setSheetAbility,
  setResource,
} from './sessions.js';
import { resolveAttack } from './combat.js';
import { allSrd, getSrd } from './creatures/srd.js';
import { saveLibraryCreature, getLibraryCreature } from './library.js';
import { buildSnapshot } from './visibility.js';
import type { Weapon, MonsterPublic } from '../../shared/types.js';

/** Group B of the 25 Sep review: immunities, conditional resistances, crit
 *  doubling of every damage die, and adv/dis cancellation. */

describe('parseDamageTrait — a structured reading, never a substring match', () => {
  it('reads a plain damage type', () => {
    expect(parseDamageTrait('Fire')).toEqual({ types: ['fire'], unlessMagical: false, unlessSilvered: false });
  });
  it('reads the SRD "nonmagical B/P/S" shorthand', () => {
    expect(parseDamageTrait('nonmagical bludgeoning/piercing/slashing')).toEqual({
      types: ['bludgeoning', 'piercing', 'slashing'], unlessMagical: true, unlessSilvered: false,
    });
  });
  it('reads the non-silvered qualifier in both phrasings', () => {
    expect(parseDamageTrait('nonmagical non-silvered bludgeoning/piercing/slashing')!.unlessSilvered).toBe(true);
    const long = parseDamageTrait(
      "bludgeoning, piercing, and slashing from nonmagical attacks that aren't silvered",
    )!;
    expect(long).toEqual({
      types: ['bludgeoning', 'piercing', 'slashing'], unlessMagical: true, unlessSilvered: true,
    });
  });
  it('does not mistake a condition for a damage type', () => {
    // "poisoned" is a condition immunity; it must never block poison DAMAGE.
    expect(traitApplies('poisoned', 'poison')).toBe(false);
    expect(traitApplies('charmed', 'psychic')).toBe(false);
  });
  it('keeps exact matching for a homebrew type', () => {
    expect(traitApplies('sonic', 'sonic')).toBe(true);
    expect(traitApplies('sonic', 'thunder')).toBe(false);
  });
});

describe('damageMultiplier', () => {
  it('immunity is 0 and beats vulnerability', () => {
    expect(damageMultiplier('fire', [], ['fire'], ['fire'])).toBe(0);
  });
  it('resistance and vulnerability still cancel', () => {
    expect(damageMultiplier('fire', ['fire'], ['fire'])).toBe(1);
  });
  it('a conditional resistance: mundane halves, magical and silvered overcome it', () => {
    const r = ['nonmagical non-silvered bludgeoning/piercing/slashing'];
    expect(damageMultiplier('slashing', r, [])).toBe(0.5);
    expect(damageMultiplier('slashing', r, [], [], { magical: true })).toBe(1);
    expect(damageMultiplier('slashing', r, [], [], { silvered: true })).toBe(1);
    expect(damageMultiplier('fire', r, [])).toBe(1); // wrong type entirely
  });
  it('a nonmagical-only resistance ignores silvering', () => {
    const r = ['nonmagical bludgeoning/piercing/slashing'];
    expect(damageMultiplier('piercing', r, [], [], { silvered: true })).toBe(0.5);
  });
});

describe('SRD immunities', () => {
  it('every creature whose stat block says "Immune to <type>" carries that immunity', () => {
    const types = ['acid', 'bludgeoning', 'cold', 'fire', 'force', 'lightning', 'necrotic',
      'piercing', 'poison', 'psychic', 'radiant', 'slashing', 'thunder'];
    for (const c of allSrd()) {
      for (const ab of c.abilities) {
        const m = /immune to ([^;.]*)/i.exec(ab.description);
        if (!m) continue;
        for (const t of types) {
          if (new RegExp(`\\b${t}\\b`).test(m[1].toLowerCase()))
            expect(c.immunities ?? [], `${c.name}: ${t}`).toContain(t);
        }
      }
    }
  });
  it('the Young Red Dragon is IMMUNE to fire, not merely resistant', () => {
    const d = getSrd('Young Red Dragon')!;
    expect(d.immunities).toContain('fire');
    expect(d.resistances).not.toContain('fire');
  });
});

// --- through the real attack pipeline -----------------------------------------

function arena() {
  const s = createSession('Immune');
  const map = createMap(s.id, { name: 'Pit' });
  setActiveMap(s.id, map.id);
  setManualDamage(s.id, false);
  return { sid: s.id, mapId: map.id };
}

/** A fighter with the given weapon vs a creature; returns ids + a swing helper. */
function duel(weapon: Weapon, target: Parameters<typeof createMonsterTemplate>[1]) {
  const { sid, mapId } = arena();
  const ch = createCharacter(sid, { name: 'F', stats: { STR: 10 }, weapons: [weapon] });
  const atk = createToken({ mapId, kind: 'pc', refId: ch.id, x: 0, y: 0 });
  const tmpl = createMonsterTemplate(sid, target);
  const mon = instantiateMonster(tmpl.id)!;
  const tgt = createToken({ mapId, kind: 'monster', refId: mon.id, x: 60, y: 0 });
  /** Attack until a plain (non-crit) hit lands; returns the damage dealt. */
  const hit = () => {
    for (let i = 0; i < 80; i++) {
      const before = getMonster(mon.id)!.curHp;
      resolveAttack(sid, 'F', atk.id, tgt.id, 0);
      const d = listRollLog(sid).at(-1)!.detail;
      if (/— HIT/.test(d)) return before - getMonster(mon.id)!.curHp;
    }
    throw new Error('never hit');
  };
  return { sid, ch, mon, atk: atk.id, tgt: tgt.id, hit };
}

const elemental = { name: 'Fire Elemental', maxHp: 9999, armorClass: 1,
  resistances: ['nonmagical bludgeoning/piercing/slashing'], immunities: ['fire', 'poison'] };

describe('immunities and source properties in a real attack', () => {
  it('fire vs a fire-immune creature deals 0 — the "at least 1" rule does not apply', () => {
    const d = duel({ name: 'Torch', kind: 'melee', damage: '10d1', damageType: 'fire', attackBonus: 50 }, elemental);
    expect(d.hit()).toBe(0);
    expect(listRollLog(d.sid).at(-1)!.detail).toMatch(/immune \(fire\)/);
  });

  it('a mundane sword is halved by "nonmagical" resistance', () => {
    const d = duel({ name: 'Sword', kind: 'melee', damage: '10d1', damageType: 'slashing', attackBonus: 50 }, elemental);
    expect(d.hit()).toBe(5);
  });

  it('a +1 sword, a weapon flagged magical, and a magical-attacks feature all get through', () => {
    const plus1 = duel({ name: '+1 Sword', kind: 'melee', damage: '10d1', damageType: 'slashing', attackBonus: 50, magicBonus: 1 }, elemental);
    expect(plus1.hit()).toBe(11);
    const flagged = duel({ name: 'Moonblade', kind: 'melee', damage: '10d1', damageType: 'slashing', attackBonus: 50, magical: true }, elemental);
    expect(flagged.hit()).toBe(10);
    const monk = duel({ name: 'Fist', kind: 'melee', damage: '10d1', damageType: 'bludgeoning', attackBonus: 50 }, elemental);
    setSheetAbility('pc', monk.ch.id, { id: 'es', name: 'Empowered Strikes', type: 'stance', description: '',
      stance: { active: true, appliesTo: 'melee', magicalAttacks: true } });
    expect(monk.hit()).toBe(10);
  });

  it('a silvered weapon overcomes a non-silvered resistance', () => {
    const imp = { name: 'Imp', maxHp: 9999, armorClass: 1,
      resistances: ['nonmagical non-silvered bludgeoning/piercing/slashing'] };
    expect(duel({ name: 'Dagger', kind: 'melee', damage: '10d1', damageType: 'piercing', attackBonus: 50 }, imp).hit()).toBe(5);
    expect(duel({ name: 'Silver dagger', kind: 'melee', damage: '10d1', damageType: 'piercing', attackBonus: 50, silvered: true }, imp).hit()).toBe(10);
  });

  it('a flaming rider is immune-checked on its own type', () => {
    const d = duel({ name: 'Flame Tongue', kind: 'melee', damage: '10d1', damageType: 'slashing', attackBonus: 50,
      magicBonus: 1, extraDamage: '4d1', extraDamageType: 'fire' }, elemental);
    // Slashing 10 + 1 magic gets through (magical); fire 4 is immune → 11.
    expect(d.hit()).toBe(11);
  });
});

describe('immunities persist and stay behind the visibility gate', () => {
  it('survive an update, and a trip to the library and back', () => {
    const { sid } = arena();
    const t = createMonsterTemplate(sid, { name: 'Emberling', maxHp: 20, immunities: ['fire'] });
    expect(getMonster(t.id)!.immunities).toEqual(['fire']);
    updateMonster(t.id, { immunities: ['fire', 'poison'] });
    expect(getMonster(t.id)!.immunities).toEqual(['fire', 'poison']);
    const saved = saveLibraryCreature({ ...getMonster(t.id)!, name: 'Emberling Lib' }, true);
    expect('saved' in saved).toBe(true);
    expect(getLibraryCreature('Emberling Lib')!.immunities).toEqual(['fire', 'poison']);
  });

  it('players never see an enemy creature\'s immunities; a friendly one shows them', () => {
    const { sid, mapId } = arena();
    const foe = instantiateMonster(createMonsterTemplate(sid, { name: 'Foe', maxHp: 5, immunities: ['fire'] }).id)!;
    const pal = instantiateMonster(createMonsterTemplate(sid, { name: 'Pal', maxHp: 5, immunities: ['cold'] }).id)!;
    updateMonster(pal.id, { disposition: 'friendly' });
    createToken({ mapId, kind: 'monster', refId: foe.id, x: 0, y: 0 });
    createToken({ mapId, kind: 'monster', refId: pal.id, x: 50, y: 0 });
    const snap = buildSnapshot(sid, 'player')!;
    const seen = (id: string) => snap.monsters.find((m) => m.id === id) as MonsterPublic & { immunities?: string[] };
    expect(seen(foe.id)?.immunities).toBeUndefined();
    expect(seen(pal.id)?.immunities).toEqual(['cold']);
  });
});

describe('a crit doubles every damage DIE — never a flat', () => {
  it("a rider's flat part is not doubled", () => {
    // 2d1+5 fire rider: a plain hit adds 7; a crit adds 2 + 5 + 2 = 9, not 14.
    const d = duel({ name: 'Brand', kind: 'melee', damage: '1d1', damageType: 'slashing', attackBonus: 50,
      extraDamage: '2d1+5', extraDamageType: 'fire' }, { name: 'Dummy', maxHp: 9999, armorClass: 1 });
    let sawCrit = false;
    for (let i = 0; i < 400 && !sawCrit; i++) {
      const before = getMonster(d.mon.id)!.curHp;
      resolveAttack(d.sid, 'F', d.atk, d.tgt, 0);
      if (/— CRIT/.test(listRollLog(d.sid).at(-1)!.detail)) {
        sawCrit = true;
        // weapon 1d1 + crit 1d1 = 2, rider 9 → 11.
        expect(before - getMonster(d.mon.id)!.curHp).toBe(11);
      }
    }
    expect(sawCrit).toBe(true);
  });

  it('a damage Superiority Die is rolled again on a crit', () => {
    const d = duel({ name: 'Blade', kind: 'melee', damage: '1d1', damageType: 'slashing', attackBonus: 50 },
      { name: 'Dummy', maxHp: 9999, armorClass: 1 });
    let sawCrit = false;
    for (let i = 0; i < 400 && !sawCrit; i++) {
      setSheetAbility('pc', d.ch.id, { id: 'pa', name: 'Precision Push', type: 'maneuver', description: '',
        maneuver: { active: true, addDieTo: 'damage' } });
      setResource(d.ch.id, 'resources', 'Superiority Dice', { max: 4, used: 0 });
      const before = getMonster(d.mon.id)!.curHp;
      resolveAttack(d.sid, 'F', d.atk, d.tgt, 0);
      const e = listRollLog(d.sid).at(-1)!;
      if (!/— CRIT/.test(e.detail)) continue;
      sawCrit = true;
      const dice = e.reveal!.damageBreakdown!.dice;
      const die = dice.find((x) => x.label.endsWith('(Precision Push)'))!;
      const again = dice.find((x) => x.label.endsWith('(Precision Push CRIT)'))!;
      expect(die).toBeTruthy();
      expect(again).toBeTruthy(); // the second roll the crit requires
      expect(again.faces).toHaveLength(1);
      // weapon 1d1 ×2 = 2, plus BOTH superiority dice (no flats doubled).
      expect(before - getMonster(d.mon.id)!.curHp).toBe(2 + die.value + again.value);
    }
    expect(sawCrit).toBe(true);
  });
});

describe('feature advantage cancels a requested disadvantage', () => {
  it('Reckless Attack + requested disadvantage = a straight roll', () => {
    const d = duel({ name: 'Axe', kind: 'melee', damage: '1d1', damageType: 'slashing', attackBonus: 50 },
      { name: 'Dummy', maxHp: 9999, armorClass: 1 });
    setSheetAbility('pc', d.ch.id, { id: 'ra', name: 'Reckless Attack', type: 'stance', description: '',
      stance: { active: true, appliesTo: 'melee', grantsAdvantage: true } });
    resolveAttack(d.sid, 'F', d.atk, d.tgt, 0, 'dis');
    const detail = listRollLog(d.sid).at(-1)!.detail;
    expect(detail).toMatch(/straight: .*Reckless Attack/);
    expect(detail).toMatch(/requested dis/);
    // One d20 was rolled, not two.
    expect(detail).not.toMatch(/d20\[\d+,\d+\]|\bkept\b/);
  });
});
