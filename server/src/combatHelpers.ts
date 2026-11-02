import type { Combatant } from '../../shared/combatMath.js';
import { rollDice, type DiceResult } from '../../shared/dice.js';
import { spellKey } from '../../shared/linkedSpells.js';
import { hasLineOfSight } from '../../shared/mapWalls.js';
import { effectiveAc, effectiveStats, saveExtra, type ModSource } from '../../shared/modifiers.js';
import { signed } from '../../shared/skills.js';
import { effectiveSheetAbility } from '../../shared/spellExecution.js';
import type {
  Character,
  HpDamagePart,
  HpFxEvent,
  Monster,
  PendingDamage,
  RollEntry,
  RollReveal,
  SheetAbility,
  Token,
  TokenKind,
  Weapon,
} from '../../shared/types.js';
import { breakInvisibility } from './advancedSpells.js';
import { commandTargetError } from './commandSpell.js';
import { newId } from './db.js';
import {
  addRollLog,
  applyDamage,
  endConcentration,
  getCharacter,
  getMap,
  getMonster,
  getSessionById,
  getToken,
  incrementKillCount,
  isDeadEntity,
  listTokens,
  setConcentration,
  setCondition,
} from './sessions.js';

export type Resolved = {
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
  /** Damage types it takes no damage from (see `damageMultiplier`). */
  immunities: string[];
  /** Ability codes proficient in for saving throws. */
  saveProficiencies: string[];
  /** Modifier source (a PC's character) for flat save/skill/attack bonuses from
   *  feats + equipped magic items; undefined for monsters (no modifiers). */
  mod?: ModSource;
};

/** A creature's stances that are currently switched ON. */
export function activeStances(kind: TokenKind, refId: string): SheetAbility[] {
  const e = kind === 'pc' ? getCharacter(refId) : getMonster(refId);
  return (e?.sheetAbilities ?? []).filter((ab) => ab.type === 'stance' && !!ab.stance?.active);
}

/** Resistances an active stance grants on top of the stat block (Rage). */
export function stanceResistances(kind: TokenKind, refId: string): string[] {
  return activeStances(kind, refId).flatMap((ab) => ab.stance!.grantsResistances ?? []);
}

/** Named advantage on a Strength check or save from an active stance (Rage). */
export function strFeatureAdv(kind: TokenKind, refId: string, ability: string): string[] {
  if (ability.trim().toUpperCase() !== 'STR') return [];
  return activeStances(kind, refId)
    .filter((ab) => ab.stance!.advOnStrChecks)
    .map((ab) => ab.name);
}

/** Advantage attackers get against a creature because of ITS own active stance
 *  (Reckless Attack's price), as named reasons. */
export function targetGivesAdvantage(kind: TokenKind, refId: string): string[] {
  const e = kind === 'pc' ? getCharacter(refId) : getMonster(refId);
  return [
    ...activeStances(kind, refId)
      .filter((ab) => ab.stance!.enemiesHaveAdvantage)
      .map((ab) => `target ${ab.name}`),
    ...(e?.conditions.filter((c) => c.combatEffect?.nextAttackAdvantage).map((c) => c.combatEffect!.spell) ?? []),
  ];
}

/** A stance's flat bonus at this level: the highest `bonusDamageAtLevels`
 *  threshold at or below it, else its plain `bonusDamage`. */
export function stanceBonusAt(st: NonNullable<SheetAbility['stance']>, level: number): string | undefined {
  const steps = (st.bonusDamageAtLevels ?? []).filter((x) => level >= x.level);
  if (steps.length === 0) return st.bonusDamage;
  return steps.reduce((best, x) => (x.level > best.level ? x : best)).bonus;
}

export function combatLabels(conditions: Character['conditions']) {
  return conditions.map((c) => c.label);
}

export function spellAttackDis(kind: TokenKind, id: string) {
  return (
    (kind === 'pc' ? getCharacter(id) : getMonster(id))?.conditions
      .filter((c) => c.combatEffect?.attackDisadvantage)
      .map((c) => c.combatEffect!.spell) ?? []
  );
}

