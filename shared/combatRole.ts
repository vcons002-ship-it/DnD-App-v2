// Derive a creature's at-a-glance battlefield role from its tagged data.
// Framework-free so both the server (snapshot shaping) and client can use it.
import type { CombatRole, CreatureAbility, Weapon } from './types.js';

const RANGED_RE =
  /\b(bow|crossbow|longbow|shortbow|sling|dart|javelin|thrown|ranged|blowgun|net|firebolt|fire bolt|ray\b)\b/i;
const CASTER_RE =
  /\b(spellcast\w*|cantrip|innate spellcasting|cast(s|ing)? (a )?spell|spell save dc|at will:)\b/i;
// Full casters only — half-casters (paladin/ranger) read better as martial.
const CASTER_CLASS_RE = /\b(wizard|sorcerer|warlock|cleric|druid|bard)\b/i;

type Derivable = {
  weapons?: Weapon[] | string[];
  actions?: CreatureAbility[];
  abilities?: CreatureAbility[];
  /** Character class name (PCs). */
  className?: string;
};

const text = (entries?: CreatureAbility[]): string =>
  (entries ?? []).map((e) => `${e.name} ${e.description}`).join(' ');

/**
 * Spellcasting wins (→ caster); otherwise any ranged weapon/attack (→ ranged);
 * otherwise melee. Works for monsters (Weapon[] + actions/abilities) and PCs
 * (string[] weapons + className).
 */
export function deriveCombatRole(c: Derivable): CombatRole {
  const prose = `${text(c.actions)} ${text(c.abilities)}`;
  if (CASTER_RE.test(prose) || CASTER_CLASS_RE.test(c.className ?? '')) {
    return 'caster';
  }

  const weapons = c.weapons ?? [];
  const hasRangedWeapon = weapons.some((w) =>
    typeof w === 'string' ? RANGED_RE.test(w) : w.kind === 'ranged',
  );
  if (hasRangedWeapon || RANGED_RE.test(prose)) return 'ranged';
  return 'melee';
}

/** Emoji badge for a combat role. */
export const COMBAT_ROLE_ICON: Record<CombatRole, string> = {
  melee: '⚔️',
  ranged: '🏹',
  caster: '✨',
};
