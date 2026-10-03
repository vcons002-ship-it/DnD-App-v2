# Door-pass arch experiment - 3 October 2026

Raised walls remain parked. This is an isolated extension of the door-mask
concept, not a change to the production door prompt or live campaign.

## Latest test

`door-arch-mask-v4.jpg` is the raw Gemini result. The exact prompt, model and
hashes are in `api-receipt-v4.json`. Cyan marks door leaves, magenta marks clear
arch candidates and orange is reserved for uncertain, review-only candidates.
The API does not mark supports or standing walls. Existing wall geometry owns
those supports. Confidence labels describe visual evidence, not calibrated
probabilities; even magenta candidates require DM review.

This response marks ONLY the two upper curved arches. The two lower damaged
wall tops are unmarked. No pixels or selections were manually corrected.
The map has no door leaves, so this does not establish combined door/arch
accuracy on a map containing both.

The converter reuses the app's local full-thickness doorway cut, preserving
existing walls elsewhere. Both proposed arches fit the existing jambs and
allow movement and line of sight. Both lower wall sections still block movement
and vision. No supports were added. Wall records stay at 20 before/after.
`conversion-receipt.json` records those checks. `app-receipt.json` records four
real player drags (two crossings per arch), verified against server placements,
with no browser errors. The actual app uses its normal flat map renderer.

## Rejected iterations

The initial prompt asked for supports AND adjoining masonry in yellow. It
painted wall faces and proposed four arches, including the two lower wall-top
false positives. Those geometry/movement tests passed but did not establish
semantic accuracy. The initial receipts are retained explicitly as rejected
history. Version 2 limited yellow to support caps but still proposed four
arches. Version 3 removed support marking; version 4 also requires evidence
of a supported overhead bridge and visible passage, excluding broken wall tops.
`v2-supports.json` is obsolete experimental geometry, never used in the latest
conversion or production workflow.

## Corrected 2D art test

The earlier extruded arch preview misunderstood the request and is retired.
Raised walls remain parked. The current test copies masked ORIGINAL arch pixels
above the tokens on the normal 2D map. A token under the arch activates a local
88% opacity reduction only at opaque body-silhouette pixels. Surrounding arch
art stays fully opaque. The effect smoothly restores when the token leaves.
The floor image is untouched; there are no raised surfaces, height estimates,
new materials, floor patches or additional model loads.

The effect uses the already-rendered GPU body mask, with no CPU pixel readback
or second figure render. It is gated by VITE_ARCH_ART_STUDY=1 plus archArt=1,
and /uploads/arch-art-study.json restricts it to one disposable map. Normal
builds omit this experiment. Darkness/weather and 2D token fallback modes are
not established by this clear-map test.

Four actual player drags pass in 45-degree and overhead views. Browser errors
are empty, local fade returns to zero after exit, and an on/off comparison
checks the silhouette-specific overlay. See art-2d-receipt.json and
art-2d-comparison.json. Previous depth viewer sources/receipts are retained
only as superseded experiment history and are no longer loaded by the preview.

Preview, latest mask and corrected 2D app walkthrough:
https://dnd.nic024i.app/uploads/previews/courtyard-arch-door-test-20261003/index.html

## Repeat

The generation command is a paid API request. Conversion is offline and writes
only files in the supplied experiment directory; it never edits a saved map.

`````powershell
node --import tsx server/tools/asset-production/generate_door_arch_test.mts SOURCE OUTPUT_DIRECTORY
node --import tsx server/tools/asset-production/convert_arch_door_mask.mjs OUTPUT_DIRECTORY BASELINE_WALLS_JSON
```

The conversion currently uses the courtyard's 64 px / 5 ft grid. Uncertain
orange markers are saved for review but never subtracted from wall geometry.
Production door/wall/natural-boundary prompts remain unchanged.

A synthetic mixed-color regression (confidence-regression.json) verifies that
cyan doors remain separate, magenta can open the reviewed span, orange cannot
open a wall or its sight line, and jambs remain solid. Repeat with:

```powershell
node --import tsx server/tools/asset-production/check_door_arch_confidence.mts
```
Typecheck and all 145 server test files / 1,627 tests passed. Browser checks
verified local 2D silhouette fading, playable mobile video, and no JavaScript errors.
