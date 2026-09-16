# Player HUD revision 14 - extended nine-ring resource wing

Local player-preview presentation only. No campaign migration, new resource
automation, DM layout changes, or production deployment.

## Scope

- Concentric resources accept up to nine eligible rings instead of five.
  The existing orb center, 27px radius increments, 17px gemstone controls,
  jewel rungs and symbol baseline (42px above the art's bottom) are unchanged.
- The sixth through ninth ring extend the corner to the right. Characters
  with five or fewer rings retain the original width. At a 1366px viewport
  and the default 85% scale, the full nine-ring HUD is approximately 411px
  wide, compared with approximately 303px for the ordinary layout.
- The shared player-root width controls both the HUD and bottom roll/chat
  overlay clearance. The custom-resource expander remains beside the rings.
- The extended filigree is composed from the existing branch artwork's
  separate end pieces and alternating middle sections. The guardian art,
  health orb and AC stay fixed. The original short branch remains in use
  for the ordinary layout; no source bitmap was altered.
- The extension depends on actual saved rows, not class/level-derived slots.
  It does not insert empty levels or change counters/maxima. Existing large
  pools (over eight), geometric exceptions, and rows beyond nine retain the
  accessible compact continuation. Custom trackers retain their drawer.

## Preview boundary

The nine-level visual demonstration uses a disposable copy with explicit
sample spell-slot rows I-IX. Those sample slots are not added to the user's
actual preview character or production campaign. Existing characters simply
gain room to display additional saved rows when needed.

## Validation

Client build and client/server TypeScript checks passed. All 21 pure geometry
tests passed, including all three guardian geometries at 184/204/224px orb
sizes, nine-ring spacing and unchanged first-four ring positions.

Final map-backed screenshots and receipt:
`preview-evidence/nine-resource-rings-2026-09-16T17-11-23-401Z/`.

- 12 guardian/viewport/scale cases: three guardian artworks, 1366x768 and
  1920x1080, 85% and 100% UI scale; 24 full/corner screenshots.
- All nine rings and their controls were present and hit-tested; measured
  points followed the actual orb's circle center with less than 1px error.
- Default laptop HUD width measured 411.390625px. At 100%, it is 484px.
- No browser errors; copied counters unchanged by viewing. Read-only source
  database and WAL hashes matched before/after the complete capture.
- Receipt records served asset hashes for `index-DP8AUQ9b.js` and
  `index-Djs94DZy.css`. Root inspected the final laptop corner screenshot.

The example retains the existing Sorcery Points continuation above the orb
because it is a tenth resource group, not a duplicate spell row. This revision
adds nine-ring capacity; it does not redesign that existing overflow UI.

All 11 focused Chromium tests passed in 30.3 seconds (new nine-ring cases plus
existing resource gem/sigil tests). They cover editor/custom clicks, exact
circle/baseline geometry, unchanged first-four points on expansion, compact
width reset, bottom-feed clearance, capacity persistence and gem effects.
The initial test fixture omitted a map, so the existing map-mounted feed was
absent; adding a disposable map corrected the fixture without changing app
behavior or weakening assertions. Disposable ports 4099 and 4283 stopped.

An unchanged-counter Vanec comparison was also captured under
`preview-evidence/nine-resource-rings-2026-09-16T17-12-51-535Z/`.
