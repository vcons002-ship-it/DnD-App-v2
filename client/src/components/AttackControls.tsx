import { useState } from 'react';
import type { StateSnapshot, Token, Weapon } from '../../../shared/types';
import { resolveToken } from '../lib/entities';
import { useStore } from '../state/socket';

/**
 * Weapon-attack roller for the selected token: pick a target, optionally adv/dis,
 * and roll each weapon. The server resolves to-hit vs the target's AC, rolls
 * damage on a hit (auto-applied), and logs it to the shared roll log.
 */
export function AttackControls({
  snapshot,
  attacker,
  weapons,
}: {
  snapshot: StateSnapshot;
  attacker: Token;
  weapons: Weapon[];
}) {
  const combatAttack = useStore((s) => s.combatAttack);
  const targets = snapshot.tokens.filter((t) => t.id !== attacker.id);
  const [targetId, setTargetId] = useState(targets[0]?.id ?? '');
  const [adv, setAdv] = useState<'adv' | 'dis' | null>(null);
  const [offhand, setOffhand] = useState(false);
  const [twoHanded, setTwoHanded] = useState(false);

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
        <button
          className={`btn tiny ${adv === 'adv' ? 'on' : ''}`}
          onClick={() => setAdv((a) => (a === 'adv' ? null : 'adv'))}
        >
          Adv
        </button>
        <button
          className={`btn tiny ${adv === 'dis' ? 'on' : ''}`}
          onClick={() => setAdv((a) => (a === 'dis' ? null : 'dis'))}
        >
          Dis
        </button>
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
      {weapons.map((w, i) => (
        <button
          key={i}
          className="btn tiny attack-row"
          disabled={!targetId}
          onClick={() =>
            combatAttack({
              attackerTokenId: attacker.id,
              targetTokenId: targetId,
              weaponIndex: i,
              advantage: adv ?? undefined,
              offhand: offhand || undefined,
              twoHanded: twoHanded || undefined,
            })
          }
        >
          {w.kind === 'ranged' ? '🏹' : '⚔️'} {w.name}
          {(() => {
            const dmg = twoHanded && w.versatileDamage?.trim() ? w.versatileDamage : w.damage;
            return dmg ? <span className="muted"> {dmg}</span> : null;
          })()}
        </button>
      ))}
    </div>
  );
}
