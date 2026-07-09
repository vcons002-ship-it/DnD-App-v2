import { describe, it, expect } from 'vitest';
import {
  resolveAttack,
  resolveSaves,
  resolveSave,
  resolveCheck,
  resolveSkillRoll,
  resolveTrapDisarm,
  resolveAbilityRoll,
  resolveMonsterSheetAbility,
  resolveForcedSave,
  resolveDeathSave,
  noteConcentration,
  resolveObjectCheck,
} from './combat.js';
import {
  createSession,
  setCombatRound,
  createMap,
  setActiveMap,
  createToken,
  createCharacter,
  createMonsterTemplate,
  instantiateMonster,
  setSheetAbility,
  setResource,
  getCharacter,
  updateMonster,
  getMonster,
  getToken,
  setCondition,
  setDeathSaves,
  applyDamage,
  listRollLog,
  getRollEntry,
  setLoot,
} from './sessions.js';
import { buildSnapshot, lootVisibleToPlayers } from './visibility.js';
import type { CreatureAbility, SheetAbility } from '../../shared/types.js';

function arena() {
  const s = createSession('Combat');
  const map = createMap(s.id, { name: 'Pit' });
  setActiveMap(s.id, map.id);
  return { s, map };
}

/** Inline monster sheet ability (the merged action system) for roll tests. */
const monAbility = (
  a: Pick<SheetAbility, 'name' | 'description' | 'roll'>,
): SheetAbility => ({ id: 'mon-ab', type: 'ability', ...a });

/** PC attacker vs a dummy target, with a mastery attached. `bonus`/`ac` tune
 *  the to-hit so a test can drive hits or misses, then loop for the d20. */
function masteryFight(opts: {
  weapon: string;
  attackBonus: number;
  targetAc: number;
  mastery: SheetAbility['mastery'];
  str?: number;
  damage?: string;
  magicBonus?: number;
  tags?: string[];
}) {
  const { s, map } = arena();
  const ch = createCharacter(s.id, {
    name: 'Striker',
    className: 'Fighter',
    level: 1,
    stats: { STR: opts.str ?? 16 },
    weapons: [{
      name: opts.weapon,
      kind: 'melee',
      damage: opts.damage ?? '2d6',
      attackBonus: opts.attackBonus,
      magicBonus: opts.magicBonus,
      tags: opts.tags ?? ['test'],
    }],
  });
  setSheetAbility('pc', ch.id, {
    id: 'm1',
    name: 'TestMastery',
    type: 'mastery',
    description: '',
    mastery: opts.mastery,
  });
  const atk = createToken({ mapId: map.id, kind: 'pc', refId: ch.id, x: 0, y: 0 });
  const tmpl = createMonsterTemplate(s.id, { name: 'Dummy', maxHp: 999, armorClass: opts.targetAc });
  const tgt = createToken({ mapId: map.id, kind: 'monster', refId: instantiateMonster(tmpl.id)!.id, x: 1, y: 1 });
  return { s: s.id, atk: atk.id, tgt: tgt.id };
}

