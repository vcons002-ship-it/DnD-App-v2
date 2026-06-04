import type { AuraColor, Condition } from '../../../shared/types';

/** Standard 5e conditions (all negative → red aura). */
export const STANDARD_CONDITIONS = [
  'Blinded',
  'Charmed',
  'Deafened',
  'Frightened',
  'Grappled',
  'Incapacitated',
  'Invisible',
  'Paralyzed',
  'Petrified',
  'Poisoned',
  'Prone',
  'Restrained',
  'Stunned',
  'Unconscious',
];

/**
 * Resolve the strongest aura among a set of conditions, in priority order:
 * red (negative) > green (buff) > blue (concentration). Returns null if none.
 */
export function dominantAura(conditions: Condition[]): AuraColor | null {
  if (conditions.some((c) => c.aura === 'red')) return 'red';
  if (conditions.some((c) => c.aura === 'green')) return 'green';
  if (conditions.some((c) => c.aura === 'blue' || c.isConcentration)) return 'blue';
  return null;
}

export const AURA_HEX: Record<AuraColor, string> = {
  red: '#e23b3b',
  green: '#39c46b',
  blue: '#3b82f6',
};
