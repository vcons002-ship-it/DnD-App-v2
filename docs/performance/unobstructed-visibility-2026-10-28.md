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

## Validation deferred during the active campaign

Only source/diff review was performed. No tests, typechecks, builds, benchmark
runs, live campaign requests, deployments or service restarts were run for this
change. Regression cases were added for later execution: unobstructed daylight,
openings, closed barriers, missing origins, dark lighting, independent token fog,
per-view preview pending state, skipped worker jobs, and early terrain-raster
bypass. Runtime behavior and performance improvement remain unverified.

The change is prepared in an isolated worktree. It is kept local while tests are
prohibited; publishing the commit would trigger the repository's CI workflow.