export function resolve(token: Token): Resolved | null {
  if (token.kind === 'pc') {
    const ch = getCharacter(token.refId);
    if (!ch) return null;
    // Effective scores/AC fold in feat/ASI + equipped-item modifiers, so every
    // ability-derived roll (attack, save, spell DC, initiative) uses them.
    return {
      c: { stats: effectiveStats(ch).scores, level: ch.level, isMonster: false },
      name: ch.name,
      weapons: ch.weapons,
      ac: effectiveAc(ch),
      kind: 'pc',
      refId: ch.id,
      conditionLabels: combatLabels(ch.conditions),
      resistances: [...ch.resistances, ...stanceResistances('pc', ch.id)],
      weaknesses: ch.weaknesses,
      immunities: ch.immunities ?? [],
      saveProficiencies: ch.saveProficiencies,
      mod: ch,
    };
  }
  const m = getMonster(token.refId);
  if (!m) return null;
  return {
    c: { stats: m.stats, level: m.level, isMonster: true },
    name: m.name,
    weapons: m.weapons,
    ac: effectiveAc(m),
    kind: 'monster',
    refId: m.id,
    conditionLabels: combatLabels(m.conditions),
    resistances: [...m.resistances, ...stanceResistances('monster', m.id)],
    weaknesses: m.weaknesses,
    immunities: m.immunities ?? [],
    saveProficiencies: m.saveProficiencies,
  };
}

/** Defense in depth for spell targets, including malformed cross-session tokens.
 * Visibility/current-map checks belong to the socket boundary. */
export function spellTarget(sessionId: string, tokenId: string): Token | null {
  const token = getToken(tokenId);
  if (!token || getMap(token.mapId)?.sessionId !== sessionId) return null;
  const entity = token.kind === 'pc' ? getCharacter(token.refId) : getMonster(token.refId);
  return entity?.sessionId === sessionId ? token : null;
}

/** Only the reviewed, damage-free Hold Person profile gains automatic control.
 * An authored roll, custom spell, or manual execution profile keeps its intent. */
export function automatedHoldPerson(a: SheetAbility): boolean {
  if (
    a.type !== 'spell' ||
    !['hold person', 'hold monster'].includes(a.name.trim().toLowerCase()) ||
    a.level !== (spellKey(a.name) === 'hold monster' ? 5 : 2) ||
    a.source === 'custom' ||
    a.executionProfile === 'manual'
  )
    return false;
  const roll = effectiveSheetAbility(a).roll;
  return (
    roll?.kind === 'save' && roll.save?.toUpperCase() === 'WIS' && (!roll.dice || roll.dice.trim() === '0')
  );
}

export function spellControlTargetError(sessionId: string, ability: SheetAbility, tokenId: string): string | undefined {
  if (!automatedHoldPerson(ability)) return;
  const token = spellTarget(sessionId, tokenId);
  const target = token && (token.kind === 'pc' ? getCharacter(token.refId) : getMonster(token.refId));
  if (!token || !target) return 'Choose a creature in this campaign.';
  if (isDeadEntity(token.kind, target) || (token.kind === 'monster' && (target as Monster).objectKind))
    return `${ability.name} requires a living creature.`;
  if (
    spellKey(ability.name) === 'hold person' &&
    token.kind === 'monster' &&
    (!/^humanoid\b/i.test((target as Monster).creatureType.trim()) || (target as Monster).objectKind)
  )
    return 'Hold Person only affects Humanoids.';
}

/** Server-computed origins for an already validated placed spell, never a
 * client-provided override of direct targeting or visibility checks. */
export type PlacedAreaSave = { mapId: string; origins: readonly { x: number; y: number }[] };

export function spellApplyTargetError(
  sessionId: string,
  entry: RollEntry,
  tokenId: string,
  area?: PlacedAreaSave,
): string | undefined {
  const apply = entry.apply;
  const effect = apply?.effect;
  const origin =
    apply?.attack?.attacker ??
    (effect
      ? { kind: effect.casterKind, refId: effect.casterId }
      : apply?.owner
        ? { kind: 'pc' as const, refId: apply.owner }
        : undefined);
  const destination = spellTarget(sessionId, tokenId);
  const source =
    origin &&
    destination &&
    listTokens(destination.mapId).find((t) => t.kind === origin.kind && t.refId === origin.refId);
  if (area) {
    if (
      !destination ||
      area.mapId !== destination.mapId ||
      !area.origins.some((p) => hasLineOfSight(p, destination, getMap(destination.mapId)?.walls))
    )
      return 'A wall or closed door blocks this target.';
  } else if (source && destination && !hasLineOfSight(source, destination, getMap(destination.mapId)?.walls))
    return 'A wall or closed door blocks this target.';
  if (apply?.healing) {
    const token = spellTarget(sessionId, tokenId);
    if (!token || (token.kind === 'monster' && getMonster(token.refId)?.objectKind))
      return 'Choose a creature for healing, not an object.';
  }
  if (!effect) return;
  if (effect.commandWord) return commandTargetError(sessionId, entry, tokenId);
  const caster = effect.casterKind === 'pc' ? getCharacter(effect.casterId) : getMonster(effect.casterId);
  const concentration = caster?.conditions.find(
    (c) => c.id === effect.concentrationConditionId && c.isConcentration,
  );
  const round = getSessionById(sessionId)?.combatRound ?? 0;
  const expiry = concentration?.combatEffect ?? effect;
  if (
    !concentration ||
    (round > 0 && expiry.expiresRound
      ? round >= expiry.expiresRound
      : (expiry.expiresAt ?? effect.expiresAt) <= Date.now())
  )
    return 'That casting has ended. Cast the spell again to affect another target.';
  const token = spellTarget(sessionId, tokenId);
  const target = token && (token.kind === 'pc' ? getCharacter(token.refId) : getMonster(token.refId));
  if (!token || !target) return 'Choose a creature in this campaign.';
  if (isDeadEntity(token.kind, target) || (token.kind === 'monster' && (target as Monster).objectKind))
    return 'Choose a living creature.';
  if (
    effect.eligibleCreatureType === 'humanoid' &&
    (isDeadEntity(token.kind, target) ||
      (token.kind === 'monster' &&
        ((target as Monster).objectKind || !/^humanoid\b/i.test((target as Monster).creatureType.trim()))))
  )
    return `${effect.spell} only affects living Humanoids.`;
  if (
    (apply?.consumedTargets ?? []).some((id) => {
      const previous = getToken(id);
      return previous?.kind === token.kind && previous.refId === token.refId;
    })
  )
    return 'That creature has already saved against this casting.';
  if (apply?.maxTargets && (apply.consumedTargets?.length ?? 0) >= apply.maxTargets)
    return 'All targets for this casting have been resolved.';
}

