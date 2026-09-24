# Character miniatures on the battlefield

Druk, Varis and Vanec now use their assembled 3D models in both DM and player
map views. The resolver matches existing PC names, ignoring case and surrounding
whitespace. No campaign migration or manual token replacement is required.
Portraits remain in character sheets and provide the map fallback until a model
has actually rendered, or if loading/WebGL fails.

The battlefield defaults to directly **Overhead**. Each player can select
**45?** as the tilted alternative beside the zoom controls. The choice is saved in that
player's browser and never broadcast to other players; it applies across maps
and sessions on that browser. Switching preserves the current zoom and center
point. Flat mode uses a true overhead camera and a square, uncompressed grid.

The separate **Tokens: 2D / 3D** buttons beside the view controls choose token
appearance. 3D is the default; 2D restores the original token art, names and
crowns. This preference is saved per player in that browser and does not change
anyone else's view, camera angle, token position or facing. Selecting 2D unloads
the miniature renderer; reloading with 2D selected skips model downloads.
Selecting 3D loads the models again, with the existing portrait fallback while
they load or if rendering fails. The DM has the same local choice.

Existing map pixels remain the authoritative coordinates. The 45-degree view
uses perspective: its far edge recedes and squares get larger toward the viewer.
Konva's ground canvases receive a projective CSS matrix matching the Three.js
perspective camera. Pointer registration applies the inverse before Konva hit
testing and dragging, including touch events. Overhead stays orthographic.
Fit-to-window accounts for the wider near edge. Measurements,
dragging, panning, zooming, selection, object/decal placement and touch gestures
continue to operate in map coordinates. The map artwork remains a flat plane;
painted walls do not acquire height.

Ruler and AOE snapping uses the map's grid offsets as well as its cell size,
so a shifted grid's visible intersections are valid snap targets. A browser
regression draws a 15-by-20-foot diagonal and verifies its 25-foot distance,
saved endpoints, and a freehand stroke's original map coordinates.

PC name labels and crowns are hidden once a miniature is ready. Both remain
visible on the 2D fallback in DM and player views, including after WebGL failure.
Flat tokens render on a separate ground canvas below the miniature canvas, so
monsters in rear squares no longer cover the figures. Ready miniature HUDs and
shared map tools stay on the foreground canvas. All three Konva layers pan and
zoom together; their existing hit regions and permission checks remain active.
Health bars, condition markers, turn
indicators and combat-role badges retain their existing behavior. Konva owns
all input and the token footprint; the transparent Three.js layer ignores
pointer events. The renderer receives only tokens in the role-filtered snapshot.
DM-hidden tokens are translucent; player-hidden tokens are not instantiated.

Ready miniatures accept clicks, taps, context menus and drags only within their
circular base footprint, regardless of the old portrait shape. Figure geometry,
weapons and health/status decoration never enlarge that target. At 45 degrees
the circular footprint projects to the same ellipse as the ground plane.

Miniatures face their last move's direction. The server derives `facing` from
the previous and accepted map coordinates and persists it in an additive SQLite
column. Existing tokens start facing south; stationary moves preserve heading.
All viewers receive the same heading, including after reconnecting. Drag previews
turn immediately, then reconcile with the authoritative snapshot. Rotation is
around the base center and does not rotate health bars or change the hit region.
While a drag is held, its start remains the last committed position: moving the
cursor around previews the start-to-current direction before release. Each
subsequent drag begins from its own starting position, even in the same turn.

The active-turn ring for a ready miniature is a pulsing mesh on the ground
plane, using the same depth buffer as the figures. The base, body and weapons
occlude its rear arc; it follows the token during held drags. Reduced motion
keeps the ring steady. The original 2D ring returns with portrait fallback.

Druk's terrain top and four small stones use a generated 1254-by-1254 cooled
basalt texture with restrained bump relief and a charcoal material tint. The
original geometry, foot contact, brass rim and orb inlay are retained. The PNG
is a separately hashed runtime asset, applied through planar UVs at load time;
the archived source GLB remains unchanged. See the
[texture provenance and prompt](token-generation/DRUK_BASE_BASALT.md).

## Runtime assets

The authoritative bundle is
[`client/public/miniatures/manifest.json`](../client/public/miniatures/manifest.json).
It records each file's complete SHA-256, byte length, triangle count, source
revision/hash, native base center and diameter. A model's base scales uniformly
to its token's existing footprint. Source transforms stay below that outer
normalization group, preserving Vanec's animated components.

