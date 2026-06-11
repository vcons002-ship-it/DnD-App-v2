import type {
  Character,
  Monster,
  SheetAbility,
  StateSnapshot,
  Token,
  TokenKind,
} from '../../../shared/types';
import { resolveToken } from '../lib/entities';
import { confirmConcentration } from '../lib/spellcasting';
import { useStore } from '../state/socket';

/** Entries with a play-time damage/attack-altering toggle: effect-bearing
 *  masteries, maneuvers (arm for the next attack), and stances. */
export const hasToggle = (a: SheetAbility): boolean =>
  (a.type === 'mastery' && !!a.mastery?.effect) ||
  (a.type === 'maneuver' && !!a.maneuver) ||
  (a.type === 'stance' && !!a.stance);

/**
 * The ONE implementation of the toggle actions (used by the Combat section's
 * chip rows AND CharacterSpells' inline buttons on the left-panel sheet).
 * Toggling a stance ON spends one use of its linked counter; a spell-backed
 * stance (level ≥ 1, e.g. Hunter's Mark) also CASTS on activation — the server
 * spends a slot and starts concentration; ending it drops that concentration.
 * A marking stance puts/moves/clears its status (e.g. "Marked") on the target.
 */
export function useAbilityToggles(
  kind: TokenKind,
  character: Character | Monster,
  snapshot?: StateSnapshot,
) {
  const setSheetAbility = useStore((s) => s.setSheetAbility);
  const setResource = useStore((s) => s.setResource);
  const setCondition = useStore((s) => s.setCondition);
  const clearCondition = useStore((s) => s.clearCondition);
  const rollAbility = useStore((s) => s.rollAbility);

  // Put / remove a marking stance's status condition on the target creature, so
  // everyone sees what it's under. No-op without a snapshot (no targets there).
  const tokenById = (id?: string) => snapshot?.tokens.find((t) => t.id === id);
  const markTarget = (tokenId?: string, label?: string) => {
    const tok = tokenById(tokenId);
    if (tok && label)
      setCondition(tok.kind, tok.refId, { label, aura: 'blue', isConcentration: false });
  };
  const unmarkTarget = (tokenId?: string, label?: string) => {
    const tok = tokenById(tokenId);
    if (!tok || !label || !snapshot) return;
    const cond = resolveToken(snapshot, tok).conditions?.find((c) => c.label === label);
    if (cond) clearCondition(tok.kind, tok.refId, cond.id);
  };

  const patchStance = (
    a: SheetAbility,
    patch: Partial<NonNullable<SheetAbility['stance']>>,
  ) => {
    if (!a.stance) return;
    setSheetAbility(kind, character.id, { ...a, stance: { ...a.stance, ...patch } });
  };

  const patchMastery = (
    a: SheetAbility,
    patch: Partial<NonNullable<SheetAbility['mastery']>>,
  ) => {
    if (!a.mastery) return;
    setSheetAbility(kind, character.id, { ...a, mastery: { ...a.mastery, ...patch } });
  };

  const patchManeuver = (
    a: SheetAbility,
    patch: Partial<NonNullable<SheetAbility['maneuver']>>,
  ) => {
    if (!a.maneuver) return;
    setSheetAbility(kind, character.id, { ...a, maneuver: { ...a.maneuver, ...patch } });
  };

  /** Move a targeted stance's mark to `next` (re-tagging while active). */
  const moveMark = (a: SheetAbility, next?: string) => {
    if (a.stance?.active && a.stance.marksTargetWith) {
      unmarkTarget(a.stance.targetId, a.stance.marksTargetWith);
      markTarget(next, a.stance.marksTargetWith);
    }
    patchStance(a, { targetId: next });
  };

  const toggleStance = (a: SheetAbility, defaultMarkId?: string) => {
    const goingActive = !a.stance?.active;
    // Activating a concentration stance starts concentration — warn if another is up.
    if (goingActive && !confirmConcentration(character, a)) return;
    const stance = { ...a.stance!, active: goingActive };
    // A marking stance defaults to the current target when first switched on.
    if (goingActive && stance.targeted && !stance.targetId)
      stance.targetId = defaultMarkId;
    setSheetAbility(kind, character.id, { ...a, stance });
    // Tag/untag the marked target with the stance's status (Hunter's Mark → Marked).
    if (stance.marksTargetWith) {
      if (goingActive) markTarget(stance.targetId, stance.marksTargetWith);
      else unmarkTarget(a.stance?.targetId, stance.marksTargetWith);
    }
    if (goingActive && a.useCounter && 'resources' in character) {
      const c = character.resources[a.useCounter.name];
      if (c && c.used < c.max) {
        setResource({
          characterId: character.id,
          group: 'resources',
          key: a.useCounter.name,
          used: c.used + 1,
        });
      }
    }
    if ((a.level ?? 0) >= 1) {
      if (goingActive) {
        // Cast it: spend a slot + start concentration (handled server-side).
        rollAbility({ kind, refId: character.id, abilityId: a.id, castLevel: a.level });
      } else {
        // Ending the spell ends its concentration.
        const conc = character.conditions.find(
          (c) => c.isConcentration && c.label === `Concentration: ${a.name}`,
        );
        if (conc) clearCondition(kind, character.id, conc.id);
      }
    }
  };

  return { toggleStance, patchStance, patchMastery, patchManeuver, moveMark };
}

