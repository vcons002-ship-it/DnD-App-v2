import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { StateSnapshot } from '../../../shared/types';
import { useStore } from '../state/socket';
import { SettingsModal } from './SettingsModal';
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
  const isDm = snapshot.role === 'dm';

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
    </header>
  );
}
