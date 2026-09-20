# Character miniatures on the battlefield

Druk, Varis and Vanec now use their assembled 3D models in both DM and player
map views. The resolver matches existing PC names, ignoring case and surrounding
whitespace. No campaign migration or manual token replacement is required.
Portraits remain in character sheets and provide the map fallback until a model
has actually rendered, or if loading/WebGL fails.

The battlefield defaults to 25 degrees from overhead. Each player can select
**Tilted** or **Flat** beside the zoom controls. The choice is saved in that
player's browser and never broadcast to other players; it applies across maps
and sessions on that browser. Switching preserves the current zoom and center
point. Flat mode uses a true overhead camera and a square, uncompressed grid.

Existing map pixels remain
the authoritative coordinates: Konva projects the ground with a cosine Y scale,
and an orthographic Three.js camera uses the same projection. Measurements,
dragging, panning, zooming, selection, object/decal placement and touch gestures
continue to operate in map coordinates. The map artwork remains a flat plane;
painted walls do not acquire height.

Ruler and AOE snapping uses the map's grid offsets as well as its cell size,
so a shifted grid's visible intersections are valid snap targets. A browser
regression draws a 15-by-20-foot diagonal and verifies its 25-foot distance,
saved endpoints, and a freehand stroke's original map coordinates.

Name labels sit above each miniature. PC crowns are hidden once a miniature is
ready and remain visible on the 2D fallback in both DM and player views.
Health bars, condition markers, turn
indicators and combat-role badges retain their existing behavior. Konva owns
all input and the token footprint; the transparent Three.js layer ignores
pointer events. The renderer receives only tokens in the role-filtered snapshot.
DM-hidden tokens are translucent; player-hidden tokens are not instantiated.

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
database. They exercise labels/health, tilted drag coordinates, role-hidden
tokens, mobile tap/pinch, shifted-grid rulers, annotation coordinates, separate
players' flat/tilted preferences, reload persistence and rendering-failure fallback. Desktop Chrome touch
emulation verifies layout and interactions; it is not a physical-phone FPS
benchmark.
Run the full browser suite for release because the shared map projection also
affects interactions outside the miniature-specific tests. The final bundle
passed all 106 browser tests across 21 files, with no failures, skips or flaky
results, plus 598 server tests, both typechecks and the production build.
Eight actual browser screenshots were reviewed, covering desktop/mobile,
zoomed and flat views, projected rulers and the context-loss fallback.

## Deployment

This is a client-only change: no server source, database schema, campaign,
character stats or uploaded map needs updating. Build from `claude/Dev` under
the repository's normal development workflow. A static-client deployment can
copy the built assets first and switch `index.html` last, retaining older hashed
assets for already-open clients. Refresh the browser to load the new bundle.
The normal installer still tracks `claude/Main`; a development build is not a
claim that this change has been merged into that stable branch.
