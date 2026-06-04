import { useState } from 'react';
import type { StateSnapshot, Token } from '../../../shared/types';
import { resolveToken } from '../lib/entities';
import { useStore } from '../state/socket';
import { ConditionPicker } from './ConditionPicker';

type Props = { snapshot: StateSnapshot; token: Token };

/** Right-side detail panel for the currently selected token (DM + player). */
export function SelectedTokenPanel({ snapshot, token }: Props) {
  const applyDamage = useStore((s) => s.applyDamage);
  const resizeToken = useStore((s) => s.resizeToken);
  const deleteToken = useStore((s) => s.deleteToken);
  const [amount, setAmount] = useState(1);

  const d = resolveToken(snapshot, token);
  const canSeeHp = d.curHp !== undefined && d.maxHp !== undefined;
  const isDm = snapshot.role === 'dm';

  return (
    <div className="panel-section">
      <h3>{d.name}</h3>
      {canSeeHp ? (
        <div className="hp-line">
          HP: {d.curHp} / {d.maxHp}
        </div>
      ) : (
        <div className="hp-line muted">HP hidden</div>
      )}

      <div className="dmg-row">
        <input
          type="number"
          value={amount}
          onChange={(e) => setAmount(Number(e.target.value))}
        />
        <button
          className="btn red"
          onClick={() => applyDamage(token.kind, token.refId, amount)}
        >
          Damage
        </button>
        <button
          className="btn green"
          onClick={() => applyDamage(token.kind, token.refId, -amount)}
        >
          Heal
        </button>
      </div>

      <div className="size-row">
        <span>Size</span>
        <button className="btn" onClick={() => resizeToken(token.id, token.size - 0.5)}>
          −
        </button>
        <span>{token.size}</span>
        <button className="btn" onClick={() => resizeToken(token.id, token.size + 0.5)}>
          +
        </button>
      </div>

      <h4>Conditions</h4>
      <ConditionPicker kind={token.kind} refId={token.refId} conditions={d.conditions} />

      {isDm && (
        <button
          className="btn red delete-token"
          onClick={() => deleteToken(token.id)}
        >
          Delete token
        </button>
      )}
    </div>
  );
}
