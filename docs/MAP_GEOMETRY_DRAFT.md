# Map geometry drafts (experimental)

## One-click walls, doors and lights

DM: **Walls → Suggest walls, doors & lights** starts all three existing image
API workflows immediately. Walls now use the two-pass process below; doors and
lights each receive the original base map with their own prompts and masks
(cyan doors, magenta light sources). Individual workflow buttons remain available.

The combined review shows progress for each analysis and previews the selected
results together over the map. Switch tabs to select walls, doors or lights;
**Show mask** displays the selected mask; wall masks have a selector for the raw
structural response, raw natural-boundary response and combined import. Doors are fitted against
existing walls plus the new walls currently selected, so deselecting a jamb can
disable its door until the jamb is selected again. Incorrect doors still need
to be deselected; suggestions without two suitable jambs cannot be applied.

**Apply selected setup** validates every selected draft and saves the complete
selection in one transaction, then broadcasts one map update. Doors start
closed and unlocked. Lights use the existing art, with no added 3D fixture.
The base image and existing map features are preserved. If one analysis fails,
**Retry walls/doors/lights** reruns only that step; successful drafts and their
selections stay available. After all requests finish, successful results can
also be applied without the failed step. **Run all again** explicitly replaces
all three drafts. Closing without applying leaves gameplay unchanged.

`POST /api/maps/:mapId/setup-draft/apply` requires DM authentication and accepts
`{drafts, selected}` with separate `walls`, `doors` and `lights` members. The
server checks image/grid/wall/light freshness, refits doors itself and enforces
the combined geometry budget before writing anything. Tiles are not analyzed.
Normally the button makes four image requests: two sequential wall passes, one
door request and one light request. The existing connection/conversion retries
can add requests. It never combines all tasks into one image prompt.

Initial one-pass verification on 30 September 2026: one UI click made three real
Gemini mask requests on a fresh Lantern Crypt map. The combined endpoint saved
6 wall pieces, 4 fitted doors and 12 lights, preserving the image and omitting
3D light fixtures. Evidence is under `artifacts/setup-live/`. This verifies the
combined workflow, not perfect detection: the wall mask missed the horizontal
divider between the two left rooms, and door suggestions still require review.
Three Playwright tests cover one-click launch, review-dependent door fitting,
real atomic Apply, per-step retry/selection retention and DM authorization
(image generation is stubbed only in those automated browser tests). The full
server suite passed 1,059 tests; typecheck and production build passed.

## Two-pass structural walls and natural boundaries

The first request focuses only on masonry. It explicitly requests solid opaque
yellow across the entire wall-top width, covering texture and mortar seams,
and excludes outlines, border strokes and centerlines. It has no cave, pillar
or natural-boundary instructions. The previously restored prompt was the saved
second Gemini experiment on a different dungeon; its "trace" wording also
produced outlines on the crypt. The exact successful filled crypt request was
not retained, so restoring that earlier base prompt did not reproduce it.

The explicit fill prompt was tested on the same crypt image in one real Gemini
request. The raw response painted the wall tops again (some mortar detail
remained), and converted into 3 polygon pieces with 194 edges. The divider
blocked sight and movement; all four doorway routes stayed open. Evidence and
the exact request are under `artifacts/crypt-solid-pass/`. This correction only
changes the first-pass prompt; the natural-boundary pass is unchanged.

The second request receives that already annotated image and adds **green**
cave rim outlines, other solid natural rock boundaries and pillar tops. Cave
outlines follow the outer rock rim and join the yellow masonry while leaving
real entrances open. The prompt explicitly leaves ordinary built rooms alone.
Doors, furniture, stairs and water edges are excluded.

The importer keeps the first response as its base and adds only newly painted
green pixels, converted to yellow for the existing contour converter. It never
imports the second response's repainted map art or yellow wall edits. Existing
green source art is excluded, and green components mostly retracing masonry
are discarded with a review warning. This matters: an early live second-pass
test tried to recolor the crypt's walls instead of leaving them alone.

