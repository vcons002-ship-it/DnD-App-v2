# Player HUD revision 16 - custom resources fill available rings

Player-only local preview. Existing characters, resource amounts, saved order,
manual corrections and automatic spending are unchanged. No production deploy.

## Changes

- Every saved tracker participates in rack selection, rather than custom
  resources going straight to the drawer. Display priority is spell slots
  (natural numeric order), recognized class resources, then custom resources.
  Class/custom order is stable within each tier. Unusual keys stored in the
  spell-slot group retain spell priority without being renamed or converted.
- Concentric mode uses the first ten fitting rows in that order. New spell or
  class rows push custom trackers outward and eventually into Additional
  resources. Removing a higher-priority row allows a custom tracker back in.
  Existing geometry fallback for oversized/zero-capacity pools remains intact;
  it is presentation-only and does not change their saved maxima.
- Compact mode also shows the first ten prioritized rows by default, with
  subsequent rows in the same overflow drawer. The selected layout preference
  and all DM views are unchanged.
- Custom medallions use their existing initial artwork, with full names on
  hover/focus and in the existing max/remaining editor. Captions do not overlap
  adjacent arcs. Socket/gem effects and click behavior are unchanged.
- The recording helper now opens the drawer only when actual overflow exists,
  instead of demonstrating an empty custom-only drawer.

## Current saved-character preview

`preview-evidence/current-character-resources-2026-09-16T17-38-50-225Z/`

- Vanec: six arcs, I/II/III, Sorcery Points, Cloak Spell Slot and AZUTH'S
  Knowledge; 340px corner width at 85% scale on 1366x768.
- Druk: three arcs, Second Wind, Action Surge and Superiority Dice.
- Varis: two arcs, I and II. Druk/Varis retain the 302.6px corner width.
- All remain level 6 with their exact saved amounts. No test counters were
  added. Six full/corner screenshots came from a disposable read-only backup
  of the existing preview campaign; source database and WAL hashes match.
- All measured controls were clickable; circle alignment error below .017px;
  no browser errors. Root and independent review inspected the implementation
  and receipt; root visually inspected the new Vanec corner.

## Validation

- Client/server TypeScript checks and client build passed.
- 36 focused unit tests passed: presentation priority, resource geometry and
  counter-preservation behavior.
- All 18 focused Chromium tests passed in 44.6 seconds, including custom
  in-ring editing, insertion-independent priority, pushing into overflow,
  re-entry when a priority row is removed, compact first-ten ordering and
  persistence after reload. Existing geometry, gem and player-HUD cases pass.
- One old test assumed the overflow icon always sits right of every ring.
  Its existing five-ring narrow-layout fallback is now tested explicitly:
  insufficient side room, exactly 30 logical pixels below the label baseline,
  no control overlap, full viewport containment and a clickable center.
- Served preview assets: `index-DnIwFbcM.js` / `index-CWejdXgz.css`.
- Original production4000 and preview4276 processes remain unchanged. Only
  preview client assets were rebuilt; no updater, service restart or campaign
  migration ran.
- Disposable 4099 and 4283 services stopped after verification.
