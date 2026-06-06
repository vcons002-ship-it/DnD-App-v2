import { useEffect, useMemo, useRef, useState } from 'react';
import type {
  Character,
  Monster,
  StateSnapshot,
  Token,
} from '../../../shared/types';
import { COMBAT_ROLE_ICON } from '../../../shared/combatRole';
import { resolveToken } from '../lib/entities';
import { AURA_HEX } from '../lib/conditions';
import { useSelection } from '../lib/useSelection';
import { useStore } from '../state/socket';
import { SelectedTokenPanel } from '../components/SelectedTokenPanel';
import { DicePanel } from '../components/DicePanel';
import { BulkActionsPanel } from '../components/BulkActionsPanel';
import { ConditionPopover } from '../components/ConditionPopover';

const DISPOSITION_HEX: Record<string, string> = {
  friendly: '#39c46b',
  neutral: '#f5c518',
  enemy: '#e23b3b',
};
const ABILITIES = ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'];

type SortMode = 'initiative' | 'az' | 'type';

/**
 * Full-screen battlefield dashboard for a second screen / tablet. Compact cards
 * (name, HP, quick damage/heal + status) that expand into a large overlay with
 * the full token panel. Sortable, drag-reorderable, with a multiselect that
 * mirrors to the map window and drives bulk actions here.
 */