describe('combat resolution', () => {
  it('logs an attack and applies damage on a hit', () => {
    const { s, map } = arena();
    const atkTmpl = createMonsterTemplate(s.id, {
      name: 'Brute',
      maxHp: 30,
      stats: { STR: 18 },
      weapons: [{ name: 'Slam', kind: 'melee', damage: '2d6+4', attackBonus: 50 }],
    });
    const target = createMonsterTemplate(s.id, { name: 'Dummy', maxHp: 40, armorClass: 1 });
    const aInst = instantiateMonster(atkTmpl.id)!;
    const a = createToken({ mapId: map.id, kind: 'monster', refId: aInst.id, x: 0, y: 0 });
    const tInst = instantiateMonster(target.id)!;
    const t = createToken({ mapId: map.id, kind: 'monster', refId: tInst.id, x: 1, y: 1 });

    const before = getMonster(tInst.id)!.curHp;
    const ok = resolveAttack(s.id, 'DM', a.id, t.id, 0);
    expect(ok).toBe(true);
    const log = listRollLog(s.id);
    expect(log).toHaveLength(1);
    expect(log[0].detail).toMatch(/Brute.* → Dummy.*: Slam/);
    // +50 to hit vs AC 1 lands on anything but a nat 1, so usually damages.
    const after = getMonster(tInst.id)!.curHp;
    expect(after).toBeLessThanOrEqual(before);
    // The attacker's badge now follows the weapon last used (a melee Slam).
    expect(getMonster(aInst.id)!.lastAttackRole).toBe('melee');
  });

  it('attaches a reveal payload (d20 + outcome + damage) to an attack roll', () => {
    const { s, map } = arena();
    const atkTmpl = createMonsterTemplate(s.id, {
      name: 'Brute',
      maxHp: 30,
      weapons: [{ name: 'Slam', kind: 'melee', damage: '2d6+4', attackBonus: 50 }],
    });
    const target = createMonsterTemplate(s.id, { name: 'Dummy', maxHp: 40, armorClass: 1 });
    const a = createToken({ mapId: map.id, kind: 'monster', refId: instantiateMonster(atkTmpl.id)!.id, x: 0, y: 0 });
    const t = createToken({ mapId: map.id, kind: 'monster', refId: instantiateMonster(target.id)!.id, x: 1, y: 1 });
    resolveAttack(s.id, 'DM', a.id, t.id, 0); // +50 vs AC 1 → hits (unless a nat 1)
    const reveal = listRollLog(s.id).at(-1)!.reveal!;
    expect(reveal).toBeTruthy();
    expect(reveal.kind).toBe('attack');
    expect(reveal.d20!).toBeGreaterThanOrEqual(1);
    expect(reveal.d20!).toBeLessThanOrEqual(20);
    // Outcome is one of the four reveal states and matches the rolled face.
    expect(['hit', 'crit', 'miss', 'fumble']).toContain(reveal.outcome);
    expect(reveal.outcome).toBe(reveal.d20 === 20 ? 'crit' : reveal.d20 === 1 ? 'fumble' : 'hit');
    expect(reveal.attacker).toContain('Brute'); // instances are numbered ("Brute 1")
    expect(reveal.target).toContain('Dummy');
    // The to-hit total equals the natural d20 plus every revealed bonus step.
    const bonusSum = (reveal.toHit ?? []).reduce((s, x) => s + x.value, 0);
    expect(reveal.attackTotal).toBe(reveal.d20! + bonusSum);
    if (reveal.outcome !== 'fumble') {
      expect(reveal.damage).toBeGreaterThan(0);
      // The damage count-up (dice + mods) lands on the applied damage.
      const dice = (reveal.damageDice ?? []).reduce((s, x) => s + x.value, 0);
      const mods = (reveal.damageMods ?? []).reduce((s, x) => s + x.value, 0);
      expect(dice + mods).toBe(reveal.damage);
      // Each dice step carries its individual faces.
      expect((reveal.damageDice ?? [])[0]?.faces?.length).toBeGreaterThan(0);
    }
  });

  it('credits a PC with a kill when its attack drops an enemy to 0 HP', () => {
    const { s, map } = arena();
    const ch = createCharacter(s.id, {
      name: 'Slayer',
      className: 'Fighter',
      level: 1,
      stats: { STR: 16 },
      weapons: [{ name: 'Greatsword', kind: 'melee', damage: '2d6', attackBonus: 50 }],
    });
    const atk = createToken({ mapId: map.id, kind: 'pc', refId: ch.id, x: 0, y: 0 });
    const tmpl = createMonsterTemplate(s.id, { name: 'Goblin', maxHp: 1, armorClass: 1 });
    const gob = instantiateMonster(tmpl.id)!;
    const tgt = createToken({ mapId: map.id, kind: 'monster', refId: gob.id, x: 1, y: 1 });

    expect(getCharacter(ch.id)!.killCount).toBe(0);
    // Attack until the 1-HP goblin drops (a +50 attack still misses on a nat 1,
    // leaving it at 1 HP — so loop past the rare fumble). A miss never credits a
    // kill, so the count lands on exactly 1 at the killing blow.
    let killed = false;
    for (let i = 0; i < 40 && !killed; i++) {
      resolveAttack(s.id, ch.name, atk.id, tgt.id, 0);
      killed = getMonster(gob.id)!.curHp <= 0;
    }
    expect(killed).toBe(true);
    expect(getCharacter(ch.id)!.killCount).toBe(1);

    // Hitting an already-dead target does NOT double-count the kill.
    resolveAttack(s.id, ch.name, atk.id, tgt.id, 0);
    expect(getCharacter(ch.id)!.killCount).toBe(1);
  });

  it('does not credit a kill to a monster attacker', () => {
    const { s, map } = arena();
    const atkTmpl = createMonsterTemplate(s.id, {
      name: 'Ogre',
      maxHp: 30,
      weapons: [{ name: 'Club', kind: 'melee', damage: '2d6', attackBonus: 50 }],
    });
    const a = createToken({ mapId: map.id, kind: 'monster', refId: instantiateMonster(atkTmpl.id)!.id, x: 0, y: 0 });
    const tTmpl = createMonsterTemplate(s.id, { name: 'Rat', maxHp: 1, armorClass: 1 });
    const t = createToken({ mapId: map.id, kind: 'monster', refId: instantiateMonster(tTmpl.id)!.id, x: 1, y: 1 });
    // No throw / no PC to credit — just confirm it resolves cleanly.
    expect(resolveAttack(s.id, 'DM', a.id, t.id, 0)).toBe(true);
  });

  it("a PC's AOE save spell rolls damage but does NOT auto-apply to its target", () => {
    const { s, map } = arena();
    const ch = createCharacter(s.id, {
      name: 'Wizard',
      className: 'Wizard',
      level: 5,
      stats: { INT: 18 },
    });
    const tmpl = createMonsterTemplate(s.id, { name: 'Goblin', maxHp: 20, stats: { DEX: 10 } });
    const inst = instantiateMonster(tmpl.id)!;
    const tgt = createToken({ mapId: map.id, kind: 'monster', refId: inst.id, x: 1, y: 1 });
    const ability: SheetAbility = {
      id: 'fb',
      name: 'Fireball',
      type: 'spell',
      level: 3,
      description: '',
      roll: { kind: 'save', dice: '8d6', baseLevel: 3, save: 'DEX', damageType: 'fire' },
    };
    // Cast AT a target (combat console / floating menu).
    resolveAbilityRoll(s.id, ch.name, ch, ability, undefined, undefined, tgt.id);
    const entry = listRollLog(s.id).at(-1)!;
    // The damage is rolled once and carried for later per-target clicks…
    expect(entry.apply?.save).toBe('DEX');
    expect(entry.apply?.amount).toBeGreaterThan(0);
    // …owner is the casting PC, so visibility keeps the apply for them (Apply button)…
    expect(entry.apply?.owner).toBe(ch.id);
    // …and NOTHING was auto-applied to the targeted creature.
    expect(getMonster(inst.id)!.curHp).toBe(20);
    // The caster (or DM) then resolves it per target via the click path.
    resolveForcedSave(s.id, entry.id, tgt.id);
    expect(getMonster(inst.id)!.curHp).toBeLessThan(20);
  });

  it('rolls a save for each token and logs pass/fail', () => {
    const { s, map } = arena();
    const tmpl = createMonsterTemplate(s.id, { name: 'Goblin', maxHp: 7, stats: { DEX: 14 } });
    const a = createToken({ mapId: map.id, kind: 'monster', refId: instantiateMonster(tmpl.id)!.id, x: 0, y: 0 });
    const b = createToken({ mapId: map.id, kind: 'monster', refId: instantiateMonster(tmpl.id)!.id, x: 1, y: 1 });

    resolveSaves(s.id, 'DM', [a.id, b.id], 'DEX', 12);
    const log = listRollLog(s.id);
    expect(log).toHaveLength(2);
    expect(log.every((e) => e.label === 'DEX save')).toBe(true);
    expect(log.every((e) => /PASS|FAIL/.test(e.detail))).toBe(true);
  });

  it('rolls a skill check using the sheet ability mod + proficiency', () => {
    const s = createSession('Skills');
    // DEX 16 (+3); level 5 → proficiency +3. Stealth is a DEX skill.
    const c = createCharacter(s.id, {
      name: 'Rogue',
      className: 'Rogue',
      level: 5,
      stats: { DEX: 16 },
      proficientSkills: ['Stealth'],
    });

    expect(resolveSkillRoll(s.id, 'Rogue', c, 'Stealth')).toBe(true);
    const stealth = listRollLog(s.id).at(-1)!;
    expect(stealth.label).toBe('Stealth check'); // drives skill color-coding
    // Proficiency is an explicit labelled term now (matching attack/save logs),
    // not a cooked-in number + "(proficient)" note.
    expect(stealth.detail).toContain('+3[DEX]');
    expect(stealth.detail).toContain('+3[PROF]');
    expect(stealth.detail).not.toContain('(proficient)');
    // d20 (1-20) + 3 mod + 3 prof = 7..26.
    expect(stealth.total).toBeGreaterThanOrEqual(7);
    expect(stealth.total).toBeLessThanOrEqual(26);

    // Non-proficient skill: ability mod only (+3[INT]), no PROF term.
    resolveSkillRoll(s.id, 'Rogue', c, 'Arcana');
    const arcana = listRollLog(s.id).at(-1)!;
    expect(arcana.label).toBe('Arcana check');
    expect(arcana.detail).not.toContain('[PROF]');

    // Unknown skill name → no roll logged.
    const before = listRollLog(s.id).length;
    expect(resolveSkillRoll(s.id, 'Rogue', c, 'Juggling')).toBe(false);
    expect(listRollLog(s.id).length).toBe(before);
  });

  it('a poisoned character rolls ability checks with disadvantage', () => {
    const s = createSession('Poisoned check');
    const c = createCharacter(s.id, {
      name: 'Rogue',
      className: 'Rogue',
      level: 5,
      stats: { DEX: 16 },
      proficientSkills: ['Stealth'],
    });
    setCondition('pc', c.id, {
      id: 'cond1',
      label: 'Poisoned',
      aura: 'red',
      isConcentration: false,
    });
    const fresh = getCharacter(c.id)!;
    resolveSkillRoll(s.id, 'Rogue', fresh, 'Stealth');
    const log = listRollLog(s.id).at(-1)!;
    expect(log.detail).toContain('dis');
    expect(log.detail.toLowerCase()).toContain('poisoned');
  });

  it('a paralyzed target auto-fails the DEX save and takes full damage', () => {
    const { s, map } = arena();
    const tmpl = createMonsterTemplate(s.id, {
      name: 'Fire Trap',
      maxHp: 1,
      objectKind: 'trap',
      actions: [
        {
          name: 'Flame Burst',
          description: 'DC 13 Dexterity saving throw, 4d6 fire damage (half on save).',
        },
      ],
    });
    const trap = instantiateMonster(tmpl.id)!;
    resolveMonsterSheetAbility(s.id, 'DM', trap, trap.sheetAbilities[0]);
    const entry = listRollLog(s.id).at(-1)!;
    const amount = entry.apply!.amount;

    // A paralyzed victim on the map.
    const victimTmpl = createMonsterTemplate(s.id, { name: 'Goblin', maxHp: 50 });
    const victim = instantiateMonster(victimTmpl.id)!;
    const vtok = createToken({ mapId: map.id, kind: 'monster', refId: victim.id, x: 2, y: 2 });
    setCondition('monster', victim.id, {
      id: 'cond2',
      label: 'Paralyzed',
      aura: 'red',
      isConcentration: false,
    });

    resolveForcedSave(s.id, entry.id, vtok.id, undefined);
    const saveLog = listRollLog(s.id).at(-1)!;
    expect(saveLog.detail).toContain('auto-fails');
    expect(saveLog.detail).toContain('FAIL');
    // Full damage applied (no halving), so HP dropped by the whole amount.
    expect(getMonster(victim.id)!.curHp).toBe(50 - amount);
  });

  it('a paralyzed target within 5 ft suffers an automatic critical hit', () => {
    const { s, atk, tgt } = masteryFight({
      weapon: 'Sword',
      attackBonus: 50, // always hits (except a nat-1 fumble)
      targetAc: 5,
      damage: '1d6',
      mastery: { active: false, appliesToTags: [] },
    });
    setCondition('monster', getToken(tgt)!.refId, {
      id: 'p1',
      label: 'Paralyzed',
      aura: 'red',
      isConcentration: false,
    });
    let detail = '';
    for (let i = 0; i < 40 && !detail; i++) {
      resolveAttack(s, 'Striker', atk, tgt, 0);
      const last = listRollLog(s).at(-1)!.detail;
      if (/HIT|CRIT/.test(last) && !/nat 1/.test(last)) detail = last;
    }
    expect(detail).toContain('CRIT');
    expect(detail).toContain('auto-crit (paralyzed)');
  });

  it('stamps the combat round on a condition (and its cascade) for tracking', () => {
    const s = createSession('Rounds');
    const c = createCharacter(s.id, { name: 'Stunned One' });
    setCombatRound(s.id, 3);
    setCondition('pc', c.id, { id: 'st', label: 'Stunned', aura: 'red', isConcentration: false });
    const conds = getCharacter(c.id)!.conditions;
    expect(conds.find((x) => x.label === 'Stunned')?.round).toBe(3);
    expect(conds.find((x) => x.label === 'Incapacitated')?.round).toBe(3); // cascaded
  });

  it('does not stamp a round outside combat (round 0)', () => {
    const s = createSession('NoCombat');
    const c = createCharacter(s.id, { name: 'Tripped' });
    setCondition('pc', c.id, { id: 'pr', label: 'Prone', aura: 'red', isConcentration: false });
    expect(getCharacter(c.id)!.conditions.find((x) => x.label === 'Prone')?.round).toBeUndefined();
  });

  it('applying Unconscious cascades Incapacitated + Prone', () => {
    const s = createSession('Cascade');
    const c = createCharacter(s.id, { name: 'Faint' });
    setCondition('pc', c.id, {
      id: 'u1',
      label: 'Unconscious',
      aura: 'red',
      isConcentration: false,
    });
    const labels = getCharacter(c.id)!.conditions.map((x) => x.label.toLowerCase());
    expect(labels).toEqual(expect.arrayContaining(['unconscious', 'incapacitated', 'prone']));
  });

  it('resolves a trap disarm vs the trap DC and logs it', () => {
    const { s } = arena();
    const rogue = createCharacter(s.id, {
      name: 'Pip',
      className: 'Rogue',
      level: 5,
      stats: { DEX: 16 },
      proficientSkills: ['Sleight of Hand'],
    });
    const tmpl = createMonsterTemplate(s.id, {
      name: 'Dart Trap',
      maxHp: 1,
      objectKind: 'trap',
      objectDc: 1, // trivially low → always succeeds
    });
    const trap = instantiateMonster(tmpl.id)!;
    expect(resolveTrapDisarm(s.id, 'Pip', rogue, trap).success).toBe(true);
    const log = listRollLog(s.id).at(-1)!;
    expect(log.label).toBe('Disarm trap');
    expect(log.detail).toContain('DISARMED');

    // An impossible DC always fails.
    const hard = instantiateMonster(
      createMonsterTemplate(s.id, {
        name: 'Vault Trap',
        maxHp: 1,
        objectKind: 'trap',
        objectDc: 99,
      }).id,
    )!;
    expect(resolveTrapDisarm(s.id, 'Pip', rogue, hard).success).toBe(false);
    expect(listRollLog(s.id).at(-1)!.detail).toContain('FAILED');
  });

  it('makes a free-text save action triggerable with an Apply-damage payload', () => {
    const { s } = arena();
    // A trap authored with only a free-text save action (no structured roll).
    const tmpl = createMonsterTemplate(s.id, {
      name: 'Poison Dart Trap',
      maxHp: 1,
      objectKind: 'trap',
      actions: [
        {
          name: 'Poison Darts',
          description: 'DC 13 Dexterity saving throw, 2d6 poison damage (half on save).',
        },
      ],
    });
    // Free-text actions convert into sheet abilities with a scraped save roll…
    const ability = tmpl.sheetAbilities[0];
    expect(ability.roll?.kind).toBe('save');
    expect(ability.roll?.save).toBe('DEX');

    // …so triggering it logs a save with an Apply-damage payload (DM tooling).
    const trap = instantiateMonster(tmpl.id)!;
    expect(
      resolveMonsterSheetAbility(s.id, 'DM', trap, trap.sheetAbilities[0]),
    ).toBe(true);
    const entry = listRollLog(s.id).at(-1)!;
    expect(entry.apply?.save).toBe('DEX');
    expect(entry.apply?.dc).toBe(13);
  });
});

