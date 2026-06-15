// 5e condition mechanics → advantage/disadvantage on attack rolls and saves.
// Framework-free so the SERVER applies it authoritatively (clients never decide
// combat numbers). Deliberately a CONSERVATIVE subset: only the unambiguous,
// position-independent cases — we don't track line-of-sight or exact range, so
// effects that depend on those (e.g. a hidden attacker, frightened line-of-sight)
// use the simple reading. Matched against a condition's `label`, case-insensitive.
import type { Advantage } from './combatMath.js';

const norm = (labels: string[]): Set<string> =>
  new Set(labels.map((l) => l.trim().toLowerCase()));

export type AdvResult = { state?: Advantage; reasons: string[] };

/**
 * Fold all advantage/disadvantage sources into one result using the 5e rule:
 * multiple advantages don't stack, and ANY disadvantage cancels ANY advantage to
 * a straight roll. `manual` (a UI-requested adv/dis) is just another source.
 */
function resolve(
  advReasons: string[],
  disReasons: string[],
  manual?: Advantage,
): AdvResult {
  if (manual === 'adv') advReasons = [...advReasons, 'requested adv'];
  if (manual === 'dis') disReasons = [...disReasons, 'requested dis'];
  const hasAdv = advReasons.length > 0;
  const hasDis = disReasons.length > 0;
  if (hasAdv && hasDis)
    return { state: undefined, reasons: [...advReasons, ...disReasons, 'cancel'] };
  if (hasAdv) return { state: 'adv', reasons: advReasons };
  if (hasDis) return { state: 'dis', reasons: disReasons };
  return { state: undefined, reasons: [] };
}

/**
 * Net advantage on an attack roll from the attacker's and target's conditions,
 * combined with any manually-requested adv/dis. `weaponKind` splits prone: a
 * melee attacker has advantage against a prone target, a ranged attacker has
 * disadvantage.
 *
 * `within5ft` is the real distance check (the first location-based mechanic): a
 * prone target grants ADVANTAGE to an attacker within 5 ft (any weapon) and
 * DISADVANTAGE from beyond it — so a ranged attacker standing adjacent still gets
 * advantage, and a melee attacker is always within reach.
 */
export function attackAdvantage(
  attackerLabels: string[],
  targetLabels: string[],
  within5ft: boolean,
  manual?: Advantage,
): AdvResult {
  const a = norm(attackerLabels);
  const t = norm(targetLabels);
  const adv: string[] = [];
  const dis: string[] = [];

  // Advantage for the attacker.
  if (a.has('invisible')) adv.push('attacker invisible');
  for (const c of ['blinded', 'restrained', 'paralyzed', 'stunned', 'unconscious', 'petrified'])
    if (t.has(c)) adv.push(`target ${c}`);
  if (t.has('prone'))
    within5ft ? adv.push('prone target (within 5 ft)') : dis.push('prone target (beyond 5 ft)');

  // Disadvantage for the attacker.
  for (const c of ['blinded', 'poisoned', 'prone', 'restrained', 'frightened'])
    if (a.has(c)) dis.push(`attacker ${c}`);
  if (t.has('invisible')) dis.push('target invisible');

  return resolve(adv, dis, manual);
}

/** Paralyzed/Unconscious creatures suffer an AUTOMATIC CRITICAL HIT from any
 *  attacker within 5 ft. Returns the condition causing it (for the log) or null. */
const AUTO_CRIT_WITHIN_5 = ['paralyzed', 'unconscious'];
export function autoCritFromConditions(targetLabels: string[], within5ft: boolean): string | null {
  if (!within5ft) return null;
  const t = norm(targetLabels);
  return AUTO_CRIT_WITHIN_5.find((c) => t.has(c)) ?? null;
}

/**
 * Conditions a label implies and should auto-apply alongside it (5e): the
 * incapacitating conditions all include Incapacitated, and Unconscious also
 * drops the creature Prone. Used so applying one chip cascades the bundle.
 */
const IMPLIED: Record<string, string[]> = {
  unconscious: ['Incapacitated', 'Prone'],
  paralyzed: ['Incapacitated'],
  stunned: ['Incapacitated'],
  petrified: ['Incapacitated'],
};
export function impliedConditions(label: string): string[] {
  return IMPLIED[label.trim().toLowerCase()] ?? [];
}

/**
 * Net advantage on a saving throw from the creature's own conditions, combined
 * with any manually-requested adv/dis. Conservative: restrained → disadvantage
 * on DEX saves (no auto-fails).
 */
export function saveAdvantage(
  labels: string[],
  ability: string,
  manual?: Advantage,
): AdvResult {
  const s = norm(labels);
  const dis: string[] = [];
  if (s.has('restrained') && ability.toUpperCase() === 'DEX') dis.push('restrained (DEX)');
  return resolve([], dis, manual);
}

/** Conditions that make a creature AUTOMATICALLY FAIL Strength & Dexterity saves
 *  (no roll): Paralyzed, Stunned, Unconscious, Petrified. Returns the condition
 *  label causing it (for the log), or null if the save is rolled normally. */
const AUTO_FAIL_STR_DEX = ['paralyzed', 'stunned', 'unconscious', 'petrified'];
export function saveAutoFail(labels: string[], ability: string): string | null {
  const ab = ability.trim().toUpperCase();
  if (ab !== 'STR' && ab !== 'DEX') return null;
  const s = norm(labels);
  return AUTO_FAIL_STR_DEX.find((c) => s.has(c)) ?? null;
}

/**
 * Net advantage on an ABILITY/SKILL CHECK from the creature's conditions plus any
 * manual adv/dis. Conservative: Poisoned and Frightened impose disadvantage on
 * ability checks (Blinded/Deafened auto-fail only sense-specific checks we can't
 * detect, so those stay with the DM).
 */
export function checkAdvantage(labels: string[], manual?: Advantage): AdvResult {
  const s = norm(labels);
  const dis: string[] = [];
  for (const c of ['poisoned', 'frightened']) if (s.has(c)) dis.push(c);
  return resolve([], dis, manual);
}
