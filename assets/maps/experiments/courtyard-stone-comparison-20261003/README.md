# Old stone courtyard comparison - 3 October 2026

The original 1216 x 832 courtyard map and grid (64 px / 5 ft) are unchanged.
This study compares the ordinary app map with a raised wall/scenery prototype.

## Material

`old-stone.png` was generated with the built-in image generation tool. The exact
prompt is in `texture-receipt.json`. It is a neutral old limestone block material
with worn edges, recessed mortar and sparse moss. It repeats every 8 feet along
wall faces and every 8 feet vertically. Top caps still use the original map art.
No per-wall texture API requests or manual painting were used. Item elevations
reuse the previous height-pass data; this test did not regenerate those heights.

## Existing automatic workflow, run live

The disposable app received the original image through its map upload API.
In the actual DM Walls panel, Suggest walls from map art > Analyze map ran the
unchanged structural yellow-mask prompt AND the default natural-boundary pass.
All suggestions were applied through the real authenticated Apply endpoint.
No suggestions were deselected, mask pixels edited, or gaps manually repaired.

Result: 20 saved wall pieces, 99.13% detected-mask conversion coverage, no workflow
warnings. Coverage describes conversion fidelity, not AI semantic accuracy.
`automatic-draft.json`, `automatic-receipt.json` and the two raw API images retain
the result. Both comparison maps use this same saved wall layout.

## Real player walkthroughs

Druk walks through the west opening, reveals the room, attempts to cross its
solid wall, then leaves through the opening. Varis explores the east room and
switches between tilted and overhead views. All 22 click-and-drag moves use the
real app. The server validates placement; two attempted wall crossings stop
short, while the intended open-passage moves reach their destinations.
`walkthrough-receipt.json` retains requested/actual positions and capture details.

The raised surfaces load into the same depth buffer as real miniatures only in
an explicit experimental client build: VITE_COURTYARD_STUDY=1 and raisedWalls=1
in the player URL. The fixed disposable uploads/courtyard-study.json identifies
the study map; uploads/courtyard-study.glb supplies its geometry. Normal builds
omit the study renderer. The server's existing movement/vision logic is used.
The prototype visibility clipping is approximate and may cut rough edges into
wall surfaces. Full-height walls can obscure figures. Original painted wall
faces remain in the floor art. This does not establish production readiness.

## Outputs and checks

- Walls: 7,755,828 bytes / 4,439 triangles.
- Walls plus 63 raised scenery shapes: 8,449,612 bytes / 10,421 triangles.
- Original texture pixels, wall cap areas/holes, finite coordinates and all
  scenery heights verified in the exported GLBs.
- Actual player views: no JavaScript/WebGL errors recorded.
- Typecheck and all 145 server test files / 1,627 tests passed.
- Both walkthrough videos: RTX 5090 AV1, 60 fps; phone delivery 1280 x 800.

Preview and both walkthroughs:
https://dnd.nic024i.app/uploads/previews/courtyard-stone-comparison-20261003/index.html

Repeat contour conversion and export validation with:

```powershell
node --import tsx server/tools/asset-production/build_relief_assets.mjs OUTPUT_DIRECTORY
node --import tsx server/tools/asset-production/validate_map_relief.mjs OUTPUT_DIRECTORY
```

The generator, prototype viewer and paid-response files are retained in this
folder. The original live campaign, its database and installed code are untouched.
