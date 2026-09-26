// "Update to current rules" for a saved sheet ability. The app never silently
// rewrites a character's features when the rules DB changes (e.g. Rage gaining
// its resistances, Divine Smite becoming a post-hit spell) — instead an entry
// that differs from the current DB definition offers an explicit update the
// player confirms. Framework-free so the rule is shared and unit-tested.
import type { SheetAbility } from './types.js';

/** The fields that DEFINE what an ability does (not its runtime state). */
const DEFINITION_FIELDS = [
  'type', 'level', 'roll', 'stance', 'mastery', 'maneuver', 'useCounter', 'smite', 'summon',
] as const;

/** Runtime state that must never make two definitions look different. */
function withoutRuntime(a: Partial<SheetAbility>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of DEFINITION_FIELDS) if (a[f] !== undefined) out[f] = a[f];
  if (a.stance) {
    const { active: _a, targetId: _t, ...rest } = a.stance;
    out.stance = rest;
  }
  if (a.mastery) {
    const { active: _a, ...rest } = a.mastery;
    out.mastery = rest;
  }
  if (a.maneuver) {
    const { active: _a, ...rest } = a.maneuver;
    out.maneuver = rest;
  }
  return out;
}

/** Stable JSON: object keys sorted, so key order never reads as a change. */
function stable(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`;
  if (v && typeof v === 'object')
    return `{${Object.keys(v as object)
      .sort()
      .filter((k) => (v as Record<string, unknown>)[k] !== undefined)
      .map((k) => `${JSON.stringify(k)}:${stable((v as Record<string, unknown>)[k])}`)
      .join(',')}}`;
  return JSON.stringify(v);
}

/** Whether a saved entry's DEFINITION differs from the current rules DB entry of
 *  the same name. Ids, on/off state, marks and prepared flags are ignored. */
export function isOutdated(saved: SheetAbility, current: Partial<SheetAbility>): boolean {
  return stable(withoutRuntime(saved)) !== stable(withoutRuntime(current));
}

/**
 * The saved entry rebuilt on the current definition: keeps its id and prepared
 * flag; takes the current type, level, text and mechanics. A stance, mastery or
 * maneuver comes back SWITCHED OFF — an update must never leave something armed
 * that nothing paid for (a spell-backed stance spends its slot when turned on).
 */
export function applyRulesUpdate(saved: SheetAbility, current: Partial<SheetAbility>): SheetAbility {
  const next: SheetAbility = {
    id: saved.id,
    name: saved.name,
    type: current.type ?? saved.type,
    description: current.description ?? saved.description,
    ...(saved.prepared !== undefined ? { prepared: saved.prepared } : {}),
  };
  const copy = [
    'level', 'school', 'classes', 'tags', 'meta', 'actionType', 'upcast',
    'roll', 'mastery', 'maneuver', 'stance', 'useCounter', 'summon', 'smite',
  ] as const;
  for (const f of copy) {
    if (current[f] !== undefined) (next as Record<string, unknown>)[f] = current[f];
  }
  if (next.stance) next.stance = { ...next.stance, active: false, targetId: undefined };
  if (next.mastery) next.mastery = { ...next.mastery, active: false };
  if (next.maneuver) next.maneuver = { ...next.maneuver, active: false };
  return next;
}
