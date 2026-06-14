import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { StateSnapshot } from '../../../shared/types';
import { useStore } from '../state/socket';
import { SettingsModal } from './SettingsModal';
import { GuideModal } from './GuideModal';
import { RulebookViewer } from './RulebookViewer';
import { EditableName } from './EditableName';

/**
 * Shared top app bar: global actions (load session, settings, copy link) plus
 * the session info readout. Role-aware — players get info + leave only.
 */
export function TopToolbar({ snapshot }: { snapshot: StateSnapshot }) {
  const disconnect = useStore((s) => s.disconnect);
  const renameSession = useStore((s) => s.renameSession);
  const navigate = useNavigate();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [hasRulebook, setHasRulebook] = useState(false);
  const openRulebook = useStore((s) => s.openRulebook);
  const isDm = snapshot.role === 'dm';

  // Show the Rulebook reader button only when the DM has uploaded one.
  useEffect(() => {
    if (!isDm) return;
    fetch('/api/rulebook')
      .then((r) => r.json())
      .then((b) => setHasRulebook(!!b))
      .catch(() => setHasRulebook(false));
  }, [isDm, settingsOpen]);

  const activeMap =
    snapshot.maps.find((m) => m.id === snapshot.activeMapId)?.name ?? '—';
  const prepping =
    isDm && snapshot.map && snapshot.map.id !== snapshot.activeMapId
      ? snapshot.map.name
      : null;
  const playerLink = `${location.origin}/join?code=${snapshot.sessionCode}`;

  const leave = () => {
    disconnect();
    navigate(isDm ? '/dm' : '/join');
  };

  return (
    <header className="topbar">
      <strong>{isDm ? 'DM' : 'Player'}</strong>
      <span className="session-title">
        {isDm ? (
          <EditableName
            value={snapshot.sessionName}
            onSave={renameSession}
            title="Rename campaign"
          />
        ) : (
          snapshot.sessionName
        )}
      </span>
      <span className="code">Code: {snapshot.sessionCode}</span>
      {snapshot.round > 0 && (
        <span className="round-chip" title="Combat round">
          Round {snapshot.round}
        </span>
      )}
      <span className="active-map">
        {isDm ? 'Active' : 'Map'}: {isDm ? activeMap : snapshot.map?.name ?? '—'}
        {prepping && <em> · prepping: {prepping}</em>}
      </span>

      {/* The map's Measure/Scale/Fog menus are portaled in here by MapStage. */}
      <div id="map-tool-slot" className="map-tool-slot" />

      <div className="topbar-actions">
        <button className="btn tiny" onClick={leave} title="Load or import another session">
          {isDm ? 'Load session' : 'Leave'}
        </button>
        <button
          className="btn tiny"
          onClick={() => setGuideOpen(true)}
          title="Controls & guide (desktop + mobile)"
        >
          ❔ Guide
        </button>
        {isDm && (
          <>
            <button
              className="btn tiny"
              onClick={() =>
                window.open(
                  `/dm/data?code=${snapshot.sessionCode}`,
                  '_blank',
                  'noopener',
                )
              }
              title="Open the battlefield dashboard in a new window (second screen / tablet)"
            >
              🗔 Data view
            </button>
            {hasRulebook && (
              <button
                className="btn tiny"
                onClick={() => openRulebook()}
                title="Read / search the uploaded rulebook"
              >
                📖 Rulebook
              </button>
            )}
            <button className="btn tiny" onClick={() => setSettingsOpen(true)}>
              ⚙ Settings
            </button>
            <button
              className="btn tiny"
              onClick={() => navigator.clipboard?.writeText(playerLink)}
              title="Copy the player join link"
            >
              Copy player link
            </button>
          </>
        )}
      </div>

      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
      {guideOpen && <GuideModal onClose={() => setGuideOpen(false)} />}
      {isDm && <RulebookViewer />}
    </header>
  );
}