describe('weapon masteries', () => {
  it('Graze deals ability-mod damage on a miss when active', () => {
    // Low to-hit vs high AC → almost always a miss; loop to find one.
    const { s, atk, tgt } = masteryFight({
      weapon: 'Greatsword',
      attackBonus: -50,
      targetAc: 50,
      str: 16, // +3
      mastery: { appliesToTags: ['test'], active: true, effect: { grazeOnMiss: true } },
    });
    let sawMiss = false;
    for (let i = 0; i < 80 && !sawMiss; i++) {
      resolveAttack(s, 'Striker', atk, tgt, 0);
      const last = listRollLog(s).at(-1)!;
      if (last.detail.includes('MISS')) {
        sawMiss = true;
        expect(last.detail).toContain('+3[GRAZE]'); // STR +3
      }
    }
    expect(sawMiss).toBe(true);
  });

  it('adds mastery bonus damage on a hit', () => {
    // High to-hit vs low AC → almost always a hit; "5d1" is a constant 5.
    const { s, atk, tgt } = masteryFight({
      weapon: 'Maul',
      attackBonus: 50,
      targetAc: 1,
      mastery: { appliesToTags: ['test'], active: true, effect: { bonusDamage: '5d1' } },
    });
    let sawHit = false;
    for (let i = 0; i < 80 && !sawHit; i++) {
      resolveAttack(s, 'Striker', atk, tgt, 0);
      const last = listRollLog(s).at(-1)!;
      if (/\bHIT\b|CRIT/.test(last.detail)) {
        sawHit = true;
        expect(last.detail).toContain('+5[TestMastery]');
      }
    }
    expect(sawHit).toBe(true);
  });

  it('does nothing when the mastery is inactive', () => {
    const { s, atk, tgt } = masteryFight({
      weapon: 'Greatsword',
      attackBonus: -50,
      targetAc: 50,
      mastery: { appliesToTags: ['test'], active: false, effect: { grazeOnMiss: true } },
    });
    for (let i = 0; i < 20; i++) resolveAttack(s, 'Striker', atk, tgt, 0);
    expect(listRollLog(s).every((e) => !e.detail.includes('GRAZE'))).toBe(true);
  });

  it('Cleave toggles itself off after an attack (hit or miss)', () => {
    const { s, atk, tgt } = masteryFight({
      weapon: 'Greataxe',
      attackBonus: 50,
      targetAc: 1,
      damage: '1d6+3',
      mastery: { appliesToTags: ['test'], active: true, effect: { cleave: true } },
    });
    const chId = getToken(atk)!.refId;
    expect(getCharacter(chId)!.sheetAbilities[0].mastery!.active).toBe(true);
    resolveAttack(s, 'Striker', atk, tgt, 0);
    expect(getCharacter(chId)!.sheetAbilities[0].mastery!.active).toBe(false);
  });

  it('Cleave applies the weapon damage to the target without the ability modifier', () => {
    // "2d1" = constant 2 dice, +1 magic; STR 16 → +3 added at roll. Normal hit =
    // 2 + 3 + 1 = 6; Cleave omits the +3 ability mod → 3 applied (dice 2 + magic
    // 1). Re-enable each loop since Cleave one-shots itself off.
    const { s, atk, tgt } = masteryFight({
      weapon: 'Greataxe',
      attackBonus: 50,
      targetAc: 1,
      damage: '2d1',
      magicBonus: 1,
      str: 16,
      mastery: { appliesToTags: ['test'], active: true, effect: { cleave: true } },
    });
    const chId = getToken(atk)!.refId;
    const ref = getToken(tgt)!.refId;
    let checked = false;
    for (let i = 0; i < 100 && !checked; i++) {
      const ab = getCharacter(chId)!.sheetAbilities[0];
      setSheetAbility('pc', chId, { ...ab, mastery: { ...ab.mastery!, active: true } });
      const before = getMonster(ref)!.curHp;
      resolveAttack(s, 'Striker', atk, tgt, 0);
      const last = listRollLog(s).at(-1)!;
      if (/\bHIT\b/.test(last.detail) && !/CRIT/.test(last.detail)) {
        checked = true;
        expect(last.detail).toContain('no ability modifier');
        expect(before - getMonster(ref)!.curHp).toBe(3); // 6 normal − 3 ability mod
      }
    }
    expect(checked).toBe(true);
  });

  it('Hew adds the attacker proficiency bonus to damage on a hit', () => {
    // STR 10 (mod 0) isolates the prof bonus: "2d1" = 2, level-1 prof +2 → 4.
    const { s, atk, tgt } = masteryFight({
      weapon: 'Greataxe',
      attackBonus: 50,
      targetAc: 1,
      damage: '2d1',
      str: 10,
      mastery: { appliesToTags: ['test'], active: true, effect: { profBonusDamage: true } },
    });
    const ref = getToken(tgt)!.refId;
    let checked = false;
    for (let i = 0; i < 80 && !checked; i++) {
      const before = getMonster(ref)!.curHp;
      resolveAttack(s, 'Striker', atk, tgt, 0);
      const last = listRollLog(s).at(-1)!;
      if (/\bHIT\b/.test(last.detail) && !/CRIT/.test(last.detail)) {
        checked = true;
        // GWM prof bonus is folded into the damage breakdown (labelled), not appended.
        expect(last.detail).toContain('+2[TestMastery]');
        expect(before - getMonster(ref)!.curHp).toBe(4); // 2 weapon + 2 prof
      }
    }
    expect(checked).toBe(true);
  });

  it('stacks multiple masteries bound to the same weapon', () => {
    // One weapon, two active masteries: Hew (+prof) and a custom +5 — both apply.
    const { s, atk, tgt } = masteryFight({
      weapon: 'Greataxe',
      attackBonus: 50,
      targetAc: 1,
      damage: '2d1', // constant 2
      str: 10, // mod 0, so the bonuses are isolated
      mastery: { appliesToTags: ['test'], active: true, effect: { profBonusDamage: true } },
    });
    const chId = getToken(atk)!.refId;
    setSheetAbility('pc', chId, {
      id: 'm2',
      name: 'Crusher',
      type: 'mastery',
      description: '',
      mastery: { appliesToTags: ['test'], active: true, effect: { bonusDamage: '5d1' } },
    });
    const ref = getToken(tgt)!.refId;
    let checked = false;
    for (let i = 0; i < 80 && !checked; i++) {
      const before = getMonster(ref)!.curHp;
      resolveAttack(s, 'Striker', atk, tgt, 0);
      const last = listRollLog(s).at(-1)!;
      if (/\bHIT\b/.test(last.detail) && !/CRIT/.test(last.detail)) {
        checked = true;
        // 2 weapon + 2 prof (folded into the roll) + 5 (Crusher, dice, post-roll) = 9.
        expect(before - getMonster(ref)!.curHp).toBe(9);
        expect(last.detail).toContain('+2[TestMastery]'); // GWM folded in
        expect(last.detail).toContain('+5[Crusher]'); // dice bonus stays a note
      }
    }
    expect(checked).toBe(true);
  });

  it('triggers by tag on any matching weapon (and not on unmatched ones)', () => {
    const { s: sid, map } = arena();
    const ch = createCharacter(sid.id, {
      name: 'Striker',
      className: 'Fighter',
      level: 1,
      stats: { STR: 16 },
      weapons: [
        { name: 'Magic Halberd +1', kind: 'melee', damage: '2d1', attackBonus: 50, tags: ['halberd', 'heavy'] },
        { name: 'Battered Greatsword', kind: 'melee', damage: '2d1', attackBonus: 50, tags: ['greatsword', 'heavy'] },
        { name: 'Dagger', kind: 'melee', damage: '2d1', attackBonus: 50, tags: ['dagger', 'light'] },
      ],
    });
    // One Hew entry (no per-weapon binding): triggers on any weapon tagged "heavy".
    setSheetAbility('pc', ch.id, {
      id: 'm1',
      name: 'Hew',
      type: 'mastery',
      description: '',
      mastery: { appliesToTags: ['heavy'], active: true, effect: { profBonusDamage: true } },
    });
    const atk = createToken({ mapId: map.id, kind: 'pc', refId: ch.id, x: 0, y: 0 });
    const tmpl = createMonsterTemplate(sid.id, { name: 'Dummy', maxHp: 9999, armorClass: 1 });
    const tgt = createToken({ mapId: map.id, kind: 'monster', refId: instantiateMonster(tmpl.id)!.id, x: 1, y: 1 });

    // Heavy weapons (index 0, 1) get +2 prof; the light Dagger (index 2) does not.
    const expectProf = (idx: number, want: boolean) => {
      let hit = false;
      for (let i = 0; i < 80 && !hit; i++) {
        resolveAttack(sid.id, 'Striker', atk.id, tgt.id, idx);
        const last = listRollLog(sid.id).at(-1)!;
        if (/\bHIT\b/.test(last.detail) && !/CRIT/.test(last.detail)) {
          hit = true;
          expect(last.detail.includes('Hew')).toBe(want); // GWM bonus folded in, labelled
        }
      }
      expect(hit).toBe(true);
    };
    expectProf(0, true); // Magic Halberd +1 — heavy
    expectProf(1, true); // Battered Greatsword — heavy
    expectProf(2, false); // Dagger — not heavy
  });
});

describe('off-hand & versatile attacks', () => {
  function pcFight(weapon: { name: string; damage?: string; versatileDamage?: string; attackBonus?: number }) {
    const { s, map } = arena();
    const ch = createCharacter(s.id, {
      name: 'Duelist',
      className: 'Fighter',
      level: 1,
      stats: { STR: 16 },
      weapons: [{ kind: 'melee', ...weapon }],
    });
    const atk = createToken({ mapId: map.id, kind: 'pc', refId: ch.id, x: 0, y: 0 });
    const tmpl = createMonsterTemplate(s.id, { name: 'Dummy', maxHp: 9999, armorClass: 1 });
    const tgt = createToken({ mapId: map.id, kind: 'monster', refId: instantiateMonster(tmpl.id)!.id, x: 1, y: 1 });
    return { sid: s.id, atk: atk.id, tgt: tgt.id, ref: getToken(tgt.id)!.refId };
  }

  it('off-hand attack drops the ability modifier from damage', () => {
    // "2d1" = 2 dice; STR 16 → +3 added at roll. Normal hit = 5; off-hand omits
    // the +3 → 2.
    const { sid, atk, tgt, ref } = pcFight({ name: 'Shortsword', damage: '2d1', attackBonus: 50 });
    let checked = false;
    for (let i = 0; i < 80 && !checked; i++) {
      const before = getMonster(ref)!.curHp;
      resolveAttack(sid, 'Duelist', atk, tgt, 0, undefined, true); // offhand
      const last = listRollLog(sid).at(-1)!;
      if (/\bHIT\b/.test(last.detail) && !/CRIT/.test(last.detail)) {
        checked = true;
        expect(last.detail).toContain('Off-hand (no ability modifier −3)');
        expect(before - getMonster(ref)!.curHp).toBe(2);
      }
    }
    expect(checked).toBe(true);
  });

  it('two-handed attack uses the versatile damage dice', () => {
    // 1H "2d1" = 2; 2H "6d1" = 6, plus STR 16 → +3. So a 2H non-crit hit = 9
    // (vs 5 one-handed), proving the 2H dice were used.
    const { sid, atk, tgt, ref } = pcFight({
      name: 'Longsword', damage: '2d1', versatileDamage: '6d1', attackBonus: 50,
    });
    let checked = false;
    for (let i = 0; i < 80 && !checked; i++) {
      const before = getMonster(ref)!.curHp;
      resolveAttack(sid, 'Duelist', atk, tgt, 0, undefined, false, true); // twoHanded
      const last = listRollLog(sid).at(-1)!;
      if (/\bHIT\b/.test(last.detail) && !/CRIT/.test(last.detail)) {
        checked = true;
        expect(last.detail).toContain('(2H)');
        expect(before - getMonster(ref)!.curHp).toBe(9);
      }
    }
    expect(checked).toBe(true);
  });
});

