import { useMemo, useState } from 'react';
import { useStore } from '../state/socket';
import { MapStage } from '../canvas/MapStage';
import { DmPanel } from '../components/DmPanel';
import { SelectedTokenPanel } from '../components/SelectedTokenPanel';

export function DmView() {
  const snapshot = useStore((s) => s.snapshot);
  const moveToken = useStore((s) => s.moveToken);
  const spawnToken = useStore((s) => s.spawnToken);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pending, setPending] = useState<{
    kind: 'pc' | 'monster';
    refId: string;
  } | null>(null);

  const selectedToken = useMemo(
    () => snapshot?.tokens.find((t) => t.id === selectedId) ?? null,
    [snapshot, selectedId],
  );

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
        <aside className="left">
          <DmPanel
            snapshot={snapshot}
            pending={pending}
            onPickSpawn={(kind, refId) => setPending({ kind, refId })}
            selectedTokenId={selectedId}
            onSelectToken={(t) => setSelectedId(t.id)}
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
            onPlaceAt={
              pending && snapshot.map
                ? (x, y) => {
                    spawnToken(snapshot.map!.id, pending.kind, pending.refId, x, y);
                    setPending(null);
                  }
                : undefined
            }
          />
        </main>

        <aside className="right">
          {selectedToken ? (
            <SelectedTokenPanel snapshot={snapshot} token={selectedToken} />
          ) : (
            <p className="muted pad">Select a token to edit it.</p>
          )}
        </aside>
      </div>
    </div>
  );
}
