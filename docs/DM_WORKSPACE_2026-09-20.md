# DM workspace refresh

The DM battlefield now fills the available workspace. The charcoal panels, gold
borders and locally bundled Cinzel headings match the player HUD, while the DM
retains its own controls and all existing server-authoritative actions.

- A compact top-left button row opens Maps, Creatures, Initiative, and Chat & dice.
- The token inspector opens on selection or the existing inspect action. Both
  panels close explicitly and resize with pointer or keyboard; widths persist
  locally per campaign. Hidden panels stay mounted to preserve in-progress input.
- The bottom turn bar exposes the current combatant and Next turn without
  requiring an open initiative panel. Full encounter management remains inside.
- Campaign-wide actions move into a native disclosure menu. Map measurement,
  fog, annotation and tile tools remain in the toolbar.
- On narrow screens the drawers sit below the menu and view controls. Picking a spawn closes the
  drawers to expose the map; without pins, opening a panel replaces the previous
  panel. Pinned panels can share a column on narrow screens too.
- A campaign with no map opens Maps immediately. Existing sidebar preferences
  are left intact for the separate data/library views, which retain their layout.
- The same full-resolution models and Overhead/45-degree and 2D/3D preferences
  remain available. No server schema, campaign data, or character art changes.

Validation covers actual DM authentication, all three GLBs, independent view
preferences, field retention, resizing, initiative advancement, mobile token
placement, inspector access, resource editing, chat history and session settings.
Preview recordings use the approved map and copies of the campaign character
sheets in a disposable database; the installed campaign is not modified.

Implementation is on claude/Dev. A commit or preview does not deploy the running
server, and a PR is opened only on request.


## Verified result

- Server/client typechecks and production build passed.
- 609 unit tests across 65 files passed.
- Complete browser suite after pinning and box selection: 118 passed in 4.0 minutes.
- Desktop and 430px phone viewport captures reviewed, including corrected drawer
  placement beside the tool rail. Phone behavior is browser emulation.
- Campaign-style walkthrough: 1920x1080 H.264, 25.57 seconds, no browser errors.

[DM workspace walkthrough](https://dnd.nic024i.app/uploads/dm-workspace-tour-18285d9b0028.mp4)

## Pinned panels and box selection

Every panel header has a Pin button, including the token inspector. The first
pinned panel determines the column. Opening another panel divides that column's
available height equally, with an 8px gap and an independent content scrollbar
for each panel. Pin additional panels to retain them when opening a third tool.
Closing a panel also removes its pin; unpinning leaves it open until replaced.
Pins and their order persist in this browser per campaign. Panel instances stay
mounted through column changes, preserving map, creature and chat drafts.

Hold Ctrl and drag the mouse on the battlefield to select tokens whose base
centers fall inside the rectangle. Ctrl+Shift-drag adds to the selection;
Ctrl-click retains the existing individual toggle. Escape cancels a held box.
The same selection feeds the existing group inspector and bulk actions.

The rectangle uses screen coordinates and compares projected base centers,
including the 45-degree perspective transform. Captured pointer events prevent
map panning or token dragging while drawing the box. It is available in normal
DM map interaction; placement, measurement, fog, tile and save-resolution modes
retain their own gestures. Players retain their existing controls.

Browser coverage checks two- and three-panel layouts, pin restoration, retained
drafts, right-column and phone layouts, base selection in both views, additive
and reverse drags, Ctrl-click, cancellation, unchanged token state and unchanged
camera position. Preview uses the production client with a disposable campaign
copy, Druk, Varis, Vanec and six monsters.

The new recording is 22.8 seconds of 1920x1080 H.264 with no browser errors.
Its full decode passed, a decoded frame and desktop/phone captures were reviewed,
and the public download matches the local SHA-256. Typechecks, all 609 unit
tests, the production build and all 118 browser tests passed for this revision.

[Pinned panels and box selection demonstration](https://dnd.nic024i.app/uploads/dm-pins-selection-073cc5a86daf.mp4)

## Menu placement revision

The five menu buttons now form a 44px-high horizontal row at the top left.
Left panels start at the same 14px margin, recovering the 82px previously used
by the separate vertical menu column. Desktop view controls remain at the top
right. Below 1000px, the controls sit below the menu; phone panels use the full
width between 8px margins. At 320px the wrapped controls retain clearance above
the panels. Pinning, saved widths, drafts and box selection keep their behavior.

Production build, typechecks, 609 unit tests and the five focused DM browser
tests passed for this CSS revision. Existing browser assertions cover menu,
view-control and panel separation at desktop, tablet and phone widths, including
320px. Reviewed campaign preview: 25 seconds, 1920x1080 H.264, no browser errors,
successful full decode and hash-verified public download.

[Top-left menu preview](https://dnd.nic024i.app/uploads/dm-top-menu-f279014c1c45.mp4)
