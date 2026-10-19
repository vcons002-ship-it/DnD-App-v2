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

Install normal app dependencies with `npm ci`. The host additionally needs Python,
Blender, the full Hunyuan 2mv shape checkpoint and the Hunyuan 2.1 PBR paint runtime.
The default producer now uses **hybrid-2mv-21-v1**, not the old combined Gradio call.
Both workers run on the host and exchange local file paths; keep them loopback-only.

The versioned workers are in `server/tools/asset-production/`:

- `hybrid_shape_worker.py PORT`: run with the 2mv environment, working directory
  its installed `app/` folder. Exposes `/health`, `/align` and `/shape`.
- `hybrid_paint_worker.py PORT`: run with the 2.1 environment, working directory
  its installed `Hunyuan3D-2.1/` folder. Exposes `/health` and `/trial`.

For the tested Pinokio installations, copy `start-hybrid-shape.js` into the 2mv
launcher directory and `start-hybrid-paint.js` into the 2.1 WinPortable launcher
directory. Set `DND_ASSET_TOOLS` in the launcher host environment to this repo's
absolute `server/tools/asset-production` directory. Start those named scripts
through Pinokio/pterm. Other installations can launch the Python workers through
their own process manager with the corresponding dependencies and checkpoints.
No upstream source or checkpoint is overwritten. The paint adapter checks the
upstream source structure and fails explicitly if it no longer matches.

Both health endpoints must report `protocol: "dnd-hybrid-v1"`. Workers unload
their model after each stage to avoid keeping both large pipelines in VRAM.
The app serializes jobs, but other local AI applications can still consume VRAM.

Optional server environment variables:

| Variable | Default |
| --- | --- |
| `HUNYUAN_SHAPE_URL` | `http://127.0.0.1:42005` |
| `HUNYUAN_PAINT_URL` | `http://127.0.0.1:42004` |
| `ASSET_PYTHON` | `python` |
| `ASSET_BLENDER` | Windows: `C:/Program Files/Blender Foundation/Blender 5.1/blender.exe`; other hosts: `blender` |

`HUNYUAN_URL` remains a legacy script setting; it no longer selects the app's
default miniature producer. Normal play and manual GLB uploads do not need either
GPU worker. An unavailable worker pauses production with a retryable message.

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

1. Generate a square 2K-or-larger four-panel turnaround and extract named front,
   back, left and right views. Save the prompt, original pixels and hashes.
2. Stop for approval of that exact reference revision. Existing models stay usable.
3. Remove opaque backgrounds, then uniformly scale each silhouette to the same
   height and floor. Align a robust lower-torso silhouette axis at x=512 on a
   1024px square. Wide wings/tails reduce the shared height to remain in frame.
   The process never stretches images or independently recrops them afterward.
   This is silhouette alignment, not semantic rigging: inconsistent poses or
   anatomy in the approved art can still produce a poor reconstruction.
4. Full **Hunyuan 2mv** geometry: **75 steps, guidance 5.5, seed 923300,
   extraction resolution 512, chunks 10000**. Save the native mesh and actual
   512px model-conditioning images. Verify four image tensors survived.
5. Retain **120k triangles** for **Hunyuan 2.1 PBR** painting. Condition on all
   four aligned references at 768px, render six output views and bake a 4096px
   atlas. The installed paint pipeline uses seed 0. Verify the observed reference
   count, output view count and actual texture sizes before accepting output.
6. Correct JPEG/PNG declarations and smooth coincident upper-central shading
   normals without changing positions, UVs, indices or texture bytes. Prepare 2K
   PBR maps and a gentle 60k intermediate, then apply the standard 20k reduction.
   Albedo uses JPEG95/4:4:4; data maps use PNG. This is a practical quality budget,
   not mathematically lossless compression.
7. Fit the existing base, validate finite geometry, texture integrity and runtime
   budgets, then publish the GLB and catalog entry. Existing family assignments
   change only through the app's existing selection/automatic family behavior.

Alignment, shape and paint each have a private persisted receipt and output
hashes under the job's `hybrid/` directory. The cache key includes all policy
settings plus the approved image fingerprint. Retry reuses verified completed
stages; changed art/settings, missing files or corrupted outputs invalidate them.
A paint failure therefore does not require another geometry generation. A
submitted GPU request finishes before cancellation releases the queue; uncertain
timeouts pause it rather than silently starting overlapping work.
GPU HTTP calls use an explicit 90-minute end-to-end deadline instead of fetch's
separate five-minute header deadline. If the response was lost after completion,
retry can recover the worker's receipt after checking the exact request and input
hashes. Check worker status before resuming an uncertain operation. After PBR
diffusion, its weights move to CPU before super-resolution to preserve GPU
headroom; this changes staging rather than output quality or texture resolution.


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

