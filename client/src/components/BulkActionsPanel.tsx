import { useState } from 'react';
import type { StateSnapshot } from '../../../shared/types';
import { STANDARD_CONDITIONS } from '../lib/conditions';
import { resolveToken } from '../lib/entities';
import { useStore } from '../state/socket';
import { IconTools } from './IconTools';

type Props = {
  snapshot: StateSnapshot;
  selectedIds: string[];
  onClearSelection: () => void;
};

/** Right-panel actions that apply to a whole multi-selection of tokens. */
export function BulkActionsPanel({
  snapshot,
  selectedIds,
  onClearSelection,
}: Props) {
  const damageTokens = useStore((s) => s.damageTokens);
  const setTokensCondition = useStore((s) => s.setTokensCondition);
  const clearTokensConditions = useStore((s) => s.clearTokensConditions);
  const setTokensIcon = useStore((s) => s.setTokensIcon);
  const setTokensHidden = useStore((s) => s.setTokensHidden);
  const setTokensHideCombatRole = useStore((s) => s.setTokensHideCombatRole);
  const deleteToken = useStore((s) => s.deleteToken);
  const isDm = snapshot.role === 'dm';
  const [amount, setAmount] = useState(5);
  const [cond, setCond] = useState(STANDARD_CONDITIONS[0]);

  const tokens = snapshot.tokens.filter((t) => selectedIds.includes(t.id));
  const names = tokens.map((t) => resolveToken(snapshot, t).name);

  const deleteAll = () => {
    selectedIds.forEach((id) => deleteToken(id));
    onClearSelection();
  };

  return (
    <div className="panel-section">
      <h3>{selectedIds.length} tokens selected</h3>
      <p className="muted bulk-names">{names.join(', ')}</p>

      <h4>Damage / heal all (AOE)</h4>
      <div className="dmg-row">
        <input
          type="number"
          value={amount}
          onChange={(e) => setAmount(Number(e.target.value))}
        />
        <button
          className="btn red"
          onClick={() => damageTokens(selectedIds, amount)}
        >
          Damage
        </button>
        <button
          className="btn green"
          onClick={() => damageTokens(selectedIds, -amount)}
        >
          Heal
        </button>
      </div>

      <h4>Conditions (all)</h4>
      <div className="bulk-cond">
        <select value={cond} onChange={(e) => setCond(e.target.value)}>
          {STANDARD_CONDITIONS.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <button
          className="btn tiny"
          onClick={() =>
            setTokensCondition(selectedIds, {
              label: cond,
              aura: 'red',
              isConcentration: false,
            })
          }
        >
          Apply
        </button>
        <button
          className="btn tiny"
          onClick={() => clearTokensConditions(selectedIds)}
        >
          Clear all
        </button>
      </div>

      {isDm && (
        <>
          <h4>Token image (all)</h4>
          <IconTools
            onApply={(icon) => setTokensIcon(selectedIds, icon)}
            note={`Applies to all ${selectedIds.length} selected tokens`}
          />

          <h4>Visibility (all)</h4>
          <div className="bulk-vis">
            <button
              className="btn tiny"
              onClick={() => setTokensHidden(selectedIds, true)}
            >
              Hide from players
            </button>
            <button
              className="btn tiny"
              onClick={() => setTokensHidden(selectedIds, false)}
            >
              Show
            </button>
            <button
              className="btn tiny"
              onClick={() => setTokensHideCombatRole(selectedIds, true)}
            >
              Hide role badges
            </button>
            <button
              className="btn tiny"
              onClick={() => setTokensHideCombatRole(selectedIds, false)}
            >
              Show badges
            </button>
          </div>

          <button className="btn red delete-token" onClick={deleteAll}>
            Delete {selectedIds.length} tokens
          </button>
        </>
      )}
    </div>
  );
}
