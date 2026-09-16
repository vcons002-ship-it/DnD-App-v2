# Player HUD revision 15 - tenth ring and shared resource overflow

Player-only local-preview presentation. No changes to resource counters,
automatic spending, class rules, campaign saves, DM layout or production.

## Changes

- Ten eligible concentric resource rings now fit around the existing orb.
  This places a fitting class-resource row, such as the saved six-use Sorcery
  Points pool, after spell levels I-IX instead of above the orb.
- The additional-resources icon moves to the right of the new outer ring.
  The corner grows just 28 logical pixels (23.8 screen pixels at 85% scale)
  beyond the nine-ring version. Circle centers, 27px radius increments,
  gemstone size, symbol baseline and guardian artwork are unchanged.
- In concentric mode, every row that cannot occupy a ring is included in
  the Additional resources drawer alongside custom trackers. This includes
  rows beyond ten, oversized pools and zero-capacity trackers. No separate
  compact overflow group remains above the orb.
- The drawer opens upward beside the outer button. Its existing scroll area,
  max/remaining editors, aggregate gem-click behavior and tracker
  management location are retained. The +Row control remains in Character.
- Compact mode continues to show core resource rows directly and uses the
  same renamed drawer for custom trackers.
- Large pools still use the existing per-ring geometry limits; they are
  accessible in the drawer, not reduced, split or silently discarded.

## Validation

Client build and client/server TypeScript checks passed. All 21 geometry unit
tests passed, including a tenth ring and unchanged inner circles.

Final closed/open screenshots and source-integrity receipt:
`preview-evidence/ten-resource-rings-2026-09-16T17-22-37-671Z/`.

- 12 matrix cases: three guardian artworks at 1366x768 and 1920x1080, each at
  85% and 100% scale; 48 full/corner closed/open screenshots.
- Ten circles and all gem/label hit targets passed geometric checks. The
  drawer was visible and accessible, and no old upper continuation remained.
- Source database/WAL hashes and copied counters were unchanged after capture;
  no page errors. The example's extra trackers exist only in its temporary DB.
- Root and independent art review inspected the final Vanec closed/open views.
  The branch retains its fixed-size end pieces and the drawer clears its icon.
- Served build: `index-CIi9Ntws.js` / `index-DZ5XHyoU.css`.

All 17 focused Chromium tests passed in 43.4 seconds: ten-ring geometry,
eleventh/oversized/zero-capacity overflow, manual max/remaining persistence,
outside-click/Escape closing, and existing player-HUD/gem/sigil regression.
One stale test-only accessible-region label was corrected to the intentional
Additional resources name; no app behavior or assertion was weakened.
Disposable test/capture ports 4099 and 4283 stopped; original 4000 and 4276
processes remained unchanged.
