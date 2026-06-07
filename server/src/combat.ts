import {
  addRollLog,
  applyDamage,
  getCharacter,
  getMonster,
  getRollEntry,
  getToken,
  setLastAttackRole,
  setResource,
  setSheetAbility,
  setTokensCondition,
} from './sessions.js';
import {
  damageMultiplier,
  profBonusFor,
  rollD20Detail,
  rollSavingThrow,
  rollWeaponAttack,
  weaponAbilityMod,
  type Advantage,
  type Combatant,
} from '../../shared/combatMath.js';
import { attackAdvantage, saveAdvantage } from '../../shared/conditionEffects.js';
import { rollDice } from '../../shared/dice.js';
import {
  effectiveDice,
  spellAttackBonusDetail,
  spellcastingMod,
  spellSaveDC,
} from '../../shared/spellMath.js';
import { SKILLS, skillBonus, signed, proficiencyBonus } from '../../shared/skills.js';
import type {
  AbilityRoll,
  Character,
  CreatureAbility,
  ManeuverSpec,
  Monster,
  RollEntry,
  SheetAbility,
  Token,
  Weapon,
} from '../../shared/types.js';

type Resolved = {
  c: Combatant;
  name: string;
  weapons: Weapon[];
  ac: number;
  kind: Token['kind'];
  refId: string;
  /** Active condition labels (for advantage/disadvantage rules). */
  conditionLabels: string[];
  resistances: string[];
  weaknesses: string[];
  /** Ability codes proficient in for saving throws. */
  saveProficiencies: string[];
};

function resolve(token: Token): Resolved | null {
  if (token.kind === 'pc') {
    const ch = getCharacter(token.refId);
    if (!ch) return null;
    return {
      c: { stats: ch.stats, level: ch.level, isMonster: false },
      name: ch.name,
      weapons: ch.weapons,
      ac: ch.armorClass,
      kind: 'pc',
      refId: ch.id,
      conditionLabels: ch.conditions.map((c) => c.label),
      resistances: ch.resistances,
      weaknesses: ch.weaknesses,
      saveProficiencies: ch.saveProficiencies,
    };
  }
  const m = getMonster(token.refId);
  if (!m) return null;
  return {
    c: { stats: m.stats, level: m.level, isMonster: true },
    name: m.name,
    weapons: m.weapons,
    ac: m.armorClass,
    kind: 'monster',
    refId: m.id,
    conditionLabels: m.conditions.map((c) => c.label),
    resistances: m.resistances,
    weaknesses: m.weaknesses,
    saveProficiencies: m.saveProficiencies,
  };
}

/**
 * Resolve a weapon attack authoritatively: roll to-hit vs the target's AC, roll
 * damage on a hit (auto-applied — the DM can heal back if needed), and log it.
 */
