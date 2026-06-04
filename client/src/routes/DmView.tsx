import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../state/socket';
import { MapStage } from '../canvas/MapStage';
import { DmPanel } from '../components/DmPanel';
import { SelectedTokenPanel } from '../components/SelectedTokenPanel';
import { SidePanel } from '../components/SidePanel';
import { useSelection } from '../lib/useSelection';

export function DmView() {
  const snapshot = useStore((s) => s.snapshot);
  const spawnToken = useStore((s) => s.spawnToken);
  const deleteToken = useStore((s) => s.deleteToken);
  const { selectedIds, setSelectedIds, handleSelect, handleMove, primaryId } =
    useSelection(snapshot);
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

  const playerLink = `${location.origin}/join?code=${snapshot.sessionCode}`;

  return (
    <div className="layout">
      <header className="topbar">
        <strong>DM</strong>
        <span className="code">Code: {snapshot.sessionCode}</span>
        <span className="active-map">
          Active: {snapshot.maps.find((m) => m.id === snapshot.activeMapId)?.name ?? '—'}
          {snapshot.map && snapshot.map.id !== snapshot.activeMapId && (
            <em> · prepping: {snapshot.map.name}</em>
          )}
        </span>
        <button
          className="btn tiny"
          onClick={() => navigator.clipboard?.writeText(playerLink)}
        >
          Copy player link
        </button>
      </header>

      <div className="body">
        <SidePanel side="left" storageKey="dm-left">
          <DmPanel
            snapshot={snapshot}
            pending={pending}
            onPickSpawn={(kind, refId) =>
              setPending((cur) =>
                cur?.refId === refId ? null : { kind, refId },
              )
            }
            selectedTokenId={primaryId}
            onSelectToken={(t) => handleSelect(t, false)}
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
              pending && snapshot.map
                ? (x, y) =>
                    spawnToken(snapshot.map!.id, pending.kind, pending.refId, x, y)
                : undefined
            }
          />
        </main>

        <SidePanel side="right" storageKey="dm-right">
          {selectedToken ? (
            <SelectedTokenPanel snapshot={snapshot} token={selectedToken} />
          ) : (
            <p className="muted pad">Select a token to edit it.</p>
          )}
        </SidePanel>
      </div>
    </div>
  );
}
