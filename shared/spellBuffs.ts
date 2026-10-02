// Spell benefits are derived from live conditions, never written into a saved
// creature's base statistics. Ending a spell therefore removes its benefits
// without undoing equipment bonuses or a DM's subsequent sheet edits.
import type { Condition } from './types.js';

export type SpellBuffSource = { conditions?: readonly Condition[]; speed?: string };
const label = (value: string): string => value.trim().toLowerCase();

export function hasHasteLethargy(source: SpellBuffSource): boolean {
  return (source.conditions ?? []).some(c => label(c.label) === 'haste lethargy');
}

/** Existing saved Haste chips remain valid; a second casting never stacks. */
export function activeHasteCondition(source: SpellBuffSource): Condition | undefined {
  if (hasHasteLethargy(source)) return undefined;
  return (source.conditions ?? []).find(c => label(c.label) === 'haste' &&
    (!c.combatEffect || label(c.combatEffect.spell) === 'haste'));
}

export const hasteAcBonus = (source: SpellBuffSource): number => activeHasteCondition(source) ? 2 : 0;

function holdPersonCondition(source: SpellBuffSource): Condition | undefined {
  return (source.conditions ?? []).find(c => label(c.label) === 'paralyzed' &&
    label(c.combatEffect?.spell ?? '') === 'hold person' &&
    (c.combatEffect?.castId || c.combatEffect?.concentration));
}

/** Only the newly automated spell conditions enforce action restrictions. Other
 * manual conditions retain the app's existing table-managed action economy. */
export function spellActionBlock(source: SpellBuffSource): string | undefined {
  if (hasHasteLethargy(source)) return 'Haste lethargy';
  return holdPersonCondition(source) ? 'Hold Person paralysis' : undefined;
}

/** The popup and rejected-action notices share the live recovery timing. */
export function spellActionRecoveryMessage(source: SpellBuffSource, { inCombat = true }: { inCombat?: boolean } = {}): string | undefined {
  const lethargy = (source.conditions ?? []).filter(c => label(c.label) === 'haste lethargy');
  const held = !!holdPersonCondition(source);
  if (lethargy.length) {
    const when = inCombat
      ? lethargy.every(c => c.combatEffect?.lethargyTurnStarted) ? 'at the end of this turn' : 'at the end of your next turn'
      : 'after a brief recovery period (about 6 seconds)';
    return held
      ? `Haste lethargy ends ${when}. Hold Person also needs a successful Wisdom save at the end of your turn or the spell to end.`
      : `Recover ${when}.`;
  }
  return held ? 'Recover on a successful Wisdom save at the end of your turn, or when Hold Person ends.' : undefined;
}

export function spellActionBlockMessage(source: SpellBuffSource, options: { inCombat?: boolean } = {}): string | undefined {
  const recovery = spellActionRecoveryMessage(source, options);
  if (!recovery) return undefined;
  if (hasHasteLethargy(source)) return `Haste ended. Lethargy blocks movement, attacks, and spells. ${holdPersonCondition(source) ? 'Hold Person also keeps you Paralyzed. ' : ''}${recovery}`;
  return `Hold Person has you Paralyzed. Movement, attacks, and spells are blocked. ${recovery}`;
}

const ZERO_SPEED = new Set(['grappled', 'restrained', 'paralyzed', 'petrified', 'unconscious', 'haste lethargy']);
export function speedIsZero(source: SpellBuffSource): boolean {
  return (source.conditions ?? []).some(c => ZERO_SPEED.has(label(c.label)));
}

/** Preserve movement modes/notes while doubling each stated speed for Haste. */
export function effectiveSpeed(source: SpellBuffSource): string {
  if (speedIsZero(source)) return '0 ft.';
  const speed = source.speed ?? '';
  if (!activeHasteCondition(source)) return speed;
  return speed.replace(/(\d+(?:\.\d+)?)\s*(ft\.?|feet)\b/gi,
    (_match, feet: string, unit: string) => `${Number(feet) * 2} ${unit}`);
}

/** The walking allowance used by movement hints; unknown speeds stay unknown. */
export function walkingSpeedFeet(source: SpellBuffSource): number | undefined {
  if (speedIsZero(source)) return 0;
  const match = effectiveSpeed(source).match(/^\s*(?:speed\s*:?\s*)?(\d+(?:\.\d+)?)\s*(?:ft\.?|feet)\b/i);
  return match ? Number(match[1]) : undefined;
}
