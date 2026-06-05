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

  if (weapons.length === 0 || targets.length === 0) return null;

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
            })
          }
        >
          {w.kind === 'ranged' ? '🏹' : '⚔️'} {w.name}
          {w.damage ? <span className="muted"> {w.damage}</span> : null}
        </button>
      ))}
    </div>
  );
}
