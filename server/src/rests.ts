// Short / Long Rest and Hit Dice (2024 PHB). The rules themselves are pure in
// shared/rests.ts; this module applies them to stored characters.
import { db } from './db.js';
import {
  addRollLog, getCharacter, isDeadEntity, listCharacters, updateCharacter,
} from './sessions.js';
import { applyDamageNoted } from './combat.js';
import { rollDice } from '../../shared/dice.js';
import { abilityMod } from '../../shared/skills.js';
import { effectiveStats } from '../../shared/modifiers.js';
import { diceReveal } from '../../shared/rollReveal.js';
import {
  hitDieFor, hitDiceLeft, hitDieHealing, isPactCaster, restCounters, type RestKind,
} from '../../shared/rests.js';
import type { Character } from '../../shared/types.js';

export type RestOutcome = {
  characterId: string;
  name: string;
  /** Not rested: dead, or (Long Rest) at 0 HP — 2024 needs at least 1 HP. */
  skipped?: 'dead' | 'down';
  /** Human-readable pieces: "HP 12→40", "Rage 1→3", "L1 slots 0→2", "Hit Dice 2→5". */
  restored: string[];
};

const left = (c: { max: number; used: number }) => c.max - c.used;

/**
 * Apply a rest to one character. A Long Rest refills HP, Hit Dice, every slot and
 * counter, and drops temp HP; a Short Rest refills short-rest counters (and a
 * Warlock's pact slots) and gives back one use of the "one per Short Rest"
 * features. Limited-use abilities that recharge on that rest become ready.
 * Hit Dice are spent separately (`spendHitDice`) — the player decides.
 */
export function restCharacter(sessionId: string, characterId: string, kind: RestKind): RestOutcome | null {
  const c = getCharacter(characterId);
  if (!c || c.sessionId !== sessionId) return null;
  const out: RestOutcome = { characterId, name: c.name, restored: [] };
  if (isDeadEntity('pc', c)) return { ...out, skipped: 'dead' };
  if (kind === 'long' && c.curHp <= 0) return { ...out, skipped: 'down' };

  const resources = restCounters(c.resources, kind, c.className, c.level);
  const slots = restCounters(c.spellSlots, kind, c.className, c.level, isPactCaster(c.className));
  for (const [name, next] of Object.entries(resources))
    out.restored.push(`${name} ${left(c.resources[name])}→${left(next)}`);
  for (const [key, next] of Object.entries(slots))
    out.restored.push(`${key} slots ${left(c.spellSlots[key])}→${left(next)}`);
  if (Object.keys(resources).length || Object.keys(slots).length) {
    db.prepare('UPDATE characters SET resources = ?, spell_slots = ? WHERE id = ?').run(
      JSON.stringify({ ...c.resources, ...resources }),
      JSON.stringify({ ...c.spellSlots, ...slots }),
      characterId,
    );
  }

  // Limited-use abilities: a "recharges after a Short or Long Rest" one comes back
  // on either; everything (incl. "Recharge 5–6") is ready after a Long Rest.
  let readied = 0;
  const abilities = c.sheetAbilities.map((a) => {
    if (!a.recharge?.spent) return a;
    if (kind === 'short' && a.recharge.rest !== 'short') return a;
    readied++;
    const { spent: _spent, ...ready } = a.recharge;
    return { ...a, recharge: ready };
  });
  if (readied) {
    db.prepare('UPDATE characters SET sheet_abilities = ? WHERE id = ?').run(JSON.stringify(abilities), characterId);
    out.restored.push(`${readied} limited-use ${readied === 1 ? 'ability' : 'abilities'} ready`);
  }

  if (kind === 'long') {
    if ((c.hitDiceUsed ?? 0) > 0) {
      out.restored.push(`Hit Dice ${hitDiceLeft(c)}→${Math.max(1, c.level)}`);
      db.prepare('UPDATE characters SET hit_dice_used = 0 WHERE id = ?').run(characterId);
    }
    // Healing goes through the ordinary HP path, so the token pops a +X floater.
    if (c.curHp < c.maxHp) {
      applyDamageNoted('pc', characterId, -(c.maxHp - c.curHp));
      out.restored.push(`HP ${c.curHp}→${c.maxHp}`);
    }
    if (c.tempHp > 0) {
      updateCharacter(characterId, { tempHp: 0 });
      out.restored.push('temp HP ends');
    }
  }
  return out;
}