export function resolveAttack(
  sessionId: string,
  roller: string,
  attackerTokenId: string,
  targetTokenId: string,
  weaponIndex: number,
  advantage?: Advantage,
  offhand?: boolean,
  twoHanded?: boolean,
): boolean {
  const at = getToken(attackerTokenId);
  const tt = getToken(targetTokenId);
  if (!at || !tt) return false;
  const a = resolve(at);
  const t = resolve(tt);
  if (!a || !t) return false;
  const weapon = a.weapons[weaponIndex];
  if (!weapon) return false;

  // Only PCs carry masteries (and add their ability mod to damage).
  const ch = at.kind === 'pc' ? getCharacter(at.refId) : null;
  const wtags = (weapon.tags ?? []).map((t) => t.trim().toLowerCase());
  const triggers = (m: NonNullable<SheetAbility['mastery']>) =>
    (m.appliesToTags ?? []).some((t) => wtags.includes(t.trim().toLowerCase()));

  // Pre-scan (before rolling): an active Cleave omits the ability modifier (like
  // an off-hand attack), and FLAT on-hit mastery damage (Great Weapon Master's
  // proficiency bonus, flat homebrew bonuses) is folded INTO the damage roll so
  // it appears in the initial damage number, not as a trailing note.
  let cleaveToDisable: { characterId: string; ability: SheetAbility } | null = null;
  let flatBonus = 0;
  const flatLabels: string[] = [];
  for (const ab of ch?.sheetAbilities ?? []) {
    const m = ab.mastery;
    if (ab.type !== 'mastery' || !m?.active || !m.effect || !triggers(m)) continue;
    if (m.effect.cleave && !cleaveToDisable) cleaveToDisable = { characterId: ch!.id, ability: ab };
    if (m.effect.profBonusDamage) {
      flatBonus += profBonusFor(a.c);
      flatLabels.push(m.weaponLabel || ab.name);
    } else if (m.effect.bonusDamage && /^[+-]?\d+$/.test(m.effect.bonusDamage.trim())) {
      flatBonus += parseInt(m.effect.bonusDamage.trim(), 10);
      flatLabels.push(m.weaponLabel || ab.name);
    }
  }
  const noAbilityMod = !!offhand || !!cleaveToDisable;

  // Battle Master: fire at most one active maneuver whose weapon tag matches (or
  // that has no tag) when a Superiority Die is left. Roll the die up front so a
  // Precision-style maneuver (addDieTo 'attack') can add it to the to-hit roll;
  // a 'damage' maneuver folds it into the damage like flat mastery damage.
  let maneuverFired:
    | { ability: SheetAbility; spec: ManeuverSpec; die: number }
    | null = null;
  let maneuverToHit = 0;
  if (ch) {
    const pool = ch.resources['Superiority Dice'];
    const hasDie = !!pool && pool.used < pool.max;
    const man = ch.sheetAbilities.find(
      (ab) =>
        ab.type === 'maneuver' &&
        ab.maneuver?.active &&
        ((ab.maneuver.appliesToTags ?? []).length === 0 ||
          (ab.maneuver.appliesToTags ?? []).some((tg) => wtags.includes(tg.trim().toLowerCase()))),
    );
    if (man?.maneuver && hasDie) {
      const die = rollDice(ch.superiorityDie || 'd8')?.total ?? 0;
      maneuverFired = { ability: man, spec: man.maneuver, die };
      if (man.maneuver.addDieTo === 'attack') maneuverToHit = die;
      else if (man.maneuver.addDieTo === 'damage') {
        flatBonus += die;
        flatLabels.push(man.name);
      }
    }
  }

  // Active class-feature stances (Rage, Reckless Attack, Hunter's Mark): a flat
  // damage bonus folds into the damage number (like flat mastery damage), dice
  // damage rolls on a hit below, and a stance can grant advantage on the attack.
  let stanceAdvantage = false;
  const stanceDice: { label: string; dice: string }[] = [];
  for (const ab of ch?.sheetAbilities ?? []) {
    const st = ab.stance;
    if (ab.type !== 'stance' || !st?.active) continue;
    if (st.appliesTo === 'melee' && weapon.kind !== 'melee') continue;
    if (st.appliesTo === 'ranged' && weapon.kind !== 'ranged') continue;
    if (st.grantsAdvantage) stanceAdvantage = true;
    if (st.bonusDamage) {
      if (/d\d/i.test(st.bonusDamage)) {
        stanceDice.push({ label: ab.name, dice: st.bonusDamage });
      } else {
        const flat = parseInt(st.bonusDamage.trim(), 10);
        if (Number.isFinite(flat) && flat !== 0) {
          flatBonus += flat;
          flatLabels.push(ab.name);
        }
      }
    }
  }

  // Fold the attacker's & target's conditions into the requested adv/dis (5e:
  // any advantage + any disadvantage cancel to a straight roll). A maneuver or an
  // active stance that grants advantage contributes one too.
  const adv = attackAdvantage(
    a.conditionLabels,
    t.conditionLabels,
    weapon.kind,
    advantage ??
      (maneuverFired?.spec.grantsAdvantage || stanceAdvantage ? 'adv' : undefined),
  );

  const out = rollWeaponAttack(a.c, weapon, t.ac, adv.state, {
    twoHanded,
    noAbilityMod,
    bonusDamage: flatBonus || undefined,
    bonusLabel: flatLabels.length ? flatLabels.join('+') : undefined,
    attackRollBonus: maneuverToHit || undefined,
  });

  // Outcome-dependent mastery effects: DICE bonus damage on a hit, Graze on a miss.
  let extra = 0;
  const masteryNotes: string[] = [];
  for (const ab of ch?.sheetAbilities ?? []) {
    const m = ab.mastery;
    if (ab.type !== 'mastery' || !m?.active || !m.effect || !triggers(m)) continue;
    if (out.hit && m.effect.bonusDamage && /d\d/i.test(m.effect.bonusDamage)) {
      const r = rollDice(m.effect.bonusDamage);
      if (r && r.total > 0) {
        extra += r.total;
        masteryNotes.push(`+${r.total}[${ab.name}]`);
      }
    }
    if (!out.hit && m.effect.grazeOnMiss) {
      const g = Math.max(0, weaponAbilityMod(a.c, weapon));
      if (g > 0) {
        extra += g;
        masteryNotes.push(`+${g}[GRAZE]`);
      }
    }
  }
  // Active stances that add DICE damage (e.g. Hunter's Mark +1d6) roll on a hit.
  if (out.hit) {
    for (const sd of stanceDice) {
      const r = rollDice(sd.dice);
      if (r && r.total > 0) {
        extra += r.total;
        masteryNotes.push(`+${r.total}[${sd.label}]`);
      }
    }
  }

  // Note the ability modifier omitted by Cleave / an off-hand attack.
  if (out.hit && noAbilityMod) {
    const dropped = a.c.isMonster ? 0 : weaponAbilityMod(a.c, weapon);
    const who = cleaveToDisable ? cleaveToDisable.ability.name : 'Off-hand';
    masteryNotes.push(`${who} (no ability modifier${dropped > 0 ? ` −${dropped}` : ''})`);
  }

  // Battle Master maneuver note (the die itself is already folded into the
  // attack/damage above; here we surface what fired and any rider text).
  if (maneuverFired) {
    const { ability, spec, die } = maneuverFired;
    const bits = [`${ability.name} (${ch!.superiorityDie || 'd8'}→${die})`];
    if (spec.grantsAdvantage) bits.push('Advantage');
    if (spec.note) bits.push(spec.note);
    masteryNotes.push(bits.join(': '));
  }

  let applied = (out.hit ? out.damage : 0) + extra;
  // Apply the target's resistance/vulnerability to the weapon's damage type.
  const mult = damageMultiplier(weapon.damageType, t.resistances, t.weaknesses);
  if (mult !== 1 && applied > 0) {
    applied = Math.floor(applied * mult);
    masteryNotes.push(
      mult < 1 ? `½ resisted (${weapon.damageType})` : `×2 vulnerable (${weapon.damageType})`,
    );
  }
  // Secondary damage rider of a different type (e.g. a flaming sword's fire),
  // rolled on a hit (doubled on a crit) and resisted on its OWN type.
  if (out.hit && weapon.extraDamage) {
    let ex = rollDice(weapon.extraDamage)?.total ?? 0;
    if (out.crit) ex += rollDice(weapon.extraDamage)?.total ?? 0;
    const exMult = damageMultiplier(weapon.extraDamageType, t.resistances, t.weaknesses);
    ex = Math.floor(ex * exMult);
    if (ex > 0) {
      applied += ex;
      const exType = weapon.extraDamageType ? ` ${weapon.extraDamageType}` : '';
      const exNote = exMult < 1 ? ' (½ resisted)' : exMult > 1 ? ' (×2 vuln)' : '';
      masteryNotes.push(`+${ex}${exType}${exNote}`);
    }
  }
  if (out.hit) applied = Math.max(1, applied); // a hit always deals at least 1
  if (applied > 0) applyDamage(t.kind, t.refId, applied);
  addRollLog(sessionId, {
    roller,
    label: 'Attack',
    expr: weapon.name,
    total: out.attackTotal,
    detail:
      `${a.name} → ${t.name}: ${out.detail}` +
      (masteryNotes.length ? ` · ${masteryNotes.join(', ')}` : '') +
      (adv.reasons.length ? ` · ${adv.state ?? 'straight'}: ${adv.reasons.join(', ')}` : ''),
  });
  // The token badge follows the weapon last attacked with.
  setLastAttackRole(a.kind, a.refId, weapon.kind === 'ranged' ? 'ranged' : 'melee');

  // Resolve the fired maneuver: a save rider becomes its own click-to-target
  // entry (on a hit), then spend a die and toggle the maneuver off (one-shot).
  if (maneuverFired && ch) {
    const { ability, spec } = maneuverFired;
    if (spec.save && out.hit) {
      const save = spec.save.ability;
      const dc = 8 + profBonusFor(a.c) + weaponAbilityMod(a.c, weapon);
      const onFailTxt = spec.save.onFail
        ? ` or be ${spec.save.onFail}`
        : spec.note
          ? ` or ${spec.note}`
          : '';
      addRollLog(sessionId, {
        roller,
        label: `${save} save`,
        expr: `DC ${dc}`,
        total: dc,
        detail: `${ability.name}: ${t.name} must make a DC ${dc} ${save} save${onFailTxt}`,
        apply: {
          amount: 0,
          dc,
          save,
          damageType: weapon.damageType,
          onFail: spec.save.onFail,
        },
      });
    }
    const pool = ch.resources['Superiority Dice'];
    if (pool) setResource(ch.id, 'resources', 'Superiority Dice', { used: pool.used + 1 });
    setSheetAbility(ch.id, { ...ability, maneuver: { ...spec, active: false } });
  }

  // Cleave is a one-shot: disable it after the attack roll (hit or miss).
  if (cleaveToDisable) {
    const ab = cleaveToDisable.ability;
    setSheetAbility(cleaveToDisable.characterId, {
      ...ab,
      mastery: { ...ab.mastery!, active: false },
    });
  }
  return true;
}