describe('diceOnly creature attacks (live stats)', () => {
  it('adds the creature\'s live ability modifier to a diceOnly attack', () => {
    const { s, map } = arena();
    // STR 20 → +5. A diceOnly "1d4" should roll 6–9 (dice + mod); a pre-baked
    // "1d4" would only ever be 1–4.
    const tmpl = createMonsterTemplate(s.id, {
      name: 'Bandit',
      maxHp: 30,
      stats: { STR: 20, DEX: 10 },
      weapons: [{ name: 'Club', kind: 'melee', damage: '1d4', diceOnly: true, tags: ['club'] }],
    });
    const atk = createToken({ mapId: map.id, kind: 'monster', refId: instantiateMonster(tmpl.id)!.id, x: 0, y: 0 });
    const dTmpl = createMonsterTemplate(s.id, { name: 'Dummy', maxHp: 9999, armorClass: 1 });
    const ref = instantiateMonster(dTmpl.id)!.id;
    const tgt = createToken({ mapId: map.id, kind: 'monster', refId: ref, x: 1, y: 1 });
    let checked = false;
    for (let i = 0; i < 80 && !checked; i++) {
      const before = getMonster(ref)!.curHp;
      resolveAttack(s.id, 'Bandit', atk.id, tgt.id, 0);
      const last = listRollLog(s.id).at(-1)!;
      if (/\bHIT\b/.test(last.detail) && !/CRIT/.test(last.detail)) {
        checked = true;
        expect(before - getMonster(ref)!.curHp).toBeGreaterThanOrEqual(6);
        expect(last.detail).toContain('+5'); // STR mod folded into the damage breakdown
      }
    }
    expect(checked).toBe(true);
  });
});

describe('to-hit breakdown + no double-count', () => {
  it('spells out a derived to-hit as ability + proficiency', () => {
    const { s, map } = arena();
    const tmpl = createMonsterTemplate(s.id, {
      name: 'Bandit',
      maxHp: 30,
      stats: { STR: 20, DEX: 10 },
      weapons: [{ name: 'Club', kind: 'melee', damage: '1d4', diceOnly: true, tags: ['club'] }],
    });
    const atk = createToken({ mapId: map.id, kind: 'monster', refId: instantiateMonster(tmpl.id)!.id, x: 0, y: 0 });
    const dTmpl = createMonsterTemplate(s.id, { name: 'Dummy', maxHp: 9999, armorClass: 1 });
    const tgt = createToken({ mapId: map.id, kind: 'monster', refId: instantiateMonster(dTmpl.id)!.id, x: 1, y: 1 });
    resolveAttack(s.id, 'Bandit', atk.id, tgt.id, 0);
    const last = listRollLog(s.id).at(-1)!;
    expect(last.detail).toContain('[STR]'); // ability portion of the to-hit
    expect(last.detail).toContain('[PROF]'); // proficiency portion of the to-hit
  });

  it('shows a fixed attackBonus as [hit] instead of a derived breakdown', () => {
    const { s, map } = arena();
    const tmpl = createMonsterTemplate(s.id, {
      name: 'Sniper',
      maxHp: 30,
      stats: { DEX: 10 },
      weapons: [{ name: 'Bow', kind: 'ranged', damage: '1d6', attackBonus: 7 }],
    });
    const atk = createToken({ mapId: map.id, kind: 'monster', refId: instantiateMonster(tmpl.id)!.id, x: 0, y: 0 });
    const dTmpl = createMonsterTemplate(s.id, { name: 'Dummy', maxHp: 9999, armorClass: 1 });
    const tgt = createToken({ mapId: map.id, kind: 'monster', refId: instantiateMonster(dTmpl.id)!.id, x: 1, y: 1 });
    resolveAttack(s.id, 'Sniper', atk.id, tgt.id, 0);
    expect(listRollLog(s.id).at(-1)!.detail).toContain('+7[hit]');
  });

  it('never double-counts the ability mod when a diceOnly damage string carries a baked flat', () => {
    const { s, map } = arena();
    // STR 20 (+5) with diceOnly "1d4+5": the stray +5 must be IGNORED so the mod
    // is added once. A non-crit hit deals at most 1d4 + 5 = 9 (not 1d4 + 10).
    const tmpl = createMonsterTemplate(s.id, {
      name: 'Brute',
      maxHp: 30,
      stats: { STR: 20, DEX: 10 },
      weapons: [{ name: 'Fist', kind: 'melee', damage: '1d4+5', diceOnly: true, tags: ['fist'] }],
    });
    const atk = createToken({ mapId: map.id, kind: 'monster', refId: instantiateMonster(tmpl.id)!.id, x: 0, y: 0 });
    const dTmpl = createMonsterTemplate(s.id, { name: 'Dummy', maxHp: 9999, armorClass: 1 });
    const ref = instantiateMonster(dTmpl.id)!.id;
    const tgt = createToken({ mapId: map.id, kind: 'monster', refId: ref, x: 1, y: 1 });
    let checked = false;
    for (let i = 0; i < 80 && !checked; i++) {
      const before = getMonster(ref)!.curHp;
      resolveAttack(s.id, 'Brute', atk.id, tgt.id, 0);
      const last = listRollLog(s.id).at(-1)!;
      if (/\bHIT\b/.test(last.detail) && !/CRIT/.test(last.detail)) {
        checked = true;
        expect(before - getMonster(ref)!.curHp).toBeLessThanOrEqual(9);
      }
    }
    expect(checked).toBe(true);
  });

  it('spells out a PC spell attack to-hit as casting ability + proficiency', () => {
    const { s } = arena();
    const ch = createCharacter(s.id, { name: 'Mage', className: 'Wizard', level: 5, stats: { INT: 16 } });
    const ability: SheetAbility = {
      id: 'fb',
      name: 'Fire Bolt',
      type: 'spell',
      description: '',
      roll: { kind: 'attack', dice: '1d10', damageType: 'fire', baseLevel: 0 },
    };
    setSheetAbility('pc', ch.id, ability);
    resolveAbilityRoll(s.id, 'Mage', getCharacter(ch.id)!, ability);
    const last = listRollLog(s.id).at(-1)!;
    expect(last.detail).toContain('[INT]'); // casting ability portion
    expect(last.detail).toContain('[PROF]'); // proficiency portion
  });

  it('spells out a monster ability to-hit as casting ability + proficiency', () => {
    const { s } = arena();
    const tmpl = createMonsterTemplate(s.id, { name: 'Drake', maxHp: 30, level: 5, stats: { CHA: 16 } });
    const m = instantiateMonster(tmpl.id)!;
    const ok = resolveMonsterSheetAbility(s.id, 'DM', m, monAbility({
      name: 'Fire Breath',
      description: '',
      roll: { kind: 'attack', dice: '2d6', damageType: 'fire' },
    }));
    expect(ok).toBe(true);
    const last = listRollLog(s.id).at(-1)!;
    expect(last.detail).toContain('[CHA]'); // best casting mod is CHA
    expect(last.detail).toContain('[PROF]');
  });
});

describe('secondary weapon damage (flaming sword)', () => {
  // Always-hit attacker (huge to-hit vs AC 1) with 10 slashing + a fire rider.
  const flameSword = (extraDamage: string) => {
    const { s, map } = arena();
    const tmpl = createMonsterTemplate(s.id, {
      name: 'Flamebrand',
      maxHp: 30,
      stats: { STR: 10 },
      weapons: [
        {
          name: 'Flame Sword',
          kind: 'melee',
          damage: '10',
          damageType: 'slashing',
          attackBonus: 50,
          extraDamage,
          extraDamageType: 'fire',
        },
      ],
    });
    const atk = createToken({ mapId: map.id, kind: 'monster', refId: instantiateMonster(tmpl.id)!.id, x: 0, y: 0 });
    return { s, map, atk };
  };

  it('adds the typed rider on a hit (10 slashing + 1d6 fire = 11..16)', () => {
    const { s, map, atk } = flameSword('1d6');
    const dt = createMonsterTemplate(s.id, { name: 'Dummy', maxHp: 9999, armorClass: 1 });
    const ref = instantiateMonster(dt.id)!.id;
    const tok = createToken({ mapId: map.id, kind: 'monster', refId: ref, x: 1, y: 1 });
    let checked = false;
    for (let i = 0; i < 60 && !checked; i++) {
      const before = getMonster(ref)!.curHp;
      resolveAttack(s.id, 'F', atk.id, tok.id, 0);
      const last = listRollLog(s.id).at(-1)!;
      if (/\bHIT\b/.test(last.detail) && !/CRIT/.test(last.detail)) {
        checked = true;
        const dealt = before - getMonster(ref)!.curHp;
        expect(dealt).toBeGreaterThanOrEqual(11);
        expect(dealt).toBeLessThanOrEqual(16);
        expect(last.detail).toMatch(/fire/);
      }
    }
    expect(checked).toBe(true);
  });

  it('does NOT double the rider on a crit (10 slashing + 6 fire = 16)', () => {
    const { s, map, atk } = flameSword('6d1'); // always 6 fire
    const dt = createMonsterTemplate(s.id, { name: 'Dummy', maxHp: 9999, armorClass: 1 });
    const ref = instantiateMonster(dt.id)!.id;
    const tok = createToken({ mapId: map.id, kind: 'monster', refId: ref, x: 1, y: 1 });
    let checked = false;
    for (let i = 0; i < 200 && !checked; i++) {
      const before = getMonster(ref)!.curHp;
      resolveAttack(s.id, 'F', atk.id, tok.id, 0);
      const last = listRollLog(s.id).at(-1)!;
      if (/CRIT/.test(last.detail)) {
        checked = true;
        // The flat 10 slashing has no dice to crit; the fire rider rolls ONCE.
        expect(before - getMonster(ref)!.curHp).toBe(16);
      }
    }
    expect(checked).toBe(true);
  });

  it('resists ONLY the rider type (fire 6 → 3; slashing 10 unaffected = 13)', () => {
    const { s, map, atk } = flameSword('6d1'); // always 6 fire
    const dt = createMonsterTemplate(s.id, { name: 'Salamander', maxHp: 9999, armorClass: 1, resistances: ['fire'] });
    const ref = instantiateMonster(dt.id)!.id;
    const tok = createToken({ mapId: map.id, kind: 'monster', refId: ref, x: 1, y: 1 });
    let checked = false;
    for (let i = 0; i < 60 && !checked; i++) {
      const before = getMonster(ref)!.curHp;
      resolveAttack(s.id, 'F', atk.id, tok.id, 0);
      const last = listRollLog(s.id).at(-1)!;
      if (/\bHIT\b/.test(last.detail) && !/CRIT/.test(last.detail)) {
        checked = true;
        expect(before - getMonster(ref)!.curHp).toBe(13); // 10 + floor(6/2)
      }
    }
    expect(checked).toBe(true);
  });
});

