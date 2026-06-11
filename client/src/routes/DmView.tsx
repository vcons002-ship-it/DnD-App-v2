import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../state/socket';
import { MapStage } from '../canvas/MapStage';
import { DmPanel } from '../components/DmPanel';
import { InitiativePanel } from '../components/InitiativePanel';
import { SelectedTokenPanel } from '../components/SelectedTokenPanel';
import { BulkActionsPanel } from '../components/BulkActionsPanel';
import { DicePanel } from '../components/DicePanel';
import { Roll20Panel } from '../components/Roll20Panel';
import { SidePanel } from '../components/SidePanel';
import { ReorderableSections } from '../components/ReorderableSections';
import { PlacementBanner } from '../components/PlacementBanner';
import { ConnectionStatus } from '../components/ConnectionStatus';
import { Toast } from '../components/Toast';
import { AiStatus } from '../components/AiStatus';
import { TopToolbar } from '../components/TopToolbar';
import { useSelection } from '../lib/useSelection';

export function DmView() {
  const snapshot = useStore((s) => s.snapshot);
  const spawnToken = useStore((s) => s.spawnToken);
  const deleteToken = useStore((s) => s.deleteToken);
  const rightPanelNudge = useStore((s) => s.rightPanelNudge);
  const { selectedIds, setSelectedIds, handleSelect, handleMove, primaryId } =
    useSelection(snapshot, snapshot ? `dm-sel-${snapshot.sessionCode}` : undefined);
  const [pending, setPending] = useState<{
    kind: 'pc' | 'monster';
    refId: string;
  } | null>(null);

  const selectedToken = useMemo(
    () => snapshot?.tokens.find((t) => t.id === primaryId) ?? null,
    [snapshot, primaryId],
  );

  // Delete / Backspace removes the current selection (DM only).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedIds.length) {
        selectedIds.forEach((id) => deleteToken(id));
        setSelectedIds([]);
      }
      if (e.key === 'Escape') setPending(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedIds, deleteToken, setSelectedIds]);

  if (!snapshot) return <div className="loading">Loading…</div>;

  return (
    <div className="layout">
      <TopToolbar snapshot={snapshot} />

      <div className="body">
        {/* Layout prefs are namespaced by session code so campaigns don't share them. */}
        <SidePanel side="left" storageKey={`dm-left:${snapshot.sessionCode}`}>
          <ReorderableSections
            storageKey={`dm-left-order:${snapshot.sessionCode}`}
            sections={[
              {
                id: 'maps',
                label: 'Maps & Spawn',
                node: (
                  <DmPanel
                    snapshot={snapshot}
                    pending={pending}
                    onPickSpawn={(kind, refId) =>
                      setPending((cur) =>
                        cur?.refId === refId ? null : { kind, refId },
                      )
                    }
                  />
                ),
              },
              {
                id: 'initiative',
                label: 'Initiative',
                node: (
                  <InitiativePanel
                    snapshot={snapshot}
                    selectedTokenId={primaryId}
                    onSelectToken={(t) => handleSelect(t, false)}
                  />
                ),
              },
              { id: 'dice', label: 'Dice, Log & Chat', node: <DicePanel snapshot={snapshot} /> },
              {
                id: 'roll20',
                label: 'Roll20',
                node: <Roll20Panel sessionCode={snapshot.sessionCode} />,
              },
            ]}
          />
        </SidePanel>

        <main className="center">
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

        <SidePanel
          side="right"
          storageKey={`dm-right:${snapshot.sessionCode}`}
          openSignal={rightPanelNudge}
        >
          {selectedIds.length > 1 ? (
            <BulkActionsPanel
              snapshot={snapshot}
              selectedIds={selectedIds}
              onClearSelection={() => setSelectedIds([])}
            />
          ) : selectedToken ? (
            <SelectedTokenPanel
              snapshot={snapshot}
              token={selectedToken}
              selectedIds={selectedIds}
            />
          ) : (
            <p className="muted pad">Select a token to edit it.</p>
          )}
        </SidePanel>
      </div>
      <AiStatus />
      <ConnectionStatus />
      <Toast />
    </div>
  );
}
