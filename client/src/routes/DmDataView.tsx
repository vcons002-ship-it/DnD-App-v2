import { useEffect, useMemo, useState } from 'react';
import type { Character, Monster, StateSnapshot, Token } from '../../../shared/types';
import { COMBAT_ROLE_ICON } from '../../../shared/combatRole';
import { resolveToken } from '../lib/entities';
import { AURA_HEX } from '../lib/conditions';
import { useStore } from '../state/socket';
import { ConditionPicker } from '../components/ConditionPicker';

const DISPOSITION_HEX: Record<string, string> = {
  friendly: '#39c46b',
  neutral: '#f5c518',
  enemy: '#e23b3b',
};

/**
 * Full-screen, info-dense battlefield dashboard for a second screen / tablet.
 * Read-mostly but with quick HP + condition controls. No new server state — it
 * is just another DM client fed by the same state:snapshot.
 */
export function DmDataView() {
  const snapshot = useStore((s) => s.snapshot)!;
  const selectMap = useStore((s) => s.selectMap);
  const rollAllInitiative = useStore((s) => s.rollAllInitiative);
  const nextTurn = useStore((s) => s.nextTurn);
  const clearInitiative = useStore((s) => s.clearInitiative);

  // Always mirror the LIVE (active) map, even if it changes after we connected.
  useEffect(() => {
    if (
      snapshot.activeMapId &&
      snapshot.map?.id !== snapshot.activeMapId
    ) {
      selectMap(snapshot.activeMapId);
    }
  }, [snapshot.activeMapId, snapshot.map?.id, selectMap]);

  // Initiative order (rolled first, desc) + 1-based rank per token.
  const { ordered, rankOf } = useMemo(() => {
    const ord = [...snapshot.tokens].sort((a, b) => {
      if (a.initiative === null && b.initiative === null) return 0;
      if (a.initiative === null) return 1;
      if (b.initiative === null) return -1;
      return b.initiative - a.initiative;
    });
    const rank = new Map<string, number>();
    ord
      .filter((t) => t.initiative !== null)
      .forEach((t, i) => rank.set(t.id, i + 1));
    return { ordered: ord, rankOf: rank };
  }, [snapshot.tokens]);

  const turnName = snapshot.activeTurnTokenId
    ? resolveToken(
        snapshot,
        snapshot.tokens.find((t) => t.id === snapshot.activeTurnTokenId)!,
      ).name
    : null;

  const activeMapName =
    snapshot.maps.find((m) => m.id === snapshot.activeMapId)?.name ?? '—';

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
        <div className="data-init-actions">
          <button className="btn tiny" onClick={rollAllInitiative}>
            Roll all
          </button>
          <button className="btn tiny" onClick={nextTurn}>
            Next ▸
          </button>
          <button className="btn tiny" onClick={clearInitiative}>
            Clear
          </button>
        </div>
      </header>

      {ordered.length === 0 ? (
        <p className="muted pad">No tokens on the active map yet.</p>
      ) : (
        <div className="data-grid">
          {ordered.map((t) => (
            <CombatantCard
              key={t.id}
              snapshot={snapshot}
              token={t}
              rank={rankOf.get(t.id) ?? null}
              isTurn={t.id === snapshot.activeTurnTokenId}
            />
          ))}
        </div>
      )}
    </div>
  );
}

const ABILITIES = ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'];

function CombatantCard({
  snapshot,
  token,
  rank,
  isTurn,
}: {
  snapshot: StateSnapshot;
  token: Token;
  rank: number | null;
  isTurn: boolean;
}) {
  const applyDamage = useStore((s) => s.applyDamage);
  const [amount, setAmount] = useState(5);
  const d = resolveToken(snapshot, token);

  // Full entity (DM sees everything) for AC / level / ability scores.
  const entity =
    token.kind === 'pc'
      ? (snapshot.characters.find((c) => c.id === token.refId) as
          | Character
          | undefined)
      : (snapshot.monsters.find((m) => m.id === token.refId) as
          | Monster
          | undefined);
  const hpFrac =
    d.maxHp && d.curHp !== undefined ? Math.max(0, Math.min(1, d.curHp / d.maxHp)) : null;

  return (
    <div className={`data-card ${isTurn ? 'turn' : ''} ${token.kind}`}>
      <div className="data-card-head">
        {d.disposition && (
          <span
            className="dot"
            style={{ background: DISPOSITION_HEX[d.disposition] }}
          />
        )}
        {token.combatRole && <span>{COMBAT_ROLE_ICON[token.combatRole]}</span>}
        <span className="data-card-name">{d.name}</span>
        {rank !== null && <span className="data-rank">#{rank}</span>}
      </div>

      <div className="data-hp">
        {d.curHp !== undefined && d.maxHp !== undefined ? (
          <>
            <div className="data-hp-bar">
              <span
                style={{
                  width: `${(hpFrac ?? 0) * 100}%`,
                  background:
                    (hpFrac ?? 0) > 0.5
                      ? '#39c46b'
                      : (hpFrac ?? 0) > 0.25
                      ? '#f5c518'
                      : '#e23b3b',
                }}
              />
            </div>
            <span className="data-hp-num">
              {d.curHp}/{d.maxHp}
            </span>
          </>
        ) : (
          <span className="muted">HP hidden</span>
        )}
      </div>

      <div className="data-meta muted">
        {entity && entity.level > 0 && (
          <span>{token.kind === 'pc' ? 'Lvl' : 'CR'} {entity.level}</span>
        )}
        {entity && entity.armorClass > 0 && <span>AC {entity.armorClass}</span>}
      </div>

      {entity && ABILITIES.some((a) => entity.stats[a] !== undefined) && (
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

      {d.conditions.length > 0 && (
        <div className="data-conds">
          {d.conditions.map((c) => (
            <span
              key={c.id}
              className="data-cond-chip"
              style={{ borderColor: AURA_HEX[c.aura] }}
            >
              {c.label}
            </span>
          ))}
        </div>
      )}

      <details className="data-cond-edit">
        <summary>Conditions</summary>
        <ConditionPicker
          kind={token.kind}
          refId={token.refId}
          conditions={d.conditions}
        />
      </details>
    </div>
  );
}
