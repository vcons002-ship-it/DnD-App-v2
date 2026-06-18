import { useEffect, useMemo, useState } from 'react';
import { getPlayerId, useStore } from '../state/socket';
import { MapStage } from '../canvas/MapStage';
import { PlayerPanel } from '../components/PlayerPanel';
import { SelectedTokenPanel } from '../components/SelectedTokenPanel';
import { BulkActionsPanel } from '../components/BulkActionsPanel';
import { DicePanel } from '../components/DicePanel';
import { SidePanel } from '../components/SidePanel';
import { ReorderableSections } from '../components/ReorderableSections';
import { ConnectionStatus } from '../components/ConnectionStatus';
import { Toast } from '../components/Toast';
import { RollRevealOverlay } from '../components/RollRevealOverlay';
import { AiStatus } from '../components/AiStatus';
import { TopToolbar } from '../components/TopToolbar';
import { SummonControls } from '../components/SummonControls';
import { useSelection } from '../lib/useSelection';

export function PlayerView() {
  const snapshot = useStore((s) => s.snapshot);
  const hurtFx = useStore((s) => s.hurtFx);
  const rightPanelNudge = useStore((s) => s.rightPanelNudge);
  const claimCharacter = useStore((s) => s.claimCharacter);
  const releaseCharacter = useStore((s) => s.releaseCharacter);
  const spawnToken = useStore((s) => s.spawnToken);
  const { selectedIds, setSelectedIds, handleSelect, handleMove, primaryId } =
    useSelection(snapshot);
  const [claimedId, setClaimedId] = useState<string | null>(null);
  const [placing, setPlacing] = useState(false);

  // Remember the claimed character per session and RE-CLAIM it after a page
  // reload — a refresh gets a new socket id, so the claim was dropped and the
  // right panel fell back to the generic view until the player re-selected.
  const mySocketId = useStore((s) => s.socket?.id);
  const claimKey = snapshot ? `claimedChar:${snapshot.sessionCode}` : null;
  useEffect(() => {
    if (!snapshot || !claimKey || claimedId) return;
    const stored = localStorage.getItem(claimKey);
    if (!stored) return;
    const c = snapshot.characters.find((x) => x.id === stored);
    if (!c) {
      localStorage.removeItem(claimKey); // character was deleted
      return;
    }
    // Sync our local selection back after a reload/reconnect: the server has
    // usually already handed the character back (claimedBy === our socket); also
    // re-grab it if it's simply free. Never snatch one a live player now holds.
    const heldByOther = !!c.claimedBy && c.claimedBy !== mySocketId;
    const mineByOwner = !!c.ownerId && c.ownerId === getPlayerId();
    if (!heldByOther || mineByOwner) {
      setClaimedId(stored);
      if (c.claimedBy !== mySocketId) claimCharacter(stored);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshot, claimKey, claimedId]);

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
        {/* Same rearrangeable/collapsible sections as the DM's left panel; layout
            prefs are namespaced by session code so campaigns don't share them. */}
        <SidePanel side="left" storageKey={`player-left:${snapshot.sessionCode}`}>
          <ReorderableSections
            storageKey={`player-left-order:${snapshot.sessionCode}`}
            sections={[
              {
                id: 'character',
                label: 'Your character',
                node: (
                  <PlayerPanel
                    snapshot={snapshot}
                    claimedId={claimedId}
                    placing={placing}
                    isPlaced={alreadyPlaced}
                    onClaim={(id) => {
                      setClaimedId(id);
                      claimCharacter(id);
                      if (claimKey) localStorage.setItem(claimKey, id);
                    }}
                    onRelease={() => {
                      setClaimedId(null);
                      releaseCharacter();
                      if (claimKey) localStorage.removeItem(claimKey);
                    }}
                    onPlaceToken={() => setPlacing((p) => !p)}
                  />
                ),
              },
              {
                id: 'summon',
                label: 'Summon',
                node: <SummonControls snapshot={snapshot} />,
              },
            ]}
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

        <SidePanel
          side="right"
          storageKey={`player-right:${snapshot.sessionCode}`}
          openSignal={rightPanelNudge}
        >
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
      <ConnectionStatus />
      <RollRevealOverlay />
      <Toast />
      {/* Red screen-edge flash when YOUR claimed PC takes damage (one-shot CSS
          animation; bigger hits flash harder). Keyed so rapid hits restart it. */}
      {hurtFx && (
        <div
          key={hurtFx.id}
          className={`hurt-vignette${hurtFx.amount >= 10 ? ' big' : ''}`}
        />
      )}
    </div>
  );
}
