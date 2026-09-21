import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../state/socket';
import { MapStage } from '../canvas/MapStage';
import { DmPanel } from '../components/DmPanel';
import { InitiativePanel } from '../components/InitiativePanel';
import { SelectedTokenPanel } from '../components/SelectedTokenPanel';
import { BulkActionsPanel } from '../components/BulkActionsPanel';
import { DicePanel } from '../components/DicePanel';
import { DmWorkspace } from '../components/DmWorkspace';
import '../dm-fantasy.css';
import { PlacementBanner } from '../components/PlacementBanner';
import { ConnectionStatus } from '../components/ConnectionStatus';
import { Toast } from '../components/Toast';
import { RollRevealOverlay } from '../components/RollRevealOverlay';
import { AiStatus } from '../components/AiStatus';
import { TopToolbar } from '../components/TopToolbar';
import { useSelection } from '../lib/useSelection';
import { useSpawnRequests } from '../lib/spawnChannel';

export function DmView() {
  const snapshot = useStore((s) => s.snapshot);
  const spawnToken = useStore((s) => s.spawnToken);
  const deleteToken = useStore((s) => s.deleteToken);
  const undo = useStore((s) => s.undo);
  const rightPanelNudge = useStore((s) => s.rightPanelNudge);
  const { selectedIds, setSelectedIds, handleSelect, handleMove, primaryId } =
    useSelection(snapshot, snapshot ? `dm-sel-${snapshot.sessionCode}` : undefined);
  const [pending, setPending] = useState<{
    kind: 'pc' | 'monster';
    refId: string;
  } | null>(null);

  // The standalone Monster Library window has no map canvas, so its "Place on
  // map" hands off to us: arm the same placement flow the left panel uses and
  // the DM clicks the exact spot here.
  useSpawnRequests(snapshot?.sessionCode, (req) =>
    setPending({ kind: req.kind === 'pc' ? 'pc' : 'monster', refId: req.refId }),
  );

  const selectedToken = useMemo(
    () => snapshot?.tokens.find((t) => t.id === primaryId) ?? null,
    [snapshot, primaryId],
  );

  // Delete / Backspace removes the current selection (DM only).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const tag = el?.tagName;
      // Don't hijack Delete/Backspace while the user is editing any field —
      // dropdowns and contentEditable count too, not just INPUT/TEXTAREA.
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el?.isContentEditable) return;
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedIds.length) {
        selectedIds.forEach((id) => deleteToken(id));
        setSelectedIds([]);
      }
      // Ctrl/Cmd+Z undoes the last destructive action (server-side stack).
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        undo();
      }
      if (e.key === 'Escape') setPending(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedIds, deleteToken, setSelectedIds, undo]);

  if (!snapshot) return <div className="loading">Loading…</div>;

  return (
    <div className="layout dm-fantasy">
      <TopToolbar snapshot={snapshot} compactDm />

      <div className="body">
        <main className="center">
          {snapshot.undoLabel && (
            <button
              className="btn tiny dm-undo"
              style={{ position: 'absolute', top: 8, right: 8, zIndex: 6 }}
              onClick={undo}
              title="Reverse the last destructive action (Ctrl+Z)"
            >
              ↶ Undo {snapshot.undoLabel.toLowerCase()}
            </button>
          )}
          {pending && snapshot.map && (
            <PlacementBanner
              snapshot={snapshot}
              pending={pending}
              onCancel={() => setPending(null)}
            />
          )}
          <MapStage
            snapshot={snapshot}
            draggableTokens
            selectedIds={selectedIds}
            activeTurnTokenId={snapshot.activeTurnTokenId}
            onSelectToken={handleSelect}
            onMoveToken={handleMove}
            onPlaceAt={
              pending && snapshot.map
                ? (x, y) =>
                    spawnToken(snapshot.map!.id, pending.kind, pending.refId, x, y)
                : undefined
            }
          />
        </main>

        <DmWorkspace
          snapshot={snapshot}
          selectedToken={selectedToken}
          selectionCount={selectedIds.length}
          openSignal={rightPanelNudge}
          pending={pending}
          mapsAndCreatures={(section) => (
            <DmPanel snapshot={snapshot} section={section} pending={pending}
              onPickSpawn={(kind, refId) => setPending(cur => cur?.refId === refId ? null : { kind, refId })} />
          )}
          initiative={<InitiativePanel snapshot={snapshot} selectedTokenId={primaryId}
            onSelectToken={t => handleSelect(t, false)} />}
          chat={<DicePanel snapshot={snapshot} speakAsTokenId={primaryId} compact />}
          inspector={selectedIds.length > 1 ? (
            <BulkActionsPanel snapshot={snapshot} selectedIds={selectedIds}
              onClearSelection={() => setSelectedIds([])} />
          ) : selectedToken ? (
            <SelectedTokenPanel snapshot={snapshot} token={selectedToken} selectedIds={selectedIds} />
          ) : <div className="dm-empty"><h3>No token selected</h3><p>Select a figure or creature on the battlefield to manage its health, actions, and sheet.</p></div>}
        />
      </div>
      <AiStatus />
      <ConnectionStatus />
      <RollRevealOverlay />
      <Toast />
    </div>
  );
}
