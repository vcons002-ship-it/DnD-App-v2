import { useEffect, useState } from 'react';
import type { StateSnapshot, Token, Weapon } from '../../../shared/types';
import { resolveToken } from '../lib/entities';
import { validTargets } from '../lib/targets';
import { useStore } from '../state/socket';
import { WeaponButtons } from './WeaponButtons';

/**
 * Weapon-attack roller: pick a target, optionally adv/dis, and roll each weapon.
 * The server resolves to-hit vs the target's AC, rolls damage on a hit
 * (auto-applied), and logs it. `defaultTargetId` pre-selects the target (the
 * token a player clicked); players can't target friendly creatures.
 */
export function AttackControls({
  snapshot,
  attacker,
  weapons,
  defaultTargetId,
}: {
  snapshot: StateSnapshot;
  attacker: Token;
  weapons: Weapon[];
  defaultTargetId?: string;
}) {
  const combatAttack = useStore((s) => s.combatAttack);
  // Advantage/disadvantage is the attacking creature's shared per-entity toggle
  // (set in the skills panel for a PC, or the creature panel for a monster);
  // we just consume it when an attack fires.
  const consumeAdvantage = useStore((s) => s.consumeAdvantage);
  // Players can't target friendly creatures; the DM may target anyone.
  const targets = validTargets(snapshot, attacker);
  const validDefault =
    defaultTargetId && targets.some((t) => t.id === defaultTargetId) ? defaultTargetId : undefined;
  const [targetId, setTargetId] = useState(validDefault ?? targets[0]?.id ?? '');
  const [offhand, setOffhand] = useState(false);
  const [twoHanded, setTwoHanded] = useState(false);

  // Pre-select the clicked token as the target when it changes.
  useEffect(() => {
    if (validDefault) setTargetId(validDefault);
  }, [validDefault]);

  if (weapons.length === 0 || targets.length === 0) return null;

  // A 2H toggle only matters when some weapon is versatile (has 2H damage).
  const anyVersatile = weapons.some(
    (w) => w.versatileDamage?.trim() || (w.tags ?? []).some((t) => t.toLowerCase() === 'versatile'),
  );

  return (
    <div className="attack-controls">
      <h4>Attacks</h4>
      <div className="dice-row">
        <select value={targetId} onChange={(e) => setTargetId(e.target.value)}>
          {targets.map((t) => (
            <option key={t.id} value={t.id}>
              {resolveToken(snapshot, t).name}
            </option>
          ))}
        </select>
      </div>
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
    </div>
  );
}
