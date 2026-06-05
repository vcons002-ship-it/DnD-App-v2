import {
  addRollLog,
  applyDamage,
  getCharacter,
  getMonster,
  getToken,
  setSheetAbility,
} from './sessions.js';
import {
  damageParts,
  profBonusFor,
  rollSavingThrow,
  rollWeaponAttack,
  weaponAbilityMod,
  type Advantage,
  type Combatant,
} from '../../shared/combatMath.js';
import { rollDice } from '../../shared/dice.js';
import {
  effectiveDice,
  spellAttackBonus,
  spellSaveDC,
} from '../../shared/spellMath.js';
import { SKILLS, skillBonus, signed } from '../../shared/skills.js';
import type { Character, SheetAbility, Token, Weapon } from '../../shared/types.js';

type Resolved = {
  c: Combatant;
  name: string;
  weapons: Weapon[];
  ac: number;
  kind: Token['kind'];
  refId: string;
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
): boolean {
  const at = getToken(attackerTokenId);
  const tt = getToken(targetTokenId);
  if (!at || !tt) return false;
  const a = resolve(at);
  const t = resolve(tt);
  if (!a || !t) return false;
  const weapon = a.weapons[weaponIndex];
  if (!weapon) return false;

  const out = rollWeaponAttack(a.c, weapon, t.ac, advantage);

  // Active weapon masteries bound to THIS weapon adjust the damage applied to the
  // target: extra on a hit, Cleave strips the ability modifier (and one-shot
  // disables itself), or Graze on a miss. Only PCs carry masteries.
  let extra = 0;
  let cleaveCut = 0; // ability modifier removed by an active Cleave on a hit
  const masteryNotes: string[] = [];
  let cleaveToDisable: { characterId: string; ability: SheetAbility } | null = null;
  if (at.kind === 'pc') {
    const ch = getCharacter(at.refId);
    const wn = weapon.name.trim().toLowerCase();
    for (const ab of ch?.sheetAbilities ?? []) {
      const m = ab.mastery;
      if (ab.type !== 'mastery' || !m?.active || !m.effect) continue;
      if (!(m.weapons ?? []).some((w) => w.trim().toLowerCase() === wn)) continue;
      if (out.hit && m.effect.bonusDamage) {
        const r = rollDice(m.effect.bonusDamage);
        if (r && r.total > 0) {
          extra += r.total;
          masteryNotes.push(`${ab.name} +${r.total} [${m.effect.bonusDamage}]`);
        }
      }
      if (out.hit && m.effect.profBonusDamage) {
        const pb = profBonusFor(a.c);
        extra += pb;
        masteryNotes.push(`${ab.name} +${pb} (prof)`);
      }
      if (m.effect.cleave) {
        // This is the cleave attack against the second creature (now the target):
        // it deals the weapon's damage WITHOUT the ability modifier (the flat part
        // of the damage string), and toggles itself off after the attack roll.
        cleaveToDisable = { characterId: ch!.id, ability: ab };
        if (out.hit) {
          const { flat } = damageParts(weapon.damage?.trim() || '1d4');
          if (flat > 0) {
            cleaveCut += flat;
            masteryNotes.push(`${ab.name} (no ability modifier −${flat})`);
          } else {
            masteryNotes.push(`${ab.name} (no ability modifier)`);
          }
        }
      }
      if (!out.hit && m.effect.grazeOnMiss) {
        const g = Math.max(0, weaponAbilityMod(a.c, weapon));
        if (g > 0) {
          extra += g;
          masteryNotes.push(`${ab.name} ${g} (graze)`);
        }
      }
    }
  }

  let applied = (out.hit ? out.damage : 0) + extra - cleaveCut;
  if (out.hit) applied = Math.max(1, applied); // a hit always deals at least 1
  if (applied > 0) applyDamage(t.kind, t.refId, applied);
  addRollLog(sessionId, {
    roller,
    label: 'Attack',
    expr: weapon.name,
    total: out.attackTotal,
    detail:
      `${a.name} → ${t.name}: ${out.detail}` +
      (masteryNotes.length ? ` · ${masteryNotes.join(', ')}` : ''),
  });
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
    const out = rollSavingThrow(r.c, ability, dc, advantage);
    addRollLog(sessionId, {
      roller,
      label: `${ability.toUpperCase()} save`,
      expr: `DC ${dc}`,
      total: out.total,
      detail: `${r.name}: d20 ${out.total} (${out.mod >= 0 ? '+' : ''}${out.mod}) vs DC ${dc} — ${out.pass ? 'PASS' : 'FAIL'}`,
    });
  }
}

const d20 = (): number => 1 + Math.floor(Math.random() * 20);

/** Roll a d20 honoring advantage/disadvantage, with a display breakdown. */
function rollD20(advantage?: Advantage): { face: number; detail: string } {
  const a = d20();
  if (!advantage) return { face: a, detail: `d20[${a}]` };
  const b = d20();
  const face = advantage === 'adv' ? Math.max(a, b) : Math.min(a, b);
  return { face, detail: `d20[${a},${b}]→${advantage} ${face}` };
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
  const { stats, level } = character;
  const dice = effectiveDice(roll, { castLevel, casterLevel: level });
  const dmgType = roll.damageType ? ` ${roll.damageType}` : '';
  const upcast =
    (roll.baseLevel ?? 0) >= 1 && castLevel && castLevel > (roll.baseLevel ?? 1)
      ? ` (L${castLevel})`
      : '';
  const title = `${ability.name}${upcast}`;

  if (roll.kind === 'attack') {
    const { face, detail: d20detail } = rollD20(advantage);
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
    });
    return true;
  }

  // 'save' and 'damage' both roll the (scaled) dice; 'save' notes the target DC.
  const val = dice ? rollDice(dice)!.total : 0;
  const note =
    roll.kind === 'save' && roll.save
      ? ` — DC ${spellSaveDC(level, stats)} ${roll.save} save for half`
      : roll.kind === 'damage'
        ? ' (auto-hit)'
        : '';
  addRollLog(sessionId, {
    roller,
    label: ability.name,
    expr: title,
    total: val,
    detail: `${title}: ${val}${dmgType} damage [${dice}]${note}`,
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
  const { face, detail: d20detail } = rollD20(advantage);
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