/** Roll a saving throw for each token vs a DC and log pass/fail. Each token may
 *  carry its own manual advantage (its creature's armed adv/dis toggle) via
 *  `advantageByToken`, falling back to the shared `advantage`. */
export function resolveSaves(
  sessionId: string,
  roller: string,
  tokenIds: string[],
  ability: string,
  dc: number,
  advantage?: Advantage,
  advantageByToken?: Record<string, Advantage>,
): void {
  for (const id of tokenIds) {
    const tok = getToken(id);
    if (!tok) continue;
    const r = resolve(tok);
    if (!r) continue;
    const proficient = r.saveProficiencies.some(
      (s) => s.trim().toUpperCase() === ability.trim().toUpperCase(),
    );
    // The creature's own armed adv/dis (if any) plus conditions (e.g. restrained
    // → DEX-save disadvantage) fold into the request (any adv + any dis cancel).
    const adv = saveAdvantage(r.conditionLabels, ability, advantageByToken?.[id] ?? advantage);
    const out = rollSavingThrow(r.c, ability, dc, adv.state, proficient);
    addRollLog(sessionId, {
      roller,
      label: `${ability.toUpperCase()} save`,
      expr: `DC ${dc}`,
      total: out.total,
      detail:
        `${r.name}: ${out.d20Detail} (${out.mod >= 0 ? '+' : ''}${out.mod}${out.proficient ? ' prof' : ''}) = ${out.total} vs DC ${dc} — ${out.pass ? 'PASS' : 'FAIL'}` +
        (adv.reasons.length ? ` · ${adv.state ?? 'straight'}: ${adv.reasons.join(', ')}` : ''),
    });
  }
}

