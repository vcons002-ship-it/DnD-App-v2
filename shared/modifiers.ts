// Framework-free helpers for the character "modifier" system: a base ability
// score (kept in Character.stats) plus named adjustments from feats/ASIs (on the
// character) and magic items (on equipped InventoryItems). Effective score =
// base + matching ability modifiers; flat save/skill/attack/AC bonuses layer on
// at roll time. Pure + unit-tested; the server computes the authoritative math.

import type { InventoryItem, ModTarget, SheetModifier, Weapon } from './types.js';
import type { AbilityKey } from './skills.js';
import { rollDice } from './dice.js';

const ABILITIES: AbilityKey[] = ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'];

/** The minimal character shape these helpers need (so they're easy to test). */
export type ModSource = {
  stats?: Record<string, number>;
  armorClass?: number;
  modifiers?: SheetModifier[];
  items?: InventoryItem[];
};

/** A modifier the math can safely evaluate (old DB rows / imports may hold
 *  anything — a malformed entry must degrade to "ignored", never throw). */
const usable = (m: SheetModifier): boolean =>
  !!m &&
  typeof m === 'object' &&
  !!m.target &&
  typeof m.target === 'object' &&
  typeof m.target.kind === 'string' &&
  Number.isFinite(m.value);

/**
 * Every modifier currently in effect: the character's own permanent modifiers
 * plus those from EQUIPPED items (an item's modifiers do nothing until it's
 * equipped/attuned). An item modifier with a blank `source` falls back to the
 * item's name so the tooltip/log always names where the bonus came from.
 * Malformed entries (bad imports, hand-edited saves) are silently skipped.
 */
export function activeModifiers(c: ModSource): SheetModifier[] {
  const own = Array.isArray(c.modifiers) ? c.modifiers : [];
  const fromItems = (Array.isArray(c.items) ? c.items : [])
    .filter((it) => it?.equipped && Array.isArray(it.modifiers))
    .flatMap((it) =>
      it.modifiers!.map((m) =>
        usable(m) ? { ...m, source: m.source || it.name } : m,
      ),
    );
  return [...own, ...fromItems].filter(usable);
}

export type StatBreakdown = {
  base: number;
  parts: { source: string; value: number; set?: boolean }[];
  total: number;
};

/**
 * Effective ability scores = base + ability-target modifiers, with a per-ability
 * breakdown for the stat-math tooltip. Only abilities the creature actually has
 * a base score for are included (never fabricates scores). A `set` modifier
 * floors the score at its value AFTER bonuses ("your Strength is 19") — it only
 * appears in the breakdown when it actually raised the score.
 */
export function effectiveStats(c: ModSource): {
  scores: Record<string, number>;
  breakdown: Record<string, StatBreakdown>;
} {
  const mods = activeModifiers(c);
  const scores: Record<string, number> = {};
  const breakdown: Record<string, StatBreakdown> = {};
  for (const ab of ABILITIES) {
    const base = c.stats?.[ab];
    if (base === undefined) continue;
    const forAb = mods.filter(
      (m) => m.target.kind === 'ability' && m.target.ability === ab,
    );
    const parts: StatBreakdown['parts'] = forAb
      .filter((m) => !m.set)
      .map((m) => ({ source: m.source, value: m.value }));
    let total = base + parts.reduce((s, p) => s + p.value, 0);
    const floor = forAb
      .filter((m) => m.set)
      .reduce<{ source: string; value: number } | null>(
        (best, m) => (m.value > (best?.value ?? -Infinity) ? m : best),
        null,
      );
    if (floor && floor.value > total) {
      parts.push({ source: floor.source, value: floor.value, set: true });
      total = floor.value;
    }
    scores[ab] = total;
    breakdown[ab] = { base, parts, total };
  }
  return { scores, breakdown };
}

/** Effective AC = base armorClass + AC-target modifiers. */
export function effectiveAc(c: ModSource): number {
  return (
    (c.armorClass ?? 0) +
    activeModifiers(c)
      .filter((m) => m.target.kind === 'ac')
      .reduce((s, m) => s + m.value, 0)
  );
}

/** Sum + named parts of the modifiers whose target matches `pred`. */
function extras(
  c: ModSource,
  pred: (t: ModTarget) => boolean,
): { total: number; parts: { source: string; value: number }[] } {
  const parts = activeModifiers(c)
    .filter((m) => pred(m.target))
    .map((m) => ({ source: m.source, value: m.value }));
  return { total: parts.reduce((s, p) => s + p.value, 0), parts };
}

/** Flat bonus to a saving throw for `ability` (matches that save or all-saves). */
export function saveExtra(c: ModSource, ability: string) {
  const ab = ability.trim().toUpperCase();
  return extras(c, (t) => t.kind === 'save' && (!t.ability || t.ability === ab));
}

/** Flat bonus to a skill check (matches that skill or all-skills). */
export function skillExtra(c: ModSource, skillName: string) {
  const sk = skillName.trim().toLowerCase();
  return extras(
    c,
    (t) => t.kind === 'skill' && (!t.skill || t.skill.trim().toLowerCase() === sk),
  );
}

/** Flat bonus to every attack roll. */
export function attackExtra(c: ModSource) {
  return extras(c, (t) => t.kind === 'attack');
}

/** Flat bonus to initiative (the DEX mod already flows via effectiveStats). */
export function initiativeExtra(c: ModSource) {
  return extras(c, (t) => t.kind === 'initiative');
}

/**
 * Validate untrusted modifier data (AI output, library REST bodies) into clean
 * `SheetModifier`s: unknown kinds/abilities and non-numeric values are dropped,
 * values are clamped to ±30, ids are assigned, `set` only survives on ability
 * targets, and the `slot` (feat/ASI) flag is preserved so the feat cap can count
 * it. Returns [] for anything that isn't an array.
 */
