import {
  addRollLog,
  applyDamage,
  getCharacter,
  getMonster,
  getRollEntry,
  getToken,
  setLastAttackRole,
  setSheetAbility,
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
  spellAttackBonus,
  spellcastingMod,
  spellSaveDC,
} from '../../shared/spellMath.js';
import { SKILLS, skillBonus, signed } from '../../shared/skills.js';
import type {
  AbilityRoll,
  Character,
  CreatureAbility,
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

  // Fold the attacker's & target's conditions into the requested adv/dis (5e:
  // any advantage + any disadvantage cancel to a straight roll).
  const adv = attackAdvantage(a.conditionLabels, t.conditionLabels, weapon.kind, advantage);

  const out = rollWeaponAttack(a.c, weapon, t.ac, adv.state, {
    twoHanded,
    noAbilityMod,
    bonusDamage: flatBonus || undefined,
    bonusLabel: flatLabels.length ? flatLabels.join('+') : undefined,
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

  // Note the ability modifier omitted by Cleave / an off-hand attack.
  if (out.hit && noAbilityMod) {
    const dropped = a.c.isMonster ? 0 : weaponAbilityMod(a.c, weapon);
    const who = cleaveToDisable ? cleaveToDisable.ability.name : 'Off-hand';
    masteryNotes.push(`${who} (no ability modifier${dropped > 0 ? ` −${dropped}` : ''})`);
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

/** Roll a saving throw for each token vs a DC and log pass/fail. */
export function resolveSaves(
  sessionId: string,
  roller: string,
  tokenIds: string[],
  ability: string,
  dc: number,
  advantage?: Advantage,
): void {
  for (const id of tokenIds) {
    const tok = getToken(id);
    if (!tok) continue;
    const r = resolve(tok);
    if (!r) continue;
    const proficient = r.saveProficiencies.some(
      (s) => s.trim().toUpperCase() === ability.trim().toUpperCase(),
    );
    // Conditions (e.g. restrained → DEX-save disadvantage) fold into the request.
    const adv = saveAdvantage(r.conditionLabels, ability, advantage);
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
  if (apply.save) {
    const ability = apply.save;
    const proficient = r.saveProficiencies.some(
      (s) => s.trim().toUpperCase() === ability.trim().toUpperCase(),
    );
    const adv = saveAdvantage(r.conditionLabels, ability, undefined);
    const out = rollSavingThrow(r.c, ability, apply.dc, adv.state, proficient);
    dmg = Math.floor((out.pass ? Math.floor(apply.amount / 2) : apply.amount) * mult);
    detail =
      `${r.name}: ${out.d20Detail} (${out.mod >= 0 ? '+' : ''}${out.mod}${out.proficient ? ' prof' : ''}) = ${out.total} vs DC ${apply.dc} — ${out.pass ? 'PASS' : 'FAIL'} · takes ${dmg}${typeTxt}` +
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
 * Resolve a character-sheet spell/ability roll authoritatively and log it.
 * Spell attack bonus / save DC are derived from the caster; damage/heal dice are
 * upcast by the chosen slot level (cantrips scale by caster level). Returns false
 * for purely descriptive entries (no roll).
 */
export function resolveAbilityRoll(
  sessionId: string,
  roller: string,
  character: Character,
  ability: SheetAbility,
  castLevel?: number,
  advantage?: Advantage,
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
    const { face, detail: d20detail } = rollD20Detail(advantage);
    const bonus = spellAttackBonus(level, stats);
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
        `${title}: ${d20detail} ${signed(bonus)} = ${attackTotal} to hit` +
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

  // 'save' and 'damage' both roll the (scaled) dice; 'save' notes the target DC.
  const val = dice ? rollDice(dice)!.total : 0;
  const dc = spellSaveDC(level, stats);
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
    const { face, detail: d20detail } = rollD20Detail(advantage);
    const bonus = prof + castMod;
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
        `${title}: ${d20detail} ${signed(bonus)} = ${attackTotal} to hit` +
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
