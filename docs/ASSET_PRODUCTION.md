# Background creature asset production

New or updated creature templates, spawned creatures, AI family edits and saved
library creatures request a model automatically. Existing physical families are
reused; encounter numbers, theme tags and tint changes do not generate new models.
An explicit `none` family and map objects are excluded. Unknown names become a
normalized family unless the DM or AI has supplied a more specific `modelType`.
The DM should select an existing family for a named individual of an existing type.

Missing families keep their normal 2D token while a persistent server queue works.
Token info shows progress, failure details, **Retry 3D**, and **Pause 3D queue**.
Older missing-family tokens can start with **Create 3D model**. Pause holds the next
job and lets the current job finish. The queue is shared by all campaigns on the
host, deduplicated by physical family, and runs one production job at a time.
This does not isolate GPU memory from other software: pause production during
play if the host GPU is also rendering the battlefield.

DM Token info also provides **New 3D model**, even when a model already matches
or the creature is set to 2D only. Optional appearance notes can specify armor,
equipment, or pose. **Generate new 3D model** creates a separate reusable family;
the existing model stays selected until the DM chooses **Use this model** after
completion. Other creatures and source templates are not reassigned. Save the
updated creature to the library to reuse that assignment. Repeated clicks while
its job is queued/running return the same job. A failed request can be retried
with its saved references or replaced with a fresh request and revised notes.

Both automatic and manual jobs snapshot the creature's name/type, named weapons,
attack descriptions, and armor/clothing mentioned in actions or traits. Reference
art uses that evidence and the DM notes, with one primary weapon held ready and
secondary weapons sheathed. AC alone does not imply worn armor; natural attacks
remain anatomy. There is no dedicated monster armor inventory field, so explicit
armor belongs in its traits or appearance notes. Equipment evidence is private
job data, not part of the public model catalog. Existing jobs without a snapshot
retain their legacy family-only prompt.

Finished models appear in the 3D family selector and matching tokens load them
within five seconds without rejoining. Generated models use the same WebGL layer,
pewter base treatment, fog visibility, base-only input, sizing, affinity borders,
selection and facing as bundled monsters. The existing per-viewer 2D/3D toggle
continues to work. Catalog polling contains finished public art only; job names,
errors and controls require DM authentication.

## Worker setup

Install normal app dependencies with `npm ci`. The host additionally needs Python
and Blender. Start the accepted Hunyuan Gradio server with the
`tencent/Hunyuan3D-2mv/hunyuan3d-dit-v2-mv` shape checkpoint and textured output.
The server verifies the returned checkpoint before publishing.

Install the versioned adapter into the Hunyuan worker directory, then restart
that worker using its normal launch command:

```powershell
python server/tools/asset-production/install_multiview_texture.py C:/pinokio/api/Hunyuan3d-2-lowvram/app
```

This enables named front/back/left/right references for texture generation as
well as shape generation. The installer preserves a backup of `gradio_app.py`,
is repeatable, and checks the expected source structure. The adapter targets the
tested Hunyuan3D-2 low-VRAM worker; unsupported implementations fail explicitly.
Reapply the installer after replacing/updating the worker. No text-conditioning
experiment is enabled. Both manual script runs and app jobs require matching
texture-reference evidence in `generation_receipt.json`; an old front-only worker
cannot silently publish a model under the new policy.


Optional server environment variables:

| Variable | Default |
| --- | --- |
| `HUNYUAN_URL` | `http://127.0.0.1:42003` |
| `ASSET_PYTHON` | `python` |
| `ASSET_BLENDER` | Windows: `C:/Program Files/Blender Foundation/Blender 5.1/blender.exe`; other hosts: `blender` |

Use the existing AI settings for the Gemini image API and ComfyUI backup. An
embedded application cannot invoke Codex's interactive image-generation tool:
automated 3D reference art uses the image API first, with bounded connection
retries, then the configured local image workflow as backup. No cloud mesh-generation
provider is configured; Gemini image generation is not a GLB fallback.

The worker checks Hunyuan, Python and Blender before requesting reference art.
An unavailable Hunyuan server pauses the queue. On interruption or an uncertain
Hunyuan result, check that the previous remote job has ended before clicking
**Retry 3D**, then **Resume 3D queue**. Restarts preserve pending/finished jobs;
an interrupted running job is held for explicit retry instead of resubmitted.

