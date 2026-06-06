import { useState } from 'react';
import type { StateSnapshot } from '../../../shared/types';
import { useStore } from '../state/socket';
import { rollCategory, rollerColor } from '../lib/rollStyle';

const QUICK = ['d20', 'd12', 'd10', 'd8', 'd6', 'd4', 'd100'];

/** Dice roller + shared roll log (visible to everyone). */
export function DicePanel({ snapshot }: { snapshot: StateSnapshot }) {
  const rollDice = useStore((s) => s.rollDice);
  const clearRollLog = useStore((s) => s.clearRollLog);
  const showRollOverlay = useStore((s) => s.showRollOverlay);
  const toggleRollOverlay = useStore((s) => s.toggleRollOverlay);
  const [expr, setExpr] = useState('1d20');
  const [label, setLabel] = useState('');
  const [adv, setAdv] = useState<'adv' | 'dis' | null>(null);

  const roll = (e: string) =>
    rollDice({ expr: e, label: label.trim() || undefined, advantage: adv ?? undefined });

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
        <button
          className={`btn tiny ${adv === 'adv' ? 'on' : ''}`}
          onClick={() => setAdv((a) => (a === 'adv' ? null : 'adv'))}
          title="Roll twice, keep higher"
        >
          Adv
        </button>
        <button
          className={`btn tiny ${adv === 'dis' ? 'on' : ''}`}
          onClick={() => setAdv((a) => (a === 'dis' ? null : 'dis'))}
          title="Roll twice, keep lower"
        >
          Dis
        </button>
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
                <span className="muted">{r.detail}</span>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
