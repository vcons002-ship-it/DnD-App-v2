# Courtyard map reconstruction experiment — 2 October 2026

Source: the existing 1216 × 832 courtyard map from `assets/environment-preview`.
Original art is preserved as `original.png`.

## Method

1. Call the app's existing Gemini image gateway with `gemini-3-pro-image`,
   verified available in the API model catalog. Request 2K elevated diorama
   references at a 50-degree camera elevation.
2. Generate front/back/left/right independently from losslessly rotated map
   plans (0/180/270/90 degrees). Exact prompts, input images, output hashes and
   elapsed times are retained. An initial attempt using a front-view anchor
   copied the same viewpoint into other views; it was rejected and is retained
   in the local `artifacts/courtyard-rejected-views` folder.
3. Feed the four distinct views into Hunyuan3D-2mv, 50 steps, guidance 5.5,
   octree resolution 512, seed 102026. Both shape and texture used all four named
   references, verified by `generation_receipt.json`. The worker's texture
   stage reduces the dense shape to 40,000 triangles.
4. Normalize position and overall width without repairing geometry. Export
   `generated.glb` with the generated texture.
5. Export `original-top.glb`: project the original map over upward-facing faces
   (normal Z > 0.35 in Blender), retaining the generated texture on sides.
   Decoded original texture pixels are identical to the source image; see
   `model-receipt.json`.

## Result

- `generated.glb`: 5,678,696 bytes, 40,000 triangles.
- `original-top.glb`: 8,482,836 bytes, 40,000 triangles.
- Real walls and floor depth were generated, but there are holes, merged shapes,
  distorted furnishings and weak texture detail. Gemini also varies furniture
  between views. The output is not suitable as an accurate gameplay map.
- Hunyuan returned a nearly square footprint (aspect 1.0005), while the original
  map is rectangular (aspect 1.4615). The original projection therefore stretches
  the image over that footprint. No shape or aspect correction was applied.
- Original art greatly improves floor readability, but cannot correct geometry,
  wall alignment, missing faces or hidden surfaces. The original image already
  contains painted light/shadows, which remain in its projected texture.
- This is a standalone visual experiment; no campaign, map renderer, movement,
  wall collision or visibility behavior was changed.

## Reproduce

From the repository root, with the configured Gemini key and ready multi-view
worker (credentials are not included in this archive):

```powershell
node --import tsx server/tools/asset-production/generate_map_views.mts assets/environment-preview/courtyard.png artifacts/map-views-new
python server/tools/asset-production/generate_multiview_mesh.py --base-url http://127.0.0.1:42003 --front artifacts/map-views-new/front.jpg --back artifacts/map-views-new/back.jpg --left artifacts/map-views-new/left.jpg --right artifacts/map-views-new/right.jpg --output-dir artifacts/map-mesh-new --steps 50 --guidance 5.5 --seed 102026 --octree-resolution 512 --num-chunks 10000 --remove-background
& 'C:/Program Files/Blender Foundation/Blender 5.1/blender.exe' --background --python server/tools/asset-production/project_map_texture.py -- artifacts/map-mesh-new/01_textured_mesh.glb assets/environment-preview/courtyard.png artifacts/map-preview-new
```

The image script uses an isolated temporary data root and reads an existing API
key without exposing it. It does not start a game server or write a campaign DB.

## Review

Interactive preview:
https://dnd.nic024i.app/uploads/previews/courtyard-3d-20261002/index.html

Switch between the generated texture, original art projected onto the mesh, and
the unchanged flat map. Drag/pinch to inspect the actual GLBs. A rotation video
is available on the same page. Bundled Three.js requires no CDN downloads.

Verification: desktop and mobile-size browser previews loaded without JavaScript
errors; both meshes report 40,000 triangles. Typecheck passed; all 145 test files
and 1,627 server tests passed. AV1 recording uses the RTX 5090.

The generation receipt retains the original submission paths (`references-v2`);
those files were subsequently archived under `references`, with identical hashes.