/**
 * Compact toggle chips for the Combat section: one row per stance / mastery /
 * maneuver with its On/Off (and a targeted stance's mark select, defaulting to
 * the section's current target). The full definitions stay in the Spells &
 * Abilities list; these are the play-time switches that alter the rolls below.
 */
export function AbilityToggles({
  character,
  kind,
  snapshot,
  targets,
  currentTargetId,
}: {
  character: Character | Monster;
  kind: TokenKind;
  snapshot: StateSnapshot;
  targets: Token[];
  currentTargetId?: string;
}) {
  const { toggleStance, patchMastery, patchManeuver, moveMark } = useAbilityToggles(
    kind,
    character,
    snapshot,
  );
  const entries = character.sheetAbilities.filter(hasToggle);
  if (entries.length === 0) return null;

  return (
    <div className="combat-toggles">
      {entries.map((a) => (
        <div key={a.id} className="combat-toggle-row">
          <span className="res-name" title={a.description || a.name}>
            {a.name}
          </span>
          {a.type === 'stance' && a.stance!.targeted && targets.length > 0 && (
            <select
              className="spell-level"
              value={a.stance!.targetId ?? ''}
              title="Marked target — the stance only affects attacks against it"
              onChange={(e) => moveMark(a, e.target.value || undefined)}
            >
              <option value="">— mark —</option>
              {targets.map((t) => (
                <option key={t.id} value={t.id}>
                  {resolveToken(snapshot, t).name}
                </option>
              ))}
            </select>
          )}
          {a.type === 'mastery' && (
            <button
              className={`btn tiny ${a.mastery!.active ? 'on' : ''}`}
              title={
                a.mastery!.active
                  ? 'Active — triggers on weapons with a matching tag'
                  : 'Inactive — click to enable'
              }
              onClick={() => patchMastery(a, { active: !a.mastery!.active })}
            >
              {a.mastery!.active ? 'On' : 'Off'}
            </button>
          )}
          {a.type === 'maneuver' && (
            <button
              className={`btn tiny ${a.maneuver!.active ? 'on' : ''}`}
              title={
                a.maneuver!.active
                  ? 'Armed — spends a Superiority Die on your next attack'
                  : 'Off — click to arm for your next attack'
              }
              onClick={() => patchManeuver(a, { active: !a.maneuver!.active })}
            >
              {a.maneuver!.active ? 'Armed' : 'Off'}
            </button>
          )}
          {a.type === 'stance' && (
            <button
              className={`btn tiny ${a.stance!.active ? 'on' : ''}`}
              title={
                a.stance!.active
                  ? 'Active — modifying your attacks; click to end'
                  : a.useCounter
                    ? 'Off — click to activate (spends one use)'
                    : 'Off — click to activate'
              }
              onClick={() => toggleStance(a, currentTargetId)}
            >
              {a.stance!.active ? 'On' : 'Off'}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
