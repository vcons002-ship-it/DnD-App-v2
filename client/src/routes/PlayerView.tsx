import { useMemo, useState } from 'react';
import { useStore } from '../state/socket';
import { MapStage } from '../canvas/MapStage';
import { PlayerPanel } from '../components/PlayerPanel';
import { SelectedTokenPanel } from '../components/SelectedTokenPanel';
import { SidePanel } from '../components/SidePanel';
import { Toast } from '../components/Toast';
import { useSelection } from '../lib/useSelection';

export function PlayerView() {
  const snapshot = useStore((s) => s.snapshot);
  const claimCharacter = useStore((s) => s.claimCharacter);
  const releaseCharacter = useStore((s) => s.releaseCharacter);
  const { selectedIds, handleSelect, handleMove, primaryId } =
    useSelection(snapshot);
  const [claimedId, setClaimedId] = useState<string | null>(null);

  const selectedToken = useMemo(
    () => snapshot?.tokens.find((t) => t.id === primaryId) ?? null,
    [snapshot, primaryId],
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
        <SidePanel side="left" storageKey="player-left">
          <PlayerPanel
            snapshot={snapshot}
            claimedId={claimedId}
            onClaim={(id) => {
              setClaimedId(id);
              claimCharacter(id);
            }}
            onRelease={() => {
              setClaimedId(null);
              releaseCharacter();
            }}
          />
        </SidePanel>

        <main className="center">
          <MapStage
            snapshot={snapshot}
            draggableTokens
            selectedIds={selectedIds}
            activeTurnTokenId={snapshot.activeTurnTokenId}
            onSelectToken={handleSelect}
            onMoveToken={handleMove}
          />
        </main>

        <SidePanel side="right" storageKey="player-right">
          {selectedToken ? (
            <SelectedTokenPanel snapshot={snapshot} token={selectedToken} />
          ) : (
            <p className="muted pad">Select a token to view it.</p>
          )}
        </SidePanel>
      </div>
      <Toast />
    </div>
  );
}