/**
 * Roll ONE creature's saving throw for an ability (no contested DC — just the
 * roll), used by click-to-roll on a stat block. d20 + ability modifier (+ the
 * proficiency bonus when proficient in that save), with the creature's armed
 * adv/dis toggle and conditions folded in. Works for a PC or a monster.
 */
export function resolveSave(
  sessionId: string,
  roller: string,
  kind: Token['kind'],
  refId: string,
  ability: string,
  advantage?: Advantage,
): boolean {
  const ent = kind === 'pc' ? getCharacter(refId) : getMonster(refId);
  if (!ent) return false;
  const ab = ability.trim().toUpperCase();
  const c: Combatant = { stats: ent.stats, level: ent.level, isMonster: kind !== 'pc' };
  const proficient = ent.saveProficiencies.some((s) => s.trim().toUpperCase() === ab);
  const adv = saveAdvantage(ent.conditions.map((x) => x.label), ab, advantage);
  const out = rollSavingThrow(c, ab, 0, adv.state, proficient); // dc 0 → pass unused
  addRollLog(sessionId, {
    roller,
    label: `${ab} save`,
    expr: proficient ? `${ab} (prof)` : ab,
    total: out.total,
    detail:
      `${ent.name} — ${ab} save: ${out.d20Detail} (${out.mod >= 0 ? '+' : ''}${out.mod}${out.proficient ? ' prof' : ''}) = ${out.total}` +
      (adv.reasons.length ? ` · ${adv.state ?? 'straight'}: ${adv.reasons.join(', ')}` : ''),
  });
  return true;
}

