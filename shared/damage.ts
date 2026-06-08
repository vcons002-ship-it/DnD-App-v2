/**
 * The canonical 5e damage types, offered as a set list wherever a damage type is
 * entered (weapons, spells, monster actions). The "magical" types (force,
 * radiant, necrotic, psychic) are included alongside the physical/elemental ones.
 * Framework-free so both client and server can import it.
 */
export const DAMAGE_TYPES = [
  'acid',
  'bludgeoning',
  'cold',
  'fire',
  'force',
  'lightning',
  'necrotic',
  'piercing',
  'poison',
  'psychic',
  'radiant',
  'slashing',
  'thunder',
] as const;

export type DamageType = (typeof DAMAGE_TYPES)[number];

/** True if `t` is one of the canonical damage types (case-insensitive). */
export function isDamageType(t: string | undefined): t is DamageType {
  return !!t && (DAMAGE_TYPES as readonly string[]).includes(t.trim().toLowerCase());
}