/** Rest the whole party (every PC in the session). */
export function partyRest(sessionId: string, kind: RestKind): RestOutcome[] {
  return listCharacters(sessionId)
    .map((c) => restCharacter(sessionId, c.id, kind))
    .filter((o): o is RestOutcome => !!o);
}

/** One line per character for the chat summary. */
export function describeRest(kind: RestKind, outcomes: RestOutcome[]): string {
  const title = kind === 'long' ? '🏕 Long Rest' : '☕ Short Rest';
  const lines = outcomes.map((o) =>
    o.skipped === 'dead' ? `${o.name}: dead — no rest`
      : o.skipped === 'down' ? `${o.name}: at 0 HP — a Long Rest needs at least 1 HP`
        : `${o.name}: ${o.restored.length ? o.restored.join(', ') : 'nothing to recover'}`);
  const tip = kind === 'short' ? '\nSpend Hit Dice from your character sheet to heal.' : '';
  return `${title}\n${lines.join('\n')}${tip}`;
}

export type HitDiceResult = { ok: true; healed: number; spent: number } | { ok: false; reason: string };

/**
 * Spend `count` Hit Dice: roll them (on the physical dice when live), heal each
 * face + CON modifier (minimum 1 per die, 2024), and log it with a dice reveal.
 * Soft rules like the rest of the app: usable any time, never blocked by a
 * rest prompt — but never more dice than are left, and never for the dead.
 */
export function spendHitDice(sessionId: string, roller: string, characterId: string, count: number): HitDiceResult {
  const c = getCharacter(characterId);
  if (!c || c.sessionId !== sessionId) return { ok: false, reason: 'Character not found.' };
  if (isDeadEntity('pc', c)) return { ok: false, reason: `${c.name} is dead; Hit Dice can't heal them.` };
  const available = hitDiceLeft(c);
  const n = Math.min(Math.max(1, Math.floor(count)), available);
  if (available <= 0) return { ok: false, reason: `${c.name} has no Hit Dice left — a Long Rest restores them.` };
  if (c.curHp >= c.maxHp) return { ok: false, reason: `${c.name} is already at full HP.` };
  const die = hitDieFor(c.className);
  const result = rollDice(`${n}d${die}`);
  if (!result) return { ok: false, reason: 'The Hit Dice could not be rolled.' };
  const con = abilityMod(effectiveStats(c as Character).scores.CON ?? c.stats.CON ?? 10);
  const healed = result.rolls.reduce((sum, face) => sum + hitDieHealing(face, con), 0);
  db.prepare('UPDATE characters SET hit_dice_used = ? WHERE id = ?').run((c.hitDiceUsed ?? 0) + n, characterId);
  const hpNote = applyDamageNoted('pc', characterId, -healed);
  const conText = con ? ` ${con > 0 ? '+' : '−'} ${Math.abs(con)} CON each` : '';
  addRollLog(sessionId, {
    roller,
    label: 'Hit Dice',
    expr: `${n}d${die}`,
    total: healed,
    detail: `${c.name} spends ${n} Hit ${n === 1 ? 'Die' : 'Dice'} (d${die}): ${result.rolls.join(' + ')}${conText} → +${healed} HP · ${available - n}/${Math.max(1, c.level)} left`,
    hpNote,
    reveal: {
      ...diceReveal(c.name, result, `${c.name} — Hit Dice`),
      damage: healed,
      damageMods: [
        ...(diceReveal(c.name, result).damageMods ?? []),
        ...(healed !== result.total ? [{ label: con ? 'CON per die (min 1)' : 'Minimum 1 per die', value: healed - result.total }] : []),
      ],
    },
  });
  return { ok: true, healed, spent: n };
}