Both raw responses and the combined mask are retained for inspection. A failed
natural pass leaves the structural draft available with a warning. If the union
is too complex, the converter tries keeping the two masks as separate editable
pieces. It evaluates all existing safe tolerances, with the same 1.5-pixel bound,
wall-core/gap/coverage checks and 512-edge budget. Collapsed zero-area contour
fragments are discarded before coverage is evaluated. If the separate pieces
still cannot fit, review receives only the structural result with a warning.
Pure cave maps can still import a
natural boundary even when the first pass has no yellow wall pixels.

Standalone wall analysis has **Include cave boundaries and pillars (second API
pass)** checked by default; uncheck it to request ordinary walls only. The
one-click setup includes the second pass automatically. Review is still required:
separating requests does not make image generation deterministic or eliminate
missed boundaries. New metadata: `wallMaskImagePath`, `naturalMaskImagePath`
and `maskWarnings`; `maskImagePath` remains the exact mask sent to conversion.

Live test: both new crypt wall masks included the divider omitted in the earlier
combined-prompt run. The refined natural prompt left the crypt without new
green markings. On Twisted Vaults, it added the cave rim but missed the pillar
in the final run (the initial trial included it). The exact saved live responses
were replayed through the repaired conversion and applied in the isolated app:
4 editable pieces, 417 edges, 720 cave-enclosure sight probes with no leaks,
blocked escape through the rock rim and an open entrance. The crypt divider
blocked both movement and sight. This is workflow and conversion verification,
not a guarantee that every generated mask finds every feature. Raw images,
drafts and the explicit saved-response replay receipt are under
`artifacts/two-pass-walls/`.

Combined verification with the approved solid-fill prompt and the unchanged
natural-boundary prompt: three fresh API requests (wall, natural, door) on
Twisted Vaults produced 3 wall polygons using 423 edges and 9 door candidates.
Review excluded the lower rectangular room's empty archway; all 8 real doors,
including the cave door, fitted against the final walls. The saved setup uses
455 edges. All 8 doors passed open/closed/reclosed sight and movement checks,
184 probes across door spans and jamb joins found no leaks, and 1,440 cave
enclosure rays plus both masonry-to-cave join checks passed. The cave door's
lock also prevented opening. The natural prompt already includes other solid
rock boundaries and pillars, so it was not changed. The central pillar was
again omitted by the model; the empty archway was again a false door candidate.
Evidence and exact request metadata: `artifacts/connected-masks/`.
The real player UI also passed a closed-door drag rejection, Open action,
successful drag into the cave and Close action from inside. Both prompt strings
were checked byte-for-byte against their accepted test receipts.

## Separate door-mask workflow

DM: **Walls → Suggest doors from map art → Find doors**. This makes a separate
image API request using the original map, independent of the yellow wall mask
and magenta light mask. The API draws cyan lines along visible closed doors,
from jamb to jamb. The converter extracts each line's center, width and angle;
diagonal doors retain their orientation.

Apply walls first. Review the original art with the proposed doors or toggle
the AI mask. Open passages can be mistaken for doors and real doors can be
missed, so deselect incorrect suggestions and add missing doors manually.
Each candidate must meet existing walls on both sides within a bounded fitting
distance. Markers over solid walls, distant from jambs or already occupied by a
working door are flagged and cannot be applied. This importer only fills
existing gaps; it never cuts or replaces existing wall pieces. Use **Draw door
opening** for a door that needs to be cut through a solid wall.

**Apply** creates selected linked door objects as one transaction. Doors start
closed and unlocked and inherit the existing open/close, lock, hidden-door,
collision and visibility behavior. They can be moved or rotated with wall
editing. Original map art, existing walls and lights remain unchanged. Saved
doors use normal map persistence and campaign backups. Only the base uploaded
image is analyzed, not added map tiles.

Both `POST /api/maps/:mapId/door-draft` and
`POST /api/maps/:mapId/door-draft/apply` require DM authentication. Apply accepts
`{draft, selected}` and validates source image/grid/wall freshness, marker
geometry, selection and edge budget before creating any objects. The server
recalculates the fitted geometry; supplied open/lock state is not accepted.