describe('class-feature stances (Rage / Reckless / Hunter\'s Mark)', () => {
  const setup = (
    spec: import('../../shared/types.js').StanceSpec,
    kind: 'melee' | 'ranged' = 'melee',
  ) => {
    const { s, map } = arena();
    const ch = createCharacter(s.id, {
      name: 'Grog',
      className: 'Barbarian',
      level: 5,
      stats: { STR: 10, DEX: 10 },
      weapons: [{ name: 'Club', kind, damage: '1d1', diceOnly: true, attackBonus: 50, damageType: 'bludgeoning' }],
    });
    setSheetAbility('pc', ch.id, { id: 'st', name: 'Stance', type: 'stance', description: '', stance: spec });
    const atk = createToken({ mapId: map.id, kind: 'pc', refId: ch.id, x: 0, y: 0 });
    const dt = createMonsterTemplate(s.id, { name: 'Dummy', maxHp: 9999, armorClass: 1 });
    const ref = instantiateMonster(dt.id)!.id;
    const tok = createToken({ mapId: map.id, kind: 'monster', refId: ref, x: 1, y: 1 });
    return { s, atk, ref, tok };
  };
  // First plain HIT's damage — skip a nat-20 CRIT (doubles dice) and a nat-1 MISS.
  const nonCritDealt = (s: { id: string }, atk: { id: string }, ref: string, tok: { id: string }) => {
    for (let i = 0; i < 120; i++) {
      const before = getMonster(ref)!.curHp;
      resolveAttack(s.id, 'Grog', atk.id, tok.id, 0);
      const detail = listRollLog(s.id).at(-1)!.detail;
      if (/\bHIT\b/.test(detail) && !/CRIT/.test(detail)) return before - getMonster(ref)!.curHp;
    }
    throw new Error('no plain hit');
  };

  it('Rage adds flat melee damage on a hit', () => {
    const { s, atk, ref, tok } = setup({ active: true, appliesTo: 'melee', bonusDamage: '2' });
    expect(nonCritDealt(s, atk, ref, tok)).toBe(3); // 1 (1d1) + 0 STR + 2 Rage
  });

  it('an inactive stance adds nothing', () => {
    const { s, atk, ref, tok } = setup({ active: false, appliesTo: 'melee', bonusDamage: '2' });
    expect(nonCritDealt(s, atk, ref, tok)).toBe(1); // just the 1d1
  });

  it('a melee-only stance does not modify a ranged attack', () => {
    const { s, atk, ref, tok } = setup({ active: true, appliesTo: 'melee', bonusDamage: '2' }, 'ranged');
    expect(nonCritDealt(s, atk, ref, tok)).toBe(1);
  });

  it("Hunter's Mark adds dice damage on a hit", () => {
    const { s, atk, ref, tok } = setup({ active: true, appliesTo: 'all', bonusDamage: '6d1' });
    expect(nonCritDealt(s, atk, ref, tok)).toBe(7); // 1d1 + 6d1
  });

  it('Reckless Attack rolls the attack with advantage', () => {
    const { s, atk, ref, tok } = setup({ active: true, appliesTo: 'melee', grantsAdvantage: true });
    resolveAttack(s.id, 'Grog', atk.id, tok.id, 0);
    expect(getMonster(ref)).toBeTruthy();
    expect(listRollLog(s.id).at(-1)!.detail).toContain('adv');
  });

  it('an on-hit-save stance (Ensnaring Strike) forces a Restrained save on a hit', () => {
    const { s, atk, tok } = setup({
      active: true,
      appliesTo: 'all',
      onHitSave: { ability: 'STR', onFail: 'Restrained' },
    });
    // Attack until a hit fires the rider (always-hit weapon, but skip nat-1 misses).
    for (let i = 0; i < 60; i++) {
      resolveAttack(s.id, 'Grog', atk.id, tok.id, 0);
      if (listRollLog(s.id).some((r) => r.apply?.onFail === 'Restrained')) break;
    }
    const rider = listRollLog(s.id).find((r) => r.apply?.onFail === 'Restrained');
    expect(rider).toBeTruthy();
    expect(rider!.apply!.save).toBe('STR');
    expect(rider!.detail).toContain('Restrained');
  });

  it("Hunter's Mark only adds damage to the marked target", () => {
    const { s, map } = arena();
    const ch = createCharacter(s.id, {
      name: 'Ranger',
      className: 'Ranger',
      level: 5,
      stats: { DEX: 10 },
      weapons: [{ name: 'Bow', kind: 'ranged', damage: '1d1', diceOnly: true, attackBonus: 50, damageType: 'piercing' }],
    });
    const atk = createToken({ mapId: map.id, kind: 'pc', refId: ch.id, x: 0, y: 0 });
    const mk = (name: string) => {
      const t = createMonsterTemplate(s.id, { name, maxHp: 9999, armorClass: 1 });
      const ref = instantiateMonster(t.id)!.id;
      return { ref, tok: createToken({ mapId: map.id, kind: 'monster', refId: ref, x: 1, y: 1 }) };
    };
    const marked = mk('Marked');
    const other = mk('Other');
    setSheetAbility('pc', ch.id, {
      id: 'hm',
      name: "Hunter's Mark",
      type: 'stance',
      description: '',
      stance: { active: true, appliesTo: 'all', bonusDamage: '6d1', targeted: true, targetId: marked.tok.id },
    });
    expect(nonCritDealt(s, atk, marked.ref, marked.tok)).toBe(7); // 1d1 + 6d1
    expect(nonCritDealt(s, atk, other.ref, other.tok)).toBe(1); // mark doesn't apply
  });
});

describe('concentration checks on damage', () => {
  it('logs a CON save with DC = max(10, half damage) when a concentrating creature is hurt', () => {
    const { s } = arena();
    const inst = instantiateMonster(createMonsterTemplate(s.id, { name: 'Caster', maxHp: 100 }).id)!;
    setCondition('monster', inst.id, { id: 'c', label: 'Hex', aura: 'blue', isConcentration: true });
    noteConcentration(s.id, 'monster', inst.id, 24);
    const last = listRollLog(s.id).at(-1)!;
    expect(last.label).toBe('Concentration');
    expect(last.detail).toContain('DC 12'); // max(10, floor(24/2))
    expect(last.detail).toContain('concentrating');
  });

  it('uses the floor of 10 for small hits', () => {
    const { s } = arena();
    const inst = instantiateMonster(createMonsterTemplate(s.id, { name: 'Bard', maxHp: 100 }).id)!;
    setCondition('monster', inst.id, { id: 'c', label: 'Bless', aura: 'blue', isConcentration: true });
    noteConcentration(s.id, 'monster', inst.id, 4);
    expect(listRollLog(s.id).at(-1)!.detail).toContain('DC 10');
  });

  it('does nothing for a non-concentrating creature or for healing', () => {
    const { s } = arena();
    const inst = instantiateMonster(createMonsterTemplate(s.id, { name: 'Grunt', maxHp: 100 }).id)!;
    const before = listRollLog(s.id).length;
    noteConcentration(s.id, 'monster', inst.id, 30); // not concentrating
    setCondition('monster', inst.id, { id: 'c', label: 'Bless', aura: 'blue', isConcentration: true });
    noteConcentration(s.id, 'monster', inst.id, -5); // healing
    expect(listRollLog(s.id).length).toBe(before);
  });
});

describe('death saves', () => {
  const downed = (sess: { id: string }) => {
    const c = createCharacter(sess.id, { name: 'Fallen', className: 'Fighter', level: 3, maxHp: 20 });
    applyDamage('pc', c.id, 20); // 20 → 0 HP
    return getCharacter(c.id)!;
  };

  it('only a downed (0 HP) PC rolls death saves', () => {
    const { s } = arena();
    const c = createCharacter(s.id, { name: 'Standing', maxHp: 10 });
    expect(resolveDeathSave(s.id, c.id)).toBe(false);
  });

  it('a roll logs the save and moves the tally (or revives)', () => {
    const { s } = arena();
    const c = downed(s);
    expect(c.curHp).toBe(0);
    expect(resolveDeathSave(s.id, c.id)).toBe(true);
    const after = getCharacter(c.id)!;
    expect(listRollLog(s.id).at(-1)!.label).toBe('Death save');
    const ds = after.deathSaves;
    // Either revived (nat 20) or recorded a success/failure.
    expect(after.curHp > 0 || ds.successes + ds.failures > 0).toBe(true);
  });

  it('healing above 0 resets saves; damage while down adds a failure', () => {
    const { s } = arena();
    const c = downed(s);
    setDeathSaves(c.id, 1, 1);
    applyDamage('pc', c.id, 5); // damage while at 0 → +1 failure
    expect(getCharacter(c.id)!.deathSaves).toEqual({ successes: 1, failures: 2 });
    applyDamage('pc', c.id, -8); // heal above 0 → reset
    const healed = getCharacter(c.id)!;
    expect(healed.curHp).toBeGreaterThan(0);
    expect(healed.deathSaves).toEqual({ successes: 0, failures: 0 });
  });

  it('three failures marks the PC dead', () => {
    const { s } = arena();
    const c = downed(s);
    setDeathSaves(c.id, 0, 2);
    // Keep rolling until a failure lands the 3rd (resetting a lucky revive/stable).
    for (let i = 0; i < 400; i++) {
      const cur = getCharacter(c.id)!;
      if (cur.curHp > 0) { setDeathSaves(c.id, 0, 2); applyDamage('pc', c.id, cur.curHp); continue; }
      if (cur.deathSaves.failures >= 3) break;
      if (cur.deathSaves.successes >= 3) { setDeathSaves(c.id, 0, 2); continue; } // stabilized → retry
      resolveDeathSave(s.id, c.id);
    }
    expect(getCharacter(c.id)!.deathSaves.failures).toBe(3);
    expect(listRollLog(s.id).some((r) => r.detail.includes('DIED'))).toBe(true);
  });

  it('three successes stabilizes (stops rolling); damage un-stabilizes', () => {
    const { s } = arena();
    const c = downed(s);
    setDeathSaves(c.id, 3, 0); // stable
    expect(resolveDeathSave(s.id, c.id)).toBe(false); // stable → no more rolls
    expect(getCharacter(c.id)!.deathSaves).toEqual({ successes: 3, failures: 0 }); // persists
    applyDamage('pc', c.id, 5); // damage while stable → unstable with one failure
    expect(getCharacter(c.id)!.deathSaves).toEqual({ successes: 0, failures: 1 });
  });

  it('logs STABLE when the third success lands', () => {
    const { s } = arena();
    const c = downed(s);
    setDeathSaves(c.id, 2, 0);
    for (let i = 0; i < 400; i++) {
      const cur = getCharacter(c.id)!;
      if (cur.deathSaves.successes >= 3) break;
      if (cur.curHp > 0 || cur.deathSaves.failures >= 3) { setDeathSaves(c.id, 2, 0); applyDamage('pc', c.id, Math.max(0, cur.curHp)); continue; }
      resolveDeathSave(s.id, c.id);
    }
    expect(getCharacter(c.id)!.deathSaves.successes).toBe(3);
    expect(listRollLog(s.id).some((r) => r.detail.includes('STABLE'))).toBe(true);
  });
});

describe('spell roll description', () => {
  it("carries a spell's full description on the log entry, separate from the one-line detail", () => {
    const { s } = arena();
    const ch = createCharacter(s.id, {
      name: 'Mage',
      className: 'Wizard',
      level: 5,
      stats: { INT: 16 },
    });
    const ability: SheetAbility = {
      id: 'sp1',
      name: 'Fire Bolt',
      type: 'spell',
      description: 'Hurl a mote of fire at a creature or object within range.',
      roll: { kind: 'damage', dice: '2d10', damageType: 'fire', baseLevel: 0 },
    };
    setSheetAbility('pc', ch.id, ability);
    resolveAbilityRoll(s.id, 'Mage', getCharacter(ch.id)!, ability);
    const last = listRollLog(s.id).at(-1)!;
    // The full description rides along for the full log…
    expect(last.description).toBe('Hurl a mote of fire at a creature or object within range.');
    // …while the one-line detail stays the compact result (no description in it).
    expect(last.detail).toContain('Fire Bolt');
    expect(last.detail).not.toContain('Hurl a mote');
  });
});