/** Every cast has its own concentration identity. Old targeting buttons cannot
 * reapply an effect after concentration ends or the same spell is recast. */
export function timedConcentration(
  kind: TokenKind,
  refId: string,
  spell: string,
  rounds = 10,
  castLevel?: number,
) {
  const eligible = () => {
    const current = kind === 'pc' ? getCharacter(refId) : getMonster(refId);
    return (
      !!current &&
      current.curHp > 0 &&
      !isDeadEntity(kind, current) &&
      !current.conditions.some((c) =>
        /^(incapacitated|paralyzed|petrified|stunned|unconscious|haste lethargy)$/i.test(c.label.trim()),
      )
    );
  };
  if (!eligible()) return;
  endConcentration(kind, refId, `replaced by ${spell}`);
  // Losing self-Haste can incapacitate the caster before the replacement buff
  // exists. Do not attach an orphan effect to a concentration that cannot start.
  if (!eligible()) return;
  setConcentration(kind, refId, spell);
  const caster = kind === 'pc' ? getCharacter(refId) : getMonster(refId);
  const concentration = caster!.conditions.find((c) => c.isConcentration)!;
  const round = getSessionById(caster!.sessionId)?.combatRound ?? 0;
  const effect = {
    casterKind: kind,
    casterId: refId,
    spell,
    castLevel,
    castId: concentration.id,
    expiresAt: Date.now() + rounds * 6000,
    ...(round > 0 ? { expiresRound: round + rounds } : {}),
  };
  setCondition(kind, refId, { ...concentration, combatEffect: effect });
  return { ...effect, concentrationConditionId: concentration.id };
}

/** Flat saving-throw bonus from a PC's feats / equipped magic items (e.g. Cloak
 *  of Protection +1 all saves), plus a log fragment naming the source(s). The
 *  ability-score part is already baked into `r.c.stats`; this is the extra. */
export function saveBonus(r: Resolved, ability: string): { add: number; note: string } {
  if (!r.mod) return { add: 0, note: '' };
  const e = saveExtra(r.mod, ability);
  if (!e.total) return { add: 0, note: '' };
  const names = e.parts.map((p) => `${signed(p.value)} ${p.source}`).join(', ');
  return { add: e.total, note: ` · ${names}` };
}

/** Roll a dice expression and keep the per-die face breakdown for the log,
 *  e.g. "2d6[3,5] +1" — so Acid Splash shows WHICH dice landed, not just a sum. */
export function rollFaces(expr: string): { total: number; text: string } {
  const r = rollDice(expr);
  if (!r) return { total: 0, text: expr }; // unrollable expression → no-op, never throw
  return { total: r.total, text: r.detail.replace(/ = -?\d+$/, '') };
}

/** Apply rolled damage/healing and return an accounting note for the roll log
 *  ("Druk HP 42→38"; temp HP shows as "42+5") so mistakes are easy to spot and
 *  correct. Carries the target so visibility can hide ENEMY changes from
 *  players. Undefined when nothing was found/changed. */
export type DamageBreakdown = NonNullable<RollReveal['damageBreakdown']>;

