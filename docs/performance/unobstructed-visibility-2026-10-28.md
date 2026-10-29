# Skip unnecessary dynamic visibility layers

The client and server share `needsVisibilityLayer`. In daylight without heavy
darkness, dynamic terrain masks are unnecessary when map sight is disabled, or
when at least one sight origin exists and there are no potential sight barriers.
Open doors and window/arch markers do not block by themselves. The gate is a
cheap wall-presence check; it never builds opening-cut polygons or casts rays
just to decide whether to skip rendering. Dim/unknown lighting, heavy
darkness, absent sight origins with map sight enabled, and remaining blockers
retain the normal path.

The fast path skips server visibility geometry jobs, Legacy mask/terrain image
preparation, and mask generation for intermediate movement poses. The browser
does not mount the Legacy/standard sight overlay and disables the 3D personal
visibility compositor for those views. DM party preview is classified separately
from the DM's own view. Existing snapshot inputs invalidate render caches when
lighting, fog settings or walls change, allowing normal masking to resume.

Painted map/token fog and the per-viewer authorized token lists remain separate.
The player vision object, collision rules, targeting, exploration history and
intermediate authorized movement snapshots are preserved. In particular, hidden
or invisible creatures can still require filtering even on an otherwise bright
map. This change does not attempt to prove that an arbitrary remembered polygon
covers every visible pixel or that opening markers remove an entire wall:
any solid wall conservatively keeps the existing dynamic layers.

## Validation after the campaign

After the user ended the campaign and authorized testing, the full isolated
unit suite passed: 2,403 tests across 244 files. Client/server typechecks and
production builds passed. Coverage includes unobstructed daylight, openings,
closed barriers, missing origins, darkness, independent token fog, per-view
pending state, skipped worker jobs, and early terrain-raster bypass.

The browser fog regression now verifies both Legacy and standard player views:
automatic fog can remain enabled on an unobstructed daylight board without
mounting a visibility layer; enabling heavy darkness brings the layer back;
returning to daylight removes it again. Manual reveal/re-cover pixels remain
correct. Separate browser checks preserve camera concealment and prepared
movement through darkness for players and DM preview with assistance on/off.

An older retained-rendering test expected a geometry worker on unobstructed
daylight. Its fixture now uses dark lighting so it still verifies geometry
reuse/invalidation on a board that actually needs a mask.

Tests used disposable databases/uploads and a separate port. No live campaign
data, served frontend, or running DnDServer service was changed. See
[navigation and manual-fog follow-up](navigation-fog-2026-10-28.md) for the
additional optimizations and before/after measurements.