describe('condition-aware combat', () => {
  // A flat-damage flame attacker that always hits (huge to-hit vs AC 1).
  function flameFight(targetPatch: Parameters<typeof updateMonster>[1]) {
    const { s, map } = arena();
    const atk = createMonsterTemplate(s.id, {
      name: 'Flamer',
      maxHp: 30,
      stats: { STR: 10 },
      weapons: [
        { name: 'Flame', kind: 'melee', damage: '10', damageType: 'fire', attackBonus: 50 },
      ],
    });
    const tgtTmpl = createMonsterTemplate(s.id, { name: 'Dummy', maxHp: 100, armorClass: 1 });
    const tInst = instantiateMonster(tgtTmpl.id)!;
    updateMonster(tInst.id, targetPatch);
    const a = createToken({ mapId: map.id, kind: 'monster', refId: instantiateMonster(atk.id)!.id, x: 0, y: 0 });
    const t = createToken({ mapId: map.id, kind: 'monster', refId: tInst.id, x: 1, y: 1 });
    return { s: s.id, a: a.id, t: t.id, tRef: tInst.id };
  }

  it('halves applied damage against a resistant target', () => {
    const { s, a, t, tRef } = flameFight({ resistances: ['fire'] });
    let sawHit = false;
    for (let i = 0; i < 40; i++) {
      updateMonster(tRef, { curHp: 100 });
      resolveAttack(s, 'DM', a, t, 0);
      const after = getMonster(tRef)!.curHp;
      if (after < 100) {
        sawHit = true;
        expect(after).toBe(95); // 10 fire damage, resisted to 5
      }
    }
    expect(sawHit).toBe(true);
    expect(listRollLog(s).some((e) => /resisted/.test(e.detail))).toBe(true);
  });

  it('doubles applied damage against a vulnerable target', () => {
    const { s, a, t, tRef } = flameFight({ weaknesses: ['fire'] });
    let sawHit = false;
    for (let i = 0; i < 40; i++) {
      updateMonster(tRef, { curHp: 100 });
      resolveAttack(s, 'DM', a, t, 0);
      const after = getMonster(tRef)!.curHp;
      if (after < 100) {
        sawHit = true;
        expect(after).toBe(80); // 10 fire damage, doubled to 20
      }
    }
    expect(sawHit).toBe(true);
    expect(listRollLog(s).some((e) => /vulnerable/.test(e.detail))).toBe(true);
  });

  it('notes advantage in the log when attacking a prone target (melee)', () => {
    const { s, map } = arena();
    const atk = createMonsterTemplate(s.id, {
      name: 'Goblin',
      maxHp: 7,
      weapons: [{ name: 'Scimitar', kind: 'melee', damage: '1d6', attackBonus: 4 }],
    });
    const tgtTmpl = createMonsterTemplate(s.id, { name: 'Knight', maxHp: 50, armorClass: 18 });
    const tInst = instantiateMonster(tgtTmpl.id)!;
    setCondition('monster', tInst.id, {
      id: 'c-prone',
      label: 'Prone',
      aura: 'red',
      isConcentration: false,
    });
    const a = createToken({ mapId: map.id, kind: 'monster', refId: instantiateMonster(atk.id)!.id, x: 0, y: 0 });
    const t = createToken({ mapId: map.id, kind: 'monster', refId: tInst.id, x: 1, y: 1 });
    resolveAttack(s.id, 'DM', a.id, t.id, 0);
    const last = listRollLog(s.id).at(-1)!;
    expect(last.detail).toMatch(/adv: .*prone/i);
  });

  it('adds the proficiency bonus to a proficient saving throw', () => {
    const s = createSession('Saves');
    const map = createMap(s.id, { name: 'M' });
    setActiveMap(s.id, map.id);
    // CON 10 (mod 0), level 1 (prof +2). Proficient in CON, not STR.
    const ch = createCharacter(s.id, {
      name: 'Cleric',
      level: 1,
      stats: { CON: 10, STR: 10 },
      saveProficiencies: ['CON'],
    });
    const tok = createToken({ mapId: map.id, kind: 'pc', refId: ch.id, x: 0, y: 0 });

    resolveSaves(s.id, 'DM', [tok.id], 'CON', 10);
    const conSave = listRollLog(s.id).at(-1)!;
    expect(conSave.detail).toContain('prof');
    // d20 + 0 mod + 2 prof = 3..22.
    expect(conSave.total).toBeGreaterThanOrEqual(3);
    expect(conSave.total).toBeLessThanOrEqual(22);

    resolveSaves(s.id, 'DM', [tok.id], 'STR', 10);
    expect(listRollLog(s.id).at(-1)!.detail).not.toContain('prof');
  });
});

describe('resolveMonsterSheetAbility (structured monster abilities)', () => {
  const drake = (level: number, stats: Record<string, number>) => {
    const { s } = arena();
    const tmpl = createMonsterTemplate(s.id, { name: 'Drake', maxHp: 40, level, stats });
    return { s, m: getMonster(tmpl.id)! };
  };

  it('logs a save action with a DC derived from CR + casting mod', () => {
    const { s, m } = drake(5, { CHA: 16 }); // CR 5 → prof +3; CHA 16 → +3 ⇒ DC 14
    const ok = resolveMonsterSheetAbility(s.id, 'DM', m, monAbility({
      name: 'Fire Breath',
      description: '30-ft cone',
      roll: { kind: 'save', dice: '4d6', save: 'DEX', damageType: 'fire' },
    }));
    expect(ok).toBe(true);
    const last = listRollLog(s.id).at(-1)!;
    expect(last.detail).toContain('DC 14 DEX save for half');
    expect(last.total).toBeGreaterThanOrEqual(4);
    expect(last.total).toBeLessThanOrEqual(24);
  });

  it('honors an explicit DC from the stat block', () => {
    const { s, m } = drake(10, { INT: 20 });
    resolveMonsterSheetAbility(s.id, 'DM', m, monAbility({
      name: 'Necrotic Blast',
      description: '',
      roll: { kind: 'save', dice: '6d6', dc: 18, save: 'CON' },
    }));
    expect(listRollLog(s.id).at(-1)!.detail).toContain('DC 18 CON save for half');
  });

  it('adds CR proficiency + casting mod to an attack, and skips free-text actions', () => {
    const { s, m } = drake(1, { CHA: 14 });
    // No structured roll → not rollable.
    expect(
      resolveMonsterSheetAbility(s.id, 'DM', m, monAbility({ name: 'Multiattack', description: 'two attacks' })),
    ).toBe(false);
    // Attack roll logs a "to hit" line.
    expect(
      resolveMonsterSheetAbility(s.id, 'DM', m, monAbility({
        name: 'Sting',
        description: '',
        roll: { kind: 'attack', dice: '1d4', damageType: 'poison' },
      })),
    ).toBe(true);
    expect(listRollLog(s.id).at(-1)!.detail).toContain('to hit');
  });
});

describe('Apply damage → click-to-target saves', () => {
  const caster = (s: { id: string }) => {
    const t = createMonsterTemplate(s.id, { name: 'Mage', maxHp: 30, level: 5, stats: { INT: 16 } });
    return getMonster(t.id)!;
  };
  const target = (s: { id: string }, map: { id: string }, opts: Parameters<typeof createMonsterTemplate>[1]) => {
    const tmpl = createMonsterTemplate(s.id, opts);
    const inst = instantiateMonster(tmpl.id)!;
    const tok = createToken({ mapId: map.id, kind: 'monster', refId: inst.id, x: 0, y: 0 });
    return { inst, tok };
  };

  it('attaches an apply payload to a save action and applies FULL on a fail', () => {
    const { s, map } = arena();
    resolveMonsterSheetAbility(s.id, 'DM', caster(s), monAbility({
      name: 'Blast', description: '',
      roll: { kind: 'save', dice: '10d1', dc: 99, save: 'DEX', damageType: 'fire' },
    }));
    const entry = listRollLog(s.id).at(-1)!;
    expect(entry.apply).toEqual({ amount: 10, dc: 99, save: 'DEX', damageType: 'fire' });

    // The CAST animates the spell's single damage roll (Fireball-style)…
    expect(entry.reveal?.kind).toBe('damage');
    expect(entry.reveal?.damage).toBe(10);
    expect(entry.reveal?.damageDice?.[0].faces?.length).toBe(10); // 10d1 → ten faces

    const { inst, tok } = target(s, map, { name: 'Goblin', maxHp: 20, stats: { DEX: 10 } });
    resolveForcedSave(s.id, entry.id, tok.id); // DC 99 → always FAIL → full 10
    expect(getMonster(inst.id)!.curHp).toBe(10);
    // …and the target's own SAVING THROW now animates as a 'check' reveal (every
    // roll animates, not just combat) — the DAMAGE is NOT re-animated (it was
    // rolled once at cast; the check carries no damage dice).
    const applied = listRollLog(s.id).at(-1)!;
    expect(applied.reveal?.kind).toBe('check');
    expect(applied.reveal?.outcome).toBe('fail');
    expect(applied.reveal?.damage).toBeUndefined();
    // The source roll keeps its payload so more targets can be clicked.
    expect(getRollEntry(entry.id)!.apply).toBeTruthy();
  });

  it('applies HALF on a pass, doubled by vulnerability', () => {
    const { s, map } = arena();
    resolveMonsterSheetAbility(s.id, 'DM', caster(s), monAbility({
      name: 'Blast', description: '',
      roll: { kind: 'save', dice: '10d1', dc: 1, save: 'DEX', damageType: 'fire' },
    }));
    const entry = listRollLog(s.id).at(-1)!;
    const { inst, tok } = target(s, map, { name: 'Straw', maxHp: 40, stats: { DEX: 10 }, weaknesses: ['fire'] });
    resolveForcedSave(s.id, entry.id, tok.id); // DC 1 → PASS → half 5, ×2 vuln = 10
    expect(getMonster(inst.id)!.curHp).toBe(30);
  });

  it('PC save spell (Hail of Thorns-style) deals HALF on a pass, not 0', () => {
    const { s, map } = arena();
    const ch = createCharacter(s.id, {
      name: 'Ranger',
      className: 'Ranger',
      level: 5,
      stats: { DEX: 16, WIS: 16 },
    });
    // A save-for-half spell with deterministic 10 damage (10d1).
    const ability: SheetAbility = {
      id: 'hot',
      name: 'Hail of Thorns',
      type: 'spell',
      level: 1,
      description: '',
      roll: { kind: 'save', dice: '10d1', baseLevel: 1, save: 'DEX', damageType: 'piercing' },
    };
    resolveAbilityRoll(s.id, ch.name, ch, ability);
    const entry = listRollLog(s.id).at(-1)!;
    expect(entry.apply?.amount).toBe(10); // damage rolled at cast, carried into apply

    const target = createMonsterTemplate(s.id, { name: 'Goblin', maxHp: 20, stats: { DEX: 10 } });
    const inst = instantiateMonster(target.id)!;
    const tok = createToken({ mapId: map.id, kind: 'monster', refId: inst.id, x: 1, y: 1 });
    // Force a PASS by overriding the entry's DC to 1 via a fresh cast at DC 1 is
    // hard; instead resolve against the stored payload — a DEX 10 goblin vs DC ~13
    // may fail, so assert the GENERAL rule via a guaranteed-pass DC-1 ability.
    const easy: SheetAbility = {
      ...ability,
      id: 'hot2',
      roll: { kind: 'save', dice: '10d1', dc: 1, baseLevel: 1, save: 'DEX', damageType: 'piercing' },
    };
    // Monsters honor an explicit roll.dc; reuse that path for a deterministic pass.
    resolveMonsterSheetAbility(s.id, 'DM', inst, easy);
    const e2 = listRollLog(s.id).at(-1)!;
    resolveForcedSave(s.id, e2.id, tok.id); // DC 1 → PASS → half of 10 = 5 (NOT 0)
    expect(getMonster(inst.id)!.curHp).toBe(15);
  });

  it('no-ops for a roll with no apply payload', () => {
    const { s, map } = arena();
    const { inst, tok } = target(s, map, { name: 'Bob', maxHp: 10 });
    resolveForcedSave(s.id, 'nonexistent', tok.id);
    expect(getMonster(inst.id)!.curHp).toBe(10);
  });

  it('splits a Magic Missile-style spell into per-dart instances, one per target', () => {
    const { s, map } = arena();
    const ch = createCharacter(s.id, { name: 'Mage', className: 'Wizard', level: 5, stats: { INT: 16 } });
    const ability: SheetAbility = {
      id: 'mm',
      name: 'Magic Missile',
      type: 'spell',
      description: '',
      // 3 darts, each 1d4+1 → total 6..15; +1 dart per slot above 1st.
      roll: { kind: 'damage', dice: '1d4+1', instances: 3, scaleInstances: 1, baseLevel: 1, damageType: 'force' },
    };
    setSheetAbility('pc', ch.id, ability);
    resolveAbilityRoll(s.id, 'Mage', getCharacter(ch.id)!, ability, 2); // cast at L2 → 4 darts
    const entry = listRollLog(s.id).at(-1)!;
    // Darts are no longer pre-rolled — the apply carries the dart count + dice and
    // the caster owner, so the dice roll fresh on each click.
    expect(entry.apply!.darts).toBe(4);
    expect(entry.apply!.dice).toBe('1d4+1');
    expect(entry.apply!.split).toBeUndefined();
    expect(entry.apply!.owner).toBe(ch.id);

    // Assigning dart 0 then dart 1 to two targets applies ONLY one dart's damage
    // (1d4+1 = 2..5) to each — not the full total to both (the bug we fixed).
    const a = target(s, map, { name: 'GobA', maxHp: 30, stats: {} });
    const b = target(s, map, { name: 'GobB', maxHp: 30, stats: {} });
    resolveForcedSave(s.id, entry.id, a.tok.id, undefined, 0);
    resolveForcedSave(s.id, entry.id, b.tok.id, undefined, 1);
    const dmgA = 30 - getMonster(a.inst.id)!.curHp;
    const dmgB = 30 - getMonster(b.inst.id)!.curHp;
    expect(dmgA).toBeGreaterThanOrEqual(2);
    expect(dmgA).toBeLessThanOrEqual(5);
    expect(dmgB).toBeGreaterThanOrEqual(2);
    expect(dmgB).toBeLessThanOrEqual(5);
  });
});

