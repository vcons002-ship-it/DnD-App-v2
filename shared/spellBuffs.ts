// Spell benefits are derived from live conditions, never written into a saved
// creature's base statistics. Ending a spell therefore removes its benefits
// without undoing equipment bonuses or a DM's subsequent sheet edits.
import type { Condition } from './types.js';
import {activeCommand,commandInstruction} from './commandSpell.js';

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
export const shieldAcBonus = (source: SpellBuffSource): number => (source.conditions??[]).some(c=>c.label==='Shield'&&c.combatEffect?.spell==='Shield')?5:0;
export const isHypnotized = (source:SpellBuffSource):boolean => (source.conditions??[]).some(c=>c.label==='Hypnotic Pattern'&&c.combatEffect?.spell==='Hypnotic Pattern');

function holdPersonCondition(source: SpellBuffSource): Condition | undefined {
  return (source.conditions ?? []).find(c => label(c.label) === 'paralyzed' &&
    ['hold person','hold monster'].includes(label(c.combatEffect?.spell ?? '')) &&
    (c.combatEffect?.castId || c.combatEffect?.concentration));
}

/** Only the newly automated spell conditions enforce action restrictions. Other
 * manual conditions retain the app's existing table-managed action economy. */
export function spellActionBlock(source: SpellBuffSource): string | undefined {
  const command=activeCommand(source);if(command)return `Command: ${command.combatEffect!.commandWord}`;
  if(isHypnotized(source))return 'Hypnotic Pattern';
  if (hasHasteLethargy(source)) return 'Haste lethargy';
  return holdPersonCondition(source) ? `${holdPersonCondition(source)!.combatEffect!.spell} paralysis` : undefined;
}

/** The popup and rejected-action notices share the live recovery timing. */
export function spellActionRecoveryMessage(source: SpellBuffSource, { inCombat = true }: { inCombat?: boolean } = {}): string | undefined {
  if(isHypnotized(source))return 'Recover when you take damage, another creature uses an action to shake you awake, or the spell ends.';
  const lethargy = (source.conditions ?? []).filter(c => label(c.label) === 'haste lethargy');
  const held = !!holdPersonCondition(source);
  const holdName=holdPersonCondition(source)?.combatEffect?.spell??'Hold Person';
  if (lethargy.length) {
    const when = inCombat
      ? lethargy.every(c => c.combatEffect?.lethargyTurnStarted) ? 'at the end of this turn' : 'at the end of your next turn'
      : 'after a brief recovery period (about 6 seconds)';
    return held
      ? `Haste lethargy ends ${when}. ${holdName} also needs a successful Wisdom save at the end of your turn or the spell to end.`
      : `Recover ${when}.`;
  }
  return held ? `Recover on a successful Wisdom save at the end of your turn, or when ${holdName} ends.` : undefined;
}

export function spellActionBlockMessage(source: SpellBuffSource, options: { inCombat?: boolean } = {}): string | undefined {
  const command=activeCommand(source);if(command)return `Command: ${command.combatEffect!.commandWord}. ${commandInstruction(command.combatEffect!.commandWord!)} Attacks and spells are blocked until the end of this turn.`;
  if(isHypnotized(source))return `Hypnotic Pattern has you Charmed and Incapacitated. Movement, attacks, and spells are blocked. ${spellActionRecoveryMessage(source,options)}`;
  const recovery = spellActionRecoveryMessage(source, options);
  if (!recovery) return undefined;
  if (hasHasteLethargy(source)) return `Haste ended. Lethargy blocks movement, attacks, and spells. ${holdPersonCondition(source) ? `${holdPersonCondition(source)!.combatEffect!.spell} also keeps you Paralyzed. ` : ''}${recovery}`;
  return `${holdPersonCondition(source)?.combatEffect?.spell} has you Paralyzed. Movement, attacks, and spells are blocked. ${recovery}`;
}

const ZERO_SPEED = new Set(['grappled', 'restrained', 'paralyzed', 'petrified', 'unconscious', 'haste lethargy']);
export function speedIsZero(source: SpellBuffSource): boolean {
  const command=activeCommand(source);if(command&&(command.combatEffect!.commandResolved||['Halt','Grovel','Drop'].includes(command.combatEffect!.commandWord!)))return true;
  if(isHypnotized(source))return true;
  return (source.conditions ?? []).some(c => ZERO_SPEED.has(label(c.label)));
}

/** Preserve movement modes/notes while doubling each stated speed for Haste. */
export function effectiveSpeed(source: SpellBuffSource): string {
  if (speedIsZero(source)) return '0 ft.';
  const speed = source.speed ?? '';
  const reduction=Math.max(0,...(source.conditions??[]).map(c=>c.combatEffect?.speedReduction??0));
  if (!activeHasteCondition(source) && !reduction) return speed;
  return speed.replace(/(\d+(?:\.\d+)?)\s*(ft\.?|feet)\b/gi,
    (_match, feet: string, unit: string) => `${Math.max(0,Number(feet) * (activeHasteCondition(source)?2:1)-reduction)} ${unit}`);
}

/** The walking allowance used by movement hints; unknown speeds stay unknown. */
export function walkingSpeedFeet(source: SpellBuffSource): number | undefined {
  if (speedIsZero(source)) return 0;
  const match = effectiveSpeed(source).match(/^\s*(?:speed\s*:?\s*)?(\d+(?:\.\d+)?)\s*(?:ft\.?|feet)\b/i);
  return match ? Number(match[1]) : undefined;
}
