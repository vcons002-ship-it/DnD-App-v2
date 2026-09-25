// Smite spells (2024 Divine Smite): which ways a character can cast one right
// now, and what dice it rolls. Framework-free and shared, so the server's
// validation and the client's buttons can never disagree about the options.
import type { Character, SheetAbility, SmiteSpec } from './types.js';

/** A spell-slot level, or the once-per-Long-Rest free casting. */
export type SmiteChoice = number | 'free';

type Caster = Pick<Character, 'className' | 'level' | 'spellSlots' | 'resources'>;

/** Whether the free casting is available: the right class at the right level,
 *  and its counter not yet spent (a missing counter = never used). */
export function freeSmiteAvailable(ch: Caster, spec: SmiteSpec): boolean {
  const free = spec.freeUse;
  if (!free) return false;
  const cls = new RegExp(`\\b${free.className}\\b`, 'i');
  if (!cls.test(ch.className ?? '') || (ch.level ?? 0) < free.minLevel) return false;
  const c = ch.resources?.[free.counter];
  return !c || c.used < Math.max(1, c.max);
}

/**
 * The ways this character can cast `ability`'s smite right now: 'free' first
 * when available, then every slot level at or above the spell's level that has
 * a slot left. Empty when it can't be cast at all.
 */
export function smiteChoices(ch: Caster, ability: SheetAbility): SmiteChoice[] {
  const spec = ability.smite;
  if (!spec) return [];
  const base = Math.max(1, ability.level ?? 1);
  const levels = Object.entries(ch.spellSlots ?? {})
    .map(([key, slot]) => ({ level: Number(/^L(\d)$/.exec(key)?.[1] ?? 0), slot }))
    .filter(({ level, slot }) => level >= base && slot.used < slot.max)
    .map(({ level }) => level)
    .sort((a, b) => a - b);
  return [...(freeSmiteAvailable(ch, spec) ? (['free'] as const) : []), ...levels];
}

/**
 * The dice terms a smite rolls at `level`: its base dice, one `scaleDice` per
 * level above the spell's own, and the bonus dice when the target's creature
 * type matches (Divine Smite: +1d8 vs undead and fiends). A crit rolls each
 * term twice — that's the caller's job.
 */
export function smiteDiceTerms(
  spec: SmiteSpec,
  spellLevel: number,
  castLevel: number,
  targetCreatureType?: string,
): string[] {
  const terms = [spec.dice];
  if (spec.scaleDice) for (let l = spellLevel; l < castLevel; l++) terms.push(spec.scaleDice);
  const type = (targetCreatureType ?? '').toLowerCase();
  if (spec.bonusVs && type && spec.bonusVs.creatureTypes.some((t) => type.includes(t.toLowerCase())))
    terms.push(spec.bonusVs.dice);
  return terms;
}