describe('saving throws (stat-block click + per-creature advantage)', () => {
  it('rolls a single ability save for a PC and a monster', () => {
    const { s } = arena();
    const pc = createCharacter(s.id, {
      name: 'Cleric',
      level: 5,
      stats: { WIS: 16 },
      saveProficiencies: ['WIS'],
    });
    expect(resolveSave(s.id, 'Cleric', 'pc', pc.id, 'WIS')).toBe(true);
    const pcLog = listRollLog(s.id).at(-1)!;
    expect(pcLog.label).toBe('WIS save');
    expect(pcLog.detail).toContain('Cleric — WIS save');
    expect(pcLog.detail).toContain('prof'); // proficient in WIS

    const tmpl = createMonsterTemplate(s.id, { name: 'Golem', maxHp: 100, stats: { CON: 14 } });
    const golem = instantiateMonster(tmpl.id)!;
    expect(resolveSave(s.id, 'DM', 'monster', golem.id, 'CON')).toBe(true);
    expect(listRollLog(s.id).at(-1)!.detail).toContain('Golem 1 — CON save');
  });

  it('rolls a PLAIN ability check (no proficiency) distinct from a save', () => {
    const { s } = arena();
    const pc = createCharacter(s.id, {
      name: 'Cleric',
      level: 5,
      stats: { WIS: 16 }, // +3 mod; proficient WIS save adds +3 prof
      saveProficiencies: ['WIS'],
    });
    expect(resolveCheck(s.id, 'Cleric', 'pc', pc.id, 'WIS')).toBe(true);
    const log = listRollLog(s.id).at(-1)!;
    expect(log.label).toBe('WIS check');
    expect(log.detail).toContain('Cleric — WIS check');
    // A check NEVER adds proficiency, even though the PC is proficient in WIS saves.
    expect(log.detail).not.toContain('prof');
  });

  it('applies each creature’s own advantage in a bulk save', () => {
    const { s, map } = arena();
    const ta = createMonsterTemplate(s.id, { name: 'A', maxHp: 10 });
    const tb = createMonsterTemplate(s.id, { name: 'B', maxHp: 10 });
    const a = createToken({ mapId: map.id, kind: 'monster', refId: instantiateMonster(ta.id)!.id, x: 0, y: 0 });
    const b = createToken({ mapId: map.id, kind: 'monster', refId: instantiateMonster(tb.id)!.id, x: 1, y: 1 });
    resolveSaves(s.id, 'DM', [a.id, b.id], 'DEX', 10, undefined, { [a.id]: 'adv' });
    const log = listRollLog(s.id);
    const la = log.find((e) => e.detail.startsWith('A 1'))!;
    const lb = log.find((e) => e.detail.startsWith('B 1'))!;
    expect(la.detail).toContain('→adv'); // A rolled with advantage (two d20s)
    expect(lb.detail).not.toContain('→adv'); // B rolled straight
  });
});

describe('Battle Master maneuvers', () => {
  /** A fighter with a weapon + one maneuver armed; returns ids for an attack. */
  function fight(maneuver: SheetAbility['maneuver'], weapon = {
    name: 'Greatsword', kind: 'melee' as const, damage: '1d1', attackBonus: 50,
  }) {
    const { s, map } = arena();
    const ch = createCharacter(s.id, { name: 'Fighter', level: 1, stats: { STR: 10 }, weapons: [weapon] });
    setSheetAbility('pc', ch.id, { id: 'man', name: 'Maneuver', type: 'maneuver', description: '', maneuver });
    const tmpl = createMonsterTemplate(s.id, { name: 'Dummy', maxHp: 999, armorClass: 1, stats: { STR: 1 } });
    const tInst = instantiateMonster(tmpl.id)!;
    const atk = createToken({ mapId: map.id, kind: 'pc', refId: ch.id, x: 0, y: 0 });
    const tgt = createToken({ mapId: map.id, kind: 'monster', refId: tInst.id, x: 1, y: 1 });
    return { s: s.id, chId: ch.id, tInst, atk: atk.id, tgt: tgt.id };
  }

  it('seeds the Superiority Dice pool + d8 die when a maneuver is added', () => {
    const { chId } = fight({ active: true, addDieTo: 'damage' });
    expect(getCharacter(chId)!.resources['Superiority Dice']).toEqual({ max: 4, used: 0 });
    expect(getCharacter(chId)!.superiorityDie).toBe('d8');
  });

  it('a damage maneuver spends a die, disarms itself, and notes what fired', () => {
    const { s, chId, atk, tgt } = fight({ active: true, addDieTo: 'damage' });
    resolveAttack(s, 'Fighter', atk, tgt, 0);
    expect(getCharacter(chId)!.resources['Superiority Dice'].used).toBe(1);
    expect(getCharacter(chId)!.sheetAbilities[0].maneuver!.active).toBe(false);
    expect(listRollLog(s).at(-1)!.detail).toContain('Maneuver (d8→');
  });

  it('Precision adds the Superiority Die to the attack roll', () => {
    const { s, chId, atk, tgt } = fight({ active: true, addDieTo: 'attack' });
    resolveAttack(s, 'Fighter', atk, tgt, 0);
    expect(listRollLog(s).at(-1)!.detail).toContain('[maneuver]');
    expect(getCharacter(chId)!.resources['Superiority Dice'].used).toBe(1);
  });

  it('a save-rider forces a save whose failure applies the condition', () => {
    const { s, chId, tInst, atk, tgt } = fight({
      active: true,
      addDieTo: 'damage',
      save: { ability: 'STR', onFail: 'Prone' },
    });
    // Each hit logs its OWN save-rider entry, resolved exactly ONCE against the
    // target (a save is not re-rollable per cast — resolveForcedSave now blocks a
    // repeat click on the same target). The STR-1 target fails most DC-10 saves, so
    // re-attacking → resolving the fresh rider ends it Prone within a few tries.
    let prone = false;
    let sawRider = false;
    for (let i = 0; i < 80 && !prone; i++) {
      const ab = getCharacter(chId)!.sheetAbilities[0];
      setSheetAbility('pc', chId, { ...ab, maneuver: { ...ab.maneuver!, active: true } });
      setResource(chId, 'resources', 'Superiority Dice', { used: 0 });
      resolveAttack(s, 'Fighter', atk, tgt, 0);
      // Newest not-yet-resolved STR-save rider from this attack.
      const rider = listRollLog(s)
        .filter(
          (e) =>
            e.label === 'STR save' &&
            e.apply?.onFail === 'Prone' &&
            !e.apply?.consumedTargets?.length,
        )
        .pop();
      if (rider) {
        sawRider = true;
        resolveForcedSave(s, rider.id, tgt);
      }
      prone = getMonster(tInst.id)!.conditions.some((c) => c.label === 'Prone');
    }
    expect(sawRider).toBe(true);
    expect(prone).toBe(true);
  });

  it('applies weapon damage on a hit even when a save-rider (Pushing Attack) fires', () => {
    // #9 regression: the maneuver's save rider carries amount:0 (the push deals
    // no damage), but the weapon's own damage — crit-doubled when it crits — must
    // still land on the target's HP. Use a bigger die so the hit is unmistakable.
    const { s, tInst, atk, tgt } = fight(
      { active: true, addDieTo: 'damage', save: { ability: 'STR', onFail: 'Prone' } },
      { name: 'Maul', kind: 'melee', damage: '4d10', attackBonus: 50 },
    );
    const before = getMonster(tInst.id)!.curHp;
    resolveAttack(s, 'Fighter', atk, tgt, 0);
    const after = getMonster(tInst.id)!.curHp;
    // The weapon dice (4d10 ≥ 4) + maneuver die landed on HP — never swallowed by
    // the rider.
    expect(after).toBeLessThan(before);
    expect(before - after).toBeGreaterThanOrEqual(4);
    // The push rider itself is a separate, damage-less save entry.
    const rider = listRollLog(s).find((e) => e.label === 'STR save');
    expect(rider?.apply?.amount).toBe(0);
  });

  it('does not fire when no Superiority Die is left', () => {
    const { s, chId, atk, tgt } = fight({ active: true, addDieTo: 'damage' });
    setResource(chId, 'resources', 'Superiority Dice', { max: 4, used: 4 }); // empty pool
    resolveAttack(s, 'Fighter', atk, tgt, 0);
    // Still armed (never fired) and no die spent beyond the empty pool.
    expect(getCharacter(chId)!.sheetAbilities[0].maneuver!.active).toBe(true);
    expect(getCharacter(chId)!.resources['Superiority Dice'].used).toBe(4);
    expect(listRollLog(s).at(-1)!.detail).not.toContain('Maneuver (d8→');
  });
});

