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

## Depth preview

The separate interactive prototype lifts only one detected arch span, using
original map pixels on its top and the prior reusable stone material on its
sides. Druk crosses beneath it; the overhead span smoothly fades to 16% opacity
while the supporting masonry stays solid. This is NOT integrated into the
battlefield. Clearance and thickness are illustrative estimates. The hidden
floor uses a nearby floor-art sample because the original image cannot reveal
pixels underneath the arch. No new floor art was generated.

Preview, raw masks, actual app walkthrough and interactive fade:
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
verified 16%/100% span opacity, playable mobile video, and no JavaScript errors.
