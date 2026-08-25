import type { StateSnapshot, Token } from '../../../shared/types';
import { useStore } from '../state/socket';
import { resolveToken } from '../lib/entities';
import { KillScoreboard } from './KillScoreboard';

type Props = {
  snapshot: StateSnapshot;
  selectedTokenId: string | null;
  onSelectToken: (token: Token) => void;
};

/** The DM's initiative tracker: roll-all/add/next/clear, the turn order, and
 *  per-token initiative editing — a standalone, draggable panel section.
 *
 *  It's also where the DM decides WHO is in the fight. Each row has a tick box;
 *  "auto" pre-marks them from concealment (hidden by hand or sitting under fog),
 *  so on a normal map the boxes are already right and the DM only touches the
 *  exceptions. Unticked creatures drop out of the order into a collapsed
 *  "Not in combat" group rather than cluttering the tracker. */
export function InitiativePanel({ snapshot, selectedTokenId, onSelectToken }: Props) {
  const setInitiative = useStore((s) => s.setInitiative);
  const rollAllInitiative = useStore((s) => s.rollAllInitiative);
  const rollMissingInitiative = useStore((s) => s.rollMissingInitiative);
  const nextTurn = useStore((s) => s.nextTurn);
  const clearInitiative = useStore((s) => s.clearInitiative);
  const setRound = useStore((s) => s.setRound);
  const setTokenInCombat = useStore((s) => s.setTokenInCombat);
  const setTokensInCombat = useStore((s) => s.setTokensInCombat);

  // Objects (chests/doors/traps) never take turns — keep them out of the list.
  const combatants = snapshot.tokens.filter(
    (t) => !resolveToken(snapshot, t).objectKind,
  );
  // The order must contain everyone the SERVER gives turns to — that's anyone
  // with a rolled initiative, regardless of what fog has done since. Otherwise a
  // creature that rolled and then slipped under fog holds the turn marker from
  // inside the collapsed group below, and the ▸ shows nowhere at all.
  // Un-rolled tokens are listed by `inCombatEffective` (server-computed: it
  // depends on fog), so the pre-combat view still previews who "Roll all" takes.
  const inOrder = (t: Token) => t.initiative !== null || t.inCombatEffective;
  const fighting = combatants.filter(inOrder);
  const sidelined = combatants.filter((t) => !inOrder(t));

  // Tokens ordered for initiative (rolled first, desc).
  const orderedTokens = [...fighting].sort((a, b) => {
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

  const row = (t: Token, inCombat: boolean) => {
    // Group membership and the tick box can disagree: a creature that rolled and
    // then went under fog still takes turns (so it stays in the order) while its
    // effective state is "out". Show the truth in the box.
    const ticked = t.inCombatEffective;
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
        } ${isDead ? 'dead' : ''} ${inCombat ? '' : 'out'}`}
        title={isDead ? 'Dead — keeps its slot, skipped on its turn' : undefined}
        onClick={() => onSelectToken(t)}
      >
        <input
          type="checkbox"
          className="init-check"
          checked={ticked}
          title={
            ticked
              ? 'In the fight — untick to leave it out of initiative'
              : inCombat
                ? 'Rolled, but currently hidden or under fog — it still takes its turn'
                : 'Not in the fight — tick to pull it in'
          }
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => setTokenInCombat(t.id, e.target.checked)}
        />
        {inCombat ? (
          <>
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
          </>
        ) : (
          <span className="init-order" title="Not rolling">
            –
          </span>
        )}
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
  };

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
            title="Reset combat: re-roll everyone ticked below and start at the top"
          >
            Roll all
          </button>
          <button
            className="btn tiny"
            onClick={rollMissingInitiative}
            title="Roll only for ticked combatants who haven't rolled"
          >
            Add rolls
          </button>
          <button className="btn tiny" onClick={nextTurn}>
            Next ▸
          </button>
          <button
            className="btn tiny"
            onClick={clearInitiative}
            title="End combat: clears initiative rolls, the turn marker, and the round counter"
          >
            End combat
          </button>
        </div>
      </div>
      {combatants.length > 0 && (
        <div className="init-pick">
          <span className="muted">
            In the fight: {combatants.filter((t) => t.inCombatEffective).length}/
            {combatants.length}
          </span>
          <button
            className="btn tiny"
            title="Put every creature on this map into the fight"
            onClick={() => setTokensInCombat(combatants.map((t) => t.id), true)}
          >
            All
          </button>
          <button
            className="btn tiny"
            title="Take everyone out — then tick just the ones that are fighting"
            onClick={() => setTokensInCombat(combatants.map((t) => t.id), false)}
          >
            None
          </button>
          <button
            className="btn tiny"
            title="Back to auto: in the fight unless hidden or under fog"
            onClick={() => setTokensInCombat(combatants.map((t) => t.id))}
          >
            Auto
          </button>
        </div>
      )}
      <KillScoreboard snapshot={snapshot} />
      {orderedTokens.map((t) => row(t, true))}
      {sidelined.length > 0 && (
        <details className="init-out-group">
          <summary title="Hidden or under fog, or you unticked them — tick one to pull it in">
            Not in combat ({sidelined.length})
          </summary>
          {sidelined.map((t) => row(t, false))}
        </details>
      )}
      {combatants.length === 0 && <p className="muted">No combatants placed.</p>}
      {combatants.length > 0 && fighting.length === 0 && (
        <p className="muted">
          Nobody is in the fight — tick a creature below, or press All.
        </p>
      )}
    </div>
  );
}
