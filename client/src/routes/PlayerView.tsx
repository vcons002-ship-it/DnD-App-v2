import { CombatMoments } from '../components/CombatMoments';
import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { getPlayerId, useStore } from '../state/socket';
import { MapStage } from '../canvas/MapStage';
import { PlayerPanel } from '../components/PlayerPanel';
import { SelectedTokenPanel } from '../components/SelectedTokenPanel';
import { BulkActionsPanel } from '../components/BulkActionsPanel';
import { DicePanel } from '../components/DicePanel';
import { PlayerHud } from '../components/PlayerHud';
import { PlayerDamagePrompt } from '../components/PlayerDamagePrompt';
import { ChatBubbleIcon, PanelResizeHandle, PlayerLayoutControls } from '../components/PlayerLayoutControls';
import '../player-fantasy.css';
import '../resizable-player-panels.css';
import { ConnectionStatus } from '../components/ConnectionStatus';
import { Toast } from '../components/Toast';
import { RollRevealOverlay } from '../components/RollRevealOverlay';
import { AiStatus } from '../components/AiStatus';
import { TopToolbar } from '../components/TopToolbar';
import { useSelection } from '../lib/useSelection';
import { usePlayerLayout } from '../lib/usePlayerLayout';

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
  const [chatOpen, setChatOpen] = useState(false);
  const [combatOpen, setCombatOpen] = useState(true);
  const layout = usePlayerLayout();
  const [preview, setPreview] = useState(false);
  useEffect(() => {
    const request = new AbortController();
    fetch('/api/health', { signal: request.signal })
      .then((r) => r.json())
      .then((s) => setPreview(s.preview === true))
      .catch(() => {});
    return () => request.abort();
  }, []);
  useEffect(() => {
    if (rightPanelNudge) setCombatOpen(true);
  }, [rightPanelNudge]);

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

  const mine = snapshot.characters.find(
    (c) => c.id === claimedId && c.claimedBy === mySocketId,
  );
  const myToken = mine
    ? snapshot.tokens.find((t) => t.kind === 'pc' && t.refId === mine.id)
    : undefined;
  const selectedObject =
    selectedToken?.kind === 'monster' &&
    snapshot.monsters.find((m) => m.id === selectedToken.refId)?.objectKind;
  const consoleToken = selectedObject ? myToken : (selectedToken ?? myToken);
  const release = () => {
    setClaimedId(null);
    releaseCharacter();
    if (claimKey) localStorage.removeItem(claimKey);
  };

  return (
    <div className={`layout player-fantasy resource-layout-${layout.resourceLayout}${chatOpen ? ' chat-open' : ''}`}
      style={{ '--player-ui-scale': layout.scale } as CSSProperties}>
      <TopToolbar snapshot={snapshot} />

      <div className="body" ref={layout.bodyRef}>
        <PlayerDamagePrompt />
        <PlayerLayoutControls layout={layout} />
        {preview && (
          <aside className="local-preview-notice" aria-label="Local preview: separate campaign copy. Changes here do not affect live play.">
            LOCAL PREVIEW<span className="preview-detail"> · separate campaign copy · changes here do not affect live play</span>
          </aside>
        )}
        {!mine && (
          <section
            className="player-claim fantasy-window"
            aria-label="Choose character"
          >
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
              onRelease={release}
              onPlaceToken={() => setPlacing((p) => !p)}
            />
          </section>
        )}

        <main className="center">
          <MapStage
            snapshot={snapshot}
            fullChatVisible={chatOpen}
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

        {mine && (
          <PlayerHud
            key={mine.id}
            character={mine}
            resourceLayout={layout.resourceLayout}
            snapshot={snapshot}
            placing={placing}
            isPlaced={alreadyPlaced}
            onPlace={() => setPlacing((p) => !p)}
            onRelease={release}
          />
        )}

        <section
          className={`player-combat fantasy-window${combatOpen ? '' : ' collapsed'}`}
          aria-label="Combat panel"
          style={{ width: layout.size('combat').width, height: combatOpen ? layout.size('combat').height : undefined }}
        >
          <header className="floating-panel-header">
            <h2>Combat</h2>
            <small>ROUND {snapshot.round}</small>
            <button
              className="btn tiny"
              aria-label={combatOpen ? 'Collapse combat' : 'Expand combat'}
              title={combatOpen ? 'Collapse combat' : 'Expand combat'}
              aria-expanded={combatOpen}
              onClick={() => setCombatOpen((v) => !v)}
            >
              {combatOpen ? '−' : '+'}
            </button>
          </header>
          <div className="floating-panel-content" hidden={!combatOpen}>
            {consoleToken ? (
              <SelectedTokenPanel snapshot={snapshot} token={consoleToken} compactPlayerConsole />
            ) : (
              <p className="pad muted">
                Choose your character and place their token to use the combat
                console.
              </p>
            )}
            {selectedObject && selectedToken && (
              <SelectedTokenPanel snapshot={snapshot} token={selectedToken} />
            )}
            {selectedIds.length > 1 && (
              <BulkActionsPanel
                snapshot={snapshot}
                selectedIds={selectedIds}
                onClearSelection={() => setSelectedIds([])}
              />
            )}
          </div>
          {combatOpen && <PanelResizeHandle panel="combat" layout={layout} />}
        </section>
        <section
          className={`player-chat fantasy-window${chatOpen ? '' : ' collapsed'}`}
          aria-label="Chat and roll log"
          style={chatOpen ? layout.size('chat') : undefined}
        >
          <header className="floating-panel-header">
            {chatOpen && <h2>Chat & roll log</h2>}
            <button
              className="btn tiny player-chat-toggle"
              aria-label={chatOpen ? 'Collapse chat and roll log' : 'Open chat and roll log'}
              title={chatOpen ? 'Collapse chat and roll log' : 'Chat and roll log'}
              aria-expanded={chatOpen}
              onClick={() => setChatOpen((v) => !v)}
            >
              {chatOpen ? '−' : <><ChatBubbleIcon /><span className="player-chat-hint">Chat & roll log</span></>}
            </button>
          </header>
          <div className="floating-panel-content" hidden={!chatOpen}>
            <DicePanel snapshot={snapshot} compact />
          </div>
          {chatOpen && <PanelResizeHandle panel="chat" layout={layout} />}
        </section>
      </div>
      <AiStatus />
      <ConnectionStatus />
      <RollRevealOverlay />
      <CombatMoments />
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