Live Twisted Vaults test (30 September 2026): four Gemini image calls found
7–8 of the eight visible doors and each also marked an empty passage. The
recorded run missed the cave door. The DM deselected the false positive and
applied seven doors. All seven passed closed/open movement and sight checks;
real player dragging verified a horizontal and diagonal doorway plus closing
from the other side. The four existing wall contours were preserved exactly;
total geometry was 451 edges. Full server suite: 1,054 passing tests, plus
targeted retest after fitting adjustment. Typecheck and builds passed.

[Mask comparisons and 76-second walkthrough](https://dnd.nic024i.app/uploads/previews/door-mask-20260930/index.html).
Evidence: `artifacts/door-mask/`; recordings: `artifacts/dm-guide/31-door-*`.
This is a reviewed draft tool, not a reliable unattended door detector.

DM: **Walls → Suggest walls from map art**.

Two methods share one review screen and JSON contract:

- **Local contrast / empty space:** server-side image processing, no AI or network call. Choose darker/lighter walls, brightness threshold (0–255), and minimum wall length in grid squares. Finds long contrast bands, merges adjacent scan lines and filters broad floor regions. Best on clean top-down floor plans; painted maps often confuse floor, furniture and shadows with walls. All suggestions start unselected. The 0.55 score is a heuristic warning, not a calibrated probability; 10 ft is a placeholder height.
- **AI image analysis:** sends a resized, uncropped map image and original dimensions/grid metadata through the existing AI gateway. Ollama receives image data when local mode is configured; the configured model must support vision. Gemini is the API backup, with three connection attempts and DM notices. Image requests have a longer timeout than text requests. Invalid geometry triggers the gateway fallback too.

Click rectangles or checkboxes to select walls, then Apply. Orange dashed means unselected, gold selected, green doorway, blue obstacle. Analysis never modifies gameplay. Apply appends selected full-height wall rectangles atomically and preserves existing walls. Adjust or erase applied walls using the existing tools. Door candidates mark gaps only: use Draw door opening to create an interactive door. Obstacles and estimated heights are review/export data only; they do not yet affect shadows, movement or vision.

## API

Both endpoints require the existing DM passphrase header. They read the saved map image; clients do not send arbitrary file paths or image URLs.

`POST /api/maps/:mapId/wall-draft`

```json
{"method":"local","options":{"threshold":90,"polarity":"dark","minLengthSquares":2}}
```

For AI use `{"method":"ai"}`. The response is a `MapGeometryDraft`:

```json
{
  "version": 1,
  "method": "ai",
  "id": "generated-uuid",
  "source": {
    "mapId": "map-id",
    "imageHash": "sha256-of-original-file",
    "width": 1402,
    "height": 1122,
    "gridSizePx": 50,
    "feetPerSquare": 5,
    "gridOffsetX": 0,
    "gridOffsetY": 0,
    "wallsHash": "sha256-of-current-walls"
  },
  "items": [
    {"id":"item-0","kind":"wall","label":"North wall","ax":0.1,"ay":0.1,"bx":0.5,"by":0.12,"heightFt":10,"confidence":0.9},
    {"id":"item-1","kind":"obstacle","label":"Table","ax":0.6,"ay":0.4,"bx":0.7,"by":0.45,"heightFt":3,"confidence":0.8}
  ]
}
```

Coordinates are normalized to the entire source image: top-left origin, x right, y down. Pixel x = normalized x × image width, pixel y = normalized y × image height. Heights are feet. Image resizing preserves aspect ratio and never crops; camera zoom, pan, tilt and rotation never enter this contract. EXIF orientation is accounted for. Grid offsets are sent for analysis, not added again to returned coordinates.

`POST /api/maps/:mapId/wall-draft/apply`

```json
{"draft":"the complete returned JSON object goes here","selected":["item-0"]}
```

The server validates shape, finite values, bounds, image/grid identity, current walls, selected kinds and the existing wall-edge limit. A changed image, grid or wall set invalidates the draft. Download JSON preserves the complete draft for inspection; drafts are currently held in the review window, not saved to the campaign. Applied walls use normal map persistence and backups.

Version 1 analyzes only the base uploaded image, not separately placed map tiles. Footprints support rectangles and polygon contours with holes. Isometric floor footprints and heights are ambiguous and require human review. Separate movement/vision/shadow flags and approved obstacle persistence remain future work.


## Yellow mask experiments (29 September 2026)

The built-in OpenAI image tool produced a closer wall mask than coordinate prompting. Two independent Gemini API tests used `gemini-3-pro-image` (confirmed by the response's `modelVersion`) with the original map as image input. First attempt painted broad wall regions and altered much of the background; a targeted retry followed wall caps more closely but returned outlines rather than filled regions. These are isolated artifacts, not applied campaign walls.

The image gateway now supports reference-image input and selects the nearest supported aspect ratio instead of forcing landscape images to 3:2. It ignores intermediate thought images when saving final output. Pro generation has a longer timeout and retains the existing connection retries.

All Gemini text/JSON calls share the quality-first `gemini-3.1-pro-preview` default; image calls use `gemini-3-pro-image`. Startup upgrades the named legacy Gemini/Flash presets from env or saved settings. Other custom model names remain intact, and Settings still allows overrides. Blank model selection during a running session auto-discovers Pro first; startup resolves blank to the documented default. No live installed settings or campaign files were modified by these tests.

Model references: https://ai.google.dev/gemini-api/docs/models and https://ai.google.dev/gemini-api/docs/image-generation .


## Integrated yellow-mask drafting (30 September 2026)

The default AI method now uses the accepted second-test prompt and the configured
Gemini image model with the actual map image as reference. It no longer asks a
text model to invent rectangle coordinates. Connection retries and failure notices
use the image gateway. A failure leaves saved walls unchanged; no text-only local
fallback is used because it cannot preserve the reference-image editing contract.

The generated annotation is converted by `wallsFromYellowMask` and reviewed over
the original map. The DM can toggle the annotation, deselect suggestions, then
apply selected walls. The map art is never replaced. Existing walls are appended
to, stale drafts are rejected, and the wall-edge budget still applies. Conversion
coverage is not an accuracy score. Door gaps remain open until the DM adds doors.
AI output can still shift details; review is required, especially for isometric,
curved, or diagonal architecture. Only the base image is analyzed, not extra tiles.

Local contrast detection remains an explicitly experimental alternative.

The converter excludes yellow already present in the source image and isolated tiny flecks. Unusable masks get one image-generation retry requesting filled wall bands; persistent errors leave the map unchanged.

## Simplified walls and protected gaps

The default yellow-mask converter now fits long, supported rectangles instead of
decomposing every edge sliver into another wall. Repair and fitting tolerances
scale with the grid and are capped in the working raster. Dark yellow paint in
stone grooves is recognized only near bright annotation; unchanged warm source
art is excluded from that growth. The AI wall prompt and independent light-mask
workflow are unchanged.

Before smoothing, the converter identifies narrow unpainted cuts that connect
through a wall band. These pixels are reserved throughout fitting, merging and
connector creation. A small supported connector can seal a fitting seam, but it
cannot cross a protected opening. The interior of a solid wall is retained, including diagonal runs; small exact patches repair any remaining uncovered core pixels. Ambiguous unpainted cuts are kept, even if this
requires more rectangles. Masks exceeding the wall budget or minimum coverage
fail for review rather than silently closing gaps to meet the count.

The integrated conservative converter produces 32 walls for the saved crypt
mask (previous converter: 120; earlier more aggressive prototype: 17). Its 5,173
solid-wall sight probes still pass. A controlled stress dungeon covers 0.3–5 ft
gaps, vertical slits, a 2 ft corridor, offset doors, a diagonal slit, jagged caps,
and dark painted seams. Unit tests also cover a one-pixel opening, unchanged amber
floor in a gap, larger source images, and the normal draft/apply persistence path.

Only openings represented in the mask can be protected. Subpixel gaps can be
lost when images are resized to the 800-pixel working raster, and a doorway painted
over by the AI cannot be inferred by conversion. Review the draft before applying.
Existing saved walls are not automatically rewritten. No data migration is needed.


## Angled, circular and free-draw walls

The DM Walls menu offers Rectangle, Line, Circle, Free draw, Move / rotate,
Erase, and Door. Lines can be dragged at any angle. Line, circle and free-draw
thickness is entered in feet using the map scale. Circle drawing starts at the
room center and ends at its wall; the interior is empty. A free-draw stroke is
simplified to one editable piece. Move / rotate accepts a drag, a round rotation
handle, or an exact angle. Outlines remain DM-only and hide after Done.

Rectangles, strokes and imported contours share one boundary representation for
picking, line of sight, torch shadows and swept movement. Curves use a bounded
polygon approximation. Existing rectangle and line saves load unchanged. Moving
a door keeps its linked object aligned and preserves its locks, stats and state.
The door tool clips a local opening through angled, curved and imported walls;
it does not cut through the far side of a circular room.

Yellow masks now preferentially trace connected contours, including holes for
rooms, rather than constructing diagonal and curved boundaries from rectangles.
The same protected-gap preprocessing remains. Simplification is checked against
reserved openings, wall cores and pixel coverage; noisy masks that cannot fit
within the 512-edge budget use the conservative rectangle fallback. The separate light-masking workflow is unchanged. The wall prompt also identifies
natural cave boundaries and the solid top surfaces of structural pillars.

The saved crypt mask now yields **3 connected wall pieces**, compared with 32
rectangles from the preceding fitter and 120 from the original converter. All
5,173 solid-wall probes and 35 doorway/corridor movement and sight cases pass.
A controlled round room plus angled wall converts to two contour pieces; a narrow
entrance stays open. Tests also apply a closed circular room through the normal
AI draft, normalized JSON and persistence path, retaining its empty interior.

No existing saved walls are automatically converted. Applied new drafts can be
selected, moved, rotated, erased and cut for doors with the same wall tools.


## Complex live API test: Twisted Vaults (30 September 2026)

A new 2400 x 1792 map and yellow annotation were generated through the real
Gemini image gateway. The map includes a circular chamber and pillar, an
octagonal room, diagonal and curved corridors, small door thresholds, and an
irregular cave. The DM opened Suggest walls,
generated a mask, reviewed it, and applied the draft through the normal HTTP
route. Reading the saved map back confirmed **11 polygon wall pieces, 443
boundary edges**, including empty interiors. No hand-authored wall coordinates
or mocked AI response were used for the import.

Earlier masks exposed two conversion failures: global curve simplification could
slightly cover protected pixels, and jagged cave boundaries could exceed the
edge budget or the original 97% raster coverage threshold. The converter now
tries bounded simplification tolerances up to 1.5 working pixels and cuts any
protected gap pixels back out of simplified contours. It requires every wall
core pixel to survive and every protected opening to remain clear. Contours
must retain at least 96% raster coverage (boundary stair-steps account for the
remaining difference), within the unchanged 512-edge limit. The final live mask
retained 96.9%. The review identifies contour fitting versus rectangle fallback.
Coverage is not AI detection accuracy, and the DM still needs to inspect the mask.

Verification on the applied map: 11 open passage/doorway probes and 11 solid-wall
probes passed both sight and medium-creature movement checks. A real player
walked from the circle into the passage, was stopped when dragged through its
wall, and walked through the angled entrance and corridor. DM and player browser
recordings reported no errors. Three sanitized saved-mask regression fixtures
reproduce the earlier failures without an API key. The full suite passed 1,049
tests, along with type checking and the production build.

Preview: https://dnd.nic024i.app/uploads/previews/complex-wall-mask-20260930/index.html
It includes the original image, generated mask, actual saved contours, and a
one-minute UI recording. API wait time is shortened. Development build only;
no live campaign database or production code was changed.


### Cave follow-up: enclosure defect confirmed

A closer player walkthrough found gaps along the irregular cave rim. These were
not covered by the earlier 22 spot checks. On the unchanged imported map, Druk
entered the intended doorway and was blocked by the intact east wall, but moved
from approximately (2060, 1670) to (2090, 1760) through the missing lower boundary.
Other gaps transmit sight. The cave's faint/broken yellow annotation was retained
as openings during import. This cave is not fully enclosed and still needs repair.
The 47-second recording preserves the defect rather than patching it for display:
https://dnd.nic024i.app/uploads/previews/cave-walk-20260930/index.html
Evidence: artifacts/cave-walk/proof.json confirms unchanged walls and the actual
player endpoints. No production code or campaign data was changed for this test.


### Continuous outer cave outline (follow-up)

The old instruction traced the boundary between walkable floor and rock. It has
been replaced with a continuous opaque yellow outline, about 10 image pixels
wide, along the **outer** rock rim. The rim remains inside the visible boundary;
the line must join adjacent masonry masks, skip real entrances, and ignore
cracks/shading as reasons for breaks. Retry wording preserves this distinction.

A fresh Gemini request on the same source succeeded on its first attempt. The
whole map converted to four editable polygon pieces / 423 edges and was applied
through the normal DM UI. All 22 original sight/movement checks and 720 outward
sight rays around the lower cave boundary passed. Real player dragging entered
and explored the cave, stopped at the east wall, and was stopped at the former
lower escape gap. No manual wall patch was used. Original map art is unchanged.
Type checking and all 26 focused wall/import tests passed.

Preview: https://dnd.nic024i.app/uploads/previews/cave-outline-20260930/index.html
Evidence: artifacts/cave-outline/ (prompt, draft/apply response, ray checks,
actual player positions and recording metadata). Development code only.

### Source-art false positives and local wall erasing (Mossgate follow-up)

The unchanged wall/natural/door prompts were tested on a new grass-to-cave map
with ruins, doors and stairs. Its first untouched result was **14 wall pieces /
508 boundary edges**: the structural pass contributed 296 edges (including
three false flower patches totaling 20), and the natural pass 212. Adding the
three fitted doors exceeded the app's 512-edge cap and failed atomically. A
subsequent hand-reviewed walkthrough was diagnostic only, not an unattended
success. Original responses and the failed receipt remain in
`artifacts/grass-cave-ruins/` and the public raw-test preview.

The converter now requires surviving saturated yellow paint within each connected
region. Muted yellow-green artwork cannot establish a wall by itself, while dim
edges/seams attached to confirmed paint remain unchanged. Existing source-art
exclusion still applies. Near the edge budget, the converter also compares its
existing separate-layer contour fallback against the combined pixel mask and
keeps the lower-edge validated result. Gap/coverage tolerances are unchanged.

Replaying the original response images through production suggestion and apply
now selects **all** generated wall suggestions and succeeds automatically:
11 walls + 3 doors / 500 edges. Every non-flower wall shape exactly matches the
earlier reviewed geometry. All eight route/boundary checks and all three door
open/closed checks pass. No API regeneration, prompt changes or manual exclusions
were used. The previous connected cave/door fixture remains geometrically
identical. The split northern double-door suggestion and the false door marker
on a solid partition remain unresolved detection issues.

Walls are already custom polygons with holes; the edge count measures their
outline detail, not separate editable wall objects. The 512-edge limit is an
application guardrail, not a Gemini restriction or measured performance ceiling.
This change does not raise it or remove runtime collision/visibility checks.

**Walls > Erase wall section** lets the DM drag a rectangle that subtracts only
that area from drawn or imported walls. Remaining pieces, circular-room holes
and transformed geometry retain their shape. Existing doors are preserved;
**Delete entire wall** remains a distinct tool. Validation is atomic and rejects
invalid cuts or those exceeding the existing geometry budget. Server tests cover
partial openings, legacy thin lines, rotated walls, circles, door preservation,
campaign ownership and rejection without partial writes.