| Character | Selected source | Triangles retained |
| --- | --- | ---: |
| Druk | v9 final-07, decorated base and fitted hip axes | 916,637 |
| Varis | v5 anatomical wrist fit 07, followed by weapon alignment 01 | 905,238 |
| Vanec | v4 assembly-04, reconstructed staff and fitted ruby effects | 1,138,771 |

These are losslessly compressed delivery copies of the approved high-resolution
models. Full geometry and original embedded image bytes are retained: there is
no runtime simplification, atlas resizing or lossy texture re-encoding. The
originals remain unchanged. Meshopt compression requires the bundled decoder.
Compression receipts verify decoded vertex/animation bytes and oriented triangle
equivalence (the codec may rotate a triangle's three indices cyclically).

Vanec retains the original `Vanec_Crimson_Arc_Pulse` geometry animation and all
16 channels. Its matching FX sidecar drives material emissive intensity. The
runtime does not add per-token point lights or bloom. The animation runs at up
to 24 frames per second, pauses when the page is hidden and respects reduced
motion. Rendering uses one canvas, shared geometry/textures and a pixel ratio
limited to 2 on high-density screens. Three.js loads only when a supported PC
token is present.

Vanec's new shaft and dedicated crown come from separate four-view 3D
reconstructions. The two ruby glow surfaces were fitted to the new gem;
the animation keyframes, other lightning components, and FX sidecar remain
unchanged. This fitting is part of the selected source model, before lossless
delivery compression.

Varis reuses the accepted Druk glove sculpts, as requested after review of the
replacement-hand trials. These gloves originated in the Druk v7 four-view
reconstruction and were extracted without altering their geometry or textures
for v8. Fitting them to Varis uses measured nonuniform wrist scaling, a bounded
trim of connected proximal cuff/crease faces, and two short internal leather
overlaps. Retained source vertex, normal, UV and image bytes are exact; world
proportions change through the measured transforms. The finger topology is
retained. The selected hand geometry follows anatomical-wrist candidates 01,
06 and 07;
the rejected hand reconstructions, cuff deformations and candidate 08 tint
are excluded. Minor original bracer faceting and a leather seam remain visible
in closeups. This is a digital overlapping attachment, not a welded print mesh.

Varis's new shortsword and dagger come from separate source-guided four-view
reconstructions, with native UV projection from the approved reference images
and bounded cutting-edge corrections. The selected weapon sources are
`shortsword/projected-04` and `dagger/projected-02`. Their complete blades and
materials are retained in the fitted source model.
The final weapon-only adjustment rolls both blade planes more vertically and
aligns the actual handles to the measured glove openings. It changes two rigid
weapon transforms while preserving their geometry, materials and scale, plus
all 53 other mesh nodes from the selected wrist assembly.

The selected reference artwork, prompts, generation receipts, fitting audits
and actual model review renders are archived under
[runtime provenance](../assets/miniatures/runtime-provenance/manifest.json).
Its manifest records exact hashes and
distinguishes reference images from renders of exported geometry. Historical
receipts retain their original stage status; the final selection and visual
review determine which model ships.

## Retrieve, build and verify

The runtime GLBs use Git LFS, as do the older review assets. Retrieve the real
binaries before building; a source ZIP may contain only LFS pointers.

```sh
git lfs install
git lfs pull --include="client/public/miniatures/*.glb"
node scripts/token-assets/validate-runtime.mjs
npm run typecheck
npm test
npm run build
npx playwright test -c e2e/playwright.config.ts
```

PowerShell users can use `npm.cmd` and `npx.cmd`. Set `PW_CHROMIUM` to an installed
Chrome executable if Playwright's bundled browser is unavailable.

The runtime validator checks exact hashes, embedded buffers/images, base
metadata, animation/material references, source triangle counts and original
embedded image hashes. Browser tests use the production build, real GLBs and a disposable test
database. They exercise miniature name suppression and fallback labels/health,
rear-monster occlusion using actual screenshot pixels, tilted drag coordinates, role-hidden
tokens, mobile tap/pinch, shifted-grid rulers, annotation coordinates, separate
players' flat/tilted preferences, reload persistence and rendering-failure fallback. Desktop Chrome touch
emulation verifies layout and interactions; it is not a physical-phone FPS
benchmark.
Run the full browser suite for release because the shared map projection also
affects interactions outside the miniature-specific tests. The final bundle
passed all 107 browser tests across 21 files, with no failures, skips or flaky
results, plus 598 server tests, both typechecks and the production build.
The original eight reviewed screenshots covered desktop/mobile, zoomed and
flat views, projected rulers and the context-loss fallback. The layering fix
also has reviewed full-map and close-up captures at 45 degrees, with six 2D
monsters including three directly behind the player figures. The live default
is overhead, with 45 degrees available as the per-player alternative.

## Deployment

This is a client-only change: no server source, database schema, campaign,
character stats or uploaded map needs updating. Build from `claude/Dev` under
the repository's normal development workflow. A static-client deployment can
copy the built assets first and switch `index.html` last, retaining older hashed
assets for already-open clients. Refresh the browser to load the new bundle.
The normal installer still tracks `claude/Main`; a development build is not a
claim that this change has been merged into that stable branch.

## DM view parity verification

The DM uses the same MapStage and full-detail MiniatureLayer as players. Both
roles default to 3D tokens and an overhead battlefield, and offer 2D/3D and
Overhead/45-degree controls beside zoom. Preferences belong to the browser
identity; changing the DM view does not broadcast a change to players.

A dedicated browser regression signs in as DM with a separate player connected,
loads all three actual GLBs, toggles both choices, checks persistence after
reload, and confirms player preferences and server token positions stay unchanged.
The check captures the DM screen in both 3D views and asserts no page errors.
No renderer change was needed to provide this parity.

## Character figure sizing

The player Character window and the DM inspector's DM tools section include
a compact 3D size row for characters with a miniature. Enter a base width in feet, use
the half-foot smaller/larger controls, or choose **Fit to map** to restore 5 feet
across. A character without a placement sees disabled controls and placement
help. The control remains available when that viewer switches to 2D tokens.

The setting reuses the token's saved `widthFt`, shared with all viewers on that
map. The full figure scales uniformly around its base. Rendering, base-only hit
testing, health bars and map tools use that same width; positions and facing
are unchanged. No separate visual-size override or new schema is introduced.
Fit uses physical map scale: with 100px squares at 5 feet it produces a 100px
base; with those squares at 10 feet it produces a 50px base. Later map-scale
changes preserve the selected width in feet automatically.

The resize handler permits the character's claiming player on the active map
and the DM within the same campaign. Unjoined clients, other characters,
player-controlled monsters, hidden or staged player placements, and foreign
campaign tokens cannot be resized by players. The existing finite width limits
and half-foot normalization remain in force.

Validation includes registered-handler ownership/session tests and a two-client
browser test with the actual models: player-to-DM and DM-to-player updates,
Fit after an uncommitted input, 5- and 10-foot grid scales, tilted base hits,
position/facing preservation, reconnect persistence, and phone controls.

Initial sizing feature verification: server/client typechecks and production build passed;
612 unit tests in 66 files and all 119 browser tests passed (3.8 minutes).
Desktop/phone captures and the decoded 13.8-second campaign-preview video were
reviewed. Preview used disposable data; the live campaign was not updated.

[Figure sizing and Fit to map preview](https://dnd.nic024i.app/uploads/figure-size-fit-to-map-b249da5c0d4c.mp4)

The compact UI revision removes the separate card, heading and explanatory
paragraph. The width label, stepper and Fit button share a 28px row (about 24px
at the player's default interface scale). Help is available in tooltips; a
placement hint only appears when the character is not on the map. The DM row
is in DM tools with the other token controls, and no longer in Sheet info.

Compact revision verification: typechecks, build and all 612 unit tests passed.
Three focused browser tests passed, covering DM workspace/pinned panels and
two-client sizing, map scale, persistence and phone controls. Browser checks
assert the row stays at most 32px tall on desktop and phone. Campaign-copy
screenshots were reviewed with all three full models loaded and no page errors.

[Compact DM controls](https://dnd.nic024i.app/uploads/dm-compact-3d-size-3aef560f727b.png) ·
[Player Character controls](https://dnd.nic024i.app/uploads/player-compact-3d-size-75fb0dea2525.png) ·
[Phone controls](https://dnd.nic024i.app/uploads/phone-compact-3d-size-491f23a3c679.png)