/**
 * Resolve a save/damage roll's "Apply damage" against ONE clicked target: roll the
 * target's save vs the stored DC (its own ability + proficiency + conditions), then
 * auto-apply full (fail) / half (pass) of the rolled amount, × resist/vuln. For a
 * save-less (auto-hit) payload, apply full with no save roll. Logs one entry. The
 * source roll keeps its `apply` so the DM can keep clicking more targets.
 */
export function resolveForcedSave(
  sessionId: string,
  rollId: string,
  tokenId: string,
  advantage?: Advantage,
  instanceIndex?: number,
): void {
  const apply = getRollEntry(rollId)?.apply;
  if (!apply) return;
  const tok = getToken(tokenId);
  if (!tok) return;
  const r = resolve(tok);
  if (!r) return;
  const mult = damageMultiplier(apply.damageType, r.resistances, r.weaknesses);
  const typeTxt = apply.damageType ? ` ${apply.damageType}` : '';

  let dmg: number;
  let detail: string;
  if (apply.split && typeof instanceIndex === 'number') {
    // A split spell (e.g. Magic Missile): apply ONE pre-rolled instance, chosen
    // by index, to this target — auto-hit, no save. The client consumes indices
    // in order and disarms when the darts run out.
    const base = apply.split[instanceIndex] ?? 0;
    dmg = Math.floor(base * mult);
    applyDamage(r.kind, r.refId, dmg);
    addRollLog(sessionId, {
      roller: 'DM',
      label: 'Damage',
      total: dmg,
      expr: `dart ${instanceIndex + 1}`,
      detail: `${r.name}: takes ${dmg}${typeTxt}${mult !== 1 ? (mult < 1 ? ' (½ resisted)' : ' (×2 vulnerable)') : ''}`,
    });
    return;
  }
  if (apply.save) {
    const ability = apply.save;
    const proficient = r.saveProficiencies.some(
      (s) => s.trim().toUpperCase() === ability.trim().toUpperCase(),
    );
    // The clicked creature's own armed adv/dis toggle folds in with its conditions.
    const adv = saveAdvantage(r.conditionLabels, ability, advantage);
    const out = rollSavingThrow(r.c, ability, apply.dc, adv.state, proficient);
    dmg = Math.floor((out.pass ? Math.floor(apply.amount / 2) : apply.amount) * mult);
    // A Battle Master rider applies its condition to a target that FAILS.
    const condTxt =
      apply.onFail && !out.pass
        ? ` · ${apply.onFail}`
        : '';
    if (apply.onFail && !out.pass)
      setTokensCondition([tokenId], {
        label: apply.onFail,
        aura: 'red',
        isConcentration: false,
      });
    detail =
      `${r.name}: ${out.d20Detail} (${out.mod >= 0 ? '+' : ''}${out.mod}${out.proficient ? ' prof' : ''}) = ${out.total} vs DC ${apply.dc} — ${out.pass ? 'PASS' : 'FAIL'}${apply.amount ? ` · takes ${dmg}${typeTxt}` : ''}${condTxt}` +
      (adv.reasons.length ? ` · ${adv.state ?? 'straight'}: ${adv.reasons.join(', ')}` : '');
  } else {
    dmg = Math.floor(apply.amount * mult);
    detail = `${r.name}: takes ${dmg}${typeTxt}`;
  }
  applyDamage(r.kind, r.refId, dmg);
  addRollLog(sessionId, {
    roller: 'DM',
    label: apply.save ? `${apply.save.toUpperCase()} save` : 'Damage',
    expr: `DC ${apply.dc}`,
    total: dmg,
    detail,
  });
}

/**
 * Resolve a TARGETED attack-roll ability/action against a token's AC and
 * auto-apply typed damage on a hit (× resist/vuln) — the spell / monster-action
 * analogue of `resolveAttack`. Logs HIT/MISS with `vs AC N` (so visibility.ts
 * redacts it for players). Returns false if the target token is invalid, so the
 * caller can fall back to the untargeted to-hit-only log.
 */
