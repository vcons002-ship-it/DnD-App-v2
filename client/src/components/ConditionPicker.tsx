import { useState } from 'react';
import type { Condition, TokenKind } from '../../../shared/types';
import { conditionRule } from '../../../shared/conditionRules';
import { STANDARD_CONDITIONS } from '../lib/conditions';
import { useStore } from '../state/socket';

type Props = {
  kind: TokenKind;
  refId: string;
  conditions: Condition[];
  /**
   * Players: collapse the chip/add editor by default (under a "Conditions"
   * header), but keep the list of ACTIVE conditions always visible below it.
   */
  collapsibleEditor?: boolean;
};

/** Multi-select standard conditions + buff/nerf/concentration toggles. */
export function ConditionPicker({ kind, refId, conditions, collapsibleEditor = false }: Props) {
  const setCondition = useStore((s) => s.setCondition);
  const clearCondition = useStore((s) => s.clearCondition);
  const [custom, setCustom] = useState('');

  const active = (label: string) =>
    conditions.find((c) => c.label.toLowerCase() === label.toLowerCase());

  const toggleStandard = (label: string) => {
    const existing = active(label);
    if (existing) clearCondition(kind, refId, existing.id);
    else setCondition(kind, refId, { label, aura: 'red', isConcentration: false });
  };

  const addCustom = (aura: 'green' | 'red') => {
    const label = custom.trim() || (aura === 'green' ? 'Buff' : 'Nerf');
    setCondition(kind, refId, { label, aura, isConcentration: false });
    setCustom('');
  };

  const concentration = conditions.find((c) => c.isConcentration);
  const toggleConcentration = () => {
    if (concentration) clearCondition(kind, refId, concentration.id);
    else
      setCondition(kind, refId, {
        label: 'Concentration',
        aura: 'blue',
        isConcentration: true,
      });
  };

  // The chip grid + concentration toggle + custom buff/nerf — collapsed for
  // players, always shown for the DM.
  const editor = (
    <>
      <div className="cond-grid">
        {STANDARD_CONDITIONS.map((label) => {
          const act = active(label);
          return (
            <button
              key={label}
              className={`chip ${act ? 'chip-on red' : ''}`}
              onClick={() => toggleStandard(label)}
              title={conditionRule(label) || undefined}
            >
              {label}
              {act?.round ? <span className="cond-turn"> (T{act.round})</span> : ''}
            </button>
          );
        })}
      </div>

      <button
        className={`chip ${concentration ? 'chip-on blue' : ''}`}
        onClick={toggleConcentration}
      >
        Concentration
      </button>

      <div className="buff-row">
        <input
          placeholder="custom buff/nerf text"
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
        />
        <button className="btn green" onClick={() => addCustom('green')}>
          Buff
        </button>
        <button className="btn red" onClick={() => addCustom('red')}>
          Nerf
        </button>
      </div>
    </>
  );

  return (
    <div className="conditions">
      {collapsibleEditor ? (
        <details className="collapse-section">
          <summary className="collapse-head">Conditions</summary>
          {editor}
        </details>
      ) : (
        editor
      )}

      {conditions.length > 0 && (
        <ul className="cond-active">
          {conditions.map((c) => (
            <li key={c.id} title={conditionRule(c.label) || undefined}>
              <span className={`dot ${c.aura}`} />
              {c.customText ? `${c.label}: ${c.customText}` : c.label}
              {c.round ? <span className="cond-turn"> (T{c.round})</span> : ''}
              <button className="x" onClick={() => clearCondition(kind, refId, c.id)}>
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
