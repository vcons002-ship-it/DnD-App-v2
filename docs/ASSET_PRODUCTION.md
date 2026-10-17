# Background creature asset production

New or updated creature templates, spawned creatures, AI family edits and saved
library creatures request a model automatically. Existing physical families are
reused; encounter numbers, theme tags and tint changes do not generate new models.
An explicit `none` family and map objects are excluded. Unknown names become a
normalized family unless the DM or AI has supplied a more specific `modelType`.
The DM should select an existing family for a named individual of an existing type.

Missing families keep their normal 2D token while a persistent server queue works.
Every newly generated model now stops for **source-art approval**. The image API
creates the four source views, and Token info (DM) or **Personal token & miniature**
on the character sheet shows the full-resolution sheet and each individual view.
Choose **Approve art & create 3D model** to continue, or revise the appearance and
choose **Regenerate source art**. Players can review only their own claimed hero;
the DM can review creature jobs and character jobs. Approval survives a restart,
is tied to the exact four image files, and is invalidated by regeneration or a
changed image. Waiting for approval does not pause other queue jobs. Existing
completed models are unchanged; pending legacy source art must also be approved.

The full-resolution sheet and individual views stay on the character/token after
completion. **Refresh front/back/left/right** sends the previous sheet as an image
reference and requests just that view. The other three PNGs are copied byte for
byte into the next revision; the new combined set requires approval. Refreshes
of a finished job keep its existing model available until reconstruction finishes.
Both whole-sheet and single-view regeneration use a battle-ready stance.

**Cancel crafting** works for queued jobs, source-art approval and active work.
Cancellation prevents late progress, icon updates or model publication from
replacing the existing token. Image API requests are aborted. An already submitted
Hunyuan GPU operation must finish before the queue is freed; its result is discarded,
and the UI says **Cancelling** until then. The app never kills an unrelated worker
or starts overlapping 3D jobs. A re-craft can be queued while that operation retires.
The player status refreshes every 2.5 seconds, guards against stale poll responses
overwriting button results, and shows the current step's elapsed time.

Character appearance includes an editable feet/inches height with native spinboxes
and one-inch arrow buttons. It is saved on creation or crafting, included in the
image brief, preserved in the character library and snapshotted per craft. Reference
regeneration uses the new height; an already approved revision keeps its saved height.
Species ranges are approximate suggestions from the 2024 SRD, not enforced min/max
values. Aasimar uses the generic editable default. Technical input bounds are 6–240
whole inches. Height fitting leaves combat space and manual base sizing unchanged.

Unapproved art never replaces a character's current icon or model. After approval,
the existing reduction, four-view texturing and base-fitting pipeline runs. If the
3D worker is unavailable, retry retains the approved views. Source art can be
generated and reviewed while that worker is offline. Hunyuan/Python/Blender checks
therefore run **after approval**, before reconstruction. Each player job allows
three source-art versions; the DM can request more. The existing three-new-jobs-
per-player-per-day limit also remains in place.

