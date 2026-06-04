import { useMemo, useState } from 'react';
import { useStore } from '../state/socket';
import { MapStage } from '../canvas/MapStage';
import { PlayerPanel } from '../components/PlayerPanel';
import { SelectedTokenPanel } from '../components/SelectedTokenPanel';

export function PlayerView() {
  const snapshot = useStore((s) => s.snapshot);
  const moveToken = useStore((s) => s.moveToken);
  const claimCharacter = useStore((s) => s.claimCharacter);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [claimedId, setClaimedId] = useState<string | null>(null);

  const selectedToken = useMemo(
    () => snapshot?.tokens.find((t) => t.id === selectedId) ?? null,
    [snapshot, selectedId],
  );

  if (!snapshot) return <div className="loading">Loading…</div>;

  return (
    <div className="layout">
      <header className="topbar">
        <strong>Player</strong>
        <span className="code">Code: {snapshot.sessionCode}</span>
        <span className="active-map">Map: {snapshot.map?.name ?? '—'}</span>
      </header>

      <div className="body">
        <aside className="left">
          <PlayerPanel
            snapshot={snapshot}
            claimedId={claimedId}
            onClaim={(id) => {
              setClaimedId(id);
              claimCharacter(id);
            }}
          />
        </aside>

        <main className="center">
          <MapStage
            snapshot={snapshot}
            draggableTokens
            selectedTokenId={selectedId}
            activeTurnTokenId={null}
            onSelectToken={(t) => setSelectedId(t?.id ?? null)}
            onMoveToken={moveToken}
          />
        </main>

        <aside className="right">
          {selectedToken ? (
            <SelectedTokenPanel snapshot={snapshot} token={selectedToken} />
          ) : (
            <p className="muted pad">Select a token to view it.</p>
          )}
        </aside>
      </div>
    </div>
  );
}
