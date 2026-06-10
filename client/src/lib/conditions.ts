import type { AuraColor, Condition } from '../../../shared/types';

/** Standard 5e conditions (all negative → red aura). "Dead" doubles as the DM's
 *  manual death mark: conditions reach players for every disposition tier, so it
 *  shows the skull even on enemies whose HP players can't see. */
export const STANDARD_CONDITIONS = [
  'Blinded',
  'Charmed',
  'Dead',
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
 * Which aura colors are present, as concentric rings (innermost first):
 * red (negative), green (buff), blue (concentration). A buff and a negative
 * status therefore show as two rings rather than one overriding the other.
 */
export function presentAuras(conditions: Condition[]): AuraColor[] {
  const auras: AuraColor[] = [];
  if (conditions.some((c) => c.aura === 'red')) auras.push('red');
  if (conditions.some((c) => c.aura === 'green')) auras.push('green');
  if (conditions.some((c) => c.aura === 'blue' || c.isConcentration))
    auras.push('blue');
  return auras;
}

export const AURA_HEX: Record<AuraColor, string> = {
  red: '#e23b3b',
  green: '#39c46b',
  blue: '#3b82f6',
};