/** Itemize already-rolled faces for the log and animation without rolling again. */
export function appendDamageBreakdownRoll(detail: DamageBreakdown, rolled: DiceResult, source: string): void {
  const terms = /([+-]?)(\d*)d(\d+)|([+-]?)(\d+)/gi;
  let faceIndex = 0;
  for (const match of rolled.expr.replace(/\s+/g, '').matchAll(terms)) {
    if (match[3] !== undefined) {
      const count = match[2] ? Number(match[2]) : 1;
      const faces = rolled.rolls.slice(faceIndex, faceIndex + count);
      faceIndex += count;
      const negative = match[1] === '-';
      const step = {
        label: `${count}d${match[3]} (${source})`,
        value: faces.reduce((sum, face) => sum + face, 0) * (negative ? -1 : 1),
        faces,
      };
      (negative ? detail.mods : detail.dice).push(step);
    } else {
      const value = Number(match[5]) * (match[4] === '-' ? -1 : 1);
      if (value) detail.mods.push({ label: source, value });
    }
  }
}

export function damageBreakdownTotal(detail: DamageBreakdown): number {
  return [...detail.dice, ...detail.mods].reduce((sum, step) => sum + step.value, 0);
}

/** Creature roll modifiers are DM-only, including friendly creatures and summons. */
export function hidesMods(kind: TokenKind, _refId: string): boolean {
  return kind === 'monster';
}

export function applyDamageNoted(
  kind: TokenKind,
  refId: string,
  amount: number,
  /** Damage type when known — rides the fx:hp event for the elemental burst. */
  damageType?: string,
  /** The attacking token (kind/refId) — credits a PC's kill count if this damage
   *  drops a monster to 0 HP. */
  attacker?: { kind: TokenKind; refId: string },
  /** Crit hit — a crit vs a downed PC is two death-save failures (RAW). */
  crit = false,
  /** The exact reveal that should release this transient damage floater. */
  rollId?: string,
  spell?: string,
  damageParts?: HpDamagePart[],
  impact?: HpFxEvent['impact'],
  weaponFx?: PendingDamage['weaponFx'],
): RollEntry['hpNote'] {
  const before = kind === 'pc' ? getCharacter(refId) : getMonster(refId);
  const after = applyDamage(kind, refId, amount, damageType, crit, rollId, {
    spell,
    damageParts,
    impact,
    ...weaponFx,
  });
  if (!before || !after) return undefined;
  if (amount > 0 && attacker) breakInvisibility(attacker.kind, attacker.refId, 'dealing damage');
  // Kill credit: a PC attacker that drops a (living) monster to 0 HP scores a kill.
  if (
    attacker?.kind === 'pc' &&
    kind === 'monster' &&
    amount > 0 &&
    before.curHp > 0 &&
    after.curHp <= 0
  ) {
    incrementKillCount(attacker.refId);
  }
  const hp = (e: { curHp: number; tempHp: number }) =>
    `${e.curHp}${e.tempHp > 0 ? `+${e.tempHp}` : ''}`;
  // A PC this hit KILLED (third failure, or massive damage) — say so, so the
  // death is visible in the log and not just implied by the pips.
  const killed =
    kind === 'pc' &&
    (before as Character).deathSaves.failures < 3 &&
    (after as Character).deathSaves.failures >= 3;
  const massive =
    killed && amount - before.tempHp - before.curHp >= before.maxHp && before.curHp > 0;
  return {
    kind,
    refId,
    text:
      `${after.name} HP ${hp(before)}→${hp(after)}` +
      (killed ? (massive ? ' — DEAD (massive damage)' : ' — DEAD') : ''),
  };
}

/**
 * When a creature takes damage while concentrating on a spell, log the
 * Constitution save needed to maintain it (5e: DC = the greater of 10 and half
 * the damage taken, rounded down). Players/DM then roll the creature's CON save.
 * No-op for healing or a creature that isn't concentrating.
 */
export function noteConcentration(
  sessionId: string,
  kind: 'pc' | 'monster',
  refId: string,
  damage: number,
): void {
  if (damage <= 0) return;
  const e = kind === 'pc' ? getCharacter(refId) : getMonster(refId);
  if (!e || !e.conditions.some((c) => c.isConcentration)) return;
  // DC = half the damage, minimum 10 — and at most 30 (2024 PHB).
  const dc = Math.min(30, Math.max(10, Math.floor(damage / 2)));
  addRollLog(sessionId, {
    roller: 'DM',
    label: 'Concentration',
    expr: `DC ${dc}`,
    total: dc,
    detail: `⚠️ ${e.name} took ${damage} damage while concentrating — make a DC ${dc} CON save or lose concentration`,
  });
}
