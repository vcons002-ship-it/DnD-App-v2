import { useState } from 'react';

type Tab = 'desktop' | 'mobile';

const ROW = (keys: string, what: string) => ({ keys, what });

const DESKTOP = [
  ROW('Left-click a token', 'Select it (right panel shows its sheet / actions)'),
  ROW('Shift / Ctrl-click', 'Add to a multi-selection'),
  ROW('Ctrl-drag (DM)', 'Box-select token bases; hold Shift as well to add to the selection. Esc cancels.'),
  ROW('Pin a DM panel', 'Keep it open; additional panels stack in the same column. Unpin or close to free the space.'),
  ROW('Campaign > window controls (DM)', 'Close unpinned windows keeps pinned panels. Reset window layout restores default sides, sizes and pins without losing drafts.'),
  ROW('Drag a window header', 'Dock DM windows or player Combat/Chat left or right. Pinned DM windows move together. Focus the header and use Left/Right, or Esc to cancel a drag.'),
  ROW('Drag a token', 'Move it (DM: anything · player: your PC + friendly creatures)'),
  ROW('Double-click a token', 'Open its read-only details (players)'),
  ROW('Right-click a token', 'Floating action menu + sets it as your Combat-section target'),
  ROW('Drag empty map', 'Pan · mouse wheel = zoom · "Fit" recenters'),
  ROW('Delete / Backspace', 'Delete the selected token(s) (DM)'),
  ROW('Esc', 'Cancel placement / close menus'),
  ROW('Measure ▾ (DM: Tools)', 'Drag a cone/circle/line/square; click a shape to remove it'),
  ROW('Scale ▾ (DM: Tools)', 'Set the map’s real width / drag a reference line / hide the grid'),
  ROW('Fog ▾ (DM: Tools)', 'Paint the two fog layers; reveal all / cover all'),
  ROW('Ctrl+V on the map', 'Paste a copied image as an object token or scenery decal (DM)'),
  ROW('Section ⠿ grip', 'Drag to reorder panel sections; ▾ collapses one'),
  ROW('Chat box', 'Type a message — or /roll 2d6+3 (optionally adv/dis) to roll'),
];

const MOBILE = [
  ROW('View ▾ (phone)', 'Tilt or rotate the map, choose 2D/3D tokens and change DM visibility. Zoom and Fit stay on the toolbar.'),
  ROW('Map tools ▾ (phone)', 'Measuring and Annotate tools; DM also gets scale and fog. Use Features for walls, doors, lights and tiles.'),
  ROW('Character (phone)', 'Open your sheet, inventory, spellbook, checks/saves and party tabs. Tap the health orb for health controls.'),
  ROW('Combat + (phone)', 'The combat panel starts folded to leave the map clear. Expand it to target, attack or cast; fold it again when exploring.'),
  ROW('Combat and Chat', 'Panels share available height when they would overlap. Their saved sizes return on a larger screen.'),
  ROW('Drag a window header', 'Dock DM windows or player Combat/Chat left or right; the highlighted side shows where it will land. DM windows stay full width on phones.'),
  ROW('Tap a token', 'Select it'),
  ROW('Drag a token', 'Move it (your PC + friendly creatures, as a player)'),
  ROW('Hold a token (~½ s)', 'Floating action menu + sets it as your Combat-section target — release keeps it open'),
  ROW('Double-tap a token', 'Select it and open the right panel with its details'),
  ROW('Pinch', 'Zoom the map; one-finger drag pans'),
  ROW('Edge tab / ‹ ›', 'Open or collapse a side panel (they overlay the map)'),
  ROW('Section ▲ / ▼', 'Reorder panel sections (drag isn’t available on touch)'),
  ROW('"Placing … ✕ Done"', 'Tap Done to stop dropping spawned tokens'),
  ROW('Round field', 'DM taps the number in the Initiative header to re-count'),
];

/**
 * A controls reference for both roles, on its own "?" button. Two tabs:
 * desktop (mouse/keyboard) and mobile (touch).
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
