import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../state/socket';
import { MapStage } from '../canvas/MapStage';
import { PlayerPanel } from '../components/PlayerPanel';
import { SelectedTokenPanel } from '../components/SelectedTokenPanel';
import { BulkActionsPanel } from '../components/BulkActionsPanel';
import { DicePanel } from '../components/DicePanel';
import { Roll20Panel } from '../components/Roll20Panel';
import { SidePanel } from '../components/SidePanel';
import { ChatPanel } from '../components/ChatPanel';
import { Toast } from '../components/Toast';
import { AiStatus } from '../components/AiStatus';
import { TopToolbar } from '../components/TopToolbar';
import { useSelection } from '../lib/useSelection';

export function PlayerView() {
  const snapshot = useStore((s) => s.snapshot);
  const claimCharacter = useStore((s) => s.claimCharacter);
  const releaseCharacter = useStore((s) => s.releaseCharacter);
  const spawnToken = useStore((s) => s.spawnToken);
  const { selectedIds, setSelectedIds, handleSelect, handleMove, primaryId } =
    useSelection(snapshot);
  const [claimedId, setClaimedId] = useState<string | null>(null);
  const [placing, setPlacing] = useState(false);

  // Players can place their own claimed character once; clear when it's down.
  const alreadyPlaced =
    !!claimedId &&
    !!snapshot?.tokens.some((t) => t.kind === 'pc' && t.refId === claimedId);
  useEffect(() => {
    if (alreadyPlaced) setPlacing(false);
  }, [alreadyPlaced]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setPlacing(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const selectedToken = useMemo(
    () => snapshot?.tokens.find((t) => t.id === primaryId) ?? null,
    [snapshot, primaryId],
  );

  if (!snapshot) return <div className="loading">Loading…</div>;

  return (
    <div className="layout">
      <TopToolbar snapshot={snapshot} />

      <div className="body">
        <SidePanel side="left" storageKey="player-left">
          <PlayerPanel
            snapshot={snapshot}
            claimedId={claimedId}
            placing={placing}
            isPlaced={alreadyPlaced}
            onClaim={(id) => {
              setClaimedId(id);
              claimCharacter(id);
            }}
            onRelease={() => {
              setClaimedId(null);
              releaseCharacter();
            }}
            onPlaceToken={() => setPlacing((p) => !p)}
          />
          <ChatPanel />
          <Roll20Panel />
        </SidePanel>

        <main className="center">
          <MapStage
            snapshot={snapshot}
            draggableTokens
            selectedIds={selectedIds}
            activeTurnTokenId={snapshot.activeTurnTokenId}
            onSelectToken={handleSelect}
            onMoveToken={handleMove}
            onPlaceAt={
              placing && claimedId && snapshot.map && !alreadyPlaced
                ? (x, y) => {
                    spawnToken(snapshot.map!.id, 'pc', claimedId, x, y);
                    setPlacing(false);
                  }
                : undefined
            }
          />
        </main>

        <SidePanel side="right" storageKey="player-right">
          {selectedIds.length > 1 ? (
            <BulkActionsPanel
              snapshot={snapshot}
              selectedIds={selectedIds}
              onClearSelection={() => setSelectedIds([])}
            />
          ) : selectedToken ? (
            <SelectedTokenPanel snapshot={snapshot} token={selectedToken} />
          ) : (
            <p className="muted pad">Select a token to view it.</p>
          )}
          {/* Roll log lives here (under the combat console) so clicking an attack
              shows the result immediately below. */}
          <DicePanel snapshot={snapshot} />
        </SidePanel>
      </div>
      <AiStatus />
      <Toast />
    </div>
  );
}