export function sanitizeModifiers(
  raw: unknown,
  newId: () => string = () =>
    `m${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`,
): SheetModifier[] {
  if (!Array.isArray(raw)) return [];
  const out: SheetModifier[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const e = entry as Record<string, unknown>;
    const t = (e.target ?? {}) as Record<string, unknown>;
    const kind = String(t.kind ?? '');
    const ability = String(t.ability ?? '').trim().toUpperCase() as AbilityKey;
    const skill = String(t.skill ?? '').trim();
    let target: ModTarget;
    if (kind === 'ability' && ABILITIES.includes(ability)) {
      target = { kind: 'ability', ability };
    } else if (kind === 'save') {
      target = ABILITIES.includes(ability) ? { kind: 'save', ability } : { kind: 'save' };
    } else if (kind === 'skill') {
      target = skill ? { kind: 'skill', skill } : { kind: 'skill' };
    } else if (kind === 'attack' || kind === 'ac' || kind === 'initiative') {
      target = { kind };
    } else {
      continue;
    }
    const value = Math.max(-30, Math.min(30, Math.round(Number(e.value))));
    if (!Number.isFinite(value) || value === 0) continue;
    out.push({
      id: typeof e.id === 'string' && e.id ? e.id : newId(),
      source: String(e.source ?? '').trim(),
      target,
      value,
      ...(e.set && target.kind === 'ability' ? { set: true } : {}),
      ...(e.slot ? { slot: true } : {}),
    });
  }
  return out;
}

/**
 * Validate an untrusted inventory-item list (socket payloads, REST bodies, JSON
 * sheet imports) — nameless/garbled entries are dropped, qty is clamped to a
 * non-negative integer, and nested `modifiers` go through sanitizeModifiers.
 */
export function sanitizeItems(
  raw: unknown,
  newId: () => string = () =>
    `i${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`,
): InventoryItem[] {
  if (!Array.isArray(raw)) return [];
  const out: InventoryItem[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const e = entry as Record<string, unknown>;
    const name = String(e.name ?? '').trim();
    if (!name) continue;
    const modifiers = sanitizeModifiers(e.modifiers, newId);
    out.push({
      id: typeof e.id === 'string' && e.id ? e.id : newId(),
      name,
      qty: Number.isFinite(Number(e.qty)) ? Math.max(0, Math.round(Number(e.qty))) : 1,
      note: typeof e.note === 'string' ? e.note : '',
      ...(modifiers.length ? { modifiers } : {}),
      ...(e.equipped ? { equipped: true } : {}),
    });
  }
  return out;
}

/** A dice string the roller can actually evaluate (empty/garbled → not kept). */
const validDice = (s: unknown): s is string =>
  typeof s === 'string' && s.trim() !== '' && rollDice(s) !== null;

/**
 * Validate an untrusted weapon list (JSON sheet imports, hand-edited saves,
 * socket payloads) before it feeds the server's authoritative roll math: dice
 * expressions must actually parse (so a bad "100d1000" can't reach rollDice),
 * to-hit / magic bonuses are clamped and rounded, the attack ability is checked
 * against the six scores, and strings are length-capped. Nameless entries drop.
 */
export function sanitizeWeapons(raw: unknown): Weapon[] {
  if (!Array.isArray(raw)) return [];
  const out: Weapon[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const e = entry as Record<string, unknown>;
    const name = String(e.name ?? '').trim().slice(0, 80);
    if (!name) continue;
    const w: Weapon = { name, kind: e.kind === 'ranged' ? 'ranged' : 'melee' };
    if (validDice(e.damage)) w.damage = (e.damage as string).trim();
    if (validDice(e.versatileDamage)) w.versatileDamage = (e.versatileDamage as string).trim();
    if (validDice(e.extraDamage)) w.extraDamage = (e.extraDamage as string).trim();
    if (typeof e.damageType === 'string' && e.damageType.trim())
      w.damageType = e.damageType.trim().slice(0, 30);
    if (typeof e.extraDamageType === 'string' && e.extraDamageType.trim())
      w.extraDamageType = e.extraDamageType.trim().slice(0, 30);
    if (typeof e.range === 'string' && e.range.trim()) w.range = e.range.trim().slice(0, 40);
    const ab = Number(e.attackBonus);
    if (Number.isFinite(ab)) w.attackBonus = Math.max(-20, Math.min(20, Math.round(ab)));
    const mb = Number(e.magicBonus);
    if (Number.isFinite(mb) && Math.round(mb) !== 0)
      w.magicBonus = Math.max(-10, Math.min(10, Math.round(mb)));
    const aa = String(e.attackAbility ?? '').trim().toUpperCase();
    if (ABILITIES.includes(aa as AbilityKey)) w.attackAbility = aa as Weapon['attackAbility'];
    if (Array.isArray(e.tags)) {
      const tags = e.tags
        .filter((t): t is string => typeof t === 'string')
        .map((t) => t.trim().toLowerCase().slice(0, 30))
        .filter(Boolean)
        .slice(0, 20);
      if (tags.length) w.tags = tags;
    }
    if (e.diceOnly) w.diceOnly = true;
    out.push(w);
  }
  return out;
}

/** Human label for a modifier target, e.g. "STR", "all saves", "Stealth", "AC". */
export function targetLabel(t: ModTarget): string {
  switch (t.kind) {
    case 'ability':
      return t.ability;
    case 'save':
      return t.ability ? `${t.ability} save` : 'all saves';
    case 'skill':
      return t.skill || 'all skills';
    case 'attack':
      return 'attack rolls';
    case 'ac':
      return 'AC';
    case 'initiative':
      return 'initiative';
  }
}
