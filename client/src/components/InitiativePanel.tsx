import type { StateSnapshot, Token } from '../../../shared/types';
import { useStore } from '../state/socket';
import { resolveToken } from '../lib/entities';

type Props = {
  snapshot: StateSnapshot;
  selectedTokenId: string | null;
  onSelectToken: (token: Token) => void;
};

/** The DM's initiative tracker: roll-all/add/next/clear, the turn order, and
 *  per-token initiative editing — a standalone, draggable panel section. */
export function InitiativePanel({ snapshot, selectedTokenId, onSelectToken }: Props) {
  const setInitiative = useStore((s) => s.setInitiative);
  const rollAllInitiative = useStore((s) => s.rollAllInitiative);
  const rollMissingInitiative = useStore((s) => s.rollMissingInitiative);
  const nextTurn = useStore((s) => s.nextTurn);
  const clearInitiative = useStore((s) => s.clearInitiative);
  const setRound = useStore((s) => s.setRound);

  // Objects (chests/doors/traps) never take turns — keep them out of the list.
  const combatants = snapshot.tokens.filter(
    (t) => !resolveToken(snapshot, t).objectKind,
  );
  // Tokens ordered for initiative (rolled first, desc).
  const orderedTokens = [...combatants].sort((a, b) => {
    if (a.initiative === null && b.initiative === null) return 0;
    if (a.initiative === null) return 1;
    if (b.initiative === null) return -1;
    return b.initiative - a.initiative;
  });
  // 1-based turn order for tokens that have rolled.
  const rankOf = new Map<string, number>();
  orderedTokens
    .filter((t) => t.initiative !== null)
    .forEach((t, i) => rankOf.set(t.id, i + 1));

  return (
    <div className="panel-section">
      <div className="init-header">
        <h3>
          Initiative
          {snapshot.round > 0 && (
            <span
              className="round-chip"
              title="Combat round — advances when the turn order wraps; edit to re-count"
            >
              Round
              <input
                className="round-input"
                type="number"
                min={0}
                max={999}
                value={snapshot.round}
                onChange={(e) =>
                  e.target.value !== '' && setRound(Number(e.target.value))
                }
              />
            </span>
          )}
        </h3>
        <div className="init-actions">
          <button
            className="btn tiny"
            onClick={rollAllInitiative}
            title="Reset combat: re-roll everyone and start at the top"
          >
            Roll all
          </button>
          <button
            className="btn tiny"
            onClick={rollMissingInitiative}
            title="Roll only for combatants who haven't rolled"
          >
            Add rolls
          </button>
          <button className="btn tiny" onClick={nextTurn}>
            Next ▸
          </button>
          <button className="btn tiny" onClick={clearInitiative}>
            Clear
          </button>
        </div>
      </div>
      {orderedTokens.map((t) => {
        const d = resolveToken(snapshot, t);
        const isTurn = t.id === snapshot.activeTurnTokenId;
        // Mirror of the server's turn-skip rule: dead creatures keep their slot
        // but are walked past. PCs only count as dead at 3 failed saves (or the
        // Dead mark) — at 0 HP they still take a turn to roll death saves.
        const marked = d.conditions.some((c) => c.label.toLowerCase() === 'dead');
        const pc = t.kind === 'pc'
          ? snapshot.characters.find((c) => c.id === t.refId)
          : undefined;
        const isDead =
          t.kind === 'pc'
            ? marked || (pc?.deathSaves.failures ?? 0) >= 3
            : marked || (d.curHp !== undefined && d.curHp <= 0);
        return (
          <div
            key={t.id}
            className={`init-row ${t.id === selectedTokenId ? 'sel' : ''} ${
              isTurn ? 'turn' : ''
            } ${isDead ? 'dead' : ''}`}
            title={isDead ? 'Dead — keeps its slot, skipped on its turn' : undefined}
            onClick={() => onSelectToken(t)}
          >
            <span className="init-order" title="Turn order">
              {rankOf.get(t.id) ?? '–'}
            </span>
            <input
              className="init-input"
              type="number"
              value={t.initiative ?? ''}
              placeholder="roll"
              title="Initiative roll"
              onClick={(e) => e.stopPropagation()}
              onChange={(e) =>
                setInitiative(
                  t.id,
                  e.target.value === '' ? null : Number(e.target.value),
                )
              }
            />
            <span className="init-name">
              {isTurn && '▸ '}
              {isDead && '💀 '}
              {d.name}
            </span>
            {d.curHp !== undefined && (
              <span className="muted">
                {d.curHp}/{d.maxHp}
              </span>
            )}
          </div>
        );
      })}
      {combatants.length === 0 && <p className="muted">No combatants placed.</p>}
    </div>
  );
}
