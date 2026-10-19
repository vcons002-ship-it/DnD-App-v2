# Druk component texture and Battlefield repair trials

The final v29 candidate was approved on 19 October 2026 and is now wired into the runtime catalog in High, Balanced, Low and Battlefield tiers. Earlier revisions below are historical review trials.
The Low minimum tier policy is a separate change, committed as `21d1829`.

## Interactive comparisons

- [Body-only texture and manual right-wrist repair](https://dnd.nic024i.app/uploads/previews/druk-model-trials-20261018/druk-wrist-review/)
- [Original, body-only, and body plus head and hands](https://dnd.nic024i.app/uploads/previews/druk-model-trials-20261018/druk-body-review/)
- [Battlefield original, two-sided body, and conservative body reduction](https://dnd.nic024i.app/uploads/previews/druk-model-trials-20261018/druk-gap-review/)

Rotate all views together. Buttons include face, hands, right wrist, rear, map at
45 degrees, and overhead. Mobile layouts stack the comparison panels.

These pages are files served by the existing local installation under
`server/uploads/previews/druk-model-trials-20261018`, through its normal tunnel.
They do not require a new app deployment. Review GLBs deliberately retain unused
original data to verify that protected components survive unchanged. Their
displayed file sizes are not optimized production budgets.

## Source and scope

Source High: `/miniatures/druk-high-shared-3b43a1a9b56c.glb`.
Source Battlefield: `/miniatures/druk-battlefield-shared-9412d5a70d4c.glb`.
Source Low: `/miniatures/druk-low-shared-f5edeb1b13f5.glb`.

Trial working files and scripts are on D: in
`tmp/druk-body-pbr-20261018` in the rendering workspace. Source references were
rendered from the accepted component meshes, rather than regenerated concept art.
Each component used four equally framed orthographic RGBA views. Isolated head
geometry was painted in its local coordinate system, then restored to its
original node transform. The two hands were separate requests.

The PBR stage used Hunyuan 2.1, four references at 768px, six generated output
views, a 4096px atlas, seed 0, and a 300k face budget to avoid decimating any
component. No shape generation ran.

| Component | Triangles retained | Successful paint time |
|---|---:|---:|
| Body/armor, excluding the tiny custom hand patch | 233,920 | about 214 seconds |
| Head | 238,548 | 166.44 seconds |
| Right hand | 19,116 | 90.03 seconds |
| Left hand | 15,852 | 86.92 seconds |

Four encoded references and six generated views were observed for each request.
The body export succeeded, but an upstream final Chinese status print raised a
Windows encoding error. The generated GLB was recovered and independently
validated. Later jobs used UTF-8 output. The first right-hand attempt ran out of
GPU memory; the isolated worker was restarted and VAE slicing enabled for the
successful retry. The normal app worker was not changed or stopped.

## Preserving custom work

The UV/export stage recomputed surface normals, causing visibly faceted shading.
For a fair texture-only comparison, each generated face corner was matched back
to its original triangle. Original positions and shading normals were restored;
the new UVs and PBR materials were retained. The largest pre-restoration corner
error was below 0.000001 model units. Triangle counts were unchanged.

Reassembly appends new body data to the original GLB and changes only the chosen
mesh primitive references. Protected original binary data, material tables,
texture payloads, other meshes, and transforms remain intact. The body-only
candidate preserves the original head, hands, sword, wrist joins, accessories,
and base. The optional head/hands experiment changes only their materials/UVs
and retains their geometry and placement. The sword remains original throughout.

The head experiment changed the painted eyes and lips noticeably. The original
face remains the preferred comparison baseline; no default was replaced.

### Subsequent review: retain original head and hands; rotate the right hand

The user rejected the head/hand texture experiments and chose to retain their
original textures. The active body comparison no longer loads that rejected
combined GLB. The accepted body texture remains the basis for further wrist work.

The first sleeve repair still looked awkward, so a new comparison rotates the
original right hand **6 degrees about its measured wrist-opening center** and
refits the sleeve to that rotated boundary. Opening-plane normals measured
10.503 degrees apart before this change and 4.503 degrees after it. This is a
local wrist adjustment, not a change to the whole pose. The hand pivot remains
fixed; the sword and left hand stay fixed. Original head/hand geometry buffers,
textures, and materials remain intact. The sole hand change is its node transform.

[Review the wrist rotation](https://dnd.nic024i.app/uploads/previews/druk-model-trials-20261018/druk-wrist-rotation-review/?view=wrist)
compares the body before repairs, the previous sleeve repair, and the rotated
hand. Front and side grip views were checked; this remains a review candidate.
`wrist-hand-rotation.json` and `wrist-rotation-validation.json` record the pivot,
axis, transform, unchanged assets, and candidate hash.

### Stronger rotation and a tapered wrist

After the user requested more rotation and a more natural hand-to-wrist shape,
the next candidate uses a **12-degree rotation** around the main glove's actual
wrist opening. It removes three older proximal wrist-patch primitives (3,720
triangles), retaining the main finger/hand mesh and grip-interior primitive
exactly. The original head and hand texture images remain unchanged.

The new join follows a curved centerline, tapers through the wrist, and connects
the measured forearm and main-glove openings. A new small leather texture is
baked from the original glove grain and accepted body colors, matching the
attachments in linear color. Silver-painted rim samples are excluded. Roughness
blends toward the original glove. Local forearm rim shading is blended into the
join. No further AI generation was used.

The full figure has 877,414 triangles. The left hand and sword remain exact and
fixed. This is a separate review candidate, available in the third panel of the
[wrist refinement comparison](https://dnd.nic024i.app/uploads/previews/druk-model-trials-20261018/druk-wrist-natural-review/?view=wrist).
The first panel is the body before repairs; the middle panel is the 6-degree
candidate. Macro side views and the full grip were inspected, with desktop and
mobile browser checks. The high-detail review copies still contain unused source
data for preservation checks and are not production-size exports.

## Manual right-wrist candidate

The body pass painted an exposed forearm rim as silver metal beside the existing
leather join. The user accepted the body appearance and requested a local wrist
repair. This candidate:

- assigns the small cuff region to the existing nonmetallic glove leather;
- rebuilds the existing wrist transition from its measured two boundary loops;
- smooths/resamples those loops into a 96-segment, seven-ring leather sleeve,
  with slight overlap at each attachment;
- retains the original head, both hands, sword, and every node transform.

The join drops from 2,342 to 1,152 triangles. Full figure count is 879,214 versus
880,404 before. The repair adds one material group for the corrected cuff region.
There was no GPU performance benchmark for this bespoke repair. Full figure,
close side views, map views, and browser loading were checked.

## Cheap Battlefield candidate

Two-sided body rendering alone did not fix all visible problems. The conservative
candidate replaces only the armor/clothes and arm primitives with a gentler
reduction from Low, using `ratio=.2`, `error=.002`, locked borders and no
Permissive flag. Original texture bytes and all protected components are exact.

| | Original Battlefield | Conservative body candidate |
|---|---:|---:|
| Triangles | 51,832 | 61,202 |
| Geometry GLB bytes, shared textures excluded | 1,319,656 | 1,715,688 |

The added 396,032 bytes reuse existing cached texture images. The candidate
improves the observed arm/boot/armor seam appearance; it is not a guarantee that
the entire assembled character is watertight. The shader-only alternative and
the original remain available for comparison.

## Verification records

Small JSON receipts are in `assets/miniatures/druk-component-trial-20261018/`.
The public previews were checked in desktop and 412px mobile browser viewports.
The unrelated Low minimum tier app changes passed typecheck, build, all 2,299
tests, and real renderer tier/mode-switch checks before their commit.

## Leather-wrap contour revision

The user rejected the 12-degree candidate's middle flare and requested a thin
leather covering that follows hand/wrist anatomy. The new review candidate keeps
the same rotation, replaces the bowed/pinched loft with a straight rounded taper,
and smooths the proximal hand opening locally. The forearm positions stay exact;
the original hand UVs, texture, grip-interior primitive, head, sword and left hand
are retained. The proximal hand contour is adjusted by at most 0.01066 model units.

The wrap is stitched to both original opening contours, with blended shading and
subtle grain sampled from the original leather. It has no raised cuff edge. The
full review mesh has 877,942 triangles; its unoptimized preservation container is
31,779,596 bytes and is not a production size estimate. SHA-256:
`2c3feda32a41db48ae29aaa05c74bdb51d49ea8ef7e324aa0a9481004f3d1745`.

[Interactive leather-wrap comparison](https://dnd.nic024i.app/uploads/previews/druk-model-trials-20261018/druk-wrist-wrap-review/?view=wrist)
shows the original body join, the previous flared repair, and the new wrap from
left to right. Side, reverse and normal grip views were inspected. Public browser
checks at 1800, 1200 and 412px loaded all three models without HTTP/page errors.
The live miniature catalog remains unchanged pending visual approval.

## Rounded wrist bend revision

The leather-wrap version still retained a flared rim in the original forearm.
The user requested a rounded transition from the arm through the wrist into the
back of the tilted hand. The new candidate clips that small forearm end section
at a measured plane 0.028 model units farther back. It removes 764 whole triangles
and splits 140 crossing triangles; retained body positions, UVs and material stay
original. The new bridge follows smoothed surface tangents at both ends rather
than a straight-sided sleeve, with 25 rings and stitched opening contours.

The same 12-degree hand rotation is retained. Only the proximal hand contour is
adjusted, by at most 0.00319 model units. The original hand texture/UVs, head,
grip-interior primitive, sword and left hand are preserved. The bridge uses
original leather samples, with quieter roughness to avoid a bright cuff-like rim.

[Rounded wrist comparison](https://dnd.nic024i.app/uploads/previews/druk-model-trials-20261018/druk-wrist-rounded-review/?view=wrist)
shows the original join, previous wrap and rounded bend from left to right.
The full review mesh is 880,377 triangles and 31,755,200 bytes (unoptimized,
including retained source bytes for preservation verification). SHA-256:
`cb24a4e24eccdaee652b62548b317894aecefb5aade4b8058074634101c74166`.
Side, front, reverse and normal-grip browser renders were inspected. Finite
geometry, valid indices and preserved unrelated assets were checked on reload.
This remains a review copy; no production catalog or campaign was changed.
Public browser checks at 1800, 1200 and 412px loaded all three models without
HTTP or page errors. The right-hand rotation matrix matches the previous
candidate to floating-point precision (maximum component difference 1.81e-16).

## Unified right forearm, wrist and hand PBR trial

At the user's clarification, the paint input includes the **entire brown-covered
right forearm**, the rounded wrist bridge and the entire right hand/grip interior.
The selected region contains 27,175 triangles: 5,051 forearm triangles plus the
hand and wrist. Thirty-six green skin faces at the edge were left original.
All three regions were sent together, in their current assembled coordinates, to
one Hunyuan 2.1 PBR request with four equally framed orthographic references.

The first successful pass, `paint-armwrap-v2`, took 91.89 seconds but retained a
strong red forearm/dark wrist color split from the source renders. For the second
pass a realistic worn walnut-brown leather tile was generated with the built-in
image tool and applied as material guidance to the same extracted geometry.
Four new references were rendered using that same leather across the forearm,
wrist and hand. The paint input geometry remained the original extracted mesh.
`paint-armwrap-v4` completed in 88.09 seconds with four verified encoded references,
six generated output views and 4096px albedo/metallic/roughness textures.

The initial trial worker launch lacked the managed checkpoint-cache environment;
a fresh offline worker pointed at the installed cache resolved the login/cache
failure. A later second-job allocation failed; restarting only the isolated trial
worker resolved it. The normal 42004 app worker and unrelated applications were
not stopped or modified.

Generated triangle corners were matched to the original source (maximum mapping
error 8.52e-7 model units), then original positions and shading normals restored.
The painted mesh was divided back into the original hand and wrist nodes and the
forearm region, with one shared PBR material. All node transforms, the rounded
wrist shape, grip, head, sword, left arm/hand and remaining body are preserved.
The full candidate remains 880,377 triangles. No new knuckle sculpt was applied.

The second pass gives a more consistent leather color across the complete region,
but softens some of the previous fine surface detail. This remains a visual review
trial and has not replaced any production miniature. The review container retains
source bytes for preservation checks, so 40,937,980 bytes is not a production
compression estimate. SHA-256:
`d691ebb459aff4325ef82d5ccd655447d1dcb9447fb7d5de7d3c676509d5925a`.

[Unified leather before/after](https://dnd.nic024i.app/uploads/previews/druk-model-trials-20261018/druk-armwrap-texture-review/?view=wrist)
shows the current rounded wrist on the left and the texture trial on the right.
The Hand + forearm button frames the whole painted region. Side, reverse and full
grip views were inspected. The isolated texture worker is stopped after the trial.
Public checks at 1800, 1200 and 412px loaded both comparison models without
HTTP or browser errors.

## Whole body with arms and hands, excluding head and sword

The user accepted the unified-leather approach but requested a full-body paint
trial to remove the remaining arm transition. The input is the latest
`druk-armwrap-pbr.glb`, including its current rounded wrist and approved right-hand
rotation. Seven nodes are painted together: body/clothes/armor/arms, right and left
hands, both wrist transitions, and the two neck repair/closure meshes. This is
284,105 triangles. The head, sword, separate hip axes/hangers and display base
are excluded from the paint input and remain byte-identical in the assembly.

Four orthographic RGBA references were rendered from that exact assembled input.
The Hunyuan 2.1 PBR stage used 768px references, six generated output views, a
4096px atlas, no remesh and a 300k face ceiling; no geometry was reduced. An empty
unused primitive from a previous assembly was removed from the paint-only input
after Trimesh rejected it. No visible triangles were removed. The successful
`paint-wholebody-v2` request took 206.36 seconds with all four reference images
verified in the encoder.

Original triangle positions and shading normals were restored after UV export,
with a maximum corner-matching error of 8.96e-7 model units before restoration.
The result was split back into the seven original nodes with their original
transforms, sharing the generated PBR material. The complete figure retains
880,377 triangles. Protected meshes, original binary data and original material
table entries were checked byte-for-byte; finite geometry/valid indices were
checked on reload.

The arm-to-skin transition is visibly cleaner than the cropped arm trial. The
tradeoffs are softer chainmail/garment grain, warmer brown/red leather, and a
new pale patch at the back of the neck (the neck was included; the original head
was not painted). These observations remain visible in the comparison rather
than being hidden by manual touchups. No runtime model was replaced.

[Whole-body texture comparison](https://dnd.nic024i.app/uploads/previews/druk-model-trials-20261018/druk-wholebody-texture-review/)
shows the previous body + leather-arm trial on the left and the full-body paint
on the right. Full figure, hands, arm joins, reverse views and head/neck context
were inspected. Review GLB: 59,827,900 bytes, deliberately retaining previous
source data for preservation verification; this is not a production compression
estimate. SHA-256:
`b85ba9e1e7970dd221e49854987a68015d957c997470e0af8829634e115fad95`.
Public checks at 1800, 1200 and 412px loaded both models without HTTP or browser
errors. The isolated trial worker was stopped; the normal app paint worker
remained healthy and idle.

## Full arms with approved original concept-art conditioning

The full-body trial was rejected because it lost detail. This new trial starts
from `druk-armwrap-pbr.glb`, preserving its previous torso/armor, head, sword,
neck repairs, base, accessories, rounded wrist and current hand rotation. Both
arms below the sleeves, both hands, and both wrist transitions were extracted
as 69,049 triangles. No geometry generation, remeshing or reduction was used.

Unlike the preceding trials, which used views rendered from the edited 3D model,
this pass uses four crops of the approved original art in
`assets/miniatures/runtime-provenance/druk-v9/views-ready-01/`. Each crop uses
(180,395)-(825,690) on the 1024x1536 source and is padded to a 645px square.
API left maps to original right-side, API right to original left-side, matching
the original model's camera convention. Original paths, hashes, crop coordinates
and submitted-image hashes are recorded in `fullarms-reference-provenance.json`.

The four reference images were verified in the actual encoder. Hunyuan 2.1 PBR
used 768px conditioning, six generated output views and a 4096px atlas. The job
completed in 96.97 seconds. Original positions and normals were restored after
UV export (maximum pre-restoration position matching error 8.61e-7). The complete
figure retains 880,377 triangles and unchanged node transforms. The source binary,
original materials, protected meshes, and all unselected body faces/attributes
were verified intact. The isolated worker was stopped afterward; normal worker
42004 remains healthy and idle.

Result: finer brown leather details and exposed pale fingers are generated, but
there is unwanted cloth/chainmail and leather texture on the exposed upper arms,
and the skin is too pale for the current head. The original crops still include
nearby torso/sleeve material, and that provides a plausible source for this
contamination; this is an inference rather than a measured cause. This result
is not accepted or applied to the runtime miniature.

[Full-arms interactive comparison](https://dnd.nic024i.app/uploads/previews/druk-model-trials-20261018/druk-fullarms-texture-review/)
provides before/after rotation, full-figure, hands, forearm, rear, 45-degree map
and overhead views. [Submitted original-art crops](https://dnd.nic024i.app/uploads/previews/druk-model-trials-20261018/druk-fullarms-texture-review/original-reference-sheet.jpg)
are available for inspection. Public browser checks at 1800, 1200 and 412px loaded
both models without HTTP or browser errors. Front, side, rear and map views were
visually inspected. Review GLB is 59,035,228 bytes because original data is retained
for preservation verification; it is not an optimized production asset size.
SHA-256: `b84f07c219d2245ecf60a3ca31e2168c5a8a38dba012e3520fcc631cc659b273`.

## Left glove, wrist and forearm matched to the accepted right glove

User rejected the full-arms original-art repaint and selected the preceding
`druk-armwrap-pbr.glb` as the baseline. Only the left hand, left wrist transition
and brown left forearm wrap are repainted. The exposed upper arms, right glove,
head, sword, torso, neck and accessories remain unchanged. The paint input is
23,917 triangles, including 5,713 body forearm faces selected from their brown
material within the left forearm volume. Its source geometry is not changed.

Four reference renders use the same `unified-leather-reference.png` and triplanar
mapping scale used for the accepted right leather arm trial. Original concept
crops are intentionally excluded from this pass because they introduced pale
skin and nearby armor material in the preceding trial. A stale per-vertex color
attribute was removed from the guidance-only copy when expanding the mesh for
triplanar UVs; otherwise its old vertex count made that guidance GLB invalid.
The paint geometry and source model are unaffected by that reference-only repair.

The Hunyuan 2.1 PBR pass used 768px conditioning, six generated views and a 4096px
atlas. It completed in 88.8 seconds, with all four actual references verified in
the encoder and all 23,917 triangles preserved. After export, original positions
and shading normals were restored; maximum matching error was 8.40e-7. Assembly
checks verified 880,377 total triangles, unchanged transforms/material prefixes,
all original source binary data, unselected body faces/attributes, and unchanged
right glove and other protected meshes.

The left glove now has a closer warm brown leather finish to the right glove and
a more consistent hand/wrist/forearm texture. Its painted tone is slightly warmer
than the right under identical lighting, and the existing forearm boundary remains
visible at close range. No geometry repair or upper-arm repaint was performed.

[Left glove before/after](https://dnd.nic024i.app/uploads/previews/druk-model-trials-20261018/druk-left-glove-review/)
provides synchronized rotation and close-ups. Desktop and mobile checks at 1800,
1200 and 412px loaded both models without browser or HTTP errors. Front, side,
back and map views were inspected. The trial worker was stopped and normal worker
42004 remains healthy and idle. No runtime catalog miniature is replaced by this
review trial. GLB is 49,605,044 bytes with retained original data for preservation
verification, not optimized production size. SHA-256:
`329715121f9716308e39ef1214e73f25286ccbff8a2935a0c53d6d1cd76a9448`.

## Generated leather hand wraps applied manually

The user requested an actual image-generated leather hand-wrap material applied
manually, rather than another model repaint. Built-in image generation produced
`leather-handwrap-generated-v1.png` (1254x1254 RGB). Its full prompt is saved in
`assets/miniatures/druk-component-trial-20261018/leather-handwrap-generation-prompt.txt`.
The texture shows overlapping worn walnut-brown leather bands with pores, creases,
burnished edges and occasional stitching. Derived normal and nonmetallic roughness
maps provide restrained edge/grain relief and matte leather lighting response.

The source geometry is `druk-armwrap-pbr.glb`, retaining the preferred torso,
head, upper arms, sword and rounded right wrist. Both hands, both wrist joins,
the already repainted right forearm, and the full brown left forearm receive one
shared material. Left forearm selection was expanded from the color-threshold
crop to 7,504 contiguous spatially selected cloth faces while excluding original
skin/repair triangles, covering the leftover material patch. Right forearm has
5,051 faces. No geometry is generated or deformed. Four hand/wrist nodes and
12,555 body forearm faces receive new UVs; all 880,377 original triangles remain.

UVs are mapped cylindrically around the individual arm axes in world space and
written on the existing local-space vertices. The circumferential UV seam is split
per triangle to avoid atlas-wide stretching. An axial tile length of 0.38 model
units gives visible wrapping strips. Original node transforms and normals are
kept; vertex colors and obsolete tangents are excluded only from the new material
surfaces. No Hunyuan or diffusion texture pass was run for this application.

Assembly validation verifies the unchanged source binary/material prefix,
protected meshes, unselected body attributes/materials/faces, original transforms,
finite geometry and valid indices. Review GLB: 56,854,784 bytes including retained
original data for preservation verification, not optimized production size.
SHA-256: `f83129660da838f7809a76305aa2769b8117b323a9212907760d97784ac5c353`.

[Manual leather-wrap comparison](https://dnd.nic024i.app/uploads/previews/druk-model-trials-20261018/druk-leather-handwrap-review/)
shows the prior matching brown-glove trial beside the new generated wrap material.
Front, side, rear and map views were inspected. Desktop/mobile checks at 1800,
1200 and 412px load both figures without HTTP or browser errors. Skin, head,
armor, sword and grip are preserved. The material relief is normal-mapped; no
physical wrapping-strip geometry was added. This remains a review asset and has
not replaced the runtime catalog model.

## Public comparison loading repair

The user reported that the generated-wrap after model was not loading. A fresh
public Chrome test did load both original review models, so the specific user's
failure was not reproduced and its cause is not confirmed. The delivery has been
hardened: remove unused and empty primitives/material data, weld duplicate
vertices, losslessly Meshopt-encode geometry, and losslessly WebP-encode eligible
PNG textures. Triangle corner attributes remain byte-exact, decoded RGBA pixels
remain byte-exact, and transforms differ by at most floating-point serialization
roundoff below 1e-12. No detail reduction, texture resizing or quantization is used.
Before GLB decreases from 49,605,044 to 40,145,484 bytes. After decreases from
56,854,784 to 41,629,888 bytes. Both delivery copies embed their image data.

The same public comparison page now shows download progress, automatically
retries one failed load, and presents Retry loading/Open after model only controls
if loading fails or the WebGL context is lost. Phones below 900px load the After
model alone by default, reducing concurrent graphics resource use; Before only,
After only and Side by side links remain available. Desktop defaults to both.
New content-hashed asset URLs prevent an old partial asset from being reused.

Public browser tests verify desktop side-by-side, phone-sized after, before and
mobile default views. An intentionally interrupted first request recovers through
the automatic retry; a persistent failure exposes the error and manual Retry
loading recovers after the network is restored. This is browser/device-size
simulation on the host, not verification on the user's physical phone.

## Leather-wrap coverage correction on both arms

User found old leather-color patches on both arms. The first material selection
covered the prior right forearm paint and a limited left forearm volume, but missed
faces at the attachment edges. In addition, some brown repair faces belonged to
original arm/skin material groups and were incorrectly excluded wholesale.

The coverage correction adds nearby original forearm cloth faces on both sides,
plus brown repair faces identified from the source atlas inside those arm volumes.
Green skin faces remain excluded; the left region is kept in front of the nearby
torso garment. The new side map assigns every selected face to the correct arm's
existing cylindrical mapping. Body wrap coverage increases from 12,555 to 16,313
triangles. Both hands and wrist joins retain the generated material. No geometry,
UV mapping scale, source texture or normal/roughness map is regenerated.

The complete figure retains 880,377 triangles and the original transforms.
Unselected body surfaces, head, sword, neck, base and accessories are unchanged.
Front, side and rear close-ups compare the previous wrap coverage with the fix;
the formerly smooth brown patches at the forearm attachments now receive the
same wrapping-strip texture. Existing boundary irregularities in the underlying
geometry are not reshaped by this texture-only correction.

The corrected public model uses lossless delivery encoding with unchanged
triangle corner attributes and texture pixels. It is 41,631,492 bytes, SHA-256
`42f405cb8daddc3a81ddf0cc58cd8f448cf94b35b8e918ad7b2a3d47852e15e4`.
The original comparison URL now uses its new content-hashed model asset. Public
browser checks cover phone-sized after/before/default, desktop side-by-side,
and an interrupted first download with automatic retry. Both models load.
Runtime catalog miniatures remain unchanged; this is a review copy.

## Chainmail, arm skin and lower shoulder-plate corrections

The user identified leather spilling onto chainmail, plastic-looking pale arm
skin unlike the face, and bone-colored lower shoulder plates. The forearm mask
now excludes the torso-facing surfaces behind the left arm (118 formerly wrapped
faces restored). Hand/wrist geometry and the generated leather material remain.
Wrap coverage is 16,197 body triangles plus the four original hand/wrist nodes.

Arm skin and lower plates are corrected in the original body albedo and
metallic/roughness atlas using its existing UVs. A trial assigning whole triangles
to separate skin/steel materials produced jagged edges and was discarded. The
final per-pixel correction retains the original painted sleeve and plate borders.
Original skin/repair geometry plus green arm pixels define the skin region;
small atlas padding closes pale seams. Skin uses dark olive linear albedo
[0.032,0.048,0.013], restrained fine grain, metallic 0 and roughness 0.86. The
head's material, texture and geometry are unchanged. The arm tone is visually
matched against that head under the same preview lighting, not claimed as an
exact numerical match of every shaded pixel.

Warm bone-colored paint on the two lower shoulder plates is neutralized to steel,
retaining the original dark edges and geometry. Its metallic value is 0.92 and
roughness 0.32. Albedo and MR maps retain exactly the decoded source pixels outside
the skin/plate masks (16,013,863 checked pixels per map). The complete figure keeps
880,377 triangles; positions, normals and UVs match the supplied wrap-only source.
No head, sword, base or accessory repaint occurs. The skin, plate and wrap shapes
are not regenerated. Existing boundary irregularities remain geometry issues.

The final delivery corrects a source texture MIME mismatch to its actual image
format, prunes unused source data and losslessly encodes geometry and eligible
textures. Triangle corner attributes and decoded texture pixels remain exact
through that delivery stage; transforms retain precision within 1e-12. Public
GLB: 54,396,764 bytes, SHA-256
`db38fad43096061373e8a92c9b5b28abe6d5ca0d8f9152c09ff35e5a38cedfc5`.
The larger size reflects the revised full-resolution color/MR maps; this remains
a high-detail review export, not a runtime catalog replacement.

The existing public comparison now shows the previous wrap version before and
these corrections after. Face + arms frames the head and upper body together.
Phone-sized after/before/default, desktop side-by-side and interrupted-download
retry were tested through the public domain. Front/side, face-arm and map context
were inspected locally, and the public mobile rendering was inspected. No runtime
model catalog has been changed.

## Skin spill removed from chainmail sleeves

User found arm skin color on a chainmail sleeve. The prior skin atlas pass expanded
skin by a source-color test at whole-triangle granularity; those boundary triangles
can contain both the arm and sleeve artwork. The correction removes that whole-face
expansion. Original skin faces define the core region, and a protected atlas mask
is rasterized from every non-skin face. UV padding cannot recolor those protected
cloth surfaces. Already-green pixels at the exposed arm edge are corrected only by
a strict per-pixel green/chroma/brightness mask in the arm area, preventing the pale
skin rim without repainting a full mixed arm/sleeve triangle.

The original albedo and metallic/roughness values of 9,060,127 protected cloth pixels
were verified byte-exact against the source. The source head, steel shoulder plate
corrections, generated leather wrapping, geometry, UVs and grip are retained. No
new image generation or 3D reconstruction was used. The complete figure remains
880,377 triangles. Public before now shows material revision v3; after shows v4.
The Face + arms framing and mobile single-model/loading-retry behavior remain.

Final lossless delivery is 54,418,076 bytes, SHA-256
`1b028220e60e6862ff5b65c84003ea9f334da0f78febdbd0182033aef56d1c54`.
Geometry corner attributes and decoded image pixels survive delivery encoding
exactly, with transform roundoff below 1e-12. Public browser checks cover phone-sized
after/before/default, desktop side-by-side and interrupted-download recovery.
This remains a review miniature; the runtime catalog has not been replaced.

## Right sleeve, skin specks and square pauldron patch (material revision v5)

The v4 protected-mask check did not catch the reported right sleeve spill: some
sleeve-lining triangles were themselves classified as skin in the old material
provenance. Right-arm skin now follows the original per-pixel green paint boundary,
with only tiny enclosed pinholes filled and two texels of seam padding. The non-green sleeve lining is restored.
Nine isolated leather triangles on the bare upper arm were removed from the wrap
selection and returned to their original body UVs. The forearm wrapping stays.
The accepted steel correction on both lower shoulder plates is retained.

The square non-shiny shoulder patch was traced by raycasting to
`DrukV9_Pinned_Rear_Neck_Repair`, an older repair extending over the right pauldron.
Hiding that repair demonstrated why it must remain: it closes an existing cut in
the body. Its right-shoulder portion (2,311 triangles) now uses steel rather than
the old rear-neck atlas material. Main right-pauldron color/roughness is matched;
no repair geometry was removed. A small material split and white vertex colors
apply only to that shoulder portion; the rest of the neck repair retains its
original material.

Validation compares all 29 mesh nodes against v4: all 880,377 triangle positions,
normals and node transforms are exact, including across primitive regrouping.
Protected nodes, including the head, sword, hands, base and accessories, retain
exact attributes, material factors and texture bytes. Delivery encoding preserves
triangle-corner attributes and decoded texture pixels exactly. Final review GLB is
54,428,368 bytes; SHA-256
`fe846722d248614230aa1a462b2551001b91cee6fabe8b53bd2fc8b0a8c8283d`.

The public comparison now uses v4 before / v5 after, with Right arm and Rear
shoulder camera buttons. Local inside/outside/rear views and public camera controls
were inspected. Public browser checks passed phone after/before/default, desktop
side-by-side and automatic interrupted-download recovery. Runtime catalog unchanged.


## Metallic chainmail and rebuilt right pauldron (review revision v6)

Chainmail retains the exact existing body albedo texture and ring artwork. Its
metallic/roughness response is now satin metal, with slightly brighter reflective
ridges and subdued recesses. A restrained normal map derives relief from the
existing pattern. The established lower-plate correction mask is excluded from
this mail treatment. The green-skin mask has zero overlap with mail, and
1,014,357 green source texels retain exact metallic/roughness bytes. Existing
hands/wrists retain their separate generated-leather material.

The user clarified that the right pauldron's shape also needed repair. The final
candidate replaces the uneven upper cap, rather than stopping at material paint.
A mirrored left-crown point cloud supplies the form reference, fitted around the
right shoulder's attachment and closure. The resulting closed shell is smoothed
through a voxel volume and reduced to 16,000 triangles. Its metallic value 0.996
and roughness 0.278 match the measured left-crown medians; its steel base color
uses that crown's warm gray palette. The old right upper-cap faces are trimmed,
including its protruding rear patch. Lower overlapping plates remain visible.
The central rear-neck closure uses its original material, avoiding the former
steel spill onto the neck/hair closure. The new cap is watertight; this does not
claim that the entire assembled character is a watertight solid.

The final model has 891,194 triangles. The original body position, normal, UV and
color-texture arrays are exact; only shoulder face selection is changed there.
The new cap is a separate mesh. Twenty-seven protected nodes have exact original
attributes and materials, including the approved head, sword, hands, wrist joins,
base and accessories. Source/delivery triangle-corner attributes and texture bytes
are preserved through lossless geometry delivery. PNG-to-WebP conversion verifies
exact decoded pixels. Final delivery: 58,646,040 bytes, SHA-256
`83f37bc98b35ab578102017cb525295d3af5e5265c42a0bdb5d543f6291514e1`.

Public comparison is v5 before / v6 after. Chainmail, Right arm, Rear shoulder and
Face + arms buttons expose the relevant views. Local front/inside/outside/rear and
upper-body comparisons were inspected. Public phone after/before/default, desktop
side-by-side and interrupted-download recovery tests passed; named camera controls
were tested. This is still a review model; no runtime miniature catalog changed.

## Original-model diagnostic after v6 was rejected

User rejected the rebuilt cap and requested the old model to determine whether
the issue was geometric or material-related. A separate original-model viewer
compares the exact source High (`druk-high-shared-3b43a1a9b56c.glb`) against the
first `druk-body-pbr.glb` texture trial, before the wrist/wrap/pauldron repairs.
Neutral clay temporarily removes all texture, color and metallic differences in
the viewer; it does not modify either asset.

Verified exact triangle positions and shading normals on both the original body
(233,922 triangles including its tiny patch) and pinned rear-neck repair
(7,302 triangles). The square-looking contrast at the right shoulder is introduced
by the first body retexture leaving that separate repair on its original material.
The original overall contour already exists in both versions; matching neutral
clay removes the contrasting material block. Thus the conspicuous square patch
was chiefly a material continuity issue, not evidence that this retexture changed
the shoulder geometry. The v6 replacement cap is rejected and is not an approved
baseline. No new geometry/material fix was performed during this diagnostic.

Comparison URL:
https://dnd.nic024i.app/uploads/previews/druk-model-trials-20261018/druk-original-shoulder-review/

Public desktop side-by-side, phone original-only, correct source asset URLs,
Neutral clay and material restoration were tested without browser/HTTP errors.

## Material-only shoulder correction, original shape retained (v7)

User authorized fixing the retexturing while retaining the original shoulder
shape. The rejected v6 cap is not used. V7 starts from the accepted wrist/wrap/skin
review assembly, restores the original shoulder repair mesh, and restores the
first body-PBR metal texture on the right crown instead of the later uniform
manual paint. Metallic chainmail remains, with its existing color artwork.

The anatomical-right shoulder part of the original pinned repair (959 triangles)
receives a local 1024px PBR atlas. Albedo and metallic/roughness are sampled from
the adjacent retextured right-crown steel and smoothly interpolated over the
original repair. Only its material/UV treatment changes. Its positions and shading
normals remain original. The center-neck and left-side repair keep the original
material and vertex colors. No new cap, remeshing, normal reshaping, trimming or
extra shoulder geometry is present.

Validation proves all 29 original mesh nodes have exact triangle positions,
normals and transforms relative to the pre-rebuild v5 assembly. Total geometry is
880,377 triangles. Independently, the anatomical-right body shoulder (10,312
triangles) and complete pinned repair (7,302 triangles) match the original approved
High model's positions and normals exactly. Protected nodes, including head,
hands, wrist joins, sword, base and accessories, retain exact attributes/materials.
The 1,014,357 green skin texels retain exact color and metallic/roughness values.
The delivery stage preserves triangle-corner attributes and decoded texture pixels.

Final review GLB: 56,964,756 bytes; SHA-256
`411d8474f4ce50eef0abd0f7a4af502c31cd8012c0e4ff36f1a73763e03e1db6`.
The main public comparison now uses first body retexture before / v7 after, with
Right arm, Rear shoulder and Neutral clay controls. The separate original-model
comparison remains available. Public phone-sized after/before/default, desktop
side-by-side, interrupted-download recovery and camera controls were tested.
This is a review miniature; the runtime model catalog remains unchanged.

## Full original-metal coverage (v12 review)

User clarified that the shiny steel finish is desired across the old gray
pauldron shapes, including the tops, rear closure and lower plates. The actual
approved original, rather than the first body retexture, is the coverage reference.

V12 starts from v7. One shared polished gray-steel material covers 12,697 body
triangles and 1,140 rear-repair triangles. Original gray source colors, repair
vertex colors and asymmetric shoulder footprints define the region, excluding
the collar and hair. Metallic factor is 0.96; roughness is 0.29. One physical
finish avoids different baked highlights between the body and repair atlases.
No geometry, positions, normals, UVs or transforms are changed. Intermediate
normal-transfer and broader-region experiments were rejected.

Metallic chainmail from v7 retains its existing color and relief normal map.
Head, sword, hands, leather wraps, skin, base and accessories retain their previous
materials. All 29 mesh nodes retain exact triangle positions, normals and
transforms. The right body shoulder and full rear repair independently match
the approved High geometry. Delivery verifies triangle-corner attributes and
exact decoded texture pixels.

Review GLB: 56,459,008 bytes. SHA-256:
`ff1a7d4c4e91d77c22f02f4c1305985b375c905e64310b8cc7004268013d33ac`.

Original/current comparison:
https://dnd.nic024i.app/uploads/previews/druk-model-trials-20261018/druk-pauldron-chainmail-v12-review/?model=both&view=materials

Pauldron tops:
https://dnd.nic024i.app/uploads/previews/druk-model-trials-20261018/druk-pauldron-chainmail-v12-review/?model=both&view=tops

Chainmail close-up:
https://dnd.nic024i.app/uploads/previews/druk-model-trials-20261018/druk-pauldron-chainmail-v12-review/?model=after&view=chainmail

Desktop comparison, front/rear/top camera views, phone current-only, camera
buttons and clay/material restoration passed without browser errors. The runtime
miniature catalog is unchanged; this remains a review asset.

## Material-focused reset after rejected rim geometry (review only)

Returned to v12, before the added rims or plate deformation experiments. The
reference is a rigid domed steel plate, with broad reflections and a consistent
finish over the whole cap and lower plates. No replacement shell or raised lip
is added in this pass. This remains a material/shading review, not a claim that
the original sculpt has become as smooth as the generated design reference.

The shared steel material uses a cool neutral gray, metallic value about 0.97,
and roughness around 0.34 with subtle physical microfinish variation. Existing
steel normals are spatially filtered, with a tapered 60 percent correction to
reduce noisy reflections without changing any vertex position. The original
rough surface remains apparent in some close rear angles; no geometric rim
cleanup has been applied. Original source gray colors identify another 2,584
existing faces omitted near the inner fronts and edges of the old selection.
The new coverage is constrained by shoulder height, proximity, source color,
and the existing upper shoulder footprints, protecting the central collar.

Validation against v12 confirms 880,377 triangles, exact positions, topology,
UVs and node transforms. Non-steel attributes and all existing image bytes are
unchanged. Lossless delivery checks preserve triangle-corner attributes and
exact decoded texture pixels. Desktop front/rear/top views and a phone-sized
single-model page load without browser errors.

Review-only GLB: 56,585,392 bytes. SHA-256:
`b338b81834c93d32d11754e911b8abf7b490a91d41261e5107807cfcbc0a4475`.
The retained unused source data make this a verification asset, not a final
runtime size. The installed model catalog and campaign model are unchanged.

Current model:
https://dnd.nic024i.app/uploads/previews/druk-model-trials-20261018/druk-simple-steel-v24-review/?model=after&view=tops

Matched-camera comparison with v12:
https://dnd.nic024i.app/uploads/previews/druk-model-trials-20261018/druk-simple-steel-v24-review/?model=both&view=tops

Reproduction scripts and preservation/browser reports are archived under
`assets/miniatures/druk-component-trial-20261018/`. Export the v12 input with
`export-steel-v21.mjs`, then run `close-steel-seams-v24.py`,
`expand-steel-v24.mjs`, `refine-steel-v24.py`, `assemble-steel-v24.mjs`,
`verify-steel-v24.mjs`, compression, and lossless texture delivery in that order.

## Original-shape edge cleanup in Blender (current review)

The replacement pauldron shells were rejected by the user. Do not use the
`druk-blender-pauldrons-review` replacement geometry or its padding changes.
The requested scope is to retain the original sculpt and clean its inner line.

Current review starts from v24, before those replacement shells. Blender 5.1.2
BMesh Smooth Vertices smooths the existing inner boundary chain, including the
front endpoint, and a 0.009-wide transition band. It moves 624 unique steel
vertices, with displacement clamped to 0.0035 model units. Coincident vertices
in adjacent material primitives receive the same displacement to keep the join
connected. No plate, rim, face or lower-lame reconstruction is added. The
overall dome, outline and overlapping lower plate shapes are retained.

`verify-original-edge-cleanup.mjs` verifies the delivered GLB against v24:
880,377 triangles, original topology, all unaffected positions, all normals,
UVs and other triangle-corner attributes, all retained image bytes, and node
transforms remain exact. Only the recorded local edge displacements differ.
Desktop front/rear/top and phone single-model previews load without errors.
The installed game model and manifest remain unchanged.

GLB: 43,601,060 bytes. SHA-256:
`034f54ce7c5ca08fdcdc1727ec578f66e6540b742fa424c73eec185531afa39c`.
Editable edge-patch Blender file:
`tmp/druk-body-pbr-20261018/druk-original-edge-cleanup.blend`.

Original-shape comparison:
https://dnd.nic024i.app/uploads/previews/druk-model-trials-20261018/druk-original-pauldron-edge-review/?model=both&view=tops

Current model only:
https://dnd.nic024i.app/uploads/previews/druk-model-trials-20261018/druk-original-pauldron-edge-review/?model=after&view=tops

The `Inner edge close-up` button focuses the repair. This remains a review
copy; the replacement-shell trial must not be treated as the accepted result.

## Stronger original-boundary straightening (19 October, review only)

The user could not see a useful change from the earlier 0.0035-limited pass.
That pass is superseded for review. Experimental cut, solid-cap and quad-bridge
repairs introduced gaps, bands or an unwanted cut face, and were discarded.
Do not treat `blender-trim-original-margin.py` or
`blender-bridge-original-margin.py` as the current repair.

The current `blender-straighten-original-boundary.py` starts from original v24
geometry. It straightens the existing inner boundary in plan, while smoothing
its vertical arch in native Blender BMesh. A local falloff joins the movement
back into the existing sculpt. The broader original dome and lower lames are
retained. Coincident vertices in adjacent body/neck material primitives follow
the same displacement to keep joins connected. This is a stronger review trial,
not user acceptance of the final design.

487 boundary vertices were selected; 1,894 unique steel positions moved.
Maximum displacement is 0.054672 raw model units. The full model still has
880,377 triangles: no replacement plates and no added or removed faces.
Forward preservation verification confirms original topology, all unaffected
positions, normals, UVs, other corner attributes, image bytes and transforms.
It compares the delivered model against the source with only the recorded
local moves applied. An inverse projection is ambiguous when several source
boundary points share a cleaned location, so inverse lookup is not used.
Desktop matched-camera and phone single-model browser checks pass.

Current GLB: 43,601,088 bytes; SHA-256:
`37d929f6dad0954204b2363017cf2d56a87bb5afafa70b4b2c8ec4ed68dd4da7`.
Reproduce with `blender-straighten-original-boundary.py` then
`assemble-original-boundary-straightening.mjs` and
`verify-straightened-original-boundary.mjs`. Archived reports identify this
asset; earlier margin JSON reports from discarded approaches are superseded.
The game miniature files and manifest have not been replaced.

Interactive comparison:
https://dnd.nic024i.app/uploads/previews/druk-model-trials-20261018/druk-original-inner-edge-finish-review/?model=both&view=tops

Rear edge, matched camera:
https://dnd.nic024i.app/uploads/previews/druk-model-trials-20261018/druk-original-inner-edge-finish-review/inner-edge-comparison-37d929f6.png

Pauldrons isolated from hair and body:
https://dnd.nic024i.app/uploads/previews/druk-model-trials-20261018/druk-original-inner-edge-finish-review/pauldrons-only-37d929f6.png

## Return to before geometry; material blemish correction (v25)

The user rejected the stronger boundary straightening as worse than the before
model. All edge-repair experiments are rejected. The current textured review
returns exactly to v24's original pauldron positions, normals and topology.
Only three observed material islands on Druk's anatomical LEFT pauldron are
reassigned from body material to the existing unified steel material: the
110-triangle brown patch at the lower front, a one-triangle speck on the cap,
and a three-triangle speck on a lower plate. Their original gray-metal source
colors and adjacency were inspected. Total: 114 faces; no texture pixels,
vertices, normals or UVs edited.

`verify-pauldron-spots-v25.mjs` confirms exact triangle-corner attributes and
transforms against v24 after only the intended 114-face material reassignment.
All material properties and retained image bytes are unchanged. Four unused
images were pruned, not recompressed. All other material assignments are exact.
Full model remains 880,377 triangles, 43,602,684 bytes. SHA-256:
`8098241aefde422c627626710e2bdb4627978a1b473fe36b11c1bb7e3cafb0f2`.

Source: `druk-materials-v24-pbr-web-delivery.glb`.
Output: `druk-materials-v25-spots-only.glb`.
Reproduce with `fix-pauldron-spots-v25.mjs` and the archived 114-face list.
The optional selection export/regeneration scripts retain the source-color
check and observed island seeds. They are not a general whole-armor repaint.

The public comparison now uses the original in-game High model on the left,
not the last rejected edge repair. Corrected new textures are on the right.
This comparison includes the earlier body, wrap, skin and steel texturing work;
it is not a claim that the whole textured trial differs only by 114 materials.
The 114-face-only preservation statement is relative to v24.
Desktop front/rear/top/left-pauldron and phone single-model checks passed with
no browser errors. Source game assets and manifests remain unchanged.

https://dnd.nic024i.app/uploads/previews/druk-model-trials-20261018/druk-textures-final-review/?model=both&view=front

Geometry inspection: the pauldrons are material portions of the dense generated
body mesh, not separate clean plate shells. Two steel primitives in the body
contain 12,697 and 2,529 triangles; additional steel is in the old rear repair
mesh. A material boundary is not automatically a physical rim. This explains
why selection-based projections and cuts altered adjacent fragments or exposed
gaps. The ordinary pauldron form is not intrinsically difficult; a proper local
retopology could repair it, but those broad scripted attempts did not achieve
the requested restrained cleanup. Preserve the user's chosen original shape.

## Layer definition and correction of sleeve overspill (v26)

The user requested removing remaining brown from the pauldron layers and
making the overlaps read more like the original. An initial broad material
selection incorrectly extended steel onto the chainmail sleeve. The user
identified this and that broad selection is rejected. Do not use intermediate
v26 hashes e1398df7e855, 42aad4344796 or 358c291bf8cd.

Current v26 is rebuilt from v25, restoring the sleeve's previous material.
Only 692 additional triangles receive steel, bounded by the original metal's
lower silhouette: all three triangle vertices must be at/above a local lower
steel envelope, with 0.0003 raw-unit numerical tolerance. This replaces the
rejected broad shoulder/sleeve region. Source-colored body material on all
other faces remains untouched. Original pauldron positions/topology are retained.

Definition comes from restoring original lower-plate normals and transferring
neutral, grayscale recess shading from the original texture as steel vertex
color. This restores darker gaps under overlapping plates, while upper cap
shading is retained. No replacement rims, cut planes, added shells or geometry
repairs are present. The sleeve is not newly retextured in this pass; it returns
to v25's body/chainmail material.

`verify-pauldron-layers-v26.mjs` verifies delivered corner attributes against
v25 with only the intended armor appearance operations applied. Positions,
UVs, topology, transforms, retained image bytes and all non-armor materials /
attributes are exact. Desktop front/rear/top/pauldron and phone single-model
checks load without errors. Game files and manifests remain unchanged.

Current asset: `druk-materials-v26-defined-layers.glb`.
880,377 triangles, 43,661,920 bytes; SHA-256:
`544c0a1f6e25a6d88e2cdbccad032277caa9ff6c21136fc3ee59544a33f0c360`.
Run export-pauldron-layers-v26.mjs, prepare-pauldron-layers-v26.py,
assemble-pauldron-layers-v26.mjs and verify-pauldron-layers-v26.mjs in order.

Original in-game vs current textured review:
https://dnd.nic024i.app/uploads/previews/druk-model-trials-20261018/druk-layered-steel-review/?model=both&view=pauldron

Close comparison:
https://dnd.nic024i.app/uploads/previews/druk-model-trials-20261018/druk-layered-steel-review/layers-and-restored-sleeve-544c0a1f.png


## Darker steel, wraps, and right sleeve correction (v27)

Review-only, retaining the v26 pauldron sculpt. Right lower-plate normals receive
a restrained bilateral smoothing pass and slightly stronger neutral recess
shading. No positions, triangles, UV0 or node transforms change; the independent
canonical triangle verifier confirms all of these exactly against v26.
Steel base color is sRGB (0.52, 0.53, 0.54), metallic 1, with existing roughness
texture multiplied by 0.86. Wrap tint is linear (0.23, 0.21, 0.18), retaining the
existing leather grain and relief for a deep brown closer to the boots.

1,214 right sleeve faces previously using plate steel return to body material.
A remaining baked bright patch is corrected with the clean torso chainmail
artwork, on UV1 with a separate satin mail material (metallic 0.70, roughness
0.64). An initial 5,491-face selection extended beyond the hem onto skin and
was rejected by the user: do not use ae803fa5c2ee. The final conservative
selection contains 3,488 faces: every triangle vertex is above the cuff cutoff,
and seven original-albedo samples per triangle reject skin-colored faces.
Front, side and rear screenshots confirm exposed green arm below the cuff.
The face, sword and model shape remain as in the accepted v26 baseline.

Final asset: druk-materials-v27-dark-steel-wraps.glb
880,377 triangles; 43,804,668 bytes; SHA-256:
dc9034a50783889ada135125ebb3263a84ec92a5928530ec6218271f07a2053e
This is a full-resolution review asset, not a production size optimization.
Desktop and phone preview checks load without browser errors. Source game
models and manifests remain unchanged.

Rebuild in order: export-pauldron-refinement-v27.mjs,
refine-right-pauldron-v27.py, assemble-pauldron-refinement-v27.mjs,
export-right-sleeve-v27.mjs, prepare-right-sleeve-v27.py,
apply-right-sleeve-v27.mjs, verify-refined-materials-v27.mjs.

https://dnd.nic024i.app/uploads/previews/druk-model-trials-20261018/druk-dark-steel-wraps-review/?model=both&view=rightshoulder


## Shin-matched pauldrons and arm seam cleanup (v28)

Sampled 4,088 shin-plate triangles from the existing body color/MR atlas.
Median sRGB is (0.552941, 0.497941, 0.486411); median roughness 0.234875,
metalness 0.996078. Pauldron base factor now uses that color converted to
linear. Existing steel microfinish remains, with roughness scaled to the
shin reference. Neither shin textures nor armor geometry were changed.

White arm speckles were reproduced at distance and remained with normal
maps and reflections disabled; the diffuse-only diagnostic shows pale
lines from the color atlas. These are texture-island/seam contamination,
which becomes visible during texture minification, not model LOD swapping.
A dedicated exposed-skin material uses the existing valid green texels,
with nearest-green filling/padding across seams and outside islands so
mipmaps cannot blend in unrelated pale pixels. This corrects the same
artifact on both arms. 14,925 skin faces are selected by body position and
at least four of seven green color samples; sleeves, wraps, head, and
shared body texture bytes stay unchanged. Skin remains nonmetallic with
roughness 0.86. Valid skin colors retain their exact original texel values.
The additional padded skin atlas is 491,180 bytes.

Asset: druk-materials-v28-shin-matched.glb; 44,304,728 bytes;
880,377 triangles; SHA-256:
a8fc9200e6d23ee2ffe36318fbd0ab50db382505b90c46b47c328d75935c94af

Canonical verification against v27 confirms every vertex attribute,
oriented triangle, UV channel and node transform remains exact, despite
material partitioning. Desktop front/rear/top, side, close arm, full
figure and distant views were checked, plus the phone viewer. No browser
errors. Review-only; game assets/manifests remain unchanged.

Rebuild: inspect-materials-v28.mjs exports the v27 body and images;
sample-shins-skin-v28.py samples references and selects skin;
prepare-skin-gutters-v28.py creates the padded atlas;
assemble-shin-matched-v28.mjs writes the model;
verify-shin-matched-v28.mjs checks preservation.

https://dnd.nic024i.app/uploads/previews/druk-model-trials-20261018/druk-shin-matched-review/?model=after&view=fullarmor


## Single-scene map comparison

Added one shared WebGL scene containing two Druk models, both at identical
base scale, on the courtyard map. Default left is original in-game High;
right is corrected v28. A selector changes the left model to v27 to isolate
the latest color and arm-seam changes. Shared orthographic camera and shared
hemisphere/directional/environment lighting match the earlier review light
settings. Camera orbit, zoom, front/45/overhead/rear presets and synchronized
figure rotation are available. Narrow screens reduce model separation.
This is a dedicated review board, not a live campaign or deployment.
Desktop and phone browser checks pass without errors, with exactly one
canvas and both models loaded. Screenshots include 45-degree, front,
previous-pass and phone views. Source game assets remain unchanged.

https://dnd.nic024i.app/uploads/previews/druk-model-trials-20261018/druk-on-map-comparison/


## Lighter strap-brown wraps and left-hand alignment (v29)

The user requested lighter wraps so the grain is visible again, with the
chest strap as the brown reference, plus a slight left-hand rotation.
Sampled 671 front-torso strap triangles: median sRGB
(0.258824, 0.123777, 0.055037). The existing wrap artwork/normal/MR images
remain byte-exact; the material tint changes from linear (0.23,0.21,0.18)
to (1.0,0.636650,0.321439), matching the strap reference relative to the
wrap artwork's median. Texture grain is visibly clearer on the map.

Anatomical left hand (lower hand on the sword hilt) is rigidly rotated 8
degrees toward the forearm opening normal, around its wrist opening center
(-0.053146,0.196418,0.158365). Opening-plane mismatch reduces from
23.708 to 15.708 degrees. Its original hand geometry is unchanged.
The existing short wrist transition is bent with harmonic vertex weights:
forearm boundary fixed, hand boundary matches the same rigid rotation.
This preserves the seam (computed error below 1e-16 raw units) and UVs,
without rebuilding the joint or adding topology. Largest bridge vertex
movement is 0.005787 raw units. Head, sword, body and right hand are unchanged.

Canonical asset validation checks all unaffected vertex attributes,
indices, transforms, texture bytes and material properties. Only wrap
base tint, left hand node transform and left short wrist position/normal
attributes change. 880,377 triangles; 44,329,896 bytes; SHA-256:
c6e4f267253b2a48efd53d40b235535aace62b7076485a3378de4359171bf497
Desktop and phone viewer tests pass without errors; side-angle screenshots
are captured as well. Still review-only: no game model/manifest replaced.

Single-map comparison defaults to v28 before adjustment on the left and
v29 on the right, with a Hands preset and original-game comparison option.
https://dnd.nic024i.app/uploads/previews/druk-model-trials-20261018/druk-wrap-hand-map-review/?view=hands

Rebuild order: export-left-hand-v29.mjs, analyze-left-wrist-v29.py,
sample-chest-strap-v29.py, align-left-hand-v29.py,
assemble-wrap-hand-v29.mjs, verify-wrap-hand-v29.mjs,
build-wrap-hand-map-v29.mjs. Sampling also uses the v28 body atlas export.


## Runtime installation and compressed variants (19 October 2026)

The approved v29 is now Druk's stable ID in all runtime manifests. Existing
characters/tokens keep their scale, base calibration, facing and references.
All tiers are rebuilt from v29: High 880,377 triangles / 13.68 MB geometry;
Balanced 283,065 / 5.97 MB; Low 147,925 / 3.70 MB; Battlefield 59,021 /
1.48 MB. The 30.29 MB encoded texture set is shared once across tiers, rather
than embedded and downloaded again per geometry variant. The separate existing
basalt base image remains shared too. Full-detail texture pixels, triangle
corner attributes, transforms and materials are losslessly verified. Reduced
geometry is intentionally lossy under the existing approved tier policies.

Production typecheck/build and asset validators passed; all 2,299 unit tests
in 225 files passed on Node 22; eight functional browser smoke tests passed.
A separate disposable live server loaded the new Low and High Druk URLs in
both DM and claimed-player views without browser errors. No campaign save
was used. The older browser-suite/CI changes on Main remain preserved.

To reproduce from the shipped High model without a retained 44 MB review file:
export it with scripts/token-assets/export-character-model.mjs, then pass the
standalone lossless export to scripts/token-assets/install-reviewed-druk.mjs.
That installer accepts only the approved v29 hash or its verified lossless
export hash. It rebuilds all tiers and creates shared-texture receipts.