export function DmDataView() {
  const snapshot = useStore((s) => s.snapshot)!;
  const selectMap = useStore((s) => s.selectMap);
  const rollAllInitiative = useStore((s) => s.rollAllInitiative);
  const rollMissingInitiative = useStore((s) => s.rollMissingInitiative);
  const nextTurn = useStore((s) => s.nextTurn);
  const clearInitiative = useStore((s) => s.clearInitiative);

  const { selectedIds, setSelectedIds } = useSelection(
    snapshot,
    `dm-sel-${snapshot.sessionCode}`,
  );
  const [sortMode, setSortMode] = useState<SortMode>('initiative');
  const [manualOrder, setManualOrder] = useState<string[] | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const dragId = useRef<string | null>(null);

  // Always mirror the LIVE active map even if the main DM switches it.
  useEffect(() => {
    if (snapshot.activeMapId && snapshot.map?.id !== snapshot.activeMapId) {
      selectMap(snapshot.activeMapId);
    }
  }, [snapshot.activeMapId, snapshot.map?.id, selectMap]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) =>
      e.key === 'Escape' && setExpandedId(null);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const tokens = snapshot.tokens;

  const rankOf = useMemo(() => {
    const m = new Map<string, number>();
    [...tokens]
      .filter((t) => t.initiative !== null)
      .sort((a, b) => (b.initiative ?? 0) - (a.initiative ?? 0))
      .forEach((t, i) => m.set(t.id, i + 1));
    return m;
  }, [tokens]);

  const typeOf = (t: Token): string => {
    if (t.kind === 'pc') return '';
    const m = snapshot.monsters.find((x) => x.id === t.refId) as Monster | undefined;
    return (m && 'creatureType' in m && m.creatureType) || 'creature';
  };

  const sorted = useMemo(() => {
    const arr = [...tokens];
    const name = (t: Token) => resolveToken(snapshot, t).name.toLowerCase();
    if (sortMode === 'az') {
      arr.sort((a, b) => name(a).localeCompare(name(b)));
    } else if (sortMode === 'type') {
      arr.sort((a, b) => {
        if (a.kind !== b.kind) return a.kind === 'pc' ? -1 : 1;
        const ta = typeOf(a);
        const tb = typeOf(b);
        if (ta !== tb) return ta.localeCompare(tb);
        return name(a).localeCompare(name(b));
      });
    } else {
      arr.sort((a, b) => {
        if (a.initiative === null && b.initiative === null) return 0;
        if (a.initiative === null) return 1;
        if (b.initiative === null) return -1;
        return b.initiative - a.initiative;
      });
    }
    return arr.map((t) => t.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tokens, sortMode, snapshot]);

  const orderIds = useMemo(() => {
    if (!manualOrder) return sorted;
    const present = new Set(tokens.map((t) => t.id));
    const kept = manualOrder.filter((id) => present.has(id));
    const keptSet = new Set(kept);
    return [...kept, ...sorted.filter((id) => !keptSet.has(id))];
  }, [manualOrder, sorted, tokens]);

  const orderedTokens = orderIds
    .map((id) => tokens.find((t) => t.id === id))
    .filter((t): t is Token => !!t);

  const chooseSort = (m: SortMode) => {
    setSortMode(m);
    setManualOrder(null);
  };

  const onDrop = (targetId: string) => {
    const src = dragId.current;
    dragId.current = null;
    if (!src || src === targetId) return;
    const arr = [...orderIds];
    const from = arr.indexOf(src);
    const to = arr.indexOf(targetId);
    if (from < 0 || to < 0) return;
    arr.splice(from, 1);
    arr.splice(to, 0, src);
    setManualOrder(arr);
  };

  const toggleSelect = (id: string) =>
    setSelectedIds((cur) =>
      cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id],
    );

  const turnName = snapshot.activeTurnTokenId
    ? resolveToken(
        snapshot,
        snapshot.tokens.find((t) => t.id === snapshot.activeTurnTokenId)!,
      ).name
    : null;
  const activeMapName =
    snapshot.maps.find((m) => m.id === snapshot.activeMapId)?.name ?? '—';
  const expandedToken = expandedId
    ? tokens.find((t) => t.id === expandedId)
    : null;

  return (
    <div className="data-view">
      <header className="data-top">
        <div>
          <strong>DM Data</strong>
          <span className="muted"> · {snapshot.sessionCode} · {activeMapName}</span>
        </div>
        <div className="data-turn">
          {turnName ? (
            <>
              Turn: <strong>{turnName}</strong>
            </>
          ) : (
            <span className="muted">No active turn</span>
          )}
        </div>
        <div className="data-sort">
          <span className="muted">Sort:</span>
          {(['initiative', 'az', 'type'] as const).map((m) => (
            <button
              key={m}
              className={`btn tiny ${sortMode === m ? 'on' : ''}`}
              onClick={() => chooseSort(m)}
            >
              {m === 'initiative' ? 'Init' : m === 'az' ? 'A–Z' : 'Type'}
            </button>
          ))}
        </div>
        <div className="data-init-actions">
          <button className="btn tiny" onClick={rollAllInitiative} title="Reset combat: re-roll everyone and start at the top">
            Roll all
          </button>
          <button className="btn tiny" onClick={rollMissingInitiative} title="Roll only for combatants who haven't rolled">
            Add rolls
          </button>
          <button className="btn tiny" onClick={nextTurn}>
            Next ▸
          </button>
          <button className="btn tiny" onClick={clearInitiative}>
            Clear
          </button>
        </div>
      </header>

      {selectedIds.length > 1 && (
        <div className="data-bulk">
          <BulkActionsPanel
            snapshot={snapshot}
            selectedIds={selectedIds}
            onClearSelection={() => setSelectedIds([])}
          />
        </div>
      )}

      <div className="data-body">
        {orderedTokens.length === 0 ? (
          <p className="muted pad data-grid-empty">No tokens on the active map yet.</p>
        ) : (
          <div className="data-grid">
            {orderedTokens.map((t) => (
              <DataCard
                key={t.id}
                snapshot={snapshot}
                token={t}
                rank={rankOf.get(t.id) ?? null}
                isTurn={t.id === snapshot.activeTurnTokenId}
                selected={selectedIds.includes(t.id)}
                onToggleSelect={() => toggleSelect(t.id)}
                onExpand={() => setExpandedId(t.id)}
                onDragStart={() => (dragId.current = t.id)}
                onDrop={() => onDrop(t.id)}
              />
            ))}
          </div>
        )}
        <aside className="data-roll-sidebar">
          <DicePanel snapshot={snapshot} />
        </aside>
      </div>

      {expandedToken && (
        <div className="data-modal-backdrop" onClick={() => setExpandedId(null)}>
          <div className="data-modal" onClick={(e) => e.stopPropagation()}>
            <div className="data-modal-head">
              <strong>{resolveToken(snapshot, expandedToken).name}</strong>
              <button className="btn tiny" onClick={() => setExpandedId(null)}>
                ✕ Close
              </button>
            </div>
            <div className="data-modal-body">
              <SelectedTokenPanel snapshot={snapshot} token={expandedToken} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function DataCard({
  snapshot,
  token,
  rank,
  isTurn,
  selected,
  onToggleSelect,
  onExpand,
  onDragStart,
  onDrop,
}: {
  snapshot: StateSnapshot;
  token: Token;
  rank: number | null;
  isTurn: boolean;
  selected: boolean;
  onToggleSelect: () => void;
  onExpand: () => void;
  onDragStart: () => void;
  onDrop: () => void;
}) {
  const applyDamage = useStore((s) => s.applyDamage);
  const clearCondition = useStore((s) => s.clearCondition);
  const [amount, setAmount] = useState(5);
  const d = resolveToken(snapshot, token);
  const hpFrac =
    d.maxHp && d.curHp !== undefined ? Math.max(0, Math.min(1, d.curHp / d.maxHp)) : null;

  const entity =
    token.kind === 'pc'
      ? (snapshot.characters.find((c) => c.id === token.refId) as Character | undefined)
      : (snapshot.monsters.find((m) => m.id === token.refId) as Monster | undefined);
  const showStats =
    entity && 'stats' in entity && ABILITIES.some((a) => entity.stats[a] !== undefined);

  return (
    <div
      className={`data-card ${isTurn ? 'turn' : ''} ${token.kind} ${
        selected ? 'selected' : ''
      }`}
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
    >
      <div className="data-card-strip" draggable onDragStart={onDragStart}>
        <span className="data-drag" title="Drag to reorder">
          ⠿
        </span>
        <input
          type="checkbox"
          className="data-select"
          checked={selected}
          onChange={onToggleSelect}
          title="Select (also selects on the map)"
        />
        {rank !== null && <span className="data-rank">#{rank}</span>}
        {d.disposition && (
          <span className="dot" style={{ background: DISPOSITION_HEX[d.disposition] }} />
        )}
        {token.combatRole && <span>{COMBAT_ROLE_ICON[token.combatRole]}</span>}
        <span className="data-card-name">{d.name}</span>
        <button className="data-expand" onClick={onExpand} title="Expand full sheet">
          ⤢
        </button>
      </div>

      <div className="data-card-body">
        <div className="data-hp">
          {hpFrac !== null ? (
            <>
              <div className="data-hp-bar">
                <span
                  style={{
                    width: `${hpFrac * 100}%`,
                    background:
                      hpFrac > 0.5 ? '#39c46b' : hpFrac > 0.25 ? '#f5c518' : '#e23b3b',
                  }}
                />
              </div>
              <span className="data-hp-num">
                {d.curHp}/{d.maxHp}
                {!!d.tempHp && d.tempHp > 0 && (
                  <span className="temp-hp"> +{d.tempHp}</span>
                )}
              </span>
            </>
          ) : (
            <span className="muted">HP hidden</span>
          )}
          {entity && 'armorClass' in entity && entity.armorClass > 0 && (
            <span className="data-ac muted">AC {entity.armorClass}</span>
          )}
        </div>

        {showStats && entity && (
          <div className="data-stats">
            {ABILITIES.map((a) => (
              <span key={a}>
                <em>{a}</em> {entity.stats[a] ?? '—'}
              </span>
            ))}
          </div>
        )}

        <div className="data-dmg">
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(Number(e.target.value))}
          />
          <button
            className="btn tiny red"
            onClick={() => applyDamage(token.kind, token.refId, amount)}
          >
            −HP
          </button>
          <button
            className="btn tiny green"
            onClick={() => applyDamage(token.kind, token.refId, -amount)}
          >
            +HP
          </button>
        </div>

        <div className="data-status-row">
          {d.conditions.map((c) => (
            <button
              key={c.id}
              className="data-cond-chip"
              style={{ borderColor: AURA_HEX[c.aura] }}
              title="Click to clear"
              onClick={() => clearCondition(token.kind, token.refId, c.id)}
            >
              {c.label} ✕
            </button>
          ))}
          <ConditionPopover
            kind={token.kind}
            refId={token.refId}
            conditions={d.conditions}
          />
        </div>
      </div>
    </div>
  );
}