function resolveTargetedSpellAttack(opts: {
  sessionId: string;
  roller: string;
  title: string;
  description?: string;
  attackBonus: number;
  /** Labelled to-hit breakdown for the log, e.g. "+3[CHA] +2[PROF]". */
  attackBonusDetail?: string;
  dice?: string;
  damageType?: string;
  targetTokenId: string;
  advantage?: Advantage;
}): boolean {
  const tt = getToken(opts.targetTokenId);
  const t = tt && resolve(tt);
  if (!t) return false;
  const { face, detail: d20detail } = rollD20Detail(opts.advantage);
  const crit = face === 20;
  const fumble = face === 1;
  const attackTotal = face + opts.attackBonus;
  const hit = crit || (!fumble && attackTotal >= t.ac);
  const dmgType = opts.damageType ? ` ${opts.damageType}` : '';
  let applied = 0;
  const notes: string[] = [];
  if (hit && opts.dice) {
    let dmg = rollDice(opts.dice)!.total;
    if (crit) dmg += rollDice(opts.dice)!.total; // crit doubles the dice
    const mult = damageMultiplier(opts.damageType, t.resistances, t.weaknesses);
    applied = Math.max(1, Math.floor(dmg * mult));
    if (mult !== 1)
      notes.push(
        mult < 1
          ? `½ resisted (${opts.damageType})`
          : `×2 vulnerable (${opts.damageType})`,
      );
    applyDamage(t.kind, t.refId, applied);
  }
  const result = hit ? (crit ? 'HIT — CRIT' : 'HIT') : 'MISS';
  addRollLog(opts.sessionId, {
    roller: opts.roller,
    label: 'Attack',
    expr: opts.title,
    total: attackTotal,
    detail:
      `${opts.title} → ${t.name}: ${d20detail} ${opts.attackBonusDetail ?? signed(opts.attackBonus)} = ${attackTotal} vs AC ${t.ac} — ${result}` +
      (hit && opts.dice ? `, ${applied}${dmgType} dmg [${opts.dice}${crit ? ' ×2 crit' : ''}]` : '') +
      (notes.length ? ` · ${notes.join(', ')}` : ''),
    description: opts.description,
  });
  return true;
}

/**
 * Resolve a character-sheet spell/ability roll authoritatively and log it.
 * Spell attack bonus / save DC are derived from the caster; damage/heal dice are
 * upcast by the chosen slot level (cantrips scale by caster level). Returns false
 * for purely descriptive entries (no roll). An attack-roll spell with a
 * `targetTokenId` rolls vs that token's AC and auto-applies typed damage.
 */