Research candidates below describe the earlier comparison. The accepted default
is now the 2mv geometry / 2.1 PBR hybrid above. Pixal3D and the other candidates
remain optional experiments:

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

### Lossless model delivery (18 October 2026)

The final `package.mjs` step now applies `lossless-delivery-v1` to every newly
generated creature or character, **after** Blender fits the base and the original
finished textures are restored. This avoids Blender undoing delivery compression.

- Untagged 8-bit PNG textures, including metallic/roughness maps, are tested with
  optimized PNG and lossless WebP. Only a smaller candidate with identical decoded
  RGBA pixels and dimensions is accepted. Existing JPEG images are not recompressed;
  tagged profiles and unsupported encodings are preserved.
- Meshopt losslessly encodes the existing triangle data. Identical vertices can be
  merged and triangles reordered; no geometry is simplified or quantized. Every
  triangle corner's attributes and winding are checked after decoding. Scene
  transforms, materials, texture pixels and the base placement must remain exact.
- The finished file is reloaded before publication. Tiny files that would grow
  retain their previous encoding. A failed verification fails that production
  attempt rather than publishing an unverified model.
- Each job keeps `model.glb.compression.json` with the size saving, texture hashes
  and preservation checks. Catalog byte counts and SHA-256 identify the actual
  compressed file. The existing battlefield loader already supports Meshopt and
  `EXT_texture_webp`; no external decoder download or new dependency is required.

This is lossless **relative to the already finished 20k/2K asset**. The earlier
geometry reduction and color JPEG preparation still use their approved settings.
Existing catalog files and user uploads are not automatically rewritten.

The approved elf-paladin comparison reduced its 6,308,148-byte GLB to 3,980,604
bytes (36.9%). Of that saving, 2,094,400 bytes came from lossless material-texture
encoding and 233,144 bytes from mesh encoding. Both retain 20k triangles, all
decoded texture pixels and the same PBR response. An interactive lighting preview
verified daylight, lanterns, colored lights, rotation and spell flashes. This
measurement is for that comparison asset; savings depend on each model's data.

Focused checks: `npm run test -w server -- --run tools/asset-production/lossless_delivery.test.mjs`.

### Existing hybrid replacements (18 October 2026)

The reviewed hybrid goblin, skeleton, wolf, bandit and dragon now replace their
five bundled defaults. Family IDs and the existing alternate sculpts stay intact.
The approved stronger crease treatment is retained on wolf, bandit and dragon;
compression does not apply another color or geometry edit. The skeleton retains
its reviewed recovered multiview shape; it is not regenerated with different
geometry settings during this delivery change.

| Hybrid asset | Before compression | Delivery copy |
| --- | ---: | ---: |
| Goblin | 6.33 MB | 3.68 MB |
| Skeleton | 6.48 MB | 3.88 MB |
| Wolf | 6.34 MB | 3.82 MB |
| Bandit | 7.11 MB | 4.07 MB |
| Dragon | 7.60 MB | 4.62 MB |
| Elf paladin / Liz | 6.33 MB | 3.99 MB |

The six reviewed hybrid assets total about 40.19 MB before and 24.05 MB after
compression. This compares the hybrid models, rather than their older single-map
material predecessors. Five receipt files under `assets/miniatures/hybrid-delivery`
are checked against the bundled assets during every client build: decoded texture
pixels, exact triangle-corner geometry, bytes and SHA-256 must match. Filenames
include content hashes so clients cannot keep using a cached previous model.

Liz's approved hybrid elf was installed through the character upload endpoint in
the existing mobile test session, preserving her sheet, icon and other character
data. Its uploaded family and compressed file live in the host's upload catalog,
as other custom character models do; `liz.json` records the source and result.
The installed service/main campaign is not changed by this asset-development step.

### Pedestal contact in the battlefield

The shared pewter-base renderer measures the original support surface and moves
body meshes in world space when installing the taller base. It keeps the base
floor fixed, preserves intentional hovering, and applies the lift once even with
nested upload wrappers or mesh attachments. Recognized generated bases, uploaded
bases and Z-up source hierarchies use the same path. Baseless uploads are not
arbitrarily lifted, and repeat preparation does not accumulate offsets.

This fixes the older approach that lifted top-level scene children by a constant:
upload wrappers also contained the base, so the pedestal rose with the figure.
The renderer also now anchors a replacement base correctly when its original
geometry had its coordinates baked rather than using a translated mesh origin.
`miniatureBasePlacement.test.ts` covers these arrangements. A live browser audit
of the three comparison dragons and the direct generated GLB measured feet on
the new inner top within 0.00001 model units, with an unchanged base floor.

