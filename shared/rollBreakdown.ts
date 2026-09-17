import type { RevealStep, RollEntry } from './types.js';

const signed = (value: number) => value < 0 ? `−${Math.abs(value)}` : `+${value}`;
function modifierLabel(label: string): string {
  switch (label) {
    case '': return 'Modifier';
    case 'flat': return 'Flat';
    case 'bonus': return 'Bonus / adjustment';
    case 'resisted': return 'Resistance';
    case 'vuln': return 'Vulnerability';
    default: return label;
  }
}

function diceText(step: RevealStep): string {
  // Some older spell steps contain an entire expression (1d4+1), with its
  // flat term already included in value. Keep that formula intact: never add
  // the difference between faces and value a second time or infer its source.
  const faces = step.faces?.length ? ` [${step.faces.join(', ')}]` : '';
  return `${step.label || 'Dice'}${faces} = ${step.value}`;
}

/** A visible, read-only account of damage already resolved by the server.
 * Pass the role-shaped entry, never a private/unfiltered server record. */
export function damageRollBreakdown(entry: RollEntry): string | null {
  const reveal = entry.reveal;
  // Pending hits carry precomputed private dice. Do not read or disclose them.
  // Plain /roll and heal/check reveals reuse damage fields but aren't damage.
  if ((entry.pending && !entry.pending.done) || !reveal ||
      (reveal.kind && reveal.kind !== 'attack' && reveal.kind !== 'damage') ||
      typeof reveal.damage !== 'number' || !Number.isFinite(reveal.damage)) return null;
  const dice = reveal.damageBreakdown?.dice ?? reveal.damageDice ?? [];
  const mods = reveal.damageBreakdown?.mods ?? reveal.damageMods ?? [];
  if (!dice.length && !mods.length) return null;
  const parts = [
    ...dice.map(diceText),
    ...mods.map(step => `${modifierLabel(step.label)}${step.faces?.length ? ` [${step.faces.join(', ')}]` : ''} ${signed(step.value)}`),
  ];
  const itemized = [...dice, ...mods].reduce((total, step) => total + step.value, 0);
  // Preserve the final recorded damage even if a legacy record omitted a
  // clamp/adjustment. No invented die faces or guessed resistance/bonus label.
  if (itemized !== reveal.damage) parts.push(`Unitemized ${signed(reveal.damage - itemized)}`);
  const type = !reveal.damageBreakdown?.mixedTypes && reveal.damageType ? ` ${reveal.damageType}` : '';
  return `Damage: ${parts.join(' · ')} → ${reveal.damage}${type}`;
}
