import { useState } from 'react';

type Tab = 'desktop' | 'mobile';

const ROW = (keys: string, what: string) => ({ keys, what });

const DESKTOP = [
  ROW('Left-click a token', 'Select it (right panel shows its sheet / actions)'),
  ROW('Shift / Ctrl-click', 'Add to a multi-selection'),
  ROW('Drag a token', 'Move it (DM: anything · player: your PC + friendly creatures)'),
  ROW('Double-click a token', 'Open its read-only details (players)'),
  ROW('Right-click a token', 'Floating action menu — attacks/abilities of the SELECTED token against this one'),
  ROW('Drag empty map', 'Pan · mouse wheel = zoom · "Fit" recenters'),
  ROW('Delete / Backspace', 'Delete the selected token(s) (DM)'),
  ROW('Esc', 'Cancel placement / close menus'),
  ROW('Measure ▾ menu', 'Drag a cone/circle/line/square; click a shape to remove it'),
  ROW('Scale ▾ menu', 'Set the map’s real width / drag a reference line / hide the grid'),
  ROW('Fog ▾ menu', 'Paint the two fog layers; reveal all / cover all'),
  ROW('Section ⠿ grip', 'Drag to reorder panel sections; ▾ collapses one'),
  ROW('Chat box', 'Type a message — or /roll 2d6+3 (optionally adv/dis) to roll'),
];

const MOBILE = [
  ROW('Tap a token', 'Select it'),
  ROW('Drag a token', 'Move it (your PC + friendly creatures, as a player)'),
  ROW('Hold a token (~½ s)', 'Opens the floating action menu — release keeps it open; tap away to close'),
  ROW('Double-tap a token', 'Open its details (players)'),
  ROW('Pinch', 'Zoom the map; one-finger drag pans'),
  ROW('Edge tab / ‹ ›', 'Open or collapse a side panel (they overlay the map)'),
  ROW('Section ▲ / ▼', 'Reorder panel sections (drag isn’t available on touch)'),
  ROW('"Placing … ✕ Done"', 'Tap Done to stop dropping spawned tokens'),
  ROW('Round field', 'DM taps the number in the Initiative header to re-count'),
];

/**
 * A controls reference for both roles (Settings is DM-only, so this lives on its
 * own "?" button). Two tabs: desktop (mouse/keyboard) and mobile (touch).
 */
export function GuideModal({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<Tab>(
    typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches
      ? 'mobile'
      : 'desktop',
  );
  const rows = tab === 'desktop' ? DESKTOP : MOBILE;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal guide-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>Controls &amp; guide</h3>
          <button className="btn tiny" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="guide-tabs">
          <button
            className={`btn tiny ${tab === 'desktop' ? 'on' : ''}`}
            onClick={() => setTab('desktop')}
          >
            🖥 Desktop
          </button>
          <button
            className={`btn tiny ${tab === 'mobile' ? 'on' : ''}`}
            onClick={() => setTab('mobile')}
          >
            📱 Mobile
          </button>
        </div>

        <table className="guide-table">
          <tbody>
            {rows.map((r) => (
              <tr key={r.keys}>
                <th>{r.keys}</th>
                <td>{r.what}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <p className="muted">
          Full feature tour: <strong>FEATURES.md</strong> in the project folder.
        </p>
      </div>
    </div>
  );
}