export function resolveAbilityRoll(
  sessionId: string,
  roller: string,
  character: Character,
  ability: SheetAbility,
  castLevel?: number,
  advantage?: Advantage,
  targetTokenId?: string,
): boolean {
  const roll = ability.roll;
  if (!roll) return false;
  // Casting a spell/ability makes this creature read as a caster on its badge.
  setLastAttackRole('pc', character.id, 'caster');
  const { stats, level } = character;
  const dice = effectiveDice(roll, { castLevel, casterLevel: level });
  const dmgType = roll.damageType ? ` ${roll.damageType}` : '';
  const upcast =
    (roll.baseLevel ?? 0) >= 1 && castLevel && castLevel > (roll.baseLevel ?? 1)
      ? ` (L${castLevel})`
      : '';
  const title = `${ability.name}${upcast}`;

  if (roll.kind === 'attack') {
    const { bonus, detail: bonusDetail } = spellAttackBonusDetail(
      stats,
      proficiencyBonus(level || 1),
    );
    // Targeted: roll vs the token's AC and auto-apply typed damage like a weapon.
    if (
      targetTokenId &&
      resolveTargetedSpellAttack({
        sessionId,
        roller,
        title,
        description: ability.description || undefined,
        attackBonus: bonus,
        attackBonusDetail: bonusDetail,
        dice,
        damageType: roll.damageType,
        targetTokenId,
        advantage,
      })
    )
      return true;
    // Untargeted fallback: to-hit + damage are logged but not applied.
    const { face, detail: d20detail } = rollD20Detail(advantage);
    const attackTotal = face + bonus;
    const crit = face === 20;
    let dmgVal = 0;
    if (dice) {
      dmgVal = rollDice(dice)!.total;
      if (crit) dmgVal += rollDice(dice)!.total; // crit doubles the dice
    }
    addRollLog(sessionId, {
      roller,
      label: 'Attack',
      expr: title,
      total: attackTotal,
      detail:
        `${title}: ${d20detail} ${bonusDetail} = ${attackTotal} to hit` +
        (dice ? `, ${dmgVal}${dmgType} dmg [${dice}${crit ? ' ×2 crit' : ''}]` : '') +
        (crit ? ' — CRIT' : ''),
      description: ability.description || undefined,
    });
    return true;
  }

  if (roll.kind === 'heal') {
    const val = dice ? rollDice(dice)!.total : 0;
    addRollLog(sessionId, {
      roller,
      label: ability.name,
      expr: title,
      total: val,
      detail: `${title}: ${val} healing [${dice}] (+ spellcasting mod where applicable)`,
      description: ability.description || undefined,
    });
    return true;
  }

  const dc = spellSaveDC(level, stats);

  // A split spell (e.g. Magic Missile): roll each instance/dart separately so the
  // DM can assign them one target at a time. Upcasting adds darts, not dice.
  const instanceCount = splitInstanceCount(roll, castLevel);
  if (roll.kind === 'damage' && instanceCount > 0 && dice) {
    const split = Array.from({ length: instanceCount }, () => rollDice(dice)!.total);
    const val = split.reduce((a, b) => a + b, 0);
    addRollLog(sessionId, {
      roller,
      label: ability.name,
      expr: title,
      total: val,
      detail: `${title}: ${instanceCount} × [${dice}] = ${val}${dmgType} — assign one per target`,
      description: ability.description || undefined,
      apply: { amount: val, dc, damageType: roll.damageType, split },
    });
    return true;
  }

  // 'save' and 'damage' both roll the (scaled) dice; 'save' notes the target DC.
  const val = dice ? rollDice(dice)!.total : 0;
  const note =
    roll.kind === 'save' && roll.save
      ? ` — DC ${dc} ${roll.save} save for half`
      : roll.kind === 'damage'
        ? ' (auto-hit)'
        : '';
  addRollLog(sessionId, {
    roller,
    label: ability.name,
    expr: title,
    total: val,
    detail: `${title}: ${val}${dmgType} damage [${dice}]${note}`,
    description: ability.description || undefined,
    apply: applyPayload(roll, val, dc),
  });
  return true;
}

/** Instances/darts for a split spell at the chosen cast level (Magic Missile:
 *  3 + 1 per slot above 1st). 0 when the roll isn't a split spell. */
function splitInstanceCount(roll: AbilityRoll, castLevel?: number): number {
  if (!roll.instances) return 0;
  const base = roll.baseLevel ?? 1;
  const lvls = castLevel && castLevel > base ? castLevel - base : 0;
  return roll.instances + (roll.scaleInstances ?? 0) * lvls;
}

/** The "Apply damage" payload for a save/damage roll (none for attack/heal or
 *  a roll with no dice). Lets the DM click-to-target saves from the roll log. */
function applyPayload(
  roll: AbilityRoll,
  amount: number,
  dc: number,
): RollEntry['apply'] {
  if (!roll.dice) return undefined;
  if (roll.kind === 'save' && roll.save)
    return { amount, dc, save: roll.save, damageType: roll.damageType };
  if (roll.kind === 'damage') return { amount, dc, damageType: roll.damageType };
  return undefined;
}

/**
 * Resolve a monster's structured `action` roll authoritatively and log it,
 * mirroring `resolveAbilityRoll` but with the to-hit / save DC derived from the
 * MONSTER's CR + stats: proficiency by CR (`profBonusFor`) and the casting mod =
 * best of INT/WIS/CHA. An explicit `roll.dc` (from the stat block) wins over the
 * derived DC. No spell slots; damage isn't auto-applied (parity with PC spell
 * rolls — targets use the bulk-save + damage tooling). Returns false for a
 * free-text action with no roll.
 */
