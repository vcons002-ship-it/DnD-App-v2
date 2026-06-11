import { useEffect, useRef, useState } from 'react';
import type {
  Character,
  Monster,
  StateSnapshot,
  Token,
  TokenKind,
} from '../../../shared/types';
import { resolveToken } from '../lib/entities';
import { healTargets, validTargets } from '../lib/targets';
import { useStore } from '../state/socket';
import { AbilityButtons } from './AbilityButtons';
import { AbilityToggles, hasToggle } from './AbilityToggles';
import { CharacterResources } from './CharacterResources';
import { WeaponButtons } from './WeaponButtons';

/**
 * The right panel's unified "Combat" section: ONE target dropdown plus every
 * rollable action the attacker has against it — weapon attacks (with the
 * off-hand / versatile-2H toggles; the server resolves to-hit vs the target's
 * AC and auto-applies damage) and rollable abilities (attack/save/damage fire
 * at the target; heals pick an ally, self default). This replaces the old
 * standalone Attacks section — the Spells & Abilities section stays for
 * editing/preparing and points its rolls here (`rollsElsewhere`).
 * `defaultTargetId` pre-selects the target (the token a player clicked);
 * players can't target friendly creatures (`validTargets`).
 */
export function CombatSection({
  snapshot,
  attacker,
  caster,
  kind,
  defaultTargetId,
}: {
  snapshot: StateSnapshot;
  attacker: Token;
  /** The attacking entity (the attacker token's PC or creature). */
  caster: Character | Monster;
  kind: TokenKind;
  defaultTargetId?: string;
}) {
  const combatAttack = useStore((s) => s.combatAttack);
  // Advantage/disadvantage is the attacking creature's shared per-entity toggle
  // (set in the skills panel for a PC, or the creature panel for a monster);
  // we just consume it when an attack fires.
  const consumeAdvantage = useStore((s) => s.consumeAdvantage);
  const weapons = caster.weapons;
  const abilities = caster.sheetAbilities.filter((a) => !!a.roll);

  const targets = validTargets(snapshot, attacker);
  const validDefault =
    defaultTargetId && targets.some((t) => t.id === defaultTargetId)
      ? defaultTargetId
      : undefined;
  const [targetId, setTargetId] = useState(validDefault ?? targets[0]?.id ?? '');
  const [offhand, setOffhand] = useState(false);
  const [twoHanded, setTwoHanded] = useState(false);
  // Pre-select the clicked token as the target when it changes.
  useEffect(() => {
    if (validDefault) setTargetId(validDefault);
  }, [validDefault]);

  // Right-clicking a token on the map aims this dropdown at it (same target the
  // floating menu used), so closing the menu still leaves the panel set up.
  // Only CHANGES count (the nonce ref) — a stale value never overrides the
  // clicked-token default on mount.
  const combatTarget = useStore((s) => s.combatTarget);
  const seenTargetNonce = useRef(combatTarget?.n ?? 0);
  useEffect(() => {
    if (!combatTarget || combatTarget.n === seenTargetNonce.current) return;
    seenTargetNonce.current = combatTarget.n;
    if (targets.some((t) => t.id === combatTarget.id)) setTargetId(combatTarget.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [combatTarget]);

  // Heals pick from allies instead (self first = default) and apply on cast.
  const healList = healTargets(snapshot, attacker);
  const hasHeal = abilities.some((a) => a.roll?.kind === 'heal');
  const [healTargetId, setHealTargetId] = useState(healList[0]?.id ?? '');

  const nothingRollable = weapons.length === 0 && abilities.length === 0;
  const anyToggle = caster.sheetAbilities.some(hasToggle);
  const isPc = 'resources' in caster;
  if (nothingRollable && !anyToggle && !isPc)
    return <p className="muted">No attacks or rollable abilities.</p>;

  // A 2H toggle only matters when some weapon is versatile (has 2H damage).
  const anyVersatile = weapons.some(
    (w) =>
      w.versatileDamage?.trim() ||
      (w.tags ?? []).some((t) => t.toLowerCase() === 'versatile'),
  );

  return (
    <div className="attack-controls">
      {targets.length > 0 && !nothingRollable && (
        <div className="dice-row">
          <span className="muted spell-tag">Target</span>
          <select value={targetId} onChange={(e) => setTargetId(e.target.value)}>
            {targets.map((t) => (
              <option key={t.id} value={t.id}>
                {resolveToken(snapshot, t).name}
              </option>
            ))}
          </select>
        </div>
      )}
      {nothingRollable && (
        <p className="muted">No attacks or rollable abilities.</p>
      )}
      {/* Damage/attack-altering toggles (Rage, masteries, maneuvers, marks). */}
      <AbilityToggles
        character={caster}
        kind={kind}
        snapshot={snapshot}
        targets={targets}
        currentTargetId={targetId || undefined}
      />
      {weapons.length > 0 && (
        <>
          <div className="dice-row">
            <button
              className={`btn tiny ${offhand ? 'on' : ''}`}
              title="Off-hand attack: drop the ability modifier from damage"
              onClick={() => setOffhand((o) => !o)}
            >
              Off-hand
            </button>
            {anyVersatile && (
              <button
                className={`btn tiny ${twoHanded ? 'on' : ''}`}
                title="Two-handed: use a versatile weapon's 2H damage dice"
                onClick={() => setTwoHanded((t) => !t)}
              >
                2H
              </button>
            )}
          </div>
          <WeaponButtons
            weapons={weapons}
            twoHanded={twoHanded}
            disabled={!targetId}
            onAttack={(i) =>
              combatAttack({
                attackerTokenId: attacker.id,
                targetTokenId: targetId,
                weaponIndex: i,
                advantage: consumeAdvantage(attacker.refId),
                offhand: offhand || undefined,
                twoHanded: twoHanded || undefined,
              })
            }
          />
        </>
      )}
      {hasHeal && healList.length > 0 && (
        <div className="dice-row">
          <span className="muted spell-tag">Heal target</span>
          <select
            value={healTargetId}
            onChange={(e) => setHealTargetId(e.target.value)}
          >
            {healList.map((t, i) => (
              <option key={t.id} value={t.id}>
                {resolveToken(snapshot, t).name}
                {i === 0 && t.refId === caster.id ? ' (you)' : ''}
              </option>
            ))}
          </select>
        </div>
      )}
      <AbilityButtons
        abilities={abilities}
        kind={kind}
        caster={caster}
        targetTokenId={targetId || undefined}
        healTargetId={healTargetId || undefined}
      />
      {/* Spell slots + class resources, spendable right where they're used
          (the full tracker stays on the character sheet too). */}
      {'resources' in caster && (
        <CharacterResources character={caster} editable compact />
      )}
    </div>
  );
}
