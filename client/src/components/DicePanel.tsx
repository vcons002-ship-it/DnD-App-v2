import { useState } from 'react';
import type { StateSnapshot } from '../../../shared/types';
import { useStore } from '../state/socket';
import { rollCategory, rollerColor } from '../lib/rollStyle';
import { renderRollDetail } from '../lib/rollDetail';
import { AdvantageToggle } from './AdvantageToggle';

const QUICK = ['d20', 'd12', 'd10', 'd8', 'd6', 'd4', 'd100'];

/** Dice roller + shared roll log (visible to everyone). */
export function DicePanel({ snapshot }: { snapshot: StateSnapshot }) {
  const rollDice = useStore((s) => s.rollDice);
  const clearRollLog = useStore((s) => s.clearRollLog);
  const showRollOverlay = useStore((s) => s.showRollOverlay);
  const toggleRollOverlay = useStore((s) => s.toggleRollOverlay);
  const showDiceButton = useStore((s) => s.showDiceButton);
  const toggleDiceButton = useStore((s) => s.toggleDiceButton);
  const saveResolve = useStore((s) => s.saveResolve);
  const armSaveResolve = useStore((s) => s.armSaveResolve);
  const isDm = snapshot.role === 'dm';
  // A player's dice toggle is keyed to THEIR character (so it's the same switch
  // shown above their skill list); the DM's generic roller gets its own key.
  const mySocketId = useStore((s) => s.socket?.id);
  const myChar = !isDm
    ? snapshot.characters.find((c) => c.claimedBy === mySocketId)
    : undefined;
  const advKey = myChar?.id ?? 'dm-dice';
  const consumeAdvantage = useStore((s) => s.consumeAdvantage);
  const [expr, setExpr] = useState('1d20');
  const [label, setLabel] = useState('');

  const roll = (e: string) =>
    rollDice({
      expr: e,
      label: label.trim() || undefined,
      advantage: consumeAdvantage(advKey),
    });

  return (
    <div className="panel-section dice-panel">
      <h3>Dice</h3>
      <div className="dice-quick">
        {QUICK.map((q) => (
          <button key={q} className="btn tiny" onClick={() => roll(`1${q}`)}>
            {q}
          </button>
        ))}
      </div>
      <div className="dice-row">
        <input
          value={expr}
          onChange={(e) => setExpr(e.target.value)}
          placeholder="2d6+3"
          onKeyDown={(e) => e.key === 'Enter' && roll(expr)}
        />
        <button className="btn" onClick={() => roll(expr)}>
          Roll
        </button>
      </div>
      <div className="dice-row">
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Label (optional)"
        />
        <AdvantageToggle entityId={advKey} />
      </div>

      <div className="roll-log-header">
        <span className="muted">Roll log</span>
        <button
          className={`btn tiny ${showRollOverlay ? 'on' : ''}`}
          onClick={toggleRollOverlay}
          title="Show the roll log as a transparent overlay on the map"
        >
          ⤢ Overlay
        </button>
        <button
          className={`btn tiny ${showDiceButton ? 'on' : ''}`}
          onClick={toggleDiceButton}
          title="Show a quick-roll d20 button in the corner of the map"
        >
          🎲 Dice
        </button>
        {snapshot.rollLog.length > 0 && (
          <button
            className="btn tiny danger"
            onClick={() => {
              if (window.confirm('Clear the roll log for everyone?')) clearRollLog();
            }}
            title="Remove all entries from the shared roll log"
          >
            Clear
          </button>
        )}
      </div>
      <div className="roll-log">
        {snapshot.rollLog.length === 0 && <p className="muted">No rolls yet.</p>}
        {[...snapshot.rollLog].reverse().map((r) => {
          const color = rollerColor(r.roller);
          return (
            <div
              key={r.id}
              className={`roll-entry cat-${rollCategory(r)}`}
              style={{ borderLeftColor: color }}
            >
              <span className="roll-total">{r.total}</span>
              <span className="roll-meta">
                <strong style={{ color }}>{r.roller}</strong>
                {r.label ? ` · ${r.label}` : ''}{' '}
                <span className="muted">{renderRollDetail(r.detail)}</span>
                {r.description && (
                  <span className="roll-desc muted">{r.description}</span>
                )}
                {isDm && r.apply && (
                  <button
                    className={`btn tiny apply-dmg ${saveResolve?.rollId === r.id ? 'on' : ''}`}
                    onClick={() =>
                      armSaveResolve({
                        rollId: r.id,
                        dc: r.apply!.dc,
                        save: r.apply!.save,
                        label: r.expr,
                        splitTotal: r.apply!.split?.length,
                      })
                    }
                    title={
                      r.apply.split
                        ? `Click ${r.apply.split.length} target(s) to assign each dart (${r.apply.split.join(', ')})`
                        : r.apply.save
                          ? `Click targets on the map to roll DC ${r.apply.dc} ${r.apply.save} saves and auto-apply full/half`
                          : `Click targets on the map to apply ${r.apply.amount} damage`
                    }
                  >
                    {saveResolve?.rollId === r.id
                      ? r.apply.split
                        ? `🎯 Dart ${(saveResolve.splitUsed ?? 0) + 1}/${r.apply.split.length}… (Esc)`
                        : '🎯 Targeting… (Esc)'
                      : r.apply.split
                        ? `🎯 Assign darts`
                        : '🎯 Apply damage'}
                  </button>
                )}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
