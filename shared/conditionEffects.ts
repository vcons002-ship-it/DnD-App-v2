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
 */
export function attackAdvantage(
  attackerLabels: string[],
  targetLabels: string[],
  weaponKind: 'melee' | 'ranged',
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
    weaponKind === 'melee' ? adv.push('prone target (melee)') : dis.push('prone target (ranged)');

  // Disadvantage for the attacker.
  for (const c of ['blinded', 'poisoned', 'prone', 'restrained', 'frightened'])
    if (a.has(c)) dis.push(`attacker ${c}`);
  if (t.has('invisible')) dis.push('target invisible');

  return resolve(adv, dis, manual);
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
