# Druk: rendered-3D reference prompt experiment

The candidate is an isolated quality test, not a replacement for the runtime Druk.
The image generator was explicitly asked for a textured 3D miniature sculpt rendered
in Blender. These are raster images depicting a 3D object, not mesh renders.

## Inputs and reconstruction

- Built-in Codex image generation; four separate 1024 x 1536 RGBA images.
- Front uses Druk V9's approved front reference and the approved natural-face sheet.
- Back, left and right use the new front as their consistency reference.
- Exact prompts: `prompts.json`. References are saved without repainting.
- Hunyuan3D-2mv, 50 steps, guidance 5.5, seed 101026, octree 512, 10000 chunks.
- Background removal enabled. All four named views guide both shape and texture;
  `generation_receipt.json` verifies the checkpoint and multi-view texture adapter.
- No text prompt is supplied to Hunyuan itself.

The full textured worker output is retained: 40,000 body triangles plus a measured
pewter base (40,764 total), with the original embedded 2048 x 2048 texture bytes.
No additional simplification, texture resizing, head/hand replacement or sword
replacement was performed. `prepare_base.py` adds the base and `package.mjs`
verifies/reinstates the original texture payload after Blender export. Model and
preparation receipts record the actual experiment policy rather than the normal
20k/JPEG95 monster delivery policy.

`comparison.json` pins the current runtime model and new candidate hashes. The
viewer places both on equal-diameter bases under identical lights, environment,
exposure and camera. The current model contains earlier high-detail assembled
head, hands, sword and axes; its 880,404 triangles make this a visual comparison,
not a controlled proof about prompt wording alone. Original full-body references
already contain realistic shading, so the requested wording change is subtle.

Observed result: coherent body/armor silhouette, but pale skin, softer facial/hair
details and a rougher sword texture. The prompt did not demonstrate an overall
quality improvement over the current assembled Druk in this single trial.

## Preview

[Interactive comparison](https://dnd.nic024i.app/uploads/previews/druk-3d-render-20261002/index.html)

Build the standalone local viewer with:

```powershell
npx.cmd esbuild assets/miniatures/experiments/druk-3d-render-20261002/viewer.js --bundle --format=esm --minify --outfile=artifacts/druk-comparison/viewer.bundle.js
```

Place `index.html`, the bundle, `comparison.json`, `candidate.glb`, the pinned
runtime Druk as `current.glb`, and the prompt/receipt/reference files together.
The viewer uses bundled local Three.js, Meshopt and OrbitControls; no CDN is used.
Browser verification loads both GLBs and checks front, face and 45-degree views.
