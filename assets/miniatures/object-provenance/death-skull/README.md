# Generated death skull

Reference art: Codex's built-in image generation tool, 2 October 2026.
The tool returned a 1254 x 1254 RGBA sheet (the prompt requested 2048).
The four named 627 x 627 views were cropped directly, without repainting or
upscaling: top left front, top right back, bottom left left, bottom right right.

`generation_receipt.json` records Hunyuan3D-2mv shape reconstruction and
`named-multiview-texture-v1` texture generation using all four views. There is
no text conditioning in the 3D call. `prompt.txt` is the 2D art prompt.

`reduction.json` records the standard 20,000-triangle/JPEG95 policy; texture
dimensions remain unchanged. `preparation.json` records the skull's face-up
pose and measured pewter base. `model.json` records the final delivery hash,
size and triangles. The original generated dense meshes stay in local artifacts.

Reproduce with the existing `generate_multiview_mesh.py`, `reduce.mjs`,
`prepare_death_skull.py` and `package.mjs` in `server/tools/asset-production`.
The packaged GLB restores the reduced texture bytes after Blender export.
