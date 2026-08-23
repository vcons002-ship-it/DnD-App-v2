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
import { AdvantageToggle } from './AdvantageToggle';
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
  // …and show it right here, big, so it's obvious BEFORE you click an attack
  // (it used to live only in the skills/dice panels, nowhere near the buttons).
  const armedAdv = useStore((s) => s.manualAdvantage[attacker.refId]);
  const summonCast = useStore((s) => s.summonCast);
  const summonMap = useStore((s) => s.snapshot?.map);
  const notify = useStore((s) => s.notify);
  const weapons = caster.weapons;
  const abilities = caster.sheetAbilities.filter((a) => !!a.roll);
  // Summon-tagged spells/abilities get a ✋ Summon button right here in the console.
  const summonAbilities = caster.sheetAbilities.filter((a) => a.summon);
  const castSummon = (a: (typeof summonAbilities)[number]) => {
    if (!summonMap) {
      notify('No active map to summon onto.');
      return;
    }
    const g = summonMap.gridSizePx || 50;
    summonCast({
      kind,
      refId: caster.id,
      abilityId: a.id,
      mapId: summonMap.id,
      x: g * 2 + Math.random() * g * 2,
      y: g * 2 + Math.random() * g * 2,
    });
    notify(`Summoned ${a.summon?.name?.trim() || a.name} — drag it into place.`);
  };

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
  if (nothingRollable && !anyToggle && !isPc && summonAbilities.length === 0)
    return <p className="muted">No attacks or rollable abilities.</p>;

  // The select state can hold an id no longer in the list (the target token was
  // deleted, or the DM switched maps) — a stale-but-truthy id would leave the
  // attack buttons enabled while firing at a token the server drops silently.
  // Clamp to the live list for everything that reads it.
  const effectiveTargetId = targets.some((t) => t.id === targetId)
    ? targetId
    : targets[0]?.id ?? '';
  const effectiveHealId = healList.some((t) => t.id === healTargetId)
    ? healTargetId
    : healList[0]?.id ?? '';

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
          <select value={effectiveTargetId} onChange={(e) => setTargetId(e.target.value)}>
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
      {!nothingRollable && (
        <div className="dice-row combat-adv-row">
          <span className="muted spell-tag">Next roll</span>
          <AdvantageToggle entityId={attacker.refId} size="lg" />
          {armedAdv && (
            <span className={armedAdv === 'adv' ? 'adv-up' : 'adv-down'}>
              {armedAdv === 'adv' ? 'advantage armed' : 'disadvantage armed'}
            </span>
          )}
        </div>
      )}
      {/* Damage/attack-altering toggles (Rage, masteries, maneuvers, marks). */}
      <AbilityToggles
        character={caster}
        kind={kind}
        snapshot={snapshot}
        targets={targets}
        currentTargetId={effectiveTargetId || undefined}
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
            disabled={!effectiveTargetId}
            onAttack={(i) =>
              combatAttack({
                attackerTokenId: attacker.id,
                targetTokenId: effectiveTargetId,
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
            value={effectiveHealId}
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
        targetTokenId={effectiveTargetId || undefined}
        healTargetId={effectiveHealId || undefined}
      />
      {summonAbilities.length > 0 && (
        <div className="combat-summon-row">
          {summonAbilities.map((a) => (
            <button
              key={a.id}
              className="btn tiny"
              title={`Summon ${a.summon?.name?.trim() || a.name}${(a.level ?? 0) >= 1 ? ' (spends a spell slot)' : ''}`}
              onClick={() => castSummon(a)}
            >
              {a.summon?.icon || '✋'} {a.summon?.name?.trim() || a.name}
            </button>
          ))}
        </div>
      )}
      {/* Spell slots + class resources, spendable right where they're used
          (the full tracker stays on the character sheet too). */}
      {'resources' in caster && (
        <CharacterResources character={caster} editable compact />
      )}
    </div>
  );
}