### Accepted crease definition finishing

`prepare_hybrid.mjs INPUT OUTPUT --crease-detail` applies `defined-crease-v2`.
The app producer enables this accepted treatment for newly generated models.
The standalone preparation tool still requires the explicit flag. It processes base color
after resizing and before normal JPEG encoding, without changing geometry,
normals or metallic/roughness maps. Small luminance valleys are darkened by at
most 35%; flat areas, highlights, deep shadows and UV island edges are protected.
Transparent pixels and unsupported UV mappings are left alone. The operation
does not add geometric AO or directional shadows. Use the original painted mesh:
an output marker rejects accidentally applying the pass again to its own output.

The earlier `subtle-crease-v1` dragon, goblin and elf-paladin trial darkened used atlas
pixels by an average of 0.37%, 0.17% and 0.18%, respectively, with a 6% local ceiling before
JPEG encoding. Runtime GLBs grew by approximately 25 KB, 11 KB and 3 KB. Geometry,
normals and PBR data maps were verified byte-for-byte unchanged. Running preparation
without the flag reproduced the previous dragon intermediate's exact file hash.
That first trial was judged too subtle on the battlefield. The revised dragon
trial uses a wider local neighborhood and stronger gain, averaging 3.24%
darkening over used atlas pixels with a 35% local cap; roughly 19% of used pixels
change. Its based runtime GLB is about 175 KB larger than the untouched hybrid.
The map preview compares OLD / HYBRID / STRONGER with matched sizes and lighting.
Geometry and non-color PBR maps remain byte-for-byte unchanged. This remains
enabled in new production after review, and does not globally darken pale albedo.

The subsequent wolf trial reused its original four views and the historical
same-art model. The real app queue completed alignment, 75-step/5.5 geometry,
four-reference painting, reduction and base fitting in about 4 minutes 13 seconds.
The matched runtime bodies contain 20k triangles; based GLBs are 1.39 MB old,
6.09 MB hybrid and 6.34 MB with the stronger crease pass. The latter averages
4.43% darkening on this fur texture. Front, side, rear and real-map previews were
checked, including mobile overflow and measured paw-to-pedestal contact. This is
a comparison fixture; the live wolf library model remains unchanged.

The bandit follow-up retains the historical front image (correctly composited
onto white), with matching side/rear references created using Codex image_gen.
The historical bandit had only a front reference. Comparing original pixels to
that test's rematted input showed almost-transparent red edge pixels (alpha at
most 6/255) had been promoted to nearly opaque pixels (up to 254/255); the red
then appeared in the generated albedo. Current hybrid alignment preserves
existing alpha rather than replacing it. An alignment regression checks that
nearly transparent red fringes never become opaque. The new bandit has natural
ear colors; the comparison retains the earlier red-ear result for inspection.
All default bodies have 20k triangles; with bases, the hybrid is 6.97 MB and its
stronger-crease copy 7.11 MB. Eight map figures, mobile overflow, geometry/PBR
preservation, and base contact were verified. Live library assets are unchanged.

Run its focused checks with:

```powershell
npm run test -w server -- --run tools/asset-production/crease_detail.test.mjs
```

The 17 October hybrid validation reused the original goblin and dragon turnaround
images, without manual reference edits. Both ran through `AssetQueue` and
`produceAsset`, including real alignment, GPU generation, reduction, Blender base
fitting and catalog publication in disposable data. Four actual references and
six generated paint views were verified. The original library models were kept.

| Complete based GLB | Original workflow | Hybrid |
| --- | --- | --- |
| Goblin | 1.57 MB | 6.33 MB |
| Dragon | 1.56 MB | 7.43 MB |

All comparison bodies use the same 20k triangle / 2K texture budget; bases add
roughly 760 triangles. Hybrid PBR maps account for the larger storage. The goblin
shows clearer material separation and a coherent rear; the dragon's wing mesh is
more complete, but its PBR appearance is substantially paler than the baked old
texture. Approval should consider both close-up inspection and battlefield scale.
Automatic alignment fixes framing; it does not guarantee artifact-free anatomy.

The live dragon trial also exercised recovery: normal 120k simplification rounded
to 119,999 triangles, exposing an overly strict validator. The corrected check
accepts small rounding differences, while rejecting substantial unexpected
reduction. A subsequent retry recovered the completed paint receipt without
regenerating its saved shape. Desktop/mobile inspection and an actual battlefield
with eight comparison figures loaded without browser errors or horizontal overflow.

