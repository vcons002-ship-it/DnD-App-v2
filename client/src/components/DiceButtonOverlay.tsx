import { useStore } from '../state/socket';

// Basic dice revealed above the d20 (matches DicePanel's quick set).
const DICE = ['d20', 'd12', 'd10', 'd8', 'd6', 'd4', 'd100'];

/**
 * A D20-shaped quick-roll button pinned to the bottom-right of the map. Sits
 * semi-transparent and unobtrusive until hovered, then fades to full opacity and
 * reveals the basic dice. Clicking the d20 rolls 1d20; clicking a die in the
 * menu rolls one of it. Rolls go through the same server-authoritative
 * `dice:roll` path as DicePanel and land in the shared roll log.
 */
export function DiceButtonOverlay() {
  const rollDice = useStore((s) => s.rollDice);
  const roll = (d: string) => rollDice({ expr: `1${d}` });

  return (
    <div className="dice-button-overlay">
      <div className="dice-quick-menu">
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
        onClick={() => roll('d20')}
        title="Roll a d20 — hover for more dice"
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
