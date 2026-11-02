import { rollD20Detail, rollSavingThrow, type Advantage, type Combatant } from '../../shared/combatMath.js';
import { checkAdvantage, saveAdvantage, saveAutoFail } from '../../shared/conditionEffects.js';
import { parseConsumable } from '../../shared/consumables.js';
import { rollDice, withDiceMetadata } from '../../shared/dice.js';
import { effectiveStats, saveExtra, skillExtra } from '../../shared/modifiers.js';
import { checkReveal, diceReveal } from '../../shared/rollReveal.js';
import { abilityMod, proficiencyBonus, SKILLS, signed } from '../../shared/skills.js';
import type { Character, Monster, RollEntry, SheetAbility, Token } from '../../shared/types.js';
import { applyDamageNoted, hidesMods, resolve, saveBonus, strFeatureAdv } from './combatHelpers.js';
import { hexDisadvantage } from './marks.js';
import {
  addRollLog,
  applyDamage,
  getCharacter,
  getMonster,
  getToken,
  isDeadEntity,
  removeItem,
  setDeathSaves,
  setItem,
  updateCharacter,
} from './sessions.js';

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
    // Paralyzed/Stunned/Unconscious/Petrified auto-fail STR & DEX saves (no roll).
    const autoFail = saveAutoFail(r.conditionLabels, ability);
    if (autoFail) {
      addRollLog(sessionId, {
        roller,
        label: `${ability.toUpperCase()} save`,
        expr: `DC ${dc}`,
        total: 0,
        detail: `${r.name}: auto-fails (${autoFail}) vs DC ${dc} — FAIL`,
      });
      continue;
    }
    const proficient = r.saveProficiencies.some(
      (s) => s.trim().toUpperCase() === ability.trim().toUpperCase(),
    );
    // The creature's own armed adv/dis (if any) plus conditions (e.g. restrained
    // → DEX-save disadvantage) fold into the request (any adv + any dis cancel).
    const adv = saveAdvantage(
      r.conditionLabels,
      ability,
      advantageByToken?.[id] ?? advantage,
      strFeatureAdv(r.kind, r.refId, ability),
    );
    const out = rollSavingThrow(r.c, ability, dc, adv.state, proficient);
    const sb = saveBonus(r, ability);
    const total = out.total + sb.add;
    const pass = total >= dc;
    addRollLog(sessionId, {
      roller,
      label: `${ability.toUpperCase()} save`,
      expr: `DC ${dc}`,
      total,
      detail:
        `${r.name}: ${out.d20Detail} (${out.mod >= 0 ? '+' : ''}${out.mod}${out.proficient ? ' prof' : ''})${sb.note} = ${total} vs DC ${dc} — ${pass ? 'PASS' : 'FAIL'}` +
        (adv.reasons.length ? ` · ${adv.state ?? 'straight'}: ${adv.reasons.join(', ')}` : ''),
      reveal: checkReveal({
        who: r.name,
        title: `${ability.toUpperCase()} save`,
        face: out.face,
        total,
        steps: [
          { label: ability.toUpperCase(), value: out.mod },
          ...(sb.add ? [{ label: 'bonus', value: sb.add }] : []),
        ],
        outcome: pass ? 'pass' : 'fail',
      }),
      hideMods: hidesMods(r.kind, r.refId),
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
  // Effective scores + flat save bonuses (feats/equipped items); monsters have
  // no modifiers so these reduce to the base values.
  const c: Combatant = {
    stats: effectiveStats(ent).scores,
    level: ent.level,
    isMonster: kind !== 'pc',
  };
  const proficient = ent.saveProficiencies.some((s) => s.trim().toUpperCase() === ab);
  const adv = saveAdvantage(
    ent.conditions.map((x) => x.label),
    ab,
    advantage,
    strFeatureAdv(kind, refId, ab),
  );
  const out = rollSavingThrow(c, ab, 0, adv.state, proficient); // dc 0 → pass unused
  const e = saveExtra(ent, ab);
  const total = out.total + e.total;
  const note = e.parts.map((p) => `${signed(p.value)} ${p.source}`).join(', ');
  addRollLog(sessionId, {
    roller,
    label: `${ab} save`,
    expr: proficient ? `${ab} (prof)` : ab,
    total,
    detail:
      `${ent.name} — ${ab} save: ${out.d20Detail} (${out.mod >= 0 ? '+' : ''}${out.mod}${out.proficient ? ' prof' : ''})${note ? ` · ${note}` : ''} = ${total}` +
      (adv.reasons.length ? ` · ${adv.state ?? 'straight'}: ${adv.reasons.join(', ')}` : ''),
    reveal: checkReveal({
      who: ent.name,
      title: `${ab} save`,
      face: out.face,
      total,
      steps: [
        { label: ab, value: out.mod },
        ...e.parts.map((p) => ({ label: p.source, value: p.value })),
      ],
    }),
    hideMods: hidesMods(kind, refId),
  });
  return true;
}

/**
 * Roll ONE creature's PLAIN ability check — d20 + the ability modifier, with NO
 * proficiency (that's what separates it from a skill check or a save). The armed
 * adv/dis toggle and ability-check conditions (poisoned/frightened → disadvantage)
 * fold in. Click-to-roll from the stat block's Stat/Save menu; PC or monster.
 */
export function resolveCheck(
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
  const c: Combatant = {
    stats: effectiveStats(ent).scores,
    level: ent.level,
    isMonster: kind !== 'pc',
  };
  const adv = checkAdvantage(
    ent.conditions.map((x) => x.label),
    advantage,
    strFeatureAdv(kind, refId, ab),
    [
      ...hexDisadvantage(sessionId, kind, refId, ab),
      ...ent.conditions.filter((cond) => cond.combatEffect?.checkDisadvantage).map((cond) => cond.combatEffect!.spell),
    ],
  );
  // dc 0 → unused; `proficient: false` makes it a plain ability check.
  const out = rollSavingThrow(c, ab, 0, adv.state, false, `${ab} Check`);
  addRollLog(sessionId, {
    roller,
    label: `${ab} check`,
    expr: ab,
    total: out.total,
    detail:
      `${ent.name} — ${ab} check: ${out.d20Detail} (${out.mod >= 0 ? '+' : ''}${out.mod}) = ${out.total}` +
      (adv.reasons.length ? ` · ${adv.state ?? 'straight'}: ${adv.reasons.join(', ')}` : ''),
    reveal: checkReveal({
      who: ent.name,
      title: `${ab} check`,
      face: out.face,
      total: out.total,
      steps: [{ label: ab, value: out.mod }],
    }),
    hideMods: hidesMods(kind, refId),
  });
  return true;
}

export function areaSaveRequest(tok: Token, ability: string, dc: number) {
  const r = resolve(tok);
  if (!r) return;
  return {
    target: tok,
    c: r.c,
    ability,
    dc,
    mode: saveAdvantage(r.conditionLabels, ability, undefined, strFeatureAdv(r.kind, r.refId, ability)).state,
    proficient: r.saveProficiencies.some((s) => s.trim().toUpperCase() === ability.toUpperCase()),
    extra: saveBonus(r, ability).add,
    autoFail: !!saveAutoFail(r.conditionLabels, ability),
  };
}

/**
 * Roll a 5e death saving throw for a downed PC (0 HP). 10+ is a success, under 10
 * a failure; a natural 20 revives at 1 HP; a natural 1 is two failures. Three
 * successes stabilizes (saves reset); three failures is death. Logs the result.
 */
export function resolveDeathSave(sessionId: string, characterId: string): boolean {
  const ch = getCharacter(characterId);
  // Only a downed PC that isn't already stable (3✓) or dead (3✗) keeps rolling.
  if (!ch || ch.curHp > 0 || ch.deathSaves.successes >= 3 || ch.deathSaves.failures >= 3)
    return false;
  const face = rollDice('1d20')!.total;
  // A death save IS a saving throw, so all-saves modifiers (Cloak of Protection
  // etc.) apply to the 10+ check; an ability-specific save bonus doesn't (a
  // death save has no ability), and nat 20 / nat 1 stay face-based per RAW.
  const extra = saveExtra(ch, '');
  const total = face + extra.total;
  const extraNote = extra.parts
    .map((p) => ` ${signed(p.value)}[${p.source}]`)
    .join('');
  const log = (detail: string, outcome: 'pass' | 'fail') =>
    addRollLog(sessionId, {
      roller: ch.name,
      label: 'Death save',
      expr: 'd20',
      total,
      detail,
      reveal: checkReveal({
        who: ch.name,
        title: 'Death save',
        face,
        total,
        steps: extra.parts.map((p) => ({ label: p.source, value: p.value })),
        outcome,
      }),
    });

  if (face === 20) {
    applyDamage('pc', characterId, -1); // back to 1 HP (healing also resets saves)
    setDeathSaves(characterId, 0, 0);
    log(`${ch.name} rolls a natural 20 — regains 1 HP and is conscious!`, 'pass');
    return true;
  }

  let { successes, failures } = ch.deathSaves;
  let kind: string;
  if (face === 1) (failures = Math.min(3, failures + 2)), (kind = 'FAILURE ×2');
  else if (total >= 10) (successes = Math.min(3, successes + 1)), (kind = 'SUCCESS');
  else (failures = Math.min(3, failures + 1)), (kind = 'FAILURE');

  // 3✓ stabilizes and 3✗ dies — both are persistent states (kept as the tally so
  // the UI can show a "Stabilized"/"Dead" badge), and stop further rolling.
  let outcome = '';
  if (failures >= 3) outcome = ` — ${ch.name} has DIED`;
  else if (successes >= 3) outcome = ` — ${ch.name} is STABLE`;

  setDeathSaves(characterId, successes, failures);
  log(
    `${ch.name}: d20[${face}]${extraNote}${extra.total ? ` = ${total}` : ''} ${kind} (${successes}✓/${failures}✗)${outcome}`,
    kind === 'SUCCESS' ? 'pass' : 'fail',
  );
  return true;
}

/** A concentration spell, by its tag or its meta line ("… · Concentration").
 *  Covers spells AND spell-backed stances (e.g. Hunter's Mark). */
export function isConcentrationSpell(a: SheetAbility): boolean {
  if (a.type !== 'spell' && a.type !== 'stance') return false;
  return (
    (a.tags ?? []).some((t) => t.trim().toLowerCase() === 'concentration') ||
    (a.meta ?? '').toLowerCase().includes('concentration')
  );
}

/**
 * Resolve a trap-disarm attempt: a Dexterity (Sleight of Hand) check vs the
 * trap's disarm DC (defaulting to 12 when unset), logged to the shared roll log.
 * Returns whether the check succeeded so the caller can flip the trap to
 * "Disarmed".
 */
export function resolveTrapDisarm(
  sessionId: string,
  roller: string,
  character: Character,
  trap: Monster,
  advantage?: Advantage,
): { success: boolean } {
  return resolveObjectCheck(sessionId, roller, character, trap, 'disarm', advantage);
}

/**
 * A 5e DEX (Thieves' Tools / Sleight of Hand) check against an object's DC,
 * shared by trap-disarming and lock-picking. Proficiency in Sleight of Hand
 * grants the bonus; logged to the shared roll log. Returns whether it beat the
 * object's `objectDc` (default 12).
 */
export function resolveObjectCheck(
  sessionId: string,
  roller: string,
  character: Character,
  object: Monster,
  kind: 'disarm' | 'unlock',
  advantage?: Advantage,
): { success: boolean } {
  const dc = object.objectDc && object.objectDc > 0 ? object.objectDc : 12;
  const proficient = character.proficientSkills.includes('Sleight of Hand');
  // Effective DEX (feat/item ability mods) + proficiency + flat Sleight-of-Hand
  // bonuses, broken out like attack/save logs (e.g. "+2[DEX] +2[PROF]").
  const stats = effectiveStats(character).scores;
  const extra = skillExtra(character, 'Sleight of Hand');
  const abil = abilityMod(stats.DEX);
  const prof = proficient ? proficiencyBonus(character.level) : 0;
  const bonus = abil + prof + extra.total;
  const breakdown =
    `${signed(abil)}[DEX]` +
    (prof ? ` ${signed(prof)}[PROF]` : '') +
    extra.parts.map((p) => ` ${signed(p.value)}[${p.source}]`).join('');
  const { face, detail: d20detail } = rollD20Detail(advantage);
  const total = face + bonus;
  const success = total >= dc;
  const verb = kind === 'disarm' ? 'disarm' : 'pick the lock on';
  const ok = kind === 'disarm' ? 'DISARMED' : 'UNLOCKED';
  addRollLog(sessionId, {
    roller,
    label: kind === 'disarm' ? 'Disarm trap' : 'Pick lock',
    expr: `DEX${proficient ? ' (prof)' : ''} vs DC ${dc}`,
    total,
    detail:
      `${character.name} tries to ${verb} ${object.name}: ${d20detail} ${breakdown} = ` +
      `${total} vs DC ${dc} — ${success ? ok : 'FAILED'}`,
    reveal: checkReveal({
      who: character.name,
      title: kind === 'disarm' ? 'Disarm trap' : 'Pick lock',
      target: object.name,
      face,
      total,
      steps: [
        { label: 'DEX', value: abil },
        { label: 'PROF', value: prof },
        ...extra.parts.map((p) => ({ label: p.source, value: p.value })),
      ],
      outcome: success ? 'pass' : 'fail',
    }),
  });
  return { success };
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
  // Effective ability mod (feat/item score bonuses) + proficiency + flat skill
  // bonuses, shown as a labelled breakdown matching attack/save logs (e.g.
  // "+2[DEX] +2[PROF] +1[Boots]") rather than one cooked-in number.
  const stats = effectiveStats(character).scores;
  const extra = skillExtra(character, skill.name);
  const abil = abilityMod(stats[skill.ability]);
  const prof = proficient ? proficiencyBonus(character.level) : 0;
  const bonus = abil + prof + extra.total;
  const breakdown =
    `${signed(abil)}[${skill.ability}]` +
    (prof ? ` ${signed(prof)}[PROF]` : '') +
    extra.parts.map((p) => ` ${signed(p.value)}[${p.source}]`).join('');
  // Conditions (Poisoned/Frightened) impose disadvantage on ability checks, folded
  // in with any manual adv/dis (any adv + any dis cancel to a straight roll).
  const adv = checkAdvantage(
    character.conditions.map((x) => x.label),
    advantage,
    strFeatureAdv('pc', character.id, skill.ability),
    [
      ...hexDisadvantage(sessionId, 'pc', character.id, skill.ability),
      ...character.conditions.filter((c) => c.combatEffect?.checkDisadvantage).map((c) => c.combatEffect!.spell),
    ],
  );
  const { face, detail: d20detail } = withDiceMetadata(
    {
      label: `${skill.name} Check`,
      ...(adv.reasons.length ? { advantageReasons: adv.reasons, advantageState: adv.state ?? 'straight' } : {}),
    },
    () => rollD20Detail(adv.state),
  );
  const total = face + bonus;
  addRollLog(sessionId, {
    roller,
    label: `${skill.name} check`,
    expr: `${skill.ability}${proficient ? ' (prof)' : ''}`,
    total,
    detail:
      `${character.name} — ${skill.name}: ${d20detail} ${breakdown} = ${total}` +
      (adv.reasons.length ? ` · ${adv.state ?? 'straight'}: ${adv.reasons.join(', ')}` : ''),
    reveal: checkReveal({
      who: character.name,
      title: `${skill.name} check`,
      face,
      total,
      steps: [
        { label: skill.ability, value: abil },
        { label: 'PROF', value: prof },
        ...extra.parts.map((p) => ({ label: p.source, value: p.value })),
      ],
    }),
  });
  return true;
}

/**
 * Drink/use a consumable from a character's inventory: roll what the item does
 * (parsed SERVER-SIDE from the item — the client's word is never taken for it),
 * apply it, log the roll with a dice reveal so it animates like any other roll,
 * and spend one from the stack.
 *
 * 5e temporary HP doesn't stack — a Potion of Heroism's 10 replaces a smaller
 * pool and is ignored if you already have more.
 */
export function useConsumable(
  sessionId: string,
  roller: string,
  characterId: string,
  itemId: string,
): boolean {
  const c = getCharacter(characterId);
  // A dead character can't drink anything (and can't regain HP) — the item is
  // kept; the socket handler tells the player why.
  if (!c || isDeadEntity('pc', c)) return false;
  const item = c.items.find((i) => i.id === itemId);
  if (!item || item.qty <= 0) return false;
  const effect = parseConsumable(item);
  if (!effect) return false;
  const result = rollDice(effect.dice);
  if (!result) return false;
  const val = Math.max(0, result.total);

  let hpNote: RollEntry['hpNote'];
  let outcome: string;
  if (effect.kind === 'tempHp') {
    const before = c.tempHp;
    const next = Math.max(before, val);
    updateCharacter(characterId, { tempHp: next });
    outcome =
      next > before
        ? `${c.name} gains ${val} temporary HP`
        : `${c.name} keeps ${before} temporary HP (${val} is no better)`;
    hpNote = { kind: 'pc', refId: characterId, text: `${c.name} temp HP ${before}→${next}` };
  } else {
    const healingBlocked = c.conditions.some((cond) => cond.combatEffect?.preventsHealing);
    hpNote = val > 0 && !healingBlocked ? applyDamageNoted('pc', characterId, -val) : undefined;
    outcome = healingBlocked ? `${c.name}: Chill Touch prevents healing` : `${c.name} regains ${val} HP`;
  }

  // Spend one; an emptied stack leaves the sheet.
  if (item.qty <= 1) removeItem(characterId, itemId);
  else setItem(characterId, { ...item, qty: item.qty - 1 });

  addRollLog(sessionId, {
    roller,
    label: item.name,
    expr: effect.dice,
    total: val,
    detail: `Used ${item.name}: ${result.detail} — ${outcome}`,
    hpNote,
    reveal: diceReveal(c.name, result, item.name),
  });
  return true;
}
