import { useEffect, useState } from 'react';
import { useStore } from '../state/socket';

// Basic dice revealed above the d20 (matches DicePanel's quick set).
const DICE = ['d20', 'd12', 'd10', 'd8', 'd6', 'd4', 'd100'];

/** Touch devices have no hover, so the CSS-hover reveal can't work; detect them
 *  to switch the d20 button from "click rolls" to "tap opens the dice menu". */
const isTouch = (): boolean =>
  typeof window !== 'undefined' && !!window.matchMedia?.('(hover: none)').matches;

/**
 * A D20-shaped quick-roll button pinned to the bottom-right of the map. On a
 * mouse it sits semi-transparent until hovered, which fades it in and reveals the
 * basic dice; clicking the d20 rolls 1d20. On touch (no hover), a tap OPENS the
 * dice menu instead of rolling — otherwise hover-emulation made one tap both roll
 * a d20 AND open the menu. The menu's own d20 still rolls. Rolls go through the
 * same server-authoritative `dice:roll` path as DicePanel.
 */
export function DiceButtonOverlay() {
  const rollDice = useStore((s) => s.rollDice);
  const [open, setOpen] = useState(false);
  const roll = (d: string) => {
    rollDice({ expr: `1${d}` });
    setOpen(false);
  };

  // While the touch menu is open, a tap anywhere else closes it.
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const id = window.setTimeout(() => window.addEventListener('pointerdown', close), 0);
    return () => {
      window.clearTimeout(id);
      window.removeEventListener('pointerdown', close);
    };
  }, [open]);

  return (
    <div className={`dice-button-overlay${open ? ' open' : ''}`}>
      {/* stopPropagation so tapping a die doesn't trip the tap-away close first */}
      <div className="dice-quick-menu" onPointerDown={(e) => e.stopPropagation()}>
        {DICE.map((d) => (
          <button
            key={d}
            className="btn tiny"
            onClick={() => roll(d)}
            title={`Roll 1${d}`}
          >
            {d}
          </button>
        ))}
      </div>
      <button
        className="dice-d20-btn"
        onClick={() => (isTouch() ? setOpen((o) => !o) : roll('d20'))}
        title="Roll a d20 — hover (or tap) for more dice"
        aria-label="Roll a d20"
      >
        <svg viewBox="0 0 100 100" aria-hidden="true">
          <polygon className="d20-outline" points="50,4 90,27 90,73 50,96 10,73 10,27" />
          <polygon className="d20-face" points="50,30 72,68 28,68" />
          <line className="d20-edge" x1="50" y1="30" x2="50" y2="4" />
          <line className="d20-edge" x1="28" y1="68" x2="10" y2="73" />
          <line className="d20-edge" x1="72" y1="68" x2="90" y2="73" />
          <text className="d20-num" x="50" y="55">20</text>
        </svg>
      </button>
    </div>
  );
}
