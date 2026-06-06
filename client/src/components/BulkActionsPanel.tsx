import { useState } from 'react';
import type { StateSnapshot } from '../../../shared/types';
import { STANDARD_CONDITIONS } from '../lib/conditions';
import { resolveToken } from '../lib/entities';
import { useStore } from '../state/socket';
import { IconTools } from './IconTools';
import { DamageHealControls } from './DamageHealControls';

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
  const combatSave = useStore((s) => s.combatSave);
  const isDm = snapshot.role === 'dm';
  const [cond, setCond] = useState(STANDARD_CONDITIONS[0]);
  const [saveAbility, setSaveAbility] = useState('DEX');
  const [saveDc, setSaveDc] = useState(13);

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
      <DamageHealControls
        initial={5}
        onApply={(delta) => damageTokens(selectedIds, delta)}
      />

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
          <h4>Saving throw (all)</h4>
          <div className="bulk-cond">
            <select
              value={saveAbility}
              onChange={(e) => setSaveAbility(e.target.value)}
            >
              {['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'].map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
            <span className="muted">DC</span>
            <input
              type="number"
              value={saveDc}
              onChange={(e) => setSaveDc(Number(e.target.value))}
            />
            <button
              className="btn tiny"
              onClick={() =>
                combatSave({ tokenIds: selectedIds, ability: saveAbility, dc: saveDc })
              }
            >
              Roll saves
            </button>
          </div>

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