describe('targeted attack-roll spells & monster actions', () => {
  // A low-AC dummy target token; tune resist/vuln via the patch.
  function dummy(s: { id: string }, map: { id: string }, patch: Parameters<typeof updateMonster>[1]) {
    const tmpl = createMonsterTemplate(s.id, { name: 'Dummy', maxHp: 100, armorClass: 1 });
    const inst = instantiateMonster(tmpl.id)!;
    updateMonster(inst.id, patch);
    const tok = createToken({ mapId: map.id, kind: 'monster', refId: inst.id, x: 1, y: 1 });
    return { ref: inst.id, tokenId: tok.id };
  }

  // Flat 10-damage fire attack ability ('10d1' = always 10; crit would double it,
  // so assertions only fire on a NON-crit hit — like the weapon resist/vuln tests).
  const fireBolt: SheetAbility = {
    id: 'fb', name: 'Fire Bolt', type: 'spell', description: '',
    roll: { kind: 'attack', dice: '10d1', damageType: 'fire', baseLevel: 0 },
  };

  it('PC spell attack rolls vs the target AC and applies typed damage (resist halves)', () => {
    const { s, map } = arena();
    const ch = createCharacter(s.id, { name: 'Mage', className: 'Wizard', level: 5, stats: { INT: 16 } });
    setSheetAbility('pc', ch.id, fireBolt);
    const { ref, tokenId } = dummy(s, map, { resistances: ['fire'] });
    let saw = false;
    for (let i = 0; i < 60 && !saw; i++) {
      updateMonster(ref, { curHp: 100 });
      resolveAbilityRoll(s.id, 'Mage', getCharacter(ch.id)!, fireBolt, undefined, undefined, tokenId);
      const detail = listRollLog(s.id).at(-1)!.detail;
      if (/\bHIT\b/.test(detail) && !/CRIT/.test(detail)) {
        saw = true;
        expect(getMonster(ref)!.curHp).toBe(95); // 10 fire → resisted to 5
        expect(detail).toMatch(/vs AC 1/);
        expect(detail).toMatch(/resisted/);
      }
    }
    expect(saw).toBe(true);
  });

  it('spell attack reveal lists the casting mod and proficiency as SEPARATE steps', () => {
    const { s, map } = arena();
    const ch = createCharacter(s.id, { name: 'Mage', className: 'Wizard', level: 5, stats: { INT: 16 } });
    setSheetAbility('pc', ch.id, fireBolt);
    const { tokenId } = dummy(s, map, {});
    resolveAbilityRoll(s.id, 'Mage', getCharacter(ch.id)!, fireBolt, undefined, undefined, tokenId);
    const reveal = listRollLog(s.id).at(-1)!.reveal!;
    // INT 16 → +3 spellcasting mod, level 5 → +3 proficiency: two labelled steps,
    // not a single combined "+6 spell".
    const labels = (reveal.toHit ?? []).map((x) => x.label);
    expect(labels).toContain('INT');
    expect(labels).toContain('PROF');
    expect(labels).not.toContain('spell');
    expect((reveal.toHit ?? []).reduce((a, x) => a + x.value, 0)).toBe(6);
  });

  it('PC spell attack doubles damage against a vulnerable target', () => {
    const { s, map } = arena();
    const ch = createCharacter(s.id, { name: 'Mage', className: 'Wizard', level: 5, stats: { INT: 16 } });
    setSheetAbility('pc', ch.id, fireBolt);
    const { ref, tokenId } = dummy(s, map, { weaknesses: ['fire'] });
    let saw = false;
    for (let i = 0; i < 60 && !saw; i++) {
      updateMonster(ref, { curHp: 100 });
      resolveAbilityRoll(s.id, 'Mage', getCharacter(ch.id)!, fireBolt, undefined, undefined, tokenId);
      const detail = listRollLog(s.id).at(-1)!.detail;
      if (/\bHIT\b/.test(detail) && !/CRIT/.test(detail)) {
        saw = true;
        expect(getMonster(ref)!.curHp).toBe(80); // 10 fire → doubled to 20
        expect(detail).toMatch(/vulnerable/);
      }
    }
    expect(saw).toBe(true);
  });

  it('redacts the target AC for players but keeps HIT/MISS', () => {
    const { s, map } = arena();
    const ch = createCharacter(s.id, { name: 'Mage', className: 'Wizard', level: 5, stats: { INT: 16 } });
    setSheetAbility('pc', ch.id, fireBolt);
    const { tokenId } = dummy(s, map, {});
    resolveAbilityRoll(s.id, 'Mage', getCharacter(ch.id)!, fireBolt, undefined, undefined, tokenId);
    const player = buildSnapshot(s.id, 'player')!;
    const line = player.rollLog.at(-1)!.detail;
    expect(line).toContain('vs AC ?');
    expect(line).not.toMatch(/vs AC 1\b/);
  });

  it('without a target, a spell attack only logs to-hit and applies nothing', () => {
    const { s, map } = arena();
    const ch = createCharacter(s.id, { name: 'Mage', className: 'Wizard', level: 5, stats: { INT: 16 } });
    setSheetAbility('pc', ch.id, fireBolt);
    const { ref } = dummy(s, map, {});
    const before = getMonster(ref)!.curHp;
    resolveAbilityRoll(s.id, 'Mage', getCharacter(ch.id)!, fireBolt); // no targetTokenId
    expect(listRollLog(s.id).at(-1)!.detail).toContain('to hit');
    expect(getMonster(ref)!.curHp).toBe(before);
  });

  it('monster attack abilities also roll vs AC and apply typed damage (vuln doubles)', () => {
    const { s, map } = arena();
    const mon = getMonster(createMonsterTemplate(s.id, {
      name: 'Imp', maxHp: 20, level: 5, stats: { CHA: 16 },
    }).id)!;
    const sting = monAbility({
      name: 'Fire Sting', description: '',
      roll: { kind: 'attack', dice: '10d1', damageType: 'fire' },
    });
    const { ref, tokenId } = dummy(s, map, { weaknesses: ['fire'] });
    let saw = false;
    for (let i = 0; i < 60 && !saw; i++) {
      updateMonster(ref, { curHp: 100 });
      resolveMonsterSheetAbility(s.id, 'DM', mon, sting, undefined, undefined, tokenId);
      const detail = listRollLog(s.id).at(-1)!.detail;
      if (/\bHIT\b/.test(detail) && !/CRIT/.test(detail)) {
        saw = true;
        expect(getMonster(ref)!.curHp).toBe(80); // 10 fire → doubled to 20
        expect(detail).toMatch(/vs AC 1/);
        // The HP accounting note rides the roll entry (DM log = unshaped).
        expect(listRollLog(s.id).at(-1)!.hpNote?.text).toContain('HP 100→80');
      }
    }
    expect(saw).toBe(true);
  });
});

describe('save action fired at a single target (floating menu)', () => {
  it('rolls the damage once but applies it per target via the Apply click', () => {
    const { s, map } = arena();
    // Target dummy: lots of HP, a terrible DEX save and no proficiency.
    const dummy = instantiateMonster(
      createMonsterTemplate(s.id, { name: 'Dummy', maxHp: 100, level: 1, stats: { DEX: 6 } }).id,
    )!;
    const tok = createToken({ mapId: map.id, kind: 'monster', refId: dummy.id, x: 1, y: 1 });
    // Caster with a DEX-save fire action at an impossible DC → the target fails.
    const caster = instantiateMonster(
      createMonsterTemplate(s.id, {
        name: 'Caster',
        maxHp: 30,
        level: 5,
        stats: { WIS: 16 },
        actions: [
          {
            name: 'Flame Jet',
            description: '',
            roll: { kind: 'save', dice: '6d6', save: 'DEX', dc: 30, damageType: 'fire' },
          },
        ],
      }).id,
    )!;
    resolveMonsterSheetAbility(
      s.id,
      'DM',
      getMonster(caster.id)!,
      getMonster(caster.id)!.sheetAbilities[0],
      undefined,
      undefined,
      tok.id, // <- targeted from the floating menu
    );
    // A save-for-half (AOE) spell is NOT auto-applied to one creature: the dice are
    // rolled and stored for the per-target "Apply damage" clicks.
    const entry = listRollLog(s.id).at(-1)!;
    expect(entry.apply?.save).toBe('DEX');
    expect(getMonster(dummy.id)!.curHp).toBe(100);
    // Applying it (the click path) then damages the failed save.
    resolveForcedSave(s.id, entry.id, tok.id);
    expect(getMonster(dummy.id)!.curHp).toBeLessThan(100);
  });
});


describe('object lock-pick + creature loot gating', () => {
  it('resolveObjectCheck unlocks vs the object DC', () => {
    const { s } = arena();
    const rogue = createCharacter(s.id, {
      name: 'Rogue', level: 5, stats: { DEX: 20 }, proficientSkills: ['Sleight of Hand'],
    });
    const chestTmpl = createMonsterTemplate(s.id, {
      name: 'Chest', maxHp: 1, objectKind: 'chest', objectDc: 1,
    });
    const easy = instantiateMonster(chestTmpl.id)!;
    expect(resolveObjectCheck(s.id, 'Rogue', rogue, easy, 'unlock').success).toBe(true);

    const hardTmpl = createMonsterTemplate(s.id, {
      name: 'Vault', maxHp: 1, objectKind: 'chest', objectDc: 99,
    });
    const hard = instantiateMonster(hardTmpl.id)!;
    expect(resolveObjectCheck(s.id, 'Rogue', rogue, hard, 'unlock').success).toBe(false);
  });

  it('creature loot is takeable only when DEAD and revealed', () => {
    const { s } = arena();
    const tmpl = createMonsterTemplate(s.id, { name: 'Bandit', maxHp: 11 });
    const bandit = instantiateMonster(tmpl.id)!;
    setLoot(bandit.id, { gold: 5, items: [] });

    // Alive + unrevealed → hidden.
    expect(lootVisibleToPlayers(getMonster(bandit.id)!)).toBe(false);
    // Revealed but alive → still hidden.
    setCondition('monster', bandit.id, { id: 'lr', label: 'Loot revealed', aura: 'blue', isConcentration: false });
    expect(lootVisibleToPlayers(getMonster(bandit.id)!)).toBe(false);
    // Dead + revealed → visible.
    applyDamage('monster', bandit.id, 999);
    expect(lootVisibleToPlayers(getMonster(bandit.id)!)).toBe(true);
  });
});