export function resolveMonsterAction(
  sessionId: string,
  roller: string,
  monster: Monster,
  action: CreatureAbility,
  advantage?: Advantage,
  targetTokenId?: string,
): boolean {
  const roll = action.roll;
  if (!roll) return false;
  // A spell/ability action makes this creature read as a caster on its badge.
  setLastAttackRole('monster', monster.id, 'caster');
  const c: Combatant = { stats: monster.stats, level: monster.level, isMonster: true };
  const prof = profBonusFor(c);
  const castMod = spellcastingMod(monster.stats);
  const dice = effectiveDice(roll, {});
  const dmgType = roll.damageType ? ` ${roll.damageType}` : '';
  const title = action.name;

  if (roll.kind === 'attack') {
    // To-hit = proficiency (by CR) + best casting mod, broken out for the log.
    const { bonus, detail: bonusDetail } = spellAttackBonusDetail(monster.stats, prof);
    // Targeted: roll vs the token's AC and auto-apply typed damage like a weapon.
    if (
      targetTokenId &&
      resolveTargetedSpellAttack({
        sessionId,
        roller,
        title,
        description: action.description || undefined,
        attackBonus: bonus,
        attackBonusDetail: bonusDetail,
        dice,
        damageType: roll.damageType,
        targetTokenId,
        advantage,
      })
    )
      return true;
    // Untargeted fallback (e.g. rolled from the stat block): logged, not applied.
    const { face, detail: d20detail } = rollD20Detail(advantage);
    const attackTotal = face + bonus;
    const crit = face === 20;
    let dmgVal = 0;
    if (dice) {
      dmgVal = rollDice(dice)!.total;
      if (crit) dmgVal += rollDice(dice)!.total; // crit doubles the dice
    }
    addRollLog(sessionId, {
      roller,
      label: 'Attack',
      expr: title,
      total: attackTotal,
      detail:
        `${title}: ${d20detail} ${bonusDetail} = ${attackTotal} to hit` +
        (dice ? `, ${dmgVal}${dmgType} dmg [${dice}${crit ? ' ×2 crit' : ''}]` : '') +
        (crit ? ' — CRIT' : ''),
      description: action.description || undefined,
    });
    return true;
  }

  if (roll.kind === 'heal') {
    const val = dice ? rollDice(dice)!.total : 0;
    addRollLog(sessionId, {
      roller,
      label: action.name,
      expr: title,
      total: val,
      detail: `${title}: ${val} healing [${dice}]`,
      description: action.description || undefined,
    });
    return true;
  }

  // 'save' and 'damage' both roll the dice; 'save' notes the (explicit or derived) DC.
  const val = dice ? rollDice(dice)!.total : 0;
  const dc = roll.dc ?? 8 + prof + castMod;
  const note =
    roll.kind === 'save' && roll.save
      ? ` — DC ${dc} ${roll.save} save for half`
      : roll.kind === 'damage'
        ? ' (auto-hit)'
        : '';
  addRollLog(sessionId, {
    roller,
    label: action.name,
    expr: title,
    total: val,
    detail: `${title}: ${val}${dmgType} damage [${dice}]${note}`,
    description: action.description || undefined,
    apply: applyPayload(roll, val, dc),
  });
  return true;
}

/**
 * Resolve a 5e skill check authoritatively and log it: d20 (with adv/dis) +
 * the character's ability modifier + proficiency bonus when proficient in that
 * skill. Returns false for an unknown skill name.
 */
export function resolveSkillRoll(
  sessionId: string,
  roller: string,
  character: Character,
  skillName: string,
  advantage?: Advantage,
): boolean {
  const skill = SKILLS.find(
    (s) => s.name.toLowerCase() === skillName.trim().toLowerCase(),
  );
  if (!skill) return false;
  const proficient = character.proficientSkills.includes(skill.name);
  const bonus = skillBonus(character.stats, skill.ability, character.level, proficient);
  const { face, detail: d20detail } = rollD20Detail(advantage);
  const total = face + bonus;
  addRollLog(sessionId, {
    roller,
    label: `${skill.name} check`,
    expr: `${skill.ability}${proficient ? ' (prof)' : ''}`,
    total,
    detail:
      `${character.name} — ${skill.name}: ${d20detail} ${signed(bonus)} = ${total}` +
      (proficient ? ' (proficient)' : ''),
  });
  return true;
}