`npm run typecheck`, `npm test`, and `npm run build` cover the normal application.
`hybridProduction.test.ts` verifies staged recovery and cache integrity.
`test_align_views.py` and `test_worker_adapter.py` test deterministic framing and
repeatable worker initialization without GPU weights.
`assetProduction.test.ts` verifies reuse, deduplication, serial execution,
persistence, interruption, pause/resume, retries, publication failure and creature
save hooks. The browser test named `asset production keeps...` verifies a 2D
placeholder becoming a real WebGL model in both roles, without rejoining, and
DM-only job access. It simulates publication with a known bundled GLB.

For an opt-in pipeline contract smoke on a worker-equipped host:

```powershell
node --import tsx server/tools/asset-production/smoke.mjs "PATH/TO/RAW_TEXTURED_MODEL.glb"
```

This uses controlled image/hybrid responses and **real** model finishing,
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

## Shared character textures (18 October 2026)

The bundled Druk, Varis and Vanec geometry tiers now reference content-addressed
images under `/miniatures/textures/`. Each distinct encoded image is delivered
once, with exactly the same resolution and bytes as before. Geometry stays in
GLB files, including Meshopt data, materials, transforms and Vanec's animations.
Generated/uploaded models remain standalone GLBs.

Run `node scripts/token-assets/share-character-textures.mjs` after installing a
new reviewed character tier batch. It is idempotent. The build validates all
three manifests and the shared files against receipts in
`assets/miniatures/shared-textures/`. Each receipt can reconstruct its original
standalone GLB byte for byte; earlier compression/reduction receipts keep their
original source hashes as provenance.

For a standalone Blender/export copy:

```powershell
node scripts/token-assets/export-character-model.mjs druk high exported-druk.glb
```

This restores the exact original embedded-image GLB. It refuses to overwrite an
existing output file. Deploy/copy the shared `textures` folder along with the new
GLBs; a geometry GLB on its own is not a standalone export.

See [storage and model detail measurements](CHARACTER_SHARED_TEXTURES_2026_10_18.md)
for sizes, hardware tests and the decision to retain zoom-based detail.

Character loading now uses [two tiers per preset](TWO_TIER_MINIATURES_2026_10_18.md):
Low at distance/off-screen for High/Balanced, or Battlefield for Low graphics,
plus the preset's High/Balanced/Low close tier for sufficiently large on-screen
figures. Auto follows its
resolved preset. Hidden figures preload only the coarse model; close-tier files
are requested from projected model bounds inside the current camera viewport.

Battlefield body reduction uses the accepted [seam-safe workflow](BATTLEFIELD_SEAM_SAFE_REDUCTION_2026_10_19.md):
reduce from Low with ratio `0.2`, error `0.002`, locked borders and no Permissive
flag on body primitives. Separate heads, hands, weapons and accessories keep
their existing policies; texture bytes remain exact. The reduction script reads
both standalone and shared-texture sources. The runtime manifest selects the
repaired 67,543-triangle Druk and 81,756-triangle Varis; Vanec already used the
safer body settings. The linked workflow includes regeneration, installation,
shared delivery and validation commands.

## Generated geometry tiers (19 October 2026)

The common creature/hero/recraft pipeline now finishes the ordinary ~20k body
first, then recovers an aligned ~120k body from the already-painted master using
retained UV landmarks. Characters also receive a ~60k Balanced version. This is
local geometry processing, with no additional AI requests. Every tier preserves
the standard model's 2K texture pixels, materials, base and placement, and uses
verified lossless delivery compression. Small base meshes add to these counts.

Generated characters use ~120k for High close-ups, ~60k for Balanced close-ups,
and ~20k for Low and distant/off-screen views. Creatures use ~120k only for High
close-ups and ~20k otherwise. Each mode requests at most two geometry files per
family. Auto uses its resolved graphics preset. Existing zoom prefetch, viewport
checks and hysteresis still apply. The custom bundled party models retain their
previously reviewed tiers. User-uploaded GLBs keep their current import policy.

Optional detail metadata (`highDetail`, and `balancedDetail` for heroes) persists
in the asset queue/catalog. Files are verified and published before catalog
metadata. If a source cannot be safely aligned, the standard model still
publishes, with a DM notice explaining that higher geometry was unavailable.
No campaign migration or mass regeneration occurs. Reviewed elf paladin,
bandit and goblin source hashes attach their tested alternatives; a recraft with
a different source hash cannot inherit the old shape.

Reproduce geometry preparation from an existing painted master and fitted model:

```sh
node scripts/token-assets/trial-generated-quality.mjs inputs.json NEW_DIR --character-tiers
node scripts/token-assets/trial-generated-quality.mjs inputs.json NEW_DIR --high-only
```

The character option creates only 60k/120k; creature creates only 120k. Without
either option the offline comparison still produces 20k/40k/60k/120k candidates.
See [the measurements and comparison](GENERATED_TOKEN_GEOMETRY_TRIAL_2026_10_19.md).