## Production stages and provenance

1. Generate one **2048×2048 or larger**, square, four-panel turnaround sheet.
   The prompt requests the same full-body creature in a ready pose, simple
   equipment, white background and no base. Top left is front, top right back,
   bottom left left side, bottom right right side. A smaller/non-square response
   fails rather than being silently upscaled or mis-cropped.
2. Extract the four named views and record dimensions, hashes and the prompt.
   These are separate named inputs to Hunyuan, not four creatures in one request.
   Retries reuse the saved views. Semantic art consistency still depends on the
   chosen image model; structural validation cannot guarantee good anatomy.
3. Generate the textured model using all four named references for both shape and texture, with 50 steps, guidance 5.5, octree resolution
   512, 10,000 chunks, background removal, and the verified multi-view checkpoint.
4. Apply `monster-reduction-v1`: target 20,000 body triangles at 0.01 error limit;
   opaque color textures use JPEG quality 95 / 4:4:4 when smaller. Texture
   dimensions, transparent textures and data maps are preserved. No Draco or
   meshopt geometry encoding is added. The simplifier's error limit may leave
   more than 20,000 triangles.
5. Remove tiny disconnected generation specks (less than 0.2% of the largest
   geometric island, identified across UV seams without welding UVs). Fit the
   feet inside a measured round base with Blender. Preserve the reduced
   image bytes through export. Runtime applies the same raised pewter treatment
   as existing monster bases. Combat size remains driven by creature stats and
   the existing map-scale rules, independently of normalized asset coordinates.
6. Reload/validate indexed geometry, finite positions, texture hashes and output
   budgets (60,000 total triangles, 12 MiB maximum). Atomically publish a
   content-hashed GLB under `/uploads/miniatures/`, then update the catalog.

Private job records, reference sheets, named views, generation receipts,
reduction receipts and worker logs live in `data/asset-production/` (or under
`DATA_ROOT`). Every retry has a separate attempt directory. Back up this directory
**and uploads** with host backups; these shared assets are not part of an
individual session export. Original source meshes and bundled models are not
overwritten.

## Validation

`npm run typecheck`, `npm test`, and `npm run build` cover the normal application.
`assetProduction.test.ts` verifies reuse, deduplication, serial execution,
persistence, interruption, pause/resume, retries, publication failure and creature
save hooks. The browser test named `asset production keeps...` verifies a 2D
placeholder becoming a real WebGL model in both roles, without rejoining, and
DM-only job access. It simulates publication with a known bundled GLB.

For an opt-in pipeline contract smoke on a worker-equipped host:

```powershell
node --import tsx server/tools/asset-production/smoke.mjs "PATH/TO/RAW_TEXTURED_MODEL.glb"
```

This uses controlled image/Hunyuan responses and **real** Python transport,
reduction, Blender, validation, publication and queue persistence in a temporary
data directory. It does not call a live image/GPU service or modify a campaign.
The original goblin raw mesh produced a 1,564,932-byte / 20,764-triangle test
asset through this smoke, retaining its 2048×2048 texture. Both local services
were separately confirmed reachable; the subsequent live trial is recorded below.

The live Imp trial used the Gemini image API and four named Hunyuan views. It
exposed two disconnected fragments below the feet that skewed base placement;
the cleanup above fixes this without rerunning generation. The corrected Imp is
1,696,600 bytes / 20,754 triangles with a 2048×2048 texture. The Blender regression
`test_base.py` covers this failure with a displaced floor fragment.

The approved Imp is bundled as `/miniatures/monsters/imp.glb`, with its front
reference as 2D fallback art and source views/receipts under
`assets/miniatures/monster-provenance/imp/`. The library uses the
[2014 Imp rules](https://www.dndbeyond.com/monsters/16933-imp): Tiny, CR 1,
10 HP, AC 13, Sting with its poison save, Invisibility and the listed traits.
The sculpt's equipment is cosmetic; it does not grant extra attacks or AC.
The `starter-creature-imp-v1` migration adds this entry once, preserves existing
stats, and fills missing appearance fields from older app versions.
