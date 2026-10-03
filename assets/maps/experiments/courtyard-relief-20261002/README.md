# Raised courtyard walls and hypsometric relief — 2 October 2026

This separate experiment keeps the original courtyard art and its rectangular
1216 × 832 footprint. Scale: 64 pixels per 5 feet (95 × 65 feet overall).
It does not replace a campaign map or alter the existing wall/door/light workflow.

## Workflow and evidence

1. Gemini `gemini-3-pro-image` receives the original map and the current accepted
   `YELLOW_WALL_PROMPT`, loaded directly from `server/src/mapGeometryDraft.ts`.
   The prompt is unchanged. The existing `wallsFromYellowMask` converter returns
   21 polygon pieces, including holes, covering 99.15% of its detected solid mask.
   This is conversion coverage, not proof that the AI found every real wall.
2. A separate Gemini request receives the original map and that mask. It requests
   a hypsometric data image: black=0 ft, blue=0.5 ft, green=1 ft, yellow=2 ft,
   orange=4 ft, red=8 ft, white=12 ft. Walls, scenery and stairs are estimated;
   this is not physically measured height information.
3. Both height attempts retained some original art. The first had 6,001 unknown
   pixels of 63,745 working samples; the retry had 14,199. Automatic conversion
   selects the first, more complete result. Pixels farther than RGB distance 80
   from the palette become zero height. No brightness/shadow-to-height inference
   is used. Both raw API outputs and exact prompts remain available.
4. The 3D viewer triangulates and extrudes the existing wall polygons, preserving
   their holes and open passages. Wall cap vertices take nearby high elevation
   values (8/12 ft), with an 8 ft fallback at ambiguous cap edges. Height sampling
   does not create wall footprints outside the structural mask.
5. Revision 2 converts the 0.5/1/2/4-foot palette regions into 63 separate
   scenery contours, excluding structural wall interiors. The same contour
   converter preserves empty pixels between objects. Each shape is extruded
   with a horizontal top and visible vertical sides instead of being a sloping
   bump in a dense floor grid. The preview opens with walls AND scenery shown.
6. Every wall side samples a strip immediately inside its own cap boundary in
   the original image. Wall sides repeat those local strips vertically, in
   bands no taller than 2.5 feet. Scenery sides use their own original top art;
   wood stays wood instead of taking the old shared stone tile. Sampling stops
   at the first boundary so it cannot reach across a doorway into another cap.
   All top UVs still use original map coordinates. No new texture image or API
   call was needed for this revision.

No walls, props or elevation pixels were manually selected, removed or repainted.
The mask converter's existing smoothing/protected-opening rules are unchanged.

## Outputs

| Version | File size | Triangles |
|---|---:|---:|
| Raised walls + flat original floor | 4,354,012 bytes | 14,768 |
| Raised walls + separate scenery shapes | 5,047,548 bytes | 20,746 |

`model-receipt.json` confirms that the GLBs retain the original texture's decoded
pixels, contain finite coordinates, and have cap areas matching the original
wall polygons to floating-point precision. Holes remain unfilled. The full model
also passes a check that all 63 scenery
meshes reach their requested heights. Both versions now use a two-triangle floor.
The full model has about 84% fewer triangles than the previous height-field version.

This is cleaner and more predictable than the earlier whole-map Hunyuan mesh,
but scenery heights and silhouettes still need review. Simple extrusion cannot
reconstruct table legs, arches or overhangs. Some item
heights are only 0.5-1 foot because that is what the existing AI data supplied.
Local cap strips can still stretch or repeat, and painted lighting remains baked
into the original art; this is not a physically correct material reconstruction. The original painted
vertical wall
faces and shadows remain in the floor art; new geometry can therefore duplicate
some visual cues. This preview does not validate movement, vision or token height
in the real battlefield renderer.

## Review and reproduce

Interactive comparison and 45-second rotation and item-height comparison video:
https://dnd.nic024i.app/uploads/previews/courtyard-relief-20261002/index.html

Controls: original flat map, raised walls, walls+raised items; independent wall and
item height sliders and an item close-up; camera views, orbit, zoom and GLB export.

```powershell
node --import tsx server/tools/asset-production/generate_map_relief.mts assets/environment-preview/courtyard.png artifacts/map-relief-new
node --import tsx server/tools/asset-production/build_relief_assets.mjs artifacts/map-relief-new
Copy-Item assets/maps/experiments/courtyard-relief-20261002/index.html artifacts/map-relief-new/index.html
npx.cmd esbuild assets/maps/experiments/courtyard-relief-20261002/viewer.js --bundle --format=esm --minify --outfile=artifacts/map-relief-new/viewer.bundle.js
python -m http.server 4131 --bind 127.0.0.1 --directory artifacts/map-relief-new
```

The image script uses a temporary isolated data root, reads the configured API
key without printing it, and uses the existing connection-retry gateway. A
height-data retry reuses the wall mask instead of regenerating it. The default
scale is this courtyard's 64 px / 5 ft; other map scales need the corresponding
values changed before generation.

Verification: desktop and phone-size browser views loaded without JavaScript
errors; original image pixels, cap geometry and exported meshes passed checks.
Phone viewport testing is not a hardware performance test.
Export validation can be repeated after downloading both models:
`node --import tsx server/tools/asset-production/validate_map_relief.mjs OUTPUT_DIRECTORY`. Typecheck and all
145 server test files / 1,627 tests passed. Video captured using RTX 5090 AV1.