The reference prompt uses realistic sculpted anatomy and natural proportions,
believable materials, distinct limbs/weapons, matched orthographic views and
soft neutral studio lighting on white. It avoids the ambiguous "painted miniature"
style instruction, cartoon/chibi proportions, dramatic shadows, scenery and
magical effects. This is a reconstruction-friendly default, not a guarantee of
better geometry: the approval step remains necessary. General input principles
are supported by [Meshy's image-to-3D guidance](https://docs.meshy.ai/en/webapp/image-to-3d);
our worker remains Hunyuan, using its named multi-view inputs.

Legacy hero jobs without a saved height use a separate size target: 1.45 model units above a .055-unit
base (diameter 1). At the default Medium PC base width of 4 ft this is about
6.02 ft total, compared with the previous generic-creature target's 6.62 ft.
Gnomes/halflings use .95 units; creature jobs retain their existing 1.6 target.
This is a visual fit, not a change to a character's 5 ft combat footprint.
Wide stances may still fit smaller so feet stay on the base; raised weapons are
part of the fitted silhouette. The existing per-token size control still applies.
Completed catalog models are not silently rescaled. The mobile sandbox's Liz
model was separately refitted from its reduced source without changing textures
or triangle count, retaining the original GLB for comparison.
New jobs with a selected height use height-in-feet divided by the default 4 ft
player base width. This fits the generated silhouette; wide stances can still
be limited by the base's foot-fit constraint and raised weapons affect its bounds.

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

The worker checks Hunyuan, Python and Blender after source-art approval.
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

## Local image generation (October 2026)

Non-Gemini image generation uses native **FLUX 3 Image Klein distilled**, including
its Qwen3-VL encoder and separate Qwen3.5 prompt upsampler. This applies to maps,
token art, decals, and local backup for miniature reference sheets. Gemini remains
the first choice for miniature source art. Install these files in ComfyUI:

- `diffusion_models/flux3_image_klein_sd_int8_convrot.safetensors`
- `text_encoders/qwen3vl_4b_int8_convrot.safetensors`
- `text_encoders/qwen3.5_9b_flux3_prompt_upsampler_int8_convrot.safetensors`
- `vae/flux2-vae.safetensors`

The built-in recipe uses 16 Euler/simple steps, CFG 1, and a 16-pixel latent grid.
It needs current ComfyUI `TextGenerate` and `EmptyFlux2LatentImage` nodes. Missing
components produce a useful failure so the existing Gemini backup can take over;
the provider never silently selects an SD checkpoint. Unchanged shipped Flux 2
presets upgrade to this recipe. Explicitly edited/custom workflow JSON remains an
expert override. Older map LoRA/DoRA adapters are applied only to custom workflows,
since their weights are not compatible with FLUX 3. Cold model loading and prompt
expansion can take longer than sampling; the job polling budget is ten minutes.

Source-art approval, saved four-view references, per-view refresh, cancellation,
and the existing four-view Hunyuan shape/texture pipeline still apply.

## Candidate 3D upgrades (research, 17 October 2026)

No new 3D model has replaced the production Hunyuan worker. The most useful next
comparison is **Pixal3D multi-view**, using identical approved source images and
the same final reduction budgets:

- [Pixal3D](https://github.com/TencentARC/Pixal3D) released multi-view inference in
  September 2026, with separate multi-view weights and PBR output. Its
  `inference_mv.py` uses all views for shape and texture conditioning. It requires
  camera matrices/FOV, consistent framing, and a canonical front first view, so
  our generated orthographic turnarounds need a calibrated adapter and a visual
  quality comparison. MIT code/model terms do not replace dependencies' licenses.
- [TRELLIS.2](https://github.com/microsoft/TRELLIS.2) is another high-detail PBR
  candidate (512–1536 resolution). Its documented basic workflow is single-image;
  the official environment is Linux with at least 24 GB NVIDIA VRAM. A 32 GB 5090
  meets that base memory requirement on paper, but local compatibility and peak
  memory still need measurement. Published timings are H100 results, not 5090
  expectations.
- [Hunyuan3D 2.1](https://github.com/Tencent-Hunyuan/Hunyuan3D-2.1) adds production
  PBR materials; official documentation quotes 29 GB for shape plus texture. It
  is worth a texture comparison, but is not automatically equivalent to our
  installed four-view 2mv shape workflow.
- [UniForge3D](https://github.com/xibushu/UniForge3D) accepts sparse unposed views,
  which could suit generated turnarounds. It is very new; its VGGT-derived weights
  retain noncommercial terms and its default background remover has separate
  commercial restrictions. Prefer a research trial over a default dependency.
- [Hunyuan3D-Buffalo](https://tencent-hunyuan.github.io/Hunyuan3D-Buffalo1.0/) is
  interesting research, but the project page still labels code "Stay Tuned".

Better token quality is a hypothesis until a controlled test compares faces,
hands, weapons, back views, texture seams, final GLB size and generation time.

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
